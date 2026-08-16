# Guest Mode, the Design System & One-Command Dev: Design

**Status:** Approved for implementation planning
**Author:** Niyati (Product) + Claude (drafting support)
**Date:** 2026-08-17
**Companion to:** `2026-08-14-frontend-foundations-design.md` (slice 1), `2026-08-14-auth-family-consent-design.md` (Phase A identity)
**Implements:** A guest entry point into the existing onboarding journey; the first visual layer for `web/`; a single command that takes a clone to a running stack
**Branched from:** `feat/slice-1-web` @ `13e08f0`

---

## 1. Context

Slice 1 delivered the onboarding journey end to end — landing, sign-in, consent, home — with httpOnly sessions, a proxy that never leaks a cookie upstream, and a PWA shell. It delivered it entirely without CSS. Every screen in `web/app/` today is raw semantic HTML: correct, tested, and unpresentable.

Three things are wanted, and they are interlocked enough to design together:

- **A guest entry point.** Someone should be able to try the app without committing to an account.
- **A visual layer.** Simple enough that a parent understands it at a glance, elegant enough to feel premium, and coloured so that opening it makes someone slightly more likely to work out.
- **One command.** `npm run dev` should take a fresh clone to a running stack.

They are one document because they are one user-visible change: the guest button lives on a sign-in screen that does not visually exist yet, and neither can be demonstrated without the command that runs both halves of the stack.

This is deliberately **not** a new epic. No tracking endpoints, no workout data, no family flows — those remain where the frontend foundations design put them (Epics 4–6, backend Phase B).

---

## 2. Decisions

| #   | Decision                                                                                                        | Rationale                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **A guest is a real Supabase anonymous user**, created by `signInAnonymously()`, not a synthetic session.       | `users.auth_user_id` is `NOT NULL`, `UNIQUE`, and a foreign key into `auth.users` with `ON DELETE RESTRICT`; every request resolves through a verified ES256 JWT. A fake session would require holes in all three. An anonymous user satisfies them as-is — **no migration, no change to the API**.      |
| D2  | **The guest passes the consent screen like everyone else.**                                                     | Guest data is health data, and DPDP requires consent captured at collection. `registerBody.refine()` already refuses a registration without `health_data` consent. Auto-consenting on the user's behalf would record an agreement they never gave.                                                       |
| D3  | **Guest-ness is read from the session's `is_anonymous`, never from a query parameter or a column.**             | It is already a claim on the Supabase JWT and already on the session server-side. A `?guest=1` param is spoofable; a `users` column is a migration that buys nothing the token does not already carry.                                                                                                   |
| D4  | **Account claiming is designed for but not built.**                                                             | `updateUser({ email })` / `linkIdentity()` on an anonymous user preserves `auth.users.id`, therefore `authUserId`, therefore the domain row and everything logged against it. D1 is what makes claiming a later one-screen addition rather than a data migration. Shipping a dead button would be worse. |
| D5  | **Tailwind v4, proven against Turbopack before any screen is built.**                                           | Chosen by the product owner. This repo has already been bitten by a plausible-looking integration (`@serwist/next` is webpack-only; its peer range does not say so). The toolchain is therefore validated by `next build && next start` plus a real request as task 1, not assumed.                      |
| D6  | **Design tokens are semantic, not literal.** Components reference `--color-accent`, never `--color-green-600`.  | The palette was chosen from three candidates and may be revisited. Semantic tokens keep a repaint a one-file edit instead of a find-and-replace across every component.                                                                                                                                  |
| D7  | **`#15803D` is the primary action colour, not `#16A34A`.**                                                      | White on `#16A34A` measures **3.30:1** — below WCAG AA's 4.5:1 for normal text, which a button label is. White on `#15803D` measures **5.02:1**. Same palette, same feel, passes.                                                                                                                        |
| D8  | **`/home` ships a dashboard shell with honest empty states**, not fabricated data.                              | The structure is what proves the design language; invented step counts would be fiction rendered as fact, and would have to be torn out when the real endpoints land.                                                                                                                                    |
| D9  | **`scripts/dev.sh` is idempotent at every step**, and is both the fresh-clone command and the everyday command. | Two commands with different preconditions is the thing that rots. A step that no-ops when already satisfied can be run unconditionally, so there is nothing to remember.                                                                                                                                 |
| D10 | **The dev script writes the Supabase keys into the env files.**                                                 | Copying `ANON_KEY` and `SERVICE_ROLE_KEY` out of `supabase status` by hand is the step most likely to break a fresh clone, and the only one the README cannot make idempotent. `supabase status -o json` exposes both; `api/.env` and `web/.env.local` are both gitignored.                              |
| D11 | **Ctrl-C stops the apps and leaves Supabase running.**                                                          | Tearing down Docker on every interrupt makes the next start slow enough that people stop using the command. `npm run stop` exists for when the teardown is actually wanted.                                                                                                                              |

