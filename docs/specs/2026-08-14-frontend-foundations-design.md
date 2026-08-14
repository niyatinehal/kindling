# Frontend Foundations & Onboarding: Design

**Status:** Approved for implementation planning
**Author:** Niyati (Product) + Claude (drafting support)
**Date:** 2026-08-14
**Companion to:** `2026-08-07-family-wellness-platform-ux-flows.md` (the 13 flows), `2026-08-07-family-wellness-platform-prd.md` (§8 NFRs, §17 security), `2026-08-14-auth-family-consent-design.md` (backend Phase A, merged)
**Scope:** The client application's foundations, plus UX flows §1 (Onboarding) and §2 (Authentication) and the consent step those flows are missing. Delivered as two slices. Every other flow is blocked on backend that does not exist yet.

---

## 1. Context

The backend has an identity layer: `POST /api/v1/auth/register` and `GET /api/v1/auth/me`, merged to `main` with CI green. There is no client. The UX flows document specifies thirteen flows in full — entry points, decisions, error and edge cases — so the frontend is thoroughly **designed** and entirely **unbuilt**.

The engineering roadmap does not help here: all nine epics are backend, and Epic 8 ("PWA, Performance & API Versioning") is explicitly _"offline-first PWA architecture, from the backend's side of the contract"_. So a 22-sprint plan produces something no family can open, against a stated constraint that the result must be published for real users.

### The frontend cannot outrun the backend

| UX flow                          | Backend needed             | Buildable now  |
| -------------------------------- | -------------------------- | -------------- |
| §1 Onboarding, §2 Authentication | Phase A — merged           | **Yes**        |
| §4 Family Invitations            | Phase B — specced, unbuilt | No             |
| §3 Profile Setup                 | Epic 3 — not started       | No             |
| §5 Workouts, §6 Meals            | Epic 4                     | No             |
| §7 Tracking, §8 Analytics        | Epics 5–6                  | No             |
| §9 Elderly mode                  | cross-cutting              | Mechanism only |
| §10 Notifications                | Epic 6                     | No             |
| §11 Coach, §13 Payments          | v3 / future                | No             |

Designing screens against endpoints nobody has written would repeat the over-reach avoided by not modelling all 36 entities in Sprint 1. This document therefore covers foundations plus the one journey that is fully supported today.

---

## 2. Decisions

| #   | Decision                                                                                                                                                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Next.js**, and the app must be an installable PWA.                                                                                                                                                 | The user's explicit choice, reaffirmed after I recommended a Vite SPA. The PRD specifies Next.js. F2 turns out to depend on having a server, which vindicates it.                                                                                                                                                                                                    |
| F2  | **Session in httpOnly cookies via `@supabase/ssr`. Sign-in happens server-side, and Next route handlers proxy to Express** with a Bearer token. No token is ever readable by client-side JavaScript. | This is the strongest available answer to a question the Phase A spec deferred with no owner. Health data on a device a teenager shares should not be one XSS away. Express is unchanged — it still only verifies a JWT and cannot tell whether the caller is a browser or a server. **See §5.1: this constrains _where_ sign-in runs, which is easy to get wrong.** |
| F3  | **npm workspaces: `api/` and `web/`**, delivered as its own slice before any frontend code.                                                                                                          | The user chose the fuller restructure over a `web/` directory beside the backend. Isolating it means a migration failure and a frontend failure can never be confused.                                                                                                                                                                                               |
| F4  | **Consent is its own screen after authentication, asking only for `health_data`.** Other consents are collected in context, later.                                                                   | The UX flows have no consent step at all, but `POST /auth/register` requires `health_data` — so onboarding as drawn cannot complete. PRD §17 requires granular consent at collection, not bundled acceptance.                                                                                                                                                        |
| F5  | **i18n wired from the first screen, English catalogue only.**                                                                                                                                        | Retrofitting i18n means revisiting every shipped component; it is the one frontend decision that gets more expensive with delay. Hindi becomes a file to add rather than a refactor.                                                                                                                                                                                 |
| F6  | **Explicit proxy routes, not a catch-all.**                                                                                                                                                          | `app/api/[...path]` forwards anything the browser asks for — an allowlist by omission. Explicit routes mean a new backend endpoint is reachable only when someone deliberately exposes it.                                                                                                                                                                           |

