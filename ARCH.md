# Architecture

## 1. Context & goals

A small ticket-management product where users collaborate on **projects**, each
containing **tickets** (work items / tasks). Access is governed by a user's
**role within a project**.

Design priorities for this take-home:

1. **Get the domain model right** — clear nouns and relationships.
2. **Run locally first** — the whole stack runs on a laptop before any cloud.
3. **Type safety across the stack** — one source of truth for shapes, validation
   and permissions, shared by server and client.
4. **Production-shaped** — auth, RBAC, validation, tests, containerization and
   CI/CD that mirror how this would really ship.

## 2. Components

```
                      ┌───────────────────────────────────────────┐
                      │                @ticketing/shared           │
                      │   types · Zod schemas · can(role, action)  │
                      └───────────────▲───────────────▲───────────┘
                      imports          │               │  imports
        ┌──────────────────────────┐  │               │  ┌──────────────────────────┐
        │  apps/web (React + Vite) │──┘               └──│  apps/api (Fastify)      │
        │  • Supabase Auth (JWT)   │                      │  • verifies JWT          │
        │  • TanStack Query        │   HTTPS + Bearer     │  • app-layer RBAC        │
        │  • UI gated by can()     │ ───────────────────▶ │  • Zod validation        │
        │  static → GCS bucket     │      /api/*          │  container → Cloud Run   │
        └──────────────────────────┘                      └────────────┬─────────────┘
                      ▲                                                  │ service-role key
                      │ sign in / refresh (JWT)                          ▼
                      │                                     ┌────────────────────────┐
                      └────────────────────────────────────│  Supabase              │
                                                            │  Postgres + GoTrue     │
                                                            │  schema via migrations │
                                                            └────────────────────────┘
```

The web app talks to Supabase **only for authentication**. All data flows
through the API, which owns authorization and database access.

## 3. Data model

```
profiles                      projects                       memberships
─────────                     ─────────                      ───────────
id  uuid PK ─┐                id  uuid PK ◀──┐               id          uuid PK
email        │ (= auth.users) name           │              project_id  ─▶ projects.id
full_name    │                description    │   ┌────────▶ user_id     ─▶ profiles.id
avatar_url   │                owner_id  ──────┼───┘          role  project_role
created_at   │                created_at      │              created_at
             │                updated_at      │              UNIQUE(project_id, user_id)
             │                                │
             │  tickets                       │
             │  ────────                      │
             │  id          uuid PK           │
             ├─ reporter_id ─▶ profiles.id    │
             └─ assignee_id ─▶ profiles.id    │
                project_id  ─────────────────▶┘
                title, description
                status   ticket_status   (todo | in_progress | in_review | done)
                priority ticket_priority (low | medium | high | urgent)
                created_at, updated_at
```

Key decisions:

- **`profiles` mirrors `auth.users`.** Supabase manages credentials in
  `auth.users`; a trigger (`handle_new_user`) creates a public `profiles` row on
  signup. `email` is denormalized onto `profiles` so members can be invited and
  displayed without touching the protected `auth` schema.
- **`memberships` is the join + the authority for access.** A user's capabilities
  come entirely from their `role` in a project. There is no global role — the same
  user can be an `owner` of one project and a `viewer` of another.
- **Enums in Postgres** (`project_role`, `ticket_status`, `ticket_priority`)
  mirror the union types in `@ticketing/shared`, keeping DB and app in lockstep.
- **Cascades**: deleting a project removes its memberships and tickets; deleting a
  user removes their memberships and nulls out ticket `assignee_id`.

## 4. Permissions <a id="permissions"></a>

A single function — `can(role, action)` in `packages/shared/src/permissions.ts` —
is the source of truth, used by the API to **enforce** and by the web to **gate UI**.

