# Guest Mode, the Design System & One-Command Dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guest entry point into the existing onboarding journey, give `web/` its first visual layer, and make `npm run dev` take a fresh clone to a running stack.

**Architecture:** A guest is a real Supabase **anonymous** user, so `signInAnonymously()` produces the same httpOnly session cookie and the same verifiable ES256 JWT as every other sign-in — `nextStep()`, the Express auth middleware and `registerUser` are all untouched, and the guest reaches `/consent` through the existing 403 `REGISTRATION_REQUIRED` seam. The visual layer is Tailwind v4 with a semantic `@theme` token block, proven against Turbopack from a production build before any screen is styled. The dev script is an idempotent bash preflight that ends by `exec`ing both apps under `concurrently`.

**Tech Stack:** Next 16.3.1, React 19.2.8, `@supabase/ssr` 0.12.4, `next-intl` 4.13.6, Tailwind CSS v4 + `@tailwindcss/postcss`, `concurrently`, Jest via `next/jest`, bash + Docker + Supabase CLI.

**Spec:** `docs/specs/2026-08-17-guest-mode-design-system-design.md`

## Global Constraints

- **`createBrowserClient` is forbidden**, and `eslint.config.mjs` already bans it. Every Supabase call goes through `createSupabaseServerClient()` in `web/src/supabase/server.ts`. A cookie written by JavaScript can never be httpOnly, and the failure is silent.
- **The session cookie must carry `HttpOnly`.** The guest route writes its session through the same cookie adapter as every other route; it must not touch cookie options itself.
- **A guest passes the consent screen like every other user.** `registerBody.refine()` in `api/src/routes/auth.ts` refuses a registration without `health_data` consent, and DPDP requires consent captured at collection. Never auto-consent on a guest's behalf.
- **Guest-ness comes from the session's `is_anonymous`**, never from a query parameter, a prop passed from the client, or a database column.
- **`nextStep()` must not change.** A guest reaching `/consent` through the existing 403 seam is the design. If a task seems to need a branch there, the task is wrong.
- **`#15803D` is the only colour that carries white text.** White on `#16A34A` measures 3.30:1 and fails WCAG AA for normal text; `#15803D` measures 5.02:1. `--color-accent-bright` and `--color-accent-glow` are for large accents and non-text only.
- **Design tokens are semantic.** Components reference `--color-accent` / `bg-accent`, never `--color-green-600`. A repaint must stay a one-file edit.
- **17px base body size, 48×48px minimum interactive target, visible focus rings, one primary action per screen.** These are requirements, not preferences — "a parent understands it" is the brief.
- **`/home` shows honest empty states.** Never render an invented step count, streak or workout.
- **Tailwind is proven by `next build && next start` plus a real request** (Task 6) before any screen is styled. A green `next dev` is not evidence — this repo has already been bitten by exactly that with Serwist.
- **Every user-visible string goes through `next-intl`.** New keys land in `web/messages/en.json`. `hi.json` stays `{}`; Hindi copy is out of scope.
- **Jest test placement is load-bearing.** `jest.config.mjs` runs two projects: `jsdom` matches **`<rootDir>/src/**/*.test.tsx` only**, and `node` matches `<rootDir>/src/**/*.test.ts` and `<rootDir>/app/**/*.test.ts`. A component test written as `app/**/*.test.tsx` matches **neither project and silently never runs**. Component tests go under `web/src/`; route-handler and server-component tests go beside their route with a `@jest-environment node` docblock.
- Node `>=22`. Prettier and ESLint are enforced repo-wide. Conventional Commits.
- Run `npm run lint:web && npm run typecheck:web && npm run test:web` before each commit that touches `web/`.

## Decisions this plan makes (not in the spec)

| Decision                                                                   | Rationale                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest mode ships before the design system**                              | Otherwise the sign-in, consent and home screens get styled in phase 2 and then structurally rewritten in phase 3 to add guest affordances. Building the plumbing first means each screen is styled exactly once, against its final markup.                                    |
| **`isGuestSession()` is a shared helper in `src/onboarding/`**             | Both `/consent` and `/home` need it, and it is onboarding-journey state, not a Supabase detail. One implementation means the two screens cannot disagree about who is a guest.                                                                                                |
| **It uses `getUser()`, not `getSession()`**                                | `getSession()` reads the cookie without revalidating it. The flag is only cosmetic today, but a helper named "is this a guest" will eventually be reached for in a decision that matters, and a helper that is safe only by accident is a trap.                               |
| **`app/consent/page.tsx` splits into an async page + `ConsentClient.tsx`** | It must become a server component to read the session, and `useState` cannot live in an async component. This mirrors the `/home` split (`page.tsx` + `HomeView.tsx`) that already exists. The existing `src/__tests__/consentPage.test.tsx` is repointed at `ConsentClient`. |
| **Task 1's verification is executed scenarios, not unit tests**            | `scripts/dev.sh` is orchestration over Docker, the Supabase CLI and two long-running processes. A unit test would mock away everything the script exists to coordinate. It is verified by running it against three real starting states, each with a stated expected outcome. |
| **The dev script rewrites an env line rather than `sed`-ing it**           | Supabase keys are JWTs and base64 strings containing `.`, `/`, `-` and `_`. Every one of those is a quoting hazard in `sed`. Filtering the old line out and appending a new one has no escaping surface at all.                                                               |
| **Tailwind's exact version is pinned after install, not guessed here**     | This repo pins exact versions and verifies them against the registry (see the slice-1 plan). Task 6 installs current v4, records the resolved version, and pins it. Writing a version into this plan that nobody has verified is the mistake the spec's D5 exists to prevent. |
| **`concurrently` uses `--kill-others`**                                    | If the API dies at boot — a bad migration, a port stolen between the check and the spawn — a web server left running alone renders a site whose every call 502s. Failing both together is louder and truer.                                                                   |

---

## File Structure

| File                                             | Responsibility                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `scripts/dev.sh`                                 | **New.** Idempotent preflight, then `exec`s both apps. The one command.                                      |
| `package.json`                                   | Modified: `dev` becomes the one command; `dev:api` preserves the old behaviour; `stop` added.                |
| `web/package.json`                               | Modified: dev/start ports pinned to 3001; Tailwind devDependencies.                                          |
| `README.md`                                      | Modified: the one command replaces the six-step recipe; the anonymous sign-in flag is documented.            |
| `supabase/config.toml`                           | Modified: `enable_anonymous_sign_ins = true`.                                                                |
| `web/app/api/auth/guest/route.ts`                | **New.** `POST` → `signInAnonymously()`. The only new route handler.                                         |
| `web/src/onboarding/isGuestSession.ts`           | **New.** `isGuestSession(): Promise<boolean>` — the single source of truth for guest-ness.                   |
| `web/app/consent/page.tsx`                       | Rewritten as an async server component that resolves `isGuest`.                                              |
| `web/app/consent/ConsentClient.tsx`              | **New.** The former `page.tsx` body — submission state, error handling, routing.                             |
| `web/app/consent/ConsentForm.tsx`                | Modified: accepts `isGuest`; pre-fills the name and shows guest copy.                                        |
| `web/app/signin/page.tsx`                        | Modified: "Continue as a guest"; later, styled.                                                              |
| `web/app/home/page.tsx`, `HomeView.tsx`          | Modified: guest chip; later, the dashboard shell.                                                            |
| `web/postcss.config.mjs`                         | **New.** The `@tailwindcss/postcss` plugin.                                                                  |
| `web/app/globals.css`                            | **New.** `@import "tailwindcss"` + the `@theme` token block + base typography. The palette lives here, once. |
| `web/app/layout.tsx`                             | Modified: imports `globals.css`.                                                                             |
| `web/src/ui/Button.tsx`, `Field.tsx`             | **New.** The interactive primitives that carry the 48px and focus-ring constraints.                          |
| `web/src/ui/Card.tsx`, `Alert.tsx`, `Screen.tsx` | **New.** The layout and messaging primitives.                                                                |
| `web/messages/en.json`                           | Modified: guest copy, home shell copy, the new error code.                                                   |

Dependency order: **T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11**

Phase 1 (T1) is the command. Phase 2 (T2–T5) is guest mode, functional and unstyled. Phase 3 (T6–T11) is the visual layer over the now-final markup.

---

## Task 1: The one-command dev script

**Files:**

- Create: `scripts/dev.sh`
- Modify: `package.json` (root scripts, `concurrently` devDependency)
- Modify: `web/package.json:5-6` (pin ports)
- Modify: `README.md`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `npm run dev` (whole stack), `npm run dev:api`, `npm run dev:web`, `npm run stop`. API is always on **3000**, web always on **3001**. Later tasks assume those ports.

- [ ] **Step 1: Add `concurrently` and rewire the root scripts**

In `package.json`, change `"dev"` and add the siblings. `dev:web` and the other `*:web` scripts already exist — only `dev` changes meaning, and `dev:api` is new.

```json
{
  "scripts": {
    "dev": "bash scripts/dev.sh",
    "dev:api": "npm run dev -w api",
    "stop": "supabase stop"
  },
  "devDependencies": {
    "concurrently": "^9.2.1"
  }
}
```

