# Slice 1 — `web/` Foundations & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `web/` workspace and ship the onboarding journey — sign in, consent, home — with the session in an httpOnly cookie and the PWA proven from a production build.

**Architecture:** Next 16 App Router in a second npm workspace. Every authentication action runs server-side through `@supabase/ssr`'s `createServerClient`, because a cookie written by JavaScript can never be httpOnly. Two proxy route handlers read the session server-side and call Express with a Bearer token, never forwarding the session cookie. Serwist precaches the shell through `@serwist/turbopack`, which serves the worker from a Next route rather than the origin root.

**Tech Stack:** Next 16.3.1, React 19.2.8, `@supabase/ssr` 0.12.4, `next-intl` 4.13.6, `@serwist/turbopack` 9.5.12 + `serwist` 9.5.12 + `esbuild`, Jest via `next/jest`, Playwright.

**Spec:** `docs/specs/2026-08-14-frontend-foundations-design.md` (slice 1; slice 0 is complete)

## Global Constraints

- **`createBrowserClient` is forbidden.** Only `createServerClient` can set an httpOnly cookie. Reaching for the browser client fails _silently_ — sign-in works and the session is simply readable by any injected script. Task 3 adds a lint rule so this is impossible, not merely discouraged.
- **The session cookie must carry `HttpOnly`.** An explicit test asserts it. Without that assertion, a switch to `createBrowserClient` passes every other test in the suite.
- **The proxy must never forward the session cookie upstream.** It extracts the access token and sends `Authorization: Bearer`. An explicit test asserts the upstream request carries no `cookie` header.
- **A status from Express must survive the proxy.** A 403 surfaces as 403, not 500. The 403 `REGISTRATION_REQUIRED` is a _route_ in the onboarding journey, not an error.
- **A proxy route handler must never throw.** Every response it emits either carries a parsable body or is a legal bodiless status — a rejected `fetch` and a non-JSON upstream body both become a 502 `{ error: { code: "UPSTREAM_UNAVAILABLE" } }`. The client parses the body before it decides where to route, so a bodiless 500 is a hung screen, not an error page.
- **The PWA is proven from `next build && next start` only.** Serwist #360 is a _runtime_ `ERR_MODULE_NOT_FOUND`; a green build is no evidence. `next dev` proves nothing here.
- **`useNativeEsbuild: true` is mandatory** on `createSerwistRoute`. `@serwist/turbopack` declares both `esbuild` and `esbuild-wasm` as peers and defaults to the wasm one, which the documented install line does not install. This is the verified fix for #360.
- **The worker lives at `/serwist/sw.js`, not `/sw.js`.** Any check assuming the origin root is wrong.
- **Background sync is deliberately excluded.** It belongs with the tracking endpoints, which do not exist, and it makes idempotency a backend requirement rather than a frontend detail. Serwist precaches the shell and nothing more. Do not add it because the library offers it.
- Versions are pinned exactly as above — all six were re-verified against the registry on 2026-08-15 and match the spike.
- Node `>=22`. Root `package.json` is private and declares the workspaces.
- Every string goes through `next-intl` from the first screen. `web/messages/en.json` is populated; `hi.json` exists and is empty.
- No passwords anywhere. Phone/email OTP and Google OAuth only.
- Prettier and ESLint are enforced repo-wide; Conventional Commits.

## Decisions this plan makes (not in the spec)

| Decision                                                              | Rationale                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test runner is Jest via `next/jest`**                               | The repo already standardises on Jest for `api`. `next/jest` supplies the SWC transform, CSS and asset stubs, so JSX and ESM work without the ts-jest gymnastics `api` needed. Two Jest projects inside `web`: `node` for route handlers, `jsdom` for components. |
| **Root scripts are additive (`dev:web`, `test:web`, …)**              | The existing root scripts delegate to `api` and the README documents them. Renaming `npm run dev` to mean something else would silently invalidate documentation verified two commits ago.                                                                        |
| **An ESLint `no-restricted-imports` rule bans `createBrowserClient`** | The spec calls this the easiest thing in the design to get wrong, and its failure is silent. A test proves the cookie is httpOnly today; the lint rule stops the mistake being reintroduced tomorrow.                                                             |
| **One locale, no locale routing**                                     | `hi.json` is empty and Hindi copy is explicitly out of scope. `getRequestConfig` returns `en` unconditionally; adding routing later is additive.                                                                                                                  |

---

## File Structure

| File                                                                                                                         | Responsibility                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `package.json`                                                                                                               | Modified: `workspaces` gains `web`; additive `*:web` scripts.                             |
| `web/package.json`                                                                                                           | The frontend workspace's deps and scripts.                                                |
| `web/next.config.mjs`                                                                                                        | `next-intl` plugin + `withSerwist`.                                                       |
| `web/tsconfig.json`                                                                                                          | Includes `"webworker"` in `lib` — without it `ServiceWorkerGlobalScope` fails to resolve. |
| `web/src/env.ts`                                                                                                             | Zod-validated frontend env; fails at boot, mirroring `api/src/config/env.ts`.             |
| `web/src/supabase/server.ts`                                                                                                 | `createSupabaseServerClient()` — the ONLY place `createServerClient` is constructed.      |
| `web/src/api/upstream.ts`                                                                                                    | `callApi(path, accessToken)` — the single upstream caller. Sets Bearer, sends no cookies. |
| `web/src/api/proxy.ts`                                                                                                       | `proxyUpstream(send)` — the guard that makes a proxy route unable to throw.               |
| `web/middleware.ts`                                                                                                          | Session refresh + route guard.                                                            |
| `web/app/api/auth/otp/route.ts`                                                                                              | Request an OTP.                                                                           |
| `web/app/api/auth/verify/route.ts`                                                                                           | Verify the code — sets the httpOnly cookie.                                               |
| `web/app/api/auth/google/route.ts`                                                                                           | Starts the Google flow — mints the authorize URL server-side and redirects.               |
| `web/app/auth/callback/route.ts`                                                                                             | OAuth code exchange — sets the httpOnly cookie.                                           |
| `web/app/api/me/route.ts`                                                                                                    | Proxy → `GET /api/v1/auth/me`.                                                            |
| `web/app/api/register/route.ts`                                                                                              | Proxy → `POST /api/v1/auth/register`.                                                     |
| `web/app/page.tsx`, `web/app/signin/page.tsx`, `web/app/consent/page.tsx`, `web/app/home/page.tsx`, `web/app/error/page.tsx` | The journey.                                                                              |
| `web/src/onboarding/nextStep.ts`                                                                                             | Where GET /api/me sends the user. The 403 REGISTRATION_REQUIRED seam.                     |
| `web/src/api/readJsonBody.ts`, `web/src/api/errorCode.ts`                                                                    | The client half of the proxy contract: never reject on a body, read the envelope's code.  |
| `web/src/ui/ElderlyModeProvider.tsx`                                                                                         | Role-driven CSS custom properties. Mechanism only.                                        |
| `web/app/sw.ts`, `web/app/serwist/[path]/route.ts`                                                                           | The service worker and the route that serves it.                                          |
| `web/app/~offline/page.tsx`, `web/public/manifest.webmanifest`                                                               | Offline fallback and install metadata.                                                    |
| `web/e2e/onboarding.spec.ts`                                                                                                 | Playwright: sign in → consent → home.                                                     |

Dependency order: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.

---

### Task 1: Scaffold the `web` workspace

**Files:**

- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.mjs`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/next-env.d.ts`
- Modify: `package.json`, `.prettierignore`

**Interfaces:**

- Consumes: nothing.
- Produces: a buildable workspace. Later tasks add files under `web/app` and `web/src`.

- [ ] **Step 1: Add `web` to the workspaces and add the additive scripts**

In the root `package.json`, change `"workspaces": ["api"]` to `"workspaces": ["api", "web"]`, and add these alongside the existing ones. Do NOT rename any existing script — they delegate to `api` and the README documents them:

```json
    "dev:web": "npm run dev -w web",
    "build:web": "npm run build -w web",
    "start:web": "npm run start -w web",
    "test:web": "npm run test -w web",
    "lint:web": "npm run lint -w web",
    "typecheck:web": "npm run typecheck -w web"
```

