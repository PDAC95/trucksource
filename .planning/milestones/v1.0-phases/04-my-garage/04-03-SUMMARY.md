---
phase: 04-my-garage
plan: 03
subsystem: ui
tags: [nextjs, react, shadcn, radix, rhf, zod, supabase, rls, garage, fitment]

# Dependency graph
requires:
  - phase: 04-my-garage
    plan: 01
    provides: garage_trucks (owner-scoped table + RLS) + shared truckSchema (Zod) + listMyTrucks()/GarageTruck read contract + cascade option readers (getModels/getConfigs)
  - phase: 04-my-garage
    plan: 02
    provides: addTruck/updateTruck/deleteTruck owner-scoped Server Actions + typed result unions (invalid_combo/duplicate/cap_reached/not_found)
  - phase: 03-fitment-taxonomy-slang-library
    provides: makes/models/configurations/model_configurations anon-public reference tables driving the dependent cascade
  - phase: 02-verified-seller-phone-otp
    provides: the repo client-form idiom (RHF + zodResolver + startTransition + sonner toast + router.refresh()) reused by the cascade dialog
provides:
  - /profile/garage — force-dynamic owner-scoped page (card grid or actionable empty state)
  - the Add/Edit cascade dialog (Make -> Model -> Config + REQUIRED Year + nickname, library-only)
  - confirmed (AlertDialog) delete + instant router.refresh() feedback
  - skippable post-registration garage banner on the (app) dashboard (shown only at 0 trucks)
  - REQUIRED year end-to-end (migration 0005, schema, actions, read contract, UI) + per-(user,model,config,year) uniqueness
affects: [05-listings, 06-fitment-intelligence, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependent cascade form: Make (local state, drives fetches) -> Model/Config via server option readers scoped through model_configurations; Year + Config are shadcn Selects; all values RHF + zodResolver(truckSchema)"
    - "Edit reuses the add dialog in controlled-open mode with defaultValues pre-fill (incl. makeId derivation + dependent-list preload)"
    - "Year as a real distinguishing attribute: per-user uniqueness keys on (user_id, model_id, coalesce(config_id,0), year) — same model/config different year are distinct trucks"

key-files:
  created:
    - supabase/migrations/0005_garage_year.sql
    - app/(app)/profile/garage/page.tsx
    - app/(app)/profile/garage/truck-cascade.tsx
    - app/(app)/profile/garage/add-truck-dialog.tsx
    - app/(app)/profile/garage/truck-card.tsx
    - app/(app)/garage-banner.tsx
    - components/ui/dialog.tsx
    - components/ui/alert-dialog.tsx
    - components/ui/card.tsx
  modified:
    - lib/garage/schema.ts
    - lib/actions/garage.ts
    - lib/garage/queries.ts
    - app/(app)/page.tsx
    - tests/unit/garage-schema.test.ts

key-decisions:
  - "[Scope] Year is REQUIRED on a garage truck (user decision at the 04-03 checkpoint). Added end-to-end across all 5 layers AFTER the live-flow checkpoint was approved."
  - "[DB] Year added via NEW migration 0005 (0004 already on Staging, never edited): add smallint, backfill the 2 existing dev rows to placeholder 2000, then SET NOT NULL; CHECK year between 1970 and 2027 (heavy-truck plausible, 2027 = current+1)."
  - "[DB] Per-user uniqueness now includes year: dropped garage_trucks_uniq (user_id, model_id, coalesce(config_id,0)) and recreated WITH year — two same-model/config trucks of different years are legitimately distinct."
  - "[UI] Year is a shadcn Select (2027..1970) to match the make/model/config Radix-Select idiom; pre-filled on edit; year leads the card fitment label (e.g. \"2019 Peterbilt 379\")."
  - "[UI] Cascade only offers library-valid Make->Model->Config (configs scoped through model_configurations); typed action errors map to friendly copy (invalid_combo = the Missing-your-truck affordance)."

patterns-established:
  - "Owner-scoped force-dynamic page reads via the stable listMyTrucks() contract; all mutations through the Wave-2 actions inside the client dialog/card; router.refresh() re-runs the read so cards update instantly."
  - "New column on an already-applied table => new migration with backfill-then-SET-NOT-NULL, applied non-destructively via supabase db query --linked -f (never db reset)."

requirements-completed: [GRGE-01, GRGE-02]

# Metrics
duration: ~25min
completed: 2026-06-04
---

# Phase 4 Plan 03: My Garage UI + Required Year Summary

**The full user-facing My Garage — /profile/garage (card grid + actionable empty state), the Make->Model->Config + REQUIRED Year + nickname cascade dialog (library-only, edit pre-filled), AlertDialog-confirmed delete with instant router.refresh(), and the skippable post-registration dashboard banner — plus a post-checkpoint scope addition that threaded a mandatory model year end-to-end (migration 0005, schema, actions, read contract, UI) with per-(user,model,config,year) uniqueness.**

## Performance

- **Duration:** ~25 min (Tasks 1-3 + checkpoint executed in the prior session; this session added the approved year scope-change end-to-end and finalized)
- **Completed:** 2026-06-04
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint, approved) + the year scope-addition
- **Files modified:** 14 (9 created, 5 modified)

