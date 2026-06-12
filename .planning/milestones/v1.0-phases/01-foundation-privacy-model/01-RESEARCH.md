# Phase 1: Foundation & Privacy Model - Research

**Researched:** 2026-06-03
**Domain:** Supabase Auth (email/password + confirmation) + Postgres RLS privacy split + Next.js 16 App Router SSR auth
**Confidence:** HIGH (auth flow, RLS split, trigger pattern, getClaims/getUser verified against Supabase docs via Context7; the project is already scaffolded so stack is observed fact, not assumption)

## Summary

This is the first executable phase, but the project is **already scaffolded** (Phase 0/0.1): Next.js 16.2.6 + React 19.2.4, `@supabase/ssr@0.10.3`, the four `lib/supabase/{server,client,middleware,admin}.ts` clients exist and already follow the invariants (server uses cookie-bound client, admin is `server-only` with `SUPABASE_SERVICE_ROLE_KEY`, middleware refreshes via `getUser()`), `middleware.ts` is wired, route groups `(public)/(auth)/(app)/admin` exist, and `supabase/migrations/` is **empty**. So Phase 1 is NOT "scaffold from scratch" — it is: write the first migration (extensions + profiles split + RLS + signup trigger), build the auth UI/server-actions in `app/(auth)/`, build the public profile at `app/(public)/u/[username]/`, and wire the confirmation gate.

The privacy model is the load-bearing work and the canonical Supabase pattern fits it exactly: a `security definer` trigger on `auth.users` (`handle_new_user`) reads `raw_user_meta_data` (set at `signUp` time) and inserts into **both** `profiles_public` and `profiles_private` in one transaction. This is the only clean way to populate an owner-only RLS table at signup, because the user has no verified session yet when the row must be created — the trigger runs as definer and bypasses RLS for that single controlled insert. PII (6 fields) goes to `profiles_private` (no anon/public SELECT policy at all → structurally unreadable); username + derived location + member_since go to `profiles_public` (world-readable).

**Primary recommendation:** One migration creates `pg_trgm`+`unaccent`+`citext`, both profile tables with RLS default-deny and explicit policies, the username uniqueness/format constraints (use `citext` for case-insensitive uniqueness), and the `handle_new_user` trigger. Auth UI uses Server Actions calling `signUp`/`signInWithPassword`/`signOut`/`resetPasswordForEmail` with the same Zod schema validated client-side (RHF) and server-side. Email confirmation gate = Supabase project setting "Confirm email" ON + a `/auth/confirm` route handler calling `verifyOtp`; unconfirmed users have no session so route protection (redirect-if-no-`getClaims`) naturally blocks app access.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Registration flow**
- All six PII fields required at registration: First Name, Last Name, Email, Phone, State/Province, Country (plus password). Full profile from the start.
- These PII fields land in `profiles_private` (owner-only RLS) — never on the public table. Public location is derived as "State/Province, Country" only.
- Email confirmation gate is ON: after submitting registration the user sees a "check your email" screen and cannot enter the app until they confirm the email link. No app access while unconfirmed.
  - ⚠️ Overlaps Phase 2 (VERF-01 email confirmation feeds the Verified badge). Phase 1 owns the *confirmation gate for login*; Phase 2 owns the *Verified badge composition*. Confirm boundary so the email-confirm logic isn't duplicated — Phase 1 implements confirm, Phase 2 reads its result.
- Confirmation link: resend button (rate-limited) + link expires (Supabase default ~24h).

**Location capture**
- Predefined dropdowns: Country dropdown + dependent State/Province dropdown. Normalized data for consistent filtering and clean public display.
- Geographic scope v1: USA + Canada only. Country list contains exactly these two; State/Province list is the states/provinces of the selected country. (Mexico deferred.)

