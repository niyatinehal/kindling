# Supabase Database Setup: Design

**Status:** Approved for implementation planning
**Author:** Niyati (Product) + Claude (drafting support)
**Date:** 2026-08-13
**Companion to:** `2026-08-07-family-wellness-platform-database-architecture.md`, `2026-08-07-family-wellness-platform-engineering-roadmap.md` (Epic 1, Sprint 1)
**Scope:** How Supabase is adopted, how Prisma and Supabase divide ownership of the schema, and what Sprint 1 builds. Covers Domain A only (`User`, `Family`, `FamilyMembership`). No auth logic, no RLS policies, no other domains.

---

## 1. Context

Sprint 0 delivered a containerized TypeScript/Express skeleton with an unused Postgres service in `docker-compose.yml`. The engineering roadmap's Sprint 1 calls for connecting a real, migration-managed Postgres via Prisma.

This document records a deliberate divergence from that roadmap: **Postgres is hosted by Supabase, and Supabase Auth will own production identity.** The roadmap and the database architecture doc predate this decision and mention Supabase nowhere.

Two constraints drove it:

1. **Learning is the primary goal.** The roadmap exists to teach backend engineering across 20 sprints, with a published artifact per sprint. Anything that removes substantive backend work is a cost, not a saving.
2. **The result must be published for real users.** Real families, real health data, India's DPDP Act. This makes the identity layer a liability rather than an exercise.

The resolution: buy the part where a mistake is unrecoverable (identity), build everything where the learning lives (domain logic, RBAC enforcement, the safety filter, queues, tests).

---

## 2. Decisions

| #   | Decision                                                                                            | Rationale                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Supabase provides Postgres, Storage, and Auth.** Express/Prisma/Redis/BullMQ own everything else. | Auth is weeks of high-risk security work with a mature managed alternative. Storage and pgvector are strict upgrades over MinIO. Domain logic, RBAC, the AI pipeline, and the visibility model stay in the app tier, where the learning is. |
| D2  | **Epic 2's auth is still built — as a learning exercise on a branch, never shipped.**               | Preserves the full learning value (hashing, OTP, OAuth, refresh-token rotation, session revocation) without real families depending on a first auth implementation to protect their children's medical conditions.                          |
| D3  | **Supabase CLI local stack for dev; plain Postgres for tests; Supabase cloud for production.**      | Dev matches prod on components. Tests in this scope touch only Postgres, so a plain container keeps CI at seconds instead of the ~1–2 minutes `supabase start` costs. Auth-dependent tests in Epic 2 get the full local stack.              |
| D4  | **Prisma owns tables and relations; hand-written SQL owns what Prisma's DSL cannot express.**       | Keeps `prisma migrate dev` and Sprint 1's stated ORM learning objective intact, while the constructs the data model actually depends on (partial indexes, triggers, cross-schema FK) are expressed in real DDL.                             |
| D5  | **`User.id` stays app-owned UUIDv7; a separate nullable `auth_user_id` references `auth.users`.**   | See §4.                                                                                                                                                                                                                                     |
| D6  | **Sprint 1 creates Domain A only** (`User`, `Family`, `FamilyMembership`).                          | Matches the roadmap's incremental structure. The remaining ~33 entities are modelled when a feature reads them.                                                                                                                             |

### Rejected alternatives

- **Full Supabase BaaS** (client → `supabase-js` → RLS). Rejected because the `VisibilitySetting` model — per-member, per-data-category, with `is_locked_by_safety_floor` requiring Admin co-approval — is an approval workflow, not a row predicate. Expressing it as RLS means policies invoking functions that read `visibility_settings` and `family_memberships` on every row of every dashboard query, which fights the `AdherenceSummary` denormalization that exists to make exactly that path cheap. It would also remove most of the roadmap's substance.
- **Supabase as managed Postgres only, auth built and shipped.** Rejected on the publishing constraint alone (D1/D2).
- **`User.id = auth.users.id`**, the conventional Supabase pattern. Rejected — see §4.
- **Supabase CLI owning migrations** (`supabase db push`, Prisma demoted to `db pull` introspection). Rejected because it removes `prisma migrate dev`, which Sprint 1 names as its primary learning objective.

---

## 3. Topology

