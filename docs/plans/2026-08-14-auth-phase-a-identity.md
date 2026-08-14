# Auth Phase A — Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an authenticated request resolve to a `User` row — verify the Supabase-issued JWT, register the domain user with DPDP consent, and expose `GET /auth/me`.

**Architecture:** The client authenticates directly against Supabase; this API only verifies. A `jose`-based verifier checks an ES256 token against the project's JWKS, `authMiddleware` resolves `sub` to a `User` row and its active membership, and `POST /auth/register` creates that row alongside its `ConsentRecord`s in one transaction. Both the verifier's key source and the seed's auth-user provisioner are injected, so every unit test runs offline.

**Tech Stack:** TypeScript 6.0.3 (ESM, `nodenext`), Express 5, Prisma 7.9.1 with `@prisma/adapter-pg`, Zod 4.4.3, `jose` 6.2.8, Jest 30 + ts-jest + Supertest.

**Spec:** `docs/specs/2026-08-14-auth-family-consent-design.md` (phase A of three)

## Global Constraints

- ESM (`"type": "module"`), `module`/`moduleResolution` both `nodenext`. Every relative import carries a `.js` extension though the file on disk is `.ts`. `verbatimModuleSyntax` means type-only imports use `import type`.
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`.
- `npm run lint` is `eslint . --max-warnings 0`, with type-aware rules including `@typescript-eslint/require-await` — never write an `async` callback containing no `await`. `no-console` is off only in `src/server.ts` and `prisma/seed.ts`.
- Prettier enforced via `npm run format:check`. Conventional Commits.
- `npm test` runs the unit project only (currently 14 tests, no Docker). `npm run test:integration` runs the integration project (currently 8, `maxWorkers: 1`, needs the test database migrated).
- Routes are versioned under `/api/v1`. `/healthz` and `/readyz` stay unversioned.
- Error responses use exactly `{ "error": { "code": "...", "message": "..." } }`. Never put a JWT, a Supabase error verbatim, a connection string, or "this email exists" in a response body.
- `npx prisma migrate dev --create-only` **fails with P4002** against the dev database because of the cross-schema `auth.users` FK. Create migration directories by hand and apply with `prisma migrate deploy`.

## Verified facts (probed against the running local stack, 2026-08-14)

These are measured, not assumed. Use them verbatim.

| Fact                                               | Value                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access token algorithm                             | **ES256**, header carries `kid`                                                                                                                                        |
| JWKS endpoint                                      | `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`                                                                                                                        |
| `iss` claim                                        | `${SUPABASE_URL}/auth/v1` — locally `http://127.0.0.1:54321/auth/v1`                                                                                                   |
| `aud` claim                                        | `authenticated`                                                                                                                                                        |
| Claims present                                     | `iss, sub, aud, exp, iat, email, phone, app_metadata, user_metadata, role, aal, amr, session_id, is_anonymous`                                                         |
| Admin create user                                  | `POST ${SUPABASE_URL}/auth/v1/admin/users`, headers `apikey` + `Authorization: Bearer <service key>`, body `{email, password, email_confirm: true}` → returns `{ id }` |
| jose error codes                                   | `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`, `ERR_JWT_CLAIM_VALIDATION_FAILED`, `ERR_JWT_EXPIRED`                                                                          |
| **A token with no `sub` passes jose verification** | Our code MUST reject it. Otherwise the user lookup searches for `undefined`.                                                                                           |
| Local stack keys                                   | `npx supabase status` prints `SERVICE_ROLE_KEY` and `ANON_KEY`                                                                                                         |

---

## File Structure

| File                            | Responsibility                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/env.ts`             | Modified: adds `SUPABASE_URL` (required) and `SUPABASE_SERVICE_ROLE_KEY` (optional — seed only).                                   |
| `src/auth/verifyToken.ts`       | `createTokenVerifier({ issuer, audience, keys })` → `(token) => Promise<VerifiedToken>`. Key source injected so tests run offline. |
| `src/auth/middleware.ts`        | `createAuthMiddleware({ verify, prisma })` → Express middleware setting `req.user`.                                                |
| `src/http/errors.ts`            | `sendError(res, status, code, message)` and the `ApiErrorCode` union. One envelope for the whole API.                              |
| `src/routes/auth.ts`            | `createAuthRouter({ prisma })` — `POST /register`, `GET /me`.                                                                      |
| `src/services/registerUser.ts`  | `registerUser(prisma, input)` — the transaction. Pure of Express.                                                                  |
| `prisma/schema.prisma`          | Modified: `ConsentRecord` model, `ConsentType` enum, `authUserId` becomes non-optional.                                            |
| `prisma/seed.ts`                | Modified: takes an `AuthUserProvisioner`.                                                                                          |
| `test/auth/verifyToken.test.ts` | Unit: 7 cases, offline via a locally minted keypair.                                                                               |
| `test/auth/middleware.test.ts`  | Unit: 401/403 paths with a stub verifier and a stub client.                                                                        |
| `test/integration/auth.test.ts` | Integration: register idempotency, consent rows, `/me`.                                                                            |

Dependency order: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.

---

### Task 1: Environment additions

**Files:**

- Modify: `src/config/env.ts`
- Modify: `test/config/env.test.ts`
- Modify: `.env.example`

**Interfaces:**

- Consumes: existing `loadEnv(source): Env`.
- Produces: `Env` gains `SUPABASE_URL: string` (required) and `SUPABASE_SERVICE_ROLE_KEY?: string` (optional). Tasks 2, 5 and 7 read `SUPABASE_URL`; Task 4 reads the service key.

- [ ] **Step 1: Write the failing tests**

Add to `test/config/env.test.ts`, and add `SUPABASE_URL` to the existing `valid` fixture object so the current tests keep passing:

```ts
it("requires SUPABASE_URL", () => {
  const { SUPABASE_URL: _omitted, ...withoutUrl } = valid;
  expect(() => loadEnv(withoutUrl)).toThrow(/SUPABASE_URL/);
});

