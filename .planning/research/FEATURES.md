# Feature Research

**Domain:** App-wide rebrand + visual redesign of an existing marketplace (v1.1 "OG Truck Parts" — neon truck-stop identity over a shipped, functional v1.0)
**Researched:** 2026-06-12
**Confidence:** HIGH for surface inventory (read directly from the repo); MEDIUM-HIGH for redesign practices (industry-standard patterns verified against current sources; no single authoritative spec exists for "redesign milestones")

## How Rebrand/Redesign Milestones Typically Work

A visual-only redesign over a working app is a **layered migration**, not a page-by-page rewrite. The proven ordering:

1. **Design-token / theme foundation first** — palette, typography, spacing, radii, semantic tokens. Everything downstream consumes these. In this codebase the slot already exists: `app/globals.css` uses Tailwind v4 `@theme inline` mapped to shadcn CSS variables (`--background`, `--primary`, `--card`, etc.) — currently the **stock neutral light theme** in oklch. The redesign is largely "replace these variable values + add brand fonts," which is why token work is the highest-leverage step.
2. **Component primitives second** — the ~18 shadcn/ui primitives (`button`, `input`, `card`, `badge`, `dialog`, `select`, `sheet`, `skeleton`, `sonner`, `chart`, …) restyled once propagate everywhere, because all ~70 domain components compose them. shadcn components are CLI-owned (in-repo), so variants can be edited directly.
3. **Shared chrome third** — `site-header` (the biggest single deliverable: logo, prominent search bar, icon nav with labels, sell entry point), user-menu, admin-sidebar. No footer component exists today; the mockups imply one (social links) — that's a *new* surface, not a reskin.
4. **Page passes fourth** — route-group by route-group, highest-traffic first: public → auth → app → admin.
5. **Rebrand sweep + asset swap** — name, metadata, favicon/OG, emails, legal copy (parallel-izable with page passes; see checklist below).
6. **QA pass** — functional e2e stays green (visual-only proof), accessibility audit, mockup-fidelity walkthrough.

**Component-by-component beats page-by-page** here because the token system is shared: a page-by-page approach forks the theme (old pages on old tokens, new on new) and doubles QA. The interim state of component-first is "whole app gets the dark theme at once, then signage flair lands per page" — acceptable because there is no production traffic (Staging only, not launched).

## Surface Inventory (what v1.0 actually shipped — everything below must be reskinned)

Grounded in `app/**/page.tsx` (31 pages) and `components/**` (~70 components).

