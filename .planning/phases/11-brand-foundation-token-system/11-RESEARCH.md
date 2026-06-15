# Phase 11: Brand Foundation & Token System - Research

**Researched:** 2026-06-15
**Domain:** Dark-only neon design token system (Tailwind v4 `@theme`), `next/font` typography, Next.js 16 App Router brand metadata/icons, and an exhaustive in-repo brand-string sweep — on a shipped Next.js 16.2.6 + React 19 + Tailwind 4.3 + shadcn/ui marketplace.
**Confidence:** HIGH — every file path, line number, version, and the entire palette/contrast table below was read or computed from the actual repo; Next 16 Metadata/font APIs verified against Context7 + nextjs.org (v16.2.9 docs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Brand assets & sourcing**
- Stakeholder logo is available; original files go in **`private/brand/`** (git-ignored — `private/` already in `.gitignore` at line 55). Vector (SVG) preferred; high-res PNG acceptable.
- Processed/derived copies are generated **into `public/`** (and `app/` icon conventions) — never commit the originals.
- From the logo, derive: favicon set + OG share image.

**Typography (THEM-02)**
- Both fonts are **Claude's choice via `next/font` (Google Fonts)** — no stakeholder font files.
  - Display/signage face: a condensed retro display (truck-stop signage character) for headings/signage.
  - Body face: a readable, neutral sans that contrasts with the display.
- Fix the broken `--font-sans: var(--font-sans)` self-reference; wire `--font-heading` to the display face and body to the body face. Current default Geist mapping is replaced.
- Load strategy: `display: swap` + size-adjusted fallback metrics (`next/font` `adjustFontFallback`) to guarantee zero layout shift on headings (success criterion #4).
- Fallback stack if display font fails: native condensed sans (e.g. "Arial Narrow"/condensed sans-serif) to preserve the signage feel.

**Header mark (asset usage)**
- Header shows logo icon + text wordmark side by side ("OG Truck Parts"), clear hierarchy, scales on mobile.
- Logo-image is also the source for favicon, OG share, and any splash.
- (Header redesign itself is Phase 12 — here we only establish the wordmark/asset and that it renders.)

**Neon token system (THEM-01)**
- Two neon families only: red + cyan. Red = CTAs and price; cyan = accents/borders/links.
- Base: deep night-navy, nearly black with a blue tint (not pure black), so neon pops maximally. Exact oklch chosen in research against AA contrast.
- Dual token per neon (confirmed): each neon ships two tokens — a saturated decorative/glow variant (borders, glow) and a lightened AA-passing text variant (used when neon is type). Prevents illegible neon text.
- All neon defined as tokens in `globals.css` `@theme`; no hardcoded hex outside `globals.css` (grep-gated by the cross-cutting token-discipline gate).

**Glow & motion (THEM-03)**
- Selective glow: strong glow only on key elements (CTAs, signage, active/hover/focus). Rest is flat with subtle neon borders.
- Static by default, signature flicker only: general glow is static; animated flicker/pulse reserved for 1–2 signature moments (e.g. logo/sign hero). Animation done via pseudo-element opacity, never animated box/text-shadows.
- `prefers-reduced-motion`: freeze to static glow — animation stops at a static lit state (no flicker), look preserved, no motion.
- Border radii unchanged — keep the existing `--radius` system; this phase changes color/glow/typography, not geometry.

**Dark-only rendering (THEM-04)**
- Remove the light theme entirely — delete `:root` light tokens and the `.dark` toggle; single dark token set on `:root`. No dead light code.
- Anti white-flash: navy `background` on `<html>` via CSS + `color-scheme: dark` (CSS and `<meta>`), antialias. No blocking script needed (dark-only). Native inputs/scrollbars/autofill render dark.

**Icon set & metadata (BRND-02, BRND-03)**
- Full icon set + manifest: `favicon.ico`, icon PNGs (32/192/512), `apple-touch-icon`, and a `manifest.webmanifest` with OG Truck Parts name/colors.
- Mobile browser `theme-color`: navy base.
- Visible name string: "OG Truck Parts".
- Title template: `%s | OG Truck Parts` (page first, brand second; home uses a brand-only default).
- Default description / OG tagline: "Real Parts. Real Sellers."
- OG share image: single static image for all routes this phase — logo/wordmark on navy with neon glow. (Dynamic per-route OG deferred.)

**Brand sweep scope (BRND-01)**
- Replace every user-visible "Take-Off Parts" / "Create Next App" string → "OG Truck Parts": UI copy, auth pages, suspended/freeze screen, header wordmark, README + `package.json` (visible name), titles/metadata.
- e2e brand-string assertions updated in the same commits so the suite stays a behavior oracle (same-commit-test-updates gate).
- Out of scope for Phase 11 → Phase 15: transactional email senders and Supabase Auth dashboard templates (need real triggered sends on Staging to evidence).
- Infra untouched: repo name, Vercel/Supabase project slugs, env vars, and routes are NOT renamed. Zero deploy/env risk.

### Claude's Discretion
- Exact oklch values for navy base and the red/cyan decorative + AA-text variants (pick against measured AA contrast in research). → **Answered in §Standard Stack / Palette below with measured CRs.**
- Specific Google Font families for display and body. → **Barlow Condensed (display) + Inter (body); see §Typography.**
- Exact glow token values (box-shadow/text-shadow magnitudes) and the pseudo-element flicker mechanics. → **See §Glow Token Mechanics.**
- Which 1–2 surfaces get the signature flicker. → **Recommendation: header/wordmark logo only this phase; second slot reserved for a Phase 13 signage hero.**
- Next 16 `app/` icon convention vs explicit files for generating the icon set. → **Use `app/` file conventions; see §Icons & Metadata.**

### Deferred Ideas (OUT OF SCOPE)
- Badge color system — dealer/dismantler/manufacturer/owner-operator badge colors resolve as non-glow utility colors during badge restyling in **Phase 12**, not as neon tokens here.
- Dynamic per-route OG images (`next/og`) — later phase; Phase 11 ships one static OG image.
- Infra/repo/project rename to og-truck-parts (repo, Vercel/Supabase projects, env vars) — explicitly excluded.
- Email + Supabase Auth template rebrand — Phase 15 (BRND-04, BRND-05), requires Staging send evidence.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BRND-01 | Product named "OG Truck Parts" everywhere — UI copy, auth pages, suspended screen, header wordmark, README/package.json (visible strings only; infra/repo slugs unchanged) | §Brand Sweep — complete enumerated file:line map (17 in-repo product-copy hits in app/components/lib/README/package.json + 3 e2e assertions). Note: lib/* email senders are tagged Phase-15-deferred per CONTEXT, NOT this phase. |
| BRND-02 | Stakeholder logo + icon integrated: header logo, favicon set (ico/png/apple-touch), OG share image generated from brand assets | §Icons & Metadata (Next 16 `app/` file conventions) + §Asset Pipeline (`sharp` 0.34.5 present; `.ico` needs `png-to-ico` dev dep). Logo→`private/brand/`, derived→`public/`+`app/`. |
| BRND-03 | Every route serves correct metadata (title template, description, OpenGraph) — root no longer says "Create Next App" | §Icons & Metadata: `app/layout.tsx` root `metadata` (title.template `%s \| OG Truck Parts`, default, description, `metadataBase`, `openGraph`) + `viewport` export (`colorScheme`/`themeColor`). Verified against Next 16.2.9 Metadata API. |
| THEM-01 | Dark-only neon token system in `globals.css` `@theme`: night-navy base, neon red/cyan scales (oklch), dual tokens per neon (decorative glow vs lightened AA text) | §Palette — measured oklch values + WCAG CR table. Red is the binding constraint (decorative red CR 3.90 fails normal-text 4.5:1 → dual token mandatory). |
| THEM-02 | Brand typography via `next/font`: condensed display for headings/signage + readable body; broken `--font-sans` mapping fixed | §Typography — Barlow Condensed + Inter, `@theme inline` rewire, `adjustFontFallback` default true for zero CLS. |
| THEM-03 | Reusable glow patterns (box/text-shadow tokens; animation via pseudo-element opacity, never animated shadows), gated behind `prefers-reduced-motion` | §Glow Token Mechanics — `--shadow-glow-*`/`--text-shadow-neon-*` tokens, `::after` opacity flicker keyframe, `motion-reduce` freeze. |
| THEM-04 | App forced dark: `color-scheme: dark` (CSS + meta), light theme removed, native inputs/scrollbars/autofill render dark | §Dark-Only — delete `.dark` block + light `:root`, single dark `:root`, `color-scheme: dark`, `<html>` navy bg, `viewport.colorScheme`, sonner pin `theme="dark"`, remove `next-themes`. |
</phase_requirements>

## Summary

This is a **subtraction-and-centralization** phase, not a build phase. The repo already runs effectively light-only (no `ThemeProvider` is mounted anywhere; the `.dark` block is dead code), and **every component is 100% token-driven** — there is no per-page CSS. That single fact means the palette, fonts, and radius swap centrally in `app/globals.css` + `app/layout.tsx`, and ~80% of the app reskins from one file edit. The brand-string rename and the Next 16 metadata/icon wiring are the two finite, gate-able chores; the neon token system is the only genuinely design-decisional work.

Three concrete bugs/gaps are confirmed in the live repo and are the spine of this phase: (1) `app/globals.css:10` has the broken `--font-sans: var(--font-sans)` self-reference, so body text currently falls through to browser defaults; (2) `app/layout.tsx:16-17` still ships the create-next-app scaffold metadata (`title: "Create Next App"`); (3) seventeen product-copy "Take-Off Parts"/"Create Next App" strings live across app/components/README/package.json plus three e2e assertions that will go red on rename unless updated in the same commits.

The highest-value research output is the **measured oklch palette** (below). Computing WCAG contrast on candidate values proves the dual-token decision is not optional: the saturated decorative red `oklch(0.58 0.232 25)` lands at **CR 3.90** against the navy base — it passes the 3:1 bar for UI/borders/large text but **fails the 4.5:1 bar for normal body text**, which is exactly why a separate lightened red text variant (`oklch(0.66 0.2 25)`, CR 5.51) is required. Cyan is comfortable in both roles (decorative CR 9.91, text CR 12.43).

**Primary recommendation:** Treat Phase 11 as four atomic waves — (1) **dark-only token + palette swap** in `globals.css` (delete `.dark`/light `:root`, write the neon dark `:root`, add neon + glow tokens to `@theme`, `color-scheme: dark`); (2) **font rewire** in `app/layout.tsx` + `@theme` (Barlow Condensed display + Inter body, fix the self-reference); (3) **brand-string sweep + metadata/icons** (rename map below, root `metadata`+`viewport`, `app/` icon files from `sharp`, `app/manifest.ts`); (4) **e2e brand-assertion updates landed in the same commits** as the strings they cover. No new runtime dependencies; add `png-to-ico` as a dev dep for `.ico` and remove `next-themes`.

## Standard Stack

### Core (all already in the repo — confirmed from package.json + resolved versions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | **16.2.6** | App Router, Metadata API, `next/font`, file-based icon conventions | Confirmed `package.json`; matches CLAUDE.md "Next 16" |
| `react` / `react-dom` | **19.2.4** | runtime | confirmed |
| `tailwindcss` | **resolved 4.3.0** (range `^4`) | CSS-first `@theme` tokens, `text-shadow-*` utilities, `@utility` | resolved 4.3.0 ≥ 4.1 → `text-shadow-*` + `--text-shadow-*` namespace available (STATE.md flagged this check — **CONFIRMED satisfied**) |
| `sharp` | **0.34.5** | re-encode source logo → icon PNGs + OG image | already a dependency (EXIF pipeline); reuse for icon generation. **Cannot emit `.ico`.** |
| `next/font/google` | built into Next 16 | self-hosted Barlow Condensed + Inter, size-adjust fallback | `adjustFontFallback` default `true`, `display` default `swap` (verified nextjs.org v16.2.9) |
| `lucide-react` | present | icons inherit `currentColor` → reskin free | no work needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `png-to-ico` | latest (dev) | generate `app/favicon.ico` from a PNG (sharp can't) | one-off in the icon-generation script; dev dependency only |
| `tw-animate-css` | present | keyframe utilities for the flicker animation | host the `flicker` keyframe (or define `--animate-flicker` in `@theme`); no animation library needed |

### Remove

| Library | Why |
|---------|-----|
| `next-themes` (`^0.4.6`, present) | Dark-only app needs no theme provider/toggle. **Sole consumer is `components/ui/sonner.tsx`** (`useTheme()`); replace with hardcoded `theme="dark"`, then `npm uninstall next-themes`. |

**Installation:**
```bash
npm install -D png-to-ico
npm uninstall next-themes   # after editing components/ui/sonner.tsx
# No runtime packages added. Fonts are zero-install via next/font/google.
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Barlow Condensed (display) | Bungee / Bungee Shade | Bungee is caps-only, no italics/lowercase — worse for a wordmark + general headings. Use only if mockups demand chromatic block signage. |
| Inter (body) | keep Geist body | Geist is the scaffold default; Inter pairs cleanly with Barlow Condensed and has best-in-class `next/font` fallback metrics. Either works — Inter recommended for a cleaner break from scaffold identity. Low-stakes; planner may keep Geist to shrink diff. |
| Tilt Neon (accent display) | — | Optional neon-tube accent for ONE hero word. STATE.md defers this to hi-fi mockup review during planning. Don't load a third font unless a signage hero needs it. |
| CSS-only glow | framer-motion / `motion` | No functional animation need; visual-only milestone. CSS `opacity` flicker on a pseudo-element is GPU-composited and cheaper. |
| Forced dark in `:root` | `next-themes forcedTheme="dark"` | Keeps a dependency for zero benefit; light mode is explicitly out of scope. |

## Architecture Patterns

### What swaps centrally vs per-component (the leverage map)

```
app/
├── layout.tsx        ← WAVE 2+3: fonts (Barlow Condensed + Inter), metadata+viewport, html bg + color-scheme
├── globals.css       ← WAVE 1: THE theme. delete .dark + light :root; neon dark :root; neon+glow @theme tokens
├── manifest.ts       ← NEW (BRND-02): name/colors/icons web manifest
├── icon.png          ← NEW (BRND-02): 512² (sharp from logo)
├── apple-icon.png    ← NEW (BRND-02): 180² opaque navy bg (sharp)
├── opengraph-image.png + .alt.txt ← NEW (BRND-03): 1200×630 static brand card
├── favicon.ico       ← REPLACE (BRND-02): from logo via png-to-ico
└── (route groups)    ← brand-string edits only (login copy, page titles, wordmark)
components/
├── ui/sonner.tsx     ← pin theme="dark" (removes the only next-themes import)
├── layout/site-header.tsx       ← wordmark string + (this phase) logo image render
├── account/suspended-screen.tsx ← wordmark string
e2e/
├── home.spec.ts, auth.spec.ts   ← brand-assertion updates (SAME COMMIT as wordmark)
private/brand/        ← NEW dir, git-ignored: original logo source (never committed)
```

**Key insight:** there is **no per-page stylesheet anywhere** — `app/globals.css` is the only CSS file and every component styles via Tailwind utilities resolving through `@theme`. Palette/radius/fonts are a central swap; this phase does **not** restyle components (that is Phase 12). The only component markup edits here are the wordmark/logo render and the 3 hardcoded brand strings.

### Pattern 1: Dual-token-per-neon in Tailwind v4 `@theme`

**What:** Each neon color ships two tokens — a decorative/glow variant (used on borders, glow, large UI) and a lightened AA-passing text variant (used whenever the neon is type). The component author picks `text-neon-red-text` for labels and `border-neon-red` / `shadow-glow-red` for chrome.

**Why:** Measured contrast proves the saturated red fails 4.5:1 as body text. One token can't serve both "vivid signage" and "legible text." (CONTEXT locked this; the data below is the justification.)

**Example (token shape — values from §Palette):**
```css
/* app/globals.css */
@theme {
  /* neon families — decorative (glow/border/large) + text (AA on navy) */
  --color-neon-red:        oklch(0.58 0.232 25);   /* decorative; CR 3.90 (UI/large only) */
  --color-neon-red-text:   oklch(0.66 0.20  25);   /* AA text;   CR 5.51 */
  --color-neon-cyan:       oklch(0.78 0.13  195);  /* decorative; CR 9.91 */
  --color-neon-cyan-text:  oklch(0.85 0.115 195);  /* AA text;   CR 12.43 */
}
/* yields utilities: text-neon-red-text, border-neon-red, bg-neon-red, text-neon-cyan-text, ... */
```

### Pattern 2: `next/font` + Tailwind v4 `@theme inline` rewire (fixes the bug)

**What:** Register two Google fonts in `app/layout.tsx` exposing CSS variables, attach both `.variable` classes to `<html>`, then map them in `@theme inline`. This replaces the broken `--font-sans: var(--font-sans)` self-reference.

**Why:** Verified official pattern (nextjs.org v16.2.9 "With Tailwind CSS"). `adjustFontFallback` defaults to `true` → Next injects a size-adjusted local fallback (`size-adjust`, `ascent-override`, etc.) so swapping from fallback to the real font produces **zero layout shift** (success criterion #4). `display` defaults to `swap`.

**Example:**
```tsx
// app/layout.tsx
import { Barlow_Condensed, Inter } from "next/font/google";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],   // condensed signage weights (non-variable → weights required)
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",                  // default, explicit for intent
  // adjustFontFallback: true is the default → zero CLS
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",                  // variable font → no weight array needed
});

