---
phase: 01-foundation-privacy-model
plan: 01
subsystem: auth
tags: [zod, react-hook-form, shadcn, supabase, validation, geo, username]

# Dependency graph
requires:
  - phase: 0.1-wiring
    provides: Supabase Staging linked, check:supabase health-check, Vitest/Playwright, Next 16 scaffold
provides:
  - Corrected NEXT_PUBLIC_SUPABASE_URL (bare project URL) + NEXT_PUBLIC_SITE_URL for email redirects
  - Shared Zod auth schemas (registerSchema, loginSchema, forgotSchema, resetSchema) for client + server
  - Collision-aware truck-word username generator + USERNAME_REGEX single source of truth
  - USA/Canada country + state/province data and lookup helpers
  - shadcn UI primitives (form, input, select, dropdown-menu, label, checkbox, sonner)
  - Supabase confirmation gate: Confirm email ON + redirect URL allowlist configured
affects: [01-02-migration, 01-03-auth-flows, 01-04-public-profile, 02-verified-seller-otp]

# Tech tracking
tech-stack:
  added: [shadcn/ui form primitives, sonner]
  patterns:
    - Single Zod schema validates client (UX) and server (trust boundary)
    - USERNAME_REGEX defined once in lib/username/generate.ts, imported by validator
    - Username generation is PII-free (truck/parts vocabulary + random number)

key-files:
  created:
    - lib/validation/auth.ts
    - lib/username/generate.ts
    - lib/geo/locations.ts
    - tests/unit/username.test.ts
    - tests/unit/geo.test.ts
    - tests/unit/validation.test.ts
    - components/ui/form.tsx
    - components/ui/input.tsx
    - components/ui/select.tsx
    - components/ui/dropdown-menu.tsx
    - components/ui/label.tsx
    - components/ui/checkbox.tsx
    - components/ui/sonner.tsx
  modified:
    - .env.local
    - .env.example
    - package.json
    - package-lock.json

key-decisions:
  - "Supabase Staging confirmation gate enabled: Confirm email ON; Site URL http://localhost:3000; redirect allowlist http://localhost:3000/** + https://*-patricio-durans-projects.vercel.app/**"
  - "Mexico deferred out of geo data scope — only USA + Canada in v1"
  - "USERNAME_REGEX lives in lib/username/generate.ts as the single source; validator imports it"

patterns-established:
  - "Shared Zod schema pattern: same schema on client and inside Server Action"
  - "PII-free username generation from a fixed truck/parts word pool"

requirements-completed: [ACCT-03, ACCT-04, ACCT-01]

# Metrics
duration: ~25min (across initial run + continuation)
completed: 2026-06-03
---

# Phase 1 Plan 01: Foundation (env, validation, geo, username, UI) Summary

**Fixed the blocking Supabase URL env bug, shipped shared Zod auth schemas + a PII-free truck-word username generator + USA/Canada geo data (all unit-tested), added shadcn auth form primitives, and configured the Supabase email-confirmation gate.**

## Performance

- **Duration:** ~25 min (initial Tasks 1-3 run + continuation for Task 4 close-out)
- **Completed:** 2026-06-03
- **Tasks:** 4 (3 auto + 1 human-action checkpoint)
- **Files modified:** 17 (13 created, 4 modified)

## Accomplishments
- Corrected the blocking `NEXT_PUBLIC_SUPABASE_URL` (stripped leading space + `/rest/v1/` suffix → bare project URL) and added `NEXT_PUBLIC_SITE_URL` for `emailRedirectTo` / `resetPasswordForEmail`.
- Shared Zod schemas (`registerSchema`, `loginSchema`, `forgotSchema`, `resetSchema`) downstream auth plans import directly for client + server validation.
- Collision-aware username generator built from truck/parts vocabulary + random number, guaranteed to match `USERNAME_REGEX`, never PII-derived, with reserved-word denylist.
- USA (50 states + DC) and Canada (13 provinces/territories) geo data with `statesForCountry` lookup; Mexico explicitly out of scope.
- shadcn UI primitives for the auth forms + header (form, input, select, dropdown-menu, label, checkbox, sonner).
- Supabase Staging confirmation gate configured by the user (Confirm email ON + redirect URL allowlist).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix env + add NEXT_PUBLIC_SITE_URL** - `a01e1a8` (fix)
2. **Task 2: Username generator, geo data, Zod schemas + unit tests** - `72ff662` (feat)
3. **Task 3: Add missing shadcn UI components** - `705433b` (feat)
4. **Task 4: Supabase dashboard config (human-action checkpoint)** - no code; satisfied by user dashboard config (see User Setup)

## Files Created/Modified
- `lib/validation/auth.ts` - Shared Zod schemas for register/login/forgot/reset
- `lib/username/generate.ts` - PII-free truck-word username generator + `USERNAME_REGEX`
- `lib/geo/locations.ts` - `COUNTRIES` (USA/Canada) + `statesForCountry`
- `tests/unit/{username,geo,validation}.test.ts` - Unit coverage for the three lib modules
- `components/ui/{form,input,select,dropdown-menu,label,checkbox,sonner}.tsx` - shadcn auth primitives
- `.env.local` - Corrected Supabase URL + added `NEXT_PUBLIC_SITE_URL`
- `.env.example` - Documented bare-URL requirement + `NEXT_PUBLIC_SITE_URL`
- `package.json` / `package-lock.json` - shadcn component deps

## Decisions Made
- **Supabase confirmation gate (user-applied):** Confirm email ON; Site URL `http://localhost:3000`; redirect allowlist `http://localhost:3000/**` + `https://*-patricio-durans-projects.vercel.app/**` (2 URLs). Production origin to be added at launch.
- **Geo scope:** Mexico deferred — only USA + Canada shipped in v1.
- **USERNAME_REGEX single source:** defined in `lib/username/generate.ts`, imported by the validator (no duplication).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

External configuration was required and has been completed by the user in the Supabase Staging dashboard (project `wmsxoccqgdczgyzivdma`):
- **Authentication → Providers → Email:** "Confirm email" is ON.
- **Authentication → URL Configuration:** Site URL `http://localhost:3000`; Redirect URLs allowlist contains `http://localhost:3000/**` and `https://*-patricio-durans-projects.vercel.app/**` (Total URLs: 2).

These cover `/auth/confirm` and `/reset-password` redirect targets for local dev and Vercel previews. The production origin should be added to the allowlist at launch.

## Next Phase Readiness
- Validation contracts, username generator, geo data, and UI primitives are ready for the migration plan (01-02) and auth-flow plans (01-03+) to import directly.
- The email-confirmation gate is live, so auth flows can rely on `emailRedirectTo` working against the allowlist.
- Reminder: add the production origin to the Supabase redirect allowlist before launch.

## Self-Check: PASSED

All claimed files exist on disk and all three task commits (`a01e1a8`, `72ff662`, `705433b`) are present in git history.

---
*Phase: 01-foundation-privacy-model*
*Completed: 2026-06-03*
