# Milestones

## v1.0 MVP (Shipped: 2026-06-12)

**Phases completed:** 11 phases (1–10 + inserted 5.1), 57 plans
**Timeline:** 2026-06-01 → 2026-06-12 (12 days)
**Codebase:** ~33.7k LOC TypeScript/TSX + ~3.4k LOC SQL (24 migrations)
**Git range:** `18b65c9` → `a335392` (306 commits)
**Requirements:** 67/67 v1 requirements complete (LIST-08 closed at milestone completion, `a335392`)
**Final UAT:** all 24 stakeholder walkthrough steps passed live on Staging; stakeholder approved 2026-06-12

**Key accomplishments:**

1. **Privacy-by-structure foundation** — `profiles_public` / `profiles_private` table split with RLS default-deny on every table; seller PII (name, phone, email, address) is structurally unexposable on any public surface, verified by contract tests on every phase.
2. **Verified Seller trust signal** — email + Twilio Verify phone OTP + terms acceptance with SMS-pumping defenses (rate limit, spend cap, BotID) and a server-computed badge.
3. **8-level fitment taxonomy + slang library + My Garage** — Make→Model→Config→slang terms→categories→materials→condition→filters as queryable seeded data (plus The Barnyard), powering multi-fit tagging, "fits my truck" filtering, and seller fitment suggestions (Fitment Intelligence, confirm-only).
4. **EXIF-safe listing pipeline** — create/edit/sold/expire(90d, one-click renew) listings with photos re-encoded server-side through sharp (no GPS survives — automated no-GPS regression gate), 3–8 photo publish window (LIST-08).
5. **Slang-tolerant discovery + social layer** — Postgres FTS + pg_trgm search with synonym expansion (admin slang resolves through taxonomy targets), browse feed, public profiles, username-attributed comments, saves, sold states.
6. **Contact→chat trust spine + admin console** — contact form persists + admin-copies BEFORE the private realtime chat opens; reporting everywhere; service-role-isolated admin ops (enforcement ladder, listing moderation, audited message monitoring, fitment CRUD, CSV bulk import through the EXIF gate) + analytics dashboard.

**Known gaps / pre-launch blockers (carried to next milestone):**

- Photo upload via Server Action breaks on Vercel's ~4.5MB prod body cap → switch to signed-URL-direct-to-Storage before launch (+ staging-path orphan cleanup).
- LIST-09 auto-expiry dormant: pg_cron not yet enabled on Staging; CRON_SECRET not set on Vercel (migration 0011 authored, unscheduled).
- Resend SMTP on shared domain; verify own domain before launch. Twilio trial → upgrade + Geo US/CA allowlist.
- Production Supabase project not yet created (all envs → Staging by design).
- UX deferred to redesign phase: sell entry point not in header, stale tabs miss freeze notice until refresh, vitest-* terms pollute Top search terms on Staging.

---