// <html className={`${display.variable} ${body.variable} h-full antialiased`}>
```
```css
/* app/globals.css — replace the broken self-reference */
@theme inline {
  --font-sans: var(--font-body);        /* was: var(--font-sans)  ← BUG */
  --font-heading: var(--font-display);  /* was: var(--font-sans) */
  --font-mono: var(--font-geist-mono);  /* keep or drop with Geist_Mono */
}
```
> **Fallback stack for the display face if it fails to load:** pass `fallback: ["Arial Narrow", "Roboto Condensed", "sans-serif"]` to preserve the condensed signage feel (CONTEXT locked this).

### Pattern 3: Glow as tokens, animate opacity (never shadows)

See §Glow Token Mechanics. The token holds the static glow; flicker is a `::after` overlay whose `opacity` animates. `box-shadow`/`text-shadow`/`filter` values are **never** keyframed (per-frame repaint = feed jank).

### Anti-Patterns to Avoid

- **Animating `box-shadow`/`text-shadow`/`filter`** for pulse/flicker → per-frame repaint. Render glow at full strength on a pseudo-element and animate its `opacity` (GPU-composited).
- **Single neon token for both text and chrome** → illegible neon body text (red fails 4.5:1). Always dual.
- **Hardcoded hex anywhere outside `globals.css`** → breaks the token-discipline gate. Define a token, use the utility.
- **Keeping the `.dark` class + a toggle** → dark-only brand; toggle doubles QA for zero value. Delete it.
- **Per-listing/full 3-layer glow on every feed card** → measurable paint cost (Phase 13 concern; note it now). Reserve full halos for CTAs/hover/focus/hero.
- **Re-introducing `tailwind.config.js`** → project is CSS-first v4; config splits the source of truth. Everything lives in `@theme`.
- **Auto-tracing the neon PNG logo to SVG** → gradient glows posterize into banded blobs. Ship PNG via `next/image` (explicit width/height, no CLS) or request vector source.

## Palette — measured oklch values + WCAG contrast (HIGHEST-VALUE OUTPUT)

All contrast ratios below were **computed** (OKLCH→linear-sRGB→WCAG relative luminance→CR) against the chosen navy base. WCAG AA targets: **4.5:1** normal text, **3:1** large text (≥18.66px bold / ≥24px) and UI components/borders.

### Base & surfaces

| Token | oklch | ~hex | Role |
|-------|-------|------|------|
| `--background` (navy base) | `oklch(0.18 0.022 264)` | `#0d111b` | page background — nearly black, blue tint |
| `--card` (elevated) | `oklch(0.215 0.025 264)` | `#141925` | cards/panels (one step lighter) |
| `--foreground` (off-white) | `oklch(0.97 0.005 264)` | `#f3f5f9` | body text — **CR 17.25 on base** ✓ |
| `--muted-foreground` | `oklch(0.72 0.02 264)` | `#9ea5b2` | secondary text — **CR 7.58 on base** ✓ (bump to `0.76` → 8.76 if planner wants headroom) |

