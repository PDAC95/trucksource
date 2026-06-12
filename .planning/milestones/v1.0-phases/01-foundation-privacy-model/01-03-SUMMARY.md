---
phase: 01-foundation-privacy-model
plan: 03
subsystem: auth
tags: [supabase-auth, server-actions, react-hook-form, zod, rls, getclaims, route-protection, username]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    plan: 01
    provides: registerSchema/loginSchema/forgotSchema/resetSchema, generateUsername + USERNAME_REGEX, COUNTRIES/statesForCountry, shadcn primitives, corrected Supabase URL + NEXT_PUBLIC_SITE_URL, confirmation gate configured
  - phase: 01-foundation-privacy-model
    plan: 02
    provides: profiles_public/profiles_private split, handle_new_user signup trigger (consumes signUp metadata), citext username uniqueness
provides:
  - "Full email/password auth flow: register -> /check-email -> /auth/confirm token exchange -> guarded (app); login (persistent session); logout from header user menu; forgot/reset password"
  - "The email-confirmation gate enforced structurally by getClaims() in app/(app)/layout.tsx (force-dynamic) — unconfirmed = no session = redirect /login"
  - "Live username availability endpoint (/api/username-available, anon-safe citext lookup) + auto-generation when blank"
affects: [02-verified-seller-otp, 04-my-garage, every (app) route gated by the layout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action re-validates the SAME Zod schema the client (RHF) uses — trust boundary"
    - "Client serializes RHF-validated values into FormData (Radix selects/checkbox don't emit native fields) then dispatches via useActionState + startTransition"
    - "Auth gate = session absence: getClaims() in the (app) layout, never getSession()"
    - "Anti-enumeration: generic error/feedback on register, login, forgot, resend"
    - "Derived-status pattern in UsernameField to avoid synchronous setState in effect (React 19 lint)"

key-files:
  created:
    - app/(auth)/layout.tsx
    - app/(auth)/register/page.tsx
    - app/(auth)/register/actions.ts
    - app/(auth)/login/page.tsx
    - app/(auth)/login/actions.ts
    - app/(auth)/check-email/page.tsx
    - app/(auth)/forgot-password/page.tsx
    - app/(auth)/forgot-password/actions.ts
    - app/(auth)/reset-password/page.tsx
    - app/(auth)/reset-password/actions.ts
    - app/(auth)/auth-code-error/page.tsx
    - app/auth/confirm/route.ts
    - app/(app)/layout.tsx
    - app/(app)/page.tsx
    - components/auth/register-form.tsx
    - components/auth/password-strength.tsx
    - components/auth/username-field.tsx
    - components/auth/resend-confirmation.tsx
    - components/layout/user-menu.tsx
    - app/api/username-available/route.ts
  modified:
    - app/(public)/page.tsx (deleted — orphaned Phase-0 placeholder; resolved / route collision)

key-decisions:
  - "Forms dispatch RHF-validated values as hand-built FormData (not native action=) so Radix-controlled selects/checkbox reliably reach the Server Action, which re-validates the same Zod schema"
  - "Removed the orphaned Phase-0 (public)/page.tsx so the guarded (app) owns / as the authenticated landing (plan: login redirect('/'))"
  - "(auth) layout added to mount the global <Toaster/> (sonner) the forms depend on, plus a centered card shell"
  - "/auth/confirm handles BOTH signup and recovery types; recovery defaults next to /reset-password"

patterns-established:
  - "Every personalized (app) route inherits the getClaims() gate from the layout (force-dynamic); no per-page auth checks needed"
  - "Inline 'use server' logout action colocated in components/layout/user-menu.tsx"

requirements-completed: [ACCT-01, ACCT-03, ACCT-04, ACCT-05, ACCT-06]

# Metrics
duration: ~21min
completed: 2026-06-03
---

# Phase 1 Plan 03: Auth Flows Summary

**Built the complete email/password auth experience on the privacy migration: registration (6 PII fields -> metadata -> trigger) with live/auto username, the email-confirmation gate (verifyOtp at /auth/confirm + getClaims() redirect in the guarded (app) layout), login with persistent session, header user-menu logout, and the forgot/reset password flow — every form re-validating the shared Zod schema inside its Server Action.**

## Performance

- **Duration:** ~21 min
- **Completed:** 2026-06-03
- **Tasks:** 2 (both auto — autonomous plan, no checkpoints)
- **Files:** 21 (20 created, 1 deleted)

## Accomplishments

- **Registration (ACCT-01/03/04):** `register-form.tsx` (RHF + `zodResolver(registerSchema)`) collects the 6 PII fields, a dependent Country -> State/Province select pair, an optional username with live availability, an inline NIST-aligned password-strength meter, and a mandatory Terms/Privacy checkbox. The `register` Server Action re-validates the same schema, auto-generates a collision-checked username when blank (`generateUsername` with a citext `isTaken` probe), calls `signUp` with `emailRedirectTo` + the metadata the `handle_new_user` trigger consumes, returns a generic anti-enumeration error, and redirects to `/check-email`.
- **Confirmation gate (ACCT-05 gate):** `/auth/confirm` (`app/auth/confirm/route.ts`) does the `verifyOtp` token exchange for both `signup` and `recovery` links and establishes the session; `app/(app)/layout.tsx` (`force-dynamic`) calls `getClaims()` and redirects to `/login` when there are no claims — an unconfirmed user has no session, so that redirect IS the gate.
- **Login + session (ACCT-05):** `login` action `signInWithPassword`; persistent session is the `@supabase/ssr` default. Generic "invalid email or password" message. `/check-email` resend button with a 60s client cooldown.
- **Logout (ACCT-06):** `components/layout/user-menu.tsx` renders a header dropdown (username from `profiles_public`, never PII) with an inline `'use server'` `signOut` + redirect, present on every `(app)` page via the layout.
- **Forgot/Reset:** `forgot-password` (`resetPasswordForEmail` -> generic "if that email exists" copy) and `reset-password` (`updateUser({ password })` -> `/login?reset=success`).
- **Live username availability:** `app/api/username-available/route.ts` — anon-safe `profiles_public.select('id').eq('username', u)` (citext), format + reserved-word checked, fail-closed.

## Task Commits

1. **Task 1: Registration form, username field, strength meter, register action + availability API** — `174d736` (feat)
2. **Task 2: Login, logout, forgot/reset, confirm route, guarded (app) layout + header** — `dc66479` (feat)

## Decisions Made

- **FormData built from RHF-validated values (not native `action=`):** Radix-controlled `Select`/`Checkbox` don't emit native form fields, so `Object.fromEntries(formData)` would miss country/state/terms. Each form serializes its validated values into `FormData` and dispatches via `useActionState` + `startTransition`; the Server Action still re-parses the shared Zod schema (trust boundary preserved).
- **`(auth)/layout.tsx` added** to mount the global `<Toaster/>` (the forms surface errors via sonner) and provide a centered card shell. Not in the plan's file list but required for the listed pages to function.
- **`/auth/confirm` handles signup AND recovery** in one route; recovery defaults `next` to `/reset-password`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `/` route collision between `(app)` and `(public)`**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** The new `app/(app)/page.tsx` and the pre-existing Phase-0 placeholder `app/(public)/page.tsx` both resolve to `/`; Next.js errors ("two parallel pages that resolve to the same path").
- **Fix:** Deleted the orphaned Phase-0 placeholder (`(public)/page.tsx`, from scaffold commit `06edf18` "placeholder home") so the guarded `(app)` owns `/` as the authenticated landing the plan mandates (`redirect('/')`). The concurrent 01-04 executor owns only `(public)/u/**` + `components/profile/**`, which are untouched; `(public)/layout.tsx` (passthrough) still serves the profile route.
- **Files modified:** `app/(public)/page.tsx` (deleted)
- **Commit:** `dc66479`

**2. [Rule 1 - Bug] React 19 lint: synchronous setState inside effect (`username-field.tsx`)**
- **Found during:** Task 1 (pre-commit `eslint`)
- **Issue:** `react-hooks/set-state-in-effect` flagged synchronous `setStatus(...)` calls in the availability effect body.
- **Fix:** Refactored to store only the async lookup result (keyed by the candidate it ran for) in state; idle/invalid/checking statuses are now derived during render — no synchronous setState in the effect.
- **Files modified:** `components/auth/username-field.tsx`
- **Commit:** `174d736`

### Supporting files added (within plan scope)

`components/auth/resend-confirmation.tsx` (the `/check-email` resend client component) and `app/(auth)/layout.tsx` were not in the plan's `files_modified` list but are required for the listed pages; both live inside this plan's directory boundaries (`app/(auth)/*`, `components/auth/*`) and touch none of the concurrent executor's files.

## Issues Encountered

- A pre-existing/concurrent TypeScript error in `tests/integration/public-profile.contract.test.ts` (TS2352, line 52) is owned by Plan 01-04 (public profile, executed concurrently) and is outside this plan's scope. Logged to `deferred-items.md`; not fixed here. It does not affect `npm run build` (test files aren't in the build graph) and the app code typechecks clean.