Run `npm install concurrently --save-dev --workspaces=false` from the repo root, then correct the caret range above to the exact resolved version if it differs.

- [ ] **Step 2: Pin the web ports**

In `web/package.json`, so the web port stops depending on 3000 happening to be occupied:

```json
{
  "scripts": {
    "dev": "next dev -p 3001",
    "start": "next start -p 3001"
  }
}
```

- [ ] **Step 3: Write `scripts/dev.sh`**

```bash
#!/usr/bin/env bash
#
# The one command. Every step below is a no-op when it is already satisfied,
# so this is both the fresh-clone command and the everyday one — there is no
# second command with different preconditions to remember.
#
# It deliberately does NOT seed: `prisma db seed` creates real Supabase auth
# accounts and is not verified idempotent, so it stays `npm run db:seed`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT=3000
WEB_PORT=3001

say() { printf '\033[1;32m▸\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# Bash's /dev/tcp is used rather than lsof/ss/netstat: those differ across
# Linux and macOS and are not all installed by default.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

# --- 1. Docker -------------------------------------------------------------
docker info >/dev/null 2>&1 ||
  die "Docker is not running. Start Docker Desktop (or: sudo systemctl start docker) and re-run."

# --- 2. Ports --------------------------------------------------------------
# Checked before anything is started. Without this the API dies on EADDRINUSE
# and Next silently drifts to 3002, leaving a working app at an address the
# user was never told about.
for port in "$API_PORT" "$WEB_PORT"; do
  port_busy "$port" &&
    die "Port $port is already in use. Find it with 'lsof -i :$port', stop it, and re-run."
done

# --- 3. Supabase -----------------------------------------------------------
db_container() { docker ps --filter "name=supabase_db_" --format '{{.Names}}' | head -1; }

if [ -z "$(db_container)" ]; then
  say "Starting Supabase (the first run pulls images and can take a few minutes)…"
  npx supabase start
else
  say "Supabase is already running."
fi

# Waits for Postgres to ANSWER, not merely for the port to be open or for
# `supabase start` to have returned. Migrations run in the next step and fail
# confusingly against a database that is still coming up.
say "Waiting for Postgres…"
for _ in $(seq 1 90); do
  container="$(db_container)"
  if [ -n "$container" ] && docker exec "$container" pg_isready -U postgres -q 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
[ "${ready:-0}" = "1" ] || die "Postgres did not become ready within 90s. Try: npx supabase stop && npm run dev"

# --- 4. Env files ----------------------------------------------------------
if [ ! -f api/.env ]; then
  say "Creating api/.env from .env.example"
  cp .env.example api/.env
fi

if [ ! -f web/.env.local ]; then
  say "Creating web/.env.local"
  cat > web/.env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
API_BASE_URL=http://127.0.0.1:${API_PORT}
EOF
fi

# --- 5. Keys ---------------------------------------------------------------
# Copying these out of `supabase status` by hand is the step most likely to
# break a fresh clone. Both target files are gitignored (.gitignore:6-7).
read_key() {
  printf '%s' "$1" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      const key = process.argv[1];
      const value = JSON.parse(raw)[key];
      if (typeof value !== "string" || value === "") process.exit(1);
      process.stdout.write(value);
    });
  ' "$2"
}

# Only rewrites a key that is absent or empty, so a hand-edited value is never
# clobbered. The old line is filtered out and a new one appended rather than
# sed-ed: these values are JWTs full of . / - and _, every one a quoting hazard.
set_env_var() {
  local file="$1" key="$2" value="$3"
  grep -qE "^${key}=." "$file" && return 0
  grep -vE "^#? *${key}=" "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
  printf '%s=%s\n' "$key" "$value" >> "$file"
  say "Wrote ${key} into ${file}"
}

status_json="$(npx supabase status -o json)"
anon_key="$(read_key "$status_json" ANON_KEY)" ||
  die "Could not read ANON_KEY from 'supabase status -o json'. The CLI output format may have changed."
service_key="$(read_key "$status_json" SERVICE_ROLE_KEY)" ||
  die "Could not read SERVICE_ROLE_KEY from 'supabase status -o json'. The CLI output format may have changed."

set_env_var web/.env.local NEXT_PUBLIC_SUPABASE_ANON_KEY "$anon_key"
set_env_var api/.env SUPABASE_SERVICE_ROLE_KEY "$service_key"

# --- 6. Prisma client ------------------------------------------------------
if [ ! -d api/generated/prisma ]; then
  say "Generating the Prisma client…"
  npm run prisma:generate -w api
fi

# --- 7. Migrations ---------------------------------------------------------
say "Applying migrations…"
( cd api && npx prisma migrate deploy )

# --- 8. Run ----------------------------------------------------------------
say "API  → http://localhost:${API_PORT}"
say "Web  → http://localhost:${WEB_PORT}"
say "Supabase Studio → http://127.0.0.1:54323"
echo

# --kill-others: if the API dies at boot, a web server left running alone
# serves a site whose every call 502s. Failing together is louder and truer.
exec npx concurrently \
  --names "api,web" \
  --prefix-colors "green,cyan" \
  --kill-others \
  "npm run dev:api" \
  "npm run dev:web"
```

- [ ] **Step 4: Make it executable**

```bash
chmod +x scripts/dev.sh
```

- [ ] **Step 5: Verify scenario A — everything already up (the everyday case)**

With Supabase running and both env files populated:

```bash
npm run dev
```

Expected: reports "Supabase is already running", writes no keys (the values are non-empty, so `set_env_var` returns early), applies migrations as a no-op, and both apps come up with prefixed `api` / `web` logs. Then in another terminal:

```bash
curl -s localhost:3000/readyz          # {"status":"ready","checks":{"database":"up"}}
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/   # 200
```

Ctrl-C. Expected: **both** processes stop, and Supabase stays up (`docker ps` still lists `supabase_db_*`).

- [ ] **Step 6: Verify scenario B — a missing key**

```bash
cp web/.env.local /tmp/env.local.bak
sed -i 's/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*/NEXT_PUBLIC_SUPABASE_ANON_KEY=/' web/.env.local
npm run dev
```

Expected: prints `Wrote NEXT_PUBLIC_SUPABASE_ANON_KEY into web/.env.local`, and the file now holds the same key as `npx supabase status -o json`. Ctrl-C, then confirm the file has exactly one `NEXT_PUBLIC_SUPABASE_ANON_KEY` line:

```bash
grep -c NEXT_PUBLIC_SUPABASE_ANON_KEY web/.env.local   # 1
```

- [ ] **Step 7: Verify scenario C — a busy port and a stopped stack**

```bash
npm run dev:api &          # occupy 3000
npm run dev                # expect: dies with the "Port 3000 is already in use" message
kill %1
npx supabase stop && npm run dev
```

Expected for the last command: starts Supabase, waits for Postgres, applies migrations, comes up. This is the cold path, and it must succeed without a single manual step.

- [ ] **Step 8: Update the README**

Replace the "Run it locally" recipe with the one command, keep the manual steps as a "what it does for you" note, and add that `npm run db:seed` is still manual. Also correct the stale line in "Repository layout" claiming `workspaces` lists only `api` — it lists both.

````markdown
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
````

- [ ] **Step 9: Commit**

```bash
git add scripts/dev.sh package.json package-lock.json web/package.json README.md
git commit -m "feat: run the whole stack with one command

scripts/dev.sh takes a clone to a running stack: Docker check, Supabase
start, a wait for Postgres to actually answer, env files created and the
Supabase keys filled in from 'supabase status -o json', Prisma client,
migrations, then both apps under concurrently.

Every step no-ops when already satisfied, so this is the everyday command
too rather than a separate setup path that rots. Copying ANON_KEY and
SERVICE_ROLE_KEY by hand was the step most likely to break a fresh clone
and is the one the README could not make idempotent.

Web's port is pinned to 3001 so it no longer depends on 3000 happening to
be occupied. dev:api preserves what 'npm run dev' used to mean."
```

---

## Task 2: Anonymous sign-in and `POST /api/auth/guest`

**Files:**

- Modify: `supabase/config.toml:178`
- Create: `web/app/api/auth/guest/route.ts`
- Create: `web/app/api/auth/__tests__/guest.test.ts`
- Modify: `README.md` (the per-environment flag)

**Interfaces:**

- Consumes: `createSupabaseServerClient()` from `web/src/supabase/server.ts`.
- Produces: `POST /api/auth/guest` → `200 { authenticated: true }` on success, `502 { error: { code: "GUEST_SIGNIN_FAILED" } }` on failure. Sets the session cookie as a side effect. Task 3 calls it.

- [ ] **Step 1: Enable anonymous sign-ins**

`supabase/config.toml:178`:

```toml
enable_anonymous_sign_ins = true
```

Config changes need a restart to take effect:

```bash
npx supabase stop && npx supabase start
```

- [ ] **Step 2: Write the failing test**

Create `web/app/api/auth/__tests__/guest.test.ts`. It mirrors `verify.test.ts`, including the point that the `httpOnly: true` asserted here comes from this file's own stub — what it proves is that the route lets the client's cookie write reach the adapter unmodified.