**Public username**
- Chosen at registration, optional: a username field in the registration form. If left blank, the system auto-generates one.
- Auto-generated format like `PeterbiltParts483`: drawn from a pool of generic truck/parts words (Peterbilt, Chrome, Diesel, Rig, etc.) + a random number. Never derived from user PII.
- Format rules: alphanumeric only, 3–20 chars, no spaces. Case-insensitive uniqueness (`ChromeKing` == `chromeking`).
- Editable after creation, rate-limited: once every 30 days.
- Live validation while typing: availability + format check shown inline under the field (green "available" / red "taken").

**Public profile**
- URL pattern: `/u/username` (e.g. `/u/ChromeKing79`). Prefix avoids collisions with reserved routes.
- Layout: compact header + grid of active listings. Header shows username, location ("State/Province, Country"), Member Since, and live active-listings count.
- Member Since format: month + year (e.g. "Member since June 2026").
- No listings yet (Phase 1 reality): show count as "0 active listings" + an empty state ("This user hasn't posted yet"). The count is derived live (PRIV-03), not stored — wired now so it's correct once listings arrive in Phase 5.
- Public response contains only: username, State/Province, Country, Member Since, active-listings count. A contract test must assert anonymous profile fetches contain zero PII keys.

**Login & session**
- Method: email + password.
- Session: persistent by default — long-lived refresh tokens, user stays logged in across browser close/reopen. No "remember me" checkbox. (Supabase default; ACCT-05.)
- Post-login redirect: home/feed (logged-in). (Post-registration goes to the "confirm email" screen first.)
- Logout lives in a user menu in the global header (avatar/username dropdown), visible on every page — satisfies ACCT-06.

**Password & error handling**
- Password rules: minimum 8 characters + a visual strength meter. No rigid symbol/uppercase requirements (NIST-aligned).
- Forgot-password flow IS in Phase 1: "forgot password" link on login → reset email → set new password.
- Duplicate email: generic message that does not confirm whether an email exists (anti account-enumeration).

**Terms & privacy**
- Mandatory terms/privacy checkbox at registration. Must accept Terms + Privacy Policy to register; store an acceptance timestamp.
  - ⚠️ Phase 2 (VERF) also involves terms acceptance for the Verified badge. Phase 1 captures registration-time acceptance + timestamp; Phase 2 may layer marketplace-terms acceptance into the badge.

### Claude's Discretion
- Exact visual design of the registration/login forms, the "check your email" screen, the strength meter, and the empty profile state — follow the project design system.
- Specific copy wording for errors and the generic duplicate-email message.
- Implementation of the rate limit mechanics (resend email, username 30-day window).
- Whether forgot-password and resend-confirmation share infrastructure.

### Deferred Ideas (OUT OF SCOPE)
- Social login (Google, etc.) — its own future phase.
- Mexico (and broader North America) in the country/location list — v1 ships USA + Canada only.
- "Remember me" / configurable session length — persistent-by-default only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCT-01 | Register with private data (First/Last Name, Email, Phone, State/Province, Country) | `signUp` with all 6 fields in `options.data` (raw_user_meta_data) → `handle_new_user` trigger inserts into `profiles_private`. Zod schema validates both sides. |
| ACCT-02 | Private data never queryable/renderable on any public surface | Table split: PII only in `profiles_private` with NO anon/public SELECT policy. Structural, not select-discipline. Contract test asserts zero PII keys. |
| ACCT-03 | Choose custom public username | Optional `username` field → metadata → trigger inserts into `profiles_public.username` (citext unique). Live availability check via RPC/SELECT. |
| ACCT-04 | System auto-generates username if none chosen | Server-side generator (truck-word pool + random int) in the signup action or trigger; retry-on-collision against citext unique constraint. |
| ACCT-05 | Log in and stay logged in across sessions | `signInWithPassword`; `@supabase/ssr` persistent refresh tokens (default); middleware refreshes on every request. |
| ACCT-06 | Log out from any page | `signOut` Server Action invoked from a user-menu in the global header rendered in `app/(app)` layout. |
| PRIV-01 | Public profile displays only username, State/Province, Country, Member Since, active-listings count | `profiles_public` holds exactly these (count derived). `/u/[username]` reads only this table. |
| PRIV-02 | Location only as general "State/Province, Country" | Public table stores `state_province` + `country` only; street/postal live in `profiles_private`. |
| PRIV-03 | Active-listings count derived, not stored | Computed via `count(*)` on owner's active listings (view or aggregate). Phase 1: listings table doesn't exist yet → return 0 via a count function/view designed to be correct once Phase 5 lands. See Open Question 1. |
| PRIV-04 | Buyer can view another user's public profile | `/u/[username]` is a public Server Component reading `profiles_public` (anon SELECT allowed). |
</phase_requirements>

