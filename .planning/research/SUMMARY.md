# Project Research Summary

**Project:** Take-Off Parts to OG Truck Parts (v1.1 OG Rebrand & UI Redesign)
**Domain:** App-wide visual rebrand + neon truck-stop identity on a shipped Next.js 16 + Tailwind v4 + shadcn/ui marketplace
**Researched:** 2026-06-12
**Confidence:** HIGH

## Executive Summary

This milestone is a visual-only rebrand of a fully-functional, stakeholder-approved v1.0 marketplace. The rename is "Take-Off Parts to OG Truck Parts" and the visual identity is a dark neon truck-stop aesthetic: near-black navy base, neon red primary (CTAs, signage), neon cyan accent (links, focus, borders), retro condensed display typography, and CSS-only glow effects. The headline finding from all four research files is the same: **almost zero new dependencies are needed.** The existing Tailwind v4 `@theme inline` + shadcn CSS-variable architecture is purpose-built for this kind of centralized palette swap, and every technique required (text shadows, glow shadows, font self-hosting, dark-only theming) is native to the already-installed toolchain at its current resolved versions.

The recommended approach is a strict wave-ordered execution that treats the token/font foundation as an atomic prerequisite. Redefining the ~30 shadcn semantic CSS variables in `globals.css` plus adding brand-scale neon tokens in `@theme` re-skins roughly 80% of the app's ~85 components in a single file edit. The remaining ~20% is per-component markup work for hero surfaces (header redesign, browse-as-signage grid, listing cards, form steppers) plus a comprehensive rebrand sweep covering the 21 in-repo brand-string occurrences and the harder-to-catch out-of-repo surfaces: Supabase Auth email templates, Twilio Verify SMS friendly name, Resend sender display name, and Vercel project metadata. Three scoped UAT fixes from v1.0 travel with the milestone: the sell entry point in the header (subsumed by the header redesign), a freeze-notice realtime refresh (one additive Supabase Realtime subscription + possible migration), and a vitest-* analytics purge (Staging SQL + test teardown hygiene).

The dominant risk profile is the inverse of v1.0: the danger is not building the wrong thing, but breaking a working thing while changing how it looks. Visual and behavioral code live in the same components; mockups contain non-existent features (cart, payments, phone display); and the test suite is coupled to accessible names that the redesign will change. The mitigation is a behavior-freeze contract established before any surface work begins, same-commit test updates on every surface, per-surface e2e runs, and a token-first discipline enforced by a grep gate (`rg "#[0-9a-fA-F]" app components --glob '!globals.css'` must return near-zero new hits). Accessibility is a non-negotiable quality gate: neon red on dark navy fails WCAG AA at small text sizes, pure neon glow is not a valid focus indicator, and the display font must be heading-scale-only.

## Key Findings

### Recommended Stack

The v1.0 stack (Next.js 16.2.x, React 19, Supabase, Tailwind v4, shadcn/ui, RHF+Zod, Vercel) is unchanged. The only additions for v1.1 are two Google Fonts loaded via the already-present `next/font/google` pipeline (zero new packages) and an optional dev-only `png-to-ico` for favicon generation. The single removal is `next-themes`, which is dead weight once `components/ui/sonner.tsx` is patched to hardcode `theme="dark"`. Critical version note: confirm `npm ls tailwindcss` resolves >= 4.1 (current lockfile is 4.2.x) before relying on native `text-shadow-*` utilities.

**Core technologies (v1.1 additions/changes only):**
- **Barlow Condensed** (via `next/font/google`, OFL, weights 700/800/900 + italic): display/heading face with explicit highway-signage DNA; the `--font-heading` token already exists in `@theme` and is consumed by 4 shadcn primitives, so swapping the alias propagates automatically with zero per-component font changes
- **Tilt Neon** (via `next/font/google`, optional): sparingly for literal neon-sign set pieces; skip entirely if Barlow Condensed Italic + glow covers the mockups
- **Tailwind v4 native `text-shadow-*` utilities**: all glow is token-driven, zero new packages; combined with custom `--shadow-neon-*` and `--text-shadow-neon-*` tokens in `@theme`
- **`sharp` (already installed, v0.34.5)**: one-off script to generate `app/icon.png` (512x512), `app/apple-icon.png` (180x180), `app/opengraph-image.png` (1200x630); cannot emit `.ico`, use `png-to-ico` devDep or a one-off external converter for `favicon.ico`
- **Dark-only forced**: collapse neon dark palette into `:root`, delete the `.dark` block, set `color-scheme: dark` + meta tag in layout, remove `next-themes`

