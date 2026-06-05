# Ticket Management App — Implementation Plan

## Context

Take-home assignment (post–final-round). Build a small but production-shaped
**ticket management** app and document it well. Confirmed decisions:

- **Stack**: monorepo (npm workspaces, TypeScript end-to-end)
  - `apps/api` — **Fastify** REST API → **Cloud Run** (Docker)
  - `apps/web` — **Vite + React** SPA → **GCS bucket** (static website)
  - `packages/shared` — shared **types + Zod schemas + permission logic**
  - DB — **Supabase** (Postgres + Auth)
- **Cloud**: Google Cloud. CI/CD via GitHub Actions + Workload Identity Federation.
- **Priority #1**: get the **schema / domain model** right.
- **Priority #2**: run the whole thing **locally first**, deploy later.

### Domain model (confirmed)
`profiles` → `projects` (owner) → `memberships` (per-project role) → `tickets`
(reporter + assignee). "Ticket" == "task". Comments deferred. Auth = real
Supabase Auth (JWT); **permissions enforced in the Fastify app layer** based on
the caller's membership role (not RLS — documented as future hardening).

---

## Schema (Supabase / Postgres) — the heart of the design

Migration: `supabase/migrations/0001_init.sql`. Enum types + tables:

```
enum project_role     : owner | admin | member | viewer
enum ticket_status    : todo | in_progress | in_review | done
enum ticket_priority  : low | medium | high | urgent

profiles
  id          uuid PK  (== auth.users.id)
  full_name   text
  avatar_url  text
  created_at  timestamptz default now()

projects
  id          uuid PK default gen_random_uuid()
  name        text not null
  description text
  owner_id    uuid not null  -> profiles(id)
  created_at, updated_at timestamptz

memberships
  id          uuid PK
  project_id  uuid not null -> projects(id) on delete cascade
  user_id     uuid not null -> profiles(id) on delete cascade
  role        project_role not null default 'member'
  created_at  timestamptz
  UNIQUE (project_id, user_id)

tickets
  id          uuid PK
  project_id  uuid not null -> projects(id) on delete cascade
  title       text not null
  description text
  status      ticket_status   not null default 'todo'
  priority    ticket_priority not null default 'medium'
  reporter_id uuid not null -> profiles(id)
  assignee_id uuid          -> profiles(id)   (nullable)
  created_at, updated_at timestamptz
  indexes on (project_id), (assignee_id), (status)
```

Plus:
- **Trigger** `handle_new_user()` on `auth.users` insert → creates a `profiles` row.
- **`updated_at` trigger** on projects/tickets.
- **`supabase/seed.sql`** — a few users (via auth admin), one project, sample
  tickets + memberships so the app is non-empty on `supabase db reset`.
- RLS left permissive for v1 (API uses the service-role key + app-layer authz);
  ARCH.md documents enabling RLS as the production hardening step.

### Permission matrix (app layer, shared)
`packages/shared/src/permissions.ts` exports `ProjectRole`, `Action`, and
`can(role, action): boolean`. Used by **both** API (enforcement) and web (UI gating).

| action \ role        | owner | admin | member | viewer |
|----------------------|:-----:|:-----:|:------:|:------:|
| project.view         | ✅ | ✅ | ✅ | ✅ |
| project.update       | ✅ | ✅ | ❌ | ❌ |
| project.delete       | ✅ | ❌ | ❌ | ❌ |
| member.manage        | ✅ | ✅ | ❌ | ❌ |
| ticket.view          | ✅ | ✅ | ✅ | ✅ |
| ticket.create/update | ✅ | ✅ | ✅ | ❌ |
| ticket.delete        | ✅ | ✅ | ❌ | ❌ |

(admin cannot modify/remove an owner; enforced as a special case.)

---

## Shared package `@ticketing/shared`
Buildable (tsc → `dist` with `.d.ts`); both apps depend on it via workspace.
Exports:
- TS types/enums mirroring the schema (`Project`, `Ticket`, `Membership`, `Profile`, status/priority/role unions).
- **Zod schemas** for create/update payloads (`createTicketSchema`, etc.) — single source of truth for validation, reused by Fastify routes and React forms.
- `permissions.ts` (`can`, role/action types).

---