- [ ] **Step 2: Create `web/package.json`**

```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "next": "16.3.1",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "@supabase/ssr": "^0.12.4",
    "@supabase/supabase-js": "^2.58.0",
    "next-intl": "4.13.6",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/jest": "^30.0.0",
    "jest": "^30.4.2",
    "jest-environment-jsdom": "^30.4.2",
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.6.3",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 3: Create `web/tsconfig.json`**

`"webworker"` in `lib` is not optional — `app/sw.ts` in Task 7 needs `ServiceWorkerGlobalScope`, and without it you get TS2552.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023", "webworker"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowJs": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create a minimal `next.config.mjs` and app shell**

`web/next.config.mjs` — Serwist is added in Task 7, `next-intl` in Task 2:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

`web/app/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "Family Wellness Platform",
  description: "One app a whole family opens.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`web/app/page.tsx`:

```tsx
export default function LandingPage() {
  return <main>Family Wellness Platform</main>;
}
```

- [ ] **Step 5: Keep Prettier off Next's build output**

Append to `.prettierignore`:

```
web/.next/
web/next-env.d.ts
```

- [ ] **Step 6: Install and prove it builds AND serves**

```bash
npm install
npm run build:web
npm run start:web &
sleep 4
curl -s -o /dev/null -w 'GET / -> %{http_code}\n' localhost:3000
kill %1
```

Expected: build succeeds; `GET / -> 200`. Note `web` defaults to port 3000, the same as `api` — if `api` is running, start web with `PORT=3001 npm run start:web` and curl 3001. Record which port you used; Task 9's docs must state how to run both at once.

- [ ] **Step 7: Verify the backend is untouched and commit**

```bash
npm test && npm run lint && npm run typecheck && npm run format:check
git add package.json package-lock.json .prettierignore web/
git commit -m "feat: scaffold the web workspace"
```

Expected: the `api` suites still pass unchanged (40 unit).

---

### Task 2: Internationalisation from the first screen

**Files:**

- Create: `web/messages/en.json`, `web/messages/hi.json`, `web/src/i18n/request.ts`
- Modify: `web/next.config.mjs`, `web/app/layout.tsx`, `web/app/page.tsx`
- Test: `web/jest.config.mjs`, `web/jest.setup.ts`, `web/src/__tests__/landing.test.tsx`

**Interfaces:**

- Consumes: Task 1's scaffold.
- Produces: `useTranslations` / `getTranslations` usable anywhere; `web/messages/en.json` as the single copy source. Tasks 6 and 8 add keys to it.

- [ ] **Step 1: Write the failing component test**

Create `web/jest.config.mjs`:

```js
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const common = { clearMocks: true };

export default async function config() {
  const jsdom = await createJestConfig({
    ...common,
    displayName: "components",
    testEnvironment: "jsdom",
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    testMatch: ["<rootDir>/src/**/*.test.tsx"],
  })();

  const node = await createJestConfig({
    ...common,
    displayName: "route-handlers",
    testEnvironment: "node",
    testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/app/**/*.test.ts"],
  })();

  return { projects: [jsdom, node] };
}
```

Create `web/jest.setup.ts`:

```ts
import "@testing-library/jest-dom";
```

Create `web/src/__tests__/landing.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import LandingPage from "../../app/page";

describe("landing page", () => {
  it("renders its heading from the message catalogue, not a literal", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LandingPage />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("heading", { name: messages.landing.title })).toBeInTheDocument();
  });

  it("fails loudly if a key is missing rather than rendering the key name", () => {
    const withoutTitle = { ...messages, landing: { ...messages.landing, title: undefined } };

    expect(() =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={withoutTitle as unknown as typeof messages}
          onError={(error) => {
            throw error;
          }}
        >
          <LandingPage />
        </NextIntlClientProvider>,
      ),
    ).toThrow();
  });
});
```

The second test is the one that matters. `next-intl` renders the key path as fallback text when a message is missing, so without an `onError` that throws, a screen whose copy silently degraded to `landing.title` would still pass.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:web`
Expected: FAIL — `next-intl` is not wired and `messages/en.json` does not exist.

- [ ] **Step 3: Add the catalogues**

`web/messages/en.json`:

```json
{
  "landing": {
    "title": "Family Wellness Platform",
    "subtitle": "One app your whole family opens.",
    "signIn": "Sign in"
  }
}
```

`web/messages/hi.json`:

```json
{}
```

- [ ] **Step 4: Wire `next-intl`**

`web/src/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";

/**
 * One locale for now. Hindi copy is out of scope for this slice, so there is no
 * locale routing to configure — `hi.json` exists as the seam, empty. Adding
 * routing later is additive and does not change any call site.
 */
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../../messages/en.json")).default,
}));
```

`web/next.config.mjs`:

```js
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withNextIntl(nextConfig);
```

`web/app/layout.tsx` — wrap children so client components can translate:

```tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

export const metadata = {
  title: "Family Wellness Platform",
  description: "One app a whole family opens.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`web/app/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function LandingPage() {
  const t = useTranslations("landing");

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("subtitle")}</p>
      <a href="/signin">{t("signIn")}</a>
    </main>
  );
}
```

- [ ] **Step 5: Run to green, then verify and commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ && git commit -m "feat: route every string through next-intl"
```

---

### Task 3: The Supabase server client, env, and the lint guard

**Files:**

- Create: `web/src/env.ts`, `web/src/supabase/server.ts`, `web/eslint.config.js`
- Modify: `.env.example`
- Test: `web/src/__tests__/env.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `loadWebEnv(source): WebEnv` with `{ NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_ANON_KEY: string; API_BASE_URL: string }`
  - `createSupabaseServerClient(): Promise<SupabaseClient>` — the only construction site
    Tasks 4, 5 and 6 consume `createSupabaseServerClient`.

- [ ] **Step 1: Write the failing env test**

`web/src/__tests__/env.test.ts`:

```ts
import { loadWebEnv } from "../env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  API_BASE_URL: "http://127.0.0.1:3000",
};

describe("loadWebEnv", () => {
  it("accepts a complete environment", () => {
    expect(loadWebEnv(valid).API_BASE_URL).toBe("http://127.0.0.1:3000");
  });

  it("names the missing variable", () => {
    const { API_BASE_URL: _omitted, ...rest } = valid;
    expect(() => loadWebEnv(rest)).toThrow(/API_BASE_URL/);
  });

  it("rejects a non-URL", () => {
    expect(() => loadWebEnv({ ...valid, API_BASE_URL: "nonsense" })).toThrow(/API_BASE_URL/);
  });

  it("never echoes a value into the error", () => {
    let message = "";
    try {
      loadWebEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "", API_BASE_URL: "SECRETVALUE" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("SECRETVALUE");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:web`
Expected: FAIL — `../env` does not exist.

- [ ] **Step 3: Implement `web/src/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Where the Express API lives. The browser never calls it directly — only
  // this app's route handlers do, server-side.
  API_BASE_URL: z.url(),
});

export type WebEnv = z.infer<typeof schema>;

export function loadWebEnv(source: Record<string, string | undefined>): WebEnv {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid web environment:\n${issues}`);
  }

  return result.data;
}

export const webEnv = (): WebEnv => loadWebEnv(process.env);
```

- [ ] **Step 4: Implement the server client**

`web/src/supabase/server.ts`. This is the only file in the repository allowed to construct a Supabase client:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { webEnv } from "../env";

/**
 * The ONLY Supabase client in this app, and deliberately the server one.
 *
 * `createBrowserClient` writes the session with `document.cookie`, and a cookie
 * set by JavaScript can never be httpOnly — so it would leave the session
 * readable by any injected script. That failure is silent: sign-in still works.
 * `eslint.config.js` bans the browser client outright so this cannot regress.
 */
export async function createSupabaseServerClient() {
  const env = webEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
        }
      },
    },
  });
}
```

- [ ] **Step 5: Ban the browser client in lint**

`web/eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: [".next/**", "next-env.d.ts"] },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // The single most dangerous mistake available in this codebase.
      // createBrowserClient sets the session through document.cookie, which
      // cannot be httpOnly — and everything still appears to work. A test
      // proves the cookie is httpOnly today; this stops it regressing tomorrow.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/ssr",
              importNames: ["createBrowserClient"],
              message:
                "Use createSupabaseServerClient() from src/supabase/server.ts. A cookie written by JavaScript cannot be httpOnly.",
            },
          ],
        },
      ],
    },
  },

  prettierConfig,
);
```

- [ ] **Step 6: Prove the lint rule bites**

```bash
printf 'import { createBrowserClient } from "@supabase/ssr";\nexport const x = createBrowserClient;\n' > web/src/__probe.ts
npm run lint:web; echo "exit=$?"
rm web/src/__probe.ts
```

Expected: **non-zero exit**, naming `createBrowserClient`. A rule that does not fail here is not a rule. Paste the real output into your report.

- [ ] **Step 7: Document the new variables**

Append to `.env.example`:

```
# ---- Web (frontend workspace) ----
# The browser needs these two to reach Supabase for the OAuth redirect only;
# every authentication call itself runs server-side.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# `npx supabase status` prints this as ANON_KEY. It is a public key by design.
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Where the Express API listens. Only this app's route handlers call it.
API_BASE_URL=http://127.0.0.1:3000
```

- [ ] **Step 8: Verify and commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ .env.example && git commit -m "feat: add the server-only Supabase client and ban the browser one"
```

