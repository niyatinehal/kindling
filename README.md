# Family Wellness Platform

TypeScript + Express service backed by Postgres via Supabase and Prisma. The schema enforces
Domain A's invariants (soft-deleted users, unique-while-live emails, one active membership per
family member) at the database level, with `/healthz` and `/readyz` for liveness and readiness.
[![CI](https://github.com/niyatinehal/wellness-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/niyatinehal/wellness-platform/actions/workflows/ci.yml)

TypeScript + Express service skeleton. Sprint 0 deliberately contains **zero product logic** —
the only route is a health check. The point is that the environment, linting, tests, container
build, and CI are all in place before any feature depends on them.

## Prerequisites

- **Node.js 22+** and npm 10+
- **Docker** with Compose v2 — the Supabase CLI stack and the test database both run in it

## Repository layout

This is an npm workspaces monorepo:

```
wellness_platform/
  package.json            workspace root — shared infra scripts, Prettier, Supabase CLI
  api/                     the backend service (Express, Prisma, Jest)
    src/  test/  prisma/
  supabase/                local Supabase stack config, shared by every workspace
  docker-compose.yml       app container
  docker-compose.test.yml  disposable Postgres for integration tests
```

`workspaces` currently lists only `api` — a `web/` workspace (Next.js frontend) arrives in a later
slice; see `docs/specs/2026-08-14-frontend-foundations-design.md`.

Backend commands run from the repo root and delegate — `npm test`, `npm run lint`, `npm run
typecheck`, `npm run dev` — or directly with `-w api` (e.g. `npm run prisma:generate -w api`).
Prisma CLI commands that aren't wrapped in a root script (`prisma migrate deploy`, `prisma
validate`, ...) need `cd api` first, because the CLI resolves `prisma.config.ts` from the working
directory.

## Run it locally

The app always talks to a real Postgres, so the Supabase stack must be running before you start
the app. `api/.env` is required, not optional: the `dev` script runs `tsx` with `--env-file=.env`
from inside the `api` workspace, and without that file Node refuses to start
(`node: .env: not found`) before any app code runs.

```bash
git clone <repo-url>
cd wellness_platform
npm ci
npm run prisma:generate -w api           # generates the client into api/generated/prisma; npm ci doesn't do this
cp .env.example api/.env                 # required — dev fails immediately without it
npx supabase start                       # Postgres, Auth, Storage in Docker; first run pulls images
( cd api && npx prisma migrate deploy )  # apply the schema
# copy SERVICE_ROLE_KEY from `npx supabase status` into api/.env as SUPABASE_SERVICE_ROLE_KEY first
npm run db:seed                          # one demo family, two members (uses DIRECT_URL — see below)
npm run dev
```

`.env.example` stays at the repo root as the template — `cp` it into `api/`, which is where the
backend actually loads it from. It already sets `SUPABASE_URL=http://127.0.0.1:54321`, which
matches the local Supabase stack, so no edit is needed there for local dev. `SUPABASE_URL` is
required at boot — `npm run dev` refuses to start without it — and `SUPABASE_SERVICE_ROLE_KEY` is
required only for the seed step above, because `prisma db seed` creates real Supabase auth
accounts for the demo users and throws immediately if the key is unset.

Then, in another terminal:

```bash
curl localhost:3000/healthz   # liveness  — 200 even with the database down
curl localhost:3000/readyz    # readiness — 200 only when Postgres answers, 503 otherwise
```

Expected from `/readyz`:

```json
{ "status": "ready", "checks": { "database": "up" } }
```

To use a different port: `PORT=4000 npm run dev`, then curl `localhost:4000/healthz`.

Stop the stack with `npx supabase stop`. Inspect data with `npx prisma studio` or the Supabase
Studio URL that `supabase start` prints (`http://127.0.0.1:54323` by default).

## Authentication

The client authenticates **directly against Supabase** with `supabase-js`; this API only ever
verifies the resulting JWT. Signup, login, OTP, OAuth and token refresh have no endpoint here.

| Endpoint                     | Purpose                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register` | Called once after signup. Creates the domain user and records DPDP consent. Requires `health_data` consent. |
| `GET /api/v1/auth/me`        | The caller, their family, and their role.                                                                   |

A valid token whose user has not registered gets `403 REGISTRATION_REQUIRED` — the client should
call `/auth/register` and retry. Every failure uses one envelope:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "The token is not valid." } }
```

Tokens are ES256, verified against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `SUPABASE_URL`
is required at boot; `SUPABASE_SERVICE_ROLE_KEY` is required only to seed.

**Deleting a user:** the `users.auth_user_id` foreign key into `auth.users` is `ON DELETE
RESTRICT`. If a domain `users` row still references a Supabase auth account, deleting that account
from the Supabase dashboard (or the admin API) is rejected by the database with a foreign key
violation — this is deliberate, not a bug. Account deletion is an explicit application flow: soft
delete or anonymise the domain `users` row first, then remove the auth account.

## Run it in a container

`docker-compose.yml` runs **only** the `app` service — Task 2 retired the Postgres container that
used to ship alongside it. The Supabase stack must already be running on the host; the container
reaches it at `host.docker.internal:54322`. Start Supabase first:

```bash
npx supabase start
```

The compose file's `app` service adds `extra_hosts: ["host.docker.internal:host-gateway"]` so
`host.docker.internal` resolves inside the container on Linux too (Docker Desktop on
macOS/Windows already resolves it natively; the entry is a harmless no-op there).

**If you already created `.env` for local dev (above), you must override `DATABASE_URL`,
`DIRECT_URL`, and `SUPABASE_URL` on the command line when you run Compose.** Docker Compose
auto-loads `.env` from the project directory for variable substitution, and that file points all
three at `127.0.0.1` for the host — which is loopback _inside the container_, not the host's
Postgres or Supabase stack. Skipping the first two makes `/readyz` report
`{"status":"not_ready","checks":{"database":"down"}}`; skipping `SUPABASE_URL` boots the container
fine (env.ts only checks it's a well-formed URL) but breaks JWT verification once a request
actually reaches an authenticated route. Shell environment variables take precedence over `.env`,
so setting them inline fixes it:

```bash
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
DIRECT_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
SUPABASE_URL=http://host.docker.internal:54321 \
docker compose up -d --build

curl localhost:3000/healthz
curl localhost:3000/readyz
```

(If no `.env` file exists yet, the same three variables default to those same
`host.docker.internal` values inside `docker-compose.yml`, so the override above is optional —
but since these steps come after creating `.env`, pass it explicitly.)

Stop the container with `docker compose down`.

## Run the tests

```bash
npm test   # unit — 40 tests, no Docker required
```

Integration tests exercise the database invariants directly, so the test database needs its
schema before they run:

```bash
npm run test:db:up          # start the disposable test Postgres on 127.0.0.1:54329
( cd api && DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy )
npm run test:integration    # 23 tests, serialized via --runInBand (see the note in jest.config.js)
npm run test:db:down
```

The test database starts empty on every `test:db:up` (no volume), so the `migrate deploy` step is
required every time, not just the first.

## npm scripts

Run any of these from the repo root. Most are thin delegates that npm forwards into the `api`
workspace (`npm run X` runs `npm run X -w api`); a few are shared infra that only makes sense once,
at the root, because `web/` will need it too.

| Script                     | Scope                 | What it does                                                                                                    |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | root → api (delegate) | Watch mode via `tsx`, loads `api/.env` with `--env-file`                                                        |
| `npm run build`            | root → api (delegate) | Compiles `api/src/` to `api/dist/` (`tsconfig.build.json`)                                                      |
| `npm start`                | root → api (delegate) | Runs `node dist/src/server.js` from `api/` — **no** `--env-file`; see note below                                |
| `npm test`                 | root → api (delegate) | Jest unit project — 40 tests, no Docker required                                                                |
| `npm run test:integration` | root → api (delegate) | Jest integration project — 23 tests, serialized via `--runInBand` (see jest.config.js), needs the test database |
| `npm run test:all`         | root → api (delegate) | Both Jest projects in one run                                                                                   |
| `npm run typecheck`        | root → api (delegate) | `prisma generate`, then `tsc --noEmit` over `api/src/`, `api/test/` and `api/prisma/`                           |
| `npm run lint`             | root → api (delegate) | ESLint, type-aware; fails on warnings                                                                           |
| `npm run lint:fix`         | root → api (delegate) | ESLint with `--fix`                                                                                             |
| `npm run format`           | root only             | Prettier, writes changes, across both workspaces                                                                |
| `npm run format:check`     | root only             | Prettier, check only — fails instead of rewriting                                                               |
| `npm run db:start`         | root only             | `supabase start` — the local Postgres/Auth/Storage stack                                                        |
| `npm run db:stop`          | root only             | `supabase stop`                                                                                                 |
| `npm run db:status`        | root only             | `supabase status` — prints URLs and keys for the running stack                                                  |
| `npm run test:db:up`       | root only             | Starts the disposable test Postgres (`docker-compose.test.yml`), waits for health                               |
| `npm run test:db:down`     | root only             | Stops and removes the test Postgres                                                                             |
| `npm run prisma:generate`  | root → api (delegate) | `prisma generate` — regenerates the client into `api/generated/prisma`                                          |
| `npm run prisma:migrate`   | root → api (delegate) | `prisma migrate dev` — see the migration note below before using this                                           |
| `npm run prisma:studio`    | root → api (delegate) | `prisma studio` — browse the database at `DIRECT_URL`                                                           |
| `npm run db:seed`          | root → api (delegate) | `prisma db seed` — runs `prisma/seed.ts` against `DIRECT_URL`; requires `SUPABASE_SERVICE_ROLE_KEY`             |

Raw Prisma CLI invocations that aren't wrapped in any script above — `prisma migrate deploy`,
`prisma migrate diff`, `prisma validate` — have no root delegate. Run them with `cd api` first (or
`( cd api && ... )` to avoid changing your shell's directory), because the CLI resolves
`prisma.config.ts` relative to the working directory.

`npm start` deliberately has no `--env-file`: it is the production entrypoint, and production
environment variables come from the real process environment (container orchestrator, systemd,
etc.), not a checked-in file. Run `npm run build` first, then run `npm start` from an environment
that already has `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, and `PORT` set — `SUPABASE_URL` is
required at boot (see `api/src/config/env.ts`), and `npm start` crashes immediately without it.

> **Creating new migrations:** `npx prisma migrate dev --create-only` currently fails against the
> local Supabase database with `P4002`, because the schema has a foreign key into `auth.users`, a
> table Supabase owns that the migration engine's diffing can't see across schemas. Until that's
> resolved, hand-write new migration SQL under
> `api/prisma/migrations/<timestamp>_<name>/migration.sql` (follow the existing migrations for the
> pattern) and apply it with `( cd api && npx prisma migrate deploy )`, rather than running
> `prisma migrate dev`.

## Layout

This is `api/`'s internal layout — see [Repository layout](#repository-layout) above for how it
sits inside the workspace root. A `web/` workspace (frontend) arrives in a later slice; it does not
exist yet.

```
api/
  src/
    app.ts            Express app: middleware + routes + the error-handling middleware.
                       No .listen() — keeps it testable.
    server.ts         Entrypoint: reads PORT, calls .listen(), wires graceful shutdown.
    auth/
      verifyToken.ts   Verifies Supabase ES256 JWTs against the project JWKS.
      middleware.ts    Resolves a verified JWT to a domain user on every request.
    config/
      env.ts          Validates process.env with zod; fails fast at boot.
    db/
      prisma.ts        Builds the Prisma client with the driver adapter; readiness ping.
    http/
      errors.ts        The single API error envelope (`{ error: { code, message } }`).
    routes/
      health.ts        GET /healthz — liveness, no DB.
      ready.ts          GET /readyz  — readiness, pings the database.
      auth.ts           POST /auth/register, GET /auth/me.
    services/
      registerUser.ts  Creates the domain user and its consent records atomically.
  prisma/
    schema.prisma      Domain A models: User, Family, FamilyMembership, ConsentRecord.
    migrations/        Hand-authored SQL migrations (see the note above).
    seed.ts            Idempotent demo family + two members, run via `prisma db seed`.
  test/
    health.test.ts, ready.test.ts, errorHandler.test.ts, config/, db/, auth/   Unit tests — no Docker.
    integration/       Exercises the real database's constraints — needs the test DB.
  generated/prisma/    Prisma client output — regenerated, not committed.
```

`app.ts` and `server.ts` are split on purpose: tests import the app and never bind a port, which
avoids "address already in use" and keeps the suite fast.

## Configuration

All config comes from environment variables, validated at boot by `api/src/config/env.ts` — see
`.env.example` for the full list and comments. `PORT` defaults to `3000`; `DATABASE_URL`,
`DIRECT_URL`, and `SUPABASE_URL` are required.

Two connection strings exist because Supabase pools connections:

- `DATABASE_URL` — pooled. Used by the app at runtime via the Prisma driver adapter.
- `DIRECT_URL` — direct. Used by the Prisma CLI for migrations and seeding, which issue
  statements the pooler does not support.

Locally the Supabase CLI has no pooler, so both point at port 54322. In production they differ:
6543 (pooled) and 5432 (direct).

`SHADOW_DATABASE_URL` is optional and only needed to run the migration drift check
(`prisma migrate diff`) locally — see `.env.example` for how it's used and why it must point at an
always-empty database.

## CI

`.github/workflows/ci.yml` runs two jobs on every pull request to `main`:

- **verify** — `npm ci` → `prisma generate` → lint → format check → `tsc --noEmit` → unit tests.
- **integration** — brings up a disposable Postgres service, creates a shadow database, runs the
  migration drift check (`prisma migrate diff --exit-code`, failing the build if `schema.prisma`
  was edited without a matching migration), applies migrations, then runs the integration tests.

A lint error, formatting drift, type error, failing test, schema drift, or failing integration
test blocks the PR.