## Standard Stack

Everything is already installed and pinned (verified in `package.json`). No new runtime deps required for the core of this phase.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.6 | App Router, Server Actions, middleware | Decided stack; already scaffolded |
| react / react-dom | 19.2.4 | UI runtime + `useActionState`/`useFormStatus` for forms | Pairs with Server Actions |
| @supabase/ssr | 0.10.3 | Cookie-based SSR auth | Only supported SSR path; clients already written |
| @supabase/supabase-js | 2.106.x | Core SDK (auth methods) | Base SDK |
| react-hook-form | 7.77.0 | Registration/login form state | shadcn-blessed |
| zod | 4.4.x | One schema, client + server validation | Trust boundary |
| @hookform/resolvers | 5.4.0 | zodResolver bridge | Zod 4 support |
| shadcn (CLI) | 4.10.0 | Form, Input, Select, Button, Dialog, DropdownMenu, Badge, Sonner | Owned components |
| lucide-react | 1.17.0 | Icons (eye toggle, menu) | shadcn default |

### Supporting (may need to add via shadcn CLI)
| Component | Source | When to Use |
|-----------|--------|-------------|
| shadcn `form`, `input`, `select`, `button`, `dropdown-menu`, `label`, `checkbox` | `npx shadcn@latest add ...` | Registration/login forms + header user menu. Verify which are already added under `components/ui` first. |
| shadcn `sonner` | `npx shadcn@latest add sonner` | Toasts for resend/confirm/error feedback |

### Don't add
- No password-strength library required — a min-8 + simple visual meter (segment count by length/variety) is enough per CONTEXT (NIST-aligned, no rigid rules). A tiny inline helper beats pulling `zxcvbn` (large bundle) unless the planner wants entropy scoring. **Recommend inline helper.**
- No new auth library. No `@supabase/auth-helpers-nextjs` (deprecated — do not install).

**Installation (only if components missing):**
```bash
npx shadcn@latest add form input select button dropdown-menu label checkbox sonner
```

## Architecture Patterns

### Recommended additions to existing structure
```
app/
├── (auth)/
│   ├── register/page.tsx          # registration form (RHF + Zod)
│   ├── register/actions.ts        # 'use server' signUp action
│   ├── login/page.tsx             # login form
│   ├── login/actions.ts           # signInWithPassword action
│   ├── check-email/page.tsx       # "check your email" screen + resend button
│   ├── forgot-password/page.tsx   # request reset email
│   ├── reset-password/page.tsx    # set new password (after recovery link)
│   └── auth-code-error/page.tsx   # confirm/recovery failure landing
├── auth/
│   └── confirm/route.ts           # GET: verifyOtp(token_hash, type) → redirect
├── (public)/
│   └── u/[username]/page.tsx      # public profile (reads profiles_public ONLY)
├── (app)/
│   ├── layout.tsx                 # guarded layout: redirect if no session; renders header + user menu
│   └── page.tsx                   # home/feed (post-login landing; minimal in P1)
lib/
├── actions/auth.ts (or per-route actions.ts)  # server actions
├── validation/auth.ts             # shared Zod schemas (register, login, reset)
├── username/generate.ts           # truck-word auto-username generator
└── geo/locations.ts               # USA + Canada country/state-province data
supabase/migrations/
└── 0001_foundation_privacy.sql    # extensions + profiles split + RLS + trigger
components/
└── auth/ , layout/header.tsx      # forms, strength meter, user menu
```