---

### Task 4: Authentication route handlers and the httpOnly assertion

**Files:**

- Create: `web/app/api/auth/otp/route.ts`, `web/app/api/auth/verify/route.ts`, `web/app/auth/callback/route.ts`, `web/middleware.ts`
- Test: `web/app/api/auth/__tests__/verify.test.ts`

**Interfaces:**

- Consumes: `createSupabaseServerClient` (Task 3).
- Produces: `POST /api/auth/otp` `{ contact }`, `POST /api/auth/verify` `{ contact, code }` → sets the session cookie, `GET /auth/callback?code=…` → sets the session cookie and redirects. Task 9's Playwright spec drives all three.

- [ ] **Step 1: Write the failing test — the assertion that keeps F2 true**

`web/app/api/auth/__tests__/verify.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const setAllCalls: { name: string; value: string; options: Record<string, unknown> }[] = [];

jest.mock("../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "../../../../src/supabase/server";
import { POST } from "../verify/route";

function stubClient(result: { error: { message: string } | null }) {
  return {
    auth: {
      verifyOtp: jest.fn(() => {
        // Mimic @supabase/ssr writing the session through the cookie adapter.
        setAllCalls.push({
          name: "sb-access-token",
          value: "token-value",
          options: { httpOnly: true, sameSite: "lax", path: "/" },
        });
        return Promise.resolve(result);
      }),
    },
  };
}

beforeEach(() => {
  setAllCalls.length = 0;
});

describe("POST /api/auth/verify", () => {
  it("returns 200 when the code is accepted", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    const response = await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "123456" }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("writes the session cookie with HttpOnly", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(stubClient({ error: null }));

    await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "123456" }),
      }),
    );

    expect(setAllCalls).toHaveLength(1);
    expect(setAllCalls[0]?.options.httpOnly).toBe(true);
  });

  it("returns 401 and no cookie when the code is wrong", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Token has expired or is invalid" } }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "000000" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("never returns Supabase's message to the caller", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      stubClient({ error: { message: "Token has expired or is invalid" } }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ contact: "+911234567890", code: "000000" }),
      }),
    );

    expect(JSON.stringify(await response.json())).not.toContain("expired");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:web`
Expected: FAIL — `../verify/route` does not exist.

- [ ] **Step 3: Implement the three handlers**

`web/app/api/auth/otp/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

const body = z.object({ contact: z.string().min(3) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const isEmail = parsed.data.contact.includes("@");
  const { error } = await supabase.auth.signInWithOtp(
    isEmail ? { email: parsed.data.contact } : { phone: parsed.data.contact },
  );

  if (error) {
    // Deliberately generic: whether an account exists is not the caller's business.
    console.error("otp request failed", { reason: error.message });
    return NextResponse.json({ error: { code: "OTP_REQUEST_FAILED" } }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
```

`web/app/api/auth/verify/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

const body = z.object({ contact: z.string().min(3), code: z.string().min(4) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const isEmail = parsed.data.contact.includes("@");
  const { error } = await supabase.auth.verifyOtp(
    isEmail
      ? { email: parsed.data.contact, token: parsed.data.code, type: "email" }
      : { phone: parsed.data.contact, token: parsed.data.code, type: "sms" },
  );

  if (error) {
    console.error("otp verification failed", { reason: error.message });
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  // The session cookie was written by the client's cookie adapter, which forces
  // httpOnly. Nothing about the session is returned in the body.
  return NextResponse.json({ authenticated: true });
}
```

`web/app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code === null) {
    return NextResponse.redirect(new URL("/?error=oauth", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("oauth exchange failed", { reason: error.message });
    return NextResponse.redirect(new URL("/?error=oauth", url.origin));
  }

  // Always /home, and /home itself decides: Task 6 makes it an async server
  // component that runs the onboarding guard and sends a user with no `users`
  // row on to /consent. Deciding here instead would leave /home reachable,
  // unguarded, by typing the URL.
  return NextResponse.redirect(new URL("/home", url.origin));
}
```

`web/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the session on every request. This must construct its own client
 * rather than reuse `createSupabaseServerClient`, because middleware writes
 * cookies onto a response object rather than through `next/headers`.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
          }
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|serwist|manifest.webmanifest).*)"],
};
```

The matcher excludes `serwist` deliberately — Task 7 serves the worker from a route, and running auth middleware over it would be both pointless and a way to break precaching.

- [ ] **Step 4: Run to green, verify, commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ && git commit -m "feat: run every authentication action server-side"
```

---

### Task 5: The proxy to Express

**Files:**

- Create: `web/src/api/upstream.ts`, `web/src/api/proxy.ts`, `web/app/api/me/route.ts`, `web/app/api/register/route.ts`
- Test: `web/src/api/__tests__/upstream.test.ts`, `web/app/api/me/__tests__/route.test.ts`, `web/app/api/register/__tests__/route.test.ts`

**Interfaces:**

- Consumes: `createSupabaseServerClient` (Task 3), `webEnv` (Task 3).
- Produces: `callApi(path: string, accessToken: string, init?: { method?: string; body?: unknown }): Promise<Response>` and `proxyUpstream(send: () => Promise<Response>): Promise<NextResponse>`. Task 6 consumes them.

**The contract Task 6 is allowed to rely on:** every response either of these route handlers emits carries a parsable body or is a legal bodiless status, and neither handler can throw. Task 6's signin page does `router.push(nextStep(me.status, await me.json()))` and its consent page does `await response.json()` on any non-ok response — both reject on a bodiless 500, which strands the client on a hung screen before it can route anywhere. That is why `nextStep(500, {})` → `/error` is reachable at all.

- [ ] **Step 1: Write the failing test — the three properties that matter**

`web/src/api/__tests__/upstream.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { callApi } from "../upstream";

const originalFetch = global.fetch;
let captured: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  captured = null;
  process.env["API_BASE_URL"] = "http://api.test";
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "http://127.0.0.1:54321";
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "anon";
  global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("callApi", () => {
  it("attaches the access token as a Bearer header", async () => {
    await callApi("/api/v1/auth/me", "the-access-token");

    const headers = new Headers(captured?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer the-access-token");
  });

  it("never forwards a cookie header upstream", async () => {
    await callApi("/api/v1/auth/me", "the-access-token");

    const headers = new Headers(captured?.init.headers);
    expect(headers.get("cookie")).toBeNull();
  });

  // `${base}@evil.com/x` parses with "api.test" as userinfo and "evil.com" as
  // the host, and "//evil.com/x" is protocol-relative — either would post a
  // Bearer token to somewhere we never chose. Task 6+ builds paths from ids,
  // so the guard has to be in place before the first interpolated path lands.
  it.each(["@evil.com/x", "//evil.com/x", "api/v1/auth/me"])(
    "refuses the path %p rather than letting it choose the host",
    async (path) => {
      await expect(callApi(path, "the-access-token")).rejects.toThrow(/single "\/"/);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("preserves the upstream status rather than flattening it", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "REGISTRATION_REQUIRED" } }), { status: 403 }),
      ),
    ) as unknown as typeof fetch;

    const response = await callApi("/api/v1/auth/me", "the-access-token");

    expect(response.status).toBe(403);
  });
});
```

The cookie assertion is the one that would otherwise be missed: `fetch` does not attach cookies by default in this context, so the test locks in a property that is currently true by accident and could stop being true the moment someone adds `credentials: "include"` or copies the incoming headers wholesale.

Be honest about the status test above: `callApi` returns `fetch`'s `Response` object directly, so that assertion is close to structural and cannot fail short of a rewrite. The place a status can genuinely get flattened is the route handlers, which is why Step 6 tests them separately and why that is where the 403 assertion actually earns its keep.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:web`
Expected: FAIL — `../upstream` does not exist.