| Surface group | Routes | Key components | Reskin complexity |
|---|---|---|---|
| **Public browse/search** | `/` (feed + search) | `search-bar`, `facet-sidebar`, `feed-grid`, `listing-card`, `active-filter-chips`, `slang-banner`, `fits-my-truck-control`, `empty-results` | HIGH — this is where browse-as-neon-signage and the listing-card redesign (photo/specs/red price/badges) land |
| **Listing detail** | `/listings/[id]` | `listing-detail` (gallery), `comment-section`, `comment-composer`, `contact-seller-button`, `save-button`, `sold-toggle` state, `seller-type-badge` | HIGH — densest page; social + contact + gallery |
| **Public profile** | `/u/[username]` (+ its `not-found.tsx`) | `public-profile-header`, `profile-listings-grid`, `profile-sort`, `empty-listings` | MEDIUM |
| **Auth flows** | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/check-email`, `/auth-code-error` | `register-form`, `username-field`, `password-strength`, `resend-confirmation` | MEDIUM — mockups show dark navy panels w/ neon borders + numbered steppers; brand name hardcoded in 4 of these pages |
| **Seller flows** | `/sell` (create), `/sell/[id]/edit`, `/sell/listings` (my listings) | `listing-form`, `photo-uploader`, `fitment-multi-select`, `fitment-suggestions`, `duplicate-warning`, `renew-button`, `sold-toggle` | HIGH — longest form in the app; numbered-stepper treatment from mockups applies here |
| **Logged-in account/app** | `/account`, `/verify` (OTP), `/saved`, `/profile/garage`, `/suspended` | `display-name-form`, `seller-type-form`, `message-email-form`, `input-otp`, `suspended-screen` | MEDIUM |
| **Messaging** | `/messages`, `/messages/[threadId]` | `thread-list`, `thread-view`, `thread-header`, `contact-form-modal`, `messages-badge`, `report-menu` | MEDIUM — realtime; visual changes must not touch subscription logic |
| **Admin console** | `/admin` + users, listings, reports, messages, fitment, import (11 pages) | `admin-sidebar`, `kpi-cards`, `trend-chart`, `ranking-list`, `enforcement-dialogs`, `listing-moderation`, `report-queue-actions`, `thread-actions`, `taxonomy-crud`, `slang-editor`, `import-form` | MEDIUM — gets dark theme + tokens via primitives; does NOT need signage flair (internal tool, density > aesthetics) |
| **Layout chrome** | `(public)`/`(app)` layouts, `site-header`, `user-menu` | header is the centerpiece deliverable | HIGH |
| **Emails (in repo)** | `lib/admin/email.ts` (enforcement), `lib/messaging/notify.ts` (new-message), `lib/verify/alert.ts`, `app/api/cron/near-expiry/route.ts` | brand name + tone in plain/HTML email bodies | LOW |
| **Emails (out of repo)** | Supabase Auth templates (confirm, reset) configured in Supabase dashboard via Resend SMTP | brand name in subject/body; **dashboard change, easy to forget** | LOW |
| **Metadata & assets** | root `app/layout.tsx`, `app/favicon.ico` | **root metadata is still `title: "Create Next App"`** (default scaffold — currently a live bug); favicon is the Next default; no OG image, no logo asset exists yet | LOW-MEDIUM — needs per-route `metadata`/`generateMetadata` titles, OG image, favicon set from stakeholder logo |
| **Error/empty/loading states** | only `u/[username]/not-found.tsx` exists; **no global `error.tsx`, no global `not-found.tsx`, no `loading.tsx` anywhere**; `skeleton` component exists | NEW surfaces, not reskins | LOW each — but the global 404/error pages are a gap the redesign should close (branded 404 is table stakes) |

## Feature Landscape

### Table Stakes (a redesign milestone is incomplete without these)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Design-token foundation (palette, type, spacing, variants) before any page work | Single source of truth; prevents two-theme drift; everything else depends on it | MEDIUM | Replace shadcn neutral oklch values in `globals.css` `:root`; add brand fonts via `next/font` (retro display for headings, readable sans for body); define semantic tokens (e.g. `--neon-red`, `--neon-cyan`, `--panel-navy`) mapped into `@theme` |
| Restyled shadcn primitives (button, input, card, badge, dialog, …) | ~70 domain components inherit from them; this IS the app-wide application | MEDIUM | Edit owned components directly; add variants (e.g. neon-outline card, red CTA button) rather than per-page overrides |
| Redesigned persistent header w/ logo, big search bar, icon nav + **sell entry point** | Centerpiece of the mockups; also closes a v1.0 UAT gap (sell not reachable from header) | HIGH | Icon nav: search, sell, messages, saved, alerts, account — `messages-badge` already exists; "alerts" has no backing feature → render only what exists or stub visually |
| Full name sweep "Take-Off Parts" → "OG Truck Parts" | Half-renamed product reads as broken | LOW | 21 files match today (grep): `package.json`, `README.md`, `site-header`, `(app)/layout.tsx`, 4 auth pages, `suspended-screen`, `lib/actions/admin/enforcement.ts`, 3 email libs, near-expiry cron, 2 e2e specs, docs. Plus Supabase dashboard email templates + Vercel project display name |
| Correct `<title>`/metadata per route + OG tags + favicon set | Root layout still says "Create Next App"; shared links/bookmarks show the brand | LOW-MEDIUM | `metadata` export per route group; OG image from stakeholder logo; favicon/apple-touch-icon/manifest icons |
| Branded email pass (4 in-repo senders + Supabase auth templates) | Emails carry the old name post-rebrand otherwise | LOW | Keep plain/simple; brand name + header line is enough for v1.1 |
| Empty/loading/error states themed (incl. NEW global 404/error pages) | Dark theme makes unthemed white flash/states glaring; branded 404 expected | LOW-MEDIUM | Add `app/not-found.tsx`, route-group `error.tsx`, `loading.tsx` with themed `skeleton`; restyle `empty-results`, `empty-listings` |
| WCAG AA on the dark neon theme | Legal/usability baseline; neon-on-dark fails easily | MEDIUM | 4.5:1 normal text, 3:1 large text + UI components/borders (WCAG 1.4.11); see accessibility section |
| Equal mobile/desktop pass per surface | Truckers shop from phones; stakeholder explicitly required no breakpoint bias | MEDIUM | Header icon-nav collapse, facet-sidebar → `sheet`, form steppers on small screens |
| Functional e2e stays green (visual-only proof) | "Visual-only" is a claim that needs evidence | LOW-MEDIUM | Playwright already set up (`e2e/auth.spec.ts`, `e2e/home.spec.ts`) — these assert brand strings, so they change WITH the rebrand, then gate everything after; PII contract tests must also stay green |
| UAT fix: freeze-notice realtime refresh | Carried from v1.0 UAT | LOW | Functional (exception to visual-only): stale tabs must reflect enforcement state without manual refresh; touches existing realtime + `suspended-screen` |
| UAT fix: purge `vitest-*` search terms from Staging analytics | Carried from v1.0 UAT | LOW | Data hygiene: SQL delete on search-event rows + ideally an env/UA guard so tests stop polluting |

### Differentiators (where this redesign competes)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Browse-as-neon-signage: Make → Model → Category grids rendered as neon signs | The signature visual of the brand; turns the 8-level taxonomy (a v1.0 strength) into the most memorable screen | HIGH | New presentation over existing taxonomy queries; per-make sign treatment (CSS `text-shadow`/`box-shadow` glow, not images, for crispness + theming); needs hover/focus/active states and a non-glow fallback |
| Retro display typography for headings/signage | Carries the truck-stop identity in every screen at near-zero per-page cost | LOW | One `next/font` display face + `--font-heading` token (slot already exists in `@theme`); body stays a readable sans |
| Listing cards w/ photo, specs row, red price, verification badges | Mockup-specified; price-forward cards convert better and read "marketplace," not "blog" | MEDIUM | All data already on `listing-card`; pure restyle. Red price on navy needs a lightened red or large-text size to pass contrast |
| Dark navy form panels w/ neon borders + numbered steppers | Makes the longest flows (register, verify, sell) feel guided and on-brand | MEDIUM | Visual stepper over existing multi-section forms — presentation only, no flow/validation changes |
| Tasteful glow/motion (hover glows, sign flicker-on) | Depth and life that flat dark themes lack | LOW-MEDIUM | Must be gated behind `prefers-reduced-motion`; `tw-animate-css` already imported |

### Anti-Features (explicitly do NOT build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Cart / checkout / payments UI from mockups | Present in stakeholder mockups | No payments exist in the product (v2); dead UI erodes trust | Already excluded by milestone scope — header nav renders only real features |
| Phone-call CTA from mockups | Mockup element | Exposing a phone number violates the privacy pillar (PRIV invariants) | Contact-form → chat flow keeps its primary placement, restyled |
| "Alerts" nav as a real feature | Mockup icon nav includes it | No notifications feature exists; building one is a functional milestone, not a reskin | Omit, or visual-only icon linking to messages/saved; note as v2 candidate |
| Continuous neon flicker / animated glow everywhere | "More neon = more brand" | Visual fatigue, battery drain, accessibility risk (vestibular triggers; WCAG 2.3.1 caps flashes at 3/s) | Neon = accents (headings, borders, CTAs, signage); static glow by default; animation only on interaction + reduced-motion gated |
| Neon-saturated body text / pure white on pure black | Looks "more neon" | Saturated neon text vibrates on dark; 21:1 pure white/black causes halation for astigmatic users | Off-white (`#E0E0E0`–`#F0F0F0`-range) body on very dark navy (~`#121212`–`#1E1E1E` lightness); neon reserved for large/accent text |
| Repo/folder/Vercel-slug/package rename to `og-truck-parts` | "Complete" rebrand instinct | Breaks local paths, Vercel project wiring, git history ergonomics — all invisible to users | Rename user-visible strings only (`package.json` `name` is fine); keep infra names; revisit at production setup |
| Light/dark theme toggle | Common in dark redesigns | Doubles the design surface; the brand IS the dark theme | Single dark theme; the `.dark` custom-variant can stay unused |
| Pixel-perfect mockup replication | Stakeholder provided mockups | Mockups include non-existent features and weren't drawn responsive | Treat mockups as art direction (palette, type, signage, card anatomy); UAT against "feels like the mockup," not pixel diff |
| Rebuilding components from scratch (dropping shadcn) | "Fresh start" instinct | Throws away tested behavior (focus traps, a11y, form wiring) — the fastest route to functional regressions | Restyle owned shadcn components in place; behavior untouched |

