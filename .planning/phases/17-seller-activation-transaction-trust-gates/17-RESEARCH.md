# Phase 17: Seller Activation & Transaction Trust Gates - Research

**Researched:** 2026-06-19
**Domain:** Connective tissue — wiring just-in-time phone/terms verification gates into existing Next.js 16 Server Actions + RLS + the `/verify` wizard, on a shipped Supabase marketplace
**Confidence:** HIGH — every file path, function signature, RLS policy, and column below was read directly from this repo (not inferred). The only library-level claim (BotID protect-path semantics) is MEDIUM and flagged.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gate interception UX**
- **/sell unverified notice:** persistent banner at the top of the form (visible while filling) — sets expectations early so the Publish redirect is not a surprise. Tone: "Verify your phone to publish. Fill it out — your work is saved."
- **Publish click (unverified):** direct redirect — save draft to sessionStorage, immediately redirect to `/verify?require=seller&next=/sell`. No intermediate confirm dialog.
- **Photos at redirect:** warn before leaving. If photos are attached when Publish is hit, the redirect path communicates "You'll re-add your photos after verifying," and the rehydrated form on return shows a reminder. No silent loss.
- **Contact Seller button (unverified):** looks identical to the verified state; gate is invisible until click, which routes to `/verify?require=phone&next=/listings/[id]`. (Anonymous → `/login?next=...`, already exists.)

**Return-from-verify behavior**
- **Contact gate return:** auto-open the Contact Seller modal on return to `/listings/[id]` (detect the contact intent) — zero extra clicks.
- **Sell gate return:** rehydrate the form from sessionStorage; user re-attaches photos and clicks Publish manually (auto-publish is impossible since photos must be re-added).
- **Abandonment:** sell draft survives in sessionStorage (rehydrates if they return to /sell in the same session). Contact intent is disposable — nothing to save.
- **Confirmation:** brief toast on return ("Phone verified — you're all set"), plus the normal publish/contact success feedback after the action completes.

**Navigation entries**
- **Desktop:** "Sell" is an always-visible header action (primary conversion); "My Listings" and "Account" live in the existing user-menu dropdown.
- **Mobile:** all three (Sell, My Listings, Account) appear as list items in the mobile menu.
- **Labels:** `Sell` → `/sell`, `My Listings` → `/sell/listings`, `Account` → `/account` (plain, matches route names).
- **Proactive CTA:** include "Become a verified seller" on `/account` for unverified users (routes to `/verify?require=seller`). Scoped to `/account` only (not the public profile) for Phase 17.

**Draft preservation scope**
- **Fields saved:** all serializable form state — title, description, price, fitment (make/model/config), category, year, condition, special filters, location. Everything except `File` objects (photos).
- **TTL / storage:** `sessionStorage`, current session only. No cross-session persistence, no stale-draft management.
- **Rehydrate UX:** auto-fill the form silently from the draft with a small notice ("Restored your draft — re-attach photos to publish"). No "restore?" prompt.
- **Clear timing:** clear the draft only on a successful publish. It survives verify round-trips and in-session navigation until then.

### Claude's Discretion (resolve in research/planning)
- **Defense-in-depth depth:** server-action re-check is mandatory (the trust boundary). Whether to ALSO add a DB-level guard (RLS policy or trigger) on `listings` insert and on `contact_log`/`message_threads` insert is a planning decision — the project invariant ("RLS is the only authorization boundary") strongly favors adding the DB-level guard. Design doc marks depth as "decided at planning."
- **Anti-abuse spend-cap threshold:** confirm BotID + rate-limit + geo (+1) + spend cap (Phase 2) cover the now-wider buyer+seller audience; revisit/adjust the spend-cap threshold given the larger surface. Confirm, don't rebuild.
- Exact banner/notice/toast copy, component styling with current tokens, sessionStorage key shape.

### Deferred Ideas (OUT OF SCOPE)
- Final header visual design / repositioning — owned by the rebrand (CHRM, Phases 11–15).
- "Become a verified seller" CTA on the user's own public profile (Phase 17 ships it on /account only; profile surface can come later).
- Cross-session draft persistence (localStorage + expiry) — not needed for v1.1; revisit if drop-off data shows session-only loses too much.
- Payments, ratings/reputation — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

Behavioral extensions of shipped v1.0 IDs — no new IDs. Descriptions from `.planning/milestones/v1.0-REQUIREMENTS.md`.

