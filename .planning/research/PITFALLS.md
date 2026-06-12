# Pitfalls Research — v1.1 OG Rebrand & UI Redesign

**Domain:** App-wide rebrand ("Take-Off Parts" → "OG Truck Parts") + neon truck-stop dark visual identity applied to a shipped Next.js 16 + Tailwind v4 + shadcn/ui marketplace (~33.7k LOC, passing vitest + Playwright suites, strict architectural invariants)
**Researched:** 2026-06-12
**Confidence:** HIGH for codebase-grounded pitfalls (verified by direct inspection of this repo), HIGH for WCAG/performance/font claims (W3C, web.dev, Vercel docs), MEDIUM for out-of-repo rebrand surfaces (Supabase/Twilio dashboard config — verify in consoles)

---

The danger profile of this milestone is the *inverse* of v1.0. v1.0's risk was building the wrong thing; v1.1's risk is **breaking a working thing while changing how it looks**. Every pitfall below is some flavor of: a visual change that silently becomes a behavior change, an aesthetic choice that fails real users, or a rebrand that misses a surface nobody greps. The system under change has a green 43-file test suite, strict invariants (privacy table split, RLS, EXIF strip, contact-before-chat), and a stakeholder-approved 24-step UAT walkthrough — all of which are assets to protect, not obstacles.

## Critical Pitfalls

### Pitfall 1: "Visual-only" silently changes behavior

**What goes wrong:**
The redesign brief says "functionality unchanged," but the actual work items are inherently behavior-adjacent: a redesigned header with icon nav and a new sell entry point, browse-as-neon-signage for Make/Model/Category, and restyled forms. During implementation, a nav reorganization changes a route or removes a link target; a "signage grid" browse rebuild swaps the data flow or drops a query param the search page depends on; a restyled multi-step form (the verify wizard, the listing create flow with its 3–8 photo requirement and fitment pre-fill) reorders fields or merges steps, altering the Server Action submit path. Each one breaks deep links, e2e tests, or — worst case — an architectural invariant like contact-form-persists-before-chat-opens, because someone "simplified" the contact modal into a direct "Message seller" button to match the mockup.

The mockups themselves are a scope-creep vector: they contain cart, payments, and phone-display elements that are explicitly out of scope. A pixel-faithful implementation imports them by accident.

**Why it happens:**
- Visual and behavioral code live in the same components; restyling a form component *is* touching its submit wiring.
- Mockups are treated as specs. The stakeholder's mockup shows a cart icon, so a cart icon appears — now there's a dead affordance implying a feature that doesn't exist (payments are v2).
- "While I'm in here" refactors: a developer restyling the browse page decides the old query-param scheme is ugly and changes it.
- The bundled UAT fixes (freeze-notice realtime refresh) are *real* behavior changes shipping in the same milestone, blurring the "visual-only" line.

**How to avoid:**
1. **Write a behavior-freeze contract before any restyle:** inventory every route, every form's action/fields, every nav destination. The redesign may not add, remove, or rename any of these without an explicit decision logged in STATE.md. The route map and Zod schemas are the contract.
2. **Maintain a written mockup-exclusion list** (cart, payments/checkout, phone display, anything else spotted) and check each implemented surface against it. A dead cart icon is a bug, not fidelity.
3. **Treat the e2e suite as the behavior oracle:** run the full Playwright suite after each surface is restyled, not once at the end. A behavior regression caught per-surface is a one-commit fix; caught at UAT it's archaeology.
4. **Isolate the three UAT fixes (sell entry, freeze-notice refresh, vitest-* purge) in their own plans/commits**, never mixed into visual commits — so `git bisect` and review can tell skin from behavior.
5. **Invariant #5 special watch:** any redesign of the listing detail page or contact flow must keep the contact form as the primary action and chat strictly downstream of the persisted `contact_log` write. Re-run `tests/integration/messaging.contract.test.ts` and the contact e2e path after touching that surface.

**Warning signs:**
- A PR labeled "restyle X" that touches files in `lib/actions/` or changes a Zod schema.
- New icons/buttons in the header that have no v1.0 destination.
- e2e failures that aren't selector-text failures (navigation timeouts, wrong URL assertions).
- The diff for a "visual" plan includes route renames or `redirect()` changes.

**Phase to address:**
Every redesign phase; enforce via the behavior-freeze contract in the first (foundation/tokens) phase and per-surface e2e runs thereafter.

---

### Pitfall 2: Restyling by scattering hardcoded values instead of changing the token layer

**What goes wrong:**
The app's entire look is currently driven by ~30 shadcn CSS variables in `app/globals.css` (`--background`, `--primary`, `--card`, `--ring`, `--chart-1..5`, etc.) mapped through Tailwind v4's `@theme inline`. The fast-but-fatal way to do this redesign is to ignore that layer and sprinkle arbitrary values across components: `bg-[#0a0f1e]`, `text-[#ff1f3a]`, `shadow-[0_0_24px_rgba(255,31,58,0.6)]` repeated in hundreds of files. Result: three slightly different neon reds, panels that don't match across pages, an admin area that drifted from the public site, and a theme that can never be adjusted again without another app-wide sweep. The 33.7k LOC codebase makes class-by-class repainting both slow and unreviewable.

