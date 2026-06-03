# Phase 2: Verified Seller & Phone OTP - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A seller earns a server-computed **Verified Seller** badge by completing three conditions: confirmed email (already delivered in Phase 1), confirmed phone via one-time SMS code, and acceptance of marketplace terms. The OTP send path is hardened against SMS-pumping abuse (rate limit + CAPTCHA + geo allowlist + spend cap) **before** it is ever exposed.

Requirements: VERF-01, VERF-02, VERF-03, VERF-04.

**Note:** Email verification (VERF-01) was already implemented and verified in Phase 1. The real weight of this phase is the **phone OTP flow**, the **verification wizard**, and the **server-side badge computation**. Phone OTP uses **Twilio Verify** (per STACK.md).

</domain>

<decisions>
## Implementation Decisions

### Verification flow & trigger
- **Trigger: on intent to sell.** Registration stays low-friction; verification (phone + terms) is required only when the user attempts to create their first listing. Users browse the feed first, verify when they want to sell.
- **Presentation: step wizard.** Separate screens — step 1 enter phone → step 2 enter OTP → step 3 accept terms. One thing at a time, guided.
- **Resume on abandon: pick up where they left off.** Progress is persisted. If OTP was already sent, returning lands on code entry. If phone was already verified, returning lands on terms. Never forces restart from scratch.
- **Unverified user capabilities: everything except selling.** Unverified users browse, search, comment, contact sellers, use the feed. Only creating listings requires verification. (Comment/contact gates are not tightened in this phase.)

### Phone OTP UX
- **Code lifetime / attempts: 10 minutes, 5 wrong-code attempts** before the code is invalidated (Twilio Verify defaults). Balanced.
- **Resend: cooldown 30–60s.** Resend button disabled with a visible countdown, then re-enabled. Prevents send spam.
- **Code input: 6 separate boxes**, one per digit, auto-advance on type, supports pasting the full code.
- **Edit phone: "Change number" link** visible during OTP entry. Returns user to phone entry and invalidates the prior OTP. Prevents getting stuck on a mistyped number.

### Anti-abuse hardening (mandatory before exposing the OTP send endpoint)
- **Geo-allowlist: +1 only (US/Canada).** Matches the North-American heavy-truck market and blocks most SMS-pumping (which favors expensive international prefixes).
- **Spend cap behavior: block new sends + alert admin.** On reaching the SMS spend/volume cap (budget exhausted or abuse spike), new OTP sends are cut and the admin is notified to review.
- **Rate limit: 3 sends/hour, 5 sends/day per phone number** (also keyed by IP). Enough for legitimate retries, throttles pumping.

### Badge & terms
- **Badge placement: public profile** (next to username on the seller's profile page). Listing-card and feed-comment placement are downstream-phase concerns (Phase 5/7/8) — out of scope to wire here.
- **Badge appearance: icon + "Verified" text** (check/shield). Clear and unambiguous. Align styling to shadcn/ui.
- **Revocation: badge is server-computed and recomputed.** Verified state is computed server-side from (email verified AND phone verified AND terms accepted). If any condition stops being true (e.g. phone changed), the badge disappears automatically. No manual admin-revoke UI in this phase (that's Phase 10), but the computed model must not assume verification is permanent.
- **Terms: checkbox + link to full terms.** "I accept the marketplace terms" checkbox with a link to the full terms page. Persist acceptance with **timestamp + accepted version**.

### Claude's Discretion
- **CAPTCHA / bot-detection mechanism** — research compares **Vercel BotID** vs **Cloudflare Turnstile** for best fit with Twilio Verify + Vercel hosting, then picks. Must be low/zero user friction and sit in front of the OTP send button.
- Exact rate-limit storage mechanism and spend-cap threshold value.
- Wizard visual design, copy/microcopy, error and edge-state styling.
- Terms page content/structure (this phase only needs the acceptance + persistence mechanism).

</decisions>

<specifics>
## Specific Ideas

- 6-box OTP input should feel like the modern standard (auto-advance, paste-the-whole-code).
- Resend button shows a live countdown, not just a disabled state.
- The market is North-American heavy-truck parts — geo and product framing should reflect that (+1 first).

</specifics>

<deferred>
## Deferred Ideas

- Tightening comment/contact actions behind verification — not in this phase; unverified users keep those.
- Manual admin revoke/suspend of verification — Phase 10 (Admin Ops). This phase only ensures the badge is *recomputable*, not manually revocable.
- Badge on listing cards and feed comments — wired in their owning phases (Phase 5/7 listings, Phase 8 social).
- Including +52 (Mexico) in the geo-allowlist — revisit if a Mexican seller/buyer base emerges; v1 ships +1 only.

</deferred>

---

*Phase: 02-verified-seller-phone-otp*
*Context gathered: 2026-06-03*
