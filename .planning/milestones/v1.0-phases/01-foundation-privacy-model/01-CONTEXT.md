# Phase 1: Foundation & Privacy Model - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can register and log in, receives a public username, and gets a public profile that structurally cannot expose their private PII. Privacy is guaranteed by the data model and RLS (`profiles_public` world-readable, split from `profiles_private` owner-only), not by app discipline.

Covers requirements: ACCT-01..06, PRIV-01..04.

Architecture is already fixed by `CLAUDE.md` invariants and `ARCHITECTURE.md` (table split, RLS default-deny, service-role server-only, `getClaims()`/`getUser()` for auth, dynamic personalized routes). This context only captures **product/UX decisions** layered on top — not how to implement the privacy model.

</domain>

<decisions>
## Implementation Decisions

### Registration flow
- **All six PII fields required** at registration: First Name, Last Name, Email, Phone, State/Province, Country (plus password). Full profile from the start.
- These PII fields land in `profiles_private` (owner-only RLS) — never on the public table. Public location is derived as "State/Province, Country" only.
- **Email confirmation gate is ON**: after submitting registration the user sees a "check your email" screen and **cannot enter the app until they confirm** the email link. No app access while unconfirmed.
  - ⚠️ This overlaps Phase 2 (VERF-01 email confirmation feeds the Verified badge). Phase 1 owns the *confirmation gate for login*; Phase 2 owns the *Verified badge composition*. Planner/researcher should confirm the boundary so the email-confirm logic isn't duplicated — likely Phase 1 implements confirm, Phase 2 reads its result.
- **Confirmation link**: resend button (rate-limited) + link expires (Supabase default ~24h).

### Location capture
- **Predefined dropdowns**: Country dropdown + dependent State/Province dropdown. Normalized data for consistent filtering and clean public display.
- **Geographic scope v1: USA + Canada only.** Country list contains exactly these two; State/Province list is the states/provinces of the selected country. (Mexico deferred — see Deferred Ideas.)

### Public username
- **Chosen at registration, optional**: a username field in the registration form. If left blank, the system auto-generates one.
- **Auto-generated format** like `PeterbiltParts483`: drawn from a pool of generic truck/parts words (Peterbilt, Chrome, Diesel, Rig, etc.) + a random number. **Never derived from user PII** — zero PII-leak risk in the public handle.
- **Format rules**: alphanumeric only, 3–20 chars, no spaces. Case-insensitive uniqueness (`ChromeKing` == `chromeking`).
- **Editable after creation, rate-limited: once every 30 days.**
- **Live validation while typing**: availability + format check shown inline under the field (green "available" / red "taken").

### Public profile
- **URL pattern: `/u/username`** (e.g. `/u/ChromeKing79`). Prefix avoids collisions with reserved routes.
- **Layout: compact header + grid of active listings.** Header shows username, location ("State/Province, Country"), Member Since, and live active-listings count.
- **Member Since format: month + year** (e.g. "Member since June 2026").
- **No listings yet (Phase 1 reality):** show count as "0 active listings" + an empty state ("This user hasn't posted yet"). The count is derived live (PRIV-03), not stored — wired now so it's correct once listings arrive in Phase 5.
- Public response contains **only**: username, State/Province, Country, Member Since, active-listings count. A contract test must assert anonymous profile fetches contain zero PII keys (per cross-cutting gate).

### Login & session
- **Method: email + password.** (Consistent with password-based registration.)
- **Session: persistent by default** — long-lived refresh tokens, user stays logged in across browser close/reopen. No "remember me" checkbox. (Supabase default behavior; ACCT-05.)
- **Post-login redirect: home/feed** (logged-in). (Note: post-registration goes to the "confirm email" screen first, since confirmation is gated.)
- **Logout lives in a user menu in the global header** (avatar/username dropdown), visible on every page — satisfies ACCT-06 "log out from any page".

### Password & error handling
- **Password rules: minimum 8 characters + a visual strength meter.** No rigid symbol/uppercase requirements (modern NIST-aligned).
- **Forgot-password flow IS in Phase 1**: "forgot password" link on login → reset email → set new password.
- **Duplicate email: generic message** that does not confirm whether an email exists (anti account-enumeration). E.g. "If that email isn't already in use, check your inbox to continue."

### Terms & privacy
- **Mandatory terms/privacy checkbox at registration.** Must accept Terms + Privacy Policy to register; **store an acceptance timestamp.**
  - ⚠️ Note: Phase 2 (VERF) also involves terms acceptance for the Verified badge. Planner should reconcile — Phase 1 captures registration-time acceptance + timestamp; Phase 2 may layer marketplace-terms acceptance into the badge.

### Claude's Discretion
- Exact visual design of the registration/login forms, the "check your email" screen, the strength meter, and the empty profile state — follow the project design system.
- Specific copy wording for errors and the generic duplicate-email message.
- Implementation of the rate limit mechanics (resend email, username 30-day window).
- Whether forgot-password and resend-confirmation share infrastructure.

</decisions>

<specifics>
## Specific Ideas

- Auto-generated usernames should feel on-brand for heavy-truck culture (e.g. `PeterbiltParts483`, `ChromeKing79`) — truck/parts vocabulary, not generic adjective+noun.
- Public profile should read like a marketplace seller profile (header + listings grid), not a bare info card.

</specifics>

<deferred>
## Deferred Ideas

- **Social login (Google, etc.)** — its own future phase/decision. Complicates the all-required-PII model (Google won't supply phone, location, etc.) and the privacy split. Out of scope for Phase 1.
- **Mexico (and broader North America)** in the country/location list — v1 ships USA + Canada only. Add to roadmap backlog when expanding scope.
- **"Remember me" / configurable session length** — not in v1; persistent-by-default only.

</deferred>

---

*Phase: 01-foundation-privacy-model*
*Context gathered: 2026-06-02*