**Why it happens:**
- Matching a mockup pixel-by-pixel pulls developers toward eyedropper hex values at the point of use.
- The neon aesthetic needs *new* token categories the shadcn set lacks (glow shadows, neon border colors, sign-panel surfaces, display font), and inventing tokens feels slower than inlining values.
- Tailwind v4 makes arbitrary values frictionless, so nothing pushes back.

**How to avoid:**
1. **Phase 1 of the redesign is the token layer, not any page.** Redefine the existing shadcn variables to the OG palette (dark navy base, neon red primary, cyan accent) in `globals.css` — this alone re-skins ~80% of the app because every shadcn primitive already consumes them.
2. **Add the new brand tokens once, in `@theme`:** `--color-neon-red`, `--color-neon-cyan`, `--color-panel`, `--shadow-glow-red`, `--shadow-glow-cyan`, `--font-display`. Components use `shadow-glow-red`, never `shadow-[0_0_24px_#ff1f3a]`.
3. **Budget the diff:** if restyling a page requires editing more than its layout classes and token names, the token layer is incomplete — go back and extend it.
4. **Grep gate at phase end:** `rg "#[0-9a-fA-F]{3,8}" app components --glob '!globals.css'` should return (near) zero new hardcoded colors.

**Warning signs:**
- The same neon red appearing as three different hex/oklch values in the codebase.
- `globals.css` unchanged while component files fill with arbitrary-value classes.
- Admin pages visibly mismatching public pages after both are "done."

**Phase to address:**
First redesign phase (brand foundation / design tokens). Everything downstream depends on getting this right first.

---

### Pitfall 3: Neon-on-dark accessibility failures (contrast, halation, glow-as-focus, display fonts at small sizes)

**What goes wrong:**
Four distinct failures, all baked into the neon truck-stop aesthetic if applied naively:

1. **Contrast math fails where you don't expect it.** Saturated red on near-black is borderline: pure `#FF0000` on `#000` is ~5.25:1 (passes AA 4.5:1 for body text — barely), but darker/deeper neon reds drop below it fast, and red *glow blur* around thin strokes reduces effective legibility well below what the ratio suggests. The sneakier failure is the **CTA**: white text on a neon-red button (`#FF1F3A`-class) is ~4:1 — *fails* WCAG AA for normal-size text. Cyan on dark is the safe channel (~16:1 for `#00FFFF` on black). Red is for accents and large display text, not body copy or small button labels.
2. **Halation.** High-saturation glowing text on very dark backgrounds produces a halo/bloom effect for people with astigmatism — a large fraction of adults — making text physically uncomfortable to read. Pure black (`#000`) backgrounds maximize this; the mockups' "night" base must land on dark navy, not black.
3. **Glow is not a focus indicator.** Replacing shadcn's `focus-visible` ring with a soft neon glow fails WCAG 1.4.11 (Non-text Contrast): focus indicators need a clearly defined area with ≥3:1 contrast against adjacent colors, and a blurred shadow has no defined contrasting edge. Keyboard users of a marketplace (forms everywhere: register, verify, list, contact) lose their place.
4. **Retro display typography at small sizes.** Condensed/stylized sign fonts are illegible at 14px and below, and brutal for data: prices, part numbers, model codes ("W900L", "4900EX"), timestamps, chat text. If the display font leaks into body text, form labels, or admin tables, the app becomes hard to *use*, not just hard to read.

**Why it happens:**
- Mockups are judged on a designer's bright desktop monitor at large sizes; contrast and halation failures appear on dim screens, night use (this audience: truckers, often on phones at night — the literal use case), and for the ~1-in-3 users with astigmatism.
- "Neon = glow everywhere" applies the signature treatment uniformly instead of hierarchically.
- shadcn's default ring is easy to delete and hard to notice missing if no one tests with a keyboard.

**How to avoid:**
1. **Contrast-check the token palette before any page is built** (the token phase): every foreground/background token pair gets checked (WebAIM contrast checker / oklch tooling). Rules of thumb for this palette: body text = soft white/light gray (`#E0E0E0`-class) on dark navy; neon red = headings ≥24px, borders, accents, and large CTA text only; small/critical labels on red buttons get near-black text or the button gets large text; cyan = links/info/focus.
2. **Background base = very dark navy (e.g., oklch ~0.15–0.18, blue hue), never pure black.** Panels a step lighter than the page so elevation reads without pure-contrast jumps.
3. **Keep a solid 2px `focus-visible` ring** (cyan reads ≥3:1 on every dark surface in this palette). The neon glow may be *added on top* as decoration; it never *replaces* the ring. Do not touch the `focus-visible:` utilities in `components/ui/*` except to recolor the ring token.
4. **Display font is a heading-scale-only token.** Enforce: `--font-display` applied via heading components / `font-display` utility, never on `body`, inputs, tables, or anything under ~20px. Numbers and part codes always render in the sans/mono stack.
5. **Destructive ≠ brand red.** Neon red is becoming the *primary* CTA color while `--destructive` is also red — "Delete listing" and "Publish listing" must not look like siblings. Differentiate destructive actions (darker red fill + icon + confirm dialog wording) or shift destructive to a visibly different treatment (outline + warning icon).
6. **Manual a11y pass per phase:** keyboard-only walk of each restyled surface + axe/Lighthouse a11y audit as a phase gate.

