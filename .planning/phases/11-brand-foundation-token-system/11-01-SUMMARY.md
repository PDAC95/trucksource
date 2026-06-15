---
phase: 11-brand-foundation-token-system
plan: 01
subsystem: ui
tags: [tailwind-v4, css, oklch, theming, neon, accessibility, wcag]

# Dependency graph
requires:
  - phase: 11 (research)
    provides: AA-verified OKLCH palette table (RESEARCH §Palette) and dark-only token spec
provides:
  - Dark-only night-navy :root palette (single source, color-scheme dark)
  - Red + cyan neon @theme families (decorative + AA-text variants each)
  - Glow box-shadow + text-shadow tokens, opacity-only flicker keyframe + reduced-motion freeze
  - scripts/check-contrast.mjs executable AA/gamut proof (Gate 3)
affects:
  - 11-02 (font rewire — owns @theme inline font tokens, mounts dark class on <html>)
  - 11-03 (package rename — owns package.json name)
  - 11-04 (header wordmark wires .neon-sign)
  - Phase 12 (component restyle — consumes neon/glow utilities, retires legacy dark: utils)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tailwind v4 @theme tokens emit utilities (text-neon-red-text, shadow-glow-red, text-shadow-neon-cyan)"
    - "Dark-only via single :root + color-scheme: dark (no light :root, no .dark toggle block)"
    - "Glow lives only as reusable shadow tokens; flicker animates pseudo-element opacity, never the shadow"
    - "Executable contrast/gamut script (OKLCH->linear sRGB->WCAG) gates any future palette nudge"

key-files:
  created:
    - scripts/check-contrast.mjs
  modified:
    - app/globals.css
    - package.json

key-decisions:
  - "Dark token values live on :root as single source; legacy dark: utilities layer the same values harmlessly until Phase 12 (no separate light :root)"
  - "Decorative neon-red passes 3:1 (3.90) but NOT 4.5:1 — reserved for borders/glow, never body text; neon-red-text (5.51) is the AA text variant"
  - "Flicker animates ::after opacity only (perf + A11Y); reduced-motion freezes to static fully-lit glow"

patterns-established:
  - "Pattern: every neon family ships a decorative variant (>=3:1) AND a lightened AA-text variant (>=4.5:1 on base and card)"
  - "Pattern: motion-bearing utilities ship with a prefers-reduced-motion freeze in the same file"
  - "Pattern: palette changes must keep scripts/check-contrast.mjs green (CI-able AA proof)"

requirements-completed: [THEM-01, THEM-03, THEM-04]

# Metrics
duration: 5min
completed: 2026-06-15
---

# Phase 11 Plan 01: Brand Foundation & Token System Summary

**Dark-only night-navy OKLCH palette with red/cyan neon @theme families (decorative + AA-text), glow/text-shadow tokens, an opacity-only flicker keyframe with reduced-motion freeze, and a vendored OKLCH->WCAG contrast script proving every token hits AA.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-15T13:27:14Z
- **Completed:** 2026-06-15T13:32:36Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Replaced the light `:root` and deleted the dead `.dark` toggle block — the app is now dark-only with `color-scheme: dark` and a navy first-paint background (no white flash).
- Added two neon families (red + cyan) as `@theme` tokens, each with a decorative variant and a lightened AA-text variant, plus glow box-shadow and text-shadow tokens.
- Added the signature `flicker` keyframe (animates pseudo-element opacity only) and the `.neon-sign` utility, frozen under `prefers-reduced-motion`.
- Vendored `scripts/check-contrast.mjs` (zero deps) — an executable AA/gamut proof whose computed CRs match RESEARCH §Palette to the hundredth (foreground 17.25, muted-fg 7.58, red-text 5.51/5.13, cyan-text 12.43/11.58, red-dec 3.90, cyan-dec 9.91).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the contrast/gamut checker (Gate 3)** - `a0e847c` (feat)
2. **Task 2: Rewrite :root dark-only + neon palette, delete light/.dark** - `6ac3801` (feat)
3. **Task 3: Flicker keyframe + reduced-motion freeze + neon-sign utility** - `44ad3bd` (feat)

## Files Created/Modified
- `scripts/check-contrast.mjs` - OKLCH->linear sRGB->WCAG contrast + sRGB gamut checker; exits 1 on any AA/3:1/gamut failure and prints a CR table.
- `app/globals.css` - Dark-only `:root` neon palette, `@theme` neon/glow/text-shadow tokens, `--animate-flicker`, `@keyframes flicker`, `.neon-sign` component, reduced-motion freeze, navy `html` background.
- `package.json` - Added `check:contrast` npm script.

## Decisions Made
- **Single-source dark `:root`:** dark values live on `:root`; the legacy `dark:` utilities in `components/ui/*` layer the same values harmlessly, so no separate light `:root` is needed. The `@custom-variant dark` and the `dark` class on `<html>` (Plan 02) stay until Phase 12 restyles those components.
- **Decorative vs text neon split:** `neon-red` decorative (CR 3.90) clears 3:1 but not 4.5:1 — it is for borders/glow only; `neon-red-text` (CR 5.51) is the body-text variant. Same pattern for cyan.
- **Opacity-only flicker:** the keyframe animates `::after` opacity, never the box/text-shadow, per the RESEARCH perf anti-pattern; reduced-motion freezes to a static fully-lit glow.

## Deviations from Plan

None - plan executed exactly as written.

(Prettier reformatted `app/globals.css` after each edit — line wrapping only, no semantic change. This is the project's standard pre-commit formatting, not a deviation.)

## Issues Encountered
None. All three verification gates passed first time: Gate 1 (no hex in globals.css — oklch only), Gate 3 (`check:contrast` exits 0), `npm run build` compiles, and the full vitest suite stayed green (43 files, 304 passed / 1 pre-existing skip) confirming PII/RLS/EXIF invariants untouched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The token foundation is complete and dark-correct; everything later in the milestone resolves through these tokens.
- Plan 02 (fonts) can proceed: the font lines in `@theme inline` were left untouched as specified, and mounting/keeping the `dark` class on `<html>` is its responsibility.
- Plan 04 can wire `.neon-sign` into the header wordmark (the single signature flicker call-site for this phase; a second slot is reserved for the Phase 13 signage hero).

## Self-Check: PASSED

All claimed artifacts verified on disk and in git history:
- Files: scripts/check-contrast.mjs, app/globals.css, package.json, 11-01-SUMMARY.md
- Commits: a0e847c, 6ac3801, 44ad3bd

---
*Phase: 11-brand-foundation-token-system*
*Completed: 2026-06-15*
