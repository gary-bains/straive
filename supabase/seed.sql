-- ============================================================================
-- Seed data for LOCAL development (applied by `supabase db reset`).
-- Creates four auth users (one per role), a sample project, memberships and
-- tickets so the app is non-empty on first run.
--
-- All seeded users share the password:  password123
--   alice@example.com  -> owner
--   bob@example.com    -> admin
--   carol@example.com  -> member
--   dave@example.com   -> viewer
--
-- NOTE: This writes directly into auth.* and is intended for local use only.
-- ============================================================================

-- Auth users (confirmed email/password). The on_auth_user_created trigger
-- creates the matching public.profiles rows automatically.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alice@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alice Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'bob@example.com',   crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bob Admin"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'carol@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Carol Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'dave@example.com',  crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Dave Viewer"}',  now(), now());

-- GoTrue scans these token columns into Go strings and rejects NULLs, so
-- manually-seeded users must have them set to empty strings.
update auth.users set
  confirmation_token = '',
  recovery_token = '',
  email_change = '',
  email_change_token_new = '',
  email_change_token_current = '',
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = ''
where email like '%@example.com';

-- Email identities so the seeded users can sign in via GoTrue.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{"sub":"11111111-1111-1111-1111-111111111111","email":"alice@example.com","email_verified":true}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com","email_verified":true}',   'email', now(), now(), now()),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '{"sub":"33333333-3333-3333-3333-333333333333","email":"carol@example.com","email_verified":true}', 'email', now(), now(), now()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '{"sub":"44444444-4444-4444-4444-444444444444","email":"dave@example.com","email_verified":true}',  'email', now(), now(), now());

-- Sample project owned by Alice.
insert into public.projects (id, name, description, owner_id)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Website Redesign',
  'Revamp the marketing site and migrate the blog.',
  '11111111-1111-1111-1111-111111111111'
);

-- Memberships: one per role.
insert into public.memberships (project_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'viewer');

-- Sample tickets across statuses and priorities.
insert into public.tickets (project_id, title, description, status, priority, reporter_id, assignee_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Design new landing page', 'Hero, features, pricing sections.',    'in_progress', 'high',   '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Set up CI pipeline',      'Lint, test and build on every PR.',     'todo',        'medium', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Migrate blog content',    'Move 40 posts from the old CMS.',       'todo',        'low',    '11111111-1111-1111-1111-111111111111', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fix mobile nav overlap',  'Menu overlaps logo under 360px.',       'in_review',   'urgent', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Add analytics',           'Wire up privacy-friendly analytics.',   'done',        'medium', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