## Keeping It "Visual-Only" (no functional regressions)

1. **Diff discipline:** redesign PRs/commits touch `globals.css`, `components/**`, `app/**/page.tsx`/layouts (JSX + classNames), fonts, assets. Any diff in `lib/actions/**`, `lib/supabase/**`, `supabase/migrations/**`, route handlers, or zod schemas is a red flag — except the two scoped UAT fixes (freeze-notice realtime, analytics purge), which should be **separate commits/plans** so the visual-only claim stays auditable.
2. **Existing Playwright e2e as the functional gate:** `e2e/auth.spec.ts` and `e2e/home.spec.ts` assert real flows (and brand strings — update those assertions in the same commit as the rename, then freeze). Run after every wave.
3. **Optional visual baselines, post- not pre-redesign:** Playwright's built-in `toHaveScreenshot()` needs no plugin; taking baselines of the OLD design is pointless (every pixel changes by design). Take baselines AFTER each surface is approved to lock the new look against later drift. Run in CI/consistent env to avoid font/AA false positives. LOW cost, optional for v1.1 — the manual mockup-fidelity walkthrough is the real acceptance gate.
4. **Per-surface manual QA script:** for each route group, walk the happy path live on Staging (the v1.0 24-step UAT walkthrough is reusable verbatim — same functionality is the whole point).
5. **Invariant re-checks stay on:** PII contract tests, RLS gates, EXIF gate — none should be touched, all should stay green (per-phase invariant in CLAUDE.md).