### Neon RED (CTAs + price) — dual token REQUIRED

| Token | oklch | ~hex | CR vs base | AA verdict |
|-------|-------|------|-----------|------------|
| `--color-neon-red` (decorative/glow/border/large) | `oklch(0.58 0.232 25)` | `#e30a28` | **3.90** | ✓ 3:1 (UI/border/large) — **✗ 4.5:1 normal text** |
| `--color-neon-red-text` (AA text) | `oklch(0.66 0.20 25)` | `#f4514f` | **5.51** | ✓ normal text on base; **5.13 on `--card`** ✓ |

> This is the empirical proof the dual-token rule is mandatory: the vivid CTA red is illegal as body text but legal as a button fill/border/price-at-large-size. The lightened variant covers neon-as-type.

### Neon CYAN (accents/borders/links) — comfortable in both roles

| Token | oklch | ~hex | CR vs base | AA verdict |
|-------|-------|------|-----------|------------|
| `--color-neon-cyan` (decorative/glow/border) | `oklch(0.78 0.13 195)` | `#1ad1d1` | **9.91** | ✓ everything |
| `--color-neon-cyan-text` (AA text/links) | `oklch(0.85 0.115 195)` | `#61e5e5` | **12.43** | ✓ everything (11.58 on `--card`) |