| Action                | owner | admin | member | viewer |
| --------------------- | :---: | :---: | :----: | :----: |
| project.view          |  ✅   |  ✅   |   ✅   |   ✅   |
| project.update        |  ✅   |  ✅   |   ❌   |   ❌   |
| project.delete        |  ✅   |  ❌   |   ❌   |   ❌   |
| member.view           |  ✅   |  ✅   |   ✅   |   ✅   |
| member.manage         |  ✅   |  ✅   |   ❌   |   ❌   |
| ticket.view           |  ✅   |  ✅   |   ✅   |   ✅   |
| ticket.create         |  ✅   |  ✅   |   ✅   |   ❌   |
| ticket.update         |  ✅   |  ✅   |   ✅   |   ❌   |
| ticket.delete         |  ✅   |  ✅   |   ❌   |   ❌   |

Special case: an `admin` can manage members but **never** an `owner`
(`canManageMemberWithRole`), and the owner cannot be removed or demoted in place.

## 5. Authentication & request lifecycle

1. The web app signs in via Supabase Auth and receives a **JWT** (access token),
   refreshed automatically by `supabase-js`.
2. Every API call sends `Authorization: Bearer <jwt>`.
3. The API's `authenticate` preHandler validates the token with
   `supabase.auth.getUser(token)` and attaches `req.user`.
   *(Resolving via the Auth server works for any token signing scheme; verifying
   the JWT locally with the project's secret is a documented optimization.)*
4. Route handlers call `requireMembership(projectId, userId, action)`, which loads
   the caller's membership and applies `can()`. Non-members get **404** (so project
   existence isn't leaked); members lacking the permission get **403**.
5. Database access uses the **service-role** Supabase client. It bypasses RLS by
   design — authorization is the API's responsibility.

Errors are normalized by a central handler into
`{ error: { code, message, details? } }` (`ApiError` in the shared package).

## 6. Type sharing

`@ticketing/shared` is the contract between tiers:

- **Types** (`Ticket`, `Project`, `Membership`, `Profile`, the enum unions) describe
  API payloads; the web's typed `api` client returns them directly.
- **Zod schemas** (`createTicketSchema`, …) validate requests in Fastify *and* back
  the React forms — one definition, no drift, runtime + compile-time safety.
- **`can()` / `canManageMemberWithRole()`** mean the UI and the server agree on
  permissions by construction.

## 7. Deployment topology

| Tier | Artifact | Target | Pipeline |
| ---- | -------- | ------ | -------- |
| Web  | static `dist/` | Cloud Storage bucket (website) | `deploy-web.yml` |
| API  | Docker image | Cloud Run (Artifact Registry) | `deploy-api.yml` |
| DB   | SQL migrations | Supabase (`db push`) | `deploy-db.yml` |

- CI (`ci.yml`) runs lint, typecheck, build, unit + integration tests (spinning up
  Supabase) on every push/PR.
- Deploys are **path-filtered** so only the changed tier ships.
- GCP auth uses **Workload Identity Federation** — GitHub's OIDC token is exchanged
  for short-lived GCP credentials; no long-lived JSON keys are stored.
- The API's service-role key is injected from **Secret Manager** at deploy time.
- `seed.sql` is **local-only**; `db push` applies migrations but never seeds prod.

## 8. Security notes

- The service-role key lives only on the server (Secret Manager / Cloud Run env),
  never in the client. The client holds only the publishable/anon key.
- RLS is **enabled but policy-less** on every table, which denies all direct
  client access through PostgREST; the API (service role) is the only data path.
- Inputs are validated with Zod before they reach the database; SQL is parameterized
  via the Supabase client.

## 9. Trade-offs & future work

- **RLS enforcement.** Today authorization is app-layer only. A hardening step is
  to add per-table RLS policies (membership-based) so Postgres enforces access even
  if the client talked to it directly — see `supabase/migrations` for where they'd live.
- **Transactional project creation.** Creating a project then its owner membership
  is two statements with compensating cleanup; a Postgres function (RPC) would make
  it atomic.
- **Comments, notifications, real-time** were scoped out of v1.
- **Org/team layer** above projects is intentionally omitted (projects are top-level).
- **Frontend tests / e2e** (Playwright) and image size trimming are natural next steps.
- **JWT local verification** to avoid an Auth round-trip per request.
