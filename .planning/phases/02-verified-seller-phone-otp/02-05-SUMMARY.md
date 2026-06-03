---
phase: 02-verified-seller-phone-otp
plan: 05
subsystem: public-profile
tags: [verified-badge, privacy, rls, shadcn, anon-rpc]
requires:
  - "is_verified_seller(uuid) RPC (02-01, applied to Staging)"
  - "PublicProfileHeader + /u/[username] public profile (Phase 1)"
  - "privacy.contract.test.ts cross-cutting gate (Phase 1)"
provides:
  - "Verified Seller badge on /u/[username] (VERF-04)"
  - "components/ui/badge.tsx shadcn primitive"
  - "privacy contract Layer 3: badge is a derived boolean, not a PII path"
affects:
  - "app/(public)/u/[username]/page.tsx"
  - "components/profile/public-profile-header.tsx"
tech-stack:
  added: ["shadcn Badge (class-variance-authority badgeVariants)"]
  patterns:
    - "anon-callable SECURITY DEFINER boolean RPC mirroring active_listing_count"
    - "badge rendered from a derived boolean — zero PII read on the public surface"
key-files:
  created:
    - components/ui/badge.tsx
  modified:
    - app/(public)/u/[username]/page.tsx
    - components/profile/public-profile-header.tsx
    - tests/integration/privacy.contract.test.ts
decisions:
  - "[Privacy] The Verified badge is a boolean from is_verified_seller RPC; the public page reads no PII to render it. Page stays anon-safe (no force-dynamic) — same caching posture as active_listing_count."
  - "[Testing] Privacy contract gains a Layer 3 that proves is_verified_seller is anon-callable and yields ONLY a boolean; the existing structural PII_KEYS layer still proves phone/PII columns are physically absent."
metrics:
  duration: ~4 min
  completed: 2026-06-03
---

# Phase 2 Plan 05: Verified Seller Badge Summary

The public profile now surfaces the server-computed Verified Seller badge (VERF-04): an anon-callable `is_verified_seller` boolean RPC drives a shadcn Badge + lucide `BadgeCheck` next to the username, rendered only when `verified === true`, with the cross-cutting privacy contract extended to prove the badge added no PII path.

## What Was Built

- **Task 1 — Badge render.** Installed the shadcn Badge primitive (`components/ui/badge.tsx`, exports `badgeVariants`). The public page calls `supabase.rpc("is_verified_seller", { profile_id: profile.id })` directly beside the existing `active_listing_count` call and passes `verified={Boolean(verified)}` to `PublicProfileHeader`. The header gained a `verified: boolean` prop and renders `<Badge variant="secondary"><BadgeCheck/> Verified</Badge>` inline with the username, only when true. Page kept anon-safe (no `force-dynamic`); a one-line comment notes the badge is recomputed each read so it auto-revokes. (`5011e2f`)
- **Task 2 — Privacy contract extension.** Added a Layer 3 `describe` block (gated by `INTEGRATION_ENABLED`, anon client only) asserting `is_verified_seller` returns `typeof "boolean"` (`false` for an unknown uuid) to an anon caller — documenting that the badge addition introduced no new column on `profiles_public` and no reachable PII key. The existing structural `it.each(PII_KEYS)` layer still proves `phone` and all PII are physically absent. (`9c918a1`)

## Verification

- `npx tsc --noEmit` — clean for all four plan files (badge, page, header, test).
- `npx vitest run tests/integration/privacy.contract.test.ts` — **8 passed, 1 skipped** against Staging. The new assertion confirmed the RPC returns a live boolean to an anon caller; the live-row seeding self-skipped (email rate limit), structural layer still enforced.
- Badge renders only when `is_verified_seller` is true; the public page reads zero PII to render it.

## Deviations from Plan

### Parallel-tree commit cross-attribution (anomaly, documented)

- **Found during:** Task 1 commit.
- **Issue:** Plan 02-05 ran in the same working tree as the in-flight sibling plan 02-03. The husky/lint-staged pre-commit hook stashes/restores the tree, which swept the sibling's untracked files (`lib/verify/alert.ts`, `lib/verify/ratelimit.ts`, `lib/verify/twilio.ts`) into my Task 1 commit `5011e2f` alongside my three intended files. Per the execution caution, I did NOT rewrite the sibling's commit — my three target files (`badge.tsx`, `page.tsx`, `public-profile-header.tsx`) are correctly present and committed. Task 2's commit (`9c918a1`) was clean (only my test file).

### Out-of-scope discovery (deferred, not fixed)

- **Found during:** Task 1 `tsc --noEmit`.
- **Issue:** `lib/verify/ratelimit.ts` (owned by sibling plan 02-03, in-flight) has `PostgrestQueryBuilder` typing errors (TS2345/TS2339) on the `otp_send_attempts` query. None of plan 02-05's files are affected (verified by filtering tsc output — "NO ERRORS IN MY FILES"). Logged to `.planning/phases/02-verified-seller-phone-otp/deferred-items.md` and left for 02-03. Because of this, the plan's full `npm run build` step was not run to green (it would fail on the sibling's incomplete file); instead each of my files was confirmed error-free in isolation via filtered `tsc`, and the integration test suite ran green.

No auth gates occurred.

## Self-Check: PASSED

- FOUND: components/ui/badge.tsx
- FOUND: app/(public)/u/[username]/page.tsx (modified — is_verified_seller RPC + verified prop)
- FOUND: components/profile/public-profile-header.tsx (modified — Badge + BadgeCheck render)
- FOUND: tests/integration/privacy.contract.test.ts (modified — Layer 3 boolean assertion)
- FOUND commit: 5011e2f
- FOUND commit: 9c918a1
