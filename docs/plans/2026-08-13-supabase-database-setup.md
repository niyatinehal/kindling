# Supabase Database Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Express skeleton to a migration-managed Postgres running on the Supabase local stack, with the Domain A schema (`User`, `Family`, `FamilyMembership`), a seed script, and a `/readyz` readiness probe.

**Architecture:** Prisma 7 owns tables and relations; four hand-written SQL migrations cover what Prisma's DSL cannot express (partial unique indexes, `updated_at` triggers, the cross-schema FK to `auth.users`). Prisma connects through the `@prisma/adapter-pg` driver adapter, so the runtime gets the pooled connection string while the CLI reads the direct one from `prisma.config.ts`. Dev runs against `supabase start`; tests run against a plain Postgres container.

**Tech Stack:** TypeScript 6.0.3 (ESM, `nodenext`), Express 5, Prisma 7.9.1, `@prisma/adapter-pg` 7.9.1, `pg` 8.23.0, Zod 4.4.3, Supabase CLI 2.114.0, Jest 30 + ts-jest (ESM), Supertest 7.

**Spec:** `docs/specs/2026-08-13-supabase-database-setup-design.md`

## Global Constraints

- Node.js `>=22`; package is ESM (`"type": "module"`); `module` and `moduleResolution` are both `nodenext`. All relative imports in `src/` and `test/` use `.js` extensions.
- Domain A only: `User`, `Family`, `FamilyMembership`. No auth code, no RLS policies, no Supabase SDK, no other domains.
- Primary keys are UUIDv7, generated client-side via `@default(uuid(7))`. Verified available on Prisma 7.9.1.
- `npm run lint` runs `eslint . --max-warnings 0` — warnings fail. Prettier is enforced in CI via `npm run format:check`.
- The Prisma generator MUST set `importFileExtension = "js"`. Without it the generated client imports `./enums.ts` and `tsc` fails under `nodenext`.
- `npx prisma init` MUST be run with `--no-skills`, or it writes `.agents/`, `.claude/skills/`, `.windsurf/`, and `skills-lock.json` into the repo.
- `generated/` is gitignored and excluded from ESLint and Prettier. `prisma generate` runs before any typecheck.
- Tests live in `test/`, use Jest with `NODE_OPTIONS=--experimental-vm-modules`, and import from `@jest/globals`.
- Commit messages follow Conventional Commits.
- `/healthz` must keep working with the database stopped. Never log or return a connection string.

---

## File Structure