**Warning signs:**
- Body or form-label text in saturated red or the display font.
- White small text on neon-red buttons (run the numbers — it fails).
- Tab key produces no visible focus change on a restyled surface.
- Anyone on the team saying text looks "blurry" or "vibrating" on the staging site at night.

**Phase to address:**
Token/foundation phase (palette contrast rules, focus ring, font scale policy); verified per surface phase; full keyboard + axe audit in the final QA phase.

---

### Pitfall 4: Rebrand misses — stale "Take-Off Parts" (and worse) on surfaces nobody greps

**What goes wrong:**
The rename ships in the header and homepage, demo looks rebranded, and then a suspended user receives an email reading "Your Take-Off Parts account has been suspended," a buyer's OTP arrives as "Your Take-Off Parts verification code," and a shared link unfurls with the title **"Create Next App."** Verified in this repo right now:

- `app/layout.tsx` root metadata is **still the scaffold default**: `title: "Create Next App", description: "Generated by create next app"` — the current tab title/SEO identity isn't even the *old* brand. Only 3 auth pages set their own metadata; most routes inherit the scaffold default.
- **Transactional email copy** hardcodes the old brand in 3 modules: `lib/admin/email.ts` (FROM line + 5 enforcement-ladder body strings: warn/suspend/ban/reactivate/rename), `lib/messaging/notify.ts` (FROM + contact/report notification subjects), `lib/verify/alert.ts` (OTP spend-cap alert subject).
- **Out-of-repo surfaces a grep can never find:** Supabase Auth email templates (confirm-signup, magic link, reset — configured in the Supabase dashboard, sent via Resend SMTP per the Phase-1 setup); the **Twilio Verify service friendly name** (it's interpolated into the OTP SMS text users receive — MEDIUM confidence on exact template, verify in Twilio console); Resend sender name; Vercel project name/domains; Supabase project naming.
- **In-repo long tail:** `package.json` name, `README.md`, `app/favicon.ico` (old icon), Verified Seller **terms text** (users legally accepted "Take-Off Parts" terms — new acceptances must reference the new name), error/edge pages (`auth-code-error`, `check-email`, suspended screen at `components/account/suspended-screen.tsx`), login/register pages, `site-header.tsx`.
- **OG/social images don't exist yet** — the rebrand is the moment to add `opengraph-image` assets; shipping a neon brand whose shared links render with no image (or "Create Next App") undercuts the whole exercise.

**Why it happens:**
- Rebrands are executed by visual surface area, but the brand string lives in *communication* surfaces (emails, SMS, metadata, link unfurls) that don't appear in any screen-by-screen redesign plan.
- Dashboard-configured strings (Supabase, Twilio, Resend, Vercel) are invisible to code search and belong to no file.
- Error and lifecycle paths (suspension, auth errors, expiry notices) are exactly the pages nobody opens during a happy-path UAT.

**How to avoid:**
1. **Make the sweep a dedicated plan with two checklists:** (a) repo: `rg -i "take-off|takeoff|take off parts|create next app"` across `app/ components/ lib/ e2e/ tests/ package.json README.md` must return zero product-copy hits at phase end (planning docs exempt); (b) **dashboard checklist**: Supabase Auth templates, Twilio Verify friendly name, Resend sender, Vercel project — each item checked off with a screenshot or a sent test email/SMS as evidence.
2. **Centralize the brand string now:** a `lib/brand.ts` (`BRAND_NAME = "OG Truck Parts"`, support email, tagline) imported by emails, metadata, and headers — so the *next* rename is one line.
3. **Fix root metadata properly, not just the title string:** `metadata` with `title.template` (`"%s | OG Truck Parts"`), description, and new `opengraph-image`/`icon` assets from the stakeholder logo package.
4. **Trigger every transactional sender once on Staging** (enforcement email, contact notification, report notification, OTP SMS, Supabase signup confirm) and read the actual received message — the only test that catches FROM-name and template misses.
5. **Terms text:** update the Verified Seller terms copy to the new name and confirm with the stakeholder whether existing acceptances need any note (likely fine for a Staging-only product, but decide explicitly).

**Warning signs:**
- A "rebrand complete" claim with no grep output attached.
- Any received Staging email/SMS still saying Take-Off Parts.
- Browser tab or link preview showing "Create Next App" anywhere.

**Phase to address:**
A dedicated rebrand-sweep phase (or plan) with the grep gate + dashboard checklist as its success criteria; root metadata + brand module can land in the foundation phase.

---

### Pitfall 5: Copy/markup changes break the e2e and unit suites in misleading ways

**What goes wrong:**
The Playwright suite selects by exactly the strings and roles the redesign will change. Verified in this repo: `e2e/home.spec.ts` asserts `getByRole("heading", { name: "Take-Off Parts" })`; `e2e/auth.spec.ts` asserts `getByRole("link", { name: "Take-Off Parts" })` twice (header logo link, pre/post-login); the suites lean heavily on `getByLabel("Email")`, `getByRole("button", { name: /create account/i })`, `getByText(/member since/i)` — every reworded label, retitled heading, or restructured component is a test failure. Two failure modes follow:

1. **Death by red suite:** tests are left to break en masse, the suite stays red for the whole milestone, real regressions (a broken submit, a missing route) hide inside the noise, and the team learns to ignore failures — destroying the suite's value exactly when it's most needed (see Pitfall 1: the suite is the behavior oracle).
2. **Silent semantic regressions:** the text logo becomes an `<img>`; if `alt` is empty or wrong, `getByRole("link", { name: ... })` fails — and that failure is *correct*, because screen-reader users lost the link's name too. "Fixing the test" by switching to a CSS selector papers over a real a11y regression. Same for headings demoted to styled `<div>`s for visual reasons, and form labels replaced by placeholder-only neon inputs (breaks `getByLabel` *and* accessibility).

**Why it happens:**
- Role/name selectors are intentionally coupled to the accessible UI — a redesign changes exactly that contract.
- Updating tests feels like cleanup, so it's batched "for later."
- Visual rewrites casually swap semantic elements (`h1`→`div`, `label`→placeholder) because the styled result looks identical.

**How to avoid:**
1. **Tests update in the same plan/commit as the surface they cover.** A surface's restyle plan is not done until its specs are green. The suite must be green at every phase boundary.
2. **Treat role/name selector failures as a11y signals first:** when `getByRole` breaks, ask "did this element lose its accessible name/role?" before editing the test. Logo `<img alt="OG Truck Parts">` keeps both the test pattern and screen readers working.
3. **Preserve semantics under new skin:** every page keeps a real `h1` (visually styled as neon signage is fine), every input keeps a real associated `<label>` (visually hidden if the design demands), buttons stay `<button>`.
4. **Centralize the brand string in test fixtures too** (one `BRAND` const in e2e helpers) so the name change is one edit, not a hunt.
5. **The vitest unit/integration suites (43 files) are mostly logic-level and should NOT need changes** — schema, RLS, privacy-contract, EXIF tests are skin-independent. If a redesign PR modifies `tests/integration/*.contract.test.ts`, that's a red flag for Pitfall 1, not test maintenance.

**Warning signs:**
- CI red for more than one plan's duration.
- Test diffs replacing `getByRole`/`getByLabel` with `locator(".class")` or `data-testid` to "make it pass."
- A redesign commit touching contract/RLS/privacy test files.

**Phase to address:**
Every surface phase (same-commit test updates); add the brand-const refactor to the foundation phase.

---

### Pitfall 6: Neon performance traps — glow effects, background art, and display fonts degrade the experience

**What goes wrong:**
The aesthetic's signature elements are exactly the expensive ones:

1. **Glow on repeated elements.** Search results, the feed, browse signage grids, and admin tables render dozens of cards. Static multi-layer `box-shadow` glows are paintable, but *animated* glows (hover transitions on `box-shadow`, pulsing neon, `filter: drop-shadow`/`blur` transitions) trigger full repaints every frame — per card. On mid-range Android (this audience: truckers on phones), a feed of 30 glowing, hover-animated cards scrolls at a slideshow.
2. **Backdrop blur panels.** `backdrop-filter: blur()` on headers/panels over textured backgrounds is among the most expensive compositing operations on mobile GPUs.
3. **Big background art on every page.** A night-road/truck-stop photo texture behind every route adds hundreds of KB to every navigation, competes with listing photos for bandwidth, and tanks LCP — on a marketplace, the listing photo *is* the content.
4. **Retro display font CLS.** A new decorative font loaded carelessly (e.g., a `<link>` to Google Fonts, or `next/font` without thought) swaps in late with very different metrics from the fallback, shifting every signage headline. The current app uses `next/font` (Geist) correctly; the new display font must go through the same pipeline.
5. **iOS quirk:** `background-attachment: fixed` for the "fixed night sky" effect is broken/disabled on iOS Safari — half the mobile audience.

**Why it happens:**
- Mockups are static; nobody sees paint cost in Figma.
- Glow reads as "just CSS," so it's not budgeted like images or JS.
- Desktop dev machines hide all of it until a real phone touches Staging.

**How to avoid:**
1. **Glow budget: static shadows yes, animated shadows no.** Hover/pulse effects animate the `opacity` of a pre-painted glow pseudo-element (`::after` with the shadow, `transition: opacity`) — compositor-only, GPU-cheap. Encode this as the `shadow-glow-*` token pattern from Pitfall 2 so the cheap version is the default.
2. **Backgrounds are CSS, not photos:** dark navy base + gradients + a tiny tiling noise texture (<10KB) deliver the night-sky feel at near-zero cost. If a hero photo is used, it's homepage-only, `next/image` with `priority`, properly sized.
3. **All fonts through `next/font`** (Google or local) so they're self-hosted with `size-adjust`-matched fallbacks (automatic CLS prevention). Limit to one display family + existing Geist; subset to latin.
4. **`backdrop-filter` only on the sticky header, if at all;** panels use solid/semi-transparent token surfaces.
5. **Phase-gate with Lighthouse on a throttled mobile profile:** record v1.0 baseline scores for home, search results, and listing detail *before* the redesign starts; no restyled page may regress LCP/CLS/INP materially. Scroll the search results page on a real mid-range phone once per phase.

**Warning signs:**
- `transition: box-shadow` or `transition: all` on card components.
- A multi-hundred-KB background asset in `public/`.
- Headline text visibly jumping on first load (font swap shift).
- Staging feels smooth on desktop, janky scrolling on a phone.

**Phase to address:**
Token/foundation phase (glow pattern, font pipeline, background strategy decided once); Lighthouse baseline before phase 1, re-checked per surface phase, full pass in final QA.

---

### Pitfall 7: Dark-only theme half-applied — native UI, autofill, and user photos betray the skin

**What goes wrong:**
The app today is **light-first**: `:root` holds light shadcn tokens, a `.dark` variant exists in `globals.css` but no `dark` class is applied in `app/layout.tsx`. Going dark-only by just repainting component backgrounds leaves the browser's native layer light: white scrollbars on dark panels (Windows especially), light-styled `<select>` dropdown panels, white date/number input chrome, the autofill yellow/white flash on the login form, a white `theme-color` strip in mobile browser chrome, and a blinding white flash on load before CSS applies. Separately, **user content fights the theme**: listing photos are often parts shot against white garage walls or light backgrounds — on a near-black page they glare like headlights and make the feed look patchy; admin charts currently use a grayscale `--chart-1..5` palette that turns invisible on navy.

**Why it happens:**
- `color-scheme` is a separate, easily-forgotten declaration — repainting tokens doesn't touch native widgets.
- Autofill styling is a notorious WebKit special case (`:-webkit-autofill` needs the inset box-shadow override).
- Nobody tests with autofilled credentials, native selects, or light-background photos until real use.

**How to avoid:**
1. **Go dark at the root, the simple way:** since v1.1 is dark-only (no toggle), redefine the `:root` token values as the dark palette directly — don't bolt a `.dark` class onto `<html>` and maintain two palettes for a product with one theme. Keep the existing `@custom-variant dark` plumbing intact for a possible future light mode, but make `:root` the source of truth.
2. **Declare `color-scheme: dark` on `:root` in CSS *and* `<meta name="color-scheme" content="dark">` in the root layout** (the meta applies before stylesheets load, killing the white flash) — this flips scrollbars, form-control chrome, and UA defaults to dark. Add `<meta name="theme-color">` with the navy base for mobile browser chrome.
3. **Autofill override:** style `input:-webkit-autofill` with an inset `box-shadow` of the input background token + correct `-webkit-text-fill-color` — test by actually logging in with saved credentials.
4. **Frame user photos:** listing cards render images in a consistent neutral well (slightly-lighter panel token, small padding/rounded frame) so light-background photos read as framed content, not glare. Never apply darkening filters to listing photos — accurate part appearance is a marketplace trust requirement.
5. **Recalibrate `--chart-1..5`** for the navy base in the token phase (cyan/red/amber/violet family with verified contrast) — the analytics dashboard is unreadable otherwise.
6. **Audit non-shadcn native elements:** any raw `<select>`, date input, file-upload control, and the Sonner toaster (set its `theme="dark"`) across the app.

**Warning signs:**
- White scrollbar track inside a dark scrollable panel (check Windows, not just macOS).
- Login form turning white/yellow when the browser autofills.
- White flash on first paint or white strip in Android Chrome's UI.
- Feed looks like a checkerboard of glowing white photo rectangles.

**Phase to address:**
Token/foundation phase (`:root` flip, `color-scheme`, meta tags, autofill, toaster, chart palette); photo-framing pattern in the listing/feed surface phase; native-widget audit in final QA.

---

### Pitfall 8: Novelty aesthetic applied uniformly — admin screens and mobile reality suffer

**What goes wrong:**
Two related judgment failures:

1. **Neon on data-dense admin.** The admin area is tables, queues, and charts: enforcement ladder, grouped report queue, message monitoring, fitment CRUD, CSV import, analytics. Applying the full signage treatment — display fonts in table headers, glow borders on every row, red/cyan everywhere — turns scanning 50 reports into reading a casino floor. Moderation work needs row-level scannability, clear status colors (which now collide with brand red = primary), and zero decoration competing with data.
2. **Mockup-fidelity vs responsive reality.** The stakeholder mockups are desktop compositions; the milestone explicitly requires equal mobile/desktop care. Neon sign grids designed as fixed desktop tiles break on a 360px phone: long taxonomy names ("Western Star 4900EX", "Freightliner Cascadia") overflow or truncate inside sign-shaped containers, decorative borders eat content width, glow spacing collapses, and tap targets shrink below 44px. Implementing the desktop mockup first and "adapting down" later produces a cramped mobile port of a desktop poster — for an audience that is substantially phone-in-truck-cab.

**Why it happens:**
- A single visual language feels like consistency; nobody mocks up the report queue, so it gets the homepage's treatment by default.
- Mockups carry authority; deviation feels like disobedience even where the mockup never considered the context (admin, mobile, 50-row tables).

**How to avoid:**
1. **Define two intensity tiers in the token phase:** *Signage* (homepage, browse grids, headers, marketing-ish surfaces: display font, glows, neon borders) and *Workbench* (admin, forms, chat, tables: same dark navy palette and accents, but sans-serif data text, minimal glow, neon reserved for primary actions and status). Admin gets the Workbench tier — it still looks like OG Truck Parts, it just respects the work.
2. **Status colors get their own tokens** (success/warn/danger/info) distinct from brand red/cyan so a "banned" badge and a primary button never read the same.
3. **Build signage grids mobile-first:** the neon sign tile is a fluid component tested at 360px with the longest real taxonomy strings from the seeded fitment data before the desktop layout is polished. Tap targets ≥44px including the decorative border.
4. **Get stakeholder sign-off on the two-tier approach early** (one screenshot pair: neon homepage + quiet admin) instead of discovering disagreement at UAT.

**Warning signs:**
- Display font appearing inside a `<table>` or form label.
- Admin status badges indistinguishable from CTAs.
- Horizontal scrolling or two-line-truncated model names on a phone-width browse grid.
- Any plan that says "desktop first, mobile adjustments later."

**Phase to address:**
Token phase (two tiers + status tokens); admin surface phase uses Workbench tier; mobile checks per surface phase, not deferred.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded hex/arbitrary classes instead of tokens | Matches mockup fast | Unmaintainable, inconsistent palette across 33.7k LOC; next theme change = full re-sweep | Never — token layer first (Pitfall 2) |
| Find-replace "Take-Off Parts" in UI files only | Demo looks rebranded | Old brand persists in emails, SMS, metadata, dashboards | Never — full sweep + dashboard checklist (Pitfall 4) |
| Fix broken e2e selectors with `data-testid`/CSS locators | Suite green quickly | Hides accessible-name regressions; tests stop testing what users perceive | Only for elements with genuinely no accessible role; document why |
| Keep `.dark` class machinery + duplicate palettes for dark-only product | "Future-proof" | Two palettes to keep in sync for one theme | Acceptable to keep the variant *plumbing*; not acceptable to maintain duplicate values |
| Restyle shadcn primitives by rewriting their DOM structure | Pixel-perfect freedom | Breaks Radix focus traps, aria wiring, every consumer (dialogs, selects, OTP input) | Never — recolor via tokens/classes; structure changes need per-primitive regression testing |
| Skip Lighthouse baseline before starting | Start visuals sooner | No way to prove the redesign didn't regress perf | Never — baseline is one hour |
| Desktop-mockup-first, mobile "later" | Faster stakeholder demo | Cramped mobile port for a phone-heavy audience | Never for this milestone (equal-care is a stated requirement) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Auth emails | Assuming repo grep covers all email copy | Templates live in Supabase dashboard (Resend SMTP) — update there, send a real test signup |
| Twilio Verify | Forgetting the OTP SMS carries the service friendly name | Rename the Verify service in Twilio console; trigger one OTP and read the SMS (MEDIUM confidence on template wording — verify) |
| Resend | Updating email bodies but not the FROM display name | `lib/admin/email.ts`, `lib/messaging/notify.ts`, `lib/verify/alert.ts` all hardcode `"Take-Off Parts <onboarding@resend.dev>"` — centralize via `lib/brand.ts` |
| Next.js Metadata API | Replacing one title string | Root `layout.tsx` is still `"Create Next App"`; use `title.template`, description, `opengraph-image`, icons from the new asset pack |
| next/font | Adding the retro display font via `<link>` or raw `@font-face` | Load through `next/font` (google or local) for self-hosting + automatic size-adjust fallback (CLS-free) |
| Tailwind v4 `@theme` | Defining new brand colors in a JS config or per-component | All tokens in `globals.css` `@theme` / `:root` vars — v4 is CSS-first; the shadcn vars are the re-skin lever |
| shadcn/ui (owned components) | Treating `components/ui/*` as a vendor lib to swap | They're owned code consumed app-wide; recolor via tokens, keep `focus-visible` rings and Radix structure intact |
| Sonner toasts | Toasts staying light on the dark app | Set toaster `theme="dark"` / token-based styles in `components/ui/sonner.tsx` |
| Vercel/Supabase projects | Old project names/domains confusing later envs | Rename at the dashboard level during the sweep; note production-domain rebrand as a pre-launch item |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Animating `box-shadow`/`filter` glows on cards | Janky scroll on mobile, high paint times in DevTools | Pre-painted glow on `::after`, transition `opacity` only; encode as the token pattern | Immediately on mid-range phones with 20+ cards |
| Photo background textures on every route | LCP regression, bandwidth competing with listing photos | CSS gradients + tiny tiling noise; photo hero homepage-only via `next/image` | Every page load on cellular |
| `backdrop-filter: blur` on large panels | Scroll/composite jank on mobile GPUs | Solid/semi-transparent token surfaces; blur only on sticky header if needed | Mobile, especially over animated/textured content |
| Display font without next/font pipeline | Headline CLS on every load; FOUT | `next/font` with `display: swap` + auto fallback metrics; subset latin | First paint, every page, every user |
| `background-attachment: fixed` night-sky effect | Background broken/detached on iOS Safari | Fixed-position decorative layer or accept scrolling background | All iOS users |
| Glow + border + shadow stacked per row in admin tables | Slow admin pages with 100+ rows | Workbench tier: flat rows, glow reserved for interactive emphasis | Report queue / analytics at real moderation volume |

## Security Mistakes

Visual-only milestone, but the invariants can still be nicked while moving code around:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Restructuring a Server Component surface and widening the data passed to new client components | PII crossing the RSC boundary (v1.0 Pitfall 5 redux) | Redesign keeps existing data-fetch shapes; re-run `privacy.contract` + `public-profile.contract` tests each phase |
| "Simplifying" the contact modal to open chat directly | Breaks invariant #5 (contact persists + admin copy before chat) | Behavior-freeze contract; messaging contract tests green per phase |
| New OG/social images generated from live pages with user data | User content/PII in cached social previews | Static brand OG images only in v1.1 |
| Loading the display font from a third-party CDN `<link>` | New external request on every page (privacy + perf) | `next/font` self-hosting only |
| New public assets (logo pack) dumped with original files | Stakeholder source files may carry metadata | Export clean web assets; only optimized SVG/PNG/ICO in `public/` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Saturated red body text / thin display font at small sizes | Eye strain, halation for astigmatic users, illegible part numbers | Soft-white body text; red for large display + accents; data in sans/mono |
| Glow replaces focus ring | Keyboard users lose their place in forms (register, verify, list, contact) | Solid 2px ring kept; glow as decoration only |
| Brand red = destructive red | "Publish" and "Delete" look like siblings; misclicks on enforcement actions | Distinct destructive treatment + status token set |
| Dead mockup affordances (cart icon) | Users expect checkout that doesn't exist; trust hit | Mockup-exclusion list enforced per surface |
| White-background listing photos glaring on dark feed | Patchy, amateur-looking feed; photo content is the product | Neutral photo wells/frames on cards; no filters on photos |
| Desktop-poster signage cramped on phones | Primary audience (phone in truck cab, at night) gets the worst version | Mobile-first signage components, real taxonomy strings, ≥44px targets |
| Full neon treatment on admin queues | Moderation gets slower and error-prone | Workbench tier for admin |
| Spanish or placeholder copy sneaking in during rewording | Violates the English-only UI rule | English-copy check in each surface's review (existing rule, new copy = new risk) |

## "Looks Done But Isn't" Checklist

- [ ] **Rebrand:** UI shows OG Truck Parts — but run the repo grep (`take-off|takeoff|create next app`) AND trigger real emails/SMS from Staging (enforcement email, contact notification, OTP SMS, Supabase signup confirm) and read them.
- [ ] **Metadata:** Tab title fixed on home — but check every route group inherits the new `title.template`, link unfurls show the OG image, favicon updated in `app/favicon.ico` and any manifest/icons.
- [ ] **Dark theme:** Pages look dark — but check Windows scrollbars, native select dropdowns, date inputs, autofilled login fields, mobile browser `theme-color` strip, and first-paint flash.
- [ ] **Focus:** Buttons look great — but Tab through register → verify wizard → listing create → contact form with a keyboard and confirm a visible ring on every stop.
- [ ] **Contrast:** Palette looks "on brand" — but every token pair has a recorded ratio; white-on-neon-red small text is the known trap (≈4:1, fails AA).
- [ ] **Tests:** Suite green — but confirm no role/name selector was downgraded to a CSS locator to pass, and no contract/RLS/privacy test file was modified by a "visual" commit.
- [ ] **Behavior freeze:** All surfaces restyled — but diff the route map and form schemas against the pre-milestone inventory; re-run the 24-step UAT walkthrough.
- [ ] **Performance:** Desktop feels fine — but compare Lighthouse mobile against the pre-redesign baseline for home/search/listing, and scroll the feed on a real phone.
- [ ] **Mobile:** Desktop matches mockups — but check signage grids at 360px with the longest seeded taxonomy names and 44px tap targets.
- [ ] **Admin:** Public pages branded — but verify admin got the Workbench tier (scannable tables, distinct status colors, readable charts on navy).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Behavior change shipped inside a visual commit | MEDIUM | `git bisect` against the e2e suite; revert the behavioral hunk; re-run messaging/privacy contract tests |
| Hardcoded-value sprawl discovered mid-milestone | MEDIUM | Stop, extract tokens, codemod arbitrary values → token classes before more surfaces are built |
| Stale brand found post-"completion" | LOW | Re-run grep + dashboard checklist; the `lib/brand.ts` refactor makes repo fixes one-line |
| Contrast/focus failures found at UAT | LOW–MEDIUM | Token-level fixes propagate app-wide (the payoff of Pitfall 2 done right); re-run axe |
| Suite left red for weeks | MEDIUM | Freeze new surfaces; dedicate a plan to restoring green with role/name selectors intact before continuing |
| Mobile jank from animated glows | LOW | Swap to the pseudo-element opacity pattern at the token/utility level — no per-component rework if tokens were used |
| Admin unusable under full neon | LOW–MEDIUM | Introduce Workbench tier tokens and reskin admin against them; faster if status tokens already exist |

## Pitfall-to-Phase Mapping

v1.1 phases aren't finalized; mapping uses the natural shape (foundation/tokens → header/nav → public surfaces → app surfaces → admin → rebrand sweep → QA/UAT-fixes).

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Visual-only scope creep (1) | Foundation (behavior-freeze contract) + every surface phase | Route/schema inventory diff clean; full e2e green per phase; no `lib/actions/` churn in visual commits |
| Hardcoded-value sprawl (2) | Foundation (token layer first) | Grep for raw hex outside `globals.css`; single source for neon red/cyan/glows |
| Neon a11y failures (3) | Foundation (palette ratios, focus ring, font policy); final QA (axe + keyboard walk) | Recorded contrast ratios; Tab-walk of all forms; display font absent <20px |
| Rebrand misses (4) | Dedicated rebrand-sweep plan | Repo grep zero hits; dashboard checklist (Supabase/Twilio/Resend/Vercel) evidenced; real emails/SMS read |
| Test breakage mishandled (5) | Every surface phase (same-commit updates) | Suite green at phase boundaries; role/name selectors preserved; contract tests untouched |
| Performance traps (6) | Foundation (glow pattern, font pipeline, background strategy); QA (Lighthouse vs baseline) | Mobile Lighthouse ≥ baseline; no `transition: box-shadow`; CLS ≈ 0 on font swap |
| Dark-theme half-applied (7) | Foundation (`color-scheme`, meta, autofill, charts); listing/feed phase (photo wells) | Native-widget audit; autofill login test; chart readability |
| Uniform aesthetic / mobile bias (8) | Foundation (two tiers + status tokens); admin phase; per-surface mobile checks | Admin in Workbench tier; 360px signage check with real taxonomy strings; stakeholder sign-off on tier split |

## Sources

**Codebase (HIGH — direct inspection, 2026-06-12):** `app/layout.tsx` (scaffold metadata, light-only fonts, no dark class), `app/globals.css` (light `:root` tokens, `.dark` variant unused, grayscale charts), `lib/admin/email.ts` / `lib/messaging/notify.ts` / `lib/verify/alert.ts` (hardcoded old-brand FROM/subjects/bodies), `e2e/home.spec.ts` + `e2e/auth.spec.ts` (brand-string role selectors), `components/ui/` (18 owned shadcn primitives), 43 vitest files incl. privacy/RLS/messaging contracts.

**Accessibility (HIGH):**
- [Understanding SC 1.4.11 Non-text Contrast — W3C WAI](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- [Understanding SC 2.4.13 Focus Appearance — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [A guide to designing accessible, WCAG-conformant focus indicators — Sara Soueidan](https://www.sarasoueidan.com/blog/focus-indicators/)
- [WebAIM: Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
- [Dark Mode Best Practices for Accessibility — DubBot](https://dubbot.com/dubblog/2023/dark-mode-a11y.html) (MEDIUM — halation/astigmatism guidance)
- [The Designer's Guide to Dark Mode Accessibility — AccessibilityChecker](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/) (MEDIUM)

**Performance (HIGH/MEDIUM):**
- [How to animate box-shadow with silky smooth performance — Tobias Ahlin](https://tobiasahlin.com/blog/how-to-animate-box-shadow/) (HIGH — canonical pseudo-element/opacity pattern)
- [CSS Box Shadow Animation Performance — SitePoint](https://www.sitepoint.com/css-box-shadow-animation-performance/) (MEDIUM)
- [Custom fonts without compromise using next/font — Vercel](https://vercel.com/blog/nextjs-next-font) (HIGH — size-adjust fallback, CLS prevention)
- [Framework tools for font fallbacks — Chrome Developers](https://developer.chrome.com/blog/framework-tools-font-fallback) (HIGH)

**Dark theme mechanics (HIGH):**
- [Improve dark mode default with color-scheme and a meta tag — web.dev](https://web.dev/articles/color-scheme)
- [color-scheme — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme)
- [Native HTML light and dark color scheme switching — Vadim Makeev](https://pepelsbey.dev/articles/native-light-dark/) (MEDIUM — manual-class vs OS-preference trap)
- [Tailwind autofill/scrollbar styling with shadcn dark mode — tailwindcss discussion #14031](https://github.com/tailwindlabs/tailwindcss/discussions/14031) (MEDIUM)

*v1.0 pitfalls (PII/RLS/EXIF/caching/SMS-pumping etc.) are archived in `.planning/milestones/` planning docs and remain enforced as architectural invariants in CLAUDE.md; this file supersedes them for milestone v1.1.*

---
*Pitfalls research for: v1.1 OG Rebrand & UI Redesign (Take-Off Parts → OG Truck Parts)*
*Researched: 2026-06-12*
