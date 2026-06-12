# Stack Research — v1.1 OG Rebrand & UI Redesign

**Domain:** App-wide neon truck-stop visual identity on an existing Next.js 16 + Tailwind v4 + shadcn/ui app
**Researched:** 2026-06-12
**Confidence:** HIGH (core techniques verified against Tailwind v4 official docs via Context7; fonts verified on Google Fonts)

> **Milestone scope:** This file covers ONLY what the v1.1 rebrand needs. The v1.0 application stack (Next.js 16.2.x, React 19, Supabase, Tailwind v4, shadcn/ui, RHF+Zod, Vercel) is shipped, validated, and unchanged — see `.planning/PROJECT.md` Key Decisions and `MILESTONES.md` for the v1.0 record. The headline finding: **this redesign needs almost zero new dependencies.** It is a token + font + asset exercise on top of what's already installed.

---

## Executive Answer (the five questions)

1. **Theme tokens:** Redefine the existing shadcn semantic CSS variables (`--background`, `--primary`, `--card`, …) in `:root` of `globals.css` with the dark neon palette in **oklch**, and add brand-scale tokens (`--color-neon-red-*`, `--color-neon-cyan-*`, `--color-navy-*`) plus custom glow shadows (`--shadow-neon-*`, `--text-shadow-neon-*`) in `@theme`. No new tooling.
2. **Fonts:** **Barlow Condensed** (Bold/Black Italic) as the display face via `next/font/google` — it's literally derived from California highway/roadside signage, has true italics in 9 weights, OFL-licensed, self-hosted by next/font. Optionally **Tilt Neon** as a sparing accent for literal neon-sign moments. Body stays **Geist Sans** (already wired).
3. **Glow effects:** CSS-only. Tailwind **v4.1+ native `text-shadow-*` utilities** + custom `--shadow-*` / `--text-shadow-*` theme tokens for box/text glows; `drop-shadow` filter only for the non-rectangular logo. Animate **opacity of a pre-shadowed pseudo-element**, never the shadow values themselves. No glow library.
4. **Logo assets:** Keep the stakeholder PNG as the rendered logo via `next/image` (neon glows don't vectorize cleanly); request the vector source if one exists. Regenerate `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`, and a static `app/opengraph-image.png` (1200×630) using Next's metadata file conventions — a one-off `sharp` script (already a dependency) covers the resizes.
5. **Dark-only:** Force dark. Collapse the neon dark palette into `:root` (delete the light values and the `.dark` override block), set `color-scheme: dark`, hardcode Sonner's `theme="dark"`, and drop the unused `next-themes` dependency. No ThemeProvider, no toggle.

---

## Recommended Stack

### Core Technologies (existing — version notes only)

| Technology | Version | Purpose | Why It Matters for v1.1 |
|------------|---------|---------|--------------------------|
| **Tailwind CSS** | `^4` installed — **verify lockfile resolves ≥ 4.1** (current line 4.2.x) | All theming + glow utilities | Native `text-shadow-*` utilities (with color + `/opacity` modifiers) landed in **v4.1**. The repo pins `^4`, so the resolved version almost certainly qualifies — confirm `package-lock.json` before relying on `text-shadow-*`. **HIGH** |
| **shadcn/ui components** | already CLI-installed (owned in `components/ui/`) | Component restyle surface | shadcn theming is 100% CSS-variable driven. Changing the semantic vars restyles every installed component (Button, Card, Dialog, Sheet…) without touching their TSX. Only per-component edits needed are decorative (neon borders/glows via `cn()` class additions). **HIGH** |
| **next/font** (`next/font/google`) | bundled with Next 16 | Display font loading | Self-hosts Google Fonts at build time: zero external requests, zero CLS (`adjustFontFallback`), exposes a CSS variable that plugs straight into `@theme`. Same pattern already used for Geist. **HIGH** |
| **sharp** | `0.34.5` (already installed for EXIF strip) | One-off icon/OG asset generation script | Resize the stakeholder PNG into 32/180/512px icons and a 1200×630 OG canvas. No new dependency. **HIGH** |
| **tw-animate-css** | `^1.4.0` (already installed) | Keyframe utilities for any flicker/pulse animation | Pair with custom `--animate-*` theme tokens for a neon "buzz/flicker" if mockups call for it. **HIGH** |

### New Additions

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Barlow Condensed** (via `next/font/google`) | n/a (font, OFL license) | Display/heading face — condensed bold italic, roadside-signage DNA | All headings, nav labels, signage-style browse tiles. Load only the weights used (recommend `700`/`800`/`900` + matching italics) to keep payload small. **HIGH** |
| **Tilt Neon** (via `next/font/google`) | n/a (font, OFL, variable) | Optional accent face that mimics neon-tube construction | Sparingly: hero wordmark moments, "The Barnyard" header, browse-as-signage grid titles. Skip entirely if Barlow Condensed Italic + glow already matches the mockups — decide against the 4 hi-fi mockups during design-token planning. **MEDIUM** |

**That's the whole shopping list.** Everything else is configuration of what's already installed.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `scripts/generate-brand-assets.mjs` (write it, ~30 lines) | sharp-based resize of the logo PNG → `app/icon.png` (512²), `app/apple-icon.png` (180²), OG canvas (1200×630) | Run once per logo revision; commit outputs. For `favicon.ico` either use a one-off converter (e.g., RealFaviconGenerator) or add `png-to-ico` as a devDependency for the script — `.ico` is the only format sharp can't emit. |
| Browser DevTools paint profiling | Verify glow perf on listing grids | Check Layers/Paint flashing on the feed page after applying card glows — large blurred shadows on dozens of cards is the one real perf risk (see Glow section). |

---

## 1. Tailwind v4 `@theme` Token Strategy (neon palette)

The current `globals.css` already follows the shadcn v4 convention: raw values on `:root`, bridged into Tailwind via `@theme inline`. **Keep that structure** — it means zero component churn. The work is three layers:

**Layer 1 — brand scale (new, in `@theme`):** real Tailwind color tokens so utilities like `text-neon-cyan` and `border-neon-red/40` exist.

```css
@theme {
  /* Brand palette — oklch keeps perceptual lightness consistent across hues */
  --color-night-900: oklch(0.13 0.03 260);   /* page background (near-black navy) */
  --color-navy-800: oklch(0.20 0.05 260);    /* panel / card */
  --color-navy-700: oklch(0.26 0.06 260);    /* raised surface / input */
  --color-neon-red-500: oklch(0.62 0.26 25); /* primary CTA / signage red */
  --color-neon-red-400: oklch(0.70 0.24 25); /* hover / glow core */
  --color-neon-cyan-400: oklch(0.85 0.14 195); /* secondary signage / links / accents */
  --color-neon-cyan-300: oklch(0.90 0.12 195);

  /* Glow shadows — generate shadow-neon-red, shadow-neon-cyan utilities */
  --shadow-neon-red: 0 0 4px oklch(0.62 0.26 25 / 0.9), 0 0 16px oklch(0.62 0.26 25 / 0.5), 0 0 40px oklch(0.62 0.26 25 / 0.25);
  --shadow-neon-cyan: 0 0 4px oklch(0.85 0.14 195 / 0.9), 0 0 16px oklch(0.85 0.14 195 / 0.5), 0 0 40px oklch(0.85 0.14 195 / 0.25);

  /* Text glows — generate text-shadow-neon-* utilities (Tailwind ≥ 4.1) */
  --text-shadow-neon-red: 0 0 2px oklch(0.62 0.26 25 / 0.9), 0 0 10px oklch(0.62 0.26 25 / 0.6), 0 0 24px oklch(0.62 0.26 25 / 0.3);
  --text-shadow-neon-cyan: 0 0 2px oklch(0.85 0.14 195 / 0.9), 0 0 10px oklch(0.85 0.14 195 / 0.6), 0 0 24px oklch(0.85 0.14 195 / 0.3);
}
```
*(Exact oklch values get tuned against the mockups; the structure is the decision.)*

**Layer 2 — semantic remap (edit existing `:root`):** point the shadcn variables at the brand scale. This is what restyles every component at once.

```css
:root {
  --background: var(--color-night-900);
  --foreground: oklch(0.96 0.01 250);
  --card: var(--color-navy-800);
  --primary: var(--color-neon-red-500);        /* red neon CTAs */
  --primary-foreground: oklch(0.98 0 0);
  --accent: var(--color-neon-cyan-400);
  --border: oklch(0.85 0.14 195 / 0.25);       /* faint cyan line = "tube off" state */
  --ring: var(--color-neon-cyan-400);
  /* ...remaining shadcn vars (popover, muted, destructive, sidebar, chart) same pattern */
}
```

**Layer 3 — composed utilities (optional, `@utility`):** for repeated multi-property looks like a signage panel, define once:

```css
@utility panel-neon {
  background-color: var(--color-navy-800);
  border: 1px solid --alpha(var(--color-neon-cyan-400) / 40%);
  box-shadow: var(--shadow-neon-cyan);
  border-radius: var(--radius-lg);
}
```

**Why oklch:** the codebase is already oklch (shadcn v4 default); oklch keeps the red and cyan at matched perceived brightness on the dark background, and lightness-only ramps (hover states) stay predictable. Don't reintroduce hex/hsl.

**Verified:** `--shadow-*`, `--drop-shadow-*` theme namespaces and `text-shadow-*` utilities (with `text-shadow-<color>` and `/opacity` modifiers) are official Tailwind v4 features — Context7 `/tailwindlabs/tailwindcss.com` (theme.mdx, text-shadow.mdx, v4.1 release post). **HIGH**

**Accessibility gate:** neon-on-navy must still pass contrast. Cyan ~`oklch(0.85 …)` on night-900 is fine; neon red at `oklch(0.62 …)` is borderline for body-size text — reserve pure neon red for large display text, buttons with white foreground, and borders; never for small body copy. Check key pairs with a contrast tool during token tuning. **MEDIUM** (values need empirical tuning).

---

## 2. Typography (retro display + readable body)

| Role | Font | Source | Why |
|------|------|--------|-----|
| **Display / headings / signage** | **Barlow Condensed** — Bold (700), ExtraBold (800), Black (900) + true Italics | `next/font/google`, OFL | The family is explicitly derived from California highway signage, bus/train plates — the exact roadside-Americana register of the mockups. It's one of the few quality Google Fonts condensed families with **real italics at every weight** (9 weights roman + italic), which the "condensed bold italic" signage look requires. Free for commercial use, self-hosted by next/font. **HIGH** |
| **Neon accent (optional)** | **Tilt Neon** (variable) | `next/font/google`, OFL | Designed by Andy Clymer to mimic neon-tube lettering construction. Use only for literal "neon sign" set pieces (browse-grid tiles, section signs). It is decorative — never for UI labels or anything under ~24px. **MEDIUM** |
| **Body / UI text** | **Geist Sans** (keep) | already loaded | Already wired into `--font-sans` and every component; highly readable on dark backgrounds; changing it buys nothing and risks app-wide regression. Zero work. **HIGH** |
| **Mono** | **Geist Mono** (keep) | already loaded | Unchanged (part numbers, admin). **HIGH** |

**Integration** (`app/layout.tsx` + `globals.css`):

```tsx
import { Barlow_Condensed } from "next/font/google";
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  style: ["normal", "italic"],
});
// add barlowCondensed.variable to the <html> className
```

```css
@theme inline {
  --font-heading: var(--font-barlow-condensed); /* replaces the current alias to --font-sans */
}
```

The codebase already uses `font-heading` in `card.tsx`, `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx` — swapping the alias propagates the display face automatically; the signage *italic* lean is then applied per-surface with `italic` / `not-italic` utilities.

**Licensing:** everything recommended is SIL Open Font License via Google Fonts — free commercial use, no attribution UI requirement, and `next/font` self-hosting means no Google Fonts CDN call (no GDPR/consent surface). **HIGH**

**Alternatives considered:** Bebas Neue / Anton / Oswald (no italics — disqualified for the brief), Bungee (signage-designed but caps-only, no italic — close second for accent role), Monoton (single-weight outline neon — too decorative, poor at small sizes), Saira Condensed (no italics on Google Fonts).

---

## 3. Neon Glow Effects — CSS-only, no library

**Decision: zero JS, zero new packages.** Tailwind v4.1+ covers all of it natively.

| Technique | Use for | Why |
|-----------|---------|-----|
| **`text-shadow-*` utilities / `--text-shadow-neon-*` tokens** | Glowing headings, signage text, nav labels | Cheapest glow there is; native in Tailwind ≥ 4.1 with color + opacity modifiers. **HIGH** |
| **`box-shadow` via `--shadow-neon-*` tokens** | Buttons, panels, card borders, input focus rings | Fast for rectangular UI; supports spread for the "tube halo" look; combine with a 1px border as the "tube" itself. **HIGH** |
| **`filter: drop-shadow()` (`drop-shadow-*`)** | The logo PNG and other non-rectangular shapes ONLY | Traces the alpha channel instead of the bounding box — the only correct glow for the logo. More expensive than box-shadow; keep it static. **HIGH** |
| **SVG filters** | Not needed | Overkill; only worthwhile for animated tube-path effects that the mockups don't show. **HIGH** |

**Performance rules (the part that actually matters at feed scale):**

1. **Never animate `box-shadow`/`text-shadow`/`filter` values.** Each frame repaints. For pulse/flicker, render the glow on a `::after` pseudo-element (or stacked element) at full strength and **animate its `opacity`** — opacity composites on the GPU. (Verified pattern: Coder's Block "Creating Glow Effects with CSS", Zell Liew neon-button writeup.) **HIGH**
2. **Budget glows on list surfaces.** Dozens of cards × 3-layer 40px-blur shadows is the one realistic jank source. On the feed/search grid, use a single-layer tight glow (or border-only "tube off" state) and reserve the full 3-layer halo for hover/focus and hero surfaces. Profile with paint flashing after Phase-1 of the redesign. **MEDIUM**
3. **Respect `prefers-reduced-motion`** for any flicker/buzz keyframes — wrap in the `motion-safe:` variant. tw-animate-css + a custom `--animate-flicker` token handles the keyframes; no animation library. **HIGH**
4. Use `will-change` only if profiling shows a problem; don't sprinkle it preemptively. **HIGH**

**What this rules out:** framer-motion/`motion` (no functional animation need), glow/particle libraries, canvas/WebGL backdrops. Visual-only milestone = CSS-only effects.

---

## 4. Logo & Brand Asset Pipeline

**Reality check on PNG→SVG:** the stakeholder logo is a neon-style PNG. Neon artwork = soft gradient glows, which **auto-tracers (vectorizer.ai, Inkscape trace, vtracer) reproduce badly** — they posterize the glow into banded blobs. **MEDIUM** confidence on tool specifics, **HIGH** on the recommendation:

1. **Ask the stakeholder for the original vector/layered source** (AI/Figma/PSD). If it exists, export a clean SVG of the tube linework and let CSS `drop-shadow` provide the glow (crisp at every size, tiny file).
2. **If no source exists: ship the PNG.** Render through `next/image` with explicit `width`/`height` (no CLS) and provide a 2x-resolution export for the header. A PNG logo is not a launch blocker; vector recreation is a nice-to-have a designer can do later.
3. Do NOT add an SVG-tracing build step or runtime dependency.

**Icons / favicon / OG via Next.js metadata file conventions** (no `<head>` hand-wiring — Next generates the tags):

| File | Size | Notes |
|------|------|-------|
| `app/favicon.ico` | 32² (multi-size ok) | Replace the create-next-app default. Generate once from the logo mark. |
| `app/icon.png` | 512² | Served as `<link rel="icon">`; browsers scale down. Transparent or night-900 background. |
| `app/apple-icon.png` | 180² | iOS home screen; needs an opaque background (use night-900) — iOS fills transparency with black-on-white unpredictably. |
| `app/opengraph-image.png` (+ `opengraph-image.alt.txt`) | 1200×630 | Static brand card: logo over night background. Sufficient for v1.1; dynamic per-listing OG images via `next/og` `ImageResponse` is a later enhancement, not this milestone. |
| `app/twitter-image.png` | 1200×630 | Optional; falls back to OG image if omitted. |

Generation: one `sharp` script (dependency already present). Only `.ico` needs an extra step (`png-to-ico` devDependency or a one-off online generator). Also update `metadata` in `app/layout.tsx` — it still says **"Create Next App"**; the rebrand must set `title.template` (e.g., `"%s | OG Truck Parts"`), `description`, `openGraph`, and `metadataBase`. **HIGH**

---

## 5. Dark-Only Theming Decision

**Recommendation: forced dark, light mode deleted.** Rationale: the brand IS the dark night background — a light variant of a neon truck-stop identity is a contradiction, doubles every token decision, and doubles visual QA. The current app effectively runs light-only today (no ThemeProvider mounts, `.dark` is never applied), so nobody loses a preference.

Implementation (all subtraction, no additions):

1. **`globals.css`:** write the neon dark values directly into `:root`; **delete the `.dark` block** (or leave it empty-aliased — deleting is cleaner). The `@custom-variant dark` line can stay harmlessly or go.
2. **`color-scheme`:** add `color-scheme: dark` on `:root` (or `<html className="dark" style>`) so native form controls, scrollbars, and the UA default canvas render dark. Belt-and-suspenders: keep `className="dark"` on `<html>` so any `dark:` utility in owned shadcn components still activates. **HIGH**
3. **Sonner:** `components/ui/sonner.tsx` is the only `next-themes` consumer — replace `useTheme()` with a hardcoded `theme="dark"` prop.
4. **Remove `next-themes`** from `package.json` (currently dead weight once sonner is edited). One less dependency, no FOUC script, no hydration concern.
5. **Email templates** (Resend/Supabase auth emails): rebrand the copy/name, but keep emails light-background and simple — dark-mode email rendering is a swamp (Gmail/Outlook color inversion) and out of scope for a web UI milestone. **MEDIUM**

**What NOT to build:** a theme toggle, `prefers-color-scheme` media handling, or a ThemeProvider. If the stakeholder ever wants light mode back, the shadcn variable architecture makes it a re-add, not a rewrite.

---

## Installation

```bash
# No required runtime packages. Optional, only for the favicon script:
npm install -D png-to-ico
# (then remove the dead dependency after editing sonner.tsx)
npm uninstall next-themes
```

```tsx
// app/layout.tsx — font addition (next/font/google, no package install)
import { Barlow_Condensed } from "next/font/google"; // + optionally Tilt_Neon
```

Pre-flight check: confirm the lockfile resolves `tailwindcss` ≥ 4.1 (for `text-shadow-*`):

```bash
npm ls tailwindcss
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Barlow Condensed (display) | Bungee / Bungee Shade | If mockup lettering is caps-only chromatic signage rather than italic condensed; Bungee was designed for signage but has no italics or lowercase. |
| Tilt Neon (accent, optional) | Monoton / Neonderthaw | Monoton if a single retro-glam outline headline is wanted; Neonderthaw for neon *script*. Both are single-style and weaker at UI sizes. |
| Keep Geist body | Barlow (regular widths) as body | If the stakeholder wants display+body from one family for a warmer match; costs a full-app readability re-QA — only do it if mockups demand it. |
| CSS-only glows | `motion`/framer-motion for animated neon | Only if a later milestone needs orchestrated entrance animations; never needed for static glow. |
| Static `app/opengraph-image.png` | Dynamic `next/og` `ImageResponse` per listing | Later SEO/sharing milestone; per-listing OG cards with photos are valuable but not "visual-only rebrand" scope. |
| PNG logo via next/image | Manual vector recreation of the logo | When a designer is available or stakeholder supplies source vectors; do it then, not now. |
| Forced dark (`:root` = dark) | next-themes `forcedTheme="dark"` | Only if light mode is expected back within v1.x; keeps the dependency for no current benefit. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **A new component library / theme kit** (DaisyUI, HeroUI, "neon UI kits") | shadcn components are already owned in-repo; a second system means dual styling sources and regression risk across 33.7k LOC | Retheme shadcn via CSS variables + targeted `cn()` class edits |
| **CSS-in-JS** (styled-components, Emotion) | Runtime cost, RSC friction, parallel styling system | Tailwind v4 `@theme` / `@utility` |
| **Tailwind text-shadow plugins** (e.g., `tailwindcss-textshadow`) | Obsolete — native in Tailwind ≥ 4.1 | Built-in `text-shadow-*` + `--text-shadow-*` tokens |
| **Animating `box-shadow`/`filter` values** for pulse/flicker | Per-frame repaints; janks the feed on mid-range phones | Pre-rendered glow on a pseudo-element, animate `opacity` |
| **Full 3-layer glows on every feed card** | Dozens of large blurred shadows = measurable paint cost on list pages | Border + tight single shadow at rest; full halo on hover/focus/hero only |
| **Auto PNG→SVG tracing of the neon logo** | Gradient glows posterize into banded vector blobs | Ship PNG; request vector source; CSS drop-shadow for glow |
| **Google Fonts `<link>` CDN tags** | External request, CLS, consent surface — and next/font already solves it | `next/font/google` (self-hosted, CSS variable output) |
| **Loading all 18 Barlow Condensed styles** | ~hundreds of KB of unused font payload | Subset to the 2–3 weights (+italics) the design actually uses |
| **A dark/light theme toggle** | Brand is dark-only; toggle doubles QA for zero stakeholder value | Forced dark in `:root`, `color-scheme: dark` |
| **`tailwind.config.js` re-introduction** | Project is CSS-first v4; JS config splits the source of truth | `@theme` in `globals.css` |

## Stack Patterns by Variant

**If the mockups' lettering is more "highway sign" than "neon tube":**
- Barlow Condensed Black Italic + cyan/red `text-shadow` glow alone reproduces it; skip Tilt Neon entirely.
- Because: fewer fonts = smaller payload and a tighter system.

**If feed-page paint profiling shows glow jank:**
- Demote card glows to `border` + `text-shadow` only; keep `box-shadow` halos for above-the-fold hero and interactive states.
- Because: text-shadow is the lightest glow; box-shadow cost scales with blur radius × element count.

**If the stakeholder produces vector logo source mid-milestone:**
- Swap the header `next/image` PNG for inline SVG + CSS `drop-shadow`; regenerate icons from the vector.
- Because: crisp at all densities and smaller than 2x PNG; the asset pipeline (metadata files) is unchanged.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `tailwindcss@^4` (need ≥ 4.1; current 4.2.x) | `@tailwindcss/postcss@^4`, existing shadcn components | `text-shadow-*` utilities and `--text-shadow-*` namespace require 4.1+. `--shadow-*`/`--drop-shadow-*` namespaces exist since 4.0. |
| `next@16.2.6` `next/font/google` | Barlow Condensed, Tilt Neon (any Google Font) | Variable + static fonts both supported; `style: ["normal","italic"]` + `weight` array for static subsets. |
| `next@16.2.6` metadata file conventions | `app/icon.png`, `apple-icon.png`, `opengraph-image.png`, `favicon.ico` | Stable since Next 13; unchanged in 16. |
| `sonner@^2` | hardcoded `theme="dark"` | `next-themes` is optional for sonner; removing it requires only the one edit in `components/ui/sonner.tsx`. |
| `sharp@0.34.5` | icon/OG PNG generation | Cannot emit `.ico` — pair with `png-to-ico` (dev-only) or generate the .ico once externally. |

## Sources

- `/tailwindlabs/tailwindcss.com` (Context7) — `@theme` namespaces (`--shadow-*`, `--text-shadow-*`, `--drop-shadow-*`, `--font-*`, `--animate-*`), `@utility` directive, text-shadow color/opacity modifiers, v4.1 release notes — **HIGH**
- https://fonts.google.com/specimen/Barlow+Condensed — 9 weights roman + italic, OFL; "shares qualities with California's car plates, highway signs" — **HIGH**
- https://fonts.google.com/specimen/Tilt+Neon + https://design.google/library/neon-prism-tilt-variable-font — Tilt Neon designed to mimic neon-tube lettering; variable; OFL — **HIGH**
- https://fonts.google.com/specimen/Bungee, /Monoton — alternates assessed (caps-only / single-style) — **MEDIUM**
- https://codersblock.com/blog/creating-glow-effects-with-css/ + https://medium.com/@zellwk/making-a-nice-neon-button-e4969762b461 — glow construction; animate pseudo-element opacity, not shadow values; drop-shadow for non-rect shapes — **MEDIUM (multiple sources agree)**
- Next.js docs (training-data, stable since 13; spot-consistent with Next 16 repo usage) — metadata file conventions (`icon.png`, `apple-icon.png`, `opengraph-image.png`), `next/font` self-hosting — **HIGH**
- Repo inspection — `app/globals.css` (shadcn oklch vars + `@theme inline` bridge, `--font-heading` alias), `app/layout.tsx` (Geist via next/font, default metadata still "Create Next App"), `package.json` (sharp, tw-animate-css, next-themes present; sonner.tsx sole next-themes consumer) — **HIGH**

---
*Stack research for: v1.1 OG Truck Parts rebrand — neon truck-stop visual identity on existing Next.js 16 + Tailwind v4 + shadcn stack*
*Researched: 2026-06-12*
