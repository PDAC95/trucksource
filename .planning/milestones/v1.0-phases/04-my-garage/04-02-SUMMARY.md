---
phase: 04-my-garage
plan: 02
subsystem: server-actions
tags: [supabase, server-action, rls, zod, garage, trust-boundary, getClaims]

# Dependency graph
requires:
  - phase: 04-my-garage
    plan: 01
    provides: garage_trucks (owner-scoped table + RLS) + shared truckSchema (Zod) + coalesce(config_id,0) duplicate index + model_configurations applicability join
  - phase: 02-verified-seller-phone-otp
    provides: the repo Server Action convention (getClaims identity, shared-Zod re-validation, discriminated result, cookie-client owner RLS) from lib/actions/verify.ts
provides:
  - lib/actions/garage.ts — addTruck/updateTruck/deleteTruck owner-scoped mutations (the GRGE-01/02 write trust boundary)
  - typed result unions (AddTruckResult/UpdateTruckResult/DeleteTruckResult) the UI plan (04-03) consumes to render combo/duplicate/cap/not_found errors
affects: [04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-scoped mutating Server Action: getClaims identity (never getSession) + truckSchema re-validation + server-side model_configurations applicability re-check + cookie-client owner RLS write (no admin client) — mirrors sendOtp/register Pattern 2 trust boundary"
    - "Soft cap as a tunable module constant (GARAGE_SOFT_CAP=20) checked via RLS-scoped { count: 'exact', head: true }, not a DB constraint (friendly server guard per CONTEXT)"
    - "23505 -> typed 'duplicate'; zero-rows-affected on owner-RLS update/delete -> typed 'not_found' (the row is either the owner's or invisible)"

key-files:
  created:
    - lib/actions/garage.ts
  modified: []

key-decisions:
  - "[Trust] addTruck/updateTruck re-validate the SAME truckSchema AND re-check config applicability vs model_configurations server-side — the cascade UI is untrusted; only-when-configId-set keeps model-level trucks (config NULL) valid."
  - "[Trust] not_found is derived from zero-rows-affected under owner RLS (.select('id') after update/delete returns [] when the row isn't the caller's) — non-owner mutation and nonexistent id collapse to the same typed error, leaking no existence info."
  - "[Cap] Soft cap (20) is a server-side count guard (RLS-scoped), tunable via GARAGE_SOFT_CAP constant — not a DB constraint, per 04-CONTEXT's 'friendly affordance' intent."
  - "[Privacy] No admin/service-role client in garage.ts — all writes flow through the cookie-bound user client so the 4 owner policies on garage_trucks are the authorization boundary; explicit user_id on insert + redundant .eq('user_id') on update/delete is clarity, not the security line."

patterns-established:
  - "Per-garage soft cap via tunable module constant + RLS-scoped count(head:true)."
  - "Edit/delete id guard (isValidId positive-int) at the action boundary even though the client passes a number."

requirements-completed: [GRGE-01, GRGE-02]

# Metrics
duration: ~2min
completed: 2026-06-04
---

# Phase 4 Plan 02: My Garage Add/Edit/Delete Server Actions Summary

**Three owner-scoped Server Actions — `addTruck`/`updateTruck`/`deleteTruck` in `lib/actions/garage.ts` — that are the GRGE-01/02 write trust boundary: getClaims identity (never getSession), shared-truckSchema re-validation, server-side `model_configurations` applicability re-check, soft cap, 23505→duplicate, and zero-rows→not_found, all enforced through the cookie-client owner RLS with no admin client.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-04T18:57:43Z
- **Completed:** 2026-06-04T19:00:09Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- `addTruck(input)` → `AddTruckResult`: getClaims identity; `truckSchema.safeParse` re-validation; RLS-scoped soft-cap count (`GARAGE_SOFT_CAP=20`, tunable constant); `model_configurations` applicability re-check only when `configId` is set (drives the "Missing your truck?" affordance); explicit `user_id` insert; `23505 → duplicate`; empty nickname stored as NULL.
- `updateTruck(id, input)` → `UpdateTruckResult`: same guards as add (getClaims, id positive-int guard, truckSchema, combo re-check, 23505→duplicate); owner-RLS-scoped update; zero rows affected → `not_found`.
- `deleteTruck(id)` → `DeleteTruckResult`: getClaims, id guard, owner-RLS-scoped delete; zero rows affected → `not_found` (the UI owns the confirm dialog).
- All three: discriminated result unions, no `getSession`, no admin/service-role client (owner data through the cookie client only). Typechecks clean; full suite green (15 files, 77 passed, 1 skipped) — server-only actions added no integration regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: addTruck + shared owner/validate/combo/cap guards** - `1ca0dec` (feat)
2. **Task 2: updateTruck + deleteTruck (owner-scoped, same guards)** - `40096e4` (feat)

## Files Created/Modified
- `lib/actions/garage.ts` - `"use server"`; `addTruck`/`updateTruck`/`deleteTruck` + result unions + `GARAGE_SOFT_CAP` constant + `isValidId` id guard. getClaims identity, shared truckSchema re-validation, `model_configurations` combo re-check, cookie-client owner-RLS writes, no admin client.

## Decisions Made
- Trust boundary re-validates truckSchema AND re-checks config applicability server-side; combo check only fires when `configId != null` so config-NULL (model-level) trucks stay valid.
- `not_found` derived from zero-rows-affected under owner RLS — non-owner and nonexistent collapse to one typed error, leaking no existence info.
- Soft cap is a tunable server-side count guard (constant), not a DB constraint.
- No admin/service-role client — the 4 owner policies on `garage_trucks` are the authorization boundary; explicit `user_id` on insert + redundant `.eq("user_id")` on update/delete is clarity, not security.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Prettier (pre-commit lint-staged) reformatted the `cap_reached` early-return onto two lines in the Task 1 commit — cosmetic, captured in `1ca0dec`. CRLF line-ending warnings on commit are expected on Windows (no impact).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GRGE-01/02 write path complete. Ready for Plan 04-03 (the My Garage UI: cascade add form, edit, delete-with-confirm) which imports these three actions and renders their typed errors (`invalid_combo` → "Missing your truck?", `duplicate`, `cap_reached`, `not_found`).
- `listMyTrucks()` (04-01) + these mutations are the full owner data+write surface for the garage; downstream phases (6/7) still consume only the read helper.

## Self-Check: PASSED

`lib/actions/garage.ts` exists on disk; both task commits (1ca0dec, 40096e4) exist in git history; `npx tsc --noEmit` clean; full vitest suite green (77 passed, 1 skipped). grep confirms zero `getSession` and zero admin/service-role client usage in the file.

---
*Phase: 04-my-garage*
*Completed: 2026-06-04*