it("rejects a SUPABASE_URL that is not a URL", () => {
  expect(() => loadEnv({ ...valid, SUPABASE_URL: "nonsense" })).toThrow(/SUPABASE_URL/);
});

it("leaves SUPABASE_SERVICE_ROLE_KEY undefined when unset", () => {
  expect(loadEnv(valid).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
});

it("accepts SUPABASE_SERVICE_ROLE_KEY when provided", () => {
  expect(
    loadEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "svc-key" }).SUPABASE_SERVICE_ROLE_KEY,
  ).toBe("svc-key");
});
```

The `valid` fixture becomes:

```ts
const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
};
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/config/env.test.ts`
Expected: FAIL — `SUPABASE_URL` is not in the schema, so `loadEnv(withoutUrl)` does not throw.

- [ ] **Step 3: Extend the schema**

In `src/config/env.ts`, add to `envSchema`:

```ts
  // Base URL of the Supabase project. The JWT issuer and JWKS endpoint are
  // derived from it, so it must not carry a trailing slash.
  SUPABASE_URL: z.url(),
  // Service-role key. Needed ONLY by the seed's auth-user provisioner; the
  // request path never uses it, which is why it is optional here.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/config/env.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Document both variables**

Append to `.env.example`:

```
# Base URL of the Supabase project. The JWT issuer is <SUPABASE_URL>/auth/v1 and
# the JWKS endpoint is <SUPABASE_URL>/auth/v1/.well-known/jwks.json.
# No trailing slash. Locally this is what `npx supabase status` prints as API_URL.
SUPABASE_URL=http://127.0.0.1:54321

# Service-role key, used ONLY by `prisma db seed` to create auth users.
# The request path never reads it. Locally, copy SERVICE_ROLE_KEY from
# `npx supabase status`. Never commit a real value and never send it to a client.
# SUPABASE_SERVICE_ROLE_KEY=
```

Then add `SUPABASE_URL=http://127.0.0.1:54321` to your real `.env`, or `npm run dev` will now fail at boot.

- [ ] **Step 6: Verify and commit**

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
git add src/config/env.ts test/config/env.test.ts .env.example
git commit -m "feat: add Supabase URL and service-role key to validated env"
```

---

### Task 2: JWT verifier

**Files:**

- Create: `src/auth/verifyToken.ts`
- Test: `test/auth/verifyToken.test.ts`
- Modify: `package.json` (add `jose`)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `type VerifiedToken = { authUserId: string; email?: string; phone?: string }`
  - `type KeyResolver = Parameters<typeof jwtVerify>[1]` — the second argument jose accepts; production passes `createRemoteJWKSet(...)`, tests pass `createLocalJWKSet(...)`
  - `createTokenVerifier(options: { issuer: string; audience: string; keys: KeyResolver }): (token: string) => Promise<VerifiedToken>`
  - `createSupabaseVerifier(supabaseUrl: string): (token: string) => Promise<VerifiedToken>` — wires the remote JWKS
  - `class InvalidTokenError extends Error`
    Task 5 consumes `createSupabaseVerifier` and catches `InvalidTokenError`.

- [ ] **Step 1: Install jose**

```bash
npm install jose@^6.2.8
```

`jose` is a runtime dependency — the request path verifies every token with it.

- [ ] **Step 2: Write the failing test**

Create `test/auth/verifyToken.test.ts`. The keypair is generated in-test, so this suite needs no network and no Supabase:

```ts
import { beforeAll, describe, expect, it } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";

import { InvalidTokenError, createTokenVerifier } from "../../src/auth/verifyToken.js";

const ISSUER = "http://127.0.0.1:54321/auth/v1";
const AUDIENCE = "authenticated";
const SUB = "aafc8a5a-3b92-40ff-ae7a-a5e6dce2624b";

let privateKey: CryptoKey;
let verify: (token: string) => Promise<{ authUserId: string; email?: string; phone?: string }>;

type MintOptions = {
  sub?: string | undefined;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  email?: string;
};