### Rejected alternatives

- **Vite + React SPA.** Recommended and declined. Every Next.js server feature is unused under F2's original framing — but F2 as chosen _requires_ a server, so the objection no longer holds.
- **Catch-all proxy route.** DRYer, and wrong: it exposes the entire backend surface to the browser by default.
- **Browser calls Express directly.** The topology the backend spec assumed. Rejected because it requires a JavaScript-readable token, plus CORS and cookie-domain configuration.
- **Mixed proxy (writes proxied, reads direct).** Halves the proxy code and adds a per-endpoint judgement call, which is where a security downgrade would hide.
- **`web/` beside the backend at the repo root.** Zero disruption to Phase A, but the user chose the proper workspace structure.
- **Consent folded into the sign-up screen.** Fewest taps; reads as bundled consent, which §17 forbids.
- **All four consents up front.** Asks about photo retention before a photo feature exists — uninformed consent.
- **Skipping i18n in slice 1.** Fastest to something visible, most expensive to undo.

---

## 3. Slices

**Slice 0 — the monorepo migration.** Backend moves to `api/`; the root becomes a workspaces package. No frontend code. Ends with CI green and a Docker image that builds _and boots_.

**Slice 1 — `web/` foundations plus flows §1, §2 and the consent screen.**

Slice 0 produces nothing visible. That is deliberate: if the migration and the first React code land together, the first failure is unattributable. Every subsequent flow becomes its own small slice, following its backend epic.

---

## 4. Slice 0 — the migration

### What moves

`src/`, `test/`, `prisma/`, `jest.config.js`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `package.json` → `api/`.

The root gains a workspaces `package.json` listing `api` and `web`.

### What must be rewritten, not moved

| File                               | Why                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| `Dockerfile`                       | COPY paths, build context, and the `dist/src` emit layout |
| `docker-compose.yml`               | build context                                             |
| `.github/workflows/ci.yml`         | working directory per job                                 |
| `prisma.config.ts`                 | schema path and generated-client output                   |
| `.dockerignore`, `.prettierignore` | path prefixes                                             |
| `README.md`                        | every command                                             |

### Two land mines

**The Prisma import chain.** The client generates to `../generated/prisma`, and `src/db/prisma.ts` imports `../../generated/prisma/client.js`. That relative chain is precisely what pins the `dist/src` emit layout that `main`, `npm start` and the Dockerfile `CMD` all hard-code — a fact discovered painfully in Sprint 1 and recorded in `tsconfig.build.json`'s comment. Moving the root moves all of it, and a wrong path here fails at container start, not at compile time.

**Workspace hoisting versus the prune.** The Dockerfile runs `npm prune --omit=dev` and then `rm -rf node_modules/prisma`, both of which assume a single package tree. npm workspaces hoist dependencies to the root, so both behaviours change.

### Definition of done

All 63 tests pass; lint, format and typecheck clean; `docker build` succeeds **and the container boots and serves `/readyz`**; `migrate deploy` and `db seed` work; CI green; a fresh clone following the README reaches a working `/readyz`. Compiling is not the bar — booting is.

---

## 5. Slice 1 — `web/` architecture

**Next.js 16 App Router**, with **Next 15.5.23 as the fallback**. Serwist hooks the build through webpack while Next 16 defaults to Turbopack; its declared peer range (`next: ">=14.0.0"`) is not evidence the integration works. This must be spiked before planning — the Prisma 7 spike caught five wrong assumptions by doing exactly this.

> **Spike outcome (2026-08-14) — see §5.3.** Next 16 stands. The webpack
> objection was real but has a supported answer: Serwist ships a **separate
> Turbopack package**. Two of the three things this paragraph assumed about
> the integration were wrong.

### 5.1 Where sign-in runs — the detail that makes or breaks F2

`@supabase/ssr` offers two clients, and only one of them can produce an httpOnly cookie:

