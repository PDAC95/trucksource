# Requirements: OG Truck Parts — v1.1 OG Rebrand & UI Redesign

**Defined:** 2026-06-12
**Core Value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — seller PII never exposed. v1.1 gives that experience a brand worth trusting: OG Truck Parts, neon truck-stop identity, applied everywhere, **functionality unchanged**.

## v1.1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Brand (BRND)

- [ ] **BRND-01**: User sees the product named "OG Truck Parts" everywhere — UI copy, auth pages, suspended screen, header wordmark, README/package.json (visible strings only; infra/repo slugs unchanged)
- [ ] **BRND-02**: Stakeholder logo + icon integrated: header logo, favicon set (ico/png/apple-touch), and OG share image generated from brand assets
- [ ] **BRND-03**: Every route serves correct metadata (title template, description, OpenGraph) — root no longer says "Create Next App"
- [ ] **BRND-04**: All 4 in-repo email senders (enforcement, new-message, verify alert, near-expiry cron) send under the OG Truck Parts name with no stale brand strings or dead URLs
- [ ] **BRND-05**: Supabase Auth dashboard email templates (confirm signup, reset password) rebranded to OG Truck Parts

### Theme Foundation (THEM)

- [ ] **THEM-01**: Dark-only neon token system in `globals.css` `@theme`: night-navy base, neon red/cyan scales (oklch), with dual tokens per neon (decorative glow vs lightened AA-passing text)
- [ ] **THEM-02**: Brand typography loaded via `next/font`: condensed display face for headings/signage + readable body font; current broken `--font-sans` mapping fixed
- [ ] **THEM-03**: Reusable glow patterns (box-shadow/text-shadow tokens; animation via pseudo-element opacity, never animated shadows), all gated behind `prefers-reduced-motion`
- [ ] **THEM-04**: App is forced dark: `color-scheme: dark` (CSS + meta), light theme removed, native inputs/scrollbars/autofill render dark

### Shared Chrome (CHRM)

- [ ] **CHRM-01**: All 18 owned shadcn primitives restyled to the navy/neon system (button, input, card, badge, dialog, select, sheet, skeleton, sonner, chart, …) so every consumer inherits the theme
- [ ] **CHRM-02**: Redesigned persistent header: logo, prominent search bar, icon nav with labels (search, sell, messages with unread badge, saved, account) — no cart/phone/alerts icons
- [ ] **CHRM-03**: User can start a listing from the header sell entry point on every page (v1.0 UAT gap)
- [ ] **CHRM-04**: Branded footer with wordmark + internal links (terms, key routes); social links deferred until profiles exist
- [ ] **CHRM-05**: Branded global error surfaces: `not-found.tsx`, route-group `error.tsx`, and themed `loading.tsx` states (no white flash anywhere)

### Surface Passes (SURF)

- [ ] **SURF-01**: Public surfaces reskinned: feed/search (facets, chips, slang banner), listing cards (photo, specs row, red price, verification badges), listing detail (gallery, comments, contact), public profile
- [ ] **SURF-02**: Browse-as-neon-signage: Make → Model → Category browse rendered as neon sign grids over the existing taxonomy queries and URL params (no new routes or data)
- [ ] **SURF-03**: Auth flows reskinned (login, register, forgot/reset, check-email, error): dark navy panels with neon borders
- [ ] **SURF-04**: Seller flows reskinned with numbered visual steppers (create listing, edit, my listings) — presentation only, no flow/validation changes
- [ ] **SURF-05**: Logged-in surfaces reskinned: account, verify (OTP), saved, garage, suspended screen
- [ ] **SURF-06**: Messaging reskinned (thread list, thread view, contact-form modal) without touching subscription/realtime logic
- [ ] **SURF-07**: Admin console restyled in a quieter "Workbench" tier (dark theme, density-first, no signage flair) including chart palette recalibrated for dark navy
- [ ] **SURF-08**: Every reskinned surface works equally well on mobile and desktop (header collapse, facet sheet, steppers on small screens)

### Accessibility (A11Y)

- [ ] **A11Y-01**: New theme passes WCAG AA contrast (4.5:1 normal text, 3:1 large text and UI components), verified on the 5 key templates (home, listing detail, register, sell, messages)
- [ ] **A11Y-02**: Visible focus states on all interactive elements (neon ring restyled, never removed); glow alone is never the focus indicator
- [ ] **A11Y-03**: All glow/flicker/motion honors `prefers-reduced-motion`; nothing flashes more than 3×/second

### Functional Fixes (FIX) — scoped exceptions to visual-only, isolated commits

- [ ] **FIX-01**: User on a stale tab sees the account freeze notice without manual refresh (realtime UPDATE listener on existing thread channel / suspended state)
- [ ] **FIX-02**: Staging analytics no longer show vitest-* search terms: existing rows purged + guard so test runs stop polluting search events

### Verification (QA)

- [ ] **QA-01**: Full Playwright e2e suite green after the redesign — brand-string assertions updated atomically with the rename; PII/RLS/EXIF invariant tests untouched and green
- [ ] **QA-02**: v1.0 24-step UAT walkthrough passes on the new skin + stakeholder mockup-fidelity review approved

## Future Requirements (v1.2+)

### Pre-launch blockers (next milestone candidates)

- **LNCH-01**: Photo upload via signed-URL-direct-to-Storage (Vercel ~4.5MB cap) + orphan cleanup
- **LNCH-02**: pg_cron enabled + CRON_SECRET (LIST-09 auto-expiry live)
- **LNCH-03**: Production Supabase project, own-domain Resend SMTP, Twilio upgrade + Geo US/CA

### Deferred redesign follow-ups

- **REDS-V2-01**: Visual regression baselines in CI (`toHaveScreenshot()`) after the new look is approved
- **REDS-V2-02**: Notifications/"alerts" feature behind a real nav icon
- **REDS-V2-03**: Branded HTML email layouts (text-level rebrand suffices in v1.1)
- **REDS-V2-04**: Social profile links in footer/header once profiles exist
- **REDS-V2-05**: Dynamic per-listing OG images (part photo in share card)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cart / checkout / payments UI (in mockups) | No payments in product; dead UI erodes trust — v2 decision |
| Phone-call CTA (in mockups) | Violates the privacy pillar (PII never exposed) |
| "Alerts" nav icon | No notifications feature exists; stub UI excluded by stakeholder decision |
| Light/dark theme toggle | The brand IS the dark theme; doubles design surface |
| Repo/Vercel/infra slug renames | Invisible to users; breaks wiring — revisit at production setup |
| Pixel-perfect mockup replication | Mockups contain non-existent features and aren't responsive; they are art direction |
| Rebuilding components without shadcn | Throws away tested a11y/behavior — restyle owned components in place |
| Functional changes beyond FIX-01/FIX-02 | Milestone contract is visual-only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmap) | | |

**Coverage:**
- v1.1 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 ⚠️ (roadmap pending)

---
*Requirements defined: 2026-06-12*
*Last updated: 2026-06-12 after initial definition*