async function mint(options: MintOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = {};
  if (options.email !== undefined) {
    claims["email"] = options.email;
  }

  let token = new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m");

  const sub = "sub" in options ? options.sub : SUB;
  if (sub !== undefined) {
    token = token.setSubject(sub);
  }

  return token.sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;

  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test-key",
    alg: "ES256",
    use: "sig",
  };
  verify = createTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe("createTokenVerifier", () => {
  it("accepts a valid token and returns the subject", async () => {
    const result = await verify(await mint({ email: "meera@example.test" }));

    expect(result.authUserId).toBe(SUB);
    expect(result.email).toBe("meera@example.test");
  });

  it("omits email and phone when the token carries neither", async () => {
    const result = await verify(await mint());

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    await expect(verify(await mint({ expiresIn: "-1s" }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a tampered signature", async () => {
    const token = await mint();
    const parts = token.split(".");
    const tampered = `${parts[0] ?? ""}.${parts[1] ?? ""}.${"A".repeat((parts[2] ?? "").length)}`;

    await expect(verify(tampered)).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token from the wrong issuer", async () => {
    await expect(verify(await mint({ issuer: "http://evil.test/auth/v1" }))).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it("rejects a token for the wrong audience", async () => {
    await expect(verify(await mint({ audience: "anon" }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token with no subject", async () => {
    await expect(verify(await mint({ sub: undefined }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token that is not a JWT at all", async () => {
    await expect(verify("not-a-token")).rejects.toThrow(InvalidTokenError);
  });
});
```

The no-subject case is not hypothetical: jose verifies such a token happily, so without an explicit check the middleware would look up a user by `undefined`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/auth/verifyToken.test.ts`
Expected: FAIL — cannot find module `../../src/auth/verifyToken.js`.

- [ ] **Step 4: Implement the verifier**

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

/**
 * The key source jose accepts, injected so unit tests can verify offline with a
 * locally minted keypair. Derived from jwtVerify's own signature rather than
 * named explicitly, so a jose upgrade cannot silently drift from it.
 */
export type KeyResolver = Parameters<typeof jwtVerify>[1];

export type VerifiedToken = {
  authUserId: string;
  email?: string;
  phone?: string;
};

/**
 * Every rejection reason collapses into this one type on purpose. The caller
 * returns a single 401 regardless of cause, so an attacker cannot learn whether
 * a token was expired, forged, or simply malformed.
 */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

export function createTokenVerifier(options: {
  issuer: string;
  audience: string;
  keys: KeyResolver;
}): (token: string) => Promise<VerifiedToken> {
  return async function verify(token: string): Promise<VerifiedToken> {
    let payload: JWTPayload;

    try {
      ({ payload } = await jwtVerify(token, options.keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["ES256"],
      }));
    } catch (error) {
      throw new InvalidTokenError(
        error instanceof Error ? error.message : "token verification failed",
      );
    }

    // jose verifies a token with no `sub` without complaint. Left unchecked,
    // the caller would look up a user by undefined.
    const sub = payload.sub;
    if (sub === undefined || sub === "") {
      throw new InvalidTokenError("token has no subject");
    }

    const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
    const phone = typeof payload["phone"] === "string" ? payload["phone"] : undefined;

    return {
      authUserId: sub,
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
    };
  };
}

/**
 * Production wiring. The remote key set is cached and refreshed by jose, so
 * Supabase rotating its signing key needs no deploy.
 */
export function createSupabaseVerifier(
  supabaseUrl: string,
): (token: string) => Promise<VerifiedToken> {
  const issuer = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;

  return createTokenVerifier({
    issuer,
    audience: "authenticated",
    keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/auth/verifyToken.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Verify and commit**

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
git add src/auth/verifyToken.ts test/auth/verifyToken.test.ts package.json package-lock.json
git commit -m "feat: verify Supabase ES256 tokens against the project JWKS"
```

---

### Task 3: ConsentRecord and `auth_user_id NOT NULL`

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_consent_and_auth_user_id_required/migration.sql`

**Interfaces:**

- Consumes: the generated Prisma client from Sprint 1.
- Produces: `prisma.consentRecord` with fields `userId`, `consentType`, `grantedByUserId`, `grantedAt`, `revokedAt`, `policyVersion`; `ConsentType` enum with `health_data | minor_guardian | marketing_notifications | photo_retention`; `User.authUserId` typed `string`, not `string | null`. Tasks 4, 6 and 7 depend on both.

- [ ] **Step 1: Add the model and tighten the column**

In `prisma/schema.prisma`, change `authUserId` on `User` from `String?` to `String`, keeping `@unique @map("auth_user_id") @db.Uuid`. Add the relation field `consents ConsentRecord[]` to `User`, plus:

```prisma
enum ConsentType {
  health_data
  minor_guardian
  marketing_notifications
  photo_retention
}

model ConsentRecord {
  id String @id @default(uuid(7)) @db.Uuid

  userId String @map("user_id") @db.Uuid
  user   User   @relation("UserConsents", fields: [userId], references: [id])

  consentType ConsentType @map("consent_type")

  /// Self, or an Admin consenting on behalf of a minor (PRD §17).
  grantedByUserId String @map("granted_by_user_id") @db.Uuid
  grantedBy       User   @relation("ConsentGrantedBy", fields: [grantedByUserId], references: [id])

  grantedAt DateTime  @default(now()) @map("granted_at")
  revokedAt DateTime? @map("revoked_at")

  /// Which consent copy was shown. Required so an audit can reproduce it.
  policyVersion String @map("policy_version")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId, consentType])
  @@map("consent_records")
}
```

`ConsentRecord` has no `deleted_at`: it is append-only, so revocation writes `revokedAt` and rows are never removed.

Name the two `User` relation fields to match: `consents ConsentRecord[] @relation("UserConsents")` and `grantedConsents ConsentRecord[] @relation("ConsentGrantedBy")`.

- [ ] **Step 2: Create the migration directory by hand**

`prisma migrate dev --create-only` fails with P4002 here. Create `prisma/migrations/20260814120000_consent_and_auth_user_id_required/migration.sql` (use a real current timestamp) containing:

```sql
-- Consent is required at collection under India's DPDP Act, so it gets a real
-- table rather than a boolean on users: an audit asks what was consented to,
-- when, and under which policy text.
CREATE TYPE "ConsentType" AS ENUM ('health_data', 'minor_guardian', 'marketing_notifications', 'photo_retention');

CREATE TABLE "consent_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "consent_type" "ConsentType" NOT NULL,
  "granted_by_user_id" UUID NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "policy_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_records_user_id_consent_type_idx" ON "consent_records" ("user_id", "consent_type");

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER consent_records_set_updated_at
  BEFORE UPDATE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every user now originates from Supabase Auth, so the link is mandatory.
ALTER TABLE "users" ALTER COLUMN "auth_user_id" SET NOT NULL;
```

The trigger reuses `set_updated_at()`, created in Sprint 1.

- [ ] **Step 3: Apply it, expecting the NOT NULL step to fail first**

```bash
npx prisma migrate deploy
```

Expected: **FAILURE** on the last statement if the dev database still holds the Sprint 1 demo users, whose `auth_user_id` is NULL:
`column "auth_user_id" of relation "users" contains null values`.

That failure is correct and worth seeing — it is the schema refusing to lie about existing data. The database is pre-production, so the remedy is to reset it:

```bash
npx prisma migrate reset --force
```

`migrate reset` re-runs every migration from empty and then runs the seed, which Task 4 has not fixed yet — so expect the seed step to fail too. Continue to Task 4; the pair is verified together in Task 4 Step 6.

- [ ] **Step 4: Confirm the schema in the database**

```bash
docker exec supabase_db_wellness_platform psql -U postgres -d postgres -tAc \
  "select is_nullable from information_schema.columns where table_name='users' and column_name='auth_user_id';"
docker exec supabase_db_wellness_platform psql -U postgres -d postgres -tAc \
  "select count(*) from information_schema.tables where table_name='consent_records';"
```

Expected: `NO`, then `1`.

- [ ] **Step 5: Commit**

```bash
npx prisma generate
npm run typecheck
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add consent records and require auth_user_id"
```

---

### Task 4: Seed provisioner seam

**Files:**

- Modify: `prisma/seed.ts`
- Modify: `test/integration/seed.test.ts`

**Interfaces:**

- Consumes: `loadEnv` (Task 1), `ConsentRecord` (Task 3).
- Produces: `type AuthUserProvisioner = (email: string) => Promise<string>` and `seed(prisma: PrismaClient, provisionAuthUser: AuthUserProvisioner): Promise<{ familyId: string }>`. Also `createSupabaseAuthUserProvisioner(supabaseUrl: string, serviceRoleKey: string): AuthUserProvisioner`.

- [ ] **Step 1: Update the failing test first**

In `test/integration/seed.test.ts`, add a fake provisioner and pass it to every `seed()` call. Tests run against plain Postgres, which has no `auth` schema and therefore no FK, so any UUID is accepted:

```ts
import { randomUUID } from "node:crypto";

const fakeProvisioner = (email: string): Promise<string> => {
  provisioned.push(email);
  return Promise.resolve(randomUUID());
};

let provisioned: string[] = [];

beforeEach(() => {
  provisioned = [];
});
```

Update the existing two tests to call `seed(prisma, fakeProvisioner)`, and add:

```ts
it("provisions exactly one auth user per demo member on a first run", async () => {
  await prisma.familyMembership.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
  provisioned = [];

  await seed(prisma, fakeProvisioner);

  expect(provisioned.sort()).toEqual(["adult@demo.test", "admin@demo.test"]);
});

it("does not provision again on a repeat run", async () => {
  await seed(prisma, fakeProvisioner);
  provisioned = [];

  await seed(prisma, fakeProvisioner);

  expect(provisioned).toEqual([]);
});

it("gives every seeded user a non-null auth_user_id", async () => {
  await seed(prisma, fakeProvisioner);

  const users = await prisma.user.findMany();
  expect(users).toHaveLength(2);
  for (const user of users) {
    expect(user.authUserId).toMatch(/^[0-9a-f-]{36}$/);
  }
});
```

Also add `await prisma.consentRecord.deleteMany();` to the file's existing `beforeAll` cleanup, before `user.deleteMany()`, or the FK will block it.

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:db:up
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy
npm run test:integration -- test/integration/seed.test.ts
```

Expected: FAIL — `seed` takes one argument, and `authUserId` is required but not supplied.

- [ ] **Step 3: Add the seam to `prisma/seed.ts`**

Add the type and the production adapter, and thread the provisioner through `ensureUser`:

```ts
export type AuthUserProvisioner = (email: string) => Promise<string>;

/**
 * Creates a Supabase auth user and returns its id. Used by `prisma db seed`
 * against the local stack — never on a request path, which is why the
 * service-role key is only ever read here.
 */
export function createSupabaseAuthUserProvisioner(
  supabaseUrl: string,
  serviceRoleKey: string,
): AuthUserProvisioner {
  return async function provision(email: string): Promise<string> {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: "demo-password-change-me", email_confirm: true }),
    });

    if (!response.ok) {
      throw new Error(`could not provision auth user (status ${String(response.status)})`);
    }

    const body = (await response.json()) as { id?: string };
    if (body.id === undefined) {
      throw new Error("auth user creation returned no id");
    }

    return body.id;
  };
}
```

Change `ensureUser` to accept the provisioner and set `authUserId`, calling it **only** when creating:

```ts
async function ensureUser(
  prisma: PrismaClient,
  provisionAuthUser: AuthUserProvisioner,
  email: string,
  displayName: string,
) {
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing !== null) {
    return existing;
  }

  const authUserId = await provisionAuthUser(email);
  return prisma.user.create({ data: { displayName, email, locale: "en", authUserId } });
}
```

Change `seed`'s signature to `seed(prisma, provisionAuthUser)` and pass it to both `ensureUser` calls. In the CLI entry block, build the real provisioner:

```ts
if (process.argv[1]?.endsWith("seed.ts") === true) {
  const env = loadEnv(process.env);
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to seed: the demo users need real Supabase auth accounts. Copy SERVICE_ROLE_KEY from `npx supabase status`.",
    );
  }

  const prisma = createPrismaClient(env.DIRECT_URL);
  try {
    const { familyId } = await seed(
      prisma,
      createSupabaseAuthUserProvisioner(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    );
    console.log(`seeded demo family ${familyId}`);
  } finally {
    await disconnect(prisma);
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `npm run test:integration -- test/integration/seed.test.ts`
Expected: PASS, **6 tests** — the file has 3 today and this task adds 3.

- [ ] **Step 5: Verify the real CLI path against the Supabase stack**

Put `SUPABASE_SERVICE_ROLE_KEY` in your `.env` from `npx supabase status`, then:

```bash
npx prisma migrate reset --force
docker exec supabase_db_wellness_platform psql -U postgres -d postgres -tAc \
  "select count(*) from auth.users;"
docker exec supabase_db_wellness_platform psql -U postgres -d postgres -tAc \
  "select count(*) from users where auth_user_id is null;"
```

Expected: `migrate reset` applies every migration and then seeds successfully; `auth.users` count is `2`; the null count is `0`. This is the pair from Task 3 Step 3 finally working together.

- [ ] **Step 6: Verify and commit**

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
git add prisma/seed.ts test/integration/seed.test.ts
git commit -m "feat: provision real auth users from the seed via an injected seam"
```

---

### Task 5: Error envelope and auth middleware

**Files:**

- Create: `src/http/errors.ts`
- Create: `src/auth/middleware.ts`
- Test: `test/auth/middleware.test.ts`

**Interfaces:**

- Consumes: `createTokenVerifier` / `InvalidTokenError` / `VerifiedToken` (Task 2); `PrismaClient` (Sprint 1).
- Produces:
  - `type ApiErrorCode = "UNAUTHENTICATED" | "REGISTRATION_REQUIRED" | "FORBIDDEN_ROLE" | "NOT_IN_FAMILY" | "FLOOR_LOCKED" | "ALREADY_IN_FAMILY" | "INVITE_EXPIRED" | "VALIDATION_FAILED" | "INTERNAL"`
  - `sendError(res: Response, status: number, code: ApiErrorCode, message: string): void`
  - `type AuthenticatedUser = { id: string; authUserId: string; familyId?: string; role?: FamilyRole }`
  - `createAuthMiddleware(deps: { verify: (token: string) => Promise<VerifiedToken>; prisma: PrismaClient }): RequestHandler`
    Tasks 6 and 7 consume all of these. `req.user` is typed by an Express module augmentation in `src/auth/middleware.ts`.

- [ ] **Step 1: Write the failing test**

Create `test/auth/middleware.test.ts`. Both dependencies are stubs, so this suite needs no database:

```ts
import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

import { InvalidTokenError } from "../../src/auth/verifyToken.js";
import { createAuthMiddleware } from "../../src/auth/middleware.js";

const USER = {
  id: "019ffb29-df8f-70ed-a89f-78209ecb2f59",
  authUserId: "aafc8a5a-3b92-40ff-ae7a-a5e6dce2624b",
  memberships: [] as { familyId: string; role: "admin" | "adult" | "child" | "elderly" }[],
};

function buildApp(overrides: {
  verify?: (token: string) => Promise<{ authUserId: string }>;
  findFirst?: () => Promise<typeof USER | null>;
}) {
  const prisma = {
    user: { findFirst: overrides.findFirst ?? (() => Promise.resolve(USER)) },
  } as unknown as Parameters<typeof createAuthMiddleware>[0]["prisma"];

  const app = express();
  app.use(
    createAuthMiddleware({
      verify: overrides.verify ?? (() => Promise.resolve({ authUserId: USER.authUserId })),
      prisma,
    }),
  );
  app.get("/probe", (req, res) => {
    res.status(200).json({ user: req.user });
  });
  return app;
}

describe("createAuthMiddleware", () => {
  it("attaches the resolved user for a valid token", async () => {
    const response = await request(buildApp({})).get("/probe").set("Authorization", "Bearer good");

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: USER.id, authUserId: USER.authUserId });
  });

  it("attaches familyId and role when the user has an active membership", async () => {
    const withMembership = {
      ...USER,
      memberships: [{ familyId: "fam-1", role: "admin" as const }],
    };
    const response = await request(buildApp({ findFirst: () => Promise.resolve(withMembership) }))
      .get("/probe")
      .set("Authorization", "Bearer good");

    expect(response.body.user).toMatchObject({ familyId: "fam-1", role: "admin" });
  });

  it("returns 401 UNAUTHENTICATED when the header is missing", async () => {
    const response = await request(buildApp({})).get("/probe");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when the scheme is not Bearer", async () => {
    const response = await request(buildApp({})).get("/probe").set("Authorization", "Basic abc");

    expect(response.status).toBe(401);
  });

  it("returns 401 when the token is invalid", async () => {
    const verify = () => Promise.reject(new InvalidTokenError("expired"));
    const response = await request(buildApp({ verify }))
      .get("/probe")
      .set("Authorization", "Bearer bad");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("never leaks the rejection reason or the token", async () => {
    const verify = () => Promise.reject(new InvalidTokenError("signature verification failed"));
    const response = await request(buildApp({ verify }))
      .get("/probe")
      .set("Authorization", "Bearer super-secret-token");

    const body = JSON.stringify(response.body);
    expect(body).not.toContain("signature");
    expect(body).not.toContain("super-secret-token");
  });

  it("returns 403 REGISTRATION_REQUIRED when no user row exists", async () => {
    const response = await request(buildApp({ findFirst: () => Promise.resolve(null) }))
      .get("/probe")
      .set("Authorization", "Bearer good");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("REGISTRATION_REQUIRED");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- test/auth/middleware.test.ts`
Expected: FAIL — cannot find `../../src/auth/middleware.js`.

- [ ] **Step 3: Implement the error envelope**

Create `src/http/errors.ts`:

```ts
import type { Response } from "express";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "REGISTRATION_REQUIRED"
  | "FORBIDDEN_ROLE"
  | "NOT_IN_FAMILY"
  | "FLOOR_LOCKED"
  | "ALREADY_IN_FAMILY"
  | "INVITE_EXPIRED"
  | "VALIDATION_FAILED"
  | "INTERNAL";

/**
 * The single response shape for every API failure. Messages are written for a
 * client developer, never carrying a token, a driver error, a connection
 * string, or whether a given email exists.
 */
export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}
```

- [ ] **Step 4: Implement the middleware**

Create `src/auth/middleware.ts`:

```ts
import type { RequestHandler } from "express";

import type { PrismaClient } from "../../generated/prisma/client.js";
import type { FamilyRole } from "../../generated/prisma/enums.js";
import { sendError } from "../http/errors.js";
import { InvalidTokenError } from "./verifyToken.js";
import type { VerifiedToken } from "./verifyToken.js";

export type AuthenticatedUser = {
  id: string;
  authUserId: string;
  familyId?: string;
  role?: FamilyRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Resolves a Supabase JWT to a domain user on every request. The lookup is
 * deliberately not cached and role is not read from the token: a removal or a
 * role change must take effect on the very next request.
 */
export function createAuthMiddleware(deps: {
  verify: (token: string) => Promise<VerifiedToken>;
  prisma: PrismaClient;
}): RequestHandler {
  return function authenticate(req, res, next): void {
    const header = req.header("authorization");
    const token =
      header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : undefined;

    if (token === undefined || token === "") {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    deps
      .verify(token)
      .then(async (verified) => {
        const user = await deps.prisma.user.findFirst({
          where: { authUserId: verified.authUserId, deletedAt: null },
          include: {
            memberships: {
              where: { status: "active", deletedAt: null },
              select: { familyId: true, role: true },
              take: 1,
            },
          },
        });

        if (user === null) {
          sendError(
            res,
            403,
            "REGISTRATION_REQUIRED",
            "This account has not completed registration. Call POST /api/v1/auth/register.",
          );
          return;
        }

        const membership = user.memberships[0];
        req.user = {
          id: user.id,
          authUserId: user.authUserId,
          ...(membership !== undefined && { familyId: membership.familyId, role: membership.role }),
        };
        next();
      })
      .catch((error: unknown) => {
        if (error instanceof InvalidTokenError) {
          // The reason goes to the log only. A client learning *why* a token
          // failed learns whether it forged a signature or merely guessed.
          console.error("token rejected", { reason: error.message });
          sendError(res, 401, "UNAUTHENTICATED", "The token is not valid.");
          return;
        }
        next(error);
      });
  };
}
```

The handler stays synchronous and dispatches promises explicitly, matching the `/readyz` route's shape and avoiding `@typescript-eslint/no-misused-promises`.

- [ ] **Step 5: Allow the log line**

`no-console` permits `warn` and `error` outside `src/server.ts`, so `console.error` here needs no config change. Confirm with `npm run lint`.

- [ ] **Step 6: Run to verify the tests pass**

Run: `npm test -- test/auth/middleware.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Verify and commit**

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
git add src/http/errors.ts src/auth/middleware.ts test/auth/middleware.test.ts
git commit -m "feat: add the API error envelope and authentication middleware"
```

---

### Task 6: `POST /api/v1/auth/register`

**Files:**

- Create: `src/services/registerUser.ts`
- Create: `src/routes/auth.ts`
- Test: `test/integration/auth.test.ts`

**Interfaces:**

- Consumes: `sendError` / `ApiErrorCode` (Task 5), `AuthenticatedUser` (Task 5), `VerifiedToken` (Task 2), `ConsentRecord` (Task 3).
- Produces:
  - `registerUser(prisma: PrismaClient, input: { authUserId: string; email?: string; phone?: string; displayName: string; locale: "en" | "hi"; consents: { consentType: ConsentType; policyVersion: string }[] }): Promise<User>` — idempotent on `authUserId`
  - `createAuthRouter(deps: { prisma: PrismaClient; verify: (token: string) => Promise<VerifiedToken> }): Router`
    Task 7 adds `GET /me` to the same router.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/auth.test.ts`. It exercises `registerUser` directly against real Postgres — the HTTP layer is covered in Task 7, and separating them keeps this test focused on the transaction:

```ts
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { createPrismaClient, disconnect } from "../../src/db/prisma.js";
import { registerUser } from "../../src/services/registerUser.js";

const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);

beforeEach(async () => {
  await prisma.familyMembership.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

const input = () => ({
  authUserId: randomUUID(),
  email: "meera@example.test",
  displayName: "Meera",
  locale: "en" as const,
  consents: [{ consentType: "health_data" as const, policyVersion: "2026-08-14" }],
});

describe("registerUser", () => {
  it("creates the user and its consent rows in one call", async () => {
    const data = input();

    const user = await registerUser(prisma, data);

    expect(user.authUserId).toBe(data.authUserId);
    expect(user.displayName).toBe("Meera");

    const consents = await prisma.consentRecord.findMany({ where: { userId: user.id } });
    expect(consents).toHaveLength(1);
    expect(consents[0]?.consentType).toBe("health_data");
    expect(consents[0]?.grantedByUserId).toBe(user.id);
    expect(consents[0]?.policyVersion).toBe("2026-08-14");
  });

  it("is idempotent on authUserId and does not duplicate consents", async () => {
    const data = input();

    const first = await registerUser(prisma, data);
    const second = await registerUser(prisma, data);

    expect(second.id).toBe(first.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.consentRecord.count()).toBe(1);
  });

  it("rolls back the user when a consent row is invalid", async () => {
    const data = {
      ...input(),
      consents: [{ consentType: "health_data" as const, policyVersion: "" }],
    };

    await expect(registerUser(prisma, data)).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });
});
```

The rollback test is the one that matters: it proves consent capture is genuinely atomic with user creation, which is what DPDP "consent at collection" requires.

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:db:up
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy
npm run test:integration -- test/integration/auth.test.ts
```

Expected: FAIL — cannot find `../../src/services/registerUser.js`.

- [ ] **Step 3: Implement the service**

Create `src/services/registerUser.ts`:

```ts
import type { PrismaClient, User } from "../../generated/prisma/client.js";
import type { ConsentType, Locale } from "../../generated/prisma/enums.js";

export type RegisterUserInput = {
  authUserId: string;
  email?: string;
  phone?: string;
  displayName: string;
  locale: Locale;
  consents: { consentType: ConsentType; policyVersion: string }[];
};

/**
 * Creates the domain user and its consent records atomically. Idempotent on
 * authUserId so a client retrying after a dropped response is not stuck: the
 * Supabase account already exists and cannot be created twice.
 */
export async function registerUser(prisma: PrismaClient, input: RegisterUserInput): Promise<User> {
  const existing = await prisma.user.findFirst({
    where: { authUserId: input.authUserId, deletedAt: null },
  });
  if (existing !== null) {
    return existing;
  }

  for (const consent of input.consents) {
    if (consent.policyVersion.trim() === "") {
      throw new Error("every consent must record the policy version it was granted under");
    }
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        authUserId: input.authUserId,
        displayName: input.displayName,
        locale: input.locale,
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
      },
    });

    if (input.consents.length > 0) {
      await tx.consentRecord.createMany({
        data: input.consents.map((consent) => ({
          userId: user.id,
          grantedByUserId: user.id,
          consentType: consent.consentType,
          policyVersion: consent.policyVersion,
        })),
      });
    }

    return user;
  });
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `npm run test:integration -- test/integration/auth.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the route**

Create `src/routes/auth.ts`:

```ts
import { Router } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { sendError } from "../http/errors.js";
import { registerUser } from "../services/registerUser.js";
import { InvalidTokenError } from "../auth/verifyToken.js";
import type { VerifiedToken } from "../auth/verifyToken.js";

const registerBody = z.object({
  display_name: z.string().min(1).max(120),
  locale: z.enum(["en", "hi"]).default("en"),
  consents: z
    .array(
      z.object({
        consent_type: z.enum([
          "health_data",
          "minor_guardian",
          "marketing_notifications",
          "photo_retention",
        ]),
        policy_version: z.string().min(1),
      }),
    )
    .min(1)
    // Every feature in the product processes health data, so there is no
    // coherent account without this consent.
    .refine((consents) => consents.some((consent) => consent.consent_type === "health_data"), {
      message: "health_data consent is required",
    }),
});

export function createAuthRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();

  // Deliberately NOT behind authMiddleware: the caller has a valid Supabase
  // token but has no users row yet, which is exactly what the middleware
  // rejects with REGISTRATION_REQUIRED.
  router.post("/register", (req, res, next) => {
    const header = req.header("authorization");
    const token =
      header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : undefined;

    if (token === undefined || token === "") {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    deps
      .verify(token)
      .then(async (verified) => {
        const user = await registerUser(deps.prisma, {
          authUserId: verified.authUserId,
          ...(verified.email !== undefined && { email: verified.email }),
          ...(verified.phone !== undefined && { phone: verified.phone }),
          displayName: parsed.data.display_name,
          locale: parsed.data.locale,
          consents: parsed.data.consents.map((consent) => ({
            consentType: consent.consent_type,
            policyVersion: consent.policy_version,
          })),
        });

        res.status(201).json({
          id: user.id,
          display_name: user.displayName,
          locale: user.locale,
          email: user.email,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof InvalidTokenError) {
          console.error("token rejected at register", { reason: error.message });
          sendError(res, 401, "UNAUTHENTICATED", "The token is not valid.");
          return;
        }
        next(error);
      });
  });

  return router;
}
```

Note the email and phone come from the **verified token**, never from the request body — a client cannot register someone else's address.

- [ ] **Step 6: Verify and commit**

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
git add src/services/registerUser.ts src/routes/auth.ts test/integration/auth.test.ts
git commit -m "feat: register the domain user and capture consent atomically"
```

---

### Task 7: `GET /api/v1/auth/me` and app wiring

**Files:**

- Modify: `src/routes/auth.ts`
- Modify: `src/app.ts`
- Modify: `src/server.ts`
- Modify: `test/health.test.ts`, `test/ready.test.ts`
- Test: `test/integration/authRoutes.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 2, 5, 6.
- Produces: `createApp(deps)` where `AppDeps` gains `prisma: PrismaClient` and `verify: (token: string) => Promise<VerifiedToken>` alongside the existing `checkDatabase`.

- [ ] **Step 1: Write the failing HTTP test**

Create `test/integration/authRoutes.test.ts`. It mints its own ES256 tokens, so it needs Postgres but not Supabase:

```ts
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";
import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createTokenVerifier } from "../../src/auth/verifyToken.js";
import { createPrismaClient, disconnect } from "../../src/db/prisma.js";

const ISSUER = "http://127.0.0.1:54321/auth/v1";
const connectionString =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54329/wellness_test";

const prisma = createPrismaClient(connectionString);
let privateKey: CryptoKey;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test-key",
    alg: "ES256",
    use: "sig",
  };

  app = createApp({
    checkDatabase: () => Promise.resolve(),
    prisma,
    verify: createTokenVerifier({
      issuer: ISSUER,
      audience: "authenticated",
      keys: createLocalJWKSet({ keys: [jwk] }),
    }),
  });

  await prisma.familyMembership.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await disconnect(prisma);
});

const tokenFor = (authUserId: string, email = "meera@example.test"): Promise<string> =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setSubject(authUserId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

const body = {
  display_name: "Meera",
  locale: "en",
  consents: [{ consent_type: "health_data", policy_version: "2026-08-14" }],
};

describe("POST /api/v1/auth/register", () => {
  it("creates the user and returns 201", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.display_name).toBe("Meera");
  });

  it("rejects a body with no health_data consent", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...body,
        consents: [{ consent_type: "marketing_notifications", policy_version: "1" }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).post("/api/v1/auth/register").send(body);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the caller once registered", async () => {
    const authUserId = randomUUID();
    const token = await tokenFor(authUserId);
    await request(app)
      .post("/api/v1/auth/register")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ display_name: "Meera", family: null });
  });

  it("returns 403 REGISTRATION_REQUIRED before registering", async () => {
    const token = await tokenFor(randomUUID());

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("REGISTRATION_REQUIRED");
  });

  it("leaves /healthz reachable without a token", async () => {
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:integration -- test/integration/authRoutes.test.ts`
Expected: FAIL — `createApp` does not accept `prisma`, and `/api/v1/auth/register` 404s.

- [ ] **Step 3: Add `GET /me` to the router**

In `src/routes/auth.ts`, import `createAuthMiddleware` and add, before `return router;`:

```ts
router.get(
  "/me",
  createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma }),
  (req, res) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    res.status(200).json({
      id: user.id,
      display_name: req.userDisplayName ?? null,
      family: user.familyId === undefined ? null : { id: user.familyId, role: user.role ?? null },
    });
  },
);
```

`AuthenticatedUser` carries no display name, so rather than inventing `req.userDisplayName`, load the row in the handler:

```ts
const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

router.get("/me", authenticate, (req, res, next) => {
  const user = req.user;
  if (user === undefined) {
    sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
    return;
  }

  deps.prisma.user
    .findUniqueOrThrow({ where: { id: user.id } })
    .then((row) => {
      res.status(200).json({
        id: row.id,
        display_name: row.displayName,
        locale: row.locale,
        email: row.email,
        family: user.familyId === undefined ? null : { id: user.familyId, role: user.role },
      });
    })
    .catch((error: unknown) => {
      next(error);
    });
});
```

Use the second form. Delete the first — it referenced a property that does not exist.

- [ ] **Step 4: Wire the router into the app**

In `src/app.ts`:

```ts
import type { PrismaClient } from "../generated/prisma/client.js";
import type { VerifiedToken } from "./auth/verifyToken.js";
import { createAuthRouter } from "./routes/auth.js";

export type AppDeps = {
  checkDatabase: () => Promise<void>;
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
};
```

and inside `createApp`, after the existing routers:

```ts
app.use("/api/v1/auth", createAuthRouter({ prisma: deps.prisma, verify: deps.verify }));
```

- [ ] **Step 5: Update `src/server.ts`**

```ts
import { createSupabaseVerifier } from "./auth/verifyToken.js";
```

and change the `createApp` call:

```ts
const app = createApp({
  checkDatabase: () => pingDatabase(prisma),
  prisma,
  verify: createSupabaseVerifier(env.SUPABASE_URL),
});
```

- [ ] **Step 6: Update the two existing unit suites for the new signature**

`test/health.test.ts` and `test/ready.test.ts` both call `createApp`. Add the two new dependencies. Neither suite touches them, so a minimal stub is correct:

```ts
const deps = {
  checkDatabase: () => Promise.resolve(),
  prisma: {} as unknown as Parameters<typeof createApp>[0]["prisma"],
  verify: () => Promise.resolve({ authUserId: "unused" }),
};
```

Replace each `createApp({ checkDatabase: ... })` with `createApp({ ...deps, checkDatabase: ... })`, keeping each test's own `checkDatabase` behaviour.

- [ ] **Step 7: Run everything**

```bash
npm test
npm run test:integration
```

Expected, from a measured baseline of unit 14 and integration 8 (5 in `schema.test.ts`, 3 in `seed.test.ts`) — **the phase finished at unit 37 / integration 21**:

- **unit 29** = 14 existing + 8 from Task 2 + 7 from Task 5
- **integration 20** = 8 existing + 3 added in Task 4 + 3 in Task 6 + 6 in Task 7

If your totals differ, find out why before continuing — a missing test is easier to explain now than after the next task lands on top of it.

- [ ] **Step 8: Verify the live server end to end**

```bash
npx supabase start
npm run dev &
sleep 3
curl -s -o /dev/null -w '/healthz %{http_code}\n' localhost:3000/healthz
curl -s -w ' <- /api/v1/auth/me with no token\n' localhost:3000/api/v1/auth/me
ANON=$(npx supabase status -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).ANON_KEY))")
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"live-probe@example.test","password":"Probe-Password-123!"}' -o /tmp/signup.json
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/signup.json','utf8')).access_token)")
curl -s -w '\n' -X POST localhost:3000/api/v1/auth/register -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"Live Probe","locale":"en","consents":[{"consent_type":"health_data","policy_version":"2026-08-14"}]}'
curl -s -w '\n' localhost:3000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
kill %1
```

Expected: `/healthz 200`; `/me` without a token returns `{"error":{"code":"UNAUTHENTICATED",...}}`; register returns 201 with the display name; `/me` returns the user with `"family": null`. This is the sprint's central claim — a real Supabase token resolving to a real domain user.

- [ ] **Step 9: Verify and commit**

```bash
npm run lint && npm run format:check && npm run typecheck
git add src/routes/auth.ts src/app.ts src/server.ts test/health.test.ts test/ready.test.ts test/integration/authRoutes.test.ts
git commit -m "feat: add GET /auth/me and mount the versioned auth router"
```

---

### Task 8: Documentation

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing code-level.

- [ ] **Step 1: Document the auth flow**

Add a section after "Run it locally":

````markdown
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
````

Tokens are ES256, verified against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `SUPABASE_URL`
is required at boot; `SUPABASE_SERVICE_ROLE_KEY` is required only to seed.

````

- [ ] **Step 2: Update the seeding instruction**

The local-run block now needs the service-role key before `npx prisma db seed`, because the demo users need real Supabase auth accounts. Add before the seed line:

```bash
# copy SERVICE_ROLE_KEY from `npx supabase status` into .env first
````

Update the scripts table row for `db:seed` to say it requires `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 3: Verify from a fresh clone**

```bash
cd "$(mktemp -d)" && git clone /home/makima/wellness_platform fresh && cd fresh
git checkout feat/sprint-2-auth
npm ci && npx prisma generate && cp .env.example .env
# add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY per the README
npx supabase start && npx prisma migrate deploy && npx prisma db seed
npm run dev &
sleep 4
curl -s -w ' %{http_code}\n' localhost:3000/api/v1/auth/me
kill %1
```

Expected: the `/me` call returns `401 UNAUTHENTICATED` — correct, since no token was sent. That the server booted and routed the request at all is the pass condition.

- [ ] **Step 4: Commit**

```bash
npm run format && npm run format:check
git add README.md
git commit -m "docs: document the Supabase auth flow and register endpoint"
```

---

## Verification Summary

| Claim                                                          | Command                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A real Supabase token resolves to a domain user                | Task 7 Step 8                                                               |
| Registration is atomic with consent capture                    | `npm run test:integration -- test/integration/auth.test.ts` (rollback test) |
| Registration is idempotent                                     | same suite                                                                  |
| An invalid, expired, forged, or subject-less token is rejected | `npm test -- test/auth/verifyToken.test.ts`                                 |
| No rejection reason or token reaches a response body           | `npm test -- test/auth/middleware.test.ts`                                  |
| An unregistered caller gets 403, not 500                       | `npm run test:integration -- test/integration/authRoutes.test.ts`           |
| `/healthz` still needs no token                                | same suite                                                                  |
| Every seeded user has a real auth account                      | Task 4 Step 5                                                               |
| No lint, format, or type regressions                           | `npm run lint && npm run format:check && npm run typecheck`                 |