### Rejected alternatives

- **A synthetic guest session with the API relaxed to accept it.** Requires making `auth_user_id` nullable, adding an unauthenticated path through the auth middleware, and maintaining a second notion of "who is calling" forever. It converts a config flip into a permanent security surface. Rejected.
- **One shared seeded demo account.** Trivial to build, and every guest sees every other guest's health data. Unusable the moment two people are shown the app at once. Rejected.
- **A read-only guest tour with fabricated data.** Zero friction and no consent needed, but it forks `/home` into a real path and a fake path that drift apart, and the guest never gets to try the thing the app is for. Rejected.
- **CSS Modules with a hand-rolled token layer.** Fewer dependencies and closer to this repo's existing ethos. Not chosen — Tailwind v4 was preferred for authoring speed. D5 exists because that trade buys a toolchain risk that has to be paid down explicitly.

---

## 3. Guest mode

### 3.1 The flow

```
/signin  "Continue as a guest"
  → POST /api/auth/guest      signInAnonymously() → httpOnly session cookie
  → GET  /api/me              403 REGISTRATION_REQUIRED
  → /consent                  isGuest: name pre-filled, copy explains guest mode
  → POST /api/register        display_name + health_data consent
  → /home                     guest chip in the header
```

The point of this design is what is **absent** from it. `nextStep()` is not touched. The auth middleware is not touched. `registerUser` is not touched. A guest is a user who signed in differently, and every screen after the button treats them as exactly that.

### 3.2 What changes

| File                              | Change                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `supabase/config.toml`            | `enable_anonymous_sign_ins = true`                                                      |
| `web/app/api/auth/guest/route.ts` | **New.** `signInAnonymously()`, mirroring `/api/auth/verify`'s shape and error envelope |
| `web/app/signin/page.tsx`         | "Continue as a guest" below the Google link; same `nextStep()` routing as the OTP path  |
| `web/app/consent/page.tsx`        | Becomes a server component that reads `is_anonymous` and wraps the existing client form |
| `web/app/consent/ConsentForm.tsx` | Accepts `isGuest`; pre-fills the name, shows guest copy                                 |
| `web/messages/en.json`            | `signin.guest`, `consent.guestBody`, `home.guestChip`, `errors.GUEST_SIGNIN_FAILED`     |

`/consent` gaining a server wrapper follows the pattern `/home` already established: `page.tsx` is async and does the server-side lookup, a sibling component holds the hooks.

### 3.3 Failure

`signInAnonymously()` failing — most likely because the config flip has not been applied to a given environment — returns `{ error: { code: "GUEST_SIGNIN_FAILED" } }` with a 502, and the sign-in screen renders it through the existing `errors` message lookup. The reason is logged, never returned, matching `/api/auth/otp`.

### 3.4 Deferred, with the reason it is safe to defer

**Claiming an account.** `updateUser({ email })` or `linkIdentity()` promotes the anonymous user in place. The `auth.users.id` does not change, so `authUserId` does not change, so the domain row and every record pointing at it survive untouched. `/home` therefore shows a **guest chip and a sentence**, not a claim button — the sentence can promise that nothing is lost later because D1 makes that true.