## Accomplishments
- `/profile/garage`: force-dynamic Server Component, getClaims gate, `listMyTrucks()` read, makes loaded for the cascade; renders a responsive card grid or an actionable empty-state CTA.
- Add/Edit cascade dialog: dependent Make -> Model -> Config (configs scoped through `model_configurations`, never the full master) + **required Year Select** + optional nickname, RHF + `zodResolver(truckSchema)`; edit reuses the dialog controlled + pre-filled; submit calls `addTruck`/`updateTruck` in `startTransition`, toasts, and `router.refresh()`-es so the card appears instantly.
- Confirmed delete (shadcn AlertDialog) -> `deleteTruck` -> toast + refresh. Typed action errors map to friendly copy (`invalid_combo` = "Missing your truck?", `duplicate`, `cap_reached`, `not_found`).
- Skippable, dismissible dashboard banner shown ONLY at 0 trucks (localStorage dismiss, no server flag, never blocks; registration untouched).
- **Required year shipped end-to-end:** migration `0005_garage_year.sql` (smallint NOT NULL + CHECK 1970..2027 + uniqueness now keys on year, applied + verified on Staging); `truckSchema.year` (`z.coerce.number().int().min(1970).max(2027)`); `year` in `addTruck`/`updateTruck` payloads; `year` in `listMyTrucks()` select + `GarageTruck` type; Year Select in the form (pre-fill on edit) and year leading the card label.
- Human-verify checkpoint of the live flow was **approved** by the user. tsc clean; `npm run build` green; full suite green: 15 files / 79 passed (+2 year tests), 1 skipped — no Phase 1-3 regression.

## Task Commits

Tasks 1-3 (UI + banner + shadcn primitives) and the checkpoint were completed in the prior session. The approved scope-change (required year) was committed this session:

1. **Migration 0005: required year column + per-year uniqueness** - `dc7ee35` (feat)
2. **Thread year through schema, actions, read contract** - `7e1862b` (feat)
3. **Year Select in form + year in card label + edit pre-fill** - `a902f95` (feat)
4. **Unit test coverage for required year (range/coercion/missing)** - `20482c7` (test)

_(Tasks 1-3 of the plan body — the cascade, page/dialog/card, and banner — and the shadcn dialog/alert-dialog/card installs were committed in the prior 04-03 execution session before the checkpoint.)_