- [ ] **Step 3: Implement `web/src/api/upstream.ts`**

```ts
import { webEnv } from "../env";

/**
 * The single place this app talks to Express.
 *
 * Two properties are load-bearing and both are asserted in tests: the request
 * carries the access token as a Bearer header, and it carries NO cookie. The
 * session cookie is this app's private business — forwarding it upstream would
 * hand the API a credential it has no use for and must never log.
 */
export async function callApi(
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  // Insurance against a caller that interpolates: "@evil.com/x" parses as
  // userinfo and "//evil.com/x" is protocol-relative, so either one would send
  // a Bearer token to a host we did not choose. Both callers pass literals
  // today; Task 6+ builds paths from ids, which is when this stops being
  // theoretical. A throw here is caught by `proxyUpstream` and answered with
  // the 502 envelope, so a bad path is a logged failure, never a crash.
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`callApi path must start with a single "/": ${path}`);
  }

  const env = webEnv();
  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  });

  return fetch(`${env.API_BASE_URL.replace(/\/+$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    // Explicit: never attach ambient credentials to an upstream call.
    credentials: "omit",
    cache: "no-store",
  });
}
```

- [ ] **Step 4: Implement `web/src/api/proxy.ts` — the part that cannot fail**

`callApi` returns a `Promise<Response>`, and both of the obvious ways to use it are wrong. `await callApi(...)` with no `try` turns a refused connection, a DNS failure or an undici timeout into a rejection that Next answers with a bodiless 500 — no envelope, nothing for the client to parse. And `await upstream.json()` assumes a body that is both present and JSON, which it is not when Express misses a path (there is no catch-all 404, so `finalhandler` writes `text/html` `Cannot GET /...`), when an ingress in front of Express serves its own HTML 502, or when the body is simply empty. A 204 is worse still: `NextResponse.json(x, { status: 204 })` throws on its own.

So the guard lives in one place and both handlers go through it:

```ts
import { NextResponse } from "next/server";

/**
 * Statuses that may not carry a body. `NextResponse.json(x, { status: 204 })`
 * throws outright ("Invalid response status code"), so these have to be built
 * as a bodiless response or they cannot be proxied at all.
 */
const STATUSES_WITHOUT_BODY = new Set([204, 304]);

/**
 * One code for every way upstream can fail to produce a usable answer. The
 * client cannot act differently on "refused" versus "served HTML", and the
 * distinction that does matter to us is in the log line, not the body.
 */
function upstreamUnavailable(): NextResponse {
  return NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE" } }, { status: 502 });
}

/**
 * Turns one upstream call into a response this app can always return.
 *
 * The contract every route handler leans on: this never throws and never
 * returns a bodiless 500. Whatever happens — Express down, DNS failure, a
 * timeout, an ingress serving an HTML 502, a path miss serving `Cannot GET
 * /...`, an empty body — the caller gets either a faithful pass-through of the
 * upstream status and JSON, or a `{ error: { code } }` envelope. The client
 * calls `.json()` on the result unconditionally, so a response with no parsable
 * body strands it on a hung screen instead of letting it route to an error
 * page.
 *
 * Reasons are logged, never returned: the caller has no business knowing which
 * host refused a connection.
 */
export async function proxyUpstream(send: () => Promise<Response>): Promise<NextResponse> {
  let upstream: Response;

  try {
    upstream = await send();
  } catch (reason) {
    console.error("upstream call failed", { reason: describe(reason) });
    return upstreamUnavailable();
  }

  if (STATUSES_WITHOUT_BODY.has(upstream.status)) {
    return new NextResponse(null, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    console.error("upstream returned a non-JSON body", { status: upstream.status, contentType });
    return upstreamUnavailable();
  }

  let body: string;
  try {
    body = await upstream.text();
  } catch (reason) {
    console.error("upstream body could not be read", { reason: describe(reason) });
    return upstreamUnavailable();
  }

  // A legitimately empty body (a 200 with nothing in it) is passed through as
  // an empty body rather than invented into `null`.
  if (body.trim() === "") {
    return new NextResponse(null, { status: upstream.status });
  }

  try {
    // Status is passed through unchanged — a 403 REGISTRATION_REQUIRED is a
    // step in onboarding, not a failure, and flattening it would hide the seam.
    return NextResponse.json(JSON.parse(body), { status: upstream.status });
  } catch (reason) {
    console.error("upstream body was not valid JSON", {
      status: upstream.status,
      reason: describe(reason),
    });
    return upstreamUnavailable();
  }
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
```

`UPSTREAM_UNAVAILABLE` follows the SCREAMING_SNAKE vocabulary of `api/src/http/errors.ts` and the envelope shape `web/app/api/auth/otp/route.ts` already returns — `{ error: { code } }`, 502, reason to `console.error` and never to the body.

- [ ] **Step 5: Implement the two proxy routes**

`web/app/api/me/route.ts`:

```ts
import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  // Every remaining outcome, success or failure, goes through `proxyUpstream`:
  // this handler must not be able to answer with a bodiless 500, because the
  // client parses the body before it decides where to route.
  return proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
}
```

`web/app/api/register/route.ts`:

```ts
import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../src/api/proxy";
import { callApi } from "../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../src/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // The caller's own body, not upstream's — same rule though: answer with an
    // envelope rather than letting the rejection become a bodiless 500.
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  // Every remaining outcome, success or failure, goes through `proxyUpstream`:
  // this handler must not be able to answer with a bodiless 500, because the
  // client parses the body before it decides where to route.
  return proxyUpstream(() =>
    callApi("/api/v1/auth/register", accessToken, { method: "POST", body }),
  );
}
```

- [ ] **Step 6: Test the handlers, with `callApi` mocked**

`web/app/api/me/__tests__/route.test.ts` and `web/app/api/register/__tests__/route.test.ts` mock both `../../../../src/supabase/server` and `../../../../src/api/upstream`, then assert on the handler's own response. The five that matter, per handler:

1. a 200 (or 201) passes through with its body;
2. **a 403 `REGISTRATION_REQUIRED` passes through with status and body intact** — the load-bearing one, since that status is the normal first answer for a new account and collapsing it strands every new user;
3. no session → 401, and `callApi` is never called;
4. `callApi` rejects → 502 `UPSTREAM_UNAVAILABLE`, not a throw, and the reason (`ECONNREFUSED`) does not appear in the body;
5. upstream returns a `text/html` body → 502 envelope, not a throw.

The `me` suite also pins the two shapes that used to be impossible: an empty body passes through as an empty body, and a 204 passes through as a 204 rather than blowing up inside `NextResponse.json`. The `register` suite additionally asserts the caller's parsed body reaches `callApi` unchanged and that a malformed request body is a 400 envelope.

Silence `console.error` with a `jest.spyOn` in `beforeEach` and `jest.restoreAllMocks()` in `afterEach` — the failure paths log by design, and the suite should not be noisy about it.

- [ ] **Step 7: Verify and commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ && git commit -m "feat: proxy to Express with a Bearer token and no session cookie"
```

---

### Task 6: The sign-in screen, the consent screen, and the routing between them

**Files:**

