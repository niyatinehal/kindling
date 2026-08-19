# Theming Foundation — Light and Dark: Design

**Status:** Approved for implementation planning
**Author:** Niyati (Product) + Claude (drafting support)
**Date:** 2026-08-19
**Companion to:** `2026-08-17-guest-mode-design-system-design.md` (the tokens this rests on)
**Implements:** A second skin for every screen, and a switch between them
**Branched from:** `main` @ `d11dc7d`

---

## 1. Context

The app works and is unremarkable to look at. Asked what was actually wrong with it, the answer was three things: it looks plain, nothing about using it feels rewarding, and progress never becomes visible. Notably _not_ on the list — moving around it. There is no appetite for a tab bar or restructured navigation.

Hevy was the reference point. It could not be examined directly, only read about, so what carried over is how it behaves rather than how it looks: density where it is earned, a satisfying completion moment, and progress that visibly accumulates. Its home screen is a social feed, which is wrong here and is not being copied — health data in this app sits behind consent records and family visibility controls, and a feed is the opposite of that.

Of three visual directions, the chosen one puts today's numbers on a deep ink panel and keeps everything that is _read_ on a light ground. Plus a light/dark toggle.

That scope — every screen including sign-in, a new look, rewards, and real goals — is not one piece of work. It is three, and this document covers only the first:

1. **Theming foundation** (this spec) — the dark palette as real tokens, a cookie-driven theme, the toggle, every existing screen made theme-correct. Nothing changes shape.
2. **The look** — hero, rings, sparkline, type scale, across all ten screens. Pure frontend.
3. **Rewards and goals** — the completion animation, personal targets, a real streak. The only piece needing API and schema work.

This one is first because the other two sit on it, and because it is shippable on its own: the app gains a second skin and a switch, and looks otherwise identical.

## 2. Decisions

**D1 — Tokens split into two layers.** Raw values become `--c-*` custom properties on `:root` and `:root[data-theme="dark"]`. The existing `@theme` block becomes `@theme inline` and maps each `--color-*` to the matching `var(--c-*)`.

This was verified rather than assumed: compiling a probe against the installed Tailwind 4.3.3 emits `color: var(--c-ink)` and `background-color: var(--c-canvas)` rather than baking the literal hex. One attribute on `<html>` therefore re-points every utility in the app.

**D2 — The theme is resolved on the server, from a cookie.** `layout.tsx` is already async; it reads a `theme` cookie and renders `<html data-theme=…>`. The correct theme is in the first byte, so there is no flash — by construction, not because a script won a race against the paint.

The cookie is deliberately not httpOnly, unlike the session cookie. It is a display preference with nothing to protect, and the client has to be able to write it.

**D3 — No cookie means the system decides.** Absent the attribute, `@media (prefers-color-scheme: dark)` applies, scoped as `:root:not([data-theme="light"])` so an explicit light choice always wins.

**D4 — `ink` stops doubling as a background.** Today `ink` means both "the darkest colour" (as text) and "the emphasis card's ground". A token cannot mean both once themes swap: remapping `ink` to a light value turns `Card tone="ink"` inside out and puts `accent-glow` on near-white at **1.55:1**. `Card.tsx`'s own comment already recorded the dependency — accent-glow "works there because the ground is dark rather than white."

So the emphasis card gets its own tokens: `--c-emphasis`, `--c-on-emphasis`, `--c-emphasis-label`. In dark the emphasis card **lifts** — lighter than the page rather than darker — which is the same inversion the chosen direction applies to its hero.

**D5 — Shadow and line become theme-dependent, because they change job.** Light cards are separated by `--shadow-card`; a dark shadow on a dark ground is invisible, so in dark the border does that work and `--c-line` steps up to `#24614a` to be equal to it. This is the reason a naive recolour would have looked broken.

**D6 — The toggle lives in `Screen`.** Every screen already sits in that frame, so all ten get it including `/signin` and the landing page, which the full-surface scope requires and which have no hero to carry it. When the hero arrives in sub-project 2, it moves there.

### Rejected alternatives

- **localStorage plus a blocking inline script.** The common approach, and the one that produces the flash of wrong theme when it is got slightly wrong. Rejected because the server already knows the answer.
- **`prefers-color-scheme` only.** A toggle was explicitly asked for. The system preference survives as the default, not as the only input.
- **Tailwind `dark:` variants on components.** Would touch every component and duplicate every colour decision at each call site. The semantic tokens already exist; the swap belongs behind them.

## 3. The palette

| Token                | Light     | Dark      | Role                                  |
| -------------------- | --------- | --------- | ------------------------------------- |
| `--c-ink`            | `#0b3d2e` | `#eaf4ee` | Body text                             |
| `--c-canvas`         | `#f4f7f2` | `#07271d` | Page ground                           |
| `--c-surface`        | `#ffffff` | `#0f3629` | Card ground                           |
| `--c-muted`          | `#5d7166` | `#9dbdab` | Secondary text                        |
| `--c-line`           | `#dde7de` | `#24614a` | Borders — load-bearing in dark        |
| `--c-accent`         | `#15803d` | `#4ade80` | The only fill carrying `surface` text |
| `--c-emphasis`       | `#0b3d2e` | `#164534` | Emphasis card ground                  |
| `--c-on-emphasis`    | `#f4f7f2` | `#eaf4ee` | Text on it                            |
| `--c-emphasis-label` | `#4ade80` | `#4ade80` | The uppercase label on it             |