```ts
/**
 * @jest-environment node
 */
const setAllCalls: { name: string; value: string; options: Record<string, unknown> }[] = [];

jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../guest/route";

function stubClient(result: { error: { message: string } | null }) {
  return {
    auth: {
      signInAnonymously: jest.fn(() => {
        if (result.error === null) {
          // Mimic @supabase/ssr writing the session through the cookie adapter.
          setAllCalls.push({
            name: "sb-access-token",
            value: "token-value",
            options: { httpOnly: true, sameSite: "lax", path: "/" },
          });
        }
        return Promise.resolve(result);
      }),
    },
  };
}

beforeEach(() => {
  setAllCalls.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/auth/guest", () => {
  it("returns 200 when the anonymous sign-in succeeds", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it("lets the client's cookie write proceed untouched", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    await POST();

    expect(setAllCalls).toHaveLength(1);
    expect(setAllCalls[0]?.options.httpOnly).toBe(true);
  });

  // The likely real-world failure: the config flip has not been applied to
  // this environment. It must be a clean envelope the sign-in screen can
  // render, not a crash.
  it("returns a 502 envelope when anonymous sign-ins are disabled", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Anonymous sign-ins are disabled" } }),
    );

    const response = await POST();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "GUEST_SIGNIN_FAILED" } });
  });

  // The reason is ours, not the caller's. It goes to the log only.
  it("never returns the upstream reason", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Anonymous sign-ins are disabled" } }),
    );

    const body = JSON.stringify(await (await POST()).json());

    expect(body).not.toContain("disabled");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:web -- guest`
Expected: FAIL — `Cannot find module '../guest/route'`.

- [ ] **Step 4: Write the route**

Create `web/app/api/auth/guest/route.ts`:

```ts
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Signs the caller in as an anonymous Supabase user.
 *
 * The guest gets a real `auth.users` row and a real ES256 JWT, which is the
 * entire point: `users.auth_user_id` is a NOT NULL foreign key into
 * `auth.users`, and the API resolves every request through a verified token.
 * A synthetic guest session would need holes in both. This needs neither —
 * nothing downstream of here knows or cares that the sign-in was anonymous.
 *
 * There is no request body, so there is nothing to validate. The caller then
 * follows exactly the path the OTP flow does: GET /api/me, which answers 403
 * REGISTRATION_REQUIRED, which `nextStep` routes to /consent. A guest is a
 * user who signed in differently, not a user with a different journey.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInAnonymously();

  if (error) {
    // Most likely `enable_anonymous_sign_ins` is false in this environment.
    // The reason is logged and never returned — same rule as /api/auth/otp.
    console.error("guest sign-in failed", { reason: error.message });
    return NextResponse.json({ error: { code: "GUEST_SIGNIN_FAILED" } }, { status: 502 });
  }

  // The session cookie was written by the client's cookie adapter, which
  // forces httpOnly. Nothing about the session is returned in the body.
  return NextResponse.json({ authenticated: true });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:web -- guest`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify against the real Supabase**

With the stack running (`npm run dev`):

```bash
curl -s -i -X POST localhost:3001/api/auth/guest | head -20
```

Expected: `HTTP/1.1 200`, a body of `{"authenticated":true}`, and one or more `set-cookie` headers containing `HttpOnly`. If it returns 502, the config flip in Step 1 did not take — re-run `npx supabase stop && npx supabase start`.

- [ ] **Step 7: Document the flag in the README**

Under the Authentication section:

```markdown
**Guest sign-in** requires `enable_anonymous_sign_ins = true` — set in
`supabase/config.toml` for local development, and on the Auth settings page of
the dashboard for a hosted project. It is per-environment: an environment
without it answers `POST /api/auth/guest` with a 502 `GUEST_SIGNIN_FAILED`
rather than failing at boot.

An anonymous user is a real `auth.users` row, so a guest is a normal user
everywhere downstream — same JWT verification, same `users` row, same consent
record. Claiming the account later (`updateUser`/`linkIdentity`) keeps the same
`auth.users.id`, so nothing logged as a guest is lost.

Anonymous accounts accumulate and are not yet cleaned up. Because
`users.auth_user_id` is `ON DELETE RESTRICT`, removing one means soft-deleting
or anonymising the domain `users` row **first**, then deleting the auth account.
```

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml web/app/api/auth/guest web/app/api/auth/__tests__/guest.test.ts README.md
git commit -m "feat: add anonymous guest sign-in

A guest is a real Supabase anonymous user, so the session cookie, the
ES256 token, the auth_user_id foreign key and the API's auth middleware
all work untouched. POST /api/auth/guest is the only new surface; the
caller then follows the ordinary path through /api/me and the existing
403 REGISTRATION_REQUIRED seam to /consent.

A disabled flag in some environment surfaces as a 502 GUEST_SIGNIN_FAILED
envelope the sign-in screen can render, not a crash."
```

---

## Task 3: "Continue as a guest" on the sign-in screen

**Files:**

- Modify: `web/app/signin/page.tsx`
- Modify: `web/messages/en.json`
- Create: `web/src/__tests__/signinGuest.test.tsx`

**Interfaces:**

- Consumes: `POST /api/auth/guest` (Task 2); `nextStep(status, body)` and `readJsonBody(response)`, both unchanged.
- Produces: nothing later tasks import. Task 10 restyles this screen.

- [ ] **Step 1: Add the copy**

In `web/messages/en.json`, add `guest` to `signin` and the new code to `errors`:

```json
{
  "signin": {
    "guest": "Continue as a guest"
  },
  "errors": {
    "GUEST_SIGNIN_FAILED": "We couldn't start a guest session. Please try again in a moment."
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `web/src/__tests__/signinGuest.test.tsx` — under `src/`, as a `.tsx`, or the jsdom project will not match it.

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import messages from "../../messages/en.json";
import SignInPage from "../../app/signin/page";

const originalFetch = global.fetch;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SignInPage />
    </NextIntlClientProvider>,
  );
}

function guestButton() {
  return screen.getByRole("button", { name: messages.signin.guest });
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("continue as a guest", () => {
  // The whole design in one assertion: a guest goes through the SAME 403
  // REGISTRATION_REQUIRED seam as everyone else, so nextStep needs no branch.
  it("signs in and routes to consent through the registration seam", async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input) === "/api/auth/guest"
          ? response(200, { authenticated: true })
          : response(403, { error: { code: "REGISTRATION_REQUIRED" } }),
      ),
    ) as unknown as typeof fetch;

    renderPage();
    fireEvent.click(guestButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/consent"));
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/guest", { method: "POST" });
  });

  it("sends an already-registered guest straight home", async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input) === "/api/auth/guest"
          ? response(200, { authenticated: true })
          : response(200, { id: "u1", display_name: "Guest", family: null }),
      ),
    ) as unknown as typeof fetch;

    renderPage();
    fireEvent.click(guestButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/home"));
  });

  it("shows an error and does not route when the guest session cannot start", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(502, { error: { code: "GUEST_SIGNIN_FAILED" } })),
    ) as unknown as typeof fetch;

    renderPage();
    fireEvent.click(guestButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.GUEST_SIGNIN_FAILED),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:web -- signinGuest`
Expected: FAIL — no button matching "Continue as a guest".

- [ ] **Step 4: Add the handler and the button**

In `web/app/signin/page.tsx`, add alongside `verifyCode`:

```tsx
async function continueAsGuest() {
  const response = await fetch("/api/auth/guest", { method: "POST" });

  if (!response.ok) {
    setError("GUEST_SIGNIN_FAILED");
    return;
  }

  // Deliberately identical to what verifyCode does after a successful
  // verification. A guest is a user who signed in differently, so the
  // journey after sign-in is the same journey, resolved by the same call.
  const me = await fetch("/api/me");
  router.push(nextStep(me.status, await readJsonBody(me)));
}
```

And below the Google link:

```tsx
<button
  type="button"
  onClick={() => {
    void continueAsGuest();
  }}
>
  {t("guest")}
</button>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:web -- signinGuest`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole web suite**

Run: `npm run lint:web && npm run typecheck:web && npm run test:web`
Expected: all green. Nothing else touches this screen yet.

- [ ] **Step 7: Commit**

```bash
git add web/app/signin/page.tsx web/messages/en.json web/src/__tests__/signinGuest.test.tsx
git commit -m "feat: offer a guest sign-in on the sign-in screen