- Create: `web/app/signin/page.tsx`, `web/app/consent/page.tsx`, `web/app/consent/ConsentForm.tsx`, `web/app/home/page.tsx`, `web/app/home/HomeView.tsx`, `web/app/error/page.tsx`, `web/app/api/auth/google/route.ts`, `web/src/onboarding/nextStep.ts`, `web/src/onboarding/currentStep.ts`, `web/src/api/errorCode.ts`, `web/src/api/readJsonBody.ts`
- Modify: `web/messages/en.json`
- Test: `web/src/__tests__/consent.test.tsx`, `web/src/__tests__/consentPage.test.tsx`, `web/src/onboarding/__tests__/nextStep.test.ts`, `web/app/home/__tests__/page.test.ts`, `web/src/api/__tests__/readJsonBody.test.ts`, `web/app/api/auth/__tests__/google.test.ts`

**Interfaces:**

- Consumes: `callApi` indirectly through `/api/register`; `proxyUpstream`'s contract, which is what forces the defensive body read below.
- Produces: the `/signin`, `/consent`, `/home` and `/error` routes, plus `GET /api/auth/google` which starts the OAuth flow. Task 9's Playwright spec drives them.

**Contracts Task 9 must be written against (as built):**

- The consent form collects a **display name**. Submission is disabled until the name is non-empty after trimming AND the health-data box is ticked, and stays disabled while a registration is in flight — one click, one `POST /api/register`. That request carries `{ display_name, locale: "en", consents }` with the name the user typed — nothing is hardcoded.
- The "Continue with Google" link points at `/api/auth/google`, not `/auth/callback`.
- `nextStep` is matched on the error CODE, never the status alone.
- **`/home` is guarded, and it is the only place the journey is routed for an OAuth user.** `/auth/callback` redirects unconditionally to `/home`; `/home` is an async server component that resolves `currentStep()` before rendering and `redirect()`s to `/consent` (403 `REGISTRATION_REQUIRED`), `/signin` (no session, or 401) or `/error` (anything else, including a dead API). A first-time Google user therefore reaches the consent screen, and so does anyone who types `/home` directly — the callback alone could not have closed the second hole. Playwright can assert this by navigating to `/home` with a fresh session and expecting to land on `/consent`.

- [ ] **Step 1: Write the failing component test**

`web/src/__tests__/consent.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { ConsentForm } from "../../app/consent/ConsentForm";

function renderForm(onSubmit = jest.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentForm onSubmit={onSubmit} policyVersion="2026-08-15" />
    </NextIntlClientProvider>,
  );
  return onSubmit;
}

function submitButton() {
  return screen.getByRole("button", { name: messages.consent.submit });
}

function nameInput() {
  return screen.getByLabelText(messages.consent.nameLabel);
}

function consentCheckbox() {
  return screen.getByRole("checkbox", { name: messages.consent.healthDataLabel });
}

describe("consent form", () => {
  it("disables submission until health data consent is given", () => {
    renderForm();

    fireEvent.change(nameInput(), { target: { value: "Meera" } });

    expect(submitButton()).toBeDisabled();
  });

  it("disables submission until a name is given", () => {
    renderForm();

    fireEvent.click(consentCheckbox());

    expect(submitButton()).toBeDisabled();
  });

  it("treats a whitespace-only name as no name", () => {
    renderForm();

    fireEvent.change(nameInput(), { target: { value: "   " } });
    fireEvent.click(consentCheckbox());

    expect(submitButton()).toBeDisabled();
  });

  it("submits the trimmed name and the policy version alongside the consent", () => {
    const onSubmit = renderForm();

    fireEvent.change(nameInput(), { target: { value: "  Meera  " } });
    fireEvent.click(consentCheckbox());
    fireEvent.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: "Meera",
      consents: [{ consent_type: "health_data", policy_version: "2026-08-15" }],
    });
  });

  it("caps the name at the length the API accepts", () => {
    renderForm();

    expect(nameInput()).toHaveAttribute("maxLength", "120");
  });

  it("renders the error envelope's code rather than a raw failure", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" error="VALIDATION_FAILED" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.VALIDATION_FAILED);
  });

  it("falls back to the unknown-error copy for a code it has no message for", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" error="TEAPOT" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.UNKNOWN);
  });
});
```

The `policy_version` assertion matters for a reason beyond correctness: the spec requires it match the copy actually shown, so an audit can reproduce what was agreed to. A form that posts a hardcoded or stale version silently breaks that. **If the consent copy changes, bump `POLICY_VERSION` in the same commit.**

The display name is required for the same class of reason: a form that posts a constant (`"New member"`) ships a visible bug — every account in the product would carry the same name — and the E2E written against it would encode that bug as the expected behaviour. `120` is the cap the API enforces (`api/src/routes/auth.ts`), so the input enforces the same one rather than letting the journey end in a rejection the user cannot act on.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:web`
Expected: FAIL — `ConsentForm` does not exist.

- [ ] **Step 3: Add the copy**

Merge into `web/messages/en.json`:

```json
  "signin": {
    "title": "Sign in",
    "contactLabel": "Phone number or email",
    "sendCode": "Send me a code",
    "codeLabel": "Enter the code",
    "verify": "Continue",
    "google": "Continue with Google"
  },
  "consent": {
    "title": "Before we start",
    "body": "This app stores what you log — workouts, meals, water, sleep — and any health conditions you choose to share, so it can build a plan that fits you. You can export or delete this data at any time.",
    "nameLabel": "What should we call you?",
    "healthDataLabel": "I agree to the app storing my health data",
    "submit": "Continue"
  },
  "home": {
    "title": "You're set up",
    "noFamily": "You're not in a family yet. Family setup arrives soon."
  },
  "error": {
    "title": "Something went wrong"
  },
  "errors": {
    "VALIDATION_FAILED": "Something in that form wasn't right. Please check and try again.",
    "UNAUTHENTICATED": "Your session has expired. Please sign in again.",
    "REGISTRATION_REQUIRED": "One more step before you can continue.",
    "OTP_REQUEST_FAILED": "We couldn't send that code. Please check the number or email and try again.",
    "UPSTREAM_UNAVAILABLE": "We couldn't reach the server. Please try again in a moment.",
    "UNKNOWN": "Something went wrong. Please try again."
  }
```

`errors` carries a message for every code the user can actually reach — including `UPSTREAM_UNAVAILABLE`, which Task 5's proxy emits — and `UNKNOWN` catches the rest. No screen renders a raw code.

- [ ] **Step 4: Implement the form and pages**

`web/app/consent/ConsentForm.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The API caps `display_name` at 120 characters (`api/src/routes/auth.ts`).
 * Enforcing the same limit here keeps a preventable rejection out of the
 * journey — the field simply stops accepting more.
 */
export const DISPLAY_NAME_MAX_LENGTH = 120;

export type ConsentSubmission = {
  displayName: string;
  consents: { consent_type: "health_data"; policy_version: string }[];
};