```
DEV                                     TEST                        PROD
npm run dev (host process)              Jest                        Express container
  │                                       │                           │
  └─ Prisma ──► Supabase CLI stack        └─ Prisma ──► plain          └─ Prisma ──► Supabase cloud
                Postgres  :54322                        Postgres                     Postgres via Supavisor
                Auth, Storage                           (compose)                    Auth, Storage
                Studio    :54323                                                     region ap-south-1
```

**Changes to Sprint 0's `docker-compose.yml`:** the `db` service is retired — the Supabase CLI now provides dev Postgres. The `app` service remains for container smoke testing. A new `docker-compose.test.yml` provides the plain Postgres used by integration tests, and inherits the `POSTGRES_*` variables that previously lived in the main compose file.

**Production is not provisioned in this scope.** All of Sprint 1 runs against the local stack. Creating the cloud project — account, billing, region — happens in the deployment sprint.

**Cost note:** Supabase's free tier pauses projects after roughly a week of inactivity and limits active projects. An app with real users needs the paid tier, plus a separate project or local stack for development so migrations are never first applied to the database users are on.

---

## 4. Data model — Domain A

Standard fields (`id`, `created_at`, `updated_at`, `deleted_at`) follow the database architecture doc §0.

### The `auth.users` seam

`auth.users.id` is a **uuid v4** managed by Supabase. The database architecture doc §0 mandates **UUIDv7** for every core table's primary key, calling it "the single most consequential early decision."

The conventional Supabase pattern — `public.users.id` = `auth.users.id` — is **rejected**:

1. It silently drops the time-sortable property of UUIDv7 for the one table that 30+ others will reference by foreign key.
2. It makes every foreign key in the schema point into a vendor-owned table, so leaving Supabase Auth later becomes a schema-wide migration rather than a one-column change.
3. Which provider authenticated a person is a fact about the identity layer, not the identity of the domain entity.

Instead:

| Field           | Type                                   | Constraints                                                                                                                                                                               |
| --------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid (v7, client-generated)            | primary key                                                                                                                                                                               |
| `auth_user_id`  | uuid                                   | unique, **nullable**, FK → `auth.users(id)` `ON DELETE SET NULL` — **superseded 2026-08-14: now `NOT NULL` with `ON DELETE RESTRICT`**, see `2026-08-14-auth-family-consent-design.md` §3 |
| `email`         | string                                 | unique **where `deleted_at IS NULL`**                                                                                                                                                     |
| `phone`         | string                                 | unique **where `deleted_at IS NULL`**                                                                                                                                                     |
| `display_name`  | string                                 | not null                                                                                                                                                                                  |
| `locale`        | enum(`en`, `hi`)                       | default `en`                                                                                                                                                                              |
| `status`        | enum(`active`, `suspended`, `deleted`) | default `active`                                                                                                                                                                          |
| `last_login_at` | timestamp                              | nullable                                                                                                                                                                                  |

Cost of the indirection: one indexed lookup per authenticated request (`WHERE auth_user_id = <jwt.sub>`), trivially cacheable.

`auth_user_id` is nullable in this scope because no signup flow exists yet — Sprint 1's rows come from the seed script. **Epic 2 tightens it to `NOT NULL`** once every user originates from Supabase Auth.

`password_hash` and `auth_provider` are **removed** from `User` — Supabase owns both. `email` and `phone` remain, populated by the seed now; Epic 2 adds a trigger keeping them in sync with `auth.users`.

The `auth` schema is **not** modelled in Prisma. The foreign key is added by hand-written SQL, so Prisma sees a plain uuid column and the `multiSchema` preview feature is not needed.

### `Family` and `FamilyMembership`

Per the database architecture doc, unchanged: `Family(name, created_by_user_id)`; `FamilyMembership(family_id, user_id, role, status, joined_at)` with unique `(family_id, user_id)` and a **partial unique index on `user_id` where `status = 'active'`** enforcing one active family per user.

---

## 5. Migrations

Prisma generates table DDL. Four migrations are hand-written, because Prisma's schema DSL cannot express them:

