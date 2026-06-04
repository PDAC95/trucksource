---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: phase-complete
last_updated: "2026-06-04T17:43:04.125Z"
progress:
  total_phases: 11
  completed_phases: 3
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed.
**Current focus:** Phase 3 — Fitment Taxonomy & Slang Library is **COMPLETE** (3/3 plans). Plan 03-01 shipped the 8-level fitment schema as reference tables; Plan 03-02 seeded the reviewed launch dataset (Peterbilt+Kenworth makes, 17 iconic models, 9 shared configs + 44 applicability links, a 45-node part_categories tree, L6–L8 dimensions, and a 32-term trucker-slang dictionary where every term arc-resolves to a real entity — 0 dangling), applied to Staging idempotently; Plan 03-03 added `tests/integration/fitment.test.ts` — the CI gate (8 tests) proving all 10 tables anon-readable + anon-write-denied, the launch data seeded, and EVERY slang term resolves (zero orphans), with the full suite green (68 passed) so Phase 3 did not regress the Phase 1-2 privacy/RLS gates. Next: Phase 4 — My Garage.

## Current Position

Phase: 3 of 11 (Fitment Taxonomy & Slang Library) — COMPLETE
Plan: 03-03 done (3/3) — Phase 3 closed
Status: 03-03 complete & committed — `tests/integration/fitment.test.ts` is the CI gate for Phase 3, mirroring rls.test.ts (node env, `INTEGRATION_ENABLED` self-skip, `anonClient`). 8 tests, all green against Staging: (1) all 10 reference tables anon-readable; (2) anon INSERT into a reference table denied (service-role-only writes); (3) seed presence — Peterbilt/Kenworth + models (W900/379) + configs (Aerodyne) + non-empty applicability join + L5–L8 dimensions + a categories tree with both a top-level and a child; (4) THE gated deliverable — the orphan-term set (search_terms with no search_term_targets, computed client-side from two anon SELECTs) is EMPTY, the 5 doc-cited terms present, and the exclusive arc holds (exactly one of make/model/config per target). Full suite green: 13 files, 68 passed, 1 skipped — no Phase 1-2 privacy/RLS regression. Commits: 183fb10 (test file, Tasks 1+2), 8ccce74 (full-suite-green record, Task 3). 03-02 commits: 9a4fe4a, 73f3e92, 2cf2694, 97a3803. 03-01 commits: 43367a1, d7fddbf.
Last activity: 2026-06-04 — Plan 03-03 added the fitment CI gate; Phase 3 complete. Next: Phase 4 — My Garage.

Progress: [██████████] 100% (3/3 plans in Phase 3 — phase complete)

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
| Phase 03-fitment-taxonomy-slang-library P01 | ~3min | 3 tasks | 1 files |
| Phase 03-fitment-taxonomy-slang-library P02 | ~2min | 4 tasks | 2 files |
| Phase 03-fitment-taxonomy-slang-library P03 | ~2min | 3 tasks | 1 files |

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
- [Phase 03-fitment-taxonomy-slang-library]: [DB] configurations is a SHARED MASTER (unique name), not per-model — diverges from ARCHITECTURE.md's configurations.model_id by decision; applicability lives in model_configurations so search_term_targets.config_id resolves to one canonical row
- [Phase 03-fitment-taxonomy-slang-library]: [DB] Slang link is an exclusive-arc polymorphic FK: search_term_targets has 3 nullable FKs (make/model/config) + exactly_one_target CHECK num_nonnulls=1; never a target_type/target_id discriminator — real FKs guarantee the target entity exists (RESEARCH Pitfall 1). citext term + coalesce(...,0) unique index make the seed idempotent
- [Phase 03-fitment-taxonomy-slang-library]: [DB] seed.sql is idempotent + FK-by-natural-key (no literal ids); applied to Staging non-destructively via 'supabase db query --linked -f' (NOT db reset --linked); a closing do-block raises if any slang term has zero targets. 32 terms, 0 dangling — all anon-readable across 10 tables.
- [Phase 03-fitment-taxonomy-slang-library]: [Process] AI-generated launch dataset (models/configs/slang) was USER-REVIEWED at the 03-02 human-verify checkpoint and approved as-is, no corrections — the slang→entity mappings are accepted as the launch quality bar.
- [Phase 03-fitment-taxonomy-slang-library]: [Testing] fitment.test.ts is the Phase-3 CI gate (8 tests): 10-table anon-read + anon-write-deny, seed presence, and the gated every-slang-term-resolves assertion (orphan set computed client-side from two anon SELECTs). Mirrors rls.test.ts (node env, self-skip, anonClient). Seed integrity now triple-layered: num_nonnulls CHECK (write) + seed do-block (apply) + read-side anon assertion (CI).