**Do not use:** any new component library (DaisyUI, HeroUI, neon UI kits), CSS-in-JS, text-shadow plugins, motion/framer-motion for glow, `tailwind.config.js` re-introduction, or PNG-to-SVG auto-tracing of the logo.

### Expected Features

The full v1.1 scope spans 5 layouts, 32 screens, 18 shadcn primitives, and ~61 feature/colocated components across public, auth, seller/app, messaging, and admin route groups.

**Must have (table stakes):**
- Design-token foundation (neon palette, brand fonts, glow utilities, dark-only setup) -- everything downstream depends on it
- Restyled shadcn primitives in place (button, card, input, dialog, etc.) -- the mechanism by which the whole app gets the new theme
- Redesigned persistent header with logo, prominent search bar, icon nav (search, sell, messages, saved, account), and sell entry point -- centerpiece of the mockups and UAT fix #1
- Full rebrand sweep: all 21 in-repo "Take-Off Parts" / "Create Next App" occurrences, root metadata with `title.template`, OG image, favicon set, 4 in-repo email senders, Supabase auth email templates, Twilio SMS, Resend sender, Vercel project name
- Page passes: public (feed, listing detail, profile) -> auth (6 pages) -> seller/app (account, sell, messages, etc.) -> admin (dark theme + workbench tier)
- Browse-as-neon-signage for Make/Model/Category -- the brand's signature screen (new component, no new data, existing URL params)
- Branded global 404/error/loading states (new files, currently absent)
- WCAG AA contrast + visible focus rings + `prefers-reduced-motion` gate on all animations
- Freeze-notice realtime refresh (UAT fix #2, isolated functional commit)
- vitest-* analytics purge (UAT fix #3, isolated Staging SQL + test teardown fix)
- Final UAT: v1.0 24-step walkthrough rerun on new skin + mockup-fidelity review

**Should have (differentiators):**
- Glow/motion flourishes (hover glows, sign flicker-on) gated behind `prefers-reduced-motion`
- Numbered stepper treatment on dark navy form panels (register, verify, sell)
- Listing cards with photo, specs row, red price, verification badges
- Post-approval visual regression baselines (`toHaveScreenshot()` in CI) to lock the approved look

**Defer to v1.x/v2+:**
- Notifications/"alerts" feature behind the nav icon (functional milestone)
- HTML-branded email templates (visual redesign of transactional emails beyond name change)
- OG image per listing (dynamic `og:image` with part photo)
- Footer with social links (confirm which social profiles exist first)

**Explicit anti-features (do not build):**
- Cart/checkout/payments UI from mockups -- v2 feature, dead UI erodes trust
- Phone-number display CTA -- violates PRIV invariants
- "Alerts" as a real feature -- no notifications system exists
- Continuous neon flicker everywhere -- WCAG 2.3.1 violation risk, visual fatigue
- Theme toggle -- brand is dark-only, doubles QA for zero requirement

### Architecture Approach

The redesign plugs into an architecture where `app/globals.css` is the sole stylesheet and every component is purely token-driven with no per-page CSS anywhere. The palette, fonts, and glow shadows swap centrally once and propagate to all ~85 components automatically. Per-component work is limited to markup edits (layout changes, signage grid, card anatomy, stepper panels) and new cva variants where needed. The 18 shadcn primitives are CLI-owned in-repo and must be restyled in place via token changes and cva variants, never forked into parallel components. The one genuinely new component surface is the browse-as-signage grid (`components/browse/sign-grid.tsx`), which renders existing taxonomy data as neon-sign tiles targeting existing URL params. There is an existing font-wiring bug to fix in Wave 1: `@theme` maps `--font-sans: var(--font-sans)` which self-references to undefined; body font is currently falling back to browser defaults.

**Major components and responsibilities:**
1. **`app/globals.css` (token layer)**: single source of truth for the entire neon palette, glow shadows, brand fonts, dark-only setup, and custom utilities -- the Wave 1 prerequisite for all other work
2. **`components/ui/` (18 primitives)**: the propagation mechanism -- restyle once and all 61 feature components and 32 screens inherit the new skin automatically
3. **`components/layout/site-header.tsx` (shared chrome)**: centerpiece deliverable; three additional inline header variants in `suspended-screen.tsx` and `app/(app)/layout.tsx` must also be updated (easy to forget)
4. **`components/browse/sign-grid.tsx` (new)**: browse-as-signage for Make/Model/Category; new JSX over existing data, existing URL params, placed on the feed's empty-criteria state
5. **`lib/brand.ts` (new, recommended)**: centralized brand constants imported by email senders and metadata -- makes the sweep atomic and future renames a one-line edit

**Wave structure (dependency-ordered):**
- Wave 1 (serial): tokens + fonts (fix wiring bug) + assets + metadata + rename sweep
- Wave 2 (serial, after Wave 1): primitives restyle + shared chrome (header, sidebar, suspended screen)
- Wave 3 (parallel, after Wave 2): 3a public surfaces + signage grid, 3b app surfaces, 3c auth surfaces, 3d admin (workbench tier)
- Wave 4 (anytime, independent): UAT fixes #2 and #3 in isolated commits
- Wave 5 (last): email pass + full contrast/mobile/e2e QA

### Critical Pitfalls

1. **"Visual-only" silently changes behavior** -- mockups contain cart, payments, and phone elements that are out of scope; a redesigned nav or restyled contact modal can accidentally shortcut the contact-before-chat invariant. Prevention: behavior-freeze contract (route map + Zod schemas) before any surface work; maintain a mockup-exclusion list; run the full Playwright e2e suite after each surface; isolate the three UAT fixes in separate commits.

2. **Hardcoded-value sprawl instead of token discipline** -- eyedropper hex values at point of use produce an unmaintainable 33.7k-LOC codebase with three slightly different neon reds. Prevention: token layer is Wave 1, before any page; enforce with grep gate (`rg "#[0-9a-fA-F]{3,8}" app components --glob '!globals.css'`) at the end of Wave 1.

3. **Neon-on-dark accessibility failures** -- white-on-neon-red buttons fail WCAG AA (~4:1); saturated glow text causes halation for astigmatic users; pure glow is not a valid focus indicator; condensed display fonts are illegible below ~20px. Prevention: contrast-check all token pairs before any page work; keep solid 2px `focus-visible` ring (glow is decoration on top, never replacement); enforce display font as heading-scale only.

4. **Rebrand misses on surfaces no grep reaches** -- `app/layout.tsx` root metadata is currently still "Create Next App"; Supabase Auth templates, Twilio Verify SMS friendly name, Resend sender display name, and Vercel project name are dashboard-configured and invisible to code search. Prevention: repo grep must return zero product-copy hits; dashboard checklist with evidence (trigger every transactional sender and read the received email/SMS); centralize brand strings in `lib/brand.ts`.

5. **E2e test breakage mishandled** -- `e2e/home.spec.ts` and `e2e/auth.spec.ts` assert brand-string role selectors that will break on rename; "fixing" them with CSS locators hides accessible-name regressions. Prevention: test updates land in the same commit as the surface they cover; role/name selector failures are treated as a11y signals first; any modification to contract/RLS/privacy test files in a "visual" commit is Pitfall 1 in disguise.

6. **Neon performance traps** -- animated `box-shadow`/`filter` glow on feed cards causes per-frame repaints that jank on mid-range phones; backdrop-filter blur is expensive on mobile GPUs; a display font loaded outside `next/font` causes CLS on every heading. Prevention: static glow only on repeated elements; animated effects use `::after` pseudo-element opacity pattern (compositor-only, GPU-cheap); all fonts through `next/font`; take a Lighthouse mobile baseline before Wave 1 and gate each surface against it.

7. **Dark theme half-applied** -- repainting component backgrounds without declaring `color-scheme: dark` leaves native form controls (scrollbars, selects, date inputs, autofill) in their light state; the app currently has `color-scheme` unset and is light-first. Prevention: `color-scheme: dark` on `:root` + `<meta name="color-scheme" content="dark">` in root layout (kills white flash); autofill override via `input:-webkit-autofill` inset box-shadow; fix Sonner `theme="dark"`; recalibrate `--chart-1..5` for the navy base.

8. **Uniform neon aesthetic on admin and cramped on mobile** -- full signage treatment on data-dense admin tables makes moderation work slower; mockup-designed desktop tiles break at 360px with long taxonomy names (e.g. "Western Star 4900EX"). Prevention: two intensity tiers in Wave 1 (Signage vs Workbench); status tokens distinct from brand red/cyan; build signage grid mobile-first with real taxonomy strings at 360px.

## Implications for Roadmap

Based on the combined research, the milestone maps into 5 waves with strict dependency ordering. The critical insight is that foundation work (Wave 1) must be fully atomic before any surface work begins -- attempting to restyle pages before the token layer and font wiring are done produces rework and two-theme drift.

### Phase 1: Brand Foundation & Token System
**Rationale:** Everything else depends on this. The token layer is the single highest-leverage change in the entire milestone -- one file edit re-skins ~80% of the app. The font wiring bug and `color-scheme` / native-widget setup must also land here, before any page is judged visually. The rename sweep is included as a parallel sub-plan because it is mechanical, has no UI dependencies, and leaving it for later means stakeholders evaluate an intermediate mixed-brand state.
**Delivers:** Neon oklch palette in `:root` (dark-only), brand-scale tokens in `@theme` (`--color-neon-red-*`, `--color-neon-cyan-*`, `--color-navy-*`, `--shadow-neon-*`, `--text-shadow-neon-*`), Barlow Condensed wired to `--font-heading`, Geist body font wiring bug fixed, `color-scheme: dark` + meta tags, `lib/brand.ts` centralized brand constants, full rename sweep (21 in-repo occurrences + e2e brand-const refactor), favicon/icon/OG assets, `app/layout.tsx` metadata with `title.template`
**Addresses:** Token foundation (P1), name/metadata/favicon sweep (P1)
**Avoids:** Pitfall 2 (hardcoded values), Pitfall 4 (rebrand misses), Pitfall 7 (dark theme half-applied), Pitfall 6 (font CLS)
**Research flag:** None -- standard Tailwind v4 + Next.js patterns, well-documented

### Phase 2: Shared Chrome (Primitives + Header)
**Rationale:** The 18 shadcn primitives and shared chrome must be done before any page surface, because all 61 feature components and 32 screens consume them. Restyling a page before `card.tsx` changes is rework. The header is the single most visible surface and sets the visual quality bar for stakeholder review of all subsequent work.
**Delivers:** All 18 `components/ui/` primitives restyled in place (button as neon red CTA, card as navy panel, focus rings preserved, Sonner pinned to dark, charts recalibrated), `site-header.tsx` redesigned (logo, prominent search, icon nav including sell entry = UAT fix #1), `user-menu.tsx`, `admin-sidebar.tsx`, `suspended-screen.tsx`, inline header variants, two-tier token policy (Signage vs Workbench) formalized
**Addresses:** Header redesign + sell entry (P1), primitive restyle (P1), UAT fix #1 (committed scope)
**Avoids:** Pitfall 3 (focus rings, contrast on primitives), Pitfall 8 (workbench tier for admin), Pitfall 1 (sell entry behavior-freeze contract checked)

### Phase 3: Public Surfaces + Signage Browse Grid
**Rationale:** Highest-traffic public surfaces are the brand showcase and the stakeholder's primary UAT surface. The browse-as-signage grid is the brand's signature screen and the one genuinely new component -- it must be built mobile-first with real taxonomy strings before being considered done.
**Delivers:** Feed/search page restyled (listing cards with photo/specs/red price/badges, signage browse grid for Make/Model/Category), listing detail page (behavior-freeze contract checked for contact-before-chat invariant), public profile page, new `app/not-found.tsx` (global branded 404), new route-group `error.tsx`, new `loading.tsx`
**Addresses:** Public page passes (P1), browse-as-neon-signage (P1), global 404/error/loading states (P2)
**Avoids:** Pitfall 1 (contact modal invariant #5), Pitfall 3 (red price contrast -- large text or lightened token), Pitfall 6 (no animated glows on feed cards), Pitfall 8 (360px signage grid check with real taxonomy strings)

### Phase 4: App / Auth / Admin Surfaces
**Rationale:** These surfaces can run in parallel after Waves 1 and 2. Auth pages are the fastest (6 screens, mostly primitive inheritance + dark navy panels with numbered steppers). Admin surfaces use the Workbench tier established in Wave 2 and are lowest priority (internal tool).
**Delivers:** Auth surfaces (6 pages, dark navy panels, neon borders, numbered steppers), seller/app surfaces (sell form, my listings, garage, messages, saved, account, verify, suspended), messaging surfaces (visual only -- realtime subscription logic untouched), admin surfaces (12 screens in Workbench tier: dark theme + tokens without signage flair, distinct status badge tokens)
**Addresses:** Auth + seller flow passes (P1), messaging + admin theme pass (P2), glow/motion flourishes (P2)
**Avoids:** Pitfall 1 (messaging realtime subscription code untouched), Pitfall 3 (display font absent from form labels/table cells), Pitfall 8 (admin Workbench tier, mobile-first)

### Phase 5: UAT Fixes, Dashboard Rebrand Sweep, Final QA
**Rationale:** The two functional UAT fixes travel as independent commits that can run alongside any visual wave, but their verification belongs at the end. The dashboard rebrand sweep requires triggering real transactional senders on Staging and reading actual received emails/SMS -- this is the evidence gate. Final QA is the convergence point for all acceptance criteria.
**Delivers:** Freeze-notice realtime refresh (UAT fix #2: additive Realtime subscription on `message_threads` + possible migration to add table to publication), vitest-* analytics purge (UAT fix #3: Staging SQL + test teardown cleanup), dashboard rebrand checklist with evidence (Supabase Auth templates, Twilio Verify service name, Resend sender, Vercel project), full contrast/focus/reduced-motion audit (axe + keyboard walk on 5 key templates), mobile Lighthouse comparison vs pre-redesign baseline, 24-step UAT walkthrough rerun on new skin, mockup-fidelity review
**Addresses:** UAT fixes (P1 committed scope), A11y pass (P1), final QA
**Avoids:** Pitfall 4 (dashboard surfaces), Pitfall 5 (e2e green, role/name selectors preserved), Pitfall 6 (Lighthouse mobile gate), Pitfall 7 (native widget audit)

### Phase Ordering Rationale

- **Tokens before primitives before surfaces** is the non-negotiable ordering rule: violating it causes surfaces to be styled against the wrong baseline, meaning double work when the token layer finally lands
- **Rename sweep in Wave 1** rather than last: stakeholders evaluating intermediate builds see consistent branding; and the e2e suite's brand-string assertions must be updated atomically with the wordmark change to keep the suite usable as a behavior oracle throughout the milestone
- **UAT fixes are isolated commits** that can float to any wave but must never be mixed with visual commits -- this keeps the "visual-only" claim auditable by diff and allows `git bisect` to identify behavioral regressions
- **Dashboard sweep with evidence gates** belongs at the end because it requires all transactional flows to be exercisable on Staging with the full new skin in place
- **No production traffic** (app is Staging-only, not launched) means the intermediate "dark theme everywhere, signage landing incrementally" state costs nothing

### Research Flags

Phases with standard patterns (skip additional research):
- **Phase 1 (Foundation):** Tailwind v4 `@theme` / CSS-variable token architecture is well-documented and verified against Context7; `next/font` Google Fonts pipeline is established; `color-scheme` meta/CSS pattern is W3C-documented.
- **Phase 2 (Primitives + Chrome):** shadcn/ui in-place restyle via CSS variables is the documented and intended customization path. Header rebuild is JSX work on established patterns.
- **Phase 4 (App/Auth/Admin):** All surface reskins follow the token + primitive inheritance established in Phases 1-2.
- **Phase 5 (QA):** Playwright e2e, axe, Lighthouse -- established tooling already in repo.

Phases that need a focused check before execution:
- **Phase 3 (Browse Signage Grid):** The signage grid is a new component surface. Confirm the exact data queries available (makes, models, configs, part categories) and verify that existing URL params (`?make=`, `?model=`, `?category=`) fully cover all browse destinations -- check `lib/search/params.ts` and `lib/listings/cascade.ts` at plan time.
- **Phase 5 (Freeze-notice Realtime fix):** Verify whether `message_threads` is in the `supabase_realtime` publication before writing the migration (MEDIUM confidence). One SQL check resolves it: `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_threads'`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All techniques verified against Tailwind v4 official docs (Context7), Next.js docs, and direct repo inspection; lockfile resolves Tailwind 4.2.x (>=4.1 required) |
| Features | HIGH | Surface inventory read directly from codebase (31 pages, ~70 components, grep-verified brand strings); rebrand checklist cross-referenced against industry sources |
| Architecture | HIGH | Every count, file path, and integration point verified by direct codebase read; font wiring bug and dark-theme gaps are repo-confirmed, not inferred |
| Pitfalls | HIGH (codebase) / MEDIUM (out-of-repo) | In-repo pitfalls verified by inspection; Twilio Verify SMS template wording and Supabase publication membership require console checks to confirm |

**Overall confidence:** HIGH

### Gaps to Address

- **Twilio Verify SMS template**: research identifies the service friendly name as a rebrand surface but wording is MEDIUM confidence. Resolve by opening the Twilio console before the rebrand sweep plan is written. Add to Phase 5 dashboard checklist with a triggered OTP as evidence.
- **`message_threads` Supabase Realtime publication membership**: architecture research flags this as unverified. Resolve with one SQL query before the UAT fix #2 migration is written: `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_threads'`.
- **Stakeholder logo assets**: header, favicon, OG image, and email branding all block on the final logo package (SVG preferred + PNG fallbacks). If the vector source does not exist, ship the PNG via `next/image` and generate icons from it with `sharp`. Phase 1 plan must account for either path.
- **Tilt Neon decision**: whether to include the optional Tilt Neon accent font is deferred to the 4 hi-fi mockup review during Phase 1 planning. If Barlow Condensed Italic + glow covers all signage moments, skip it entirely (smaller payload, tighter system).
- **`/browse` route vs in-feed signage**: research defaults to placing the signage grid on the feed's empty-criteria state (no new route). If mockup review suggests a dedicated `/browse` entry point is needed, log as a planning decision in STATE.md.

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (2026-06-12): `app/globals.css`, `app/layout.tsx`, all 5 layouts, `components/layout/site-header.tsx`, `components/layout/user-menu.tsx`, `components/account/suspended-screen.tsx`, `components/messaging/thread-view.tsx`, `app/(public)/page.tsx`, `app/(app)/messages/[threadId]/page.tsx`, `lib/admin/analytics.ts`, `lib/search/events.ts`, `package.json`, full `app/`, `components/`, `lib/` enumeration
- `/tailwindlabs/tailwindcss.com` (Context7) -- `@theme` namespaces, `--shadow-*`, `--text-shadow-*`, `--drop-shadow-*`, `--font-*`, `--animate-*`, `@utility` directive, text-shadow color/opacity modifiers, v4.1 release notes
- Next.js docs -- metadata file conventions (`icon.png`, `apple-icon.png`, `opengraph-image.png`, `favicon.ico`), `next/font` self-hosting, `title.template`
- W3C WAI -- SC 1.4.11 Non-text Contrast, SC 2.4.13 Focus Appearance, Sara Soueidan: focus indicators
- web.dev: color-scheme + meta tag
- Tobias Ahlin: animate box-shadow with pseudo-element opacity (canonical pattern)
- Vercel: next/font with size-adjust fallbacks, CLS prevention
- Google Fonts: Barlow Condensed (9 weights roman + italic, OFL), Tilt Neon (variable, OFL)
- `.planning/PROJECT.md`, `.planning/MILESTONES.md` -- v1.1 scope, exclusions, UAT carryovers

### Secondary (MEDIUM confidence)
- WebAIM: Contrast and Color + AccessibilityChecker: Dark Mode Accessibility -- halation/astigmatism guidance, dark neon contrast rules
- Codersblock: Creating Glow Effects with CSS + Zell Liew neon button writeup -- glow construction patterns, pseudo-element opacity animation
- DubBot: Dark Mode A11y -- dark mode accessibility considerations
- Rebrand checklists (brandvm.com, poweredbysearch.com, nicolesteffen.com) -- sweep surface coverage
- Supabase Realtime `postgres_changes` pattern -- proven for `messages` table; `message_threads` publication membership unverified
- Twilio Verify service friendly name in OTP SMS -- verify in Twilio console

---
*Research completed: 2026-06-12*
*Ready for roadmap: yes*