**Anonymous user cleanup.** Anonymous accounts accumulate in `auth.users` indefinitely. `ON DELETE RESTRICT` means they cannot simply be deleted while a domain row references them: the `users` row must be soft-deleted or anonymised first, then the auth account removed — the sequence the README already documents for account deletion generally. This is a real operational obligation and it is **not** built here. See §7.

---

## 4. The design system

### 4.1 Proving the toolchain first

Tailwind v4 under Next 16's Turbopack default, alongside Serwist's precache, is an integration this repo has not run. The frontend foundations design's own risk table records what happens when a peer range is taken as evidence. Task 1 is therefore a single styled element carried through `next build && next start` and a real HTTP request — the same bar slice 1 set for the service worker. If it does not hold, implementation stops and reports rather than working around it.

### 4.2 Tokens

A `@theme` block in `web/app/globals.css` defines the palette once. Components reference semantic names only.

| Token                   | Value     | Role                                      |
| ----------------------- | --------- | ----------------------------------------- |
| `--color-ink`           | `#0B3D2E` | Body text, deep surfaces                  |
| `--color-canvas`        | `#F4F7F2` | Page ground                               |
| `--color-surface`       | `#FFFFFF` | Cards                                     |
| `--color-accent`        | `#15803D` | Primary actions, any white-on-colour text |
| `--color-accent-bright` | `#16A34A` | Large accents, non-text                   |
| `--color-accent-glow`   | `#4ADE80` | Progress fills, accents on dark           |
| `--color-muted`         | `#6B7F73` | Secondary text                            |
| `--color-line`          | `#DDE7DE` | Borders                                   |

**Measured contrast:**

| Pair                              | Ratio      | Verdict                    |
| --------------------------------- | ---------- | -------------------------- |
| `--color-ink` on `--color-canvas` | **11.3:1** | Passes AAA                 |
| White on `--color-accent`         | **5.02:1** | Passes AA                  |
| White on `--color-accent-bright`  | **3.30:1** | Fails AA for text — see D7 |

### 4.3 Legibility constraints

Non-negotiable, because "a parent understands it" is a requirement and not a preference:

- 17px base body size
- 48×48px minimum interactive target
- Visible focus rings, never `outline: none`
- One primary action per screen
- Copy in plain language — no jargon, no unexplained icons

### 4.4 Components

`web/src/ui/`, alongside the existing `src/api` and `src/onboarding`. Scope is driven strictly by what the six screens need:

`Button` (primary / secondary / ghost) · `Field` (label, input, error) · `Card` · `Alert` (the existing `role="alert"` envelope rendering) · `Screen` (layout wrapper)

### 4.5 Screens

| Screen      | Treatment                                                                              |
| ----------- | -------------------------------------------------------------------------------------- |
| `/`         | Landing: title, subtitle, one primary action                                           |
| `/signin`   | OTP flow, Google, guest — one card, large fields                                       |
| `/consent`  | Single required decision, plain-language body, guest variant                           |
| `/home`     | Greeting, "Today" card in empty state, stat tiles reading `—`, family card, guest chip |
| `/error`    | Plain, calm, one way back                                                              |
| `/~offline` | Matches the shell so the offline state does not look broken                            |

New copy lands in `messages/en.json`. `hi.json` is `{}` and Hindi copy stays deferred per the frontend foundations design; this work neither fixes nor worsens that.

---

## 5. One-command dev

`scripts/dev.sh`, wired to root `npm run dev`. Each step is a no-op when already satisfied.

1. **Docker reachable?** If not, fail with a sentence saying what to start.
2. **Ports 3000 and 3001 free?** Checked up front — otherwise the API dies on `EADDRINUSE` and Next silently drifts to 3002, leaving a working app at an address nobody was told about.
3. **Supabase up?** `supabase start` if not, then poll until Postgres _answers_ — not merely until the command returns.
4. **Env files exist?** Create `api/.env` and `web/.env.local` from `.env.example` if missing.
5. **Keys filled?** Read `supabase status -o json`; write `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` if empty. Both files are gitignored (D10).
6. **Prisma client generated?** Generate if `api/generated/prisma` is absent.
7. **Migrations applied?** `prisma migrate deploy`.
8. **Run both**, via `concurrently`: API on 3000, web on 3001, prefixed logs, one Ctrl-C stops both.