- `createBrowserClient` writes the session through `document.cookie`. **A cookie set by JavaScript cannot be httpOnly** — so this stores the session somewhere any injected script can read. It is marginally better than `localStorage` and does not satisfy F2.
- `createServerClient` writes cookies on the server's response, which **can** be httpOnly.

Therefore every authentication action runs server-side:

| Action              | Where                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Request an OTP      | Route handler → `createServerClient().auth.signInWithOtp()`                                                                                    |
| Verify the OTP code | Route handler → `verifyOtp()` — sets the httpOnly cookie                                                                                       |
| Google OAuth        | Browser redirects to Supabase → returns to `/auth/callback?code=…` → route handler calls `exchangeCodeForSession()` — sets the httpOnly cookie |
| Refresh             | `middleware.ts` via `createServerClient`                                                                                                       |

The browser never calls `supabase-js` for authentication; it posts a phone number or an OTP code to our own route handlers. The OAuth authorization code does transit the browser as a URL parameter, which is the standard and intended flow — it is single-use, short-lived, and worthless without the server's exchange.

This is the concrete reason F1's Next.js choice pays for itself. It is also the easiest thing in this design to get wrong, because reaching for `createBrowserClient` looks natural and fails silently: everything works, and the session is simply readable by any script on the page.

**Session.** Stored in httpOnly cookies as above. `middleware.ts` refreshes it and guards routes.

**Proxy.** `app/api/me/route.ts` and `app/api/register/route.ts`, each reading the session server-side, extracting the access token, and calling Express with an `Authorization: Bearer` header. The session cookie is never forwarded upstream.

**Service worker.** Serwist precaches the app shell so §1's "app shell renders from cache when offline" holds, wired through **`@serwist/turbopack`** — not `@serwist/next`. See §5.3. Background sync is deliberately excluded — it belongs with the tracking endpoints that do not exist.

**i18n.** Every string through a translation layer from the first screen; `web/messages/en.json` populated, `hi.json` empty. Next's App Router dropped built-in i18n routing, so this needs a library — **`next-intl@4.13.6`**, confirmed by the spike. Unlike Serwist it declares Next 16 explicitly (`next: "^12 || ^13 || ^14 || ^15 || ^16"`), so there is no ambiguity to resolve.

### 5.3 The PWA integration, as the spike found it

`@serwist/next` is **webpack-only** — its dependency list includes
`@serwist/webpack-plugin`, and Next 16 builds with Turbopack by default.
Serwist ships **`@serwist/turbopack`** for this, on the same 9.5.12 version
line, so it is neither a fork nor a preview.

|             | `@serwist/next` 9.5.12              | `@serwist/turbopack` 9.5.12             |
| ----------- | ----------------------------------- | --------------------------------------- |
| bundler     | webpack (`@serwist/webpack-plugin`) | Turbopack (`@swc/core`)                 |
| extra peers | —                                   | `esbuild`, `esbuild-wasm` (`>=0.25 <1`) |
| exports     | —                                   | `.`, `./react`, `./schema`, `./worker`  |

**Both declare `next: ">=14.0.0"`.** npm therefore warns on neither, and
installing the wrong one fails at build time or, worse, at runtime. An
open-ended peer range is not evidence of compatibility — the same lesson
this section already recorded, now confirmed against the registry.

**The wiring is not a config wrapper.** It needs five pieces:

- `npm i -D @serwist/turbopack esbuild serwist`
- `next.config.mjs` — `withSerwist({...})`
- `app/sw.ts` — the worker itself
- `app/serwist/[path]/route.ts` — `createSerwistRoute`
- `app/layout.tsx` — `<SerwistProvider swUrl="/serwist/sw.js">`

Plus a web manifest and an offline fallback page at `/~offline`.

The route handler is the consequential difference. The webpack flavour emits
a static `sw.js`; **the Turbopack flavour serves the worker through a Next
route**. Anything assuming `/sw.js` at the origin root is wrong, including
the obvious smoke test.