> Cyan could technically use one token, but ship both for consistency and so links/labels get a slightly brighter, more "lit" type variant.

**Notes for the planner:**
- All values are **in-gamut** for sRGB (verified by the computation; no out-of-gamut flags).
- These are starting values tuned to hit AA with margin; minor hue/chroma nudges during mockup-fidelity review are fine **as long as the CR floors hold** (re-run the contrast script, §Validation Gates).
- Map neon into the shadcn token bridge where it makes semantic sense: e.g. `--primary` → red, `--ring`/`--accent` → cyan, `--destructive` stays red-family. The full shadcn token remap (button/card defaults) is **Phase 12**; this phase only needs the tokens to **exist** and the base/foreground/radius to be dark-correct.

## Glow Token Mechanics (THEM-03)

### Static glow tokens (the default everywhere glow is wanted)

```css
@theme {
  /* box-shadow halos — "tube + spread". Magnitudes: tight inner + soft outer. */
  --shadow-glow-red:  0 0 4px oklch(0.58 0.232 25 / 0.7), 0 0 14px oklch(0.58 0.232 25 / 0.45);
  --shadow-glow-cyan: 0 0 4px oklch(0.78 0.13  195 / 0.7), 0 0 14px oklch(0.78 0.13 195 / 0.45);
  /* text glow for signage headings */
  --text-shadow-neon-red:  0 0 6px oklch(0.58 0.232 25 / 0.6);
  --text-shadow-neon-cyan: 0 0 6px oklch(0.78 0.13 195 / 0.6);
}
/* Tailwind v4.3 exposes: shadow-glow-red, shadow-glow-cyan, text-shadow-neon-red, text-shadow-neon-cyan */
```
- Pair a 1px neon **border** with the glow shadow to read as a lit tube. "Tube off" rest state for repeated grids = border only, no shadow (Phase 13 perf budget).
- For the **non-rectangular logo** use `filter: drop-shadow()` (traces alpha) instead of box-shadow — but keep it static.