| Hand-written SQL                                                                                | Why                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREATE UNIQUE INDEX ... ON family_memberships(user_id) WHERE status = 'active'`                | No partial-index support in the DSL. This is the invariant enforcing one-family-per-user.                                                                                                                                                                                          |
| `set_updated_at()` function + `BEFORE UPDATE` triggers                                          | Prisma's `@updatedAt` is client-side only; any raw SQL write bypasses it.                                                                                                                                                                                                          |
| `ALTER TABLE users ADD FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL` | Cross-schema FK, with `auth` deliberately outside the Prisma schema. **Superseded 2026-08-14: `ON DELETE RESTRICT`.** `SET NULL` was correct while the column was nullable; once Phase A made it `NOT NULL`, `SET NULL` could never succeed and silently blocked account deletion. |
| `CREATE UNIQUE INDEX ... ON users(email) WHERE deleted_at IS NULL` (and `phone`)                | See §11 — plain unique + soft delete permanently burns an email address.                                                                                                                                                                                                           |

**UUIDv7 is generated client-side** via Prisma's `uuid(7)` rather than as a database default, avoiding a dependency on a `pg_uuidv7` extension being present in Supabase's Postgres build. Consequence: raw SQL inserts must supply their own ids.

### Prisma 7 mechanics (verified against 7.9.1, 2026-08-13)

Prisma 7 changed enough that the conventional Supabase-with-Prisma setup no longer applies. Verified empirically in a throwaway project, not assumed:

| Prisma 6 pattern                                              | Prisma 7 reality                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `datasource { url = env("DATABASE_URL") }` in `schema.prisma` | The `datasource` block holds only `provider`. The URL lives in `prisma.config.ts` under `datasource.url`, and is used **by the CLI only**. |
| `directUrl` for the pooled/direct split                       | **`directUrl` no longer exists.** The `Datasource` config type exposes only `url` and `shadowDatabaseUrl`.                                 |
| `new PrismaClient()` reads the URL from the schema            | Type error: "Expected 1 arguments, but got 0". Prisma 7 connects through a **driver adapter**; the URL is passed at construction.          |
| `generator client { provider = "prisma-client-js" }`          | `provider = "prisma-client"` with a required `output`. Emits **TypeScript source**, not a compiled client.                                 |
| Seed configured in `package.json` `prisma.seed`               | Configured in `prisma.config.ts` as `migrations.seed` — a command string.                                                                  |

Two consequences worth stating plainly:

**1. The pooled/direct split falls out naturally, and is cleaner than `directUrl` was.** The CLI reads `prisma.config.ts`, so migrations get the direct connection; the runtime adapter is constructed with the pooled URL:

```ts
// prisma.config.ts — CLI only (migrate, db pull, seed)
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env["DIRECT_URL"] }, // :5432 direct
});
```

```ts
// src/db/prisma.ts — runtime
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL }); // :6543 pooled
export const prisma = new PrismaClient({ adapter });
```

**2. The generator must be configured for `nodenext`, or the build breaks.** By default the generated client imports siblings with `.ts` extensions (`from "./enums.ts"`), which plain `tsc` under `module: "nodenext"` rejects without `allowImportingTsExtensions`. Setting `importFileExtension = "js"` fixes it — verified to type-check cleanly against this repo's exact compiler options:

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../generated/prisma"
  moduleFormat           = "esm"
  generatedFileExtension = "ts"
  importFileExtension    = "js"
  runtime                = "nodejs"
}
```

New dependencies this implies: `@prisma/adapter-pg`, `pg`, and `@prisma/client` (runtime — the generated client imports `@prisma/client/runtime/client`), `prisma`, `dotenv` (dev). Locally `DATABASE_URL` and `DIRECT_URL` both point at `:54322`; the CLI stack has no pooler.

`npx prisma init` also scaffolds `.agents/`, `.claude/skills/`, `.windsurf/`, and `skills-lock.json` into the project. Run it with **`--no-skills`** — the repo already has a `.claude/` directory and these are unrelated to the build.

---

## 6. Configuration

`src/config/env.ts`, validated with Zod, parsed **once at boot** so a missing variable fails immediately rather than at first query: `DATABASE_URL`, `DIRECT_URL`, `PORT` (default 3000), `NODE_ENV`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the service-role key are **not** added yet — nothing in this scope calls Supabase's API. They arrive with Auth in Epic 2. The service-role key, when it exists, never reaches a client and is never logged.

`.env.example` gains both connection URLs pointed at the local stack. Real `.env` stays gitignored.

