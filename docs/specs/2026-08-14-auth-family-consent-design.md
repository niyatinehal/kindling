# Identity, Family & Consent: Design

**Status:** Approved for implementation planning
**Author:** Niyati (Product) + Claude (drafting support)
**Date:** 2026-08-14
**Companion to:** `2026-08-13-supabase-database-setup-design.md` (Sprint 1), `2026-08-07-family-wellness-platform-prd.md` (§7.1, §7.6, §15, §17), `2026-08-07-family-wellness-platform-database-architecture.md` (Domains A and B)
**Implements:** FR-AUTH-1 through FR-AUTH-5, FR-FAM-1 through FR-FAM-3, PRD §17 consent and RBAC requirements
**Branched from:** `feat/sprint-1-database` @ `dac78d7` — this design assumes Sprint 1's schema, which is still on an open PR

---

## 1. Context

Sprint 1 connected the service to Postgres and created Domain A's three tables. The service currently exposes exactly two endpoints, `/healthz` and `/readyz`, both unauthenticated. No request can say who it is, so nothing in the PRD's own Sprint 1 list — family creation, invite/join, server-side RBAC, profile CRUD — can begin.

This design covers the whole identity surface in one document, delivered as three implementation phases:

- **A. Identity** — Supabase Auth wired end to end; a request resolves to a `User` row and its role.
- **B. Family & RBAC** — family creation, invites, role enforcement.
- **C. Consent & visibility** — DPDP consent records, per-category visibility, the FR-FAM-3 safety floor.

A single document because the three interact: RBAC needs identity, visibility needs roles. Three plans because each produces working, tested software on its own, and one 30-task plan would be the same over-reach as modelling all 36 entities in Sprint 1.

---

## 2. Decisions

| #   | Decision                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Supabase Auth owns production identity.** The hand-rolled implementation lives on `learn/auth-from-scratch` and never serves a real family. | Carried forward from the Sprint 1 spec (its D1/D2). FR-AUTH-1 requires password _and_ phone OTP _and_ Google OAuth; §15 requires refresh-token rotation. That is the highest-risk security surface in the product, guarding children's medical conditions. The learning value is preserved by the branch; the liability is not shipped. |
| D2  | **The client authenticates directly against Supabase.** The API only ever verifies a JWT.                                                     | The backend never handles a password or an OTP code, and never holds the service-role key on a request path. Token refresh, OAuth redirects, and email/SMS delivery are Supabase's problem.                                                                                                                                             |
| D3  | **An explicit `POST /auth/register` creates the `public.users` row**, in one transaction with the user's `ConsentRecord` rows.                | DPDP requires consent captured _at collection_, not afterwards. A database trigger cannot capture consent atomically and puts the logic where neither Prisma nor Jest can see it.                                                                                                                                                       |
| D4  | **Every family member has their own login.** `users.auth_user_id` becomes `NOT NULL`.                                                         | FR-AUTH-5 gives members control over their own visibility, and the PRD's personas (Arjun, 16; Ramesh, 63) both value autonomy. That is meaningless without their own account. One kind of member keeps every downstream query simple.                                                                                                   |
| D5  | **Role and family are resolved by database lookup on each request**, not from JWT claims.                                                     | Removals and role changes take effect on the next request. Claims go stale until refresh, so a removed member would keep access. The `User` row is needed for visibility filtering anyway, so the query is not additional work.                                                                                                         |
| D6  | **Authorization is enforced by a scoped repository on the family-dashboard read path**, and by ordinary middleware everywhere else.           | PRD §17 demands the dashboard query be "structurally incapable of returning hidden fields". Per-handler filtering cannot deliver that. Applying the pattern to the whole schema would be over-reach; applying it to the one path where a leak is a DPDP incident is proportionate.                                                      |

### Rejected alternatives