| ID | Description | Research Support |
|----|-------------|-----------------|
| VERF-02 | Seller can verify their phone number via one-time code | `/verify` OTP flow exists (`app/(app)/verify/*`, `lib/actions/verify.ts`). Phase 17 makes verification *consequential* by gating on `phone_verified_at`. Parameterize the wizard with `?require=phone` (stop after OTP) and `?next=`. |
| VERF-03 | Seller must accept marketplace terms to become verified | `acceptTerms` action + `TermsStep` exist. `?require=seller` requires terms too; `?require=phone` does not. |
| VERF-04 | Verified Seller badge shown after email+phone+terms | `is_verified_seller(uuid)` SQL fn (migration 0002) is the existing oracle; the publish gate reuses its exact three-signal logic. |
| LIST-01 | Seller can create a listing | `createListing` (`lib/actions/listings.ts:179`) is the publish trust boundary. Add a phone+terms re-check (step 0). UI gates `/sell` Publish with sessionStorage draft + redirect. |
| MSG-01 | Each listing has a "Contact Seller About This Part" action | `ContactSellerButton` (`components/messaging/contact-seller-button.tsx`) state #5 opens the modal. Add an unverified branch that routes to `/verify?require=phone&next=/listings/[id]`. |
| MSG-05 | Contact form submission opens a private chat thread | `submitContact` (`lib/actions/contact.ts:67`) is the contact trust boundary. Add a `phone_verified_at` re-check (step 1.5). |
| CHRM-02/03 | (Anticipated, v1.1 rebrand) nav entry points | Phase 17 adds the functional Sell / My Listings / Account entries to `site-header.tsx`, `mobile-menu.tsx`, `user-menu.tsx` with current tokens; the rebrand restyles them later. |
</phase_requirements>

## Summary

This phase is **connective tissue, not new features**. Every piece named in the design doc already exists in the repo and was read directly: the `/verify` wizard (`app/(app)/verify/page.tsx` + three step components), the `sendOtp/checkOtp/acceptTerms` actions, the `is_verified_seller(uuid)` SQL function and the three backing columns on `profiles_private` (`phone_verified_at`, `marketplace_terms_accepted_at`, plus `email_confirmed_at` on `auth.users`), the `createListing`/`submitContact` server actions, the `ContactSellerButton` + `ContactFormModal`, the `ListingForm` (react-hook-form), and the nav components (`site-header.tsx`, `mobile-menu.tsx`, `user-menu.tsx`). The anti-abuse pipeline (BotID + rate-limit + geo + spend-cap) is fully built and already runs for *any authenticated caller* of `sendOtp` — not a seller-only path.

The work is four concrete edits plus nav: (1) re-check the verification flags inside the two server actions (the mandatory trust boundary, returning a new error variant the UI maps to a redirect); (2) parameterize the `/verify` page with `?next=` and `?require=phone|seller` so it stops at the right step and redirects to the gate origin; (3) intercept the two UI entry points (`/sell` Publish → sessionStorage draft + redirect; `ContactSellerButton` → redirect, then auto-open on return); (4) add the three functional nav entries. The one genuine *decision* is whether to add a DB-level (RLS/trigger) backstop — the project invariant strongly favors it, and `is_verified_seller()` being `SECURITY DEFINER` makes an RLS `WITH CHECK` clean and cheap (see §Architecture Pattern 5).

**Primary recommendation:** Implement the mandatory server-action re-checks first (the trust boundary), parameterize `/verify`, then wire the UI gates and nav. Add the RLS `WITH CHECK` backstop on `listings` insert and `message_threads` insert as defense-in-depth — it is one migration, reuses the existing `is_verified_seller()`/`phone_verified_at` logic, and satisfies CLAUDE.md invariant #2 ("RLS is the only authorization boundary"). Do NOT touch the OTP wizard internals, the anti-abuse pipeline, or any verification column — they are done.

---

## Concrete Answers to the 8 Critical Questions

### Q1 — The `/verify` wizard: location, current redirect logic, parameterization needs

- **Route/page:** `app/(app)/verify/page.tsx` (Server Component, `force-dynamic`). Steps are colocated client components: `phone-step.tsx`, `otp-step.tsx`, `terms-step.tsx`.
- **How it picks a step today:** It reads the caller's own `profiles_private` row (`phone, phone_verified_at, marketplace_terms_accepted_at`, owner RLS) and branches (page.tsx:34–78):
  - both flags set → "You're a verified seller" panel with a hardcoded `<Link href="/">Go to your dashboard</Link>` (lines 48–59).
  - `phoneVerified && !termsAccepted` → `<TermsStep />`.
  - `phone && change !== "1"` → `<OtpStep>`.
  - else → `<PhoneStep>`.
- **Current redirect-after:** There is none — the wizard *ends at a panel with a link to `/`* . The step components call `router.refresh()` after each action (`phone-step.tsx:69`, `otp-step.tsx:102`, `terms-step.tsx:51`); the page re-resolves to the next step. The DB row is the single source of truth for "which step," so progress survives reload (resume-on-abandon).
- **What `?next=` + `?require=phone|seller` needs:**
  - The page already reads `searchParams` (currently only `change`). Extend the type to `{ change?: string; next?: string; require?: string }`.
  - **Completion check becomes level-aware.** Today the "done" branch is `phoneVerified && termsAccepted`. With `require=phone`, "done" = `phoneVerified` (terms not required); with `require=seller` (default), "done" = `phoneVerified && termsAccepted`.
  - **On done, redirect to `next` instead of rendering the panel.** Validate `next` is a safe internal path (starts with `/`, not `//` or a scheme) before `redirect(next)` — open-redirect guard. If `next` absent, keep the existing panel/`/` behavior.
  - **`require=phone` must skip the terms step.** When `phoneVerified && require === "phone"`, redirect to `next` (or panel) *without* routing to `TermsStep`.
  - **Propagate params through the step round-trips.** `router.refresh()` preserves the URL (good), but the OTP step's "Change number" does `router.push("/verify?change=1")` (otp-step.tsx:130) — it must carry `next`/`require` forward or they're lost. Same for any internal links.
  - **The post-completion toast** ("Phone verified — you're all set") belongs on the *gate-origin* page after redirect (e.g. a `?verified=1` flag the origin reads once), not inside `/verify`.