> Note: the auth **route handler** must live at `app/auth/confirm/route.ts` (NOT inside the `(auth)` group) so its URL is `/auth/confirm` — that exact path is what you set as the email redirect/Site URL allowlist entry. The `(auth)` group is a URL-invisible group for the *pages*.

### Pattern 1: The privacy split + signup trigger (THE core pattern)
**What:** Two tables keyed on `auth.users.id`; a `security definer` trigger populates both from signup metadata.
**When:** This phase, first migration.
**Example (synthesized from verified Supabase `handle_new_user` docs):**
```sql
-- 0001_foundation_privacy.sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists citext;  -- case-insensitive username uniqueness

-- PUBLIC profile: world-readable, owner-writable. NO PII columns exist here.
create table public.profiles_public (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  state_province text not null,
  country text not null,
  member_since timestamptz not null default now(),
  username_changed_at timestamptz,            -- enforces 30-day rename window
  constraint username_format check (username ~ '^[A-Za-z0-9]{3,20}$')
);

-- PRIVATE profile (PII): owner-only. No anon/public policy => structurally unreadable.
create table public.profiles_private (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,            -- mirror of auth email for owner convenience
  phone text not null,
  state_province text not null,   -- canonical capture; public copy is derived
  country text not null,
  street_address text,            -- not collected in P1 form, reserved for later
  postal_code text,               -- "
  terms_accepted_at timestamptz not null
);

alter table public.profiles_public  enable row level security;
alter table public.profiles_private enable row level security;

-- public: world read, owner write
create policy "public profiles readable"
  on public.profiles_public for select
  to anon, authenticated using (true);
create policy "owner updates own public profile"
  on public.profiles_public for update
  to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- private: owner read/update ONLY. NO select policy for anon. NO insert policy
-- needed (insert happens via the security-definer trigger, which bypasses RLS).
create policy "owner reads own PII"
  on public.profiles_private for select
  to authenticated using ((select auth.uid()) = id);
create policy "owner updates own PII"
  on public.profiles_private for update
  to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Trigger: runs as definer at signup; inserts BOTH rows from metadata atomically.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles_public (id, username, state_province, country)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'state_province',
    new.raw_user_meta_data ->> 'country'
  );
  insert into public.profiles_private (id, first_name, last_name, email, phone,
                                       state_province, country, terms_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'state_province',
    new.raw_user_meta_data ->> 'country',
    coalesce((new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz, now())
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
Source: Supabase "Managing User Data" / user-management quickstart (`handle_new_user` with `security definer set search_path = ''`), RLS docs (`(select auth.uid())` wrap) — verified via Context7 `/supabase/supabase`. **HIGH.**

> **Username generation + collision (ACCT-04):** the trigger reads `username` from metadata. Generate the auto-username **in the signup Server Action** (so the truck-word pool + retry-on-collision logic lives in TypeScript and can pre-check availability), set it into `options.data.username`, and rely on the `citext unique` constraint as the final backstop. If a rare race collides, the trigger insert fails → the action retries with a new suffix. Doing generation in-action (not in SQL) keeps the word pool maintainable and reuses the same availability check as the live "is this taken" lookup.

### Pattern 2: Server Action + shared Zod schema (client + server)
**What:** RHF validates on the client for UX; the *same* Zod schema re-validates inside the `'use server'` action before calling `signUp`.
**When:** Every form (register, login, forgot, reset).
**Example:**
```ts
// lib/validation/auth.ts
import { z } from "zod";
export const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7),
  country: z.enum(["USA", "Canada"]),
  stateProvince: z.string().min(1),
  username: z.string().regex(/^[A-Za-z0-9]{3,20}$/).optional(),
  password: z.string().min(8),
  acceptTerms: z.literal(true),
});
```
```ts
// app/(auth)/register/actions.ts
"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validation/auth";
import { generateUsername } from "@/lib/username/generate";