- **Client → API → Supabase (proxied auth).** Matches PRD §15's endpoint names literally, but puts credentials back through your backend, requires the service-role key on a request path, and means reimplementing refresh and the OAuth redirect dance. Rejected.
- **Hybrid auth (OAuth direct, password proxied).** Two code paths, two failure modes, two test suites, for one server-side hook point. Rejected.
- **Database trigger on `auth.users`.** Cannot capture consent atomically; invisible to Prisma and Jest; would be a fifth hand-written SQL construct. Rejected — see D3.
- **Lazy provisioning in `authMiddleware`.** No natural moment to present consent, a write on a read path, and `display_name` would have to become nullable. Rejected.
- **Managed profiles (members with no login).** Would keep `auth_user_id` nullable and cover a young child or a phone-averse grandparent, but creates two kinds of member that every query and both of FR-AUTH-5 and FR-FAM-3 must then handle separately. Rejected as YAGNI; revisit if a real family needs it.
- **Custom JWT claims for role and family.** Zero-query authorization, but stale until token refresh — a removed member retains access. Rejected on correctness.
- **Middleware-only enforcement.** Conventional and simple, but fails §17's structural bar. Rejected.

---

## 3. Data model

Three new entities, all already specified in the database architecture doc:

**FamilyInvite** (Domain A)

| Field                 | Constraints                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| `family_id`           | FK → Family, not null                                                             |
| `invited_role`        | enum(`adult`, `child`, `elderly`) — `admin` is deliberately not invite-assignable |
| `invite_code`         | unique, not null                                                                  |
| `invited_contact`     | nullable                                                                          |
| `status`              | enum(`pending`, `accepted`, `expired`, `revoked`), default `pending`              |
| `expires_at`          | not null                                                                          |
| `created_by_user_id`  | FK → User, not null                                                               |
| `accepted_by_user_id` | FK → User, nullable                                                               |

**ConsentRecord** (Domain A) — append-only. Revocation writes `revoked_at`; rows are never deleted, because an audit must be able to show what was consented to, when, and under which policy text.

| Field                | Constraints                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| `user_id`            | FK → User, not null                                                                 |
| `consent_type`       | enum(`health_data`, `minor_guardian`, `marketing_notifications`, `photo_retention`) |
| `granted_by_user_id` | FK → User, not null — self, or an Admin consenting for a minor                      |
| `granted_at`         | not null                                                                            |
| `revoked_at`         | nullable                                                                            |
| `policy_version`     | not null                                                                            |

**VisibilitySetting** (Domain B)

| Field                       | Constraints                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `family_membership_id`      | FK → FamilyMembership, not null                                                                              |
| `data_category`             | enum(`adherence_summary`, `weight`, `workout_detail`, `meal_detail`, `sleep`, `water`, `medical_conditions`) |
| `visibility_level`          | enum(`visible`, `hidden`)                                                                                    |
| `is_locked_by_safety_floor` | boolean, default false                                                                                       |

Unique on (`family_membership_id`, `data_category`). Keyed off the membership rather than the User so the model already generalises if a user ever belongs to more than one family.

**Change to existing schema:** `users.auth_user_id` becomes `NOT NULL` (D4). On the Supabase stack that column also carries the guarded foreign key into `auth.users`.

---

## 4. The cost of `NOT NULL`, and the seed seam

D4 has one non-obvious price, recorded here rather than discovered during implementation.

The Sprint 1 seed creates two demo users with no auth accounts. Once `auth_user_id` is `NOT NULL` _and_ foreign-keyed, the seed can no longer invent a value on the Supabase stack. But integration tests run against **plain Postgres, where that FK does not exist** — it sits inside a `DO` guard that checks for the `auth` schema — so there any UUID is acceptable.

Two environments, two truths. The resolution is a seam, not an environment branch inside the seed:

```ts
type AuthUserProvisioner = (email: string) => Promise<string>; // returns auth.users.id

export async function seed(
  prisma: PrismaClient,
  provisionAuthUser: AuthUserProvisioner,
): Promise<{ familyId: string }>;
```

Dev passes an implementation calling Supabase's admin API with the local service-role key from `supabase status`. Tests pass one returning a generated UUIDv7. The seed never inspects its environment, and both paths stay testable.

The alternative — leaving the column nullable and enforcing presence only in the registration path — is simpler but discards a database-level guarantee on the column binding the entire domain to its identity provider.

---

## 5. Authentication flow

