# Deferred / Out-of-Scope Items — Phase 06 Fitment Intelligence

## From Plan 06-03 (parallel-wave observation, NOT fixed — sibling-owned)

- **Transient `tsc` errors in 06-02-owned files during the parallel wave.** While
  executing 06-03, `npx tsc --noEmit` reported errors in `lib/listings/queries.ts`
  and `components/listings/listing-detail.tsx` — both **sibling Plan 06-02 files**
  (mid-flight `ListingDetail.categories` / `searchTerms` additions not yet consistent
  across the read mapping + the detail component). No 06-03 file is involved.
  - Verified my own work in isolation by stashing the sibling working-tree change:
    `lib/fitment/types.ts`, `lib/fitment/suggest.ts`, and
    `tests/integration/fitment-intelligence.test.ts` all typecheck CLEAN.
  - Per the scope boundary, 06-03 did NOT touch sibling files. 06-02 resolves its own
    tsc state on completion. Re-verify full-suite tsc after BOTH wave-2 plans land.