export async function register(formData: FormData) {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" }; // surface via useActionState
  const v = parsed.data;
  const username = v.username ?? (await generateUsername()); // collision-safe
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      data: {
        first_name: v.firstName, last_name: v.lastName, phone: v.phone,
        country: v.country, state_province: v.stateProvince,
        username, terms_accepted_at: new Date().toISOString(),
      },
    },
  });
  // Anti-enumeration: do NOT branch the user-visible message on "already registered".
  // Supabase returns an obfuscated user object for existing-but-unconfirmed emails;
  // always route to /check-email with the generic copy.
  if (error && !isExpectedDuplicate(error)) return { error: "Something went wrong" };
  redirect("/check-email");
}
```
Source: Supabase SSR Server Actions docs (`signInWithPassword`/`signUp` in actions) + passwords guide (`email_redirect_to`) — verified via Context7. **HIGH.**

### Pattern 3: Email-confirmation gate via verifyOtp route + session-based protection
**What:** The confirm link from the email hits `GET /auth/confirm?token_hash=...&type=signup`, which calls `verifyOtp` and establishes the session, then redirects to the app. Because an unconfirmed user has **no session**, the `(app)` layout's `getClaims()` check naturally redirects them to login — that IS the gate. No custom "is confirmed" flag needed for the gate itself.
**Example (verified Supabase token-exchange route):**
```ts
// app/auth/confirm/route.ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";
  const redirectTo = request.nextUrl.clone();
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) { redirectTo.pathname = next; return NextResponse.redirect(redirectTo); }
  }
  redirectTo.pathname = "/auth-code-error";
  return NextResponse.redirect(redirectTo);
}
```
Source: Supabase passwords guide "Next.js Token Exchange Endpoint" — verified via Context7. **HIGH.**

> **Project setting (not code):** Supabase project → Auth → "Confirm email" must be ON, and Site URL + Redirect URLs allowlist must include the deployed origin(s) and `localhost` for `/auth/confirm`. This is a Staging dashboard config step the plan must call out (the Staging project `wmsxoccqgdczgyzivdma` is shared across all Vercel envs per STATE.md).

### Pattern 4: Route protection in the `(app)` layout
**What:** The authenticated layout calls `getClaims()`; if no claims → `redirect('/login')`. Mark personalized routes dynamic.
**Example:**
```ts
// app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return <>{/* header w/ user menu */}{children}</>;
}
```
> `getClaims()` (asymmetric JWT, verifies signature against published keys, no network round-trip on every call) is the current Supabase recommendation; `getUser()` (network call to Auth server) is also acceptable and is what middleware already uses. **Either satisfies the "never getSession()" invariant.** Recommend `getClaims()` in layouts/pages for speed, keep `getUser()` in middleware (already wired).

### Anti-Patterns to Avoid
- **PII columns on `profiles_public` or a public view over PII** — violates Invariant 1. Two physical tables only.
- **An INSERT policy on `profiles_private` to let the client write its own PII row at signup** — unnecessary and risky. The `security definer` trigger is the only writer at creation; client never inserts.
- **Branching the registration response on "email already exists"** — account enumeration. Always generic message + route to /check-email.
- **`getSession()` anywhere server-side** — Invariant 6. Use `getClaims()`/`getUser()`.
- **Reserved-word usernames** colliding with routes — the `/u/` prefix already isolates profiles from top-level routes, but still reject a small denylist (admin, login, api, etc.) in the username validator as defense in depth.
- **Storing `active_listings_count` as a column** — PRIV-03 requires it derived.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session/cookie management | Custom JWT cookie handling | `@supabase/ssr` clients (already written) | Edge cases (refresh, SSR cookie set) handled |
| Email confirmation token verify | Custom token table | `signUp` + `verifyOtp` + "Confirm email" setting | Built-in, secure, expiring |
| Resend-confirmation throttling | Custom rate limiter | Supabase built-in auth rate limits (email-send & signup_confirmation period) | Platform-enforced; tune via dashboard/Management API |
| Password reset | Custom reset tokens | `resetPasswordForEmail` + recovery `verifyOtp` + `updateUser({password})` | Built-in flow |
| Case-insensitive username uniqueness | `lower()` everywhere + manual checks | `citext` column + `unique` | DB-enforced, index-backed |
| Password hashing/storage | Anything | Supabase Auth (never store passwords yourself) | Auth owns credentials |

**Key insight:** Almost all of "auth" is already solved by Supabase Auth + the existing `@supabase/ssr` clients. Phase 1's real custom work is the **migration (privacy split + trigger)**, the **forms + Zod schemas**, the **username generator**, the **USA/Canada geo data**, and the **public profile page** — not auth plumbing.

## Common Pitfalls

(Cross-referenced to `.planning/research/PITFALLS.md`.)

### Pitfall 1: PII leak via wide select / join (PITFALLS #1)
**What goes wrong:** `select('*, profiles_private(*)')` or fetching a wide object pulls PII into the payload.
**How to avoid:** Public surfaces query `profiles_public` only and enumerate columns. The table split makes this structural. **Verification: a contract test fetches `/u/[username]` (and the underlying anon query) and asserts the JSON has zero PII keys (first_name/last_name/email/phone/street/postal).**

### Pitfall 2: RLS off or too permissive (PITFALLS #2)
**What goes wrong:** New table without RLS, or `USING(true)` on PII.
**How to avoid:** Both tables `enable row level security` in the same migration; `profiles_private` has NO anon SELECT policy; authenticated policies scoped with `(select auth.uid()) = id`. **Verification: assert RLS enabled on both tables + an anonymous SELECT on `profiles_private` returns 0 rows.**

### Pitfall 3: Service-role key leak (PITFALLS #3)
**What goes wrong:** `NEXT_PUBLIC_` prefix on the service key, or using it in SSR client.
**How to avoid:** Already correct in `lib/supabase/admin.ts` (`server-only`, `SUPABASE_SERVICE_ROLE_KEY`). Phase 1 does NOT need the admin client at all — flag if a task reaches for it.

### Pitfall 4: Caching serves one user's data to another (PITFALLS #6)
**What goes wrong:** Personalized route statically cached.
**How to avoid:** `(app)` routes are dynamic (cookie access via the Supabase server client opts them out; add `export const dynamic = 'force-dynamic'` on personalized pages to be explicit). Public profile `/u/[username]` is anon-safe to cache but contains no PII anyway.

### Pitfall 5: Confirmation gate bypass / redirect allowlist
**What goes wrong:** `emailRedirectTo` not in Supabase's allowed Redirect URLs → link silently fails or redirects to default Site URL; or the gate is enforced only in UI.
**How to avoid:** Configure Site URL + Redirect URLs in the Staging dashboard for every origin (localhost, Vercel preview pattern, prod). The gate is enforced by **session absence**, not a UI flag — unconfirmed = no session = `(app)` layout redirects.

### Pitfall 6 (NEW, found in repo): malformed `NEXT_PUBLIC_SUPABASE_URL`
**What goes wrong:** `.env.local` currently has `NEXT_PUBLIC_SUPABASE_URL= https://wmsxoccqgdczgyzivdma.supabase.co/rest/v1/` — it has a **leading space after `=`** and a trailing **`/rest/v1/`** path. `@supabase/ssr` / supabase-js expect the **bare project URL** (`https://wmsxoccqgdczgyzivdma.supabase.co`). The leading space and `/rest/v1/` suffix will break auth endpoint construction (auth calls go to `<url>/auth/v1/...`, which would become `.../rest/v1//auth/v1/...`). The health-check passed likely because `getClaims()` with no session tolerates it or the script trims — but real `signUp`/`signInWithPassword` flows will fail.
**How to avoid:** **Wave 0 fix:** set `NEXT_PUBLIC_SUPABASE_URL=https://wmsxoccqgdczgyzivdma.supabase.co` (no space, no path) in `.env.local` and add `NEXT_PUBLIC_SITE_URL` for `emailRedirectTo`. Verify `.env.example` documents the bare-URL format. **This is a blocker the planner must address before any auth task.**