## API `apps/api` (Fastify + TypeScript)
- `src/app.ts` builds the Fastify instance; `src/server.ts` listens (PORT from env).
- Plugins: `@fastify/cors`; a `supabase` decorator (service-role client via `@supabase/supabase-js`); an **auth preHandler** that verifies the `Authorization: Bearer <jwt>` using `SUPABASE_JWT_SECRET` (`jose`, HS256) → sets `req.user = { id }`.
- A `requireMembership(projectId, action)` helper: loads the caller's membership, calls shared `can()`, throws 403 otherwise.
- Validation via `fastify-type-provider-zod` using shared schemas. `@fastify/swagger` + swagger-ui for `/docs` (bonus, low cost).
- Routes:
  - `GET /health`, `GET /ready`
  - `GET /api/me`
  - Projects: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` (POST also creates an `owner` membership for the creator)
  - Members: `GET/POST /api/projects/:id/members`, `PATCH/DELETE /api/projects/:id/members/:userId`
  - Tickets: `GET/POST /api/projects/:id/tickets` (filters: status, assignee), `GET/PATCH/DELETE /api/tickets/:ticketId`
- Centralized error handler → consistent JSON `{ error: { code, message } }`.
- **Tests (Vitest)**: `permissions.test.ts` (matrix), `tickets.routes.test.ts` + `projects.routes.test.ts` (integration via `app.inject()` against the local Supabase stack, using minted test JWTs).
- **Dockerfile**: multi-stage (build shared+api → slim runtime), non-root, listens on `$PORT` for Cloud Run.

## Web `apps/web` (Vite + React + TS)
- React Router, TanStack Query, Supabase JS client (auth only; data via the API with the JWT attached).
- `src/api/client.ts` — fetch wrapper injecting the Supabase access token; typed with `@ticketing/shared`.
- Screens (Core flow): `/login` (sign in/up), `/projects` (list + create), `/projects/:id` (board: tickets in columns by status, create/edit ticket modal with assignee, members panel: list + invite by email + role change). Auth guard; UI affordances gated with shared `can()`.
- `.env`: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

---

## Local-first workflow (built & verified before any deploy)
1. Scaffold monorepo + `packages/shared` (build it).
2. `supabase init`; write `0001_init.sql` + `seed.sql`; `supabase start` (Docker); `supabase db reset` to apply+seed; verify in Studio.
3. Build API; run against local Supabase (`.env` from `supabase status`); exercise routes; tests green.
4. Build web; `npm run dev`; full manual flow: sign up → create project → add member → create/assign/move tickets.
5. Typecheck + lint + tests across the workspace.
6. Build & run the API Docker image locally to confirm Cloud Run readiness.

Root scripts: `dev` (web+api concurrently), `build`, `test`, `typecheck`, `lint`, `db:start/reset`.

---

## CI/CD (GitHub Actions, `.github/workflows/`)
- `ci.yml` — install, typecheck, lint, build all; run shared + permission unit tests; spin up `supabase` (setup-cli) for API integration tests. Runs on PRs/pushes.
- `deploy-api.yml` — paths `apps/api`/`packages/shared`: WIF auth → build & push image to Artifact Registry → deploy Cloud Run (env/secrets wired).
- `deploy-web.yml` — paths `apps/web`/`packages/shared`: build with prod Vite envs → `gsutil rsync` `dist/` → GCS bucket → set cache headers (SPA fallback).
- `deploy-db.yml` — paths `supabase/migrations`: `supabase db push` via access token + project ref + db password.

All cloud deploys use **Workload Identity Federation** (no long-lived JSON keys).

---

## Docs
- **README.md** — what it is, architecture at a glance, prerequisites, local quickstart, scripts, project layout, testing, troubleshooting.
- **ARCH.md** — context/goals, C4-ish component diagram (ASCII), **ERD + schema rationale**, permission matrix, auth/JWT flow, request lifecycle, type-sharing strategy, deployment topology (FE→bucket, BE→Cloud Run, DB→Supabase), security notes (RLS as next step), trade-offs & future work.
- **docs/DEPLOYMENT.md** — one-time GCP setup (project, Artifact Registry, Cloud Run, GCS website bucket, WIF pool/provider + service account roles), Supabase cloud project + access token + DB password, full **GitHub secrets/vars list**, and first-deploy steps you run yourself.
- Also write this plan to **`./plan.md`** in the repo as the first implementation step (you asked for it there).

---

## Verification
- **Schema**: `supabase db reset` applies cleanly; tables/enums/trigger visible in Studio; seed populates.
- **API**: `npm run test -w apps/api` green; manual `curl`/Swagger UI for CRUD + 401/403 paths; Docker image runs and serves `/health`.
- **Web**: manual end-to-end happy path locally against local API + Supabase.
- **Whole repo**: `npm run typecheck && npm run lint && npm run build && npm test` all pass.
- **CI/CD**: workflows validated for syntax/logic; actual cloud deploy is run by you with your GCP/Supabase credentials following `docs/DEPLOYMENT.md` (I can't hold cloud creds or run `gcloud` here).

## Out of scope (v1)
Comments, notifications/email invites (invite = add existing user by email), real-time, RLS enforcement, org/team layer, frontend e2e tests. All noted as future work in ARCH.md.
