-- ============================================================================
-- Ticket management — initial schema
-- profiles -> projects (owner) -> memberships (per-project role) -> tickets
-- Permissions are enforced in the API layer (service-role client); RLS is left
-- permissive for v1 and documented as the production hardening step in ARCH.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type project_role as enum ('owner', 'admin', 'member', 'viewer');
create type ticket_status as enum ('todo', 'in_progress', 'in_review', 'done');
create type ticket_priority as enum ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- Shared trigger function: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — mirrors auth.users (1:1). Populated by a trigger on signup.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Look up members by email when inviting (case-insensitive).
create unique index profiles_email_lower_idx on public.profiles (lower(email));

comment on table public.profiles is 'Public profile for each auth user (1:1 with auth.users).';

-- Create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  owner_id    uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships — links a user to a project with a role (per-project RBAC)
-- ---------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        project_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (project_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_project_id_idx on public.memberships (project_id);

-- ---------------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------------
create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text,
  status      ticket_status not null default 'todo',
  priority    ticket_priority not null default 'medium',
  reporter_id uuid not null references public.profiles (id),
  assignee_id uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tickets_project_id_idx on public.tickets (project_id);
create index tickets_assignee_id_idx on public.tickets (assignee_id);
create index tickets_status_idx on public.tickets (status);

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Enabled with NO permissive policies: this denies all access via the public
-- (anon/authenticated) API. The backend uses the service-role key, which
-- bypasses RLS, and performs authorization itself. See ARCH.md for the planned
-- per-table policies that would let the client talk to Postgres directly.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.memberships enable row level security;
alter table public.tickets enable row level security;