### Signature flicker — pseudo-element opacity only

```css
@theme { --animate-flicker: flicker 2.5s steps(1) infinite; }

@keyframes flicker {
  0%, 18%, 22%, 25%, 53%, 57%, 100% { opacity: 1; }   /* lit */
  20%, 24%, 55% { opacity: 0.55; }                     /* dim blips, never full-off > brief */
}

.neon-sign { position: relative; }
.neon-sign::after {
  content: "";
  position: absolute; inset: 0;
  box-shadow: var(--shadow-glow-red);   /* glow lives on the overlay */
  border-radius: inherit;
  pointer-events: none;
  animation: var(--animate-flicker);    /* animate OPACITY of this layer, not the shadow */
}
```
- **`prefers-reduced-motion` → freeze to static lit:** the look is preserved, motion stops.
```css
@media (prefers-reduced-motion: reduce) {
  .neon-sign::after { animation: none; opacity: 1; }   /* static, fully lit */
}
```
- **A11Y floor (A11Y-03, audited Phase 15 but built-in here):** nothing flashes more than **3×/second** — the keyframe above is ~1–2 blips per cycle, well under 3 Hz.
- **Where the flicker goes this phase:** recommend **the header wordmark/logo only** (one signature moment). Reserve the second allowed slot for a Phase 13 signage hero — don't spend both now.

## Dark-Only Rendering (THEM-04)

### globals.css edits (all subtraction + one new `:root`)
1. **Delete the `.dark { ... }` block** (lines 86–118 today) and the **light `:root` body** (lines 51–84) — replace `:root` with the neon dark values (base/foreground/card/muted from §Palette + neon tokens). `@custom-variant dark` (line 5) can stay harmlessly or be removed.
2. Add `color-scheme: dark;` to `:root` (or `html`) → native form controls, scrollbars, autofill, and the UA canvas render dark.
3. In `@layer base`, set `html { background: var(--background); }` so the very first paint is navy (anti white-flash).

### layout.tsx edits
4. Add a **`viewport` export** (Next 16 moved `themeColor`/`colorScheme` out of `metadata`):
```tsx
import type { Viewport } from "next";
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0d111b",   // navy base — matches first paint + mobile browser chrome
};
```
5. Keep `className="... dark antialiased"` on `<html>` is **optional** belt-and-suspenders so any residual `dark:` utility in owned shadcn components still activates; since we delete the `.dark` block, the cleaner path is to drop both the class and the `dark:` variants. Planner's call — note it.

### sonner + next-themes
6. `components/ui/sonner.tsx` is the **only** `next-themes` consumer (`useTheme()`, currently defaults to "system" — wrong on a dark-only app). Replace with hardcoded `theme="dark"`, then `npm uninstall next-themes`.

### Anti white-flash — no blocking script needed
Because there is no light mode and no user preference to read, **no inline blocking `<script>` is required** (the usual `next-themes` FOUC guard is moot). The defense is purely: `color-scheme: dark` (CSS) + `viewport.colorScheme` (meta) + `<html>` navy background + `themeColor` navy. Confirmed sufficient for a single forced theme.

## Icons & Metadata (BRND-02, BRND-03) — Next 16 file conventions

**Use `app/` file conventions, not hand-wired `<head>` tags** — Next generates the `<link>`/`<meta>` for these automatically (stable since Next 13, unchanged in 16; verified Context7 + nextjs.org).

| File (in `app/`) | Size | Notes |
|------|------|-------|
| `favicon.ico` | 32² (multi-size ok) | **replace** the create-next-app default; generate from logo via `png-to-ico` |
| `icon.png` | 512² | `<link rel="icon">`; navy or transparent bg |
| `apple-icon.png` | 180² | iOS home screen — **opaque navy bg** (iOS fills transparency unpredictably) |
| `opengraph-image.png` + `opengraph-image.alt.txt` | 1200×630 | static brand card: wordmark over navy + neon glow |
| (optional) `twitter-image.png` | 1200×630 | falls back to OG image if omitted — skip this phase |

**Web manifest** — `app/manifest.ts` (typed, not a static file):
```tsx
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OG Truck Parts",
    short_name: "OG Truck Parts",
    description: "Real Parts. Real Sellers.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d111b",
    theme_color: "#0d111b",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      // add 192² if generated; or rely on icon.png + apple-icon.png conventions
    ],
  };
}
```

**Root `metadata`** in `app/layout.tsx` (replaces the `"Create Next App"` scaffold at lines 16–17):
```tsx
import type { Metadata } from "next";
export const metadata: Metadata = {
  metadataBase: new URL("https://<staging-or-prod-domain>"),  // required for relative OG URL → absolute; decide value
  title: {
    default: "OG Truck Parts — Real Parts. Real Sellers.",   // home / brand-only
    template: "%s | OG Truck Parts",                           // page-first, brand-second
  },
  description: "Real Parts. Real Sellers. North-American heavy-truck parts marketplace.",
  openGraph: {
    title: "OG Truck Parts",
    description: "Real Parts. Real Sellers.",
    siteName: "OG Truck Parts",
    type: "website",
    images: ["/opengraph-image.png"],   // resolved against metadataBase; or rely on the app/opengraph-image.png convention which auto-injects
  },
};
```
- **`metadataBase` is required** for relative OG image URLs to resolve to absolute (build error otherwise). Decide the value (staging domain vs prod) at plan time — it is a per-environment string; the deferred infra rename does NOT block picking a URL here.
- The `app/opengraph-image.png` **file convention auto-injects** the OG image tags, so the explicit `openGraph.images` line is optional/belt-and-suspenders. Pick one to avoid duplicate tags — recommend the file convention + omit `openGraph.images`.
- Per-route titles already exist on 3 auth pages (`register`, `check-email`, `auth-code-error`) — once `template` is set they'll render as `... | OG Truck Parts` automatically after the string rename.

## Asset Pipeline (BRND-02)

