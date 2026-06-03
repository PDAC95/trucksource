# Deferred / Out-of-Scope Items — Phase 01

Items discovered during execution that belong to another plan or phase.

## From Plan 01-03 execution (auth flows)

- **`tests/integration/public-profile.contract.test.ts(52,17)` TS2352 type error.**
  - Owned by Plan 01-04 (public profile), being executed concurrently by another executor. Not in 01-03's `files_modified` scope.
  - Pre-existing/concurrent — not caused by 01-03 changes. Left untouched for the 01-04 executor to resolve.