**Two open upstream bugs sit on this exact path**, both unresolved as of the
spike: Serwist **#360** (2026-07-21), a _runtime_ `ERR_MODULE_NOT_FOUND` in
`createSerwistRoute` on Vercel, and **#363** (2026-07-29), a `register()`
throw. #360 is the dangerous one — it is on the API this path requires, and
it is a runtime failure, so a green build is no evidence against it.

**Therefore slice 1 must prove the PWA from a production build**
(`next build && next start`), never from `next dev`. "Installs and compiles"
counts as nothing.

#### #360 reproduces, and there is a one-line fix

A throwaway scaffold (Next 16.3.1, React 19.2.8, the real dependency set)
reproduced #360 **locally**, not merely on Vercel:

```
Error: Cannot find package 'esbuild-wasm' imported from
  .next/server/chunks/[root-of-the-server]__1quudrk._.js
  code: 'ERR_MODULE_NOT_FOUND'
> Build error occurred
Error: Failed to collect page data for /serwist/[path]
```

The cause is that `@serwist/turbopack` declares **both** `esbuild` and
`esbuild-wasm` as peers and defaults to the wasm one. Installing `esbuild`
alone — which the documented install line tells you to do — leaves the wasm
import unresolvable.

**Fix: pass `useNativeEsbuild: true` to `createSerwistRoute`.** With it the
build succeeds, and the fallback to `@serwist/next` + `--webpack` is not
needed. Verified end to end against `next build && next start`:

| Check            | Result                                                         |
| ---------------- | -------------------------------------------------------------- |
| `next build`     | ✓ compiled; `(serwist) 18 precache entries (603.25 KiB)`       |
| `/serwist/sw.js` | **200**, `application/javascript`, 41,432 bytes, real manifest |
| `/sw.js`         | **404** — confirms the worker is not at the origin root        |

Two further gotchas the scaffold surfaced, both silent until they aren't:

- **`swUrl` is not an option of `createSerwistRoute`** (TS2353). It belongs
  only on `<SerwistProvider swUrl=…>`. The docs' prose invites the mistake.
- **`app/sw.ts` needs `"webworker"` in `tsconfig.json`'s `lib`**, or
  `ServiceWorkerGlobalScope` fails to resolve (TS2552).

**Elderly mode.** Built as a mechanism, not exercised: a role-driven provider plus CSS custom properties for type scale and contrast. A brand-new user has no family and therefore no role, so slice 1 cannot render it. The seam is cheap now and expensive to retrofit.

---

## 6. The onboarding journey

```
/                    landing (§1)
  → sign in           browser POSTs contact/code to OUR route handlers,
                      which call Supabase server-side (see §5.1)
                      OAuth: redirect → /auth/callback → exchangeCodeForSession
  → the server sets an httpOnly session cookie
  → middleware.ts refreshes it on every request
  → GET /api/me      Next route → Express /api/v1/auth/me
        403 REGISTRATION_REQUIRED → /consent
        200                       → /home
  /consent           one required decision: health_data (§17)
  → POST /api/register  Next route → Express /api/v1/auth/register
  → /home            "You are not in a family yet" — family flows are slice 2
```

**The 403 is a route, not an error.** It is the seam between "Supabase knows you" and "the product knows you", and it must render as a step in onboarding rather than a failure. The UX flows lack it because they predate the client-direct auth split.

**No password anywhere**, matching the UX document: phone/email OTP and Google only.

### Consent screen content

One required decision. Plain language: what health data the app stores, why, and that it can be exported or deleted later. `policy_version` is sent with the consent and must match the copy shown, so an audit can reproduce exactly what was agreed to.

Marketing consent is collected in Settings; photo-retention consent at the first upload; guardian consent when an Admin invites a Child.

---

## 7. Testing

| Layer         | What                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component     | The consent screen's required-decision logic; error-envelope rendering                                                                                                                   |
| Route handler | The proxy attaches the Bearer token from the session; it never forwards the session cookie upstream; a 403 from Express surfaces as 403, not 500                                         |
| Route handler | **The session cookie set at sign-in carries the `HttpOnly` attribute.** This is the assertion that keeps F2 true — without it, a switch to `createBrowserClient` passes every other test |
| End-to-end    | One Playwright run: sign in → consent → home                                                                                                                                             |