---

## 7. Code structure

```
prisma/schema.prisma            User, Family, FamilyMembership
prisma/migrations/              generated DDL + 4 hand-written SQL migrations
prisma.config.ts                CLI config: schema path, migrations path,
                                seed command, DIRECT_URL for migrations
prisma/seed.ts                  one demo family, two members; wired via
                                prisma.config.ts `migrations.seed` so it
                                runs as `npx prisma db seed`
generated/prisma/**             generated TypeScript client — gitignored,
                                and excluded from ESLint and Prettier
src/config/env.ts               Zod-validated, parsed at boot
src/db/prisma.ts                PrismaClient singleton + disconnect
src/routes/health.ts            unchanged — liveness, no dependencies
src/routes/ready.ts             GET /readyz
src/app.ts                      mounts both routers
src/server.ts                   + SIGTERM: server.close() then prisma.$disconnect()
test/ready.test.ts              stubbed client, both branches
test/integration/family.test.ts real Postgres
docker-compose.test.yml         plain Postgres for tests
supabase/config.toml            from `supabase init`
```

Graceful shutdown becomes necessary once a connection pool exists, which also closes a gap left open in Sprint 0 (`server.ts` had no `SIGTERM` handling).

---

## 8. Liveness vs readiness

`/healthz` is unchanged: process-alive, zero dependencies, always 200. `/readyz` runs `SELECT 1` with a ~2s timeout:

```
200  {"status":"ready",     "checks":{"database":"up"}}
503  {"status":"not_ready", "checks":{"database":"down"}}
```

They stay separate because a `/healthz` that checked the database would let a brief DB blip cause an orchestrator to kill a healthy process, instead of merely routing traffic away from it. The response body names the failing check but never includes the driver error or the connection string; that detail goes to the log.

---

## 9. Testing

| Level       | What                                                                                                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `/readyz` with a stubbed db client — asserts both the 200 and the 503 branch.                                                                                                                                                                                     |
| Integration | Real Postgres from `docker-compose.test.yml`, `prisma migrate deploy`, run the seed, assert the demo family exists with two members.                                                                                                                              |
|             | **The test Postgres image must be pinned to the same major version Supabase runs.** A different major can accept or reject DDL differently — partial indexes and trigger syntax in particular — which would make CI green while production rejects the migration. |
| Constraint  | Attempt a second `active` membership for the same user; assert the database rejects it.                                                                                                                                                                           |

The constraint test is not redundant. Generated DDL is low-value to test; **hand-written DDL is not**, and a partial unique index that silently failed to apply would let the one-family-per-user invariant rot until it corrupted family dashboards.

Jest gains `unit` and `integration` projects so `npm test` stays fast and Docker-free; `npm run test:integration` requires a container.

---

## 10. CI

Three additions to `.github/workflows/ci.yml`:

1. `prisma generate` before typecheck — the client's types don't exist otherwise.
2. An integration job with a Postgres service container running `prisma migrate deploy` then the integration tests.
3. A **migration drift check** — `prisma migrate diff --exit-code` fails the build when `schema.prisma` was edited without a matching migration. This is the class of mistake that is invisible locally and breaks the next `migrate deploy`.

---

## 11. Amendments to the database architecture doc

This design changes three things in `2026-08-07-family-wellness-platform-database-architecture.md`. They are recorded here rather than silently applied, because that document is the shared source of truth for later sprints.

1. **`User` loses `password_hash` and `auth_provider`** — Supabase Auth owns credentials (D1).
2. **`User` gains `auth_user_id`** — nullable uuid, unique, FK to `auth.users` (D5, §4).
3. **`unique(email)` and `unique(phone)` become partial unique indexes** scoped to `WHERE deleted_at IS NULL`. §6 of that doc specifies plain unique indexes while §5 places `User` under soft delete; combined, those permanently burn an email address when an account is deleted, blocking re-registration. This is a correctness fix, not a preference.

---

## 12. Out of scope

