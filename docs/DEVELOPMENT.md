# Developing the Family Wellness Platform

[![CI](https://github.com/niyatinehal/kindling/actions/workflows/ci.yml/badge.svg)](https://github.com/niyatinehal/kindling/actions/workflows/ci.yml)

TypeScript + Express service backed by Postgres via Supabase and Prisma. Identity is provided by
Supabase Auth and verified here; the schema enforces Domain A's invariants (soft-deleted users,
unique-while-live emails, one active membership per family member) at the database level, with
`/healthz` and `/readyz` for liveness and readiness.

## Prerequisites

- **Node.js 22+** and npm 10+
- **Docker** with Compose v2 — the Supabase CLI stack and the test database both run in it

## Repository layout

This is an npm workspaces monorepo:

```
wellness_platform/
  package.json            workspace root — shared infra scripts, Prettier, Supabase CLI
  scripts/dev.sh           the one-command dev script (`npm run dev`)
  api/                     the backend service (Express, Prisma, Jest)
    src/  test/  prisma/
  web/                     the frontend (Next.js)
  supabase/                local Supabase stack config, shared by every workspace
  docker-compose.yml       app container
  docker-compose.test.yml  disposable Postgres for integration tests
```

`workspaces` lists both `api` and `web`.

Backend commands run from the repo root and delegate — `npm test`, `npm run lint`, `npm run
typecheck`, `npm run dev:api` — or directly with `-w api` (e.g. `npm run prisma:generate -w api`).
Prisma CLI commands that aren't wrapped in a root script (`prisma migrate deploy`, `prisma
validate`, ...) need `cd api` first, because the CLI resolves `prisma.config.ts` from the working
directory.

## Run it locally

```bash
git clone <repo-url>
cd wellness_platform
npm ci
npm run dev
```

That is the whole thing. `scripts/dev.sh` checks Docker, starts Supabase if it
is not up, waits for Postgres to answer, creates `api/.env` and
`web/.env.local` if they are missing, fills in the Supabase keys from
`supabase status`, generates the Prisma client, applies migrations, and then
runs the API on **3000** and the web app on **3001** together. Every step is a
no-op when already satisfied, so it is also the command to use every day.

- **Web app:** http://localhost:3001
- **API:** http://localhost:3000 (`/healthz`, `/readyz`)
- **Supabase Studio:** http://127.0.0.1:54323

Ctrl-C stops both apps and leaves Supabase running. `npm run stop` stops
Supabase too. To run one side alone: `npm run dev:api` or `npm run dev:web`.

Seeding stays manual — `npm run db:seed` creates real Supabase auth accounts
and is not safe to re-run blindly.

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

**Guest sign-in** requires `enable_anonymous_sign_ins = true` — set in
`supabase/config.toml` for local development, and on the Auth settings page of
the dashboard for a hosted project. It is per-environment: an environment
without it answers `POST /api/auth/guest` with a 502 `GUEST_SIGNIN_FAILED`
rather than failing at boot.

The Supabase CLI only reads `config.toml` when a stack starts, so a `config.toml`
edit on an already-running stack (one started before pulling this change, for
example) has no effect until it is restarted: `npm run stop && npm run dev`. Trying
the guest button again against the still-running stack will not work — it needs the
restart.

A hosted Supabase project also needs the anonymous sign-in **rate limit**
configured, not just the flag. Locally, `supabase/config.toml` caps this at
`anonymous_users = 30` per hour per IP; a hosted project has no such cap unless
one is set on the Auth rate limits settings page.

An anonymous user is a real `auth.users` row, so a guest is a normal user
everywhere downstream — same JWT verification, same `users` row, same consent
record. Claiming the account later (`updateUser`/`linkIdentity`) is the designed-for
upgrade path — not yet a route or screen in this repo — and it keeps the same
`auth.users.id`, so nothing logged as a guest would be lost.

Anonymous accounts accumulate and are not yet cleaned up. Because
`users.auth_user_id` is `ON DELETE RESTRICT`, removing one means soft-deleting
or anonymising the domain `users` row **first**, then deleting the auth account.

### Sign-in emails

**`[auth.email.smtp]` is enabled, so the SMTP variables are required, not
optional.** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_EMAIL` and
`SMTP_SENDER_NAME` must be set in the root `.env` — the Supabase CLI reads that
file itself, so they need no exporting. Both `.env` and `config.toml` are read
only at stack start, so editing either needs `npx supabase stop && npx supabase
start`.

**With them missing, sign-in fails in a way that names nothing.** The CLI passes
the literal string `env(SMTP_HOST)` through to GoTrue, and every send dies with a
bare `500 unexpected_failure`. On a fresh clone or a new machine, that is the
first thing to check. The port is a literal `587` rather than an env var because
the CLI rejects `env()` on an integer field; 587 is what every mainstream relay
accepts.

**Set `enabled = false` to go back to capturing mail locally.** Auth's SMTP host
then points at the Mailpit container (`GOTRUE_SMTP_HOST=supabase_inbucket_<project>`,
port 1025), which accepts every message and forwards none — a sign-in request
answers `{"sent": true}` and the mail waits at **http://127.0.0.1:54324**. Worth
doing for any work that is not specifically about delivery, because with a real
relay wired up every test sign-in emails a real person and spends a real quota.

`api/test/config/authEmailTemplate.test.ts` does not pin whether SMTP is on —
that is a local choice — only that the credentials come from the environment
however it is set. A key pasted inline to make mail work quickly is the failure
this guards.

**Choosing a provider depends on whether you own a domain.** Without one, Brevo
verifies a single sender address (a personal Gmail works) and will then deliver
to anyone, ~300/day free. With one, Resend or Postmark give better
deliverability — but note Resend's free tier delivers only to your own account
address until a domain is verified, which makes it useless for testing with
family. Either way, add the provider's SPF and DKIM records: a six-digit code
from an unauthenticated brand-new sender goes to spam, which looks exactly like
mail that was never sent.

**The sign-in screen wants a typed code, so the email template is overridden.**
`signInWithOtp` sends the `magic_link` mail type, whose built-in GoTrue template
renders `{{ .ConfirmationURL }}` and nothing else — a link, no code, and so
nothing that can be entered into the code field on `/signin`.
`supabase/templates/magic_link.html` adds `{{ .Token }}` (6 digits, per
`otp_length`) and keeps the link as a fallback. `api/test/config/authEmailTemplate.test.ts`
pins that the template still renders the code; it cannot check that a running
stack loaded it, because `config.toml` is read only at stack start — a template
or config edit needs `npm run stop && npm run dev`.

The code is accepted even though `auth.one_time_tokens` stores its hash with a
`pkce_` prefix (the `@supabase/ssr` client defaults to the PKCE flow). No
`flowType` override is needed, and adding one is not the fix for a rejected
code.

**`email_sent` caps sign-in emails per hour, and only once real SMTP is on.**
The CLI ships `2`, which a single household exhausts over one breakfast; this
repo sets `30`. Past the cap Auth refuses the request and `POST /api/auth/otp`
reports a generic `502 OTP_REQUEST_FAILED` — identical to the response for a
genuinely broken mailer. When sign-in stops working after a few test runs, check
`[auth.rate_limit]` before debugging anything else; restarting the stack clears
the counter.

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

## Deploy it

Three services, and the order matters: each one needs a value the previous one
produces.

Everything below is the free tier, which has two consequences worth knowing
before anyone in the family is told the URL. Render's free instance sleeps after
15 minutes idle and takes roughly 50 seconds to wake, and a free Supabase project
pauses after 7 days with no queries. Both are fixed by the same thing — a keep-warm
ping, step 5.

### 1. Supabase Cloud — database, auth, email

Create a project in **ap-south-1 (Mumbai)**: every request makes at least one
database round trip, and this is health data belonging to people in India.

From Project Settings collect four things — the project ref, the anon key, the
database password, and the pooled and direct connection strings. Then configure
auth, which does NOT come from this repo:

- **Authentication → URL Configuration**: set Site URL to the Vercel URL from
  step 4, and add `<vercel-url>/auth/callback` to Redirect URLs. Left at the
  default, every sign-in link points at `localhost` and nothing works away from
  your machine. The callback entry is the load-bearing one: the app names that
  destination itself (`web/app/api/auth/otp/route.ts`), and GoTrue drops a
  `redirect_to` it has not been told to allow.
- **Authentication → Sessions**: set an inactivity timeout of 1 week, to match
  `[auth.sessions]` in `supabase/config.toml`. Left at the default a session
  never expires at all, because the middleware refreshes it on every request.
  Use the inactivity setting rather than the time-box: a time-box signs the
  whole family out every seventh day regardless of use, and each of those
  sign-ins spends an email from the daily quota.
- **Authentication → Emails → SMTP**: the same Brevo values as the local `.env`.
  `supabase/config.toml` is read by the CLI only — a hosted project never sees it.
- **Authentication → Emails → Templates → Magic Link**: paste the contents of
  `supabase/templates/magic_link.html`. This is the easiest step to skip and the
  failure is subtle: the built-in template renders a link and no code, so the
  code field on `/signin` becomes impossible to fill in. That is the exact bug
  this template exists to fix locally.

### 2. Migrations

Run from your machine, against the new database. `DIRECT_URL` (port 5432, not the
pooler) is what the schema engine needs:

```bash
cd api && DIRECT_URL='<session-mode pooler string>?sslmode=no-verify' npx prisma migrate deploy
```

**Use the pooler, not the direct host.** `db.<ref>.supabase.co` resolves to an
AAAA record only — new free-tier projects have no IPv4 for direct connections —
so anything without IPv6 cannot reach it at all. Session mode
(`...pooler.supabase.com:5432`) is IPv4 and supports the statements a migration
issues; transaction mode (`:6543`) does not.

**Never run `npm run db:seed` against production.** It provisions
`admin@demo.test` and `adult@demo.test` as real auth accounts — known addresses
with working sign-in links. `render.yaml` deliberately omits
`SUPABASE_SERVICE_ROLE_KEY` so a stray attempt fails rather than succeeds.

### 3. Render — the API

`render.yaml` is a blueprint: point Render at this repo and it reads the service's
region, health check and variable list from there. Set the three `sync: false`
values in the dashboard:

| Variable       | Value                                                   |
| -------------- | ------------------------------------------------------- |
| `DATABASE_URL` | Supabase **pooled** string (port 6543)                  |
| `DIRECT_URL`   | Supabase **direct** string (port 5432)                  |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` — no trailing slash |

`PORT` is injected by Render and must not be set.

Take the resulting URL from the service page — it is what step 4 needs. **Do not
assume it is `https://wellness-api.onrender.com`.** `onrender.com` subdomains are
global, so when the service name is already taken Render appends a suffix and
deploys at something like `https://wellness-api-u1uo.onrender.com` instead. That
is the URL this project actually got, and pointing anything at the unsuffixed
host reaches nothing at all — DNS does not resolve, so the failure looks like a
hang rather than a 404.

### 4. Vercel — the web app

Import the repo and set **Root Directory** to `web`. This is an npm workspace, so
Vercel installs from the repo root; that setting is what tells it which workspace
to build. Then three variables:

| Variable                        | Value                               |
| ------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key — public by design     |
| `API_BASE_URL`                  | the Render URL from step 3          |

`API_BASE_URL` has no `NEXT_PUBLIC_` prefix on purpose. Only this app's route
handlers call the API, always server-side, so the browser never learns where it
lives. The service-role key is never set here.

Take the resulting URL back to step 1 and set it as the Supabase Site URL.

### 5. Keep it awake

Render spins a free instance down after 15 minutes without inbound traffic, and
the next request pays the wake-up: 15.4s measured on this service against 0.2-0.6s
warm, and worse under load. Point a free external scheduler
at **`<your-render-url>/readyz`** on a 14-minute schedule — one minute of margin
under the spin-down window. For this project that is
`https://wellness-api-u1uo.onrender.com/readyz`.

**`/readyz`, not `/healthz`.** They are not interchangeable here. `/healthz` is a
liveness probe and deliberately touches nothing (`api/src/routes/health.ts`), so
pinging it wakes the container and leaves the first real visitor paying to open
the database connection. `/readyz` runs a real query, which warms the Prisma pool
_and_ counts as Supabase activity — the thing that stops a free Supabase project
auto-pausing after 7 idle days. Only `/readyz` solves both free-tier problems.

`scripts/keep-warm.sh` is that ping, and `npm run keep-warm` runs it locally to
confirm a URL works before you wire up a scheduler:

```bash
npm run keep-warm https://wellness-api-u1uo.onrender.com
```

It exits non-zero with a distinct code per failure — `2` unreachable, `3` up but
the database is down, `4` an unexpected status — so a scheduler's failure
notification says which thing broke. It also warns when a ping takes over 5
seconds, which means it arrived _after_ a spin-down and the schedule is not
actually holding the instance open.

#### Configuring the scheduler

The scheduler cannot live in this repo, so it is the one deploy step with no
artifact under version control. On [cron-job.org](https://cron-job.org) (free,
1-minute granularity):

| Setting          | Value                                             |
| ---------------- | ------------------------------------------------- |
| URL              | `https://wellness-api-u1uo.onrender.com/readyz`   |
| Schedule         | every 14 minutes — cron expression `*/14 * * * *` |
| Request timeout  | 60s or higher                                     |
| Treat as success | HTTP 200 only                                     |
| Notify on        | failure                                           |

Set the timeout above 50 seconds. A short one fails precisely on the ping that
found the service asleep and had real work to do — the alert fires exactly when
the mechanism is working.

`*/14` fires at :00, :14, :28, :42 and :56, so the widest gap is 14 minutes and
the wrap-around to the next hour is 4. Every gap stays under the 15-minute
window. UptimeRobot works too, at a 5-minute floor on its free plan.

#### What this does and does not fix

Do not use a GitHub Actions schedule for this. Actions bills a minimum of one
minute per run, so a 14-minute ping is ~3,100 runs and ~3,100 billed minutes a
month against a private repo's 2,000-minute allowance — it would starve CI. An
external scheduler costs nothing. Render's own Cron Jobs are a paid service type
($1/month minimum), and once you are paying, a Starter web service removes
spin-down outright for $7.

Staying awake uses roughly 730 of Render's 750 free instance-hours per month, so
one always-on free service fits and **a second one would not** — adding another
free service blows the workspace cap mid-month and suspends both.

This fixes cold starts only. It does nothing about the free instance's 0.1 CPU
and 512 MB, and free instances do not autoscale, so a genuine traffic spike still
saturates a warm instance. A launch worth spiking for wants Starter.

### What is not automated

There is no deploy job in CI. Render and Vercel both build on push to `main`, and
migrations are run by hand, deliberately: `prisma migrate deploy` against a
database holding real health data is not something to trigger by merging.

## Run the tests

```bash
npm test   # unit — 42 tests, no Docker required
```

Integration tests exercise the database invariants directly, so the test database needs its
schema before they run:

```bash
npm run test:db:up          # start the disposable test Postgres on 127.0.0.1:54329
( cd api && DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy )
npm run test:integration    # 24 tests, serialized via --runInBand (see the note in jest.config.js)
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
| `npm run dev`              | root only             | `scripts/dev.sh` — the one-command dev script; brings up Supabase, the API and the web app together             |
| `npm run dev:api`          | root → api (delegate) | Watch mode via `tsx`, loads `api/.env` with `--env-file` — what `npm run dev` used to mean                      |
| `npm run stop`             | root only             | `supabase stop`                                                                                                 |
| `npm run build`            | root → api (delegate) | Compiles `api/src/` to `api/dist/` (`tsconfig.build.json`)                                                      |
| `npm start`                | root → api (delegate) | Runs `node dist/src/server.js` from `api/` — **no** `--env-file`; see note below                                |
| `npm test`                 | root → api (delegate) | Jest unit project — 42 tests, no Docker required                                                                |
| `npm run test:integration` | root → api (delegate) | Jest integration project — 24 tests, serialized via `--runInBand` (see jest.config.js), needs the test database |
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
> resolved, write new migration SQL to
> `api/prisma/migrations/<timestamp>_<name>/migration.sql` yourself and apply it with
> `( cd api && npx prisma migrate deploy )`, rather than running `prisma migrate dev`.
>
> The SQL does not have to be written by hand. `migrate diff` takes the same route CI's drift check
> takes — replaying the existing migrations onto an empty shadow database, which the `pg_catalog`
> guard in `20260813185303_auth_fk_pg_catalog_guard` makes survivable without an `auth` schema — so
> it can generate the file for you. Point it at the **test** Postgres, never the Supabase one:
>
> ```bash
> cd api
> export DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test
> export SHADOW_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/shadow
> mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_my_change"
> npx prisma migrate diff --from-migrations prisma/migrations \
>   --to-schema prisma/schema.prisma --script > prisma/migrations/<that dir>/migration.sql
> ```
>
> Then `migrate deploy` against both databases — the Supabase one for local dev, and the test one so
> the integration suite sees the new tables.

## Layout

This is `api/`'s internal layout — see [Repository layout](#repository-layout) above for how it
sits inside the workspace root.

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
