# Phase 0 — Setup & Scaffolding — Design

**Date:** 2026-06-01
**Status:** Approved (design)
**Phase position:** New Phase 0, inserted before Phase 1. Phases 1–10 keep their numbers and dependencies unchanged.

## Goal

Leave a Next.js 16 project that boots locally with the full directory structure, pinned dependencies, and Supabase client skeletons already in place — but with **zero tables, RLS policies, or auth logic**. When Phase 1 begins, the first action is writing a migration, not installing tooling.

This phase is **pure scaffolding**. It establishes the shape the privacy model (Phase 1) drops into, without making any privacy/security guarantee itself yet.

## Scope

### In scope

1. **Base project** — Next.js 16 (App Router, stable) + React 19 + TypeScript 5.7+, structured per `.planning/research/ARCHITECTURE.md`: route groups `(public)` / `(auth)` / `(app)` plus `admin/`.
2. **Styling** — Tailwind v4 (CSS-first `@theme`, no JS config) + shadcn/ui initialized (CLI-installed, owned components) + lucide-react.
3. **Pinned dependencies** installed:
   - `@supabase/ssr@0.10.x`
   - `@supabase/supabase-js@2.106.x`
   - `react-hook-form@7.76.x`
   - `zod@4.4.x`
   - `@hookform/resolvers@5.x`
   - Explicitly **NOT** `@supabase/auth-helpers-nextjs` (deprecated, on the do-not-use list).
4. **Supabase client skeletons** — `lib/supabase/{server,client,middleware,admin}.ts` created with the correct patterns:
   - `server.ts` uses `getClaims()` / `getUser()` (never `getSession()`).
   - `admin.ts` is a `server-only` module reading `SUPABASE_SERVICE_ROLE_KEY`.
   - They reference env vars that do not exist yet; they compile but connect to nothing.
5. **`supabase/migrations/`** — empty directory, ready for the first Phase 1 migration. Schema source of truth lives here, not in app code.
6. **`.env.example`** — documented, with `SUPABASE_SERVICE_ROLE_KEY` marked server-only (never `NEXT_PUBLIC_*`). Plus a short README section with the steps to create the Supabase project and wire credentials later.
7. **Boot verification** — `npm run dev` serves a placeholder page; `npm run build` passes.

### Out of scope (deferred to Phase 1)

- Any table, including the `profiles_public` / `profiles_private` split.
- Any RLS policy.
- Registration, login, real auth logic.
- A real Supabase project, real credentials, or a Vercel deploy. `.env.example` documents these for later; no external account is created in this phase.

## Version decision (closed)

This phase closes the one open STACK call: **Next.js 16** (not the "15" mentioned in `PROJECT.md`). Confirmed by the user on 2026-06-01. STATE.md decision log to be updated accordingly.

## Architecture

The scaffold follows `.planning/research/ARCHITECTURE.md` "Recommended Project Structure":

```
app/
  (public)/        # world-readable surfaces (placeholder home for now)
  (auth)/          # login/register routes (empty shells)
  (app)/           # authenticated surfaces (empty shells)
  admin/           # service-role-isolated ops (empty shell)
lib/
  supabase/
    server.ts      # SSR client — getClaims()/getUser()
    client.ts      # browser client
    middleware.ts  # session refresh middleware
    admin.ts       # server-only, service-role key
supabase/
  migrations/      # empty — Phase 1 writes the first migration
.env.example
```

Each Supabase client module has one clear purpose and a documented usage. They depend only on env vars and the Supabase SDK — no table assumptions, so Phase 1 can add schema without touching these files.

## Data flow

None yet. No database calls execute in this phase. The clients are wired but dormant: importing `lib/supabase/server.ts` succeeds, calling it against an unconfigured project would fail at runtime — which is expected until credentials exist.

## Error handling

- Missing env vars: the app boots; any actual Supabase call would error. The placeholder home page makes **no** Supabase calls, so local dev runs clean without credentials.
- `.env.example` is committed; `.env.local` is gitignored (already covered by existing `.gitignore`).

## Testing / verification

This phase ships no features, so verification is structural:

1. `npm run build` exits 0.
2. `npm run dev` serves the placeholder page at localhost.
3. TypeScript compiles with no errors across the four `lib/supabase/*` modules.
4. `SUPABASE_SERVICE_ROLE_KEY` appears only in `admin.ts` and `.env.example`, never prefixed `NEXT_PUBLIC_` (grep check).

No unit/E2E tests are added in this phase — there is no behavior to test. The first real tests arrive in Phase 1 (the anonymous-PII contract test).

## GSD integration

- Add `Phase 0: Setup & Scaffolding` to `ROADMAP.md` before Phase 1, with the success criteria below. Phases 1–10 are untouched.
- Update `STATE.md`: current focus → Phase 0; record the Next.js 16 decision.

### Success criteria (what must be TRUE)

1. The Next.js 16 + React 19 + TypeScript project boots locally (`npm run dev`) and builds (`npm run build`) with no errors.
2. The route-group structure (`(public)`/`(auth)`/`(app)`/`admin`) and `lib/supabase/{server,client,middleware,admin}.ts` exist per ARCHITECTURE.md, compiling but not yet connected to a database.
3. All decided dependencies are installed and pinned; the deprecated `@supabase/auth-helpers-nextjs` is absent.
4. `.env.example` documents every required variable (with the service-role key marked server-only) and a README explains how to create the Supabase project and connect it later.
5. No table, RLS policy, or auth logic exists yet — those remain Phase 1.