- **Source logo → `private/brand/`** (git-ignored). Prefer SVG; high-res PNG acceptable.
- **`sharp@0.34.5` is already installed** (EXIF strip pipeline). Reuse it in a one-off generation script (`scripts/gen-icons.mjs` or similar) to re-encode the source into `app/icon.png` (512²), `app/apple-icon.png` (180², flattened onto navy `#0d111b`), and `app/opengraph-image.png` (1200×630, wordmark composited on navy).
- **`.ico` gap:** `sharp` cannot emit `.ico`. Add `png-to-ico` (dev dep) and feed it a 32²/48² PNG, or generate the `.ico` once externally. This is the only extra tool.
- **Header logo render** (this phase = "it renders," redesign is Phase 12): `next/image` with explicit `width`/`height` (no CLS) sourcing a PNG from `public/`, or inline SVG if vector source exists. CONTEXT: icon + wordmark side by side. A small `Logo`/wordmark component is justified because **4+ call sites** hardcode the text today (site-header, suspended-screen, (app) inline header, auth) — centralizing avoids re-grepping later.
- **Blocker (STATE.md):** stakeholder logo package not yet delivered. Plan with an **asset-path contingency** — the token/font/metadata/rename waves do not depend on the logo and can land first; icon/OG generation and the header logo image wait on the asset (or use a temporary wordmark-only render).

## Brand Sweep — exhaustive enumerated map (BRND-01)

**In-scope this phase (user-visible product copy).** Grep-verified file:line. `.planning/`, `docs/`, and `milestones/` archives are **exempt** (historical).

| # | File:line | Current string | → |
|---|-----------|----------------|---|
| 1 | `app/layout.tsx:16` | `title: "Create Next App"` | OG Truck Parts metadata (see §Metadata) |
| 2 | `app/layout.tsx:17` | `description: "Generated by create next app"` | "Real Parts. Real Sellers. …" |
| 3 | `app/(auth)/register/page.tsx:5` | `"Create your account · Take-Off Parts"` | `· OG Truck Parts` (or drop suffix once template set) |
| 4 | `app/(auth)/check-email/page.tsx:7` | `"Check your email · Take-Off Parts"` | `· OG Truck Parts` |
| 5 | `app/(auth)/auth-code-error/page.tsx:6` | `"Link invalid · Take-Off Parts"` | `· OG Truck Parts` |
| 6 | `app/(auth)/login/page.tsx:64` | `"Log in to your Take-Off Parts account"` | `... OG Truck Parts account` |
| 7 | `components/layout/site-header.tsx:33` | wordmark `Take-Off Parts` (a `<Link>`, role=link) | logo+wordmark "OG Truck Parts" |
| 8 | `components/account/suspended-screen.tsx:35` | wordmark `Take-Off Parts` | "OG Truck Parts" |
| 9 | `app/(app)/layout.tsx:53` | inline read-only header `Take-Off Parts` | "OG Truck Parts" |
| 10 | `package.json:2` | `"name": "take-off-parts"` | `"og-truck-parts"` (visible name; **regenerate package-lock** — `package-lock.json:2,8` mirror it) |
| 11 | `README.md:1` | `# Take-Off Parts` | `# OG Truck Parts` |

**e2e assertions — MUST update in the SAME COMMIT as the wordmark (same-commit-test-updates gate):**

| # | File:line | Current assertion | Note |
|---|-----------|-------------------|------|
| 12 | `e2e/home.spec.ts:6` | `getByRole("heading", { name: "Take-Off Parts" })` | ⚠️ **Discrepancy:** the actual home `<h1>` is `"Find your part"` (`app/(public)/page.tsx:119`); the only "Take-Off Parts" on `/` is the header **link** (role=link, not heading). This assertion's current pass behavior is suspect — the planner should reconcile: assert the header wordmark **link** name "OG Truck Parts", or assert the real `<h1>` "Find your part". Don't blindly rename "Take-Off Parts"→"OG Truck Parts" inside a `heading` role that doesn't match the DOM. |
| 13 | `e2e/auth.spec.ts:125` | `getByRole("link", { name: "Take-Off Parts" })` | → `"OG Truck Parts"` (header wordmark link) |
| 14 | `e2e/auth.spec.ts:131` | `getByRole("link", { name: "Take-Off Parts" })` | → `"OG Truck Parts"` (post-reload) |

**Explicitly DEFERRED to Phase 15 (per CONTEXT — need Staging send evidence). Do NOT touch this phase, but listed so the sweep gate excludes them:**
- `lib/admin/email.ts:14,33-37`, `lib/actions/admin/enforcement.ts:58,119,169,226,300`, `lib/messaging/notify.ts:12,79,136`, `lib/verify/alert.ts:49`, `app/api/cron/near-expiry/route.ts:123` (+ the hardcoded `https://takeoffparts.com` URL → domain decision is also Phase 15).

**Leave alone (not brand copy):** `tests/integration/*` use `takeoffparts.gsd+...@gmail.com` real test-mailbox addresses; `check.md:439` "OEM Take-Off Parts" is an industry term (a *type of part*, not the product name) — verify in context but likely keep.

