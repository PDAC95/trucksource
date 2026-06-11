# Phase 10: Admin Operations & Analytics - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators can run and measure the marketplace: a service-role-isolated admin console managing users, listings, abuse reports (with enforcement), messages/contact logs, part categories, and the full fitment library — plus an analytics dashboard (registered/active users, active and most-viewed listings, most-searched makes/models, messages sent, monthly growth) and the bulk-onboarding (CSV import) tooling that mitigates two-sided cold start.

Requirements: ADMO-01..06, ADMA-01..04. Cross-cutting gate: service-role client isolated to one `server-only` module; key never reaches the client bundle (CI scan).

</domain>

<decisions>
## Implementation Decisions

### Enforcement & report queue
- Full enforcement ladder: warn → hide listing → temporary suspension → permanent ban
- Affected user is notified by email with the reason / rule violated on every enforcement action
- Queue workflow: simple states — Pending → Resolved/Dismissed, with an admin note; filterable by state and type
- Multiple reports on the same listing/user are grouped into one queue entry with a report counter; one action resolves all of them

### Message / contact-log monitoring
- Default visibility is metadata only (who with whom, when, message counts); full thread content opens only when there is a report on that thread
- Contact logs: full searchable/filterable table (buyer, seller, listing, date, initial message) — this is the admin copy already persisted by design
- Every admin access to thread content is recorded in an audit log (who, when, which report justified it)
- Admin can close/freeze a problematic thread so no one can write further (in addition to user/listing enforcement actions)

### Analytics dashboard
- Layout: KPI cards on top (users, active listings, messages, growth %) with trend charts and rankings (most-searched, most-viewed) below
- Time ranges: preset selector 7 / 30 / 90 days + all time (no free date pickers in v1)
- "Active user" = any login within the last 30 days (classic MAU)
- Data freshness (live queries vs pre-aggregation): Claude's discretion — live queries likely fine at launch volume

### Admin access & console structure
- Admin designated by a manual flag in the DB (column/script); no admin-management UI in v1
- Single admin role with full console access; granular roles (moderator/analyst) deferred to v2
- Navigation: fixed sidebar — Dashboard (analytics), Users, Listings, Reports, Messages, Categories, Fitment Library
- Bulk onboarding via CSV import (see below)

### Fitment library management
- Full CRUD + activate/deactivate per taxonomy level (makes, models, configs, terms, categories, materials, conditions, filters); hard delete only allowed when nothing references the value
- Deactivating/removing a value leaves existing listings intact (still visible/searchable with the old value); only new listings can't pick it
- Slang terms / `search_synonyms`: full CRUD inside the Fitment Library section (term → canonical table) — adding new trucker slang is a frequent op
- Whether part categories live inside Fitment Library or as their own sidebar section: Claude's discretion (categories are level 5 of the taxonomy — likely together)

### Admin scope over users/listings
- Listings: moderate only — hide/restore listings and remove individual rule-violating photos; admin never rewrites seller content (title, description, price)
- Users: admin can rename offensive usernames and change account state (suspend/ban/reactivate); never edits private PII; password reset stays self-service via Supabase
- Admin user detail view DOES show private PII (real name, email, phone) — needed for support/verification; console is service-role + server-only so the public privacy model is untouched
- Unified audit log: every admin action (hide, suspend, rename, taxonomy edits, chat-content access) recorded with who/what/when in one audit table

### Suspensions
- Duration: admin picks from presets — 24h / 7 days / 30 days; auto-reactivates on expiry
- Suspended user can log in but the whole app shows a blocked page: "Account suspended until [date] — reason: [X]"; cannot operate
- Suspended user's listings hidden from public while suspension lasts, restored on reactivation; banned user's listings hidden permanently (data retained, not deleted)
- Suspended user's chats: read-only — can view conversations but cannot send; counterpart sees the thread normally

### CSV bulk import
- Listings assigned to real registered seller accounts: each CSV row references the owning seller's username/email (e.g. yards handing over inventory); contact flows normally to them
- Photos via URLs in CSV columns; server downloads, re-encodes with sharp (EXIF strip mandatory — same privacy pipeline as regular uploads), and stores in Supabase Storage
- Per-row validation: valid rows import, failed rows reported with reason at the end so only those get fixed and re-uploaded
- Imported listings land as drafts; admin reviews and bulk-publishes with one click

### Claude's Discretion
- Analytics data freshness strategy (live vs pre-aggregated)
- Where part-categories management lives in the nav (own section vs inside Fitment Library)
- CSV column schema, parsing library, batch size, and import progress UI
- Audit log table design and retention
- Exact chart library/components and dashboard skeleton/loading states

</decisions>

<specifics>
## Specific Ideas

- Privacy pillar extends into ops: admin reads private chat content only under a report, and every such access is itself audited
- Enforcement should feel proportional (ladder), with email transparency on every action — the stakeholder consistently favors trust-building defaults
- The marketplace's seeded inventory must look native: CSV-imported listings belong to real seller accounts so the contact → chat flow works unchanged

</specifics>

<deferred>
## Deferred Ideas

- Granular admin roles (moderator, analyst) — v2 if a team grows
- Admin-management UI (promote/demote admins from the console) — v2; v1 uses a DB flag
- Appeals flow for suspensions/bans — not discussed as v1; revisit post-launch
- Free date-range picker and data export on analytics — v2

</deferred>

---

*Phase: 10-admin-operations-analytics*
*Context gathered: 2026-06-11*