| File                              | Responsibility                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/env.ts`               | Zod schema for environment variables; `loadEnv(source)` returns a typed, validated object or throws naming the offending variable. Pure function — no side effects at import. |
| `src/db/prisma.ts`                | Builds the `PrismaClient` from the pg adapter; exposes `createPrismaClient()`, `pingDatabase(client, timeoutMs)`, and `disconnect(client)`.                                   |
| `src/routes/ready.ts`             | `createReadyRouter(checkDatabase)` — takes the check as an argument so the unit test needs no ESM module mocking.                                                             |
| `src/app.ts`                      | Modified: `createApp(deps)` now receives `{ checkDatabase }` and mounts both routers.                                                                                         |
| `src/server.ts`                   | Modified: loads env, builds the client, wires the app, handles `SIGTERM`/`SIGINT`.                                                                                            |
| `prisma/schema.prisma`            | Domain A models, generator, datasource provider.                                                                                                                              |
| `prisma.config.ts`                | CLI-only config: schema path, migrations path, seed command, `DIRECT_URL`.                                                                                                    |
| `prisma/seed.ts`                  | Idempotent demo family: one family, two members.                                                                                                                              |
| `prisma/migrations/**`            | Generated DDL plus four hand-written SQL migrations.                                                                                                                          |
| `docker-compose.test.yml`         | Plain pinned Postgres for integration tests.                                                                                                                                  |
| `test/config/env.test.ts`         | Unit: env validation.                                                                                                                                                         |
| `test/ready.test.ts`              | Unit: `/readyz` both branches, with a stub check.                                                                                                                             |
| `test/integration/schema.test.ts` | Integration: the hand-written constraints actually apply.                                                                                                                     |
| `test/integration/seed.test.ts`   | Integration: seed produces the demo family, idempotently.                                                                                                                     |

Dependency order: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Tasks 5 and 6 both require a running test database from Task 2.

---

### Task 1: Environment configuration module

**Files:**

- Create: `src/config/env.ts`
- Test: `test/config/env.test.ts`
- Modify: `package.json` (add `zod`)

**Interfaces:**

- Consumes: nothing.
- Produces: `loadEnv(source: Record<string, string | undefined>): Env` and `type Env = { NODE_ENV: "development" | "test" | "production"; PORT: number; DATABASE_URL: string; DIRECT_URL: string }`. Task 7 calls `loadEnv(process.env)`.

- [ ] **Step 1: Install Zod**

```bash
npm install zod@^4.4.3
```

- [ ] **Step 2: Write the failing test**

Create `test/config/env.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";

import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

describe("loadEnv", () => {
  it("defaults NODE_ENV to development and PORT to 3000", () => {
    const env = loadEnv(valid);

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });

  it("coerces PORT from a string", () => {
    expect(loadEnv({ ...valid, PORT: "4000" }).PORT).toBe(4000);
  });

  it("throws naming a missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL that is not a URL", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: "nonsense" })).toThrow(/DATABASE_URL/);
  });

  it("never puts a variable's value in the error message", () => {
    let message = "";
    try {
      loadEnv({ ...valid, DATABASE_URL: "postgresql://user:SUPERSECRET@host/db", PORT: "abc" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("PORT");
    expect(message).not.toContain("SUPERSECRET");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/config/env.test.ts`
Expected: FAIL — cannot find module `../../src/config/env.js`.

- [ ] **Step 4: Implement `src/config/env.ts`**

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  // Pooled connection — used by the runtime driver adapter.
  DATABASE_URL: z.url(),
  // Direct connection — used by the Prisma CLI for migrations. See prisma.config.ts.
  DIRECT_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables, failing fast at boot rather than on first
 * query. Error messages name the offending variable but never echo its value —
 * these strings reach logs, and connection strings contain passwords.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  return result.data;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/config/env.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify lint, format, and types**

```bash
npm run lint && npm run format:check && npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/config/env.ts test/config/env.test.ts package.json package-lock.json
git commit -m "feat: add validated environment configuration"
```

---

### Task 2: Supabase local stack and test database

**Files:**

- Create: `docker-compose.test.yml`
- Modify: `docker-compose.yml` (remove the `db` service and the `postgres-data` volume)
- Modify: `package.json` (add stack and test-db scripts)
- Modify: `.gitignore` (add `supabase/.temp/`)
- Create: `supabase/config.toml` (generated by `supabase init`)

**Interfaces:**

- Consumes: nothing.
- Produces: a dev Postgres on `127.0.0.1:54322` (user `postgres`, password `postgres`, database `postgres`), and a test Postgres on `127.0.0.1:54329` (user `postgres`, password `postgres`, database `wellness_test`). Tasks 5 and 6 connect to the test database.

- [ ] **Step 1: Install the Supabase CLI as a dev dependency**

```bash
npm install -D supabase@^2.114.0
```

- [ ] **Step 2: Initialise the Supabase project**

```bash
npx supabase init
```

Expected: creates `supabase/config.toml`. Answer no to any editor-settings prompt.

- [ ] **Step 3: Start the stack and verify Postgres accepts connections**

```bash
npx supabase start
docker exec -i supabase_db_wellness_platform psql -U postgres -d postgres -tAc "select version();"
```

Expected: `supabase start` prints API URL, DB URL, and Studio URL; `psql` prints a `PostgreSQL 1x.x` line. **Record the major version** — Step 5 pins the test image to match.

If the container name differs, find it with `docker ps --format '{{.Names}}' | grep supabase_db`.

- [ ] **Step 4: Confirm the direct port**

```bash
npx supabase status | grep -i "DB URL"
```

Expected: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

- [ ] **Step 5: Create `docker-compose.test.yml`**

Replace `<MAJOR>` with the major version recorded in Step 3. A mismatch lets CI accept DDL that production rejects.

```yaml
name: wellness-platform-test

services:
  test-db:
    image: postgres:<MAJOR>-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: wellness_test
    ports:
      - "54329:5432"
    # No volume: every run starts from an empty database on purpose.
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d wellness_test"]
      interval: 2s
      timeout: 3s
      retries: 15
```

- [ ] **Step 6: Retire the dev Postgres from `docker-compose.yml`**

Delete the entire `db:` service block, the `depends_on:` block under `app:`, and the top-level `volumes:` section with `postgres-data`. The `app` service and its `ports`/`environment` stay. Replace the app's `DATABASE_URL` value with:

```yaml
DATABASE_URL: ${DATABASE_URL:-postgresql://postgres:postgres@host.docker.internal:54322/postgres}
```

- [ ] **Step 7: Add scripts to `package.json`**

```json
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:status": "supabase status",
    "test:db:up": "docker compose -f docker-compose.test.yml up -d --wait",
    "test:db:down": "docker compose -f docker-compose.test.yml down"
```

- [ ] **Step 8: Add `supabase/.temp/` to `.gitignore`**

```
# supabase local stack state
supabase/.temp/
```

- [ ] **Step 9: Verify both databases**

```bash
npm run test:db:up
docker compose -f docker-compose.test.yml exec -T test-db psql -U postgres -d wellness_test -tAc "select current_database();"
docker compose config -q && echo "dev compose still valid"
```

Expected: `wellness_test`, then `dev compose still valid`.

- [ ] **Step 10: Commit**

```bash
git add supabase/config.toml docker-compose.yml docker-compose.test.yml package.json package-lock.json .gitignore
git commit -m "build: add Supabase local stack and test database"
```

---

### Task 3: Prisma scaffolding and Domain A schema

**Files:**

- Create: `prisma/schema.prisma`, `prisma.config.ts`
- Modify: `package.json` (deps + scripts), `.gitignore`, `.prettierignore`, `eslint.config.js`, `.env.example`, `.dockerignore`
- Create: `prisma/migrations/<timestamp>_init/migration.sql` (generated)

**Interfaces:**

- Consumes: `loadEnv` from Task 1 (indirectly, via `.env`).
- Produces: a generated client at `generated/prisma/client.js` exporting `PrismaClient`, and tables `users`, `families`, `family_memberships`. Task 4 imports `PrismaClient` from `../../generated/prisma/client.js`.

- [ ] **Step 1: Install Prisma, the adapter, and dotenv**

```bash
npm install @prisma/adapter-pg@^7.9.1 pg@^8.23.0
npm install -D prisma@^7.9.1 @prisma/client@^7.9.1 dotenv@^17.0.0
```

Note `@prisma/adapter-pg` and `pg` are **runtime** dependencies — the adapter is used at request time.

- [ ] **Step 2: Scaffold Prisma without the agent-skills side effects**

```bash
npx prisma init --datasource-provider postgresql --no-skills
```

Expected: creates `prisma/schema.prisma` and `prisma.config.ts`. It also writes a `.env` — that file is gitignored; move its content into your real `.env` in Step 6 and do not commit it.

- [ ] **Step 3: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../generated/prisma"
  moduleFormat           = "esm"
  generatedFileExtension = "ts"
  // Required: without this the client imports "./enums.ts" and tsc fails
  // under module: "nodenext".
  importFileExtension    = "js"
  runtime                = "nodejs"
}

datasource db {
  provider = "postgresql"
}

enum Locale {
  en
  hi
}

enum UserStatus {
  active
  suspended
  deleted
}

enum FamilyRole {
  admin
  adult
  child
  elderly
}

enum MembershipStatus {
  active
  left
  removed
}

model User {
  id String @id @default(uuid(7)) @db.Uuid

  /// Supabase auth.users.id. Nullable until Epic 2 introduces signup; the
  /// foreign key is added by a hand-written migration because the auth schema
  /// is deliberately not modelled here.
  authUserId String? @unique @map("auth_user_id") @db.Uuid

  email       String?    @map("email")
  phone       String?    @map("phone")
  displayName String     @map("display_name")
  locale      Locale     @default(en)
  status      UserStatus @default(active)
  lastLoginAt DateTime?  @map("last_login_at")

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  createdFamilies Family[]           @relation("FamilyCreatedBy")
  memberships     FamilyMembership[]

  @@map("users")
}

model Family {
  id   String @id @default(uuid(7)) @db.Uuid
  name String

  createdByUserId String @map("created_by_user_id") @db.Uuid
  createdBy       User   @relation("FamilyCreatedBy", fields: [createdByUserId], references: [id])

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  memberships FamilyMembership[]

  @@map("families")
}

model FamilyMembership {
  id String @id @default(uuid(7)) @db.Uuid

  familyId String @map("family_id") @db.Uuid
  family   Family @relation(fields: [familyId], references: [id])

  userId String @map("user_id") @db.Uuid
  user   User   @relation(fields: [userId], references: [id])

  role     FamilyRole
  status   MembershipStatus @default(active)
  joinedAt DateTime         @map("joined_at")

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@unique([familyId, userId])
  @@index([familyId, role])
  @@map("family_memberships")
}
```

Note there are deliberately **no** `@unique` markers on `User.email`/`User.phone`. Task 5 adds them as partial indexes scoped to `deleted_at IS NULL`; a plain unique index would permanently burn an address on soft delete.

- [ ] **Step 4: Write `prisma.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * CLI-only configuration (migrate, db pull, db seed). The runtime client does
 * NOT read this file — it is constructed with the pooled URL in
 * src/db/prisma.ts. Migrations use DIRECT_URL because Supabase's pooler does
 * not support the statements a migration issues.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
```

- [ ] **Step 5: Exclude the generated client from git, lint, format, and the image**

Append to `.gitignore`:

```
# prisma generated client
generated/
```

Append to `.prettierignore`:

```
generated/
```

In `eslint.config.js`, extend the existing ignores entry:

```js
  {
    ignores: ["dist/**", "coverage/**", "generated/**"],
  },
```

Append to `.dockerignore`:

```
generated/
```

The image regenerates the client during the build (Task 8 adds that step to the Dockerfile).

- [ ] **Step 6: Set up `.env` and `.env.example`**

Add to `.env.example`:

```
# Pooled connection — used by the app at runtime.
# Local: the Supabase CLI stack has no pooler, so this matches DIRECT_URL.
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Direct connection — used by the Prisma CLI for migrations only.
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Then `cp .env.example .env` (or merge into an existing `.env`). Remove the placeholder `DATABASE_URL` that `prisma init` wrote.

- [ ] **Step 7: Add Prisma scripts to `package.json`**

```json
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "db:seed": "prisma db seed"
```

Change `typecheck` so the client always exists before type-checking:

```json
    "typecheck": "prisma generate && tsc --noEmit"
```

- [ ] **Step 8: Create the initial migration**

```bash
npx supabase start
npx prisma migrate dev --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/migration.sql`, applies it, and generates the client.

- [ ] **Step 9: Verify the tables and that the generated client compiles**

```bash
docker exec -i supabase_db_wellness_platform psql -U postgres -d postgres -tAc \
  "select table_name from information_schema.tables where table_schema='public' order by 1;"
npm run typecheck
npm run lint
npm run format:check
```

Expected: `_prisma_migrations`, `families`, `family_memberships`, `users`; then three exit-0 commands.

- [ ] **Step 10: Commit**

```bash
git add prisma prisma.config.ts package.json package-lock.json .gitignore .prettierignore .dockerignore eslint.config.js .env.example
git commit -m "feat: add Prisma with Domain A schema and initial migration"
```

---

### Task 4: Prisma client module

**Files:**

- Create: `src/db/prisma.ts`
- Test: `test/db/prisma.test.ts`

**Interfaces:**

- Consumes: `PrismaClient` from `../../generated/prisma/client.js`; `Env` from `../config/env.js`.
- Produces:
  - `createPrismaClient(connectionString: string): PrismaClient`
  - `pingDatabase(client: DatabasePinger, timeoutMs?: number): Promise<void>` — resolves on success, rejects on failure or timeout
  - `type DatabasePinger = { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> }`
  - `disconnect(client: PrismaClient): Promise<void>`

  Task 5, 6, 7 all use these. `pingDatabase` takes the narrow `DatabasePinger` type specifically so the unit test can pass a two-line stub instead of mocking an ESM module.

- [ ] **Step 1: Write the failing test**

Create `test/db/prisma.test.ts`:

```ts
import { describe, expect, it, jest } from "@jest/globals";

import { pingDatabase } from "../../src/db/prisma.js";

describe("pingDatabase", () => {
  it("resolves when the query succeeds", async () => {
    const client = { $queryRaw: jest.fn(async () => [{ result: 1 }]) };

    await expect(pingDatabase(client)).resolves.toBeUndefined();
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects when the query throws", async () => {
    const client = {
      $queryRaw: jest.fn(async () => {
        throw new Error("connection refused");
      }),
    };

    await expect(pingDatabase(client)).rejects.toThrow(/connection refused/);
  });

  it("rejects when the query outlives the timeout", async () => {
    const client = {
      $queryRaw: jest.fn(() => new Promise<unknown>(() => {})),
    };

    await expect(pingDatabase(client, 20)).rejects.toThrow(/timed out/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/db/prisma.test.ts`
Expected: FAIL — cannot find module `../../src/db/prisma.js`.

- [ ] **Step 3: Implement `src/db/prisma.ts`**

```ts
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.js";

/**
 * The narrow slice of PrismaClient that pingDatabase needs. Declaring it
 * separately keeps the readiness check unit-testable with a plain stub instead
 * of an ESM module mock.
 */