## Files Created/Modified
- `supabase/migrations/0005_garage_year.sql` - add `year smallint NOT NULL` (backfill placeholder -> SET NOT NULL), CHECK 1970..2027, drop+recreate `garage_trucks_uniq` including year. Applied + verified on Staging.
- `lib/garage/schema.ts` - added required `year` to `truckSchema`.
- `lib/actions/garage.ts` - `year` threaded into `addTruck`/`updateTruck` insert/update payloads.
- `lib/garage/queries.ts` - `year` added to the select, the row type, and the `GarageTruck` read contract.
- `app/(app)/profile/garage/page.tsx` - force-dynamic page, card grid / empty state.
- `app/(app)/profile/garage/truck-cascade.tsx` - dependent cascade + required Year Select.
- `app/(app)/profile/garage/add-truck-dialog.tsx` - add/edit dialog; passes `truck.year` to edit defaults.
- `app/(app)/profile/garage/truck-card.tsx` - card with year-led fitment label, edit, confirmed delete.
- `app/(app)/garage-banner.tsx` - skippable dashboard invitation.
- `app/(app)/page.tsx` - renders the banner only at 0 trucks.
- `components/ui/{dialog,alert-dialog,card}.tsx` - shadcn primitives.
- `tests/unit/garage-schema.test.ts` - year coverage (required, range, coercion, missing).

## Decisions Made
- Year is REQUIRED (user decision at the checkpoint) — added across all 5 layers after the live-flow approval.
- New migration (0005), not an edit of the applied 0004; backfill-then-SET-NOT-NULL for the 2 existing Staging dev rows.
- Per-user uniqueness now keys on year — same model/config different year are distinct trucks (old `garage_trucks_uniq` dropped and recreated including year).
- Year rendered as a shadcn Select (idiom-consistent with make/model/config) and leads the card label.

## Deviations from Plan

### Scope addition (user-approved at checkpoint)

**1. [User decision] Required `year` field added end-to-end**
- **Found during:** Task 4 (human-verify checkpoint) — the user approved the live flow but added a required model/manufacture year before finalizing.
- **Change:** Added a mandatory `year` to garage trucks across DB (migration 0005), shared Zod schema, both write actions, the read contract, and the UI (form Select + edit pre-fill + card label); per-user uniqueness extended to include year.
- **Files modified:** `supabase/migrations/0005_garage_year.sql`, `lib/garage/schema.ts`, `lib/actions/garage.ts`, `lib/garage/queries.ts`, `app/(app)/profile/garage/truck-cascade.tsx`, `app/(app)/profile/garage/add-truck-dialog.tsx`, `app/(app)/profile/garage/truck-card.tsx`, `tests/unit/garage-schema.test.ts`
- **Verification:** Staging shows `year` NOT NULL, CHECK 1970..2027 present, `garage_trucks_uniq` now includes year (old index gone); tsc clean; build green; full suite 79 passed / 1 skipped.
- **Committed in:** `dc7ee35`, `7e1862b`, `a902f95`, `20482c7`

---

**Total deviations:** 1 user-approved scope addition (required year).
**Impact on plan:** No scope creep beyond the user's explicit request; all existing must-haves still hold (cascade library-only, instant refresh, skippable banner, owner-only privacy).

## Issues Encountered
- The pre-commit lint-staged hook reported "could not find any staged files matching configured tasks" for the `.sql` migration (known deferred item: `*.sql` not in the lint-staged glob). No impact — commit succeeded and the SQL was applied/verified on Staging.
- `supabase db query --linked` only returns the LAST statement's rows, so each verification (column / CHECK / index) was queried separately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 (My Garage) is COMPLETE (3/3 plans). GRGE-01 (add, optional) and GRGE-02 (view/edit/remove) are real for the user, the live flow is user-approved, and trucks now carry a required year.
- `listMyTrucks()`/`GarageTruck` (now including `year`) is the stable owner-scoped read contract for Phase 6 (seller pre-fill) and Phase 7 ("fits my truck" filter) — extended, not broken.

## Self-Check: PASSED

All key files exist on disk; the 4 year-change commits (dc7ee35, 7e1862b, a902f95, 20482c7) exist in git history; migration 0005 applied + verified on Staging (year NOT NULL, CHECK present, uniqueness includes year); tsc clean; build green; full suite 79 passed / 1 skipped.

---
*Phase: 04-my-garage*
*Completed: 2026-06-04*