### Pending Todos

- **[Pre-launch] Verify an own/sub-domain in Resend** (e.g. `takeoffparts.com` or `mail.…`) so auth emails reach any recipient, not just the Resend account address. Centralized under the 12GA Customs Resend account (one account, one domain per brand).
- **[Minor] Replace scaffold metadata** in `app/layout.tsx` (`<title>`/description still say "Create Next App") with Take-Off Parts branding. Tracked in `.planning/phases/01-foundation-privacy-model/deferred-items.md`.

### Blockers/Concerns

- [Phase 3] Heavy-truck fitment taxonomy is product-novel (no clean ACES catalog) — schema live (03-01) and the seed now shipped + user-reviewed + applied to Staging (03-02). Seed-quality risk is mitigated for launch (data accepted as-is); the dictionary stays extensible (natural-key, idempotent seed re-runnable to add terms). Residual: real-world slang coverage will need expansion as users surface terms search misses (Phase 7 telemetry).
- [Phase 5] EXIF strip-and-re-encode pipeline is a "looks done but isn't" trap — flagged for deeper research; needs automated no-GPS test.
- [Phase 6] Fitment Intelligence precision/recall is unproven — needs "report wrong fitment" feedback loop live to calibrate.
- [Phase 9] Contact/chat abuse + Realtime Broadcast-from-trigger pattern warrant validation beyond the happy path.
- [Pre-Phase 5] Supabase plan decision (Image Transformations free vs Pro) affects upload pipeline.

## Session Continuity

Last session: 2026-06-04
Stopped at: **03-03 COMPLETE — Phase 3 closed.** Created `tests/integration/fitment.test.ts` mirroring rls.test.ts exactly (node env, `INTEGRATION_ENABLED ? describe : describe.skip`, `anonClient` from `./_supabase`). Two describe blocks / 8 `it`s: (1) all 10 reference tables anon-readable + an anon INSERT into `makes` denied; (2) seed presence (Peterbilt/KW, W900/379, Aerodyne, non-empty model_configurations, L5–L8, a categories tree with a top-level + a child) and THE gated assertion — the orphan-term set computed client-side from two anon SELECTs (search_terms vs search_term_targets) is EMPTY, the 5 doc-cited terms present, exclusive arc holds. Ran live against Staging: 8/8 pass. Full suite: 13 files / 68 passed, 1 skipped — no Phase 1-2 regression. Commits: 183fb10 (test file), 8ccce74 (full-suite-green record). `03-03-SUMMARY.md` written; STATE + ROADMAP updated; FITL-01..08 already complete. Next: Phase 4 — My Garage (plan it).
Previous session: 2026-06-04 — **03-02 COMPLETE.** User reviewed/approved the AI-generated seed; applied `supabase/seed.sql` to Staging non-destructively via `supabase db query --linked -f`, re-ran for idempotency, the `do $$` integrity assertion did not raise. All 10 tables anon-seeded (makes=2, models=17, configurations=9, model_configurations=44, search_terms=32, search_term_targets=40, part_categories=45, materials=8, conditions=8, special_filters=8), 0 dangling. Commits: 9a4fe4a, 73f3e92, 2cf2694, 97a3803.
Earlier session: Completed 03-01-PLAN.md — opening Phase 3 (1/3 plans). Migration `0003_fitment_taxonomy.sql` ships the full 8-level fitment schema as reference tables: `makes→models→configurations` (configurations a shared master) + `model_configurations` applicability join; the slang link `search_terms` (citext unique) + `search_term_targets` (3 nullable FKs + `num_nonnulls=1` CHECK + idempotent unique index); flat `part_categories` (self-ref tree), `materials`, `conditions`, `special_filters`. Every table: RLS in-migration, one anon+authenticated SELECT policy, no write policy. Applied to Staging via `supabase db push`; all 10 tables anon-readable, anon INSERT blocked. Commits: 43367a1 (hierarchical core), d7fddbf (slang arc + L5–L8). Next: Plan 03-02 (seed.sql — the real fitment data), then 03-03 (tests).
Resume file: None