export type DatabasePinger = {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
};

/**
 * Prisma 7 connects through a driver adapter rather than reading a URL from the
 * schema, so the pooled connection string is supplied here. Migrations use
 * DIRECT_URL via prisma.config.ts instead.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export async function pingDatabase(client: DatabasePinger, timeoutMs = 2000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`database ping timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([client.$queryRaw`SELECT 1`, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function disconnect(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/db/prisma.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify lint, format, and types**

```bash
npm run lint && npm run format:check && npm run typecheck
```

Expected: all exit 0.

If `typecheck` reports that `PrismaClient` is not assignable to `DatabasePinger`
(it will be used that way in Task 7), the generated `$queryRaw` signature
differs from the one declared here. Widen `DatabasePinger` to match what the
generated client actually declares — read
`generated/prisma/internal/class.ts` for the real signature — rather than
casting at the call site.

- [ ] **Step 6: Commit**

```bash
git add src/db/prisma.ts test/db/prisma.test.ts
git commit -m "feat: add Prisma client module with readiness ping"
```

---

### Task 5: Hand-written SQL migrations

**Files:**

- Create: `prisma/migrations/<timestamp>_domain_a_constraints/migration.sql`
- Create: `test/integration/schema.test.ts`
- Modify: `jest.config.js` (add `unit` and `integration` projects)
- Modify: `package.json` (split test scripts)

**Interfaces:**

- Consumes: `createPrismaClient` from Task 4.
- Produces: the four database constructs the spec's §5 requires. Task 6's seed relies on the partial unique index existing.

- [ ] **Step 1: Create the empty migration**

```bash
npx prisma migrate dev --create-only --name domain_a_constraints
```

Expected: creates a migration directory with an empty or near-empty `migration.sql`.

- [ ] **Step 2: Write the migration SQL**

Replace the contents of the new `migration.sql`:

```sql
-- 1. One active family per user. Prisma's DSL cannot express a partial index,
--    and this is the invariant every family dashboard assumes.
CREATE UNIQUE INDEX "family_memberships_user_id_active_key"
  ON "family_memberships" ("user_id")
  WHERE "status" = 'active';

-- 2. Unique email/phone among live rows only. A plain unique index combined
--    with soft delete would permanently burn an address on account deletion.
CREATE UNIQUE INDEX "users_email_live_key"
  ON "users" ("email")
  WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

CREATE UNIQUE INDEX "users_phone_live_key"
  ON "users" ("phone")
  WHERE "deleted_at" IS NULL AND "phone" IS NOT NULL;

-- 3. updated_at maintained by the database. Prisma's @updatedAt is
--    client-side only, so any raw SQL write would otherwise skip it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER families_set_updated_at
  BEFORE UPDATE ON "families"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER family_memberships_set_updated_at
  BEFORE UPDATE ON "family_memberships"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Link to Supabase Auth. Guarded because the auth schema exists on the
--    Supabase stack but not in a plain Postgres test container.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_auth_user_id_fkey"
      FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;
```

The `DO` block matters: without it this migration fails on the plain Postgres used by tests and CI, where no `auth` schema exists.

- [ ] **Step 3: Apply it and write the failing integration test**

```bash
npx prisma migrate dev
```

Create `test/integration/schema.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

async function createUser(email: string) {
  return prisma.user.create({ data: { displayName: "Test", email } });
}

beforeAll(async () => {
  await prisma.familyMembership.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

describe("hand-written constraints", () => {
  it("rejects a second active membership for the same user", async () => {
    const user = await createUser("one@example.test");
    const family = await prisma.family.create({
      data: { name: "First", createdByUserId: user.id },
    });
    const other = await prisma.family.create({
      data: { name: "Second", createdByUserId: user.id },
    });

    await prisma.familyMembership.create({
      data: { familyId: family.id, userId: user.id, role: "admin", joinedAt: new Date() },
    });

    await expect(
      prisma.familyMembership.create({
        data: { familyId: other.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
    ).rejects.toThrow();
  });

  it("allows a second membership once the first is not active", async () => {
    const user = await createUser("two@example.test");
    const first = await prisma.family.create({
      data: { name: "Old", createdByUserId: user.id },
    });
    const second = await prisma.family.create({
      data: { name: "New", createdByUserId: user.id },
    });

    const membership = await prisma.familyMembership.create({
      data: { familyId: first.id, userId: user.id, role: "adult", joinedAt: new Date() },
    });
    await prisma.familyMembership.update({
      where: { id: membership.id },
      data: { status: "left" },
    });

    await expect(
      prisma.familyMembership.create({
        data: { familyId: second.id, userId: user.id, role: "adult", joinedAt: new Date() },
      }),
    ).resolves.toBeDefined();
  });

  it("frees an email address once the row is soft-deleted", async () => {
    const user = await createUser("recycle@example.test");

    await expect(createUser("recycle@example.test")).rejects.toThrow();

    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    await expect(createUser("recycle@example.test")).resolves.toBeDefined();
  });

  it("bumps updated_at on the database side", async () => {
    const user = await createUser("touch@example.test");

    const [{ updated_at: before }] = await prisma.$queryRaw<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${user.id}::uuid
    `;

    await prisma.$executeRaw`UPDATE users SET display_name = 'Raw' WHERE id = ${user.id}::uuid`;

    const [{ updated_at: after }] = await prisma.$queryRaw<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${user.id}::uuid
    `;

    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
```

The last test writes with `$executeRaw`, bypassing Prisma's client-side `@updatedAt` — that is the only way to prove the trigger, not the ORM, did the work.

- [ ] **Step 4: Split Jest into unit and integration projects**

Replace `jest.config.js`:

```js
/**
 * Jest runs the TypeScript sources through ts-jest in ESM mode, because the
 * package is `"type": "module"`. That requires three things to line up:
 *   1. `useESM` + `extensionsToTreatAsEsm` so ts-jest emits ESM, not CJS.
 *   2. `moduleNameMapper` to strip the `.js` extension that Node ESM requires
 *      on relative imports but which resolves to a `.ts` file on disk.
 *   3. `NODE_OPTIONS=--experimental-vm-modules` in the `test` script.
 *
 * @type {import('jest').Config}
 */