## Accessibility Table Stakes for a Dark Neon Theme

| Requirement | Standard | Application here |
|---|---|---|
| Text contrast 4.5:1 (normal), 3:1 (large ≥24px / 18.7px bold) | WCAG 2.x AA 1.4.3 | Neon red price on navy: typical neon red (#FF3B3B-ish) fails 4.5:1 on dark navy → lighten the red token for text use, or keep prices at large-text size. Cyan generally passes easily on dark |
| Non-text contrast 3:1 | WCAG 1.4.11 | Neon borders, input outlines, icon nav, badges — neon borders on navy panels usually pass, but verify the *dimmed/inactive* states |
| No pure-white-on-pure-black | Halation for astigmatism | Off-white foreground token on very-dark-navy base (not #000) |
| Desaturated/lightened neon for any text role | Saturated colors vibrate on dark even when ratio passes | Two tokens per neon: `--neon-x` (decorative glow) and `--neon-x-text` (lightened, AA-passing) |
| Visible focus states | WCAG 2.4.7 | A neon `--ring` is actually an asset on dark — restyle, never remove, shadcn focus rings |
| `prefers-reduced-motion` honored | WCAG 2.3.3 / OS setting | All glow pulses, flicker-on animations, hover transitions degrade to static; `tw-animate-css` + a `motion-reduce:` audit |
| No flashing > 3/sec | WCAG 2.3.1 | Bans "buzzing neon sign" loops outright |
| Contrast check automated | — | Run axe/Lighthouse on the 5 key templates (home, listing detail, register, sell, messages) after token freeze; cheap and catches token-level failures once |

## Feature Dependencies

```
Logo/icon assets (stakeholder) ──required by──> Header, favicon/OG, email branding
Design tokens + fonts (globals.css)
    └──required by──> shadcn primitive restyle
                          └──required by──> Shared chrome (header w/ sell entry, sidebar, footer-if-any)
                                                └──required by──> Page passes (public → auth → app → admin)
Page passes ──required by──> Visual baselines (new-design screenshots) + a11y audit + mockup-fidelity UAT
Name sweep + metadata/emails ──independent of──> token work (parallel-izable; must update e2e brand assertions atomically)
Browse-as-signage ──builds on──> existing taxonomy browse queries (v1.0 FITL) + tokens
Header sell entry ──closes──> v1.0 UAT gap (depends on header redesign)
Freeze-notice realtime fix ──independent──> functional fix; isolate from visual commits
vitest-* analytics purge ──independent──> Staging SQL + test-pollution guard
"Alerts" nav icon ──conflicts──> no notifications feature exists (render only real destinations)
Cart/phone mockup elements ──conflict──> no-payments scope + privacy pillar (excluded)
```

### Dependency Notes

- **Tokens before primitives before pages:** restyling pages against the stock theme produces rework; this ordering is the core phase-structure recommendation.
- **Name sweep is atomic with e2e updates:** the existing specs assert "Take-Off Parts" strings; rename and assertions must land together or the functional gate goes red for the wrong reason.
- **No production traffic = no migration-window problem:** the app is Staging-only, so the intermediate "dark theme everywhere, signage landing incrementally" state costs nothing.
- **Stakeholder assets are an external dependency:** header, favicon, OG, and emails block on the final logo files (formats: SVG preferred + PNG fallbacks).

## MVP Definition

### Launch With (this milestone, v1.1)

- [ ] Token/theme foundation + brand fonts — everything depends on it
- [ ] shadcn primitive restyle (app-wide dark navy/neon baseline) — the "applied to every surface" mechanism
- [ ] Redesigned header w/ search bar, icon nav, sell entry — centerpiece + UAT fix
- [ ] Page passes: public (feed, listing detail, profile) → auth → seller/app → messaging → admin (theme-level)
- [ ] Browse-as-neon-signage for Make/Model/Category — the brand's signature screen
- [ ] Full rebrand sweep: UI strings, route metadata/titles, favicon/OG, README/package.json, 4 in-repo email senders, Supabase auth email templates
- [ ] Branded global 404/error/loading states (new files)
- [ ] AA contrast + focus + reduced-motion pass on the new theme
- [ ] Freeze-notice realtime refresh + vitest-* analytics purge (scoped functional fixes, separate commits)
- [ ] Final UAT: rerun v1.0 walkthrough on the new skin + mockup-fidelity review

### Add After Validation (v1.x)

- [ ] Post-approval visual regression baselines (`toHaveScreenshot()` in CI) — lock the approved look
- [ ] Marketing-grade home/landing polish beyond the feed — once brand is validated
- [ ] Footer with social links — confirm which social profiles actually exist first

### Future Consideration (v2+)

- [ ] Notifications/"alerts" feature behind the nav icon — functional milestone
- [ ] Email template visual redesign (HTML/branded layouts) — text-level rebrand suffices now
- [ ] OG-image-per-listing (dynamic `og:image` with part photo) — nice for sharing, not a rebrand requirement

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Token foundation + fonts | HIGH (enables all) | MEDIUM | P1 |
| Primitive restyle | HIGH | MEDIUM | P1 |
| Header redesign + sell entry | HIGH | HIGH | P1 |
| Name/metadata/favicon/email sweep | HIGH (trust) | LOW | P1 |
| Public page passes (feed, detail, profile) | HIGH | HIGH | P1 |
| Browse-as-neon-signage | HIGH (brand signature) | HIGH | P1 |
| Auth + seller-flow passes (panels/steppers) | MEDIUM-HIGH | MEDIUM | P1 |
| A11y pass (contrast/focus/reduced-motion) | HIGH (and cheap if done at token time) | MEDIUM | P1 |
| Messaging + admin theme pass | MEDIUM | MEDIUM | P2 |
| Global 404/error/loading states | MEDIUM | LOW | P2 |
| UAT fixes (freeze realtime, vitest purge) | MEDIUM | LOW | P1 (committed scope) |
| Visual regression baselines in CI | LOW now, MEDIUM later | LOW | P3 |
| Glow/motion flourishes | MEDIUM | LOW-MEDIUM | P2 |

**Priority key:** P1 must-have for milestone · P2 should-have · P3 future

## Sources

- Repo inspection (HIGH confidence): `app/**/page.tsx` (31 pages), `components/**` (~70 components, 18 shadcn primitives), `app/globals.css` (stock shadcn oklch theme on Tailwind v4 `@theme inline`), `app/layout.tsx` (default "Create Next App" metadata), grep for `Take-Off|TakeOff` (21 files), `e2e/*.spec.ts` (existing Playwright), email senders in `lib/admin/email.ts`, `lib/messaging/notify.ts`, `lib/verify/alert.ts`, `app/api/cron/near-expiry/route.ts`
- `.planning/PROJECT.md`, `.planning/MILESTONES.md` — v1.1 scope, exclusions (cart/payments/phone), UAT carryovers
- Dark-theme/neon accessibility (MEDIUM-HIGH): [WebAIM — Contrast and Color](https://webaim.org/articles/contrast/), [MDN — Color contrast](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Color_contrast), [Dark Mode Accessibility guide](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/), [Dark mode UI considerations](https://fivejars.com/insights/dark-mode-ui-9-design-considerations-you-cant-ignore/), [Dark mode palettes](https://themeandcolor.com/blog/dark-mode-color-palette)
- Visual QA (MEDIUM-HIGH): [Playwright visual testing setup/CI](https://testdino.com/blog/playwright-visual-testing), [Chromatic — visual testing with Playwright](https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/), [BrowserStack — Playwright visual regression](https://www.browserstack.com/guide/visual-regression-testing-using-playwright)
- Rebrand checklists (MEDIUM): [Brand Vision — 25-item rebrand checklist](https://www.brandvm.com/post/rebranding-checklist-mandatory-updates), [SaaS rebrand checklist](https://www.poweredbysearch.com/learn/saas-rebrand-checklist/), [50+ touchpoint rebrand checklist](https://nicolesteffen.com/2026/02/03/rebrand-checklist-across-50-touchpoints/)

---
*Feature research for: v1.1 OG Rebrand & UI Redesign (OG Truck Parts)*
*Researched: 2026-06-12*
