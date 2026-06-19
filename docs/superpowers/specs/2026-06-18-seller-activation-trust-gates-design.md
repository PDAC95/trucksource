# Phase 17 — Seller Activation & Transaction Trust Gates

**Date:** 2026-06-18
**Status:** Approved design (brainstorm output) — feeds GSD phase planning
**Milestone:** v1.1 (functional scope, parallel to the OG rebrand)

## Problem

The verified-seller system was fully designed and built in Phase 2 (OTP wizard `/verify`,
`is_verified_seller()` RPC, badge) and the selling/contact flows were built in Phases 5/9
(create-listing, `/sell/listings` dashboard, contact→chat, inbox). But the **trust gates were
never wired**: today any logged-in user can publish a listing or contact a seller without phone
verification, and the entry points to selling/verifying are orphaned (no nav link to `/sell`,
`/account`, or `/verify`). Phase 17 is connective tissue + gating, not new features.

## Decisions (from brainstorm)

1. **Email at registration** stays as-is (Supabase email confirmation, Phase 1). The new gate is **phone**.
2. **Just-in-time phone verification, both sides.** Registration stays light; phone is requested the
   first time a user transacts (publish OR contact) and is permanent afterward.
3. **Two gates, asymmetric on terms:**
   - **Sell gate** (publish a listing): `phone_verified_at` **AND** `marketplace_terms_accepted_at`
     (= `is_verified_seller()`).
   - **Contact gate** (contact a seller): `phone_verified_at` **only**. The buyer already accepted the
     general TOS at registration; marketplace (selling) terms remain seller-only.
4. **Draft handling is mixed:** the **listing** preserves effort (gate at Publish, return to the filled
   form); the **contact** uses an early gate (before the modal opens) since the message isn't written yet.
5. **Navigation:** Phase 17 wires functional entries now; the rebrand (CHRM, Phases 11–15) repositions/
   styles them later.

## Design

### 1. Verification model

`profiles_private` already has `email_confirmed_at`, `phone_verified_at`, `marketplace_terms_accepted_at`.
New shared primitive: **phone-verified user** = `phone_verified_at` is set. `is_verified_seller()`
(email + phone + selling terms) is unchanged and means "can sell."

### 2. Gate enforcement — server is the trust boundary

- `createListing` (server action): re-check `phone_verified_at` AND `marketplace_terms_accepted_at`;
  reject if missing. The UI routes to `/verify` first, but the server is the authority.
- `submitContact` (server action): re-check `phone_verified_at`; reject if missing.
- **Defense in depth (recommended, depth decided at planning):** DB-level guard (RLS policy or trigger)
  on `listings` insert and on `contact_log`/`message_threads` insert requiring the acting user's flag,
  consistent with the project invariant "RLS is the only authorization boundary."

### 3. Gate UX

- **Sell (preserve draft):** `/sell` renders the form even when unverified, with a persistent notice.
  On **Publish** while unverified: persist the text/selection fields (title, fitment, category, year,
  condition, etc.) to `sessionStorage`, redirect to `/verify?require=seller&next=/sell`; on return the
  form rehydrates. **Caveat:** photos are `File` objects (not serializable) and must be re-attached after
  verifying — all fitment/taxonomy/year effort is preserved.
- **Contact (early gate):** on `/listings/[id]`, an unverified user's "Contact Seller" button routes to
  `/verify?require=phone&next=/listings/[id]` instead of opening the modal. On return it opens normally.
  Anonymous → `/login?next=...` (already exists). Nothing to preserve.

### 4. `/verify` wizard, parameterized

- `?next=` — return target after completion (the gate origin).
- `?require=phone|seller` — required level. `require=phone`: once phone is verified, redirect to `next`
  even if selling terms aren't accepted. `require=seller`: also require terms.
- The existing phone → OTP → terms flow is unchanged internally; it just becomes aware of the required
  level and the return destination (today it always ends at "go to dashboard").

### 5. Navigation (functional now; rebrand polishes later)

Add to header + mobile menu + user menu (logged-in): **"Sell"** → `/sell`, **"My Listings"** →
`/sell/listings`, **"Account"** → `/account`. Verify prompts originate from the gates with `next`/
`require`. Optional CTA "Become a verified seller" on `/account` or the user's own profile. Styled with
current tokens; CHRM repositions/styles later.

### 6. Anti-abuse — confirm, don't rebuild

The OTP send path already has BotID + rate-limit + geo (+1 only) + spend cap (Phase 2). Phase 17 confirms
these cover the now-wider audience (buyers AND sellers) and revisits the spend-cap threshold given the
larger surface. No reconstruction.

### 7. Testing

- **e2e:** unverified cannot publish → routed to verify → returns and publishes; unverified cannot contact
  → verify (phone only) → contacts without accepting selling terms; verified-seller flow end-to-end.
- **Server:** the actions reject when flags are missing (the trust-boundary oracle).

## Out of scope

- Final header visual design (rebrand owns it).
- Payments, ratings/reputation (v2).
- The OTP wizard internals (already built in Phase 2).
- No new verification columns — all flags already exist.

## Requirements touched

Extends shipped v1.0 IDs (behavioral change, no new IDs): **VERF-02/03/04** (verification now actually
gates), **LIST-01** (publish gated), **MSG-01/05** (contact gated). Navigation entries anticipate
**CHRM-02/03** without owning the final header design.
