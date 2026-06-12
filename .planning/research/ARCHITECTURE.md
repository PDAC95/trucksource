# Architecture Research — v1.1 OG Rebrand & UI Redesign

**Domain:** App-wide visual rebrand ("Take-Off Parts" → "OG Truck Parts", neon truck-stop identity) on an existing Next.js 16 + Tailwind v4 + shadcn/ui codebase
**Researched:** 2026-06-12
**Confidence:** HIGH — every count, file path, and integration point below was read from the actual codebase (app/, components/, lib/, globals.css, package.json), not inferred

## Scope Frame

This milestone is **visual-only**: routes, Server Actions, RLS, data model, and Supabase schema are untouched, with exactly **one small new data flow** (the freeze-notice realtime refresh, UAT fix #2) and **one data deletion** (vitest-* purge, UAT fix #3). Everything else is CSS tokens, component markup, copy strings, and static assets.

## Existing Architecture Snapshot (what the redesign plugs into)

```
app/
├── layout.tsx                 ← root: next/font (Geist), metadata (STILL "Create Next App"), globals.css
├── globals.css                ← THE theme: Tailwind v4 @theme inline + :root/.dark CSS vars (stock shadcn neutral)
├── (public)/  layout.tsx      ← SiteHeader + children (force-dynamic)
├── (auth)/    layout.tsx      ← centered card column + Toaster (no header)
├── (app)/     layout.tsx      ← auth gate + suspension gate + SiteHeader (+ 2 inline minimal-chrome headers)
├── admin/     layout.tsx      ← AdminSidebar + main (no SiteHeader)
components/
├── ui/                        ← 18 shadcn primitives (CLI-owned, cva variants)
├── {account,admin,auth,comments,layout,listings,messaging,profile,search,seller}/  ← 53 feature components
lib/                           ← no UI; 5 files send brand-named emails
public/                        ← only create-next-app placeholder SVGs (file/globe/next/vercel/window)
app/favicon.ico                ← only icon asset that exists
```

Styling reality check: there is **no per-page CSS** anywhere — globals.css is the only stylesheet. Every component styles itself with Tailwind utilities that resolve through the `@theme` token layer. This is the single highest-leverage fact for the redesign: **palette, radius, and fonts swap centrally; layout/markup changes are per-component.**

## 1. Theme Token System Today — and the Central Swap

### What globals.css contains now

- `@import "tailwindcss"` + `tw-animate-css` + `shadcn/tailwind.css`
- `@custom-variant dark (&:is(.dark *))` — class-based dark variant (currently unused: no ThemeProvider is mounted anywhere; only `components/ui/sonner.tsx` imports `next-themes`' `useTheme`, defaulting to "system")
- `@theme inline { ... }` mapping ~30 Tailwind tokens (`--color-background`, `--color-primary`, `--color-card`, `--color-sidebar*`, `--color-chart-1..5`, `--radius-sm..4xl`, `--font-sans/--font-mono/--font-heading`) to runtime CSS variables
- `:root { ... }` (light) and `.dark { ... }` blocks — **all stock shadcn neutral oklch grays**, zero brand color today
- `@layer base` applying `bg-background text-foreground` + `font-sans`

### What swaps centrally (one file edit, app-wide effect)

| Token group | Where | Effect |
|---|---|---|
| Full palette (background, card, primary, secondary, accent, muted, destructive, border, input, ring, chart-1..5, sidebar-*) | `:root` block in globals.css | Every `bg-card`, `text-primary`, `border`, chart color in all ~85 components flips at once |
| **Dark-only strategy** | Put the neon night palette directly in `:root`; delete the `.dark` block (or make it identical) | No theme toggle, no `dark:` class needed, no next-themes provider; set `<Toaster theme="dark">` or hardcode sonner |
| New brand tokens (neon-red, neon-cyan, glow shadows, sign-border) | Add to `@theme` as `--color-neon-red`, `--color-neon-cyan`, plus `--shadow-glow-*` / utilities via `@utility` | New utilities (`text-neon-cyan`, `shadow-glow-red`) usable everywhere without touching config |
| Radius scale | `--radius` in `:root` | Signage panels likely want tighter radii — one variable |
| Fonts | `app/layout.tsx` (next/font registration) + `@theme` font mapping | See wiring bug below |

### Font wiring — existing bug to fix in the token wave

`app/layout.tsx` registers Geist/Geist_Mono exposing `--font-geist-sans` / `--font-geist-mono`, but `@theme` maps `--font-sans: var(--font-sans)` — a runtime variable **that is never defined**. The body font is currently falling through to browser defaults. The redesign must register the new fonts properly: retro display font (e.g. via `next/font/google` or `next/font/local` if the stakeholder supplies one) exposed as `--font-display`, body font as `--font-body`, then map `--font-heading: var(--font-display)` and `--font-sans: var(--font-body)` in `@theme`. `--font-heading` already exists as a token but is aliased to sans — wiring it to the display font gives headings the signage look wherever components opt in with `font-heading`.

### What does NOT swap centrally (per-component edits)

- **Layout/markup changes**: header structure, signage grids, panel framing — these are JSX edits
- **Hardcoded one-off utilities**: e.g. `thread-view.tsx` message bubbles use `bg-primary`/`bg-muted` (will inherit palette but bubble shape/glow is markup), `suspended-screen.tsx` inline chrome
- **Charts**: `components/ui/chart.tsx` + recharts consume `--chart-1..5` (central), but axis/grid styling is per-component
- **Icons**: lucide-react inherits `currentColor` — free

## 2. Surface Inventory (counted from the codebase)

### Layouts — 5 files + 2 inline header variants

| Layout | Header chrome | Redesign work |
|---|---|---|
| `app/layout.tsx` | none (html/body, fonts, metadata) | fonts, metadata, dark-only class |
| `app/(public)/layout.tsx` | `SiteHeader` | inherits new header |
| `app/(auth)/layout.tsx` | none (centered column) | background treatment only |
| `app/(app)/layout.tsx` | `SiteHeader` + **inline suspended/read-only header** (brand string hardcoded at line 53) | inherits header + edit inline variant |
| `app/admin/layout.tsx` | `AdminSidebar` (no SiteHeader) | sidebar reskin |

### Pages — 31 `page.tsx` + 1 `not-found.tsx` = 32 routed screens

| Route group | Count | Screens |
|---|---|---|
| `(public)` | 3 (+1 not-found) | feed/search (`/`), listing detail (`/listings/[id]`), public profile (`/u/[username]`) |
| `(auth)` | 6 | login, register, forgot-password, reset-password, check-email, auth-code-error |
| `(app)` | 10 | account, messages, messages/[threadId], profile/garage, saved, sell, sell/[id]/edit, sell/listings, suspended, verify |
| `admin` | 12 | dashboard/analytics (`/admin`), fitment, fitment/[level], import, listings, listings/[id], messages, messages/threads/[id], reports, reports/[targetKey], users, users/[id] |

### Shared components

| Bucket | Count | Notes |
|---|---|---|
| `components/ui/` shadcn primitives | **18** | alert-dialog, badge, button, card, chart, checkbox, dialog, dropdown-menu, form, input, input-otp, label, radio-group, select, sheet, skeleton, sonner, textarea |
| `components/` feature components | **53** | account 4 · admin 11 · auth 4 · comments 2 · layout 2 (site-header, user-menu) · listings 8 · messaging 7 · profile 4 · search 10 · seller 1 |
| Route-colocated components in `app/` | **8** | contact-preference-form, add-truck-dialog, truck-card, truck-cascade, sold-toggle (sell/listings), otp-step, phone-step, terms-step |

Total reskin surface: **5 layouts, 32 screens, 18 primitives, ~61 feature/colocated components** — but because zero components carry their own palette (all token-driven), the realistic hand-edit set is much smaller: the 18 primitives, the chrome (site-header, user-menu, admin-sidebar, suspended-screen), and the per-page hero/grid markup on high-traffic screens (feed, listing detail, public profile, sell form, messages).

## 3. Strategy for Shared Primitives: Restyle In Place

**Recommendation: edit the 18 files in `components/ui/` directly. Do NOT create parallel branded variants.**

Rationale:
- shadcn's whole model is "you own the components" — they are already CLI-vendored into the repo, not a dependency. Editing them is the intended customization path.
- All 61+ feature components and 32 screens consume these primitives; restyling `button.tsx`, `card.tsx`, `input.tsx`, `dialog.tsx` in place updates every consumer in one commit. A `NeonButton` fork would require touching every import site — exactly the per-component churn this milestone should avoid.
- The primitives use `cva` variants. Where the design needs *additional* looks (e.g. a "neon sign" card frame vs. a plain navy panel), **add a variant** (`<Card variant="sign">`) rather than a new component — default variant becomes the navy neon-bordered panel, opt-in variants add the louder treatments. Same for Button: `default` becomes the red neon CTA; add `variant="cyan"` if mockups need it.
- The only justified **new** components are ones with no current equivalent: the **signage browse grid** (see §5) and possibly a `Logo`/wordmark component (used by site-header, suspended-screen, (app) inline header, auth pages — 4+ call sites today hardcode the text string).

Specific primitive notes:
- `button.tsx` — the highest-leverage file; red neon CTA default, ghost/outline tuned for dark
- `card.tsx` — navy panel + neon border default
- `chart.tsx` + `--chart-1..5` tokens — admin analytics inherits neon palette via tokens
- `sonner.tsx` — pin `theme="dark"` (next-themes has no mounted provider; "system" on a dark-only app is wrong)
- `skeleton.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx` — token-inherit mostly; verify contrast on the new dark base

## 4. Rename Map: every "Take-Off Parts" in code

Grep-verified occurrences that must change (excluding `.planning/`, `docs/`, and historical milestone archives, which stay):

| Category | File:line | What |
|---|---|---|
| **Metadata** | `app/layout.tsx:16` | title is literally still `"Create Next App"` — becomes OG Truck Parts metadata (+ description, openGraph) |
| Page titles | `app/(auth)/register/page.tsx:5`, `check-email/page.tsx:7`, `auth-code-error/page.tsx:6` | `· Take-Off Parts` suffixes |
| UI copy | `app/(auth)/login/page.tsx:64` | "Log in to your Take-Off Parts account" |
| Wordmark (hardcoded text) | `components/layout/site-header.tsx:33`, `components/account/suspended-screen.tsx:35`, `app/(app)/layout.tsx:53` | replace with new `Logo` component |
| **Emails — FROM lines** | `lib/admin/email.ts:14`, `lib/messaging/notify.ts:12` | `"Take-Off Parts <onboarding@resend.dev>"` |
| Emails — subjects/bodies | `lib/admin/email.ts:33-37`, `lib/actions/admin/enforcement.ts:58,119,169,226,300`, `lib/messaging/notify.ts:79,136`, `lib/verify/alert.ts:49` | 13 brand-named subject/body strings |
| Emails — cron | `app/api/cron/near-expiry/route.ts:123` | body text + hardcoded `https://takeoffparts.com/...` URL (domain decision needed) |
| **package.json** | `package.json:2` (+ package-lock) | `"name": "take-off-parts"` → `"og-truck-parts"` |
| README | `README.md:1` | heading |
| **E2E tests (will break on rename)** | `e2e/home.spec.ts:6`, `e2e/auth.spec.ts:125,131` | assert heading/link named "Take-Off Parts" — update in the same commit as the wordmark |
| Out-of-repo | Supabase Staging auth email templates (Resend SMTP sender display name "Take-Off Parts"), Vercel project name | manual dashboard changes — list in plan checklist |

Leave alone: `tests/integration/_supabase.ts` / `privacy.contract.test.ts` use `takeoffparts.gsd+...@gmail.com` test inboxes — those are real mailbox addresses, not brand copy.

### Asset integration points (stakeholder-provided logo/icon)

- `app/favicon.ico` → replace; add `app/icon.png` (or `.svg`) and `app/apple-icon.png` (Next.js metadata file conventions — zero config)
- Add `app/opengraph-image.png` for link sharing
- Logo file(s) → `public/` (e.g. `public/brand/logo.svg`), consumed by the new `Logo` component
- Delete create-next-app leftovers: `public/{file,globe,next,vercel,window}.svg`

## 5. Build Order (dependency-reasoned) + Parallelization

```
Wave 1 (serial, foundation — everything depends on it)
  1a. Tokens: globals.css neon palette in :root, dark-only, new brand tokens/utilities
  1b. Fonts: register display+body fonts in app/layout.tsx, fix the --font-sans wiring bug
  1c. Assets + metadata: favicon/icon/og-image, Logo component, app/layout.tsx metadata
  1d. Rename sweep: all §4 strings + e2e spec updates (one atomic commit — greppable, mechanical)

Wave 2 (serial after 1 — every surface consumes these)
  2a. components/ui/ restyle in place (18 primitives; button/card/input/dialog first)
  2b. Shared chrome: SiteHeader redesign (logo + prominent search bar + icon nav:
      search, sell, messages, saved, alerts, account) ← UAT fix #1 lands here
      + user-menu, suspended-screen, (app) inline header, admin-sidebar

Wave 3 (PARALLEL — independent surface groups, all consume Waves 1–2)
  3a. Public surfaces: feed/search page, listing detail, public profile, not-found
      + NEW signage browse grid (see below)
  3b. (app) surfaces: sell form, my listings, garage, messages, saved, account, verify, suspended
  3c. (auth) surfaces: 6 pages (smallest group — mostly inherit primitives)
  3d. Admin: 12 screens (lowest priority; mostly inherits primitives + restyled sidebar/charts)

Wave 4 (anytime — independent of all visual work, can run parallel with Wave 3 or even Wave 1)
  4a. UAT fix #2: freeze-notice realtime refresh (messaging code, no visual dependency)
  4b. UAT fix #3: vitest-* analytics purge (SQL + test hygiene, no app code dependency)

Wave 5 (last)
  5.  Emails visual pass (if any HTML styling beyond the Wave-1 string rename) + full-app
      contrast/mobile QA sweep + e2e green
```

**Why this order:** tokens/fonts before primitives (primitives reference tokens); primitives before surfaces (surfaces inherit primitives — reskinning a page before `card.tsx` changes means doing it twice); chrome before surfaces (header is on every screen, it sets the visual bar); the rename is mechanical and has no dependencies, so it goes first to get the brand consistent immediately. Waves 3a–3d touch disjoint files and parallelize cleanly across GSD execution waves (watch the known pre-commit stash/restore cross-attribution issue when parallelizing commits).

### Browse-as-signage: the one genuinely NEW component surface

Today, browse = `FacetSidebar` (select dropdowns) on the feed page; there is no Make→Model→Category grid anywhere. The neon-sign browse is **new markup, zero new data**:

- New `components/browse/sign-grid.tsx` (+ tile component) rendering Makes / Models / Categories as neon-sign link tiles
- Data already exists: `makes` query (feed page already fetches it), `getModels`/`getConfigs` (`lib/garage/cascade.ts`), `getPartCategories` (`lib/listings/cascade.ts`)
- Links target the **existing URL params** on `/` (`?make=`, `?model=`, `?category=`) — the feed/search page already parses these via `lib/search/params.ts`
- Recommended placement: render the signage grid on the feed page's empty-criteria state (the "feed IS the search" locked decision survives; no new route). A dedicated `/browse` route is possible but unnecessary — flag to planning as a choice, default to no-new-route.

## 6. Where the 3 UAT Fixes Land

### Fix 1 — Sell entry point in header
`components/layout/site-header.tsx`. Subsumed by the Wave-2 header redesign (the icon nav explicitly includes "sell" → links `/sell`). Anonymous users: show it and let the existing `(app)` layout auth-gate redirect to `/login`. No new code paths.

### Fix 2 — Freeze-notice realtime refresh (the only new data flow in v1.1)
Current behavior: `app/(app)/messages/[threadId]/page.tsx:59` computes `sendDisabled` from `thread.frozenAt` **server-side at render**; `components/messaging/thread-view.tsx` receives it as a prop. A tab already open when an admin freezes (via `lib/actions/admin/threads.ts`) keeps an enabled composer until manual reload (sends would still fail — the `0019` messages INSERT policy carries the `frozen_at is null` arm — but the UI lies).

Fix: in `thread-view.tsx`, add a second `.on("postgres_changes", { event: "UPDATE", table: "message_threads", filter: "id=eq.{threadId}" })` listener **on the already-existing `thread:{id}` channel**, calling `router.refresh()` so the server recomputes `sendDisabled`. Notes:
- The channel, `setAuth()` JWT push, and cleanup already exist (lines 80–125) — this is additive, ~15 lines
- **Verify `message_threads` is in the `supabase_realtime` publication** — `messages` demonstrably is, threads likely are not → one small migration (`ALTER PUBLICATION supabase_realtime ADD TABLE message_threads`). RLS SELECT on threads already covers participants, so delivery is correctly scoped
- Same pattern optionally applies to the split view in `app/(app)/messages/page.tsx:125` (it also derives `sendDisabled` from `frozenAt`); the thread detail page is the must-fix
- Channel topic must stay `thread:{id}` (locked: future Broadcast topic)

### Fix 3 — vitest-* analytics purge (Staging data hygiene)
The integration tests wrote search events with `vitest-*` terms into `search_events` (`raw_term`/`normalized_term` columns — `lib/search/events.ts:34-40`), polluting Top Search Terms in `lib/admin/analytics.ts` (live aggregates, no pre-aggregation, so the fix is pure data deletion). Land as:
1. One-off Staging SQL (or migration for the audit trail): `DELETE FROM search_events WHERE raw_term LIKE 'vitest-%' OR normalized_term LIKE 'vitest-%'`
2. Prevention: make the responsible integration tests clean up their own `search_events` rows in teardown (they already use the service-role test harness in `tests/integration/_supabase.ts`), **or** add a `NOT LIKE 'vitest-%'` guard in the analytics top-terms query. Prefer test teardown — analytics should not carry test-awareness.

## Data Flow Changes

**None** to existing flows. Summary of deltas:
- New: one realtime UPDATE subscription on `message_threads` (Fix 2) — read-only, RLS-scoped, additive
- Removed: `vitest-*` rows in `search_events` (Fix 3) — Staging data only
- Everything else: tokens, markup, strings, static assets

## Anti-Patterns to Avoid in This Milestone

1. **Forking primitives** (`NeonButton` alongside `Button`) — touches every import site; use in-place restyle + cva variants instead.
2. **Hardcoding neon hex values in components** — all brand color goes through `@theme` tokens; a component with `#ff2d55` inline is the new version of the "Spanish string in UI" bug.
3. **Adding a theme toggle / next-themes provider** — the design is dark-only; shipping a half-working light mode doubles QA for zero requirement.
4. **Letting the redesign drift into functional changes** — the mockups show cart/payments/phone elements that are explicitly out of scope; the header icon set is fixed (search, sell, messages, saved, alerts, account). "Alerts" needs a scope decision in planning (no notifications feature exists — likely the messages unread badge or a stub).
5. **Renaming in dribbles** — a partial rename leaves mixed-brand emails/titles in front of real Staging users; do the §4 sweep atomically with the e2e updates.
6. **Forgetting the inline headers** — `app/(app)/layout.tsx` (suspended read-only chrome) and `suspended-screen.tsx` hardcode their own mini-headers; they will silently keep the old wordmark if only `site-header.tsx` is updated.

## Sources

- Direct codebase reads (2026-06-12): `app/globals.css`, `app/layout.tsx`, all 5 layouts, `components/layout/site-header.tsx`, `components/layout/user-menu.tsx`, `components/account/suspended-screen.tsx`, `components/messaging/thread-view.tsx`, `app/(public)/page.tsx`, `app/(app)/messages/[threadId]/page.tsx`, `lib/admin/analytics.ts`, `lib/search/events.ts`, `package.json`; full file enumeration of `app/`, `components/`, `lib/`; repo-wide grep for the brand name — HIGH
- Tailwind v4 CSS-first `@theme` / shadcn "own your components" model — consistent with the existing globals.css structure and `.planning/research/STACK.md` (v1.0) — HIGH
- Supabase Realtime postgres_changes publication + RLS delivery — pattern already proven in `thread-view.tsx` (messages table) — HIGH; `message_threads` publication membership unverified → flagged as a check in Fix 2 — MEDIUM

---
*Architecture research for milestone v1.1: OG Rebrand & UI Redesign (visual-only on shipped v1.0)*
*Researched: 2026-06-12*