```
1. Client   supabase-js: signUp / signInWithPassword / signInWithOtp / signInWithOAuth
2. Supabase returns { access_token (JWT), refresh_token }; the SDK refreshes on its own
3. Client   POST /api/v1/auth/register   Bearer <JWT>   { display_name, locale, consents[] }
4. API      verify JWT -> sub, email, phone
5. API      one transaction: users row (auth_user_id = sub) + consent_records
6. Later    every request -> authMiddleware:
              verify JWT -> users by auth_user_id -> active family_membership
              req.user = { id, authUserId, familyId?, role? }
7. No users row -> 403 { code: "REGISTRATION_REQUIRED" }
```

`POST /auth/register` is idempotent on `auth_user_id`: a repeated call returns the existing user rather than failing, so a client that retries after a dropped response does not get stuck.

### JWT verification

Supabase projects sign either with asymmetric keys exposed at a JWKS endpoint, or with a legacy shared HS256 secret, depending on when the project was created. **This design targets JWKS with a cached key set** — no shared secret in the API, and key rotation works without a deploy.

Which mode this project actually uses **must be confirmed against the real Supabase project before the verifier is written**. Sprint 1 was planned against assumed Prisma 7 behaviour and five of those assumptions were wrong; the same discipline applies here.

Verification asserts, at minimum: signature against a key from the project's JWKS, `iss` matches the project, `aud` matches, `exp` is in the future, and `sub` is present. Each of those has its own unit test.

---

## 6. `FamilyScope`

Only the family-dashboard read path goes through it. `FamilyScope.forViewer(req.user)` exposes pre-scoped reads and nothing else — the unfiltered query is not reachable from a handler.

Rules:

- Every query is constrained to `viewer.familyId`.
- For members other than the viewer, categories whose `VisibilitySetting` is `hidden` are **absent from the result**, not present-and-null.
- **An Admin does not override `hidden`.** FR-AUTH-5 gives members control of their own visibility; FR-FAM-3 only prevents them _reducing_ oversight below a floor. An Admin able to read a hidden category would invert the trust model the PRD is explicit about (§12: "teens control most of their own visibility").

`is_locked_by_safety_floor` constrains **writes, not reads**. It means "this member cannot set this category to hidden on their own." It never means "an Admin may read it anyway." Reads honour whatever the setting currently is.

Everything outside the dashboard uses `authMiddleware` plus `requireRole()`.

### Defaults, and when the rows are created

A membership with no `VisibilitySetting` rows would leave the dashboard's behaviour undefined, so the rows are created **eagerly** — one per `data_category` — in the same transaction that creates the `FamilyMembership` (on family creation and on invite acceptance). There is no implicit fallback to read at query time.

Defaults are deliberately asymmetric, because PRD §12 promises visibility is "not full surveillance by default" while FR-FAM-1 requires the Admin dashboard to actually show something:

| Category            | Default   | Floor-locked |
| ------------------- | --------- | ------------ |
| `adherence_summary` | `visible` | **yes**      |
| everything else     | `hidden`  | no           |

So a new member is visible to their family only as "did they log anything", and opts in to sharing anything more specific. `adherence_summary` is the one category carrying the safety floor, which gives FR-FAM-3 a concrete meaning: a Child or Elderly member cannot switch off the single signal that would reveal they have stopped engaging entirely, without Admin co-approval. Everything genuinely sensitive — weight, medical conditions, meal and workout detail — starts hidden and is theirs to share.

Adults and Admins may hide `adherence_summary` freely; the floor applies to the `child` and `elderly` roles only.

---

## 7. API surface

Two conventions this sprint settles, because it is the first real API surface: routes are versioned under `/api/v1` per PRD §15, and `/healthz` and `/readyz` stay unversioned because probes are not API.

### Phase A — identity