> Because `lib/*` senders are Phase-15-deferred, the Phase 11 token-discipline brand grep gate must **scope to `app/ components/ README.md package.json` (and e2e)** — NOT `lib/` — or it will flag the intentionally-deferred email strings. See §Validation Gates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Self-host fonts / kill CLS | `<link>` to Google CDN + manual `@font-face` size-adjust | `next/font/google` (`adjustFontFallback` default true) | Build-time self-host, auto size-adjust fallback, no external request/consent surface |
| Favicon/OG `<head>` tags | hand-written `<link rel=...>`/`<meta property="og:...">` | `app/icon.png`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/manifest.ts` conventions | Next generates correct tags + cache-busting hashes |
| Dark-mode FOUC guard | inline blocking theme script | `color-scheme: dark` + `viewport.colorScheme` + `<html>` bg | No preference to read on a forced single theme |
| Neon glow animation | JS rAF / animating shadow values | CSS `@keyframes` on pseudo-element **opacity** | GPU-composited, no per-frame repaint |
| `.ico` from PNG | manual byte packing | `png-to-ico` (dev dep) | sharp can't emit ICO; one tool, one script |
| Logo vectorization | auto-tracer (vectorizer.ai/vtracer) | ship PNG via `next/image` or request vector source | Neon gradients posterize into banded blobs |

**Key insight:** every brand/theme concern in this phase has a first-party Next/Tailwind/CSS solution. The only added tool is `png-to-ico` (dev-only); the only removed one is `next-themes`.

## Common Pitfalls

### Pitfall 1: The `--font-sans` self-reference silently shipping browser-default body text
**What goes wrong:** `@theme inline { --font-sans: var(--font-sans); }` resolves to nothing; body text uses the UA default, not the intended font.
**Why:** Geist is registered as `--font-geist-sans` but the token maps to a variable that's never defined.
**How to avoid:** Map `--font-sans: var(--font-body)` and `--font-heading: var(--font-display)` to the actually-registered `next/font` variables.
**Warning signs:** Body copy renders in Times/Arial despite a font being "loaded"; `getComputedStyle(body).fontFamily` shows no custom family.

### Pitfall 2: Decorative neon used as body text → AA failure
**What goes wrong:** `text-neon-red` on a small label = CR 3.90, fails 4.5:1.
**How to avoid:** Two tokens per neon; `*-text` variant for type, decorative for chrome/large. Verified CRs in §Palette.
**Warning signs:** Axe/contrast checker flags red labels/links; price text at small sizes fails.

### Pitfall 3: Rebrand misses on surfaces no grep reaches (and over-reaching into deferred ones)
**What goes wrong:** Two failure modes — (a) a shared link unfurls as "Create Next App" because root metadata was never touched; (b) the brand grep gate flags the **intentionally-deferred** `lib/*` email strings and someone "fixes" them without Staging evidence, violating CONTEXT.
**How to avoid:** Root `metadata`+`viewport` is its own checklist item; the Phase-11 brand grep gate scopes to `app/ components/ README.md package.json e2e/` (exclude `lib/`).
**Warning signs:** Tab title or OG preview shows the scaffold name; email FROM lines change in a Phase 11 commit.

### Pitfall 4: e2e `heading` vs `link` role mismatch on the home spec
**What goes wrong:** `e2e/home.spec.ts:6` asserts a **heading** "Take-Off Parts" but the home `<h1>` is "Find your part" and the wordmark is a **link**. A naive string rename leaves a brittle/incorrect assertion.
**How to avoid:** Reconcile the assertion to the real DOM (assert the header **link** name, or the real `<h1>`). Role/name selector failures are an a11y signal first (cross-cutting gate).
**Warning signs:** Spec passes/fails for the wrong reason; the assertion doesn't match any single element after rename.

### Pitfall 5: Forgetting `package-lock.json` after renaming `package.json` name
**What goes wrong:** `package.json:2` renamed but `package-lock.json:2,8` still say `take-off-parts`; lockfile drift / CI noise.
**How to avoid:** Run `npm install` (no new deps) to regenerate the lock's `name` fields in the same commit.

### Pitfall 6: Out-of-gamut oklch or unverified contrast after a "nicer color" tweak
**What goes wrong:** A mockup-review nudge pushes a neon out of sRGB gamut (browser clamps unpredictably → CR changes) or below the AA floor.
**How to avoid:** Re-run the contrast/gamut script (§Validation Gates) after any palette edit; the floors are the gate, not the eyeball.

## Validation Gates

> `.planning/config.json` has no `workflow.nyquist_validation` flag (→ falsy), so the formal Nyquist Validation Architecture template is omitted. But this phase **warrants automated gates** (the cross-cutting Token Discipline + Same-Commit-Test gates from ROADMAP.md), specified here for the planner. Test stack: **Vitest** (`vitest run`) for unit/integration + **Playwright** (`playwright test`) for e2e; configs already exist (`package.json` scripts `test`, `test:e2e`).

### Gate 1 — Token discipline (no hardcoded hex outside globals.css)
Cross-cutting gate from ROADMAP.md line 109. Scope to surfaces this phase touches:
```bash
# zero hits expected at phase end (globals.css is the only place hex may live)
rg "#[0-9a-fA-F]{3,8}\b" app components --glob '!app/globals.css'
```
Note: lucide/SVG `currentColor` and oklch tokens won't match; this catches stray `#rrggbb`.

### Gate 2 — Brand-string sweep (scoped to exclude Phase-15-deferred lib/ emails)
```bash
# zero PRODUCT-COPY hits expected at phase end
rg -i "take-off parts|takeoff parts|create next app" app components README.md package.json e2e
# lib/ is intentionally EXCLUDED (email senders deferred to Phase 15 — Staging evidence required)
```

### Gate 3 — Contrast & gamut (the AA proof for the palette)
A small Node script (no deps) computing OKLCH→sRGB→WCAG CR (the exact method used to produce §Palette). Assert: red-text ≥ 4.5 on base AND on card; cyan-text ≥ 4.5; decorative neons ≥ 3.0; foreground ≥ 4.5; all in-gamut. Run after any palette edit. (Reference implementation produced this research's numbers; planner can vendor it as `scripts/check-contrast.mjs`.)

### Gate 4 — Zero layout shift on headings (success criterion #4)
`adjustFontFallback` (default true) is the mechanism; verify with a Playwright assertion or a manual Lighthouse/CLS check on `/` after fonts land. Cheapest automated proxy: a Playwright spec asserting the `<h1>` bounding box is stable across font-swap (or just rely on `adjustFontFallback` + a Lighthouse CLS=0 spot-check noted in plan UAT).

### Gate 5 — Full e2e green with brand assertions updated atomically
```bash
npm run test:e2e   # brand-string assertions (Gate 2 files 12–14) updated in the SAME commits as the wordmark
npm run test       # vitest — PII/RLS/EXIF invariant tests must stay untouched & green (behavior-freeze)
```

### Wave 0 gaps
- `scripts/check-contrast.mjs` — vendor the contrast/gamut checker (Gate 3). *(new)*
- `scripts/gen-icons.mjs` — sharp + png-to-ico icon/OG generation (Gate-adjacent; blocked on logo asset). *(new)*
- Reconcile `e2e/home.spec.ts` heading/link assertion (Pitfall 4) — edit, not new file.
- No test-framework install needed (Vitest + Playwright already configured).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` `theme.extend` | CSS-first `@theme` in `globals.css` | Tailwind v4 | All tokens live in CSS; no JS config |
| `tailwindcss-textshadow` plugin | native `text-shadow-*` + `--text-shadow-*` namespace | Tailwind v4.1 | repo on 4.3 → available, no plugin |
| `themeColor`/`viewport` in `metadata` | dedicated `viewport` export | Next 13.x+ | `colorScheme`/`themeColor` go in `viewport`, not `metadata` |
| `<head>` manual favicon/OG tags | `app/` file conventions (`icon.png`, `opengraph-image.png`, `manifest.ts`) | Next 13+ | Next auto-generates tags |
| `next-themes` for dark | forced dark via `:root` + `color-scheme` | n/a (project decision) | Remove dependency; no FOUC script |

**Deprecated/outdated for this repo:**
- `@supabase/auth-helpers-nextjs` (per CLAUDE.md — not relevant here but do not introduce).
- The `.dark` block + `@custom-variant dark` — dead today, deleted this phase.

## Open Questions

1. **`metadataBase` URL value**
   - What we know: required for relative OG image → absolute; per-environment string.
   - What's unclear: staging domain vs prod vs `https://og-truck-parts.vercel.app` (infra rename is deferred, but the *URL value* is just a string, not a rename).
   - Recommendation: use the current Vercel/staging domain now; it's trivially swappable later and does not touch the deferred infra rename.

2. **Keep `dark` class on `<html>` or drop it entirely?**
   - What we know: deleting `.dark` block makes `dark:` variants inert; keeping the class is harmless belt-and-suspenders.
   - Recommendation: drop both the class and `dark:` usages for cleanliness (no dead code, per CONTEXT "no dead light code"); but acceptable to keep the class if any owned shadcn primitive still relies on `dark:` until Phase 12 restyles them. Planner decides per actual `dark:` grep in `components/ui/`.

3. **Inter vs keep Geist for body**
   - What we know: both work; Inter pairs better with Barlow Condensed and breaks from scaffold identity; keeping Geist shrinks the diff.
   - Recommendation: Inter (cleaner brand break), but low-stakes — defer to mockup-fidelity preference.

4. **Tilt Neon accent font**
   - What we know: STATE.md defers this to hi-fi mockup review during Phase 11 planning.
   - Recommendation: do NOT load a third font unless a signage hero in the mockups demands neon-tube lettering; Barlow Condensed + `text-shadow` glow reproduces highway-sign character without it.

5. **Logo asset delivery (BLOCKER)**
   - What we know: stakeholder package not yet delivered (STATE.md); mockups exist.
   - Recommendation: sequence the logo-dependent work (icons, OG, header image) as a final wave with an asset contingency; the token/font/metadata-text/rename waves are unblocked and can land first.

## Sources

### Primary (HIGH confidence)
- **Repo inspection (read directly):** `app/globals.css` (lines 1–131 — `@theme inline`, light `:root` 51–84, `.dark` 86–118, the `--font-sans` self-reference at line 10), `app/layout.tsx` (Geist via next/font, `"Create Next App"` metadata 16–17), `app/(app)/layout.tsx:53`, `components/layout/site-header.tsx:33`, `components/account/suspended-screen.tsx:34-35`, `app/(public)/page.tsx:119` (`<h1>Find your part</h1>`), `e2e/home.spec.ts:6`, `e2e/auth.spec.ts:125,131`, `package.json` (next 16.2.6, react 19.2.4, sharp 0.34.5, next-themes 0.4.6, scripts), resolved `tailwindcss` 4.3.0, `.gitignore:55` (`private/`).
- **Computed contrast table:** OKLCH→linear-sRGB (Ottosson matrices)→WCAG relative luminance→contrast ratio + gamut check (script run this session; all §Palette CRs are computed, not estimated).
- **Context7 `/vercel/next.js`** — Metadata API (`title.template`, `metadataBase`, `openGraph`, `app/manifest.ts`, `generateImageMetadata`), `viewport` export migration for `themeColor`/`colorScheme`.
- **nextjs.org `/docs/app/api-reference/components/font`** (docs v16.2.9) — `adjustFontFallback` default `true` (google), `display` default `swap`, `@theme inline` Tailwind v4 integration, CSS-variable multi-font pattern.

### Secondary (MEDIUM confidence)
- Existing project research `.planning/research/STACK.md` (Barlow Condensed/Tilt Neon assessment, glow technique table, dark-only strategy, asset pipeline, sharp/png-to-ico, next-themes removal) and `ARCHITECTURE.md` (surface inventory, rename map, central-swap leverage) — itself repo-grounded; cross-checked against live files this session.
- Neon glow construction (animate pseudo-element opacity, drop-shadow for non-rect) — codersblock.com + Zell Liew, multiple sources agree.

### Tertiary (LOW confidence)
- Exact aesthetic font/flicker-surface choices pending hi-fi mockup-fidelity review (STATE.md flag) — flagged in Open Questions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from package.json + resolved lockfile; Next/font/Tailwind APIs verified against current docs.
- Palette/contrast: HIGH — values computed, not estimated; in-gamut verified; dual-token necessity empirically proven.
- Architecture (central-swap, rename map): HIGH — every file:line read directly this session.
- Glow mechanics / fonts aesthetic: MEDIUM — technique HIGH, specific magnitudes/family are tunable design choices pending mockup review.
- Pitfalls: HIGH — derived from observed live-repo state (the font bug, scaffold metadata, the heading/link e2e mismatch are all real, confirmed).

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable stack; Next 16 / Tailwind 4 APIs not fast-moving). Re-verify only if Next or Tailwind majors bump.
