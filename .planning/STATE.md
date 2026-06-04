---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-06-04T15:41:32.134Z"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 10
  completed_plans: 10
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-06-04T15:33:13.345Z"
progress:
  total_phases: 11
  completed_phases: 2
  total_plans: 10
  completed_plans: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed.
**Current focus:** Phase 2 — Verified Seller / Phone OTP is **COMPLETE** (5/5 plans). The full verified-seller flow ships: privacy-split phone/terms columns + is_verified_seller badge RPC (02-01), pure +1 geo + wizard Zod schemas (02-02), hardened OTP Server Actions + anti-abuse stack (02-03), the resume-on-abandon verification wizard UI (02-04), and the public verified badge (02-05). Next: Phase 3 — Fitment Taxonomy (flagged for /gsd:research-phase; product-novel).

## Current Position

Phase: 2 of 11 (Verified Seller / Phone OTP) — COMPLETE
Plan: 02-01 + 02-02 + 02-03 + 02-04 + 02-05 done (5/5)
Status: 02-04 complete & committed — the force-dynamic /verify wizard (phone → 6-box OTP with live resend countdown + change-number → marketplace terms) derives its step server-side from the user's own profiles_private row, so it resumes on return and never restarts. Verified LIVE end-to-end with Twilio Verify configured on the dev env: real SMS delivered, code + terms accepted, redirected to dashboard; mid-flow resume landed on the OTP step; Staging data confirms phone_verified_at + marketplace_terms_accepted_at SET (terms_version=2026-06-03) and is_verified_seller RPC returns true. Commits: 9ffea5c (page + input-otp), fa18982 (step components), 377edc2 (e2e).
Last activity: 2026-06-04 — Plan 02-04 closed the phase. Wizard is DB-as-state (single source of truth = profiles_private, the same columns the badge reads); client steps advance only via router.refresh() so the force-dynamic server page is the sole step-decider. Deferred (not regressions): BotID is prod-only (untested live locally); /terms link target route still missing (same gap as register form). Twilio trial account sends only to Verified Caller IDs until upgraded.

Progress: [██████████] 100% (5/5 plans in Phase 2)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: ~16 min
- Total execution time: ~0.55 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 (Foundation & Privacy) | 2/5 | ~33 min | ~16 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~25 min), 01-02 (~8 min)
- Trend: faster (migration + tests vs broader scaffolding)