### Q2 — `createListing` and `submitContact`: location, current checks, where the gate goes

- **`createListing`** — `lib/actions/listings.ts:179`. Current guard order: (1) `getClaims` identity → `unauthenticated`; (2) `listingSchema.safeParse` → `invalid`; (3) photo-path ownership; (4) fitment combo re-check; (4b) ADMO-05 inactive-taxonomy check; (5) insert listing; (6) children. **Gate goes as a new step 0, immediately after the identity check (line 185), before schema parsing.** Read the caller's `profiles_private` row (`phone_verified_at, marketplace_terms_accepted_at`) via the cookie client (owner RLS) and reject if either is null. Add a new error variant (e.g. `not_verified`) to `CreateListingResult`.
- **`submitContact`** — `lib/actions/contact.ts:67`. Current guard order: (1) `getClaims` → `unauthenticated`; (2) `contactSchema.safeParse` → `invalid`; (3) rate limit; (4) listing pre-check; (5) existing-thread dedupe; (6) `contact_log` insert (the invariant-#5 blocking write). **Gate goes after identity + schema (after line 80), before the rate-limit count** — fail fast and before any write. Read `phone_verified_at` only (contact gate is phone-only, NOT terms). Add a new error variant (e.g. `not_verified`) to `SubmitContactResult`.
- **Both reads use the existing pattern** (`supabase.from("profiles_private").select(...).eq("id", userId).maybeSingle()`) already used in `app/(app)/verify/page.tsx:34` and `app/(public)/listings/[id]/page.tsx:104`. No new helper strictly required, but a shared `lib/verify/gate.ts` helper (`requirePhoneVerified(userId)`, `requireVerifiedSeller(userId)`) would centralize the two reads and is recommended (see Don't-Hand-Roll).

### Q3 — Where the flag check lives (DB fn, lib helper, columns)

- **DB function:** `public.is_verified_seller(profile_id uuid)` — `supabase/migrations/0002_verification.sql:85`. `language sql stable security definer set search_path = ''`, granted to `anon, authenticated`. It ANDs three live signals: `auth.users.email_confirmed_at IS NOT NULL` + `profiles_private.phone_verified_at IS NOT NULL` + `profiles_private.marketplace_terms_accepted_at IS NOT NULL`. **No stored `is_verified` column** — recomputed each read so clearing any signal auto-revokes (intentional).
- **Columns** (all on `profiles_private`, owner-only RLS, added by migration 0002): `phone_verified_at timestamptz`, `marketplace_terms_accepted_at timestamptz`, `terms_version text`. `email_confirmed_at` lives on `auth.users`.
- **There is NO TypeScript `isVerifiedSeller` lib helper today.** The badge surfaces via RPC on the public profile (`app/(public)/u/[username]/page.tsx` calls `is_verified_seller`). The two server-action gates can either (a) read the two columns directly (phone-only for contact; phone+terms for sell), or (b) call `supabase.rpc("is_verified_seller", { profile_id: userId })` for the seller gate. **Recommendation:** read columns directly — the seller gate needs phone AND terms (a strict subset is the contact gate's phone-only), the RPC also re-checks email which the `(app)` layout already gates (no claims = no session = can't reach the action), and column reads avoid a second round-trip. A thin `lib/verify/gate.ts` wraps both.

### Q4 — DB-level guard (RLS/trigger) decision

**Investigated the actual policies. Current state:**
- `listings` INSERT policy (`0006_listings.sql:69`): `create policy "listings owner-insert" ... with check ((select auth.uid()) = seller_id)`. Owner-scoping only — no verification check.
- `contact_log` INSERT (`0016_messaging.sql:63`): `with check ((select auth.uid()) = buyer_id)`.
- `message_threads` INSERT (`0016_messaging.sql:121`): `with check ((select auth.uid()) = buyer_id)`.

**Feasibility:** HIGH. Because `is_verified_seller()` is `SECURITY DEFINER` and granted to `authenticated`, it can be called from inside an RLS `WITH CHECK` expression (it bypasses the caller's RLS to read `profiles_private`, which is exactly what's needed — the policy author trusts the function). A verification-gating policy is a clean `WITH CHECK` extension, no trigger needed.

**Recommended shape (defense-in-depth, NOT a replacement for the server-action check):**
```sql
-- listings: publish requires verified seller (phone + terms).
drop policy "listings owner-insert" on public.listings;
create policy "listings owner-insert" on public.listings
  for insert to authenticated
  with check (
    (select auth.uid()) = seller_id
    and public.is_verified_seller((select auth.uid()))
  );

-- message_threads: opening a thread requires a phone-verified buyer.
-- (contact_log is the FIRST write in submitContact; gate the THREAD, or gate
--  contact_log — see tradeoff below.)
drop policy "threads buyer-insert" on public.message_threads;
create policy "threads buyer-insert" on public.message_threads
  for insert to authenticated
  with check (
    (select auth.uid()) = buyer_id
    and exists (
      select 1 from public.profiles_private p
      where p.id = (select auth.uid()) and p.phone_verified_at is not null
    )
  );
```

**Tradeoffs to surface to the planner:**
1. **`listings` is unambiguous** — gate `owner-insert` with `is_verified_seller()`. Low risk, high invariant-alignment.
2. **The contact gate is subtler.** The contact flow's *first* write is `contact_log` (invariant #5: contact persists before thread). If you gate `message_threads` only, an unverified buyer could still write a `contact_log` row before the thread insert fails — leaving an orphan contact_log with no thread. **Better: gate `contact_log` insert** (the first write) so an unverified buyer creates nothing. Use a phone-only `EXISTS` check (NOT `is_verified_seller`, which requires terms — buyers don't accept selling terms). The server-action re-check (Q2) already fails before any write, so the DB guard is a backstop for direct-API callers using the anon key.
3. **EXIF/year/edit paths:** `is_verified_seller()` on `listings` INSERT does NOT affect `updateListing` (an UPDATE) or photo uploads (Storage, separate RLS) — verified-once stays verified, edits are unaffected. Confirm this is intended (it is: gate is publish-time, edits don't re-gate).
4. **`is_verified_seller` re-checks email.** A user with an unconfirmed email can't reach `(app)` (layout redirects), so the email arm is effectively always true for any reachable caller — but the RLS check is reachable by a raw anon-key API call, so keeping the email arm there is *more* correct than the app layer alone. This is precisely why the DB guard matters.

**Verdict:** Add both DB guards. Cost is one migration; benefit is closing the anon-key bypass that the server-action check alone cannot (the anon key is public — CLAUDE.md invariant #2/#3). This is the invariant-faithful choice and the design doc + CONTEXT both lean toward it.

### Q5 — The `/sell` form: state shape, serializable vs File, where sessionStorage hooks in

- **Form:** `components/listings/listing-form.tsx`, react-hook-form + `zodResolver(listingSchema)`. Used for BOTH create and edit (`mode` prop).
- **State is split** (this is the key fact for draft save):
  - **In RHF** (`useForm` defaultValues, lines 226–251): `title`, `partNumber`, `askingPrice`, `conditionId`, `shippingOption`, `damageNotes`, `isBarnyard`, `yearMode`, `yearStart`, `yearEnd`, plus mirrored `fitment`/`photoPaths`.
  - **In component `useState` (outside RHF), merged at submit:** `photos: UploadedPhoto[]` (line 168), `fitment: FitmentSelection[]` (line 171, holds names+ids), `isBarnyard` (174), `categoryId`/`categoryIds` (185/188), `searchTerms: SuggestedTag[]` (194).
- **Serializable vs File:** Everything is serializable JSON **except `photos`** — `UploadedPhoto` wraps uploaded Storage *paths* once ready, but the in-flight File objects and the uploader's transient state are not. Per CONTEXT, photos are deliberately sacrificed. **Save:** `form.getValues()` (all RHF fields) + the component-managed `fitment` (FitmentSelection[] with names — needed to re-render chips), `categoryIds`, `searchTerms`, `isBarnyard`. **Drop:** `photos`.
- **CONTEXT field-list confirmation:** CONTEXT says "title, description, price, fitment, category, year, condition, special filters, location." **Discrepancy to flag to the planner:** the actual schema has **no `description`** field (it's `damageNotes`), **no `location`** field (location is on the seller's profile, not the listing), and "special filters" maps to `searchTerms` (slang/special-filter tags) + `isBarnyard`. The real serializable set is: title, partNumber, askingPrice, conditionId, shippingOption, damageNotes, isBarnyard, fitment, categoryId/categoryIds, searchTerms, yearMode/yearStart/yearEnd. Use the actual schema, not CONTEXT's loose list.
- **Where to hook in:**
  - **Save on Publish-while-unverified:** the gate check happens *before* `createListing` is called. The cleanest interception is a new prop/branch in `runCreate`/`onSubmit` — but the gate is best discovered server-side. Two options: (a) call `createListing`, and on `not_verified` save the draft + redirect; or (b) pass an `isVerifiedSeller` boolean prop from `app/(app)/sell/page.tsx` (it already does a `getClaims` + a `profiles_public` read; add a `profiles_private` flag read) and intercept Publish client-side before calling the action. **Recommendation: do both** — prop-driven client interception for instant UX (no wasted server round-trip, save draft + `router.push('/verify?require=seller&next=/sell')`), AND the server `not_verified` as the trust boundary.
  - **Rehydrate on mount:** a `useEffect` on `/sell` create-mode that reads sessionStorage, and if a draft exists, resets RHF (`form.reset(...)`) + the component state, shows the "Restored your draft — re-attach photos" notice, and does NOT clear (clear only on successful publish — CONTEXT).
  - **sessionStorage key:** scope to create-mode only (never edit), e.g. `sell-draft:v1`. Clear in `runCreate` success branch (line 426 area).

### Q6 — The contact modal: today's trigger + how "auto-open on return" detects intent

- **Today:** `ContactSellerButton` (`components/messaging/contact-seller-button.tsx`) holds `open` state (line 43); state #5 (authenticated + active, lines 73–90) renders the button that `setOpen(true)` and mounts `<ContactFormModal open={open} .../>`. The modal (`components/messaging/contact-form-modal.tsx`) submits `submitContact` and on success `router.push('/messages/[threadId]')`.
- **Unverified branch to add (between current #4 anon and #5):** if authenticated but NOT phone-verified, render a button that routes to `/verify?require=phone&next=/listings/[id]` (a `<Link>`, mirroring the anon `#4` pattern at lines 62–70, but to `/verify` instead of `/login`). The button text is identical to the verified state (CONTEXT: gate invisible until click). This needs a new `isPhoneVerified` prop threaded from the page → `ListingDetail` → `ContactSellerButton`.
- **`isPhoneVerified` source:** `app/(public)/listings/[id]/page.tsx` already reads the viewer's own `profiles_private` row (lines 104–111, selecting `first_name,last_name,email,phone` for prefill, only when `userId && !isOwner`). **Add `phone_verified_at` to that same select** — zero extra round-trips. Pass the boolean down.
- **Auto-open on return — intent detection:** use a query-param convention. After verify, `/verify` redirects to `next=/listings/[id]`; append a marker, e.g. `next=/listings/[id]?contact=1` (URL-encoded). On the listing page, `ContactSellerButton` reads `searchParams` (it's a client component — use `useSearchParams()`) and if `contact=1` AND the viewer is now phone-verified, initialize `open` to `true`. Optionally strip the param via `router.replace` so a refresh doesn't re-open. The "Phone verified — you're all set" toast also fires off this marker.

### Q7 — Nav: components, current logged-in state, where entries slot

- **Desktop header:** `components/layout/site-header.tsx` (Server Component, reads `getClaims` + `username`). Logged-in icon row (lines 56–64): `<MessagesBadge>` + `<SavedHeartIcon>` + `<UserMenu>`. **Add a "Sell" entry here as an always-visible header action** — per CONTEXT it's the primary conversion. Use the existing `NavIconLink` component (`components/layout/nav-icon-link.tsx`) with a lucide icon (e.g. `Tag`/`Plus`/`PlusCircle`) and `href="/sell"`, or a labeled `<Button asChild>` if a text "Sell" is preferred. Sell should show for anonymous users too (the `(app)` layout will auth-gate `/sell` → `/login`).
- **User-menu dropdown:** `components/layout/user-menu.tsx` (client, Radix DropdownMenu). Currently: header card + "My profile" link + "Log out". **Add "My Listings" (`/sell/listings`) and "Account" (`/account`) `DropdownMenuItem`s** above the separator/logout, mirroring the existing "My profile" item (lines 72–77) — `<DropdownMenuItem asChild>` wrapping an `<a href=...>` with a lucide icon (`List`/`Settings`).
- **Mobile menu:** `components/layout/mobile-menu.tsx` (client, Sheet). Logged-in list (lines 52–86): Messages, Saved, My profile, Log out, each via the local `MenuLink` helper. **Add Sell, My Listings, Account as three more `<MenuLink>` rows.**
- **`/account` proactive CTA:** `app/(app)/account/page.tsx` already reads the user's `profiles_public` + `profiles_private` (lines 33–44). Add a `phone_verified_at`/`marketplace_terms_accepted_at` read (or call `is_verified_seller`), and when unverified render a "Become a verified seller" card linking `/verify?require=seller`.
- **NOTE (untracked files already exist):** `nav-icon-link.tsx`, `mobile-menu.tsx`, `header-search.tsx`, `saved-heart-icon.tsx` are present and the header already uses them — they were created during the v1.1 rebrand work in progress. Build on them; do not recreate.

### Q8 — Anti-abuse: where it lives, does it cover the wider audience, spend-cap value

- **BotID:** registered in `instrumentation-client.ts` as `initBotId({ protect: [{ path: "/verify", method: "POST" }] })`; `next.config.ts` wraps with `withBotId`; `sendOtp` calls `checkBotId()` first (`lib/actions/verify.ts:52`). The protect path is the **route** `/verify`, not the action by name — so any POST originating from `/verify` (Server Action invocation) is scored, regardless of whether the caller is a buyer or seller. **It already covers the wider audience** because the gate redirects everyone (buyer or seller) to `/verify`, and that is the protected route. (MEDIUM confidence on the exact BotID protect-path matching semantics for Server Actions — verify in a quick prod smoke test; the design doc treats this as "confirm, don't rebuild.")
- **Rate-limit + spend-cap:** `lib/verify/ratelimit.ts` (`consumeSendBudget`). Per-phone (3/hr, 5/day) + per-IP (3/hr, 5/day) + a **global daily spend cap**. All keyed on the caller via `sendOtp` → `getClaims` `userId` + `e164` + IP. **Already audience-agnostic** — it counts attempts in `otp_send_attempts` regardless of buyer/seller intent.
- **Spend-cap value & where set:** `lib/verify/ratelimit.ts:7–10` — `dailyCap()` reads `process.env.OTP_SEND_DAILY_CAP`, **default 200** if unset/invalid. Tunable without redeploy (env var). **Recommendation for the wider audience:** the cap is global and env-driven, so widening from seller-only to buyer+seller just needs the threshold reconsidered, not code changes. Confirm the current Vercel env value (it may be unset → default 200). With buyers now also verifying, 200/day may be low at launch scale; flag to the planner to set `OTP_SEND_DAILY_CAP` explicitly on Vercel (e.g. 300–500) and pair with a Twilio usage-trigger billing alert. **Do not rebuild — adjust the env value.**
- **Geo (+1):** `lib/verify/phone.ts` `toE164Plus1` — local US/CA-only normalizer, runs before any Twilio call. Audience-agnostic. Backstop is Twilio Verify Geo Permissions (a pre-launch dashboard item per memory).

---

## Architecture Patterns

### Pattern 1: Server Action re-check as the trust boundary (MANDATORY)
**What:** Add the verification check inside `createListing` and `submitContact` as an early guard, returning a typed error variant the client maps to a redirect.
**When:** Always — this is invariant-faithful (CLAUDE.md: "the same Zod schema validates client and inside the Server Action (trust boundary)"). The UI redirect is UX; the server is the authority.
**Example:**
```typescript
// lib/actions/listings.ts — new step 0 in createListing, after getClaims (line 185)
const { data: priv } = await supabase
  .from("profiles_private")
  .select("phone_verified_at, marketplace_terms_accepted_at")
  .eq("id", userId)
  .maybeSingle();
if (!priv?.phone_verified_at || !priv?.marketplace_terms_accepted_at)
  return { ok: false, error: "not_verified" };

// lib/actions/contact.ts — after schema parse (line 80), phone-only
const { data: priv } = await supabase
  .from("profiles_private")
  .select("phone_verified_at")
  .eq("id", buyerId)
  .maybeSingle();
if (!priv?.phone_verified_at) return { ok: false, error: "not_verified" };
```

### Pattern 2: Level-aware `/verify` completion + safe redirect
**What:** The wizard reads `?require` to decide "done," and `?next` to decide where to go.
**Example (in `app/(app)/verify/page.tsx`):**
```typescript
const { change, next, require } = await searchParams;
const requireTerms = require !== "phone"; // default "seller" requires terms
const done = phoneVerified && (!requireTerms || termsAccepted);
function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : null; // open-redirect guard
}
if (done) {
  const target = safeNext(next);
  if (target) redirect(target);
  // else fall through to the existing "verified" panel
}
```

### Pattern 3: sessionStorage draft (serializable-only)
**What:** Save `form.getValues()` + component state (fitment/categoryIds/searchTerms/isBarnyard) minus photos; rehydrate on mount; clear only on publish success.
**When:** `/sell` create mode only. Never edit mode (it loads from the DB).
**Anti-pattern:** Do NOT try to persist `File` objects or the uploader state — they aren't serializable and CONTEXT explicitly sacrifices photos.

### Pattern 4: Query-param intent marker for auto-open
**What:** `next=/listings/[id]?contact=1`; the client `ContactSellerButton` reads `useSearchParams()` and opens the modal when `contact=1` + now-verified; strip via `router.replace`.

### Pattern 5: RLS `WITH CHECK` defense-in-depth using the SECURITY DEFINER function
**What:** Extend `listings` owner-insert with `is_verified_seller()`, and gate `contact_log` insert with a phone-only `EXISTS`.
**When:** Recommended — closes the public-anon-key bypass the app layer can't. One migration (next number: `0027`).
**Anti-pattern:** Gating only `message_threads` (leaves orphan `contact_log` rows from unverified buyers — gate the first write instead).

### Anti-Patterns to Avoid
- **Treating the UI redirect as the gate.** The anon key is public (invariant #3); only the server action + RLS are authorization. UI redirect is convenience.
- **Adding a stored `is_verified` boolean.** The design forbids it; the badge is recomputed so revocation is automatic.
- **Touching the OTP wizard internals / anti-abuse code.** Out of scope; "confirm, don't rebuild."
- **Persisting the sell draft to localStorage / cross-session.** Deferred; sessionStorage only.
- **Putting `phone_verified_at` on a public table or reading it via a public query.** It's PII-adjacent and lives on `profiles_private` (owner RLS). The publish/contact gates read the *caller's own* row.
- **Using `getSession()` anywhere.** All gates use `getClaims()` (invariant #6) — the existing actions already do.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Is this user a verified seller?" | A new boolean column or bespoke logic | Existing `is_verified_seller(uuid)` SQL fn (0002) for the seller gate; direct `phone_verified_at` read for the contact gate | Single source of truth; auto-revokes; already SECURITY DEFINER for RLS use |
| Two near-identical column reads in two actions | Copy-paste the select into each action | A thin `lib/verify/gate.ts` (`requirePhoneVerified`, `requireVerifiedSeller`) | One place to evolve the gate; mirrors `lib/seller/badge.ts` shared-contract posture |
| Open-redirect protection on `?next=` | Trust the param | A `safeNext()` guard (`/`-prefixed, not `//`, no scheme) | `next` is attacker-controllable; redirecting to an external URL is a phishing vector |
| OTP send abuse | New rate-limit/captcha | Existing `consumeSendBudget` + BotID + `toE164Plus1` | Fully built, audience-agnostic; only the env spend-cap value may need a bump |
| Draft serialization | Custom encode of File objects | `JSON.stringify(form.getValues() + state)` minus photos | Files aren't serializable; CONTEXT sacrifices photos by design |

**Key insight:** Almost everything this phase needs already exists and was built defensively. The risk is *re-implementing* a gate primitive (a new flag, a new abuse guard) instead of *wiring* the existing ones.

## Common Pitfalls

### Pitfall 1: Gating the wrong write in the contact flow
**What goes wrong:** Adding the RLS check to `message_threads` only lets an unverified buyer still insert a `contact_log` row (the FIRST write, invariant #5), leaving an orphan contact with no thread.
**How to avoid:** Gate `contact_log` insert (phone-only EXISTS). The server-action check fails before any write anyway; the DB guard backstops direct API callers.
**Warning sign:** `contact_log` rows whose `id` is never referenced by a `message_threads.contact_log_id`.

### Pitfall 2: Losing `next`/`require` across the wizard's internal navigations
**What goes wrong:** OTP step's "Change number" `router.push("/verify?change=1")` drops the gate params; user finishes verifying and lands on `/` instead of back at `/sell`.
**How to avoid:** Carry `next`/`require` through every internal push/link in the step components. `router.refresh()` is safe (preserves URL); explicit `push` is not.

### Pitfall 3: `not_verified` thrown after the sell draft is already lost
**What goes wrong:** If the client calls `createListing` first and only saves the draft on the `not_verified` response, a navigation/error in between loses the form.
**How to avoid:** Prefer prop-driven client interception (save draft → redirect) BEFORE calling the action; keep the server `not_verified` as the trust-boundary backstop. Save the draft synchronously before any redirect.

### Pitfall 4: Auto-open modal re-fires on refresh / for still-unverified users
**What goes wrong:** `contact=1` left in the URL re-opens the modal on every refresh, or opens it for a user who abandoned verification.
**How to avoid:** Only auto-open when `contact=1` AND the viewer is now phone-verified; strip the param with `router.replace` after opening.

### Pitfall 5: Behavior-freeze drift (carried from v1.1 PITFALLS.md)
**What goes wrong:** "While I'm in here" edits to the contact modal break invariant #5 (contact persists + admin copy before chat), or a restyle changes a route the e2e suite asserts.
**How to avoid:** This phase ADDS guards and entries; it must not reorder `submitContact`'s steps 6–11 or change the modal's submit path. Re-run `tests/integration/messaging.contract.test.ts` and the contact e2e after touching the modal. Keep nav additions as new entries with real destinations (no dead affordances).

### Pitfall 6: SMS spend-cap default too low for the wider audience
**What goes wrong:** `OTP_SEND_DAILY_CAP` unset → default 200; buyers now also verify → cap hit, legit users see "Verification temporarily unavailable."
**How to avoid:** Set `OTP_SEND_DAILY_CAP` explicitly on Vercel for the buyer+seller surface; pair with a Twilio billing alert. Env-only change, no code.

## Code Examples

### Existing contact-button anon redirect (the pattern the unverified branch mirrors)
```typescript
// components/messaging/contact-seller-button.tsx:62-70 (state #4, anon → login)
if (!isAuthenticated) {
  return (
    <Button asChild className="mt-2 w-fit">
      <Link href={`/login?next=/listings/${listingId}`}>
        Contact Seller About This Part
      </Link>
    </Button>
  );
}
// NEW branch (authenticated but !isPhoneVerified): same shape, route to
// `/verify?require=phone&next=${encodeURIComponent(`/listings/${listingId}?contact=1`)}`
```

### Existing owner-flag read pattern (reused by both gates)
```typescript
// app/(public)/listings/[id]/page.tsx:104-111 — the existing own-private read.
// Phase 17 adds phone_verified_at to this exact select to derive isPhoneVerified.
supabase
  .from("profiles_private")
  .select("first_name, last_name, email, phone") // + phone_verified_at
  .eq("id", userId)
  .maybeSingle();
```

### The verified-seller oracle (reuse, don't reimplement)
```sql
-- supabase/migrations/0002_verification.sql:85 — already SECURITY DEFINER, callable in RLS.
create or replace function public.is_verified_seller(profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = profile_id), false)
     and coalesce((select p.phone_verified_at is not null from public.profiles_private p where p.id = profile_id), false)
     and coalesce((select p.marketplace_terms_accepted_at is not null from public.profiles_private p where p.id = profile_id), false);
$$;
```

## State of the Art

Not applicable — this is internal wiring of an existing, version-pinned stack (Next.js 16 App Router, Supabase `@supabase/ssr` 0.10.x, react-hook-form 7.76.x, zod 4.4.x, BotID, Twilio Verify). No library currency questions; nothing deprecated is in play. All patterns follow the repo's established conventions (getClaims, owner RLS, schema-as-trust-boundary, SECURITY DEFINER RPCs).

## Open Questions

1. **CONTEXT draft field list vs actual schema mismatch**
   - What we know: CONTEXT lists "description" and "location" as draft fields.
   - What's unclear: those fields don't exist on the listing schema (`damageNotes`, no location).
   - Recommendation: Save the actual serializable schema fields (title, partNumber, askingPrice, conditionId, shippingOption, damageNotes, isBarnyard, fitment, categoryId/categoryIds, searchTerms, yearMode/yearStart/yearEnd) minus photos. Treat CONTEXT's list as intent, not literal field names.

2. **Contact DB guard: gate `contact_log` (first write) vs `message_threads`?**
   - What we know: invariant #5 makes `contact_log` the first write; gating threads leaves orphan logs.
   - Recommendation: gate `contact_log` insert with a phone-only EXISTS (NOT `is_verified_seller`, which requires selling terms buyers don't have). Decided at planning.

3. **Spend-cap threshold for buyer+seller surface**
   - What we know: default 200, env-tunable, currently maybe unset on Vercel.
   - Recommendation: set `OTP_SEND_DAILY_CAP` explicitly (e.g. 300–500) + Twilio billing alert. Confirm current Vercel value during planning.

4. **BotID protect-path coverage of Server Action POSTs from `/verify`**
   - What we know: `protect: [{ path: "/verify", method: "POST" }]` and `sendOtp` calls `checkBotId()`; enforcement is prod-only.
   - What's unclear (MEDIUM): exact matching of the route-based protect rule to Server Action invocations originating on `/verify`.
   - Recommendation: confirm with a prod smoke test (design doc says "confirm, don't rebuild"); no code change expected.

## Sources

### Primary (HIGH confidence — direct repo reads, 2026-06-19)
- `app/(app)/verify/page.tsx`, `phone-step.tsx`, `otp-step.tsx`, `terms-step.tsx` — wizard structure, step branching, redirect-after, `change` param
- `lib/actions/verify.ts` — sendOtp/checkOtp/acceptTerms guard order, getClaims identity
- `lib/actions/listings.ts` — createListing/updateListing guard order, insert shape
- `lib/actions/contact.ts` — submitContact invariant-#5 step order, rate limit
- `lib/verify/ratelimit.ts` — spend cap (env `OTP_SEND_DAILY_CAP`, default 200), per-phone/IP limits
- `lib/verify/phone.ts` — `toE164Plus1` geo +1 guard
- `lib/seller/badge.ts` — shared-contract posture (no isVerifiedSeller helper exists)
- `supabase/migrations/0002_verification.sql` — `is_verified_seller(uuid)` SECURITY DEFINER fn + the three columns
- `supabase/migrations/0006_listings.sql` (lines 60–79) — listings RLS insert policy
- `supabase/migrations/0016_messaging.sql` (lines 59–123) — contact_log / message_threads / threads RLS insert policies
- `components/messaging/contact-seller-button.tsx`, `contact-form-modal.tsx` — modal trigger + 5 render states
- `components/listings/listing-form.tsx` — RHF + component-state split, serializable fields
- `components/layout/site-header.tsx`, `user-menu.tsx`, `mobile-menu.tsx`, `nav-icon-link.tsx`, `header-search.tsx` — nav surfaces, current logged-in entries
- `app/(public)/listings/[id]/page.tsx` — existing own-private read (prefill), isOwner detection
- `app/(app)/sell/page.tsx`, `app/(app)/account/page.tsx` — page data reads, getClaims gates
- `app/(app)/layout.tsx` — auth gate (getClaims → /login), suspension gate, force-dynamic
- `next.config.ts`, `instrumentation-client.ts` — BotID withBotId + `protect: [{ path: "/verify", method: "POST" }]`
- `.planning/milestones/v1.0-REQUIREMENTS.md` — VERF/LIST-01/MSG descriptions
- `docs/superpowers/specs/2026-06-18-seller-activation-trust-gates-design.md` — approved two-gate design
- `.planning/phases/17-.../17-CONTEXT.md` — locked decisions
- `.planning/research/PITFALLS.md` — behavior-freeze + invariant-#5 discipline (v1.1)

### Secondary (MEDIUM confidence)
- BotID route-based protect-path matching for Server Action POSTs — repo config is clear, exact prod matching semantics flagged for a smoke test.

## Metadata

**Confidence breakdown:**
- Existing code locations & signatures: HIGH — every file read directly
- RLS feasibility (SECURITY DEFINER in WITH CHECK): HIGH — function declared SECURITY DEFINER + granted to authenticated; standard Postgres RLS pattern
- Anti-abuse coverage of wider audience: HIGH for rate-limit/spend-cap/geo (audience-agnostic by construction); MEDIUM for BotID protect-path-to-Server-Action matching
- CONTEXT field-list vs schema: HIGH that a mismatch exists (schema read directly)

**Research date:** 2026-06-19
**Valid until:** Stable — internal codebase wiring; valid until the touched files materially change (e.g. a rebrand phase rewrites the nav or the listing form).
