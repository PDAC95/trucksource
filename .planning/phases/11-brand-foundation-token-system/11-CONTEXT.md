# Phase 11: Brand Foundation & Token System - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The app carries the OG Truck Parts identity at its base — name, logo/icon/OG assets, route metadata, and a dark-only neon token + typography system — before any surface is judged visually. This phase establishes the foundation that later phases (12 chrome, 13 public surfaces, 14 auth/app/admin, 15 sweep/QA) propagate. No component restyling, header/footer redesign, or signage browse here — those are Phase 12+. Functionality is frozen (behavior-freeze gate).

Requirements: BRND-01, BRND-02, BRND-03, THEM-01, THEM-02, THEM-03, THEM-04.

</domain>

<decisions>
## Implementation Decisions

### Brand assets & sourcing
- Stakeholder logo is available; original files go in **`private/brand/`** (git-ignored — `private/` added to `.gitignore`). Vector (SVG) preferred; high-res PNG acceptable.
- Processed/derived copies are generated **into `public/`** — never commit the originals.
- From the logo, derive: favicon set + OG share image (see Icon set and OG image below).

### Typography (THEM-02)
- Both fonts are **Claude's choice via `next/font` (Google Fonts)** — no stakeholder font files.
  - **Display/signage face:** a condensed retro display (truck-stop signage character) for headings/signage.
  - **Body face:** a readable, neutral sans that contrasts with the display.
- Fix the broken `--font-sans: var(--font-sans)` self-reference; wire `--font-heading` to the display face and body to the body face. Current default Geist mapping is replaced.
- **Load strategy:** `display: swap` + size-adjusted fallback metrics (`next/font` `adjustFontFallback`) to guarantee **zero layout shift on headings** (success criterion #4).
- **Fallback stack if display font fails:** native condensed sans (e.g. "Arial Narrow"/condensed sans-serif) to preserve the signage feel.

### Header mark (asset usage)
- Header shows **logo icon + text wordmark side by side** ("OG Truck Parts"), clear hierarchy, scales on mobile.
- Logo-image is also the source for favicon, OG share, and any splash.
- (Header redesign itself is Phase 12 — here we only establish the wordmark/asset and that it renders.)

### Neon token system (THEM-01)
- **Two neon families only: red + cyan.** Red = CTAs and price; cyan = accents/borders/links.
- **Base:** deep night-navy, nearly black with a blue tint (not pure black), so neon pops maximally. Exact oklch chosen in research against AA contrast.
- **Dual token per neon (confirmed):** each neon ships two tokens — a saturated **decorative/glow** variant (borders, glow) and a lightened **AA-passing text** variant (used when neon is type). Prevents illegible neon text.
- All neon defined as tokens in `globals.css` `@theme`; **no hardcoded hex outside `globals.css`** (grep-gated by the cross-cutting token-discipline gate).

### Glow & motion (THEM-03)
- **Selective glow:** strong glow only on key elements (CTAs, signage, active/hover/focus). Rest is flat with subtle neon borders. Prioritizes legibility / less fatigue.
- **Static by default, signature flicker only:** general glow is static; animated flicker/pulse reserved for 1–2 signature moments (e.g. logo/sign hero). Animation done via **pseudo-element opacity, never animated box/text-shadows**.
- **`prefers-reduced-motion`: freeze to static glow** — animation stops at a static lit state (no flicker), look preserved, no motion.
- **Border radii unchanged** — keep the existing `--radius` system; this phase changes color/glow/typography, not geometry.

### Dark-only rendering (THEM-04)
- **Remove the light theme entirely** — delete `:root` light tokens and the `.dark` toggle; single dark token set on `:root`. No dead light code.
- **Anti white-flash:** navy `background` on `<html>` via CSS + `color-scheme: dark` (CSS **and** `<meta>`), antialias. No blocking script needed (dark-only). Native inputs/scrollbars/autofill render dark.

### Icon set & metadata (BRND-02, BRND-03)
- **Full icon set + manifest:** `favicon.ico`, icon PNGs (32/192/512), `apple-touch-icon`, and a `manifest.webmanifest` with OG Truck Parts name/colors (covers tabs, iOS, add-to-home-screen).
- **Mobile browser `theme-color`: navy base** (matches first paint, immersive continuity).
- **Visible name string:** "OG Truck Parts".
- **Title template:** `%s | OG Truck Parts` (page first, brand second; home uses a brand-only default).
- **Default description / OG tagline:** "Real Parts. Real Sellers." (derived from stakeholder lema REAL PARTS / REAL INVENTORY / REAL SELLERS; NA heavy-truck parts marketplace).
- **OG share image:** single static image for all routes this phase — logo/wordmark on navy with neon glow. (Dynamic per-route OG deferred.)

### Brand sweep scope (BRND-01)
- **Replace every user-visible "Take-Off Parts" / "Create Next App" string** → "OG Truck Parts": UI copy, auth pages, suspended/freeze screen, header wordmark, README + `package.json` (visible name), titles/metadata.
- **e2e brand-string assertions updated in the same commits** so the suite stays a behavior oracle (same-commit-test-updates gate).
- **Out of scope for Phase 11 → Phase 15:** transactional email senders and Supabase Auth dashboard templates (need real triggered sends on Staging to evidence).
- **Infra untouched:** repo name, Vercel/Supabase project slugs, env vars, and routes are NOT renamed (BRND-01 "infra/repo slugs unchanged"). Zero deploy/env risk.

### Claude's Discretion
- Exact oklch values for navy base and the red/cyan decorative + AA-text variants (pick against measured AA contrast in research).
- Specific Google Font families for display and body.
- Exact glow token values (box-shadow/text-shadow magnitudes) and the pseudo-element flicker mechanics.
- Which 1–2 surfaces get the signature flicker.
- Next 16 `app/` icon convention vs explicit files for generating the icon set.

</decisions>

<specifics>
## Specific Ideas

- Aesthetic anchor: neon roadside / truck-stop at night — deep navy base, neon red signage for action/price, neon cyan accents, condensed retro display type (per stakeholder mockups).
- Tagline lineage: stakeholder's "REAL PARTS / REAL INVENTORY / REAL SELLERS" → condensed to "Real Parts. Real Sellers." for metadata.
- Quality bar: foundation must look intentional on its own before Phase 12 judges surfaces — no white flash, no layout shift on headings, neon legible as text.

</specifics>

<deferred>
## Deferred Ideas

- **Badge color system** — dealer/dismantler/manufacturer/owner-operator badges have distinct colors in stakeholder check.md (yellow/orange/green/etc). With a red+cyan-only neon palette, these resolve as **non-glow utility colors** during badge restyling in **Phase 12**, not as neon tokens here.
- **Dynamic per-route OG images** (e.g. listing title via `next/og`) — later phase; Phase 11 ships one static OG image.
- **Infra/repo/project rename** to og-truck-parts (repo, Vercel/Supabase projects, env vars) — explicitly excluded; would be its own task with CI/CD + domain risk.
- **Email + Supabase Auth template rebrand** — Phase 15 (BRND-04, BRND-05), requires Staging send evidence.

</deferred>

---

*Phase: 11-brand-foundation-token-system*
*Context gathered: 2026-06-15*
