---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
last_updated: "2026-06-04T20:05:00.000Z"
progress:
  total_phases: 11
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed.
**Current focus:** Phase 4 — My Garage is **COMPLETE** (3/3 plans). Plan 04-01 laid the data + contract foundation (`garage_trucks` owner-scoped table + RLS, shared `truckSchema`, `listMyTrucks()`). Plan 04-02 added the write trust boundary (`addTruck`/`updateTruck`/`deleteTruck`). Plan 04-03 shipped the user-facing UI — `/profile/garage` (card grid + actionable empty state), the Make→Model→Config + **required Year** + nickname cascade dialog (library-only, edit pre-filled), AlertDialog-confirmed delete with instant `router.refresh()`, and the skippable post-registration dashboard banner. The live flow was **user-approved at the human-verify checkpoint**, and the user added a **required `year`** which was threaded end-to-end (migration `0005_garage_year.sql` — smallint NOT NULL + CHECK 1970..2027 + per-(user,model,config,year) uniqueness; schema; both actions; the `GarageTruck` read contract; the form Select + card label). tsc clean; build green; full suite green (15 files, 79 passed, 1 skipped). Next: Phase 5 (Listings/Photos/EXIF).

## Current Position

Phase: 4 of 11 (My Garage) — COMPLETE (3/3)
Plan: 04-03 done (3/3) — Phase 4 closed
Status: 04-03 complete & committed — the full My Garage UI plus a user-approved scope addition (required `year`). `/profile/garage` is a force-dynamic owner-scoped page (card grid or actionable empty state) reading via `listMyTrucks()`; the Add/Edit dialog wraps a dependent Make→Model→Config cascade (configs scoped through `model_configurations`, never the full master) + a **required Year Select (2027..1970)** + optional nickname (RHF + `zodResolver(truckSchema)`); edit reuses the dialog controlled + pre-filled; submit calls `addTruck`/`updateTruck` in `startTransition`, toasts, and `router.refresh()`-es so cards update instantly; delete is AlertDialog-confirmed → `deleteTruck` → refresh; typed action errors map to friendly copy (`invalid_combo` = "Missing your truck?"). A skippable dashboard banner shows ONLY at 0 trucks (localStorage dismiss, no server flag, never blocks; registration untouched). The live flow was **user-approved at the human-verify checkpoint**, then the user required a `year`: migration `0005_garage_year.sql` adds `year smallint NOT NULL` (backfilled the 2 Staging dev rows to a placeholder, then SET NOT NULL) + CHECK `year between 1970 and 2027`, and drops/recreates `garage_trucks_uniq` to key on `(user_id, model_id, coalesce(config_id,0), year)` (same model/config different year = distinct). Year is threaded through `truckSchema`, both write actions, the `GarageTruck` read contract, and the UI (form Select + edit pre-fill + year-led card label). Applied + verified on Staging. tsc clean; build green; full suite green: 15 files, 79 passed, 1 skipped — no regression. Year commits: dc7ee35 (migration 0005), 7e1862b (schema/actions/queries), a902f95 (UI), 20482c7 (tests). GRGE-01/02 done.
Last activity: 2026-06-04 — Plan 04-03 shipped the My Garage UI + required-year scope addition; Phase 4 complete. Next: Phase 5 (Listings/Photos/EXIF).