## Verification

- `npm run build` — succeeds; routes present: `/` (dynamic, guarded), `/login`, `/register`, `/check-email`, `/forgot-password`, `/reset-password`, `/auth-code-error`, `/auth/confirm`, `/api/username-available`.
- `npx eslint` on all plan files — 0 errors (only the known, acceptable RHF `watch()` React-Compiler-skip warning).
- `npx vitest run tests/unit` — 20 passed.
- No `getSession()` anywhere (invariant 6 — gate uses `getClaims()`); no service-role client imported (Phase 1 needs none).
- Manual register->confirm->login->logout / forgot->reset happy paths are covered by Plan 05 e2e.

## Next Phase Readiness

- The `(app)` gate is live: any later authenticated route added under `(app)` inherits the `getClaims()` redirect automatically (no per-page auth). The `username` shown in the header reads `profiles_public` only.
- Phase 2 (Verified Seller/OTP) layers on top of this confirmed-account flow; the email-confirmation result it reads is produced here.
- Reminder (from Plan 01): add the production origin to the Supabase redirect allowlist before launch so `/auth/confirm` and `/reset-password` redirects resolve in prod.

## Self-Check: PASSED

All 20 created files exist on disk; `(public)/page.tsx` confirmed deleted; both task commits (`174d736`, `dc66479`) are present in git history.

---
*Phase: 01-foundation-privacy-model*
*Completed: 2026-06-03*