const common = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  clearMocks: true,
};

export default {
  projects: [
    {
      ...common,
      displayName: "unit",
      testMatch: ["<rootDir>/test/**/*.test.ts"],
      testPathIgnorePatterns: ["<rootDir>/test/integration/"],
    },
    {
      ...common,
      displayName: "integration",
      testMatch: ["<rootDir>/test/integration/**/*.test.ts"],
      testTimeout: 30000,
    },
  ],
};
```

Update `package.json` scripts:

```json
    "test": "NODE_OPTIONS=--experimental-vm-modules jest --selectProjects unit",
    "test:integration": "NODE_OPTIONS=--experimental-vm-modules jest --selectProjects integration",
    "test:all": "NODE_OPTIONS=--experimental-vm-modules jest"
```

- [ ] **Step 5: Run the integration test against a freshly migrated test database**

```bash
npm run test:db:up
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy
npm run test:integration
```

Expected: PASS, 4 tests. If the first test passes without the index, the migration did not apply — check `\di` output before assuming the test is wrong.

- [ ] **Step 6: Verify the unit suite still passes and is Docker-free**

```bash
npm run test:db:down
npm test
```

Expected: unit tests pass with no database running.

- [ ] **Step 7: Commit**

```bash
git add prisma/migrations jest.config.js package.json test/integration/schema.test.ts
git commit -m "feat: enforce Domain A invariants with hand-written SQL migrations"
```

---

### Task 6: Seed script

**Files:**

- Create: `prisma/seed.ts`
- Create: `test/integration/seed.test.ts`

**Interfaces:**

- Consumes: `createPrismaClient`, `disconnect` from Task 4.
- Produces: `seed(client: PrismaClient): Promise<{ familyId: string }>` — exported so the integration test calls it directly rather than shelling out.

- [ ] **Step 1: Write the failing test**

Create `test/integration/seed.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { seed } from "../../prisma/seed.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

