# Phase 9: Contact → Private Chat - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The trust spine: a buyer contacts a seller via a contact form (Name, Email, Phone optional, Message) that is persisted and admin-copied BEFORE any private chat thread opens; buyer and seller then exchange messages in a private in-site chat that never exposes seller PII; users can report a listing, comment, or message for abuse; every buyer→seller communication is logged for abuse monitoring and dispute resolution. (MSG-01 … MSG-07.)

Invariant #5 applies throughout: validate form → write `contact_log` row → server-side admin copy → only then open the thread. "Open chat" is never the primary action.

</domain>

<decisions>
## Implementation Decisions

### Contact form flow
- **Login required** to contact a seller. The "Contact Seller About This Part" CTA redirects unauthenticated users to login/signup and returns them to the listing.
- **Buyer verification NOT required** — any authenticated account can contact. OTP verification is a seller (listing) requirement, not a buyer one. Rate limiting covers spam.
- Form presented as a **modal over the listing** — buyer keeps listing context.
- **Pre-fill Name/Email (and Phone if available) from the buyer's own `profiles_private` data, editable** before submit. (It's the buyer's own PII — no privacy issue.)
- After submit: **directly into the chat thread**, with the form's Message as the first chat message. Persist + admin copy happen server-side before the thread opens (invariant #5).

### Chat threading & inbox
- **One thread per (listing, buyer) pair.** Same buyer asking about two parts from one seller = two threads.
- Inbox layout: **conversation list + active thread split view on desktop** (part photo, username, last message, unread badge per conversation); **list → thread as separate pages on mobile**.
- Thread header: **fixed part card** — photo, title, price, listing status (Active/Sold/Expired), clickable through to the listing.
- **Text-only messages in v1** (character limit; no photos in chat — avoids a second EXIF pipeline).
- **Chat identity is public username on both sides.** The buyer's real name from the contact form is visible only in the initial contact context (seller side) and to admin — never as the ongoing chat identity.

### Realtime & notifications
- **Live message delivery via Supabase Realtime** (per ROADMAP: Postgres Changes first, schema future-proofed for Broadcast-from-trigger). **No typing indicators or read receipts in v1.**
- **Global unread badge** on a "Messages" nav entry, always visible for logged-in users.
- **Email notification on new messages** (via Resend): "new message about [part]" with sender username, part, ~100-char message snippet, and a "View message" button linking to the thread. Never reveals the other party's email (no reply-to leakage).
- **Throttle: max 1 email per thread until the recipient reads the thread** — prevents email-per-message flooding.
- Sender: **Take-Off Parts <notifications@…>** via the existing Resend setup; subject mentions username + part.
- Tone: **direct, trucker-friendly English** (e.g. "BigRigBob is asking about your Peterbilt hood") — consistent with site voice.
- **Opt-out toggle in account settings**: "Email me about new messages", on by default.

### Thread lifecycle
- Re-clicking "Contact Seller" on a listing where the buyer already has a thread → **opens the existing thread directly** (no second form, no duplicate thread).
- Listing marked Sold/Expired: **existing threads stay open** (parties still coordinate the off-platform deal); thread header shows the Sold/Expired badge. **New contacts from that listing are no longer allowed.**
- **Block user**: either party can block the other; the blocked user can no longer message them in any thread. History preserved for abuse logs.
- **No deletion in v1** — MSG-04 requires the full log. At most, hide a thread from one's own inbox without deleting data.

### Rate limiting & anti-spam
- New contact forms (new threads): **~10 per buyer per day**.
- In-chat messages: **soft burst limit ~20 messages/minute per user** — invisible in normal use, stops bots/flooding.
- Limit-hit UX: **clear, honest message with timeframe** — e.g. "You've reached the daily contact limit. Try again tomorrow."
- **No automatic content filtering in v1** (no link/phone/profanity blocking — sharing contact info is the legitimate off-platform flow). Report + abuse log + Phase 10 admin queue cover abuse.

### Reporting (MSG-07)
- Report form: **predefined reasons dropdown** (Scam/Fraud, Harassment, Spam, Prohibited item, Wrong info, Other) **+ optional free-text detail**. Structured for Phase 10 triage.
- Placement: **kebab/⋯ contextual menu** on listing page, each comment, and each chat message with a "Report" action.
- Post-report: **confirmation toast only** — "Report submitted — our team will review it." No report-status tracking in v1 (review queue is Phase 10).
- Anti-abuse: **one report per user per item + general rate limit** on reports.

### Admin copy (MSG-03)
- **DB row is the source of truth** (`contact_log`, read by Phase 10 console) **+ immediate email to admin** — visibility from day 1 without waiting for Phase 10.
- Admin email includes **full context**: form data (name, email, phone, message), buyer & seller usernames, listing, timestamp. Admin is trusted and sees PII by design for disputes.
- Admin destination: **`ADMIN_NOTIFICATIONS_EMAIL` env var** — stakeholder's inbox today, ops inbox later without code changes.
- **Reports also trigger an admin email** (same DB-row + email mechanism) — an unseen scam report pre-Phase-10 is dangerous.

### Claude's Discretion
- Exact rate-limit numbers/windows (anchor to ~10 new threads/day, ~20 msgs/min) and reuse of the project's existing rate-limiting pattern
- Modal vs page fallback details, loading/skeleton states, exact spacing/typography
- Empty-state styling (follow existing feed/garage empty-state patterns); copy anchor: "No messages yet. When you contact a seller — or a buyer contacts you — conversations appear here." + "Browse parts" CTA
- Exact email templates/subject lines (within the decided tone and content rules)
- Message character limit value
- How "hide thread from inbox" is modeled (if implemented)

</decisions>

<specifics>
## Specific Ideas

- Email tone example given: "BigRigBob is asking about your Peterbilt hood" — platform speaks plainly, no corporate boilerplate.
- All UI copy in English (NA trucker market) — established project rule.
- Chat schema must keep the future move to Realtime Broadcast-from-trigger non-breaking (ROADMAP note).

</specifics>

<deferred>
## Deferred Ideas

- Photos/attachments in chat — would require routing through the EXIF-safe pipeline; revisit post-v1
- Report status tracking for reporters ("your report was actioned") — Phase 10+
- Notification digest scheduling (batched emails) — post-v1 if throttle proves noisy
- Archive threads (beyond simple hide) — backlog

</deferred>

---

*Phase: 09-contact-private-chat*
*Context gathered: 2026-06-11*
