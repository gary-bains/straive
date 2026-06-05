# Ticketing — a small, full-stack ticket management app

A project-based ticket tracker built as a TypeScript monorepo with end-to-end
type sharing.

- **API** — [Fastify](https://fastify.dev) + [Supabase](https://supabase.com)
  (Postgres + Auth), deployed to **Cloud Run**.
- **Web** — [React](https://react.dev) + [Vite](https://vite.dev) SPA, deployed
  to a **Cloud Storage** bucket.
- **Shared** — one package of TypeScript types, Zod validation schemas and the
  RBAC permission rules, imported by **both** the API and the web app.
- **DB** — Supabase, with migrations + seed managed by the Supabase CLI.

> Domain model: `profiles → projects → memberships (per-project role) → tickets`.
> See **[ARCH.md](./ARCH.md)** for the architecture, ERD and design rationale,
> and **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for cloud setup.

```
┌─────────────┐   HTTPS/JWT   ┌──────────────┐   service role   ┌────────────┐
│  React SPA  │ ────────────▶ │  Fastify API │ ───────────────▶ │  Supabase  │
│ (GCS bucket)│               │  (Cloud Run) │                  │ (Postgres) │
└─────────────┘               └──────────────┘                  └────────────┘
        │                                                              ▲
        └────────────────── auth (sign in, JWT) ───────────────────────┘
```

## Repository layout

```
.
├── apps/
│   ├── api/          # Fastify REST API (→ Cloud Run, Dockerfile)
│   └── web/          # Vite + React SPA (→ GCS bucket)
├── packages/
│   └── shared/       # @ticketing/shared — types, Zod schemas, permissions
├── supabase/
│   ├── migrations/   # SQL schema (source of truth for the DB)
│   └── seed.sql      # local-only demo data
├── .github/workflows # CI + deploy-api / deploy-web / deploy-db
├── ARCH.md           # architecture & design decisions
└── docs/DEPLOYMENT.md# one-time cloud setup + secrets
```

## Prerequisites

- **Node.js 20+** (22 recommended) and npm 10+
- **Docker** (for the local Supabase stack)
- **Supabase CLI** — bundled as a dev dependency, run via `npm run db:*`

## Quickstart (local)

```bash
# 1. Install
npm install

# 2. Start the local database (Postgres + Auth + Studio) in Docker.
#    Applies migrations and seeds demo data automatically.
npm run db:start          # first run pulls images; Studio at http://127.0.0.1:54323

# 3. Configure env (local defaults already point at the local stack)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run API + web together
npm run dev               # API → http://localhost:8080, web → http://localhost:5173
```

Open http://localhost:5173 and sign in with a seeded account:

| Email               | Password      | Role in the demo project |
| ------------------- | ------------- | ------------------------ |
| `alice@example.com` | `password123` | owner                    |
| `bob@example.com`   | `password123` | admin                    |
| `carol@example.com` | `password123` | member                   |
| `dave@example.com`  | `password123` | viewer                   |

> Sign up creates a brand-new user (with no projects yet) via Supabase Auth.

### Useful scripts

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `npm run dev`        | Run API + web with the shared package watched           |
| `npm run build`      | Build shared → api → web                                 |
| `npm run typecheck`  | Type-check every workspace                               |
| `npm run lint`       | ESLint across the repo                                   |
| `npm test`           | Shared unit tests + API integration tests               |
| `npm run db:start`   | Start the local Supabase stack                          |
| `npm run db:reset`   | Recreate the DB, re-apply migrations + seed             |
| `npm run db:status`  | Print local URLs and keys                               |
| `npm run db:stop`    | Stop the local Supabase stack                           |

## Testing

```bash
npm run db:start   # integration tests need the local stack running
npm test
```

- **`packages/shared`** — unit tests for the permission matrix.
- **`apps/api`** — integration tests that exercise the routes via
  `app.inject()` against the real local Supabase (auth, RBAC, CRUD, validation).

## API at a glance

`Authorization: Bearer <supabase-jwt>` is required on all `/api/*` routes.
Interactive docs (OpenAPI/Swagger UI) run at **`/docs`** when the API is up.

| Method   | Path                                       | Permission        |
| -------- | ------------------------------------------ | ----------------- |
| GET      | `/health`, `/ready`                        | public            |
| GET      | `/api/me`                                  | authenticated     |
| GET/POST | `/api/projects`                            | authenticated     |
| GET/PATCH/DELETE | `/api/projects/:id`                | view / update / delete |
| GET/POST | `/api/projects/:id/members`                | view / manage     |
| PATCH/DELETE | `/api/projects/:id/members/:userId`    | manage            |
| GET/POST | `/api/projects/:id/tickets`                | view / create     |
| GET/PATCH/DELETE | `/api/tickets/:ticketId`           | view / update / delete |

See the permission matrix in [ARCH.md](./ARCH.md#permissions).

## Deployment

CI/CD lives in `.github/workflows`. Pushing to `main` triggers path-filtered
deploys (API → Cloud Run, web → GCS, migrations → Supabase) via Workload
Identity Federation. The one-time GCP/Supabase setup and the full list of
required GitHub secrets/variables are in **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**.

## Troubleshooting

- **`EADDRINUSE` on 8080** — another process owns the port. Set `PORT` in
  `apps/api/.env` (and `VITE_API_URL` in `apps/web/.env` to match).
- **`supabase start` fails** — ensure Docker is running.
- **API 401s locally** — the web app needs a Supabase session; sign in first.