Measured, not estimated — the same method that produced the figures already recorded in `globals.css`, confirmed by reproducing them exactly (11.29 against the documented 11.3, 5.02 on the nose).

| Pair                                 | Light       | Dark        |
| ------------------------------------ | ----------- | ----------- |
| ink on canvas                        | 11.29:1 AAA | 14.18:1 AAA |
| muted on canvas                      | 4.83:1 AA   | 7.82:1 AAA  |
| `primary` — `bg-accent text-surface` | 5.02:1 AA   | 7.63:1 AAA  |
| `secondary` — `bg-surface text-ink`  | 12.20:1 AAA | 11.82:1 AAA |
| `ghost` — `text-accent` on canvas    | 4.64:1 AA   | 9.15:1 AAA  |
| emphasis label on emphasis           | 7.00:1 AAA  | 6.23:1 AA   |

Dark is the more legible theme on every text pair. The worry that it would be harder for older eyes does not survive the measurements.

`VARIANT_CLASSES` needs no edit at all: `bg-accent text-surface` lands white-on-green in light and dark-green-on-bright in dark, and passes both times.

## 4. What changes

**4.1 `globals.css`** — the restructure in D1, plus the dark block and the `prefers-color-scheme` fallback.

**4.2 `app/layout.tsx`** — reads the cookie, sets `data-theme`, and emits a `<meta name="theme-color">` per scheme so browser chrome follows.

**4.3 `ThemeToggle`** — a client island. Flips `document.documentElement.dataset.theme` immediately and writes the cookie in the background, so it is instant with no reload and no round trip. Rendered by `Screen`.

**4.4 `Card.tsx` and `HomeView.tsx`** — the emphasis tone moves to the D4 tokens. These are the only two component files this touches.

**4.5 Everything else** — unchanged. Verified: every colour in `app/` and `src/` already resolves through a semantic token, and the only hexes outside `globals.css` are inside a comment.

## 5. A defect this surfaces

`BarChart` draws its target line in `accent-glow` on a white `Card`: **1.74:1**, failing the 3:1 that non-text UI needs. The target line is the reference the whole chart is read against, and it is very nearly invisible today.

This is pre-existing and unrelated to theming, but it is a token-level fault found while restructuring tokens, so it is fixed here rather than logged and forgotten. The line moves to `--c-accent`, which measures 5.02:1 on the white card and 7.63:1 on the dark one.

## 6. Testing

`web/src/pwa/__tests__/manifest.test.ts` **will break** and must be repointed: it parses `--color-canvas:\s*(#……)` out of `globals.css`, and after D1 that token holds `var(--c-canvas)`. It should read the `:root` block instead.

New:

- **Token parity** — every `--c-*` defined in light has a dark counterpart, so a missed token cannot silently leave a light colour on a dark page.
- **Contrast** — computes the ratios in section 3 for both themes and asserts the thresholds. `globals.css` claims its figures are measured; this makes the claim enforceable, so a future tweak that drops `primary` below AA fails CI instead of shipping.
- **Toggle** — cookie written, attribute flipped, no reload.
- **SSR** — a `theme=dark` cookie renders `data-theme="dark"` in the server output; no cookie renders no attribute.

The existing 228 web and 109 api tests stay green.

## 7. Out of scope

- Hero, progress rings, sparkline, streak chip, completion animation — sub-project 2.
- Personal goals, real streak history, any API or schema change — sub-project 3.
- The install splash stays light in both themes. A manifest carries one `theme_color`, and per-scheme `<meta>` covers browser chrome but not the PWA splash. Accepted.

## 8. Risks

**R1 — `@theme inline` is verified for colour utilities only.** The shadow token takes a different code path and must be checked the same way before relying on it.

**R2 — Ten screens must be looked at in both themes.** The contrast test catches illegibility; it cannot catch ugliness. Eyeballing is part of the work, not a follow-up.

**R3 — The lifted emphasis card in dark is a judgement call.** Measured fine at 9.65:1, but whether "lighter than the page" reads as emphasis the way "darker than the page" does is a matter of taste, and worth a look before it propagates into sub-project 2's hero.

## 9. A correction carried forward

Earlier scoping claimed progress rings would need new API work because water and sleep had no targets. That is wrong: `WATER_TARGET_ML = 2000` and `SLEEP_TARGET_MINUTES = 420` already exist in `DashboardView.tsx`.

So sub-project 2 can ship rings with honest denominators and no backend work. What sub-project 3 adds is making those targets _personal_ rather than app-wide constants — an upgrade, not a prerequisite. The streak finding stands unchanged: `TrackingSummary.days` covers this week only, and a streak computed from a seven-day window is a weekday counter wearing a flame emoji.