`concurrently` is a new root **devDependency** — the only dependency this section adds. A `trap`-and-`wait` shell equivalent was considered and rejected: it costs more lines than it saves and handles partial failure worse than a tool built for it.

Web's port is pinned in `web/package.json` (`next dev -p 3001`) so it no longer depends on 3000 happening to be occupied. `dev:api` and `dev:web` remain for running one alone. Seeding stays opt-in — the seed creates real Supabase auth accounts and is not verified idempotent.

CI does not invoke `npm run dev`, so the redefinition breaks nothing there.

---

## 6. Testing

| Layer         | What                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Route handler | `/api/auth/guest` calls `signInAnonymously`; the session cookie it sets carries `HttpOnly`                          |
| Route handler | A failed anonymous sign-in returns a 502 `GUEST_SIGNIN_FAILED` envelope, and the reason does not appear in the body |
| Onboarding    | `nextStep()` is unchanged — a guest reaches `/consent` through the existing 403 seam, asserted rather than assumed  |
| Component     | The consent form pre-fills and shows guest copy when `isGuest`, and does not when not                               |
| Component     | `/home` renders empty states without inventing values, and shows the guest chip only for an anonymous session       |
| Component     | `Button` and `Field` meet the 48px target; focus styling is present                                                 |
| Build         | `next build && next start` plus a real request, proving Tailwind survives Turbopack and the Serwist precache (D5)   |

The `HttpOnly` assertion matters for the same reason it did in slice 1: without it, a switch to a browser client passes every other test while silently exposing the session.

---

## 7. Out of scope

| Deferred                                      | Returns with                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Claiming a guest account (§3.4)               | Its own small slice; the seam is designed, the screen is not built |
| Anonymous user cleanup / retention job (§3.4) | An operational task; requires soft-delete-then-remove ordering     |
| Guest restrictions (e.g. cannot invite)       | Backend Phase B, when membership and roles exist                   |
| Workout, meal and tracking screens            | Epics 4–6 — `/home`'s tiles are shells awaiting those endpoints    |
| Hindi copy                                    | When copy settles                                                  |
| Dark mode                                     | Not requested; tokens are structured so as not to preclude it      |
| Making the seed idempotent                    | Whenever seeding needs to join the one command                     |

---

## 8. Risks

| Risk                                                                                  | Mitigation                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind v4 does not integrate cleanly with Turbopack + Serwist                       | Proven by build **and a real request** as task 1, before any screen work (D5). Failure stops implementation and reports rather than accreting workarounds.       |
| `enable_anonymous_sign_ins` is local config; a deployed environment silently lacks it | The failure is a clean 502 `GUEST_SIGNIN_FAILED` rather than a crash, and the flag is called out in the README as a per-environment step                         |
| Anonymous users accumulate unboundedly in `auth.users`                                | Documented as an operational obligation with the required deletion ordering (§3.4). Not solved here — explicitly named so it is not discovered later.            |
| A guest assumes their data is permanent                                               | The guest chip states the situation plainly. D1 makes the eventual claim flow lossless, so the statement stays true.                                             |
| The palette reads "spa" rather than "workout"                                         | Energy is carried by one saturated accent used sparingly against a light ground, not by overall saturation. Semantic tokens (D6) make a repaint a one-file edit. |
| `supabase status -o json` output keys change between CLI versions                     | The script fails loudly with the key it could not find rather than writing an empty value that surfaces much later as an auth error                              |
| Redefining root `npm run dev` surprises existing muscle memory                        | `dev:api` preserves the old behaviour under a name that says what it does; the README is updated in the same change                                              |