beforeAll(async () => {
  await prisma.familyMembership.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

describe("seed", () => {
  it("creates one family with two members", async () => {
    const { familyId } = await seed(prisma);

    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      include: { memberships: true },
    });

    expect(family.name).toBe("Demo Family");
    expect(family.memberships).toHaveLength(2);
    expect(family.memberships.map((m) => m.role).sort()).toEqual(["adult", "admin"]);
  });

  it("is idempotent — running twice does not duplicate", async () => {
    await seed(prisma);
    await seed(prisma);

    expect(await prisma.family.count()).toBe(1);
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.familyMembership.count()).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:db:up
npm run test:integration -- test/integration/seed.test.ts
```

Expected: FAIL — cannot find module `../../prisma/seed.js`.

- [ ] **Step 3: Implement `prisma/seed.ts`**

```ts
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient, disconnect } from "../src/db/prisma.js";
import type { PrismaClient } from "../generated/prisma/client.js";

const ADMIN_EMAIL = "admin@demo.test";
const ADULT_EMAIL = "adult@demo.test";

/**
 * Idempotent by design: re-running must not duplicate rows, because the
 * roadmap's definition of done is that a fresh clone plus migrate plus seed
 * produces identical data every time. Keyed on the demo email addresses.
 */
export async function seed(prisma: PrismaClient): Promise<{ familyId: string }> {
  const admin = await ensureUser(prisma, ADMIN_EMAIL, "Demo Admin");
  const adult = await ensureUser(prisma, ADULT_EMAIL, "Demo Adult");

  const existingFamily = await prisma.family.findFirst({
    where: { name: "Demo Family", deletedAt: null },
  });

  const family =
    existingFamily ??
    (await prisma.family.create({
      data: { name: "Demo Family", createdByUserId: admin.id },
    }));

  for (const [user, role] of [
    [admin, "admin"],
    [adult, "adult"],
  ] as const) {
    const membership = await prisma.familyMembership.findUnique({
      where: { familyId_userId: { familyId: family.id, userId: user.id } },
    });

    if (membership === null) {
      await prisma.familyMembership.create({
        data: { familyId: family.id, userId: user.id, role, joinedAt: new Date() },
      });
    }
  }

  return { familyId: family.id };
}

/**
 * `email` has no Prisma-level @unique — uniqueness is a partial index scoped to
 * live rows — so `upsert` is not available here. Find-then-create is the
 * correct shape, and the demo emails are the idempotency key.
 */
async function ensureUser(prisma: PrismaClient, email: string, displayName: string) {
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  if (existing !== null) {
    return existing;
  }

  return prisma.user.create({ data: { displayName, email, locale: "en" } });
}

// `prisma db seed` executes this file directly.
if (process.argv[1]?.endsWith("seed.ts") === true) {
  const env = loadEnv(process.env);
  const prisma = createPrismaClient(env.DIRECT_URL);
  try {
    const { familyId } = await seed(prisma);
    console.log(`seeded demo family ${familyId}`);
  } finally {
    await disconnect(prisma);
  }
}
```

- [ ] **Step 4: Allow `console.log` in the seed script**

`no-console` is on for everything except `src/server.ts`. Extend that override in `eslint.config.js`:

```js
  {
    files: ["src/server.ts", "prisma/seed.ts"],
    rules: {
      "no-console": "off",
    },
  },
```

Also add `prisma/**/*.ts` to the `include` array in `tsconfig.json` so the seed is type-checked and linted:

```json
  "include": ["src/**/*.ts", "test/**/*.ts", "prisma/**/*.ts"]
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run test:integration -- test/integration/seed.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the CLI entry point works end to end**

```bash
npx prisma db seed
npx prisma db seed
docker compose -f docker-compose.test.yml exec -T test-db psql -U postgres -d wellness_test -tAc \
  "select count(*) from families;"
```

Expected: both runs print `seeded demo family <uuid>`; the count is `1`, proving idempotency through the CLI path too.

Note `npx prisma db seed` uses `DIRECT_URL`, so point it at the test database or the Supabase stack deliberately.

- [ ] **Step 7: Verify lint, format, and types**

```bash
npm run lint && npm run format:check && npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add prisma/seed.ts test/integration/seed.test.ts eslint.config.js tsconfig.json
git commit -m "feat: add idempotent demo family seed script"
```

---

### Task 7: `/readyz` and graceful shutdown

**Files:**

- Create: `src/routes/ready.ts`
- Create: `test/ready.test.ts`
- Modify: `src/app.ts`, `src/server.ts`, `test/health.test.ts`

**Interfaces:**

- Consumes: `pingDatabase`, `createPrismaClient`, `disconnect` from Task 4; `loadEnv` from Task 1.
- Produces: `createReadyRouter(checkDatabase: () => Promise<void>): Router`, and `createApp(deps: AppDeps): Express` where `AppDeps = { checkDatabase: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test**

Create `test/ready.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import request from "supertest";

import { createApp } from "../src/app.js";

const ready = () => createApp({ checkDatabase: async () => {} });
const broken = () =>
  createApp({
    checkDatabase: async () => {
      throw new Error("connection refused to postgres://user:SECRET@host/db");
    },
  });

describe("GET /readyz", () => {
  it("returns 200 when the database answers", async () => {
    const response = await request(ready()).get("/readyz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready", checks: { database: "up" } });
  });

  it("returns 503 when the database does not answer", async () => {
    const response = await request(broken()).get("/readyz");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "not_ready", checks: { database: "down" } });
  });

  it("never leaks the connection string into the response", async () => {
    const response = await request(broken()).get("/readyz");

    expect(JSON.stringify(response.body)).not.toContain("SECRET");
  });
});