## Code Examples

### Login / Logout / Forgot / Reset (verified shapes)
```ts
// login
await supabase.auth.signInWithPassword({ email, password });
// logout (Server Action, from header user menu)
await supabase.auth.signOut();
// forgot password
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
});
// reset (on /reset-password after recovery verifyOtp establishes session)
await supabase.auth.updateUser({ password: newPassword });
```
Source: Supabase passwords guide — verified via Context7. **HIGH.**

### Live username availability check
```ts
// route handler or server action called on debounce while typing
const { data } = await supabase
  .from("profiles_public")
  .select("id")
  .eq("username", candidate)   // citext => case-insensitive compare
  .maybeSingle();
const available = !data;       // also run the regex format check client-side first
```

### Username 30-day rename guard (DB-side, defense in depth)
```sql
-- in an update trigger or RPC: reject if username changed within 30 days
create function public.guard_username_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.username <> old.username then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username can only change once every 30 days';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end; $$;
create trigger trg_guard_username_rename
  before update on public.profiles_public
  for each row execute procedure public.guard_username_rename();
```
**Confidence MEDIUM** (pattern is sound; exact mechanics are Claude's discretion per CONTEXT — could also be enforced in the Server Action).

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Already adopted; do not regress |
| `getSession()` server-side | `getClaims()` (or `getUser()`) | Invariant; getClaims verifies asymmetric JWT signature locally |
| One `profiles` table, column discipline | Physical public/private table split | Structural privacy |
| `lower(username)` everywhere | `citext` column | Index-backed case-insensitive uniqueness |
| Pages Router callback | App Router `route.ts` token exchange | `/auth/confirm` route handler |

**Deprecated/outdated:** `@supabase/auth-helpers-nextjs` (do not install). `getSession()` for authz (banned by invariant).

## Open Questions

1. **PRIV-03 active-listings count before listings exist (Phase 5).**
   - What we know: count must be derived, not stored; Phase 1 has no `listings` table.
   - What's unclear: whether to (a) hardcode 0 in the profile page now, or (b) create a count function/view now that returns 0 and is updated when `listings` lands.
   - Recommendation: ship a small SQL function `public.active_listing_count(profile_id uuid) returns int` that returns 0 in Phase 1 (no listings table reference yet) and is rewritten in Phase 5 to `count(*)` active listings. The profile page calls this function so the wiring is correct now and the Phase 5 change is one function body. Alternatively just render literal `0` and defer the function to Phase 5 — lower effort, acceptable since CONTEXT says "wired now so it's correct once listings arrive." Planner picks; the function approach is cleaner.

2. **Username auto-generation location: Server Action vs DB trigger.**
   - Recommendation (above): generate in the Server Action (TS word pool + availability pre-check + retry), citext unique as backstop. Keeps the truck-word list maintainable and shares the availability lookup with live validation.

3. **Resend-confirmation rate limiting.**
   - What we know: Supabase enforces auth email-send + signup-confirmation-period limits platform-wide.
   - Recommendation: rely on platform limits for v1 (Claude's discretion per CONTEXT). The resend button calls `supabase.auth.resend({ type: 'signup', email })`; a client-side cooldown (e.g. 60s disabled button) improves UX. Verify `resend` signature against current supabase-js when implementing.

4. **`citext` extension availability on Supabase.** HIGH confidence it's available (standard Postgres contrib, supported on Supabase). If a constraint blocks it, fall back to a `text` column + unique index on `lower(username)` + a `lower()` format check. Verify at migration time.

## Validation Architecture

> `.planning/config.json` has `workflow.research/plan_check/verifier=true` but no `nyquist_validation` key. Test infra (Vitest 4 + Playwright) already exists, so a lightweight test map is included; planner can scale up under the verifier workflow.

### Test Framework
| Property | Value |
|----------|-------|
| Unit/integration | Vitest 4.1.8 (`vitest.config.mts`, jsdom, `vitest.setup.ts`) |
| E2E | Playwright 1.60 (`playwright.config.ts`, `e2e/`) |
| Quick run | `npm run test` (vitest run) |
| E2E run | `npm run test:e2e` |
| Supabase reachability | `npm run check:supabase` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Command | Exists? |
|--------|----------|-----------|---------|---------|
| ACCT-02 / PRIV-01 | Anonymous profile fetch contains ZERO PII keys (contract test) | integration (against Staging or local) | `npm run test` | ❌ Wave 0 |
| ACCT-02 | `profiles_private` anon SELECT returns 0 rows; RLS enabled both tables | integration | `npm run test` | ❌ Wave 0 |
| ACCT-03/04 | Username format regex + auto-generator produces valid unique handle | unit | `npm run test` | ❌ Wave 0 |
| ACCT-01/05 | Register → check-email → confirm → login → land on app (gate works) | e2e | `npm run test:e2e` | ❌ Wave 0 |
| ACCT-06 | Logout from header clears session | e2e | `npm run test:e2e` | ❌ Wave 0 |
| PRIV-02/04 | `/u/[username]` renders username + "State/Province, Country" + Member Since + 0 listings | e2e | `npm run test:e2e` | ❌ Wave 0 |
| (geo) | Country→State/Province dependent dropdown data integrity | unit | `npm run test` | ❌ Wave 0 |

> Some RLS/contract tests need a live Supabase. They can run against the Staging project (anon key) or a local `supabase start`. Planner should decide; against Staging, use a disposable test user. The PII-keys contract test is the single most important gate (PITFALLS #1).

### Wave 0 Gaps
- [ ] Fix `.env.local` `NEXT_PUBLIC_SUPABASE_URL` (remove leading space + `/rest/v1/`); add `NEXT_PUBLIC_SITE_URL`; update `.env.example`.
- [ ] `tests/privacy.contract.test.ts` — anon profile fetch has no PII keys; `profiles_private` anon SELECT empty (ACCT-02, PRIV-01).
- [ ] `tests/username.test.ts` — format regex + generator (ACCT-03/04).
- [ ] `tests/geo.test.ts` — USA/Canada country→state/province data (location).
- [ ] `e2e/auth.spec.ts` — register/confirm/login/logout/profile happy path.
- [ ] shadcn components present check (form/input/select/dropdown-menu/checkbox/sonner) — add if missing.
- [ ] Supabase dashboard config (manual, document in plan): Confirm email ON; Site URL + Redirect URLs allowlist includes `/auth/confirm` for localhost/preview/prod.

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/supabase` — `handle_new_user` security-definer trigger; profiles RLS (`(select auth.uid())`); Next.js `/auth/confirm` token-exchange route (`verifyOtp`); `signUp`/`signInWithPassword`/`signOut`/`resetPasswordForEmail`/`updateUser`; auth rate limits.
- Repo inspection (observed fact): `package.json`, `lib/supabase/{server,client,middleware,admin}.ts`, `middleware.ts`, `.env.local`, route-group layout, empty `supabase/migrations/`.
- `.planning/research/{ARCHITECTURE,STACK,PITFALLS}.md` — privacy split, banned approaches, versions.

### Secondary (MEDIUM)
- CONTEXT.md decisions (locked product/UX).
- Username rename-guard trigger pattern (sound, mechanics are discretion).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — already installed/pinned and observed in repo.
- Architecture (privacy split, trigger, confirm route, gate): HIGH — verified against Supabase docs via Context7.
- Pitfalls: HIGH — derived from project PITFALLS.md + verified docs; the `.env.local` URL bug is a concrete observed blocker.

**Research date:** 2026-06-03
**Valid until:** ~2026-07-03 (stable stack; re-verify `supabase-js` `resend`/`verifyOtp` signatures and `getClaims` shape at implementation time)