The route-handler tests matter most. A proxy that leaks the session cookie upstream, or that flattens a status code, fails in a way no component test would catch. UX flows §1 and §2 convert almost line-for-line into the Playwright script.

---

## 8. Amendments to existing documents

1. **UX flows §1** has no consent step, so onboarding as drawn cannot complete against the API. A consent screen belongs between Authentication and the Create/Join Family step, before any health data is collected.
2. **UX flows §2** describes issuing "a short-lived JWT + refresh token" as though the app mints them. Supabase mints them; the client stores the session in httpOnly cookies and this app only verifies. The user-visible flow — enter a phone, receive an OTP — is unchanged.
3. **Engineering roadmap Sprint 2** says "ship the canonical email/password auth path". The UX document has no password anywhere. OTP and OAuth are what ships, so `learn/auth-from-scratch` should teach those rather than bcrypt.
4. **PRD §8** lists Next.js for the client, which stands. It does not mention that a PWA on iOS requires an Add-to-Home-Screen install before Web Push works at all (iOS 16.4+) — a constraint that shapes flow §10's install prompt timing.
5. **The roadmap has no frontend track.** Nine backend epics, and Epic 8 is backend-side. Either the roadmap gains a parallel frontend track or "published for real users" needs restating — this document does not resolve that, but it should not stay implicit.

---

## 9. Out of scope

| Deferred                                     | Returns with                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Family create/join/invite screens (§4)       | Backend Phase B                                                                                |
| Profile setup (§3)                           | Epic 3                                                                                         |
| Workouts, meals, tracking, analytics (§5–§8) | Epics 4–6                                                                                      |
| Background sync for offline writes (§7)      | The tracking endpoints — and it makes idempotency a backend requirement, not a frontend detail |
| Push notifications (§10)                     | Epic 6, plus the iOS install constraint above                                                  |
| Hindi copy                                   | When copy settles; the mechanism ships in slice 1                                              |
| Elderly mode wired to a real role (§9)       | Phase B, when membership exists                                                                |
| AI coach (§11), payments (§13)               | v3 / future                                                                                    |

---

## 10. Risks

| Risk                                                                                         | Mitigation                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serwist hooks webpack; Next 16 defaults to Turbopack. A declared peer range is not evidence. | ~~Spike before planning. Fall back to Next 15.5.23.~~ **Spiked 2026-08-14 (§5.3): use `@serwist/turbopack`. Next 16 stands; the fallback is now webpack, not Next 15.** |
| The migration breaks Docker or CI silently                                                   | Slice 0's bar is a container that **boots**, not one that builds                                                                                                        |
| Prisma's `../../generated` import chain moves with the root                                  | Explicitly re-verified after the move; this is what pins the `dist/src` layout                                                                                          |
| Workspace hoisting changes `npm prune --omit=dev`                                            | Verify the runtime image still lacks the Prisma CLI and still contains `@prisma/client`                                                                                 |
| `next-intl` compatibility with Next 16                                                       | Pinned during the spike                                                                                                                                                 |
| The proxy could forward the session cookie upstream                                          | An explicit test asserts it does not                                                                                                                                    |
| `createBrowserClient` is reached for instead of `createServerClient`                         | It fails **silently** — sign-in works, the cookie is simply not httpOnly and any script can read the session. A test must assert the session cookie carries `HttpOnly`. |
| `next-pwa` looks like the obvious choice                                                     | It was last published in August 2022. Serwist 9.5.12 is the maintained path.                                                                                            |
| `@serwist/next` looks like the obvious Serwist package for a Next app                        | It is webpack-only. Under Next 16's Turbopack default the correct package is `@serwist/turbopack`, and neither one's peer range will tell you.                          |
| A green `next build` means the service worker works                                          | Serwist #360 is a **runtime** failure in `createSerwistRoute`. Only `next build && next start` plus a real request proves it.                                           |