*Updated after each plan completion*

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | ~25 min | 4 | 17 |
| 01-02 | ~8 min | 2 | 5 |
| 01-03 | ~21 min | 2 | 21 |
| 01-04 | ~10 min | 2 | 5 |
| 01-05 | ~18 min | 2 | 2 |
| Phase 02-verified-seller-phone-otp P02 | 3min | 2 tasks | 5 files |
| Phase 02 P01 | ~20 min | 2 tasks | 3 files |
| Phase 02-verified-seller-phone-otp P05 | ~4 min | 2 tasks | 4 files |
| Phase 02-verified-seller-phone-otp P03 | 7min | 3 tasks | 12 files |
| Phase 02-verified-seller-phone-otp P04 | ~35min | 4 tasks | 8 files |
| Phase 02-verified-seller-phone-otp P04 | ~35min | 4 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phase order follows the strict research dependency chain (privacy/RLS → taxonomy → garage → listings → intelligence/search/social/contact → admin).
- [Roadmap]: My Garage added as its own Phase 4 (optional, post-registration; reuses the fitment library); subsequent phases renumbered 5–10.
- [Roadmap]: Privacy/RLS guarantee and server-side EXIF strip are cross-cutting gates re-verified each phase, not standalone phases.
- [Roadmap]: Event logging is instrumented when listings/search ship (P5/P7), not deferred to the Analytics phase (P10).
- [Stack]: Next.js version confirmed as **16** (latest stable) on 2026-06-01, closing the open PROJECT.md "15" call. Scaffolded on 16.2.6 + React 19.2.4.
- [Infra]: Supabase **Staging-first** — Production project deferred to ~launch; all Vercel envs (Dev/Preview/Prod) point at Staging until then. Vercel project is `patricio-durans-projects/trucksource`.
- [Infra]: Pre-commit runs Prettier+ESLint on staged files only (husky+lint-staged); full typecheck + tests + build run in GitHub Actions CI.
- [Infra]: Middleware guards missing Supabase env vars — skips in dev/test, hard-fails in production (a silent unauthenticated app is worse than a loud error).
- [Phase 01-foundation-privacy-model]: [Infra] Supabase Staging email-confirmation gate enabled: Confirm email ON; Site URL http://localhost:3000; redirect allowlist http://localhost:3000/** + https://*-patricio-durans-projects.vercel.app/** (prod origin added at launch)
- [Phase 01-foundation-privacy-model]: [Privacy] 0001_foundation_privacy applied to Staging — privacy is structural (profiles_public/profiles_private split, RLS default-deny, no anon SELECT on private); proven by the PII-keys contract test (column-absence) + RLS test.
- [Phase 01-foundation-privacy-model]: [Testing] Vitest now runs tests/integration/** against Staging with .env.local anon key; the PII denylist lives once in tests/integration/_supabase.ts as the reusable cross-cutting gate.
- [Phase 01-foundation-privacy-model]: [Privacy] active_listing_count(uuid) ships returning 0 in P1; Phase 5 rewrites only its body to count active listings.
- [Phase 01-foundation-privacy-model]: [Public-surface] /u/[username] public profile reads profiles_public ONLY via enumerated columns (zero PII), count derived via active_listing_count RPC (not stored), left cacheable (no force-dynamic) since anon-safe; route-level PII contract test mirrors the page's exact query.
- [Phase 01-foundation-privacy-model]: [Auth] Confirmation gate is structural: getClaims() in the force-dynamic (app) layout redirects to /login when no claims — unconfirmed = no session. Every (app) route inherits the gate; no per-page auth checks.
- [Phase 01-foundation-privacy-model]: [Auth] Forms serialize RHF-validated values into FormData (Radix selects/checkbox don't emit native fields) and dispatch via useActionState; the Server Action re-validates the same Zod schema (trust boundary).
- [Phase 01-foundation-privacy-model]: [Routing] Removed orphaned Phase-0 (public)/page.tsx so the guarded (app) owns / as the authenticated landing (resolved a parallel-route collision).
- [Phase 01-foundation-privacy-model]: [Testing] Phase 1 **fully verified** — the privacy gate is proven structurally (contract/integration tests) AND at runtime (anon /u/<username> view-source has zero PII in HTML + RSC payload, confirmed 2026-06-03).
- [Phase 01-foundation-privacy-model]: [Infra] Supabase **built-in email service is hard-capped at 2 emails/hour and is NOT dashboard-raisable** — Custom SMTP (Resend) was wired on Staging to lift it to 30/h, which unblocked live email verification. Resend SMTP: `smtp.resend.com:465`, user `resend`, sender `onboarding@resend.dev`. The shared `resend.dev` sender only delivers to the Resend account address — a verified own/sub-domain is a pre-launch follow-up.
- [Phase 01-foundation-privacy-model]: [Auth] Supabase email confirmation links use the **PKCE `?code`** flow (not `?token_hash&type`); /auth/confirm must call `exchangeCodeForSession(code)`. Radix interactive components (DropdownMenu) must be `"use client"` to avoid hydration mismatches.
- [Phase 02-verified-seller-phone-otp]: [Verify] Geo gate is a pure local function (toE164Plus1, +1/US-CA only) that runs BEFORE any Twilio call — non-+1 numbers (UK/MX) rejected free; region enforcement is NOT duplicated in the Zod phone field.
- [Phase 02-verified-seller-phone-otp]: [Verify] sendOtpSchema/checkOtpSchema/acceptTermsSchema are the single client+server source of truth; TERMS_VERSION='2026-06-03' stamps the version the user saw onto terms acceptance.
- [Phase 02]: [Privacy] is_verified_seller(uuid) is a recomputed SECURITY DEFINER boolean (no stored is_verified) keyed on email_confirmed_at + phone_verified_at + marketplace_terms_accepted_at; clearing any signal auto-revokes the badge; anon sees only the boolean via RPC (mirrors active_listing_count)
- [Phase 02]: [DB] phone made nullable (registration phone = unverified pre-fill); otp_send_attempts + abuse_events are service-role-only tables (RLS enabled, zero policies = default-deny); badge keys on marketplace_terms_accepted_at, distinct from registration terms_accepted_at
- [Phase 02]: [Privacy] Verified badge (VERF-04) renders from is_verified_seller boolean RPC on /u/[username]; public page reads no PII to render it and stays anon-safe (no force-dynamic), same posture as active_listing_count
- [Phase 02]: [Testing] Privacy contract Layer 3 proves is_verified_seller is anon-callable and yields ONLY a boolean; the badge added no column to profiles_public and the structural PII_KEYS layer still proves phone/PII absent
- [Phase 02]: [Verify] OTP send guard order is the security spine and load-bearing: BotID → getClaims → Zod/+1 geo → rate-limit(phone 3/hr+5/day, parallel per-IP cap) → global spend cap → Twilio. Every guard runs BEFORE the paid send; first failure returns. Spend-cap default 200/day via OTP_SEND_DAILY_CAP env (tunable without redeploy), checked first among counters.
- [Phase 02]: [Verify] Only the abuse store (otp_send_attempts/abuse_events) uses the service-role admin client; all owner PII writes (phone, phone_verified_at, marketplace terms) go through the cookie-bound getClaims user client so owner RLS scopes them. Abuse alerting is best-effort/error-swallowed — the abuse_events row is the durable record, the Resend admin email is opportunistic.
- [Phase 02]: [Infra] botid@1.5.11 moved initBotId to 'botid/client/core' (the 'botid/client' entry is now the <BotIdClient> component). [Testing] 'server-only' is aliased to a no-op stub (tests/stubs/server-only.ts) in vitest.config so server-only lib modules unit-test under jsdom; the real RSC boundary is still enforced at Next build.
- [Phase 02]: [Verify] /verify wizard step is server-derived from profiles_private (force-dynamic) — same columns the badge reads — so the flow resumes on return and never restarts; client steps advance only via router.refresh().

### Pending Todos

- **[Pre-launch] Verify an own/sub-domain in Resend** (e.g. `takeoffparts.com` or `mail.…`) so auth emails reach any recipient, not just the Resend account address. Centralized under the 12GA Customs Resend account (one account, one domain per brand).
- **[Minor] Replace scaffold metadata** in `app/layout.tsx` (`<title>`/description still say "Create Next App") with Take-Off Parts branding. Tracked in `.planning/phases/01-foundation-privacy-model/deferred-items.md`.

### Blockers/Concerns

- [Phase 3] Heavy-truck fitment taxonomy is product-novel (no clean ACES catalog) — flagged for /gsd:research-phase; prototype early.
- [Phase 5] EXIF strip-and-re-encode pipeline is a "looks done but isn't" trap — flagged for deeper research; needs automated no-GPS test.
- [Phase 6] Fitment Intelligence precision/recall is unproven — needs "report wrong fitment" feedback loop live to calibrate.
- [Phase 9] Contact/chat abuse + Realtime Broadcast-from-trigger pattern warrant validation beyond the happy path.
- [Pre-Phase 5] Supabase plan decision (Image Transformations free vs Pro) affects upload pipeline.

## Session Continuity

Last session: 2026-06-04
Stopped at: Completed 02-04-PLAN.md — closing Phase 2 (5/5 plans). The resume-on-abandon /verify wizard (phone → 6-box OTP w/ live resend countdown + change-number → marketplace terms) is live-verified end-to-end with Twilio Verify configured on the dev env: real SMS, code + terms accepted, dashboard redirect; mid-flow resume landed on OTP; Staging confirms phone_verified_at + marketplace_terms_accepted_at SET (terms_version=2026-06-03) and is_verified_seller RPC true. Commits: 9ffea5c (page + input-otp), fa18982 (steps), 377edc2 (e2e). Twilio dev creds (TWILIO_*, OTP_SEND_DAILY_CAP=200, RESEND_API_KEY, ABUSE_ALERT_EMAIL=12gapatricio@gmail.com) now in .env.local — trial account, sends only to Verified Caller IDs until upgraded. Next: Phase 3 (Fitment Taxonomy) — flagged for /gsd:research-phase.
Resume file: None