describe("GET /healthz", () => {
  it("still returns 200 when the database is down", async () => {
    const response = await request(broken()).get("/healthz");

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/ready.test.ts`
Expected: FAIL — `createApp` expects 0 arguments, or `/readyz` returns 404.

- [ ] **Step 3: Implement `src/routes/ready.ts`**

```ts
import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Readiness, as distinct from liveness: this reports whether the process can
 * serve traffic right now. The check is injected so the route is testable
 * without a database and without mocking an ES module.
 */
export function createReadyRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();

  router.get("/readyz", async (_req: Request, res: Response) => {
    try {
      await checkDatabase();
      res.status(200).json({ status: "ready", checks: { database: "up" } });
    } catch (error) {
      // The reason goes to the log, never to the response — the message can
      // contain a connection string, and this endpoint is often public.
      console.error("readiness check failed", error);
      res.status(503).json({ status: "not_ready", checks: { database: "down" } });
    }
  });

  return router;
}
```

- [ ] **Step 4: Modify `src/app.ts`**

```ts
import express from "express";
import type { Express } from "express";

import { healthRouter } from "./routes/health.js";
import { createReadyRouter } from "./routes/ready.js";

export type AppDeps = {
  checkDatabase: () => Promise<void>;
};

/**
 * Builds the configured Express app without binding a port, so tests can drive
 * it in-process with supertest. Binding happens in `server.ts`.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use(healthRouter);
  app.use(createReadyRouter(deps.checkDatabase));

  return app;
}
```

- [ ] **Step 5: Allow `console.error` in the ready route**

`no-console` already permits `warn` and `error` (`{ allow: ["warn", "error"] }`), so no ESLint change is needed. Confirm with `npm run lint`.

- [ ] **Step 6: Update `test/health.test.ts` for the new signature**

Replace both `createApp()` calls with:

```ts
createApp({ checkDatabase: async () => {} });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — health 2 tests, ready 4 tests, plus env and prisma unit tests.

- [ ] **Step 8: Modify `src/server.ts` for wiring and graceful shutdown**

```ts
import { loadEnv } from "./config/env.js";
import { createPrismaClient, disconnect, pingDatabase } from "./db/prisma.js";
import { createApp } from "./app.js";

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({ checkDatabase: () => pingDatabase(prisma) });

const server = app.listen(env.PORT, () => {
  console.log(`wellness-platform listening on http://localhost:${env.PORT}`);
});

/**
 * Close the HTTP server before the connection pool, so in-flight requests are
 * not cut off mid-query.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await disconnect(prisma);

  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
```

Note the old `resolvePort` helper is replaced by `loadEnv`, which validates `PORT` with the same bounds. Delete it.

- [ ] **Step 9: Verify the running app end to end**

```bash
npx supabase start
npm run dev &
sleep 3
curl -s localhost:3000/healthz; echo
curl -s -w ' HTTP %{http_code}\n' localhost:3000/readyz
npx supabase stop
curl -s -w ' HTTP %{http_code}\n' localhost:3000/readyz
curl -s -w ' HTTP %{http_code}\n' localhost:3000/healthz
kill %1
```

Expected: `/healthz` 200 both times; `/readyz` 200 with the stack up and **503** with it stopped. This is the sprint's central behavioural claim — do not skip it.

- [ ] **Step 10: Verify lint, format, and types, then commit**

```bash
npm run lint && npm run format:check && npm run typecheck
git add src/routes/ready.ts src/app.ts src/server.ts test/ready.test.ts test/health.test.ts
git commit -m "feat: add /readyz readiness probe and graceful shutdown"
```

---

### Task 8: CI and Dockerfile

**Files:**

- Modify: `.github/workflows/ci.yml`, `Dockerfile`

**Interfaces:**

- Consumes: all prior scripts (`prisma:generate`, `test`, `test:integration`).
- Produces: a CI pipeline that fails on schema drift and on integration-test failure.

- [ ] **Step 1: Add the client generation and integration job to CI**

In `.github/workflows/ci.yml`, add a generate step to the existing `verify` job immediately after `Install dependencies`:

```yaml
# The generated client is gitignored, so its types must be built before
# anything type-checks.
- name: Generate Prisma client
  run: npx prisma generate
```

Then add a second job at the same level as `verify`:

```yaml
integration:
  name: integration tests
  runs-on: ubuntu-latest

  services:
    postgres:
      image: postgres:<MAJOR>-alpine
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: wellness_test
      ports:
        - 54329:5432
      options: >-
        --health-cmd "pg_isready -U postgres -d wellness_test"
        --health-interval 2s
        --health-timeout 3s
        --health-retries 15

  env:
    DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54329/wellness_test
    DIRECT_URL: postgresql://postgres:postgres@127.0.0.1:54329/wellness_test
    TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54329/wellness_test

  steps:
    - name: Checkout
      uses: actions/checkout@v5

    - name: Set up Node
      uses: actions/setup-node@v5
      with:
        node-version: 22
        cache: npm

    - name: Install dependencies
      run: npm ci

    - name: Generate Prisma client
      run: npx prisma generate

    # Fails if schema.prisma was edited without a matching migration —
    # invisible locally, breaks the next migrate deploy.
    - name: Check for migration drift
      run: |
        npx prisma migrate diff \
          --from-migrations prisma/migrations \
          --to-schema-datamodel prisma/schema.prisma \
          --shadow-database-url "$DIRECT_URL" \
          --exit-code

    - name: Apply migrations
      run: npx prisma migrate deploy

    - name: Integration tests
      run: npm run test:integration
```

Use the same `<MAJOR>` recorded in Task 2 Step 3.

- [ ] **Step 2: Verify the drift check catches a real drift**

```bash
npm run test:db:up
# Add a field with no migration
printf '\nmodel Drift {\n  id String @id @default(uuid(7)) @db.Uuid\n}\n' >> prisma/schema.prisma
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate diff \
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@127.0.0.1:54329/wellness_test --exit-code
echo "exit=$?"
```

Expected: non-zero exit. Then revert with `git checkout prisma/schema.prisma` and confirm the same command exits 0.

- [ ] **Step 3: Add client generation to the Dockerfile builder stage**

In `Dockerfile`, the builder stage must generate the client before compiling. Change the builder's copy/build sequence to:

```dockerfile
COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build
```

`npm run build` runs `tsc -p tsconfig.build.json`, which compiles `src/` only; the generated client is resolved through imports.

- [ ] **Step 4: Verify the image still builds and runs**

```bash
docker build -t wellness-platform:sprint1 .
npx supabase start
docker run -d --name wp-s1 -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  -e DIRECT_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  wellness-platform:sprint1
sleep 4
curl -s -w ' HTTP %{http_code}\n' localhost:3000/readyz
docker rm -f wp-s1
```

Expected: `{"status":"ready",...} HTTP 200` from inside the container.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml Dockerfile
git commit -m "ci: add integration tests and migration drift check"
```

---

### Task 9: Documentation and sprint definition of done

**Files:**

- Modify: `README.md`, `.env.example`

**Interfaces:**

- Consumes: everything above.
- Produces: a README a stranger can follow to a migrated, seeded, responding app.

- [ ] **Step 1: Replace the README's "Run it with Docker Compose" section**

The compose file no longer owns Postgres. Replace that section with:

````markdown
## Run it locally

```bash
git clone <repo-url>
cd wellness_platform
npm ci
cp .env.example .env
npx supabase start          # Postgres, Auth, Storage in Docker
npx prisma migrate deploy   # apply the schema
npx prisma db seed          # one demo family, two members
npm run dev
```
````

Then:

```bash
curl localhost:3000/healthz   # liveness  — 200 even with the database down
curl localhost:3000/readyz    # readiness — 200 only when Postgres answers
```

Stop the stack with `npx supabase stop`. Inspect data with `npx prisma studio`
or the Supabase Studio URL that `supabase start` prints.

## Run the tests

```bash
npm test                  # unit — no Docker required
npm run test:db:up        # start the test Postgres
npm run test:integration  # integration — needs the test database
npm run test:db:down
```

````

- [ ] **Step 2: Document the two connection strings**

Add to the README's Configuration section:

```markdown
Two connection strings exist because Supabase pools connections:

- `DATABASE_URL` — pooled. Used by the app at runtime via the Prisma driver adapter.
- `DIRECT_URL` — direct. Used by the Prisma CLI for migrations and seeding, which
  issue statements the pooler does not support.

Locally the Supabase CLI has no pooler, so both point at port 54322. In production
they differ: 6543 (pooled) and 5432 (direct).
````

- [ ] **Step 3: Update the npm scripts table**

Add rows for `db:start`, `db:stop`, `prisma:migrate`, `prisma:studio`, `db:seed`, `test:integration`, `test:db:up`, `test:db:down`, and note that `typecheck` now runs `prisma generate` first.

- [ ] **Step 4: Verify the definition of done from a genuinely fresh clone**

```bash
cd "$(mktemp -d)"
git clone <path-or-url> fresh && cd fresh
npm ci
cp .env.example .env
npx supabase start
npx prisma migrate deploy
npx prisma db seed
npm run dev &
sleep 4
curl -s -w ' HTTP %{http_code}\n' localhost:3000/readyz
kill %1
```

Expected: `{"status":"ready","checks":{"database":"up"}} HTTP 200`, reached by following only the README.

- [ ] **Step 5: Run the full verification suite**

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
npm run test:db:up && npx prisma migrate deploy && npm run test:integration && npm run test:db:down
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document Supabase setup, migrations, and test databases"
```

---

## Verification Summary

The sprint is done when all of these hold:

| Claim                                   | Command                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Migrations run clean from empty         | `npx prisma migrate reset --force` then `npx prisma migrate deploy`     |
| Seed is idempotent                      | run `npx prisma db seed` twice; `families` count stays 1                |
| Readiness reflects reality              | `/readyz` 200 with the stack up, 503 with it stopped                    |
| Liveness is independent                 | `/healthz` 200 with the database stopped                                |
| Invariants are enforced by the database | `npm run test:integration` — 6 tests                                    |
| No lint, format, or type regressions    | `npm run lint && npm run format:check && npm run typecheck`             |
| CI blocks drift                         | `prisma migrate diff --exit-code` non-zero on an unmigrated schema edit |
| Fresh clone works from the README alone | Task 9 Step 4                                                           |