export function ConsentForm({
  onSubmit,
  policyVersion,
  error,
}: {
  onSubmit: (submission: ConsentSubmission) => void;
  policyVersion: string;
  error?: string;
}) {
  const t = useTranslations("consent");
  const tError = useTranslations("errors");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const displayName = name.trim();
  const complete = displayName !== "" && agreed;

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>

      {error !== undefined && (
        <p role="alert">{tError.has(error) ? tError(error) : tError("UNKNOWN")}</p>
      )}

      <label>
        {t("nameLabel")}
        <input
          type="text"
          value={name}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          aria-label={t("healthDataLabel")}
        />
        {t("healthDataLabel")}
      </label>

      <button
        type="button"
        disabled={!complete}
        onClick={() => {
          onSubmit({
            displayName,
            consents: [{ consent_type: "health_data", policy_version: policyVersion }],
          });
        }}
      >
        {t("submit")}
      </button>
    </main>
  );
}
```

`web/src/api/readJsonBody.ts` — the client half of the proxy contract:

```ts
/**
 * Reads a response body the client is about to route on, without ever
 * rejecting.
 *
 * `proxyUpstream` guarantees a parsable body OR a legal bodiless status — it
 * emits one for an empty upstream body and for 204/304. A blind `.json()` on
 * those rejects, and a rejection inside a click handler is not an error page:
 * it is a screen that sits there forever. Returning `{}` instead lets the
 * caller carry on and route on the status, which for anything unexpected means
 * `/error`.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
```

`web/src/api/errorCode.ts` — one parser for the `{ error: { code } }` envelope, shared by `nextStep` and the consent page:

```ts
export function errorCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
```

`web/app/consent/page.tsx`:

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

export default function ConsentPage() {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(submission: ConsentSubmission) {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: submission.displayName,
        locale: "en",
        consents: submission.consents,
      }),
    });

    if (response.ok) {
      router.push("/home");
      return;
    }

    // Read the body defensively: the proxy is allowed to answer with a legal
    // bodiless status, and a rejected `.json()` here would leave the user on a
    // screen that never changes.
    setError(errorCode(await readJsonBody(response)) ?? "UNKNOWN");
  }

  return (
    <ConsentForm
      onSubmit={(submission) => {
        void submit(submission);
      }}
      policyVersion={POLICY_VERSION}
      {...(error !== undefined && { error })}
    />
  );
}
```

The consent page also owns the in-flight state: `submitting` is set before the first `await`, passed to `ConsentForm`, and cleared only on a failure — on success the route change is already under way and re-enabling the button would allow a second registration during it. A `fetch` that rejects outright (offline) is caught and surfaced as `UPSTREAM_UNAVAILABLE`, because that path reaches neither branch and would otherwise leave the button dead forever.

`web/app/home/page.tsx` — **the guard for the whole journey**, split in two because `useTranslations` is a hook and cannot be called from the `async` component that awaits the guard:

```tsx
// web/app/home/page.tsx
import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
import { HomeView } from "./HomeView";

export default async function HomePage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  return <HomeView />;
}
```

`web/app/home/HomeView.tsx` holds the markup that was originally inline here (`main` > `h1` + `p`, both from `messages.home`).

`web/src/onboarding/currentStep.ts` — the server twin of the sign-in screen's `nextStep(me.status, body)` call:

```ts
export async function currentStep(): Promise<OnboardingDestination> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return nextStep(401, { error: { code: "UNAUTHENTICATED" } });
    }

    const response = await proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
    return nextStep(response.status, await readJsonBody(response));
  } catch (reason) {
    console.error("onboarding step could not be resolved", { reason: describe(reason) });
    return "/error";
  }
}
```

Three decisions worth keeping:

- It **reuses `nextStep`** rather than restating the rules. The OAuth journey and the OTP journey must not drift apart on the one distinction that matters — 403 `REGISTRATION_REQUIRED` is consent, any other 403 (`FORBIDDEN_ROLE`) is not.
- It calls `callApi` **directly instead of fetching our own `/api/me` over HTTP**. A server component has no origin to build an absolute URL from — `request.url` is the bind address here, not the address a client would use — so an HTTP call to ourselves would be a second, breakable copy of two in-process steps. It still goes through `proxyUpstream`, purely for Task 5's normalisation: a dead API, an HTML error page or an unparsable body becomes a 502 envelope, so `nextStep` never sees a status whose body contradicts it.
- It **never throws**, so the page needs no try/catch — which is load-bearing, because `redirect()` signals by throwing and a catch around it would swallow the redirect and render the page it was leaving.

- [ ] **Step 5: Write the failing test for the routing decision**

This is the seam the whole journey turns on, and the spec is explicit that **the 403 is a route, not an error**. Put the decision in a pure function so it can be tested without a browser.

`web/src/onboarding/__tests__/nextStep.test.ts`:

```ts
import { nextStep } from "../nextStep";

describe("nextStep", () => {
  it("sends an unregistered user to consent", () => {
    expect(nextStep(403, { error: { code: "REGISTRATION_REQUIRED" } })).toBe("/consent");
  });

  it("sends a registered user home", () => {
    expect(nextStep(200, { id: "u1", display_name: "Meera", family: null })).toBe("/home");
  });

  it("sends an unauthenticated user back to sign in", () => {
    expect(nextStep(401, { error: { code: "UNAUTHENTICATED" } })).toBe("/signin");
  });

  it("does NOT treat an unrelated 403 as the registration seam", () => {
    expect(nextStep(403, { error: { code: "FORBIDDEN_ROLE" } })).toBe("/error");
  });

  it("routes an unexpected status to the error page rather than guessing", () => {
    expect(nextStep(500, {})).toBe("/error");
  });

  it("does not route a bodiless 403 to consent", () => {
    expect(nextStep(403, {})).toBe("/error");
  });
});
```

The fourth case is the one worth having. Routing on the status alone would send every 403 to consent, so a future authorisation failure would silently render the consent screen and post a duplicate registration. The sixth is its bodiless twin: `readJsonBody` turns an empty response into `{}`, and `{}` is not evidence of the seam.

- [ ] **Step 6: Implement the decision and the sign-in screen**

`web/src/onboarding/nextStep.ts`:

```ts
import { errorCode } from "../api/errorCode";

export type OnboardingDestination = "/signin" | "/consent" | "/home" | "/error";

/**
 * Where the user goes after GET /api/me.
 *
 * The 403 REGISTRATION_REQUIRED is the seam between "Supabase knows you" and
 * "the product knows you" — a step in onboarding, not a failure. It is matched
 * on the CODE, never on the status alone: Phase B adds FORBIDDEN_ROLE, also a
 * 403, and routing that to the consent screen would post a second registration.
 */
export function nextStep(status: number, body: unknown): OnboardingDestination {
  if (status === 200) {
    return "/home";
  }
  if (status === 401) {
    return "/signin";
  }
  if (status === 403 && errorCode(body) === "REGISTRATION_REQUIRED") {
    return "/consent";
  }
  return "/error";
}
```

`web/app/signin/page.tsx` — posts to our own route handlers, never to Supabase:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { nextStep } from "../../src/onboarding/nextStep";

export default function SignInPage() {
  const t = useTranslations("signin");
  const tError = useTranslations("errors");
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function requestCode() {
    const response = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    if (response.ok) {
      setSent(true);
      setError(undefined);
      return;
    }
    setError("OTP_REQUEST_FAILED");
  }

  async function verifyCode() {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact, code }),
    });

    if (!response.ok) {
      setError("UNAUTHENTICATED");
      return;
    }

    // The session cookie is set. Ask the product whether it knows this user.
    // The body is read defensively: the proxy may legally answer with no body
    // at all, and a rejected `.json()` here would hang the screen instead of
    // routing to /error.
    const me = await fetch("/api/me");
    router.push(nextStep(me.status, await readJsonBody(me)));
  }

  return (
    <main>
      <h1>{t("title")}</h1>
      {error !== undefined && (
        <p role="alert">{tError.has(error) ? tError(error) : tError("UNKNOWN")}</p>
      )}

      <label>
        {t("contactLabel")}
        <input value={contact} onChange={(event) => setContact(event.target.value)} />
      </label>

      {!sent ? (
        <button
          type="button"
          onClick={() => {
            void requestCode();
          }}
        >
          {t("sendCode")}
        </button>
      ) : (
        <>
          <label>
            {t("codeLabel")}
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => {
              void verifyCode();
            }}
          >
            {t("verify")}
          </button>
        </>
      )}

      {/*
        Points at the route that STARTS the OAuth flow, not at /auth/callback,
        which is where Google comes back to. Linking to the callback directly
        arrives with no `code` and is bounced straight to /?error=oauth.
      */}
      <a href="/api/auth/google">{t("google")}</a>
    </main>
  );
}
```

The sign-in screen renders failures through the `errors` catalogue, like the consent form does — a raw `OTP_REQUEST_FAILED` on screen is a bug, not a message.

Also add a minimal `web/app/error/page.tsx` rendering `error.title` and `errors.UNKNOWN`, so `nextStep`'s `/error` destination is a real route rather than a 404. Deliberately a `page.tsx`, not Next's `error.tsx` boundary: this is somewhere the app routes to on purpose.

- [ ] **Step 6b: The route that STARTS the Google flow**

The sign-in screen cannot link straight to `/auth/callback` — that is the route Google redirects _back_ to, and Task 4's handler bounces a request with no `code` to `/?error=oauth`. The flow has to be started server-side anyway: `signInWithOAuth` writes the PKCE verifier through the server client's cookie adapter, so it lands in an httpOnly cookie that `/auth/callback` can read when it exchanges the code. Outside a browser `signInWithOAuth` does not redirect — it returns the authorize URL — so the redirect is ours to issue.