Progress: [██████████] 100% (3/3 plans in Phase 4 — phase complete)

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
| Phase 04-my-garage P01 | 4min | 3 tasks | 5 files |
| Phase 04-my-garage P02 | ~2min | 2 tasks | 1 files |
| Phase 04-my-garage P03 | ~25min | 4 tasks (3 auto + checkpoint) | 14 files |

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
- [Phase 04-my-garage]: [DB] garage_trucks is the first owner-scoped read+write authenticated table: 4 owner policies (S/I/U/D) all (select auth.uid()) = user_id, NO anon policy, NO SECURITY DEFINER; RLS owner-only IS the Phase-4 privacy gate (proven by garage.test.ts: anon SELECT 0 rows + anon INSERT denied).
- [Phase 04-my-garage]: [DB] Stores model_id + nullable config_id (make derived via models.make_id, no make_id column); config_id NULL = model-level truck; coalesce(config_id,0) unique index dedupes per user incl. NULL arm; on delete cascade(user)/restrict(model,config).
- [Phase 04-my-garage]: [Contract] listMyTrucks()/GarageTruck is the stable owner-scoped read surface P6/P7 import (joins only fitment names, never profiles_*); config_id NULL => filter at MODEL granularity is the documented GRGE-03/04 rule. No default/active-truck concept (explicit selector at filter time).
- [Phase 04-my-garage]: [Trust] lib/actions/garage.ts (addTruck/updateTruck/deleteTruck) is the GRGE-01/02 write trust boundary: getClaims identity (never getSession), re-validates the SAME truckSchema AND re-checks model_configurations applicability server-side (combo check fires only when configId != null so config-NULL model-level trucks stay valid), through the cookie-client owner RLS with NO admin/service-role client (the 4 owner policies ARE the authorization boundary).
- [Phase 04-my-garage]: [Trust] not_found is derived from zero-rows-affected under owner RLS (.select('id') after update/delete returns [] when the row isn't the caller's) — non-owner and nonexistent collapse to one typed error, leaking no existence info. 23505 -> typed 'duplicate'. Soft cap (GARAGE_SOFT_CAP=20) is a tunable server-side RLS-scoped count guard, not a DB constraint.
- [Phase 04-my-garage]: [Scope/UX] A garage truck REQUIRES a model/manufacture `year` (user decision, added at the 04-03 human-verify checkpoint after the live flow was approved). Year is a shadcn Select (2027..1970), pre-filled on edit, and leads the card label (e.g. "2019 Peterbilt 379"); threaded end-to-end through truckSchema (z.coerce.number().int().min(1970).max(2027)), addTruck/updateTruck payloads, and the listMyTrucks()/GarageTruck read contract (extended, not broken — P6/P7 now also receive year).
- [Phase 04-my-garage]: [DB] Year added via NEW migration 0005_garage_year.sql (0004 already on Staging, never edited): add smallint, backfill existing rows to placeholder, SET NOT NULL, CHECK year between 1970 and 2027. Year is now a distinguishing attribute, so per-user uniqueness was changed — dropped garage_trucks_uniq and recreated it on (user_id, model_id, coalesce(config_id,0), year): same model/config of a different year are legitimately distinct trucks. Applied non-destructively via `supabase db query --linked -f`.

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
Stopped at: **04-03 COMPLETE — Phase 4 CLOSED (3/3 plans).** Shipped the full user-facing My Garage UI and a user-approved required `year`. `/profile/garage` (force-dynamic, getClaims gate, `listMyTrucks()` read) renders a card grid or an actionable empty-state CTA; the Add/Edit dialog wraps a dependent Make→Model→Config cascade (configs scoped THROUGH `model_configurations`, never the full master) + a **required Year Select (2027..1970)** + optional nickname (RHF + `zodResolver(truckSchema)`); edit reuses the dialog controlled + pre-filled (incl. makeId derivation + dependent-list preload); submit calls `addTruck`/`updateTruck` inside `startTransition`, toasts (sonner), and `router.refresh()`-es the force-dynamic page so cards update instantly; delete is AlertDialog-confirmed → `deleteTruck` → toast + refresh; typed action errors map to friendly copy (`invalid_combo` = "Missing your truck?", `duplicate`, `cap_reached`, `not_found`). A skippable, dismissible dashboard banner shows ONLY at 0 trucks (localStorage dismiss via useSyncExternalStore, no server flag, never blocks; `handle_new_user`/registration untouched). The live flow was **user-approved at the human-verify checkpoint**; the user then required a `year`, threaded end-to-end: migration `0005_garage_year.sql` adds `year smallint NOT NULL` (backfilled the 2 Staging dev rows to placeholder 2000, then SET NOT NULL) + CHECK `year between 1970 and 2027`, and drops/recreates `garage_trucks_uniq` to key on `(user_id, model_id, coalesce(config_id,0), year)`; `truckSchema.year` (`z.coerce.number().int().min(1970).max(2027)`); `year` in both write actions; `year` in the `listMyTrucks()` select + `GarageTruck` type; the form Year Select (pre-fill on edit) and a year-led card label. Applied + verified on Staging (year NOT NULL, CHECK present, uniqueness includes year, old index gone). tsc clean; `npm run build` green; full suite green: 15 files / 79 passed, 1 skipped — no Phase 1-3 regression. Year commits: dc7ee35 (migration 0005), 7e1862b (schema/actions/queries), a902f95 (UI), 20482c7 (tests); Tasks 1-3 UI/banner/shadcn committed in the prior 04-03 session. `04-03-SUMMARY.md` written; STATE + ROADMAP updated; GRGE-01/02 confirmed complete. Next: Phase 5 (Listings/Photos/EXIF — note the EXIF strip-and-re-encode "looks done but isn't" trap flagged for deeper research).
Previous session: 2026-06-04 — **04-02 COMPLETE — Phase 4 at 2/3 plans.** `lib/actions/garage.ts` ships the three owner-scoped write Server Actions (the GRGE-01/02 trust boundary): `addTruck(input)→AddTruckResult{ok,id|error}`, `updateTruck(id,input)→UpdateTruckResult`, `deleteTruck(id)→DeleteTruckResult`. Each derives identity via getClaims() (NEVER getSession), re-validates the shared `truckSchema`, and writes through the cookie-bound user client so the 4 owner policies on `garage_trucks` scope the mutation. add/update re-check `model_configurations` applicability server-side (only when configId set — drives the "Missing your truck?" affordance for config-NULL model-level trucks staying valid); soft cap via `GARAGE_SOFT_CAP=20` (RLS-scoped count head:true); `23505 → duplicate`; zero-rows-affected → `not_found`; empty nickname → NULL; explicit `user_id`. NO admin/service-role client. Commits: 1ca0dec, 40096e4.
Previous session: 2026-06-04 — **04-01 COMPLETE — Phase 4 opened (1/3 plans).** Migration `0004_garage.sql` ships `garage_trucks`, the project's first owner-scoped read+write `authenticated` table: model_id (not null, restrict) + nullable config_id (restrict, NULL = model-level), user_id (uuid, cascade), nickname (≤40 CHECK); user_id index + coalesce(config_id,0) per-user unique index; RLS in-migration with 4 owner policies (S/I/U/D) all `(select auth.uid()) = user_id`, NO anon policy, NO SECURITY DEFINER. Applied to Staging via `db query --linked -f` (verified: RLS on, 4 policies, 3 indexes). Also shipped `lib/garage/schema.ts` (shared truckSchema — model required, config optional/nullable, nickname ≤40, coerces string ids) and `lib/garage/queries.ts` (`listMyTrucks(): Promise<GarageTruck[]>` — the stable P6/P7 read contract via the cookie client, joins ONLY fitment names, documents config-NULL ⇒ model granularity, no default-truck concept). Wave-0 tests: `tests/integration/garage.test.ts` (anon RLS gate — anon SELECT 0 rows + anon INSERT denied, mirrors rls.test.ts; ran live 9/9 with the unit file) + `tests/unit/garage-schema.test.ts`. Full suite green: 15 files / 77 passed, 1 skipped — no Phase 1-3 regression. Commits: a41f263 (migration), a932966 (schema+queries), e758596 (tests). `04-01-SUMMARY.md` written; STATE + ROADMAP updated; GRGE-01..04 marked complete. Next: Plan 04-02 (garage add/edit/delete Server Actions reusing truckSchema + server-side model_configurations applicability re-check).
Previous session: 2026-06-04 — **03-03 COMPLETE — Phase 3 closed.** Created `tests/integration/fitment.test.ts` mirroring rls.test.ts (8 tests, live against Staging): 10-table anon-read + anon-write-deny, seed presence, and the gated every-slang-term-resolves assertion (orphan set EMPTY). Full suite 13 files / 68 passed, 1 skipped. Commits: 183fb10, 8ccce74.
Previous session: 2026-06-04 — **03-02 COMPLETE.** User reviewed/approved the AI-generated seed; applied `supabase/seed.sql` to Staging non-destructively via `supabase db query --linked -f`, re-ran for idempotency, the `do $$` integrity assertion did not raise. All 10 tables anon-seeded (makes=2, models=17, configurations=9, model_configurations=44, search_terms=32, search_term_targets=40, part_categories=45, materials=8, conditions=8, special_filters=8), 0 dangling. Commits: 9a4fe4a, 73f3e92, 2cf2694, 97a3803.
Earlier session: Completed 03-01-PLAN.md — opening Phase 3 (1/3 plans). Migration `0003_fitment_taxonomy.sql` ships the full 8-level fitment schema as reference tables: `makes→models→configurations` (configurations a shared master) + `model_configurations` applicability join; the slang link `search_terms` (citext unique) + `search_term_targets` (3 nullable FKs + `num_nonnulls=1` CHECK + idempotent unique index); flat `part_categories` (self-ref tree), `materials`, `conditions`, `special_filters`. Every table: RLS in-migration, one anon+authenticated SELECT policy, no write policy. Applied to Staging via `supabase db push`; all 10 tables anon-readable, anon INSERT blocked. Commits: 43367a1 (hierarchical core), d7fddbf (slang arc + L5–L8). Next: Plan 03-02 (seed.sql — the real fitment data), then 03-03 (tests).
Resume file: None