The handler is deliberately the same three lines verifyCode runs after a
successful OTP: call /api/me, hand the status to nextStep, push. A guest
reaches /consent through the existing 403 REGISTRATION_REQUIRED seam, so
nextStep needs no branch and the test asserts exactly that."
```

---

## Task 4: `isGuestSession`, the consent server wrapper, and guest copy

**Files:**

- Create: `web/src/onboarding/isGuestSession.ts`
- Create: `web/src/onboarding/__tests__/isGuestSession.test.ts`
- Create: `web/app/consent/ConsentClient.tsx` (the current `page.tsx` body)
- Rewrite: `web/app/consent/page.tsx`
- Create: `web/app/consent/__tests__/page.test.ts`
- Modify: `web/app/consent/ConsentForm.tsx`
- Modify: `web/src/__tests__/consentPage.test.tsx` (repoint at `ConsentClient`)
- Modify: `web/src/__tests__/consent.test.tsx` (only if it renders `ConsentForm` without the new prop)
- Modify: `web/messages/en.json`

**Interfaces:**

- Consumes: `createSupabaseServerClient()`.
- Produces: `isGuestSession(): Promise<boolean>` — used by Task 5. `ConsentForm` gains `isGuest?: boolean`. `ConsentClient` is the client half of `/consent`.

- [ ] **Step 1: Write the failing test for `isGuestSession`**

Create `web/src/onboarding/__tests__/isGuestSession.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("../../supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

import { createSupabaseServerClient } from "../../supabase/server";
import { isGuestSession } from "../isGuestSession";

function withUser(user: unknown) {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user }, error: null })) },
  });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isGuestSession", () => {
  it("is true for an anonymous user", async () => {
    withUser({ id: "u1", is_anonymous: true });
    expect(await isGuestSession()).toBe(true);
  });

  it("is false for a normal user", async () => {
    withUser({ id: "u1", is_anonymous: false });
    expect(await isGuestSession()).toBe(false);
  });

  // Supabase omits the claim entirely for accounts created before anonymous
  // sign-in existed. Absent must mean "not a guest", never undefined.
  it("is false when the claim is absent", async () => {
    withUser({ id: "u1" });
    expect(await isGuestSession()).toBe(false);
  });

  it("is false when there is no session", async () => {
    withUser(null);
    expect(await isGuestSession()).toBe(false);
  });

  // This decides a chip and a pre-filled field. It must never be the reason
  // a page fails to render.
  it("is false when the session cannot be read", async () => {
    (createSupabaseServerClient as jest.Mock).mockRejectedValue(
      new Error("Invalid web environment"),
    );
    expect(await isGuestSession()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:web -- isGuestSession`
Expected: FAIL — `Cannot find module '../isGuestSession'`.

- [ ] **Step 3: Write `isGuestSession`**

Create `web/src/onboarding/isGuestSession.ts`:

```ts
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Whether the current session belongs to an anonymous ("guest") user.
 *
 * `getUser()` rather than `getSession()`: getSession reads the cookie without
 * revalidating it. Today this only decides a chip and a pre-filled name, so
 * either would do — but a helper named "is this a guest" will eventually be
 * reached for in a decision that matters, and one that is safe only by
 * accident is a trap. The cost is a cached round trip on two screens.
 *
 * Never throws. Every failure — no session, an unreadable session, a missing
 * env var — answers `false`, because this must never be the reason a page
 * fails to render. `is_anonymous` is also absent for accounts created before
 * anonymous sign-in existed, which the `=== true` handles.
 */
export async function isGuestSession(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.is_anonymous === true;
  } catch (reason) {
    console.error("guest status could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return false;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:web -- isGuestSession`
Expected: PASS, 5 tests.

- [ ] **Step 5: Split `/consent` into a server page and a client component**

Move the entire current body of `web/app/consent/page.tsx` into a new `web/app/consent/ConsentClient.tsx`, changing only the declaration and adding the prop:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCode } from "../../src/api/errorCode";
import { readJsonBody } from "../../src/api/readJsonBody";
import { ConsentForm, type ConsentSubmission } from "./ConsentForm";

/**
 * Bumped whenever the consent copy in `messages.consent` changes. It is stored
 * with the consent record so an audit can reproduce exactly what was agreed to,
 * which is why the version submitted must be the one whose copy is rendered.
 */
const POLICY_VERSION = "2026-08-15";

export function ConsentClient({ isGuest = false }: { isGuest?: boolean }) {
  // ...body unchanged from the current page.tsx...
```

and pass the flag through at the bottom:

```tsx
  return (
    <ConsentForm
      onSubmit={(submission) => {
        void submit(submission);
      }}
      policyVersion={POLICY_VERSION}
      submitting={submitting}
      isGuest={isGuest}
      {...(error !== undefined && { error })}
    />
  );
}
```

- [ ] **Step 6: Repoint the existing consent page test**

`web/src/__tests__/consentPage.test.tsx` currently imports `../../app/consent/page` and renders it directly — which stops working the moment the page is async. Change the import and the render:

```tsx
import { ConsentClient } from "../../app/consent/ConsentClient";
```

```tsx
function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentClient />
    </NextIntlClientProvider>,
  );
}
```

Nothing else in that file changes — every existing assertion is about submission behaviour, which has moved verbatim.

- [ ] **Step 7: Run it to confirm the split broke nothing**

Run: `npm run test:web -- consentPage`
Expected: PASS, with the same test count as before the split.

- [ ] **Step 8: Write the failing test for the server wrapper**

Create `web/app/consent/__tests__/page.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("../../../src/onboarding/isGuestSession", () => ({ isGuestSession: jest.fn() }));

import { isGuestSession } from "../../../src/onboarding/isGuestSession";
import { ConsentClient } from "../ConsentClient";
import ConsentPage from "../page";

describe("/consent", () => {
  it("tells the form the caller is a guest", async () => {
    (isGuestSession as jest.Mock).mockResolvedValue(true);

    const page = await ConsentPage();

    expect(page.type).toBe(ConsentClient);
    expect(page.props.isGuest).toBe(true);
  });

  it("tells the form the caller is not a guest", async () => {
    (isGuestSession as jest.Mock).mockResolvedValue(false);

    const page = await ConsentPage();

    expect(page.props.isGuest).toBe(false);
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npm run test:web -- consent/__tests__/page`
Expected: FAIL — the page is not async and returns different markup.

- [ ] **Step 10: Write the server wrapper**

Replace `web/app/consent/page.tsx` entirely:

```tsx
import { isGuestSession } from "../../src/onboarding/isGuestSession";
import { ConsentClient } from "./ConsentClient";

/**
 * Resolves guest status server-side, for the same reason `/home` resolves the
 * onboarding step server-side: the answer comes from the session, and the
 * session is only trustworthy on the server. A `?guest=1` parameter would be
 * spoofable, and a prop from the client would be worse.
 *
 * `page.tsx` has to be async to do that, and `useState` cannot live in an
 * async component — hence the split into `ConsentClient`, mirroring the
 * `page.tsx` + `HomeView.tsx` pattern `/home` already uses.
 */
export default async function ConsentPage() {
  return <ConsentClient isGuest={await isGuestSession()} />;
}
```

- [ ] **Step 11: Run it to verify it passes**

Run: `npm run test:web -- consent/__tests__/page`
Expected: PASS, 2 tests.

- [ ] **Step 12: Add the guest copy**

In `web/messages/en.json`, add to `consent`:

```json
{
  "consent": {
    "guestName": "Guest",
    "guestBody": "You're exploring as a guest. Everything you log is saved, and you can add an email later to keep it."
  }
}
```

The claim in `guestBody` is true precisely because a guest is a real anonymous user: `updateUser`/`linkIdentity` preserves `auth.users.id`, so the domain row and its records survive. Do not soften it to "may be lost" and do not add a button — claiming is not built yet.

- [ ] **Step 13: Write the failing test for the form's guest behaviour**

Append to `web/src/__tests__/consent.test.tsx` (or create it in the same style if it does not already render `ConsentForm` directly):

```tsx
describe("guest consent", () => {
  it("pre-fills the name and explains guest mode", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" isGuest />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText(messages.consent.nameLabel)).toHaveValue(
      messages.consent.guestName,
    );
    expect(screen.getByText(messages.consent.guestBody)).toBeInTheDocument();
  });

  it("shows neither for a normal sign-in", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText(messages.consent.nameLabel)).toHaveValue("");
    expect(screen.queryByText(messages.consent.guestBody)).not.toBeInTheDocument();
  });

  // The consent itself is never pre-granted. A pre-ticked box is not consent,
  // and the API refuses a registration without health_data anyway.
  it("never pre-agrees the health-data consent for a guest", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" isGuest />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("checkbox", { name: messages.consent.healthDataLabel }),
    ).not.toBeChecked();
  });
});
```

- [ ] **Step 14: Run it to verify it fails**

Run: `npm run test:web -- consent.test`
Expected: FAIL — the name field is empty and the guest body is absent.

- [ ] **Step 15: Teach `ConsentForm` about guests**

In `web/app/consent/ConsentForm.tsx`, add the prop, seed the state, and render the copy:

```tsx
export function ConsentForm({
  onSubmit,
  policyVersion,
  error,
  submitting = false,
  isGuest = false,
}: {
  onSubmit: (submission: ConsentSubmission) => void;
  policyVersion: string;
  error?: string;
  /** True while a registration this form started is still in flight. */
  submitting?: boolean;
  /** True when the session belongs to an anonymous user. */
  isGuest?: boolean;
}) {
  const t = useTranslations("consent");
  const tError = useTranslations("errors");
  // A guest asked for one tap, not a form. The name is seeded rather than
  // forced — it is an ordinary editable field, and the consent below it is
  // emphatically NOT pre-granted: a pre-ticked box is not consent.
  const [name, setName] = useState(isGuest ? t("guestName") : "");
  const [agreed, setAgreed] = useState(false);
```

and after the existing body paragraph:

```tsx
{
  isGuest && <p>{t("guestBody")}</p>;
}
```

- [ ] **Step 16: Run the full web suite**

Run: `npm run lint:web && npm run typecheck:web && npm run test:web`
Expected: all green.

- [ ] **Step 17: Verify the journey by hand**

With `npm run dev` running, open http://localhost:3001/signin, click "Continue as a guest".
Expected: you land on `/consent`, the name field reads "Guest", the guest explanation is present, and the checkbox is **unticked**. Tick it, continue, and you reach `/home`.

- [ ] **Step 18: Commit**

```bash
git add web/src/onboarding/isGuestSession.ts web/src/onboarding/__tests__ web/app/consent web/src/__tests__ web/messages/en.json
git commit -m "feat: recognise a guest on the consent screen

isGuestSession() reads is_anonymous from the session server-side, via
getUser rather than getSession — the flag only decides a chip and a
pre-filled name today, but a helper named 'is this a guest' will be
reached for in a decision that matters, and one safe only by accident is
a trap. It never throws; every failure answers false.

/consent becomes an async server page over a new ConsentClient, mirroring
the page.tsx + HomeView.tsx split /home already uses, because useState
cannot live in an async component.

The name is seeded for a guest; the consent checkbox is not. A pre-ticked
box is not consent."
```

---

## Task 5: The guest chip on `/home`

**Files:**

- Modify: `web/app/home/page.tsx`
- Modify: `web/app/home/HomeView.tsx`
- Modify: `web/app/home/__tests__/page.test.ts`
- Modify: `web/messages/en.json`
- Create: `web/src/__tests__/homeView.test.tsx`

**Interfaces:**

- Consumes: `isGuestSession()` (Task 4), `currentStep()` (unchanged).
- Produces: `HomeView` gains `isGuest?: boolean`. Task 11 rebuilds this view's markup around the same prop.

- [ ] **Step 1: Add the copy**

In `web/messages/en.json`, add to `home`:

```json
{
  "home": {
    "guestChip": "Guest",
    "guestNote": "You're exploring as a guest. Add an email later to keep what you log."
  }
}
```

- [ ] **Step 2: Write the failing test for the view**

Create `web/src/__tests__/homeView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { HomeView } from "../../app/home/HomeView";

function renderView(props: { isGuest?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeView {...props} />
    </NextIntlClientProvider>,
  );
}

describe("HomeView", () => {
  it("marks a guest session", () => {
    renderView({ isGuest: true });

    expect(screen.getByText(messages.home.guestChip)).toBeInTheDocument();
    expect(screen.getByText(messages.home.guestNote)).toBeInTheDocument();
  });

  it("shows nothing about guests for a normal user", () => {
    renderView();

    expect(screen.queryByText(messages.home.guestChip)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.home.guestNote)).not.toBeInTheDocument();
  });

  // Claiming an account is not built. A button that does nothing is worse
  // than no button, so there must not be one.
  it("offers no claim action, because claiming is not built yet", () => {
    renderView({ isGuest: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:web -- homeView`
Expected: FAIL — no guest chip.

- [ ] **Step 4: Add the prop to `HomeView`**

```tsx
import { useTranslations } from "next-intl";

/**
 * The home screen itself. It is a separate component because `page.tsx` has to
 * be `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 */
export function HomeView({ isGuest = false }: { isGuest?: boolean }) {
  const t = useTranslations("home");

  return (
    <main>
      {/*
        A chip and a sentence, deliberately not a "claim your account" button:
        claiming is not built. The sentence can promise that nothing is lost
        because a guest is a real anonymous user — linking an identity later
        keeps the same auth.users.id, and therefore the same domain row.
      */}
      {isGuest && (
        <>
          <span>{t("guestChip")}</span>
          <p>{t("guestNote")}</p>
        </>
      )}

      <h1>{t("title")}</h1>
      <p>{t("noFamily")}</p>
    </main>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:web -- homeView`
Expected: PASS, 3 tests.

- [ ] **Step 6: Resolve the flag in the page**

In `web/app/home/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
import { isGuestSession } from "../../src/onboarding/isGuestSession";
import { HomeView } from "./HomeView";

export default async function HomePage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  // Resolved only after the guard has decided this request belongs here, so a
  // redirected caller never pays for it.
  return <HomeView isGuest={await isGuestSession()} />;
}
```

- [ ] **Step 7: Extend the existing page test**

`web/app/home/__tests__/page.test.ts` now exercises a page that also calls `isGuestSession`. Add the mock at the top, beside the others:

```ts
jest.mock("../../../src/onboarding/isGuestSession", () => ({
  isGuestSession: jest.fn(() => Promise.resolve(false)),
}));
```

and add a case to the `describe`:

```ts
it("marks the view as a guest when the session is anonymous", async () => {
  signedIn();
  mockCallApi.mockResolvedValue(json({ id: "u1", display_name: "Guest", family: null }, 200));
  (isGuestSession as jest.Mock).mockResolvedValue(true);

  const page = await HomePage();

  expect(page.props.isGuest).toBe(true);
});
```

with the matching import:

```ts
import { isGuestSession } from "../../../src/onboarding/isGuestSession";
```

- [ ] **Step 8: Run the full web suite**

Run: `npm run lint:web && npm run typecheck:web && npm run test:web`
Expected: all green, including every pre-existing `/home` redirect test.

- [ ] **Step 9: Commit**

```bash
git add web/app/home web/src/__tests__/homeView.test.tsx web/messages/en.json
git commit -m "feat: mark a guest session on the home screen

A chip and a sentence, and deliberately no claim button — claiming is not
built, and a button that does nothing is worse than none. A test asserts
the absence so it cannot be added by accident.

The flag is resolved after the onboarding guard has decided the request
belongs here, so a redirected caller never pays for the lookup."
```

---

## Task 6: Tailwind v4 and the design tokens, proven from a production build

**Files:**

- Modify: `web/package.json` (devDependencies)
- Create: `web/postcss.config.mjs`
- Create: `web/app/globals.css`
- Modify: `web/app/layout.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: the utility classes every later task uses — `bg-canvas`, `text-ink`, `bg-accent`, `text-muted`, `border-line`, `rounded-card`, `shadow-card`. **These names are the contract for Tasks 7–11.**

- [ ] **Step 1: Install Tailwind v4**

```bash
npm install -D tailwindcss @tailwindcss/postcss -w web
```

Then read the resolved versions out of `web/package.json` and pin both to exact values (no caret), matching how this repo pins `next`, `react` and the Serwist packages. Record the versions in the commit message.

- [ ] **Step 2: Configure PostCSS**

Create `web/postcss.config.mjs`. Tailwind v4 ships its PostCSS integration as a separate package; there is no `tailwind.config.js` and no `content` array — v4 discovers sources itself.

```js
/**
 * Tailwind v4's PostCSS plugin. v4 has no JS config file and no `content`
 * globs — the theme lives in `app/globals.css` under `@theme`, and sources are
 * discovered automatically. Next runs this under Turbopack.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 3: Write the token layer**

Create `web/app/globals.css`. **This file is the palette.** Every colour in the app resolves here, so a repaint is a one-file edit.

```css
@import "tailwindcss";

/*
 * The palette, once. Names are SEMANTIC — `accent`, not `green-600` — so that
 * changing the colour scheme never means touching a component.
 *
 * The contrast figures are measured, not estimated, and they are why there are
 * three accents rather than one:
 *
 *   ink on canvas ............ 11.3:1  passes AAA
 *   white on accent .......... 5.02:1  passes AA
 *   white on accent-bright ... 3.30:1  FAILS AA for normal text
 *
 * So `accent` is the only colour that ever carries white text. `accent-bright`
 * and `accent-glow` are for large accents, progress fills and non-text only.
 */
@theme {
  --color-ink: #0b3d2e;
  --color-canvas: #f4f7f2;
  --color-surface: #ffffff;
  --color-accent: #15803d;
  --color-accent-bright: #16a34a;
  --color-accent-glow: #4ade80;
  --color-muted: #6b7f73;
  --color-line: #dde7de;

  --radius-card: 1rem;
  --shadow-card: 0 1px 2px rgb(11 61 46 / 0.04), 0 8px 24px -12px rgb(11 61 46 / 0.18);
}

/*
 * 17px base, not the browser's 16px and emphatically not 14px. "A parent
 * understands it at a glance" is a requirement, and the single most effective
 * thing serving it is text that is comfortably large by default.
 */
:root {
  font-size: 17px;
}

body {
  background-color: var(--color-canvas);
  color: var(--color-ink);
  -webkit-font-smoothing: antialiased;
}

/*
 * Never `outline: none`. Keyboard and switch users lose the ability to tell
 * where they are, and it is invisible to anyone testing with a mouse.
 */
:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Import it in the layout**

At the top of `web/app/layout.tsx`, above the existing imports:

```tsx
import "./globals.css";
```

`next/jest` stubs CSS imports, so this does not affect the test suites.

- [ ] **Step 5: Add a temporary proof element**

In `web/app/page.tsx`, temporarily give the heading a token-driven class so the build has something unambiguous to prove:

```tsx
<h1 className="bg-accent text-surface rounded-card p-4">{t("title")}</h1>
```

- [ ] **Step 6: Prove it from a production build**

This is the step the spec exists to force. A green `next dev` proves nothing — Serwist #360 was a runtime failure that only `next build && next start` plus a real request exposed.

```bash
npm run build -w web
npm run start -w web &
sleep 4
# The class must be in the served HTML...
curl -s localhost:3001/ | grep -o 'bg-accent[^"]*'
# ...and the generated stylesheet must contain the token, proving @theme compiled.
css=$(curl -s localhost:3001/ | grep -o '/_next/static/css/[^"]*\.css' | head -1)
curl -s "localhost:3001${css}" | grep -o '#15803d'
# The service worker must still be served — Tailwind must not have broken precaching.
curl -s -o /dev/null -w 'sw:%{http_code}\n' localhost:3001/serwist/sw.js
kill %1
```

Expected: the class appears, `#15803d` appears in the CSS, and the worker returns `200`.

**If any of these fail, stop and report.** Do not work around it — the spec's D5 says the fallback is a decision, not an improvisation.

- [ ] **Step 7: Remove the proof element**

Revert the `className` added in Step 5. `web/app/page.tsx` returns to its previous markup; Task 9 styles it properly.

- [ ] **Step 8: Run the web suite**

Run: `npm run lint:web && npm run typecheck:web && npm run test:web`
Expected: all green — the CSS import must not disturb Jest.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json package-lock.json web/postcss.config.mjs web/app/globals.css web/app/layout.tsx
git commit -m "build: add Tailwind v4 and the design tokens

Proven the way this repo learned to prove frontend integrations: next
build && next start, then a real request asserting the utility class is in
the HTML, #15803d is in the generated CSS, and /serwist/sw.js still
answers 200. A green dev server is not evidence.

Tokens are semantic (accent, canvas, ink), so a repaint is a one-file
edit. Three accents rather than one because white on #16A34A measures
3.30:1 and fails AA for text, while #15803D measures 5.02:1 — so only
--color-accent ever carries white text."
```

---

## Task 7: The `Button` and `Field` primitives

**Files:**

- Create: `web/src/ui/Button.tsx`
- Create: `web/src/ui/Field.tsx`
- Create: `web/src/ui/__tests__/Button.test.tsx`
- Create: `web/src/ui/__tests__/Field.test.tsx`

**Interfaces:**

- Consumes: the token utilities from Task 6.
- Produces:
  - `<Button variant?: "primary" | "secondary" | "ghost", type?, disabled?, onClick?, children>` — renders `<button>`, defaults `variant="primary"` and `type="button"`.
  - `<Field label: string, value: string, onChange: (value: string) => void, type?: string, maxLength?: number, inputMode?: string>` — renders a `<label>` wrapping its `<input>`, so `getByLabelText` finds it.
  - Tasks 9–11 use only these two for every interactive element.

- [ ] **Step 1: Write the failing tests**

Create `web/src/ui/__tests__/Button.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "../Button";

describe("Button", () => {
  it("renders a button that is not a submit by default", () => {
    render(<Button>Start</Button>);
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("type", "button");
  });

  it("calls onClick", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Start</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Start
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  // The 48px floor is a requirement, not a preference: this app is used by
  // parents and grandparents, and a 32px target is a miss for a lot of people.
  it("meets the minimum touch target on every variant", () => {
    const { rerender } = render(<Button>Start</Button>);
    for (const variant of ["primary", "secondary", "ghost"] as const) {
      rerender(<Button variant={variant}>Start</Button>);
      expect(screen.getByRole("button", { name: "Start" }).className).toContain("min-h-12");
    }
  });

  // Only --color-accent passes AA against white text (5.02:1). If a variant
  // ever renders white on accent-bright (3.30:1), that is a real failure.
  it("never puts white text on the bright accent", () => {
    render(<Button>Start</Button>);
    const className = screen.getByRole("button", { name: "Start" }).className;
    expect(className).not.toContain("bg-accent-bright");
  });
});
```

Create `web/src/ui/__tests__/Field.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

import { Field } from "../Field";

describe("Field", () => {
  it("associates its label with its input", () => {
    render(<Field label="Phone number" value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
  });

  it("reports the value, not the event", () => {
    const onChange = jest.fn();
    render(<Field label="Phone number" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+9112345" } });

    expect(onChange).toHaveBeenCalledWith("+9112345");
  });

  it("honours maxLength", () => {
    render(<Field label="Name" value="" onChange={jest.fn()} maxLength={120} />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("maxlength", "120");
  });

  it("meets the minimum touch target", () => {
    render(<Field label="Name" value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText("Name").className).toContain("min-h-12");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:web -- src/ui`
Expected: FAIL — `Cannot find module '../Button'`.

- [ ] **Step 3: Write `Button`**

Create `web/src/ui/Button.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * `min-h-12` is 48px and is not negotiable — it is the documented minimum
 * touch target, and this app is opened by parents and grandparents.
 *
 * Only `primary` carries white text, and only ever on `bg-accent` (#15803D,
 * 5.02:1). `bg-accent-bright` (#16A34A) measures 3.30:1 against white and
 * fails AA for normal text, so it never appears here.
 */
const VARIANTS = {
  primary: "bg-accent text-surface hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas",
  ghost: "bg-transparent text-accent hover:bg-canvas",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      {...(onClick !== undefined && { onClick })}
      className={`min-h-12 w-full rounded-card px-6 text-[1.0625rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Write `Field`**

Create `web/src/ui/Field.tsx`:

```tsx
/**
 * The label WRAPS the input rather than pointing at it with `htmlFor`. That is
 * deliberate: it needs no generated id, it cannot become mismatched, and
 * `getByLabelText` finds it either way — which is how every existing test in
 * this codebase locates a field.
 *
 * `onChange` hands back the value, not the event. Callers store strings; making
 * each one reach into `event.target.value` is repetition with a typo in it.
 */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
  inputMode?: "text" | "tel" | "email" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        {...(maxLength !== undefined && { maxLength })}
        {...(inputMode !== undefined && { inputMode })}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-card border border-line bg-surface px-4 text-[1.0625rem] text-ink"
      />
    </label>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:web -- src/ui`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui
git commit -m "feat: add the Button and Field primitives

Both carry the 48px minimum touch target in their own class list, and a
test asserts it on every Button variant — the constraint lives with the
component rather than in a style guide nobody re-reads.

A test also asserts no variant puts white text on --color-accent-bright,
which measures 3.30:1 and fails AA. Field's label wraps its input so
there is no id to mismatch, and onChange reports the value rather than
the event."
```

---

## Task 8: The `Card`, `Alert` and `Screen` primitives

**Files:**

- Create: `web/src/ui/Card.tsx`
- Create: `web/src/ui/Alert.tsx`
- Create: `web/src/ui/Screen.tsx`
- Create: `web/src/ui/LinkButton.tsx`
- Create: `web/src/ui/__tests__/Alert.test.tsx`
- Create: `web/src/ui/__tests__/Screen.test.tsx`
- Create: `web/src/ui/__tests__/LinkButton.test.tsx`

**Interfaces:**

- Consumes: Task 6's tokens.
- Produces:
  - `<Card tone?: "surface" | "ink", children>` — a padded, rounded container.
  - `<Alert children>` — renders `role="alert"`; used wherever an error envelope is shown.
  - `<Screen title?: string, children>` — the `<main>` wrapper with the page's max width and spacing; renders an `<h1>` when `title` is given.
  - `<LinkButton href: string, variant?: "primary" | "secondary", children>` — renders an `<a>` styled as a button. It exists because two screens (landing's sign-in, sign-in's Google) need something that **navigates** but reads as an action; `Button` renders `<button>`, which is the wrong element for a destination and which the existing landing test would not find as a link.
  - Tasks 9–11 build every screen from these.

- [ ] **Step 1: Write the failing tests**

Create `web/src/ui/__tests__/Alert.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { Alert } from "../Alert";

describe("Alert", () => {
  // Every existing screen finds its error with getByRole("alert"). Keeping the
  // role in the primitive is what stops a future screen from forgetting it.
  it("is announced as an alert", () => {
    render(<Alert>Something went wrong</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
```

Create `web/src/ui/__tests__/Screen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { Screen } from "../Screen";

describe("Screen", () => {
  it("renders a main landmark", () => {
    render(<Screen>content</Screen>);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the title as the page heading when given one", () => {
    render(<Screen title="Sign in">content</Screen>);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("renders no heading when not given one", () => {
    render(<Screen>content</Screen>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
```

Create `web/src/ui/__tests__/LinkButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { LinkButton } from "../LinkButton";

describe("LinkButton", () => {
  // The whole reason this exists rather than reusing Button: it must be a
  // link, because it navigates. The landing test finds it with getByRole("link").
  it("is a link, not a button", () => {
    render(<LinkButton href="/signin">Sign in</LinkButton>);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("meets the minimum touch target on every variant", () => {
    const { rerender } = render(<LinkButton href="/x">Go</LinkButton>);
    for (const variant of ["primary", "secondary"] as const) {
      rerender(
        <LinkButton href="/x" variant={variant}>
          Go
        </LinkButton>,
      );
      expect(screen.getByRole("link", { name: "Go" }).className).toContain("min-h-12");
    }
  });

  it("never puts white text on the bright accent", () => {
    render(<LinkButton href="/x">Go</LinkButton>);
    expect(screen.getByRole("link", { name: "Go" }).className).not.toContain("bg-accent-bright");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:web -- src/ui`
Expected: FAIL — `Cannot find module '../Alert'`.

- [ ] **Step 3: Write the four components**

Create `web/src/ui/Card.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * `ink` is the deep-green card used for the one thing a screen most wants you
 * to look at. It is the only place `--color-accent-glow` appears as text, and
 * it works there because the ground is dark rather than white.
 */
const TONES = {
  surface: "bg-surface text-ink border border-line",
  ink: "bg-ink text-canvas",
} as const;

export function Card({
  children,
  tone = "surface",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return <section className={`rounded-card p-5 shadow-card ${TONES[tone]}`}>{children}</section>;
}
```

Create `web/src/ui/Alert.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * `role="alert"` lives here rather than on each screen so that a screen cannot
 * forget it. Every existing test locates an error with getByRole("alert").
 */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card border border-line bg-surface p-4 text-ink">
      {children}
    </p>
  );
}
```

Create `web/src/ui/Screen.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * The one-column frame every screen sits in. The narrow max width is doing
 * real work: comfortable line length is most of what makes body text feel
 * effortless, and this app is read on phones by people who are not
 * necessarily wearing their glasses.
 */
export function Screen({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-8">
      {title !== undefined && (
        <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
      )}
      {children}
    </main>
  );
}
```

Create `web/src/ui/LinkButton.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * A link that reads as a button. Two screens need one — the landing screen's
 * sign-in action and the sign-in screen's "Continue with Google" — and both
 * NAVIGATE, so `<button>` would be the wrong element and the existing landing
 * test would stop finding it with `getByRole("link")`.
 *
 * It exists as a primitive rather than as a class string copied into each
 * screen so that the button look is defined once. Keep the variants in step
 * with `Button`'s: only `--color-accent` (5.02:1 against white) ever carries
 * white text, never `--color-accent-bright` (3.30:1).
 */
const VARIANTS = {
  primary: "bg-accent text-surface",
  secondary: "border border-line bg-surface text-ink",
} as const;

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <a
      href={href}
      className={`flex min-h-12 w-full items-center justify-center rounded-card px-6 text-[1.0625rem] font-semibold ${VARIANTS[variant]}`}
    >
      {children}
    </a>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:web -- src/ui`
Expected: PASS, 16 tests across all five `src/ui` test files.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui
git commit -m "feat: add the Card, Alert, Screen and LinkButton primitives

role=alert lives in Alert rather than on each screen, so a screen cannot
forget it — every existing test finds its error with getByRole('alert').
Screen owns the max width because comfortable line length is most of what
makes body text effortless to read."
```

---

## Task 9: The landing, error and offline screens

**Files:**

- Modify: `web/app/page.tsx`
- Modify: `web/app/error/page.tsx`
- Modify: `web/app/~offline/page.tsx`
- Modify: `web/messages/en.json` (offline copy, if it is currently hardcoded)
- **Do NOT modify** `web/src/__tests__/landing.test.tsx`. It must pass untouched — if it needs editing, the restyle changed behaviour and that is the bug.

**Interfaces:**

- Consumes: `Screen`, `Card`, `LinkButton` from Task 8.
- Produces: nothing later tasks import.

- [ ] **Step 1: Read the three screens and the landing test**

```bash
cat web/app/page.tsx web/app/error/page.tsx web/app/'~offline'/page.tsx web/src/__tests__/landing.test.tsx
```

Note every string each renders and how the landing test locates the sign-in affordance — the restyle must not change what the test finds. If `~offline` holds hardcoded English, add keys under an `offline` section of `en.json` and use them; every user-visible string goes through `next-intl`.

- [ ] **Step 2: Restyle the landing screen**

`web/app/page.tsx`. The sign-in affordance stays an `<a>` — it is navigation, not an action, and the landing test locates it as a link:

```tsx
import { useTranslations } from "next-intl";

import { LinkButton } from "../src/ui/LinkButton";
import { Screen } from "../src/ui/Screen";

export default function LandingPage() {
  const t = useTranslations("landing");

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <h1 className="text-4xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
      </div>

      {/*
        LinkButton, not Button: this navigates. A <button> would be the wrong
        element for a destination, and the landing test locates it as a link.
      */}
      <LinkButton href="/signin">{t("signIn")}</LinkButton>
    </Screen>
  );
}
```

- [ ] **Step 3: Restyle the error screen**

`web/app/error/page.tsx` — keep whatever copy and structure it has, wrapped in the primitives:

```tsx
import { useTranslations } from "next-intl";

import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";

export default function ErrorPage() {
  const t = useTranslations("error");

  return (
    <Screen title={t("title")}>
      <Card>
        <a href="/" className="font-semibold text-accent">
          {t("back")}
        </a>
      </Card>
    </Screen>
  );
}
```

If `error.back` does not exist in `en.json`, add it: `"back": "Back to the start"`. If the existing page renders different copy, keep the existing copy and keys — do not invent replacements.

- [ ] **Step 4: Restyle the offline screen**

`web/app/~offline/page.tsx`, in the same shape. It must look like the rest of the app: an offline page that looks broken reads as a crash rather than a state.

- [ ] **Step 5: Run the tests**

Run: `npm run test:web`
Expected: all green, including `landing.test.tsx` unchanged. **If the landing test needed editing to pass, the restyle changed behaviour** — revisit rather than editing the assertion.

- [ ] **Step 6: Look at all three screens**

With `npm run dev` running, open http://localhost:3001/, /error and /~offline.
Expected: green canvas ground, deep-green headings, one obvious primary action on the landing screen, comfortable text size, and a visible focus ring when tabbing.

- [ ] **Step 7: Commit**

```bash
git add web/app/page.tsx web/app/error web/app/'~offline' web/messages/en.json
git commit -m "feat: style the landing, error and offline screens

The sign-in affordance stays an anchor rather than becoming a Button: it
navigates, and the landing test finds it as a link. The offline page gets
the same treatment as the rest — an offline screen that looks broken
reads as a crash rather than a state."
```

---

## Task 10: The sign-in and consent screens

**Files:**

- Modify: `web/app/signin/page.tsx`
- Modify: `web/app/consent/ConsentForm.tsx`

**Interfaces:**

- Consumes: `Screen`, `Card`, `Button`, `Field`, `Alert`, `LinkButton`.
- Produces: nothing. Behaviour is unchanged throughout — this is markup only.

- [ ] **Step 1: Restyle the sign-in screen**

Replace the markup in `web/app/signin/page.tsx`, keeping every handler exactly as it is. Note the hierarchy: **one** primary action visible at a time, with the alternatives clearly secondary.

```tsx
return (
  <Screen title={t("title")}>
    {error !== undefined && <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>}

    <Card>
      <div className="flex flex-col gap-4">
        <Field label={t("contactLabel")} value={contact} onChange={setContact} inputMode="tel" />

        {!sent ? (
          <Button
            onClick={() => {
              void requestCode();
            }}
          >
            {t("sendCode")}
          </Button>
        ) : (
          <>
            <Field label={t("codeLabel")} value={code} onChange={setCode} inputMode="numeric" />
            <Button
              onClick={() => {
                void verifyCode();
              }}
            >
              {t("verify")}
            </Button>
          </>
        )}
      </div>
    </Card>

    <div className="flex flex-col gap-3">
      {/*
          Points at the route that STARTS the OAuth flow, not at /auth/callback,
          which is where Google comes back to. Linking to the callback directly
          arrives with no `code` and is bounced straight to /?error=oauth.
        */}
      <LinkButton href="/api/auth/google" variant="secondary">
        {t("google")}
      </LinkButton>

      <Button
        variant="ghost"
        onClick={() => {
          void continueAsGuest();
        }}
      >
        {t("guest")}
      </Button>
    </div>
  </Screen>
);
```

Add the imports for `Screen`, `Card`, `Field`, `Button`, `Alert` and `LinkButton` from `../../src/ui/…`.

- [ ] **Step 2: Run the sign-in tests**

Run: `npm run test:web -- signinGuest`
Expected: PASS unchanged. `getByRole("button", { name: … })` and `getByRole("alert")` still find everything, because the primitives preserve the roles.

- [ ] **Step 3: Restyle the consent form**

`web/app/consent/ConsentForm.tsx`. The checkbox is deliberately **not** replaced by a primitive — it is the one consent decision in the product, and it stays a plain, obvious checkbox with a large label.

```tsx
return (
  <Screen title={t("title")}>
    <p className="text-lg leading-relaxed text-muted">{t("body")}</p>

    {isGuest && <p className="rounded-card bg-surface p-4 text-muted">{t("guestBody")}</p>}

    {error !== undefined && <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>}

    <Card>
      <div className="flex flex-col gap-5">
        <Field
          label={t("nameLabel")}
          value={name}
          onChange={setName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
        />

        {/*
            A big, plainly-worded checkbox, not a styled toggle. This is the
            one consent decision in the product and it must read as exactly
            what it is.
          */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            aria-label={t("healthDataLabel")}
            className="mt-1 size-6 shrink-0 accent-accent"
          />
          <span className="text-ink">{t("healthDataLabel")}</span>
        </label>
      </div>
    </Card>

    <Button
      disabled={!complete || submitting}
      onClick={() => {
        onSubmit({
          displayName,
          consents: [{ consent_type: "health_data", policy_version: policyVersion }],
        });
      }}
    >
      {t("submit")}
    </Button>
  </Screen>
);
```

Keep the existing comment above the submit button explaining why `submitting` is load-bearing.

- [ ] **Step 4: Run the consent tests**

Run: `npm run test:web -- consent`
Expected: PASS unchanged — `consent.test.tsx`, `consentPage.test.tsx` and `consent/__tests__/page.test.ts`. The double-submit test in particular must still pass; if it does not, the disabled logic was altered.

- [ ] **Step 5: Walk the journey**

With `npm run dev` running: http://localhost:3001/signin → "Continue as a guest" → consent (name pre-filled "Guest", checkbox empty) → tick → Continue → `/home`.
Expected: every screen styled, the submit button visibly disabled until both fields are complete, and a visible focus ring throughout a keyboard-only pass.

- [ ] **Step 6: Commit**

```bash
git add web/app/signin/page.tsx web/app/consent/ConsentForm.tsx
git commit -m "feat: style the sign-in and consent screens

Markup only — every handler and all submit-guard logic is untouched, and
the existing tests pass unedited because the primitives preserve the
roles those tests query.

The consent checkbox stays a plain checkbox rather than a styled toggle:
it is the one consent decision in the product and it should read as
exactly what it is."
```

---

## Task 11: The home dashboard shell

**Files:**

- Modify: `web/app/home/HomeView.tsx`
- Modify: `web/messages/en.json`
- Modify: `web/src/__tests__/homeView.test.tsx`

**Interfaces:**

- Consumes: `Screen`, `Card`, `isGuest` from Task 5.
- Produces: the final screen. Nothing depends on it.

- [ ] **Step 1: Add the shell copy**

In `web/messages/en.json`, extend `home`. Every one of these is an honest empty state — there is no tracking endpoint yet, and none of these strings claims otherwise:

```json
{
  "home": {
    "greeting": "Welcome",
    "todayLabel": "Today",
    "todayEmpty": "Your first plan is on its way. Nothing to do yet — that's allowed.",
    "statsLabel": "This week",
    "stepsLabel": "Steps",
    "waterLabel": "Water",
    "workoutsLabel": "Workouts",
    "empty": "—"
  }
}
```

- [ ] **Step 2: Write the failing test**

Add to `web/src/__tests__/homeView.test.tsx`:

```tsx
describe("HomeView shell", () => {
  it("shows the today card in its empty state", () => {
    renderView();

    expect(screen.getByText(messages.home.todayLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.todayEmpty)).toBeInTheDocument();
  });

  it("shows stat tiles with no values", () => {
    renderView();

    expect(screen.getByText(messages.home.stepsLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.waterLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.home.workoutsLabel)).toBeInTheDocument();
    expect(screen.getAllByText(messages.home.empty)).toHaveLength(3);
  });

  // The line this whole screen must not cross. There is no tracking endpoint,
  // so any digit here would be fiction rendered as fact.
  it("invents no data", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HomeView />
      </NextIntlClientProvider>,
    );

    expect(container.textContent).not.toMatch(/\d/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:web -- homeView`
Expected: FAIL — the today card does not exist.

- [ ] **Step 4: Build the shell**

Replace `web/app/home/HomeView.tsx`:

```tsx
import { useTranslations } from "next-intl";

import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";

/**
 * The home screen. It is a separate component because `page.tsx` has to be
 * `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 *
 * Everything here is an EMPTY state, deliberately. There is no tracking
 * endpoint yet (Epics 4–6), so the structure is real and the numbers are
 * absent. Inventing a step count would be fiction rendered as fact, and a
 * test asserts this screen renders no digits at all.
 */
export function HomeView({ isGuest = false }: { isGuest?: boolean }) {
  const t = useTranslations("home");

  return (
    <Screen>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("greeting")}</h1>
        {/*
          A chip and a note, deliberately not a "claim your account" button:
          claiming is not built. The note can promise nothing is lost because a
          guest is a real anonymous user — linking an identity later keeps the
          same auth.users.id, and therefore the same domain row.
        */}
        {isGuest && (
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-muted">
            {t("guestChip")}
          </span>
        )}
      </header>

      {isGuest && <p className="text-muted">{t("guestNote")}</p>}

      <Card tone="ink">
        <p className="text-sm font-semibold tracking-widest text-accent-glow uppercase">
          {t("todayLabel")}
        </p>
        <p className="mt-2 text-lg leading-relaxed">{t("todayEmpty")}</p>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-widest text-muted uppercase">
          {t("statsLabel")}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("stepsLabel") },
            { label: t("waterLabel") },
            { label: t("workoutsLabel") },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-card border border-line bg-surface p-4 text-center"
            >
              <div className="text-2xl font-bold text-muted">{t("empty")}</div>
              <div className="mt-1 text-xs text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <Card>
        <p className="text-muted">{t("noFamily")}</p>
      </Card>
    </Screen>
  );
}
```

Note `text-accent-glow` on the ink card: that is the one place the bright glow is legible, because the ground is dark rather than white.

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test:web -- homeView`
Expected: PASS, 6 tests — including the three from Task 5, which must still pass, especially "offers no claim action".

- [ ] **Step 6: Run everything**

Run: `npm run lint:web && npm run typecheck:web && npm run test:web`
Expected: all green.

- [ ] **Step 7: Prove the production build one more time**

The service worker precaches the shell, and this task changed the shell substantially:

```bash
npm run build -w web
npm run start -w web &
sleep 4
curl -s -o /dev/null -w 'home:%{http_code} sw:%{http_code}\n' localhost:3001/home localhost:3001/serwist/sw.js
kill %1
```

Expected: both `200` (`/home` redirects to `/signin` without a session, which still resolves 200 after the redirect — a 500 here is a real failure).

- [ ] **Step 8: Walk the whole journey one last time**

`npm run dev`, then guest sign-in → consent → home.
Expected: the guest chip, the "Today" card in its empty state, three stat tiles reading "—", and no invented numbers anywhere.

- [ ] **Step 9: Commit**

```bash
git add web/app/home/HomeView.tsx web/messages/en.json web/src/__tests__/homeView.test.tsx
git commit -m "feat: build the home dashboard shell with honest empty states

Real structure, absent numbers. There is no tracking endpoint yet, so the
tiles read '—' and a test asserts the screen renders no digits at all —
invented data would have to be torn out when Epics 4-6 land, and until
then it is fiction rendered as fact.

The bright accent appears once, as the label on the dark Today card,
which is the only ground it is legible against."
```

---

## Self-Review

**Spec coverage:**

| Spec section                           | Task(s)                      |
| -------------------------------------- | ---------------------------- |
| D1 anonymous user / §3.1 the flow      | T2, T3                       |
| D2 consent still happens               | T4 (Step 13 asserts it)      |
| D3 `is_anonymous`, not a param         | T4                           |
| D4 claiming designed, not built        | T5 (asserts no claim action) |
| D5 Tailwind proven first               | T6                           |
| D6 semantic tokens                     | T6                           |
| D7 `#15803D`                           | T6, T7 (asserted)            |
| D8 honest empty states                 | T11 (asserted)               |
| D9–D11 idempotent script, keys, Ctrl-C | T1                           |
| §3.2 file table                        | T2–T5                        |
| §3.3 failure envelope                  | T2                           |
| §3.4 deferrals documented              | T2 (README)                  |
| §4.2 tokens / §4.3 legibility          | T6, T7                       |
| §4.4 components                        | T7, T8                       |
| §4.5 screens                           | T9, T10, T11                 |
| §5 dev script (all 8 steps)            | T1                           |
| §6 testing table                       | T2, T4, T5, T7, T11          |

No gaps.

**Placeholder scan:** none. Every code step carries the actual code; every verification step names the command and the expected output. Task 9's Step 1 asks the implementer to read three files before rewriting them — that is a deliberate instruction to preserve existing copy, not a deferred decision.

**Type consistency:** `isGuestSession(): Promise<boolean>` is defined in T4 and consumed in T5 under that exact name. `ConsentForm`'s `isGuest?: boolean` is added in T4 and used in T10. `HomeView`'s `isGuest?: boolean` is added in T5 and preserved in T11. `Button`'s `variant` union (`primary | secondary | ghost`) is defined in T7 and only those three values are used in T9–T11. `Field`'s `onChange: (value: string) => void` is defined in T7 and called with `setContact` / `setCode` / `setName` in T10, all of which are `(value: string) => void`. Token names (`bg-accent`, `text-muted`, `border-line`, `rounded-card`, `shadow-card`, `bg-canvas`, `text-accent-glow`, `bg-ink`, `text-surface`) are all declared in T6's `@theme`.