Test it first (`web/app/api/auth/__tests__/google.test.ts`, mocking `createSupabaseServerClient` exactly as `verify.test.ts` does): a 307 to the provider URL on success; `redirectTo` pointing at `/auth/callback` on the request's own origin; a redirect to `/?error=oauth` when Supabase errors or returns no URL; and the reason never appearing in the response.

`web/app/api/auth/google/route.ts`:

```ts
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", origin).toString() },
  });

  if (error !== null || !data.url) {
    // Same shape of failure as the callback's, so it lands in the same place.
    // The reason is logged and never handed to the caller — a browser is
    // following this link, and "provider is not enabled" is our problem.
    console.error("oauth start failed", { reason: error?.message ?? "no provider url returned" });
    return NextResponse.redirect(new URL("/?error=oauth", origin));
  }

  return NextResponse.redirect(data.url);
}
```

Failure redirects rather than returning the `{ error: { code } }` envelope its `/api/auth/*` siblings use, because a browser is _navigating_ here: a JSON envelope would be rendered as raw text at the user. It matches `/auth/callback`, the other navigation in this flow, and lands in the same place.

- [ ] **Step 7: Verify and commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ && git commit -m "feat: add sign-in, consent and the registration-required routing seam"
```

---

### Task 7: The PWA, proven from a production build

**Files:**

- Create: `web/app/sw.ts`, `web/app/serwist/[path]/route.ts`, `web/app/~offline/page.tsx`, `web/public/manifest.webmanifest`
- Modify: `web/next.config.mjs`, `web/app/layout.tsx`, `web/package.json`

**Interfaces:**

- Consumes: Task 1's config, Task 2's layout.
- Produces: a service worker served at `/serwist/sw.js`.

- [ ] **Step 1: Install the Turbopack flavour — not `@serwist/next`**

```bash
npm i -D -w web @serwist/turbopack@9.5.12 serwist@9.5.12 esbuild@^0.28.2
```

`@serwist/next` is webpack-only and Next 16 builds with Turbopack. **Both packages declare `next: ">=14.0.0"`, so npm warns on neither** — installing the wrong one fails at build or, worse, at runtime.

- [ ] **Step 2: Create the worker**

`web/app/sw.ts`:

```ts
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
```

If `ServiceWorkerGlobalScope` fails to resolve (TS2552), `"webworker"` is missing from `web/tsconfig.json`'s `lib`. Task 1 put it there; verify rather than working around it.

- [ ] **Step 3: Create the route that serves the worker**

`web/app/serwist/[path]/route.ts`:

```ts
import { createSerwistRoute } from "@serwist/turbopack";

/**
 * `useNativeEsbuild: true` is required, not optional.
 *
 * @serwist/turbopack declares BOTH `esbuild` and `esbuild-wasm` as peers and
 * defaults to the wasm one. The documented install line installs only
 * `esbuild`, leaving the wasm import unresolvable — which surfaces as Serwist
 * issue #360: a RUNTIME `ERR_MODULE_NOT_FOUND` during page-data collection,
 * not a compile error. This flag is the verified one-line fix.
 *
 * `swUrl` is NOT an option here (TS2353) — it belongs on <SerwistProvider>.
 */
export const { GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
});
```

- [ ] **Step 4: Wire the provider, manifest and offline page**

`web/next.config.mjs`:

```js
import withSerwistInit from "@serwist/turbopack";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withSerwist = withSerwistInit({ swSrc: "app/sw.ts" });

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSerwist(withNextIntl(nextConfig));
```

`web/app/layout.tsx` — add inside `<body>`, wrapping the intl provider:

```tsx
import { SerwistProvider } from "@serwist/turbopack/react";
```

```tsx
<body>
  <SerwistProvider swUrl="/serwist/sw.js">
    <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
  </SerwistProvider>
</body>
```

and add to `metadata`: `manifest: "/manifest.webmanifest"`.

`web/public/manifest.webmanifest`:

```json
{
  "name": "Family Wellness Platform",
  "short_name": "Wellness",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": []
}
```

`web/app/~offline/page.tsx`:

```tsx
export default function OfflinePage() {
  return (
    <main>
      <h1>You are offline</h1>
      <p>Today&apos;s plan is available; anything new will load when you reconnect.</p>
    </main>
  );
}
```

- [ ] **Step 5: Prove it from a production build — the only proof that counts**

```bash
npm run build:web 2>&1 | tail -20
PORT=3001 npm run start:web &
sleep 5
curl -s -o /dev/null -w '/serwist/sw.js -> %{http_code} (%{content_type}, %{size_download} bytes)\n' localhost:3001/serwist/sw.js
curl -s -o /dev/null -w '/sw.js         -> %{http_code}\n' localhost:3001/sw.js
curl -s -o /dev/null -w '/~offline      -> %{http_code}\n' localhost:3001/~offline
curl -s -o /dev/null -w '/manifest      -> %{http_code}\n' localhost:3001/manifest.webmanifest
kill %1
```

Expected, matching the spike:

- build log contains a `(serwist)` precache-entries line
- `/serwist/sw.js` → **200**, `application/javascript`, tens of KB
- `/sw.js` → **404** — this confirms the worker is NOT at the origin root
- `/~offline` and the manifest → 200

If the build fails with `Cannot find package 'esbuild-wasm'`, `useNativeEsbuild: true` is missing or misspelled. Do not install `esbuild-wasm` to work around it — that is treating the symptom.

- [ ] **Step 6: Verify and commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ package-lock.json && git commit -m "build: precache the app shell with Serwist via Turbopack"
```

---

### Task 8: The elderly-mode seam

**Files:**

- Create: `web/src/ui/ElderlyModeProvider.tsx`, `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Test: `web/src/__tests__/elderlyMode.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `<ElderlyModeProvider role={role}>`, where `role` is `"admin" | "adult" | "child" | "elderly" | null`.

- [ ] **Step 1: Write the failing test**

`web/src/__tests__/elderlyMode.test.tsx`:

```tsx
import { render } from "@testing-library/react";

import { ElderlyModeProvider } from "../ui/ElderlyModeProvider";

describe("ElderlyModeProvider", () => {
  it("applies the elderly scale for the elderly role", () => {
    const { container } = render(
      <ElderlyModeProvider role="elderly">
        <p>content</p>
      </ElderlyModeProvider>,
    );

    expect(container.firstElementChild).toHaveAttribute("data-elderly-mode", "on");
  });

  it("leaves the default scale for every other role, including no role", () => {
    for (const role of ["admin", "adult", "child", null] as const) {
      const { container } = render(
        <ElderlyModeProvider role={role}>
          <p>content</p>
        </ElderlyModeProvider>,
      );

      expect(container.firstElementChild).toHaveAttribute("data-elderly-mode", "off");
    }
  });
});
```

The `null` case is the one slice 1 actually exercises: a brand-new user has no family and therefore no role.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:web`
Expected: FAIL — the provider does not exist.

- [ ] **Step 3: Implement the provider and the custom properties**

`web/src/ui/ElderlyModeProvider.tsx`:

```tsx
import type { ReactNode } from "react";

export type FamilyRole = "admin" | "adult" | "child" | "elderly";

/**
 * Mechanism, not feature. Slice 1 cannot render elderly mode for real — a new
 * user has no family and therefore no role — but retrofitting a type scale
 * across a built UI is far more expensive than carrying the seam from the
 * start. The switch is one attribute; the values live in CSS custom properties.
 */
export function ElderlyModeProvider({
  role,
  children,
}: {
  role: FamilyRole | null;
  children: ReactNode;
}) {
  return <div data-elderly-mode={role === "elderly" ? "on" : "off"}>{children}</div>;
}
```

`web/app/globals.css`:

```css
:root {
  --type-scale-base: 1rem;
  --type-scale-heading: 1.75rem;
  --contrast-foreground: #1a1a1a;
  --contrast-background: #ffffff;
}