| Deferred                                                     | Lands in                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| Auth flows, JWT middleware, session handling                 | Epic 2                                                      |
| `auth_user_id` becoming `NOT NULL`; email/phone sync trigger | Epic 2                                                      |
| `ConsentRecord` (DPDP audit trail)                           | Epic 2, with auth                                           |
| RLS policies                                                 | Only if a use case demands them; the app tier enforces RBAC |
| Supabase Storage wiring                                      | The media/vision sprint                                     |
| Redis, BullMQ, `AIGenerationJob`                             | The AI pipeline sprints                                     |
| Domains B–I (~33 entities)                                   | When a feature reads them                                   |
| Supabase cloud project, production deploy                    | The deployment sprint                                       |

---

## 13. Risks and open questions

| Risk                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand-written SQL in a Prisma migration is easy to lose during a `migrate reset` or a squash.                                                                                                              | The constraint test (§9) fails loudly if any of it goes missing.                                                                                                                                                                                                                                                                                                                                                                                          |
| `prisma migrate dev` against a Supabase-hosted database can attempt operations the role lacks rights for, on the `auth` schema in particular.                                                             | The FK migration touches only `public.users`; it references `auth.users` without altering it. Verify on the cloud project during the deployment sprint.                                                                                                                                                                                                                                                                                                   |
| Pooled vs direct connection misconfiguration produces errors that do not name the real cause.                                                                                                             | Both URLs in `.env.example` with inline comments; `/readyz` exercises the pooled path at boot.                                                                                                                                                                                                                                                                                                                                                            |
| Client-side UUIDv7 means raw SQL inserts can create rows with a different id strategy.                                                                                                                    | Seeds and migrations go through Prisma; any raw insert must supply an explicit v7 id.                                                                                                                                                                                                                                                                                                                                                                     |
| Prisma's exact UUIDv7 and partial-index support varies by version.                                                                                                                                        | **Resolved 2026-08-13:** `@default(uuid(7))` validates on Prisma 7.9.1. Partial indexes remain DSL-unsupported, hence §5.                                                                                                                                                                                                                                                                                                                                 |
| The generated client is TypeScript source inside the repo, so it can be swept into typecheck, lint, and format.                                                                                           | Generated files carry `@ts-nocheck` and `eslint-disable`, but `generated/` is added to `.gitignore`, `.prettierignore`, and ESLint `ignores` so CI never lints or formats it. `prisma generate` runs before typecheck.                                                                                                                                                                                                                                    |
| `pg` becomes a new **runtime** dependency reaching the production image.                                                                                                                                  | The adapter requires it, so it is correctly a dependency rather than a devDependency. `npm prune --omit=dev` does **not** exclude the Prisma CLI: `@prisma/client` declares `prisma` as an _optional_ peer dependency, and npm installs optional peers by default, so the CLI survives the prune. This is exactly why the Dockerfile runs `rm -rf node_modules/prisma` after pruning — the prune alone is not enough. Verify image size after the change. |
| The email/phone partial unique indexes (`users_email_live_key`, `users_phone_live_key`) are case- and whitespace-sensitive — `"a@b.com"`, `"A@B.com"`, and `"a@b.com "` are three distinct index entries. | No live rows exist yet, so it is harmless today. Normalization (lowercasing, trimming, or a generated/expression index) must be settled before Epic 2's signup flow lands and real users can collide on visually identical addresses.                                                                                                                                                                                                                     |

---

## 14. Definition of done

- `supabase start` brings up the local stack; `npm run dev` connects to it.
- ~~`npx prisma migrate dev` runs cleanly from an empty database, including all four hand-written migrations.~~
  **No longer attainable on the Supabase stack, discovered during implementation:** once the
  cross-schema `users.auth_user_id → auth.users.id` foreign key exists, `prisma migrate dev`
  (and `migrate dev --create-only`) fails with `P4002` — the migration engine's diffing cannot
  see across schemas into `auth`, which Supabase owns. The workaround, documented in the
  README's "Creating new migrations" note: hand-write new migration SQL under
  `prisma/migrations/<timestamp>_<name>/migration.sql` and apply it with
  `npx prisma migrate deploy` instead of `migrate dev`.
- `npx prisma db seed` produces one demo family with two members, idempotently.
- `GET /readyz` returns 200 when the database is reachable and 503 when it is not.
- `GET /healthz` still returns 200 with the database stopped.
- Unit, integration, and constraint tests pass; CI runs all of them plus the drift check.
- A fresh clone, following only the README, reaches a migrated and seeded database.
- Migration history is committed and reproducible.