| Endpoint                     | Guard         | Notes                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/register` | authenticated | Idempotent on `auth_user_id`. Creates user + consents in one transaction. Body: `{ display_name, locale, consents: [{ consent_type, policy_version }] }` — `health_data` is required to register at all, since every feature in the product processes health data. |
| `GET /api/v1/auth/me`        | authenticated | User, active membership, role.                                                                                                                                                                                                                                     |

### Phase B — family & RBAC

| Endpoint                                          | Guard                                            |
| ------------------------------------------------- | ------------------------------------------------ |
| `POST /api/v1/families`                           | authenticated, no active family                  |
| `POST /api/v1/families/:id/invites`               | `admin`                                          |
| `POST /api/v1/invites/:code/accept`               | authenticated, no active family                  |
| `GET /api/v1/families/:id/members`                | family member                                    |
| `PATCH /api/v1/families/:id/members/:userId/role` | `admin`                                          |
| `DELETE /api/v1/families/:id/members/:userId`     | `admin` — sets `status = removed`, never deletes |

### Phase C — consent & visibility

| Endpoint                                                       | Guard                                        |
| -------------------------------------------------------------- | -------------------------------------------- |
| `GET` / `PUT /api/v1/me/visibility`                            | self; rejects hiding a floor-locked category |
| `POST /api/v1/families/:id/members/:userId/visibility/approve` | `admin` — the FR-FAM-3 co-approval           |
| `GET` / `POST /api/v1/me/consents`                             | self; revocation writes a new row            |
| `GET /api/v1/families/:id/dashboard`                           | family member, **via `FamilyScope`**         |

---

## 8. Error handling

One envelope, established here:

```json
{ "error": { "code": "REGISTRATION_REQUIRED", "message": "..." } }
```

| Status | Codes                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| 401    | `UNAUTHENTICATED` — missing, malformed, expired, or wrong-issuer JWT, deliberately indistinguishable between causes   |
| 403    | `REGISTRATION_REQUIRED`, `FORBIDDEN_ROLE`, `NOT_IN_FAMILY`, `FLOOR_LOCKED`                                            |
| 409    | `ALREADY_IN_FAMILY` — the one-active-family partial unique index's `P2002`, mapped to a real status rather than a 500 |
| 410    | `INVITE_EXPIRED`                                                                                                      |

Never in a response body: the JWT, a Supabase error verbatim, a connection string, or whether an email address exists. Reasons go to the log; the client gets a code.

---

## 9. Testing

| Level       | What                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | JWT verifier: valid, expired, tampered signature, wrong issuer, wrong audience, missing `sub`. One test each.                                         |
| Unit        | Role-guard matrix: all four roles against each guarded route.                                                                                         |
| Unit        | `FamilyScope`: table-driven over visibility combinations, **including that an Admin cannot read a hidden category**. Heaviest coverage in the sprint. |
| Integration | register → create family → invite → accept → dashboard, against real Postgres.                                                                        |
| Integration | A second active family is rejected with 409, not 500.                                                                                                 |
| Integration | A hidden category is **absent from the serialized dashboard payload** — asserted on the response body, not on an internal object.                     |

`FamilyScope` earns disproportionate testing for the same reason it is safe: a bug in it is invisible at every call site, and nothing downstream fails loudly if it starts returning too much.

---

## 10. Amendments to existing documents

Recorded here rather than silently applied, because these documents are the shared source of truth for later sprints.

1. **PRD §15** lists `POST /auth/signup`, `POST /auth/otp/verify`, and `POST /auth/refresh`. Under D2 those three do not exist — Supabase owns them. The `auth` module's surface is `POST /auth/register` and `GET /auth/me`.
2. **PRD §14** is stale: it lists 12 entities including a single generic `TrackingLog`. The database architecture doc supersedes it with ~36 entities and explicitly splits that into four typed tables. §14 should point at the newer document.
3. **Engineering roadmap Sprint 2** states that `password_hash` and `auth_provider` are "already scaffolded in Sprint 1's model". Sprint 1 deliberately removed both (Supabase Auth owns credentials). Its task list should read: wire Supabase Auth, build `authMiddleware`, and take the hand-rolled implementation to `learn/auth-from-scratch`.
4. **Engineering roadmap Sprint 3** (OTP, OAuth, refresh tokens) no longer ships anything — Supabase provides all three. Rather than delete it, Sprint 3 **becomes the `learn/auth-from-scratch` sprint**: every task, learning topic and interview question in it is built and tested for real, on a branch that is never merged. Its Redis work stays branch-local; production does not gain Redis until the AI pipeline needs cost caps.
5. **Engineering roadmap Sprint 4** already covers FR-AUTH-2 through FR-AUTH-5, so it is where **phases B and C** land. Two corrections to its task list: the partial unique index it proposes already exists (Sprint 1 shipped `family_memberships_user_id_active_key`, predicated on `status = 'active' AND deleted_at IS NULL`) and should be asserted rather than built; and the visibility work needs `FamilyScope`, not just a `VisibilitySetting` table, to satisfy §17's structural requirement.

### Phase-to-sprint mapping

| Phase                    | Roadmap sprint                              |
| ------------------------ | ------------------------------------------- |
| A — Identity             | Sprint 2 (amended)                          |
| —                        | Sprint 3, repurposed to the learning branch |
| B — Family & RBAC        | Sprint 4 (amended)                          |
| C — Consent & visibility | Sprint 4 (amended)                          |

**Not an amendment, corrected on review:** an earlier draft of this section claimed the PRD's and roadmap's sprint numbering collided with no designated authority. That was wrong — the roadmap's own preamble already states it "supersedes the PRD's sprint pacing for execution purposes", while PRD requirement IDs and architecture remain authoritative. No change was needed.

---

## 11. Out of scope

| Deferred                                                           | Lands in                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile, Condition, Equipment, DietaryConstraint (Domain B proper) | The onboarding sprint                                                                                                                                     |
| Child/Elderly simplified UI (FR-AUTH-4)                            | Frontend work; this is the API only                                                                                                                       |
| Token storage choice (httpOnly cookie vs `localStorage`)           | Frontend. The API accepts a Bearer token either way, but §17's sensitivity means the frontend sprint must make this a deliberate decision, not a default. |
| RLS policies                                                       | Not needed; the app tier enforces access, and D6 provides the structural guarantee §17 asks for                                                           |
| Managed profiles for members without a login                       | Only if a real family needs it (§2, rejected alternatives)                                                                                                |
| Rate limiting beyond what Supabase provides                        | `POST /auth/register` should be rate-limited when the API gateway sprint lands                                                                            |

---

## 12. Risks

| Risk                                                                       | Mitigation                                                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The project's JWT signing mode (JWKS vs legacy HS256) is unconfirmed.      | Verify against the real project before writing the verifier. Sprint 1 shipped five wrong assumptions about Prisma 7 by not doing this.             |
| A `FamilyScope` bug leaks a member's hidden data and nothing fails loudly. | Table-driven unit tests over every visibility combination, plus an integration test asserting absence on the serialized payload.                   |
| An abandoned signup leaves an `auth.users` row with no domain row.         | `authMiddleware` returns a distinct `REGISTRATION_REQUIRED` so the client can recover. A cleanup job for genuinely abandoned rows is out of scope. |
| `auth_user_id` going `NOT NULL` breaks the seed on the Supabase stack.     | The provisioner seam in §4, exercised in both modes.                                                                                               |
| Invite codes are guessable if generated weakly.                            | Generate from `crypto.randomBytes`, never `Math.random`; store with an expiry; single-use via the `status` transition.                             |
| DPDP consent text changes and old records become unattributable.           | `policy_version` is not null on every `ConsentRecord`; consent copy is versioned alongside it.                                                     |

---

## 13. Phasing and definition of done

**Phase A — Identity.** `POST /auth/register` creates a user and consent rows idempotently; `GET /auth/me` returns the caller; `authMiddleware` rejects invalid tokens with 401 and unregistered ones with 403; `auth_user_id` is `NOT NULL` and the seed works in both modes.

**Phase B — Family & RBAC.** A user can create a family and become its Admin; an Admin can invite by code; an invitee can accept and gains the invited role; a second active family is rejected with 409; every guarded route rejects the wrong role with 403.

**Phase C — Consent & visibility.** A member can hide a category and it disappears from the Admin's dashboard payload; a floor-locked category cannot be hidden without Admin co-approval; consent revocation writes a new row and never deletes; the dashboard reads exclusively through `FamilyScope`.