[data-elderly-mode="on"] {
  --type-scale-base: 1.375rem;
  --type-scale-heading: 2.25rem;
  --contrast-foreground: #000000;
  --contrast-background: #ffffff;
}

body {
  font-size: var(--type-scale-base);
  color: var(--contrast-foreground);
  background: var(--contrast-background);
}

h1 {
  font-size: var(--type-scale-heading);
}
```

Import `./globals.css` at the top of `web/app/layout.tsx` and wrap the intl provider in `<ElderlyModeProvider role={null}>`.

- [ ] **Step 4: Verify and commit**

```bash
npm run test:web && npm run typecheck:web && npm run lint:web && npm run format:check
git add web/ && git commit -m "feat: carry the elderly-mode seam from the first screen"
```

---

### Task 9: End-to-end, CI and documentation

**Files:**

- Create: `web/playwright.config.ts`, `web/e2e/onboarding.spec.ts`
- Modify: `.github/workflows/ci.yml`, `README.md`, `web/package.json`, `package.json`

**Interfaces:**

- Consumes: everything above.

**The spec below is OTP-only and it reaches consent with an explicit `page.goto("/consent")`, so it cannot catch a routing bug: it never asks the app where a new user belongs.** That is exactly how a first-time Google user came to land on `/home` — signed in, with no `users` row, no consent record and no display name — while every test stayed green. Task 9 must additionally cover **the OAuth journey's routing**, and at minimum the assertion that carries it: with a fresh session that has not registered, `page.goto("/home")` must end on `/consent`, never on the home screen. Driving Google's own consent screen is not feasible in CI, so drive the seam rather than the provider — mint a Supabase session for an unregistered account (the local stack's admin API), then navigate. Add it as a second `test()` in the same spec; the unit test at `web/app/home/__tests__/page.test.ts` proves the decision, and this proves the redirect actually happens in a browser.

- [ ] **Step 1: Install Playwright and configure it**

```bash
npm i -D -w web @playwright/test
npx playwright install --with-deps chromium
```

`web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:3001" },
  // Deliberately a production build: the service worker only exists there, and
  // `next dev` would prove nothing about the PWA.
  webServer: {
    command: "npm run build && PORT=3001 npm run start",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
```

Add to `web/package.json` scripts: `"e2e": "playwright test"`, and to the root: `"e2e:web": "npm run e2e -w web"`.

- [ ] **Step 2: Write the journey spec**

`web/e2e/onboarding.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * Drives the real journey against a real Supabase stack and a real Express API.
 * The OTP is read from the local stack's mail catcher rather than guessed —
 * a hardcoded code would make this a test of nothing.
 */
test("sign in, consent, home", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.test`;

  await page.goto("/");
  await expect(page.getByRole("heading")).toBeVisible();

  // Request the OTP through our own route handler, exactly as the UI does.
  const otp = await request.post("/api/auth/otp", { data: { contact: email } });
  expect(otp.status()).toBe(200);

  // Mailpit is part of the Supabase local stack (see `npx supabase status`).
  const code = await readLatestOtp(request, email);

  const verify = await request.post("/api/auth/verify", { data: { contact: email, code } });
  expect(verify.status()).toBe(200);

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name.startsWith("sb-"));
  expect(session, "a session cookie must exist").toBeDefined();
  expect(session?.httpOnly, "the session cookie must be httpOnly").toBe(true);

  await page.goto("/consent");
  await page.getByRole("checkbox").check();
  await page.getByRole("button").click();

  await expect(page).toHaveURL(/\/home$/);
});

async function readLatestOtp(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<string> {
  const inbox = await request.get(`http://127.0.0.1:54324/api/v1/search?query=${email}`);
  const body = (await inbox.json()) as { messages: { ID: string }[] };
  const id = body.messages[0]?.ID;
  if (id === undefined) {
    throw new Error(`no OTP mail arrived for ${email}`);
  }

  const message = await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`);
  const text = ((await message.json()) as { Text: string }).Text;
  const match = /\b(\d{6})\b/.exec(text);
  if (match?.[1] === undefined) {
    throw new Error("no six-digit code found in the OTP mail");
  }
  return match[1];
}
```

The httpOnly assertion appears here as well as in Task 4's unit test on purpose. The unit test proves the handler asks for it; this proves the browser actually received it.

- [ ] **Step 3: Add web to CI**

In `.github/workflows/ci.yml`, add to the `verify` job after the backend steps:

```yaml
- name: Lint web
  run: npm run lint:web

- name: Typecheck web
  run: npm run typecheck:web

- name: Test web
  run: npm run test:web

# A production build is the only thing that proves the service worker
# route resolves — Serwist #360 is a runtime failure, so a passing
# `next build` of the app alone is not evidence.
- name: Build web
  run: npm run build:web
```

E2E is deliberately not added to CI in this slice: it needs the Supabase stack and the API running together, which is its own piece of work. Say so in the report rather than quietly omitting it.

- [ ] **Step 4: Update the README**

Add a `web` section covering: the two workspaces and how to run them together (the API on 3000, the web app on 3001), the three new environment variables and **which file the web workspace actually reads them from** — determine this by testing, exactly as the backend's `api/.env` location was determined in slice 0; do not assume it mirrors the backend. Also `npm run dev:web`, and — with its own short heading — that the PWA must be checked with `npm run build:web && PORT=3001 npm run start:web`, never `dev`. Update the "Repository layout" section, which currently states that `workspaces` lists only `api`.

- [ ] **Step 4b: Apply the spec's §8 amendments to the other documents**

The spec lists five amendments it does not itself apply. Land the three that are now factually settled, and leave the two that are open questions:

1. **UX flows §1** — add the consent step between Authentication and Create/Join Family, noting no health data may be collected before it.
2. **UX flows §2** — correct "issues a short-lived JWT + refresh token" to say Supabase mints the tokens and this app only verifies. The user-visible flow is unchanged.
3. **Engineering roadmap Sprint 2** — it says "ship the canonical email/password auth path", but the UX document has no password anywhere. OTP and OAuth are what ship, so `learn/auth-from-scratch` should teach those.

Do NOT attempt amendments 4 (the iOS Add-to-Home-Screen constraint on Web Push) or 5 (the roadmap having no frontend track). The first belongs with the push work; the second is a planning decision for the user, not a documentation edit. Say in your report that you deliberately left both.

- [ ] **Step 5: Verify from a fresh clone**

```bash
cd "$(mktemp -d)" && git clone /home/makima/wellness_platform fresh && cd fresh
git checkout <this branch>
# then follow ONLY the README's web instructions, literally
```

Any step that is missing, misordered or wrong is a README bug: fix it in the real repo and start over from a fresh clone. Report the count and the elapsed time.

- [ ] **Step 6: Final verification and commit**

```bash
npm test && npm run test:web && npm run lint && npm run lint:web \
  && npm run typecheck && npm run typecheck:web && npm run format:check
npm run e2e:web
git add . && git commit -m "test: drive the onboarding journey end to end"
```

---

## Verification Summary

| Claim                                        | Command                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| The session cookie is httpOnly               | Task 4's unit test, and again in Task 9's E2E against a real browser         |
| `createBrowserClient` cannot be reintroduced | Task 3 Step 6 — the probe file must fail lint                                |
| The proxy sends a Bearer token and no cookie | `npm run test:web` — `upstream.test.ts`                                      |
| A 403 survives the proxy as a 403            | Task 5's `app/api/me/__tests__/route.test.ts` — the handler, not `callApi`   |
| A dead upstream is a 502 envelope, not a 500 | same suites, both handlers                                                   |
| Copy comes from the catalogue, not literals  | `landing.test.tsx`, including the missing-key case                           |
| Consent posts the policy version shown       | `consent.test.tsx`                                                           |
| An unregistered user cannot reach /home      | `app/home/__tests__/page.test.ts` — the guard, including the OAuth case      |
| A double click posts one registration        | `consentPage.test.tsx`                                                       |
| The service worker actually serves           | Task 7 Step 5 — `/serwist/sw.js` 200 **and** `/sw.js` 404, from `next start` |
| The whole journey works                      | `npm run e2e:web`                                                            |
| The backend is unaffected                    | `npm test` — 40 unit, unchanged throughout                                   |
