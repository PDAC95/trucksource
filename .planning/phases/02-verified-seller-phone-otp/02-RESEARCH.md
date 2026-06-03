# Phase 2: Verified Seller & Phone OTP - Research

**Researched:** 2026-06-03
**Domain:** Phone OTP verification (Twilio Verify) + anti-abuse hardening (bot check, geo allowlist, rate limit, spend cap) + server-computed Verified badge, on Next.js 16 App Router + Supabase
**Confidence:** HIGH (Twilio Verify, Vercel BotID, libphonenumber-js, and the Supabase RLS/badge model are verified against official docs as of June 2026; rate-limit-store recommendation is MEDIUM — a reasoned pick, not a single canonical answer)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verification flow & trigger**
- **Trigger: on intent to sell.** Registration stays low-friction; verification (phone + terms) is required only when the user attempts to create their first listing. Users browse the feed first, verify when they want to sell.
- **Presentation: step wizard.** Separate screens — step 1 enter phone → step 2 enter OTP → step 3 accept terms. One thing at a time, guided.
- **Resume on abandon: pick up where they left off.** Progress is persisted. If OTP was already sent, returning lands on code entry. If phone was already verified, returning lands on terms. Never forces restart from scratch.
- **Unverified user capabilities: everything except selling.** Unverified users browse, search, comment, contact sellers, use the feed. Only creating listings requires verification. (Comment/contact gates are not tightened in this phase.)

**Phone OTP UX**
- **Code lifetime / attempts: 10 minutes, 5 wrong-code attempts** before the code is invalidated (Twilio Verify defaults). Balanced.
- **Resend: cooldown 30–60s.** Resend button disabled with a visible countdown, then re-enabled. Prevents send spam.
- **Code input: 6 separate boxes**, one per digit, auto-advance on type, supports pasting the full code.
- **Edit phone: "Change number" link** visible during OTP entry. Returns user to phone entry and invalidates the prior OTP. Prevents getting stuck on a mistyped number.

**Anti-abuse hardening (mandatory before exposing the OTP send endpoint)**
- **Geo-allowlist: +1 only (US/Canada).** Matches the North-American heavy-truck market and blocks most SMS-pumping.
- **Spend cap behavior: block new sends + alert admin.** On reaching the SMS spend/volume cap, new OTP sends are cut and the admin is notified.
- **Rate limit: 3 sends/hour, 5 sends/day per phone number** (also keyed by IP). Enough for legitimate retries, throttles pumping.

**Badge & terms**
- **Badge placement: public profile** (next to username). Listing-card and feed-comment placement are downstream-phase concerns (Phase 5/7/8) — out of scope here.
- **Badge appearance: icon + "Verified" text** (check/shield). Align styling to shadcn/ui.
- **Revocation: badge is server-computed and recomputed.** Verified = (email verified AND phone verified AND terms accepted). If any condition stops being true (e.g. phone changed), the badge disappears automatically. No manual admin-revoke UI in this phase (Phase 10), but the computed model must not assume verification is permanent.
- **Terms: checkbox + link to full terms.** "I accept the marketplace terms" checkbox with a link to the full terms page. Persist acceptance with **timestamp + accepted version**.

### Claude's Discretion
- **CAPTCHA / bot-detection mechanism** — research compares **Vercel BotID** vs **Cloudflare Turnstile**, then picks. Must be low/zero user friction and sit in front of the OTP send button.
- Exact rate-limit storage mechanism and spend-cap threshold value.
- Wizard visual design, copy/microcopy, error and edge-state styling.
- Terms page content/structure (this phase only needs the acceptance + persistence mechanism).

### Deferred Ideas (OUT OF SCOPE)
- Tightening comment/contact actions behind verification — unverified users keep those.
- Manual admin revoke/suspend of verification — Phase 10. This phase only ensures the badge is *recomputable*.
- Badge on listing cards and feed comments — Phase 5/7 listings, Phase 8 social.
- Including +52 (Mexico) in the geo-allowlist — v1 ships +1 only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VERF-01 | Seller can verify their email address | **Already complete in Phase 1** (Supabase email confirmation + Resend SMTP). In Phase 2 it is only an *input to the badge*: read `auth.users.email_confirmed_at` (mirror into the badge computation). No new build. |
| VERF-02 | Seller can verify their phone number via one-time code | Twilio Verify `verifications.create` (send) + `verificationChecks.create` (check) called from a Server Action; phone stored as PII in `profiles_private`; `phone_verified_at` timestamp set on approval. Hardened by BotID + geo allowlist + rate limit + spend cap (all "Anti-Abuse" + "Twilio Verify" sections). |
| VERF-03 | Seller must accept marketplace terms to become verified | Wizard step 3 writes `terms_accepted_at` + `terms_version` to `profiles_private` via a Server Action (same Zod schema client+server). See "Data Model" + "Terms acceptance". |
| VERF-04 | Verified Seller badge shown on profile of sellers who completed email + phone + terms | Server-computed boolean derived from (email_confirmed AND phone_verified AND terms_accepted) — see "Badge computation". Rendered on `/u/[username]` as shadcn `Badge` + lucide icon. Public-readable as a **boolean only** (no PII). |
</phase_requirements>

## Summary

Phase 2 adds a **post-signup, on-intent-to-sell verification wizard** that confirms a phone number via SMS OTP, captures marketplace-terms acceptance, and surfaces a server-computed **Verified Seller** badge on the public profile. The load-bearing risk is **SMS-pumping toll fraud** (PITFALLS Pitfall 10): the OTP *send* path must be wrapped — before it ever reaches Twilio — by an invisible bot check, a +1-only geo gate, per-phone/per-IP rate limits, and a hard spend cap, in that order.

The single most important architectural decision: **call Twilio Verify directly from a Server Action — do NOT route phone OTP through Supabase Auth (`auth.updateUser`/`verifyOtp`).** Three reasons: (1) the CONTEXT pins "Twilio Verify defaults" (10-min lifetime, 5 attempts, 6-digit) which are *Twilio Verify Service* settings, not Supabase GoTrue OTP settings; (2) Supabase Auth's phone path creates a phone identity on `auth.users` and its native rate limiting (1/60s, 1h expiry) does not match the required 3/hr + 5/day policy, nor does it give you a place to insert BotID/geo/spend-cap *before* the send; (3) routing through GoTrue would scatter the phone across `auth.users.phone` and complicate the PII-in-`profiles_private` invariant. Treating Twilio Verify as a standalone service the Server Action orchestrates keeps the phone as PII in `profiles_private`, keeps the badge a pure computed function, and puts the full anti-abuse stack under our control.

**Primary recommendation:** Server Action calls — in order — `checkBotId()` → E.164 normalize + `+1`-only validation (`libphonenumber-js`) → atomic Postgres rate-limit check (3/hr, 5/day per phone, also per IP) → spend-cap check → `twilio.verify.v2.services(SID).verifications.create({to, channel:'sms'})`. A second Server Action runs `verificationChecks.create({to, code})`; on `status === 'approved'` it writes `phone` + `phone_verified_at` to `profiles_private`. CAPTCHA = **Vercel BotID** (invisible, zero-friction, native to the existing Vercel host, free Basic tier, `checkBotId()` inside the Server Action). Badge = a SQL function / generated boolean computed from the three conditions, exposed publicly as a boolean only.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **twilio** (Node SDK) | `6.0.2` | Twilio Verify send (`verifications.create`) + check (`verificationChecks.create`) | Official Twilio Node helper; Verify v2 is the current API. Server-only (uses Account SID + Auth Token). **HIGH** |
| **botid** (Vercel BotID) | `1.5.11` | Invisible CAPTCHA / bot check in front of the OTP send Server Action | Native to Vercel (the host); no widget, zero user friction; `checkBotId()` runs server-side in the Server Action; Basic tier free on all plans. **HIGH** |
| **libphonenumber-js** | `1.13.5` | Parse/normalize phone to E.164 + validate `+1` (US/CA) country before calling Twilio | The standard JS port of Google libphonenumber; `parsePhoneNumberFromString` → `.isValid()` + `.country`/`.countryCallingCode`. Smaller than `google-libphonenumber`. **HIGH** |

### Supporting (already in the project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/ssr` | `0.10.x` (installed) | Cookie-bound server client; `getClaims()`/`getUser()` to identify the verifying user | The wizard Server Actions authenticate the caller; phone/terms writes go to the caller's own `profiles_private` row (RLS owner-scoped). |
| `@supabase/supabase-js` | `2.106.x` (installed) | Admin client (`lib/supabase/admin.ts`) for the rate-limit/spend-cap tables and admin alert | Service-role, server-only — used for the abuse-tracking writes that must not depend on the user's RLS context. |
| `react-hook-form` + `zod@4` + `@hookform/resolvers@5` | installed | Wizard form state + the **one** Zod schema shared client (UX) and server (trust boundary) | Phone-entry schema, OTP-entry schema, terms-acceptance schema. |
| `shadcn/ui` Badge + `lucide-react` (`ShieldCheck`/`BadgeCheck`) | installed | Verified badge UI; `InputOTP` for the 6-box code | `npx shadcn@latest add badge input-otp` (see Code Examples). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **Vercel BotID** | **Cloudflare Turnstile** | Turnstile is a *visible* (managed) widget needing a sitekey + secret + a `/siteverify` round-trip, a `<Turnstile>` client component, and adds a second vendor/origin (CSP, ad-block sensitivity). BotID is invisible, host-native (Vercel), no keys, `checkBotId()` directly in the Server Action, free Basic tier. For "low/zero friction, in front of the send button" BotID wins on every axis here. Choose Turnstile only if the app later leaves Vercel. **Decision: Vercel BotID.** |
| **Twilio Verify direct (Server Action)** | **Supabase Auth phone OTP** (`updateUser`/`verifyOtp` with Twilio as SMS provider) | Supabase Auth would manage the OTP lifecycle, but: native limits (1/60s, 1h) ≠ the required 3hr/5day policy; no insertion point for BotID/geo/spend-cap before send; creates a phone identity on `auth.users` (PII leaks out of `profiles_private`); CONTEXT's "Twilio Verify defaults" are Verify-Service settings GoTrue doesn't expose. **Decision: direct Twilio Verify.** |
| **Postgres rate-limit table** | **Upstash Redis** / `@upstash/ratelimit` | Upstash is the canonical serverless rate-limit store, but it is **new infra** with no other use in this app yet. Postgres (already present) does fixed/sliding-window counting fine at launch scale and keeps the abuse log queryable by the future admin console (Phase 10). STACK.md says "no external search engine in v1" — same spirit: don't add infra without payoff. **Decision: Postgres table** (revisit Upstash only if write contention shows up). |
| **libphonenumber-js** | **Twilio Lookup API** | Lookup is a paid network call per number and overkill for "+1 only" gating; do the E.164 + country check locally and free. Reserve Lookup for line-type fraud signals if abuse rises. |

**Installation:**
```bash
npm install twilio botid libphonenumber-js
npx shadcn@latest add badge input-otp
```

## Architecture Patterns

### Recommended Structure (additions to the existing tree)
```
app/
├── (app)/
│   └── verify/                      # the wizard (force-dynamic, authenticated)
│       ├── page.tsx                 # resumes to the correct step from server state
│       ├── phone-step.tsx           # 'use client' — phone entry (RHF + zod)
│       ├── otp-step.tsx             # 'use client' — 6-box InputOTP + resend countdown
│       └── terms-step.tsx           # 'use client' — checkbox + link, accept
├── (public)/u/[username]/page.tsx   # EXISTING — add the Verified badge render
lib/
├── verify/
│   ├── twilio.ts                    # 'server-only' Twilio Verify client (send/check)
│   ├── phone.ts                     # E.164 normalize + +1-only validation (libphonenumber-js)
│   ├── ratelimit.ts                 # 'server-only' Postgres window counters (3/hr, 5/day; phone+IP)
│   └── schema.ts                    # shared Zod schemas (phone, otp, terms)
├── actions/
│   └── verify.ts                    # 'use server' — sendOtp / checkOtp / acceptTerms actions
instrumentation-client.ts            # NEW — initBotId({ protect: [{ path:'/verify', method:'POST' }] })
next.config.ts                       # wrap export with withBotId(...)
supabase/migrations/
└── 0002_verification.sql            # phone nullable + phone_verified_at + terms_version; otp_attempts/spend tables; is_verified function
```

### Pattern 1: The hardened OTP send Server Action (order is load-bearing)
**What:** Every guard runs *before* the Twilio call; the first failure short-circuits so a bot/over-limit/out-of-region request never costs an SMS.
**When:** The "send code" and "resend" actions.
```ts
// lib/actions/verify.ts
'use server';
import { checkBotId } from 'botid/server';
import { createClient } from '@/lib/supabase/server';
import { toE164Plus1 } from '@/lib/verify/phone';
import { consumeSendBudget } from '@/lib/verify/ratelimit';
import { sendVerification } from '@/lib/verify/twilio';
import { sendOtpSchema } from '@/lib/verify/schema';
import { headers } from 'next/headers';

export async function sendOtp(input: unknown) {
  // 1) BOT CHECK — invisible, before anything paid happens
  const { isBot } = await checkBotId();
  if (isBot) return { ok: false, error: 'blocked' };

  // 2) AUTH — verification is a post-signup step (getClaims, not getSession)
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: 'unauthenticated' };

  // 3) VALIDATE + NORMALIZE + GEO (+1 only) — same Zod schema as the client
  const parsed = sendOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const e164 = toE164Plus1(parsed.data.phone);    // throws/returns null if not +1 & valid
  if (!e164) return { ok: false, error: 'region_unsupported' };

  // 4) RATE LIMIT (3/hr, 5/day) per phone AND per IP  + 5) SPEND CAP
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const gate = await consumeSendBudget({ userId, e164, ip }); // atomic; also checks global spend cap
  if (!gate.ok) return { ok: false, error: gate.reason };      // 'rate_limited' | 'spend_cap'

  // 6) ONLY NOW: pay for the SMS
  await sendVerification(e164);                                 // twilio verify create
  return { ok: true };
}
```

### Pattern 2: Twilio Verify client (server-only, Verify v2)
**What:** Thin wrapper; the OTP code, lifetime (10 min), and max attempts (5) are configured on the **Verify Service** in the Twilio console, not in code.
```ts
// lib/verify/twilio.ts
import 'server-only';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const SERVICE = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function sendVerification(toE164: string) {
  return client.verify.v2.services(SERVICE)
    .verifications.create({ to: toE164, channel: 'sms' });
}

export async function checkVerification(toE164: string, code: string) {
  const res = await client.verify.v2.services(SERVICE)
    .verificationChecks.create({ to: toE164, code });
  return res.status === 'approved'; // 'pending' | 'approved' | 'canceled' | 'max_attempts_reached' | 'expired'
}
```
> **Twilio Verify Service config (console, once):** Code length **6**, code lifetime **600s (10 min)**, max check attempts **5**, channel **SMS**. Enable **Fraud Guard** and set **Verify Geo Permissions** to allow **only United States + Canada** (defense-in-depth behind the app's `+1` check). Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` — all server-only, NO `NEXT_PUBLIC_`.

### Pattern 3: +1-only E.164 normalization (geo allowlist, first line of defense)
```ts
// lib/verify/phone.ts
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Returns the E.164 string iff the number is a valid US/Canada (+1) number, else null. */
export function toE164Plus1(raw: string): string | null {
  const p = parsePhoneNumberFromString(raw, 'US'); // default region helps bare 10-digit input
  if (!p || !p.isValid()) return null;
  if (p.countryCallingCode !== '1') return null;     // +1 only (US, CA, and NANP)
  // Optional tighten: restrict to country 'US' | 'CA' specifically:
  if (p.country !== 'US' && p.country !== 'CA') return null;
  return p.number; // E.164, e.g. "+15125550123"
}
```

### Pattern 4: Server-computed Verified badge (recomputed, never a stored "true")
**What:** The badge is a pure function of three conditions, so it auto-disappears when any becomes false (e.g. phone changed → `phone_verified_at` cleared). Compute it in SQL so the public read is just a boolean.
**When:** Read on `/u/[username]`; never persisted as a standalone "verified=true" flag that can drift.
```sql
-- A SECURITY DEFINER function reads the private signals + auth state and returns a bool.
-- Public surface calls it (or a wrapping view) and only ever sees the boolean.
create or replace function public.is_verified_seller(profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select
    coalesce((select u.email_confirmed_at is not null
              from auth.users u where u.id = profile_id), false)
    and coalesce((select p.phone_verified_at is not null
                  from public.profiles_private p where p.id = profile_id), false)
    and coalesce((select p.terms_accepted_at is not null
                  from public.profiles_private p where p.id = profile_id), false);
$$;
grant execute on function public.is_verified_seller(uuid) to anon, authenticated;
```
> This mirrors the existing `active_listing_count(uuid)` pattern (Phase 1) exactly: a `security definer` function the public profile page calls so no PII column is ever exposed — only the derived boolean. **Do NOT** add a writable `is_verified` column; that is the "assume verification is permanent" anti-pattern CONTEXT forbids.

### Pattern 5: Resume-on-abandon (wizard state lives in the DB, not the client)
**What:** `/verify` server component reads the user's current state and renders the right step. No phone yet → phone step. `phone` set but `phone_verified_at` null → OTP step (resend allowed). `phone_verified_at` set but no `terms_accepted_at` → terms step. All three → already verified (bounce to profile/sell).
**When:** Every entry to `/verify`. State derives from `profiles_private` columns — the same source the badge uses — so there is one source of truth.

### Anti-Patterns to Avoid
- **Routing OTP through Supabase Auth** (`updateUser({phone})`/`verifyOtp`): see Summary — fragments PII onto `auth.users`, wrong rate-limit semantics, no pre-send guard hook. Use direct Twilio Verify.
- **Stored `is_verified` boolean column set once:** drifts; violates "recompute" requirement. Compute it.
- **Bot check / rate-limit AFTER the Twilio call:** the SMS is already paid for — pointless. Order matters.
- **Phone in `profiles_public` or any public table:** phone is PII → `profiles_private` only (CLAUDE.md invariant 1).
- **`getSession()` in the wizard actions:** use `getClaims()`/`getUser()` (CLAUDE.md invariant 6; PITFALLS Pitfall 6).
- **Client-only OTP/region check:** a malicious client skips it; every guard re-runs server-side in the Server Action (same Zod schema).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OTP generation, storage, expiry, attempt-counting | A custom `otp_codes` table + hashing + timers | **Twilio Verify** (`verifications`/`verificationChecks`) | Twilio owns code lifecycle, 10-min expiry, 5-attempt lockout, delivery. Rolling your own re-introduces every OTP CVE. |
| Bot detection in front of the send | Honeypots / homemade JS challenges | **Vercel BotID** `checkBotId()` | ML-based, invisible, host-native, free Basic tier; hand-rolled challenges are trivially bypassed by Playwright/Puppeteer (BotID's stated target). |
| Phone parse/validate/normalize + region detection | Regexes for E.164 / NANP | **libphonenumber-js** | NANP, extensions, formatting, validity are full of edge cases; the Google port handles them. |
| Per-country SMS blocking | App-only country list | **App `+1` check + Twilio Verify Geo Permissions + Fraud Guard** | Defense in depth: app rejects fast/free; Twilio blocks at the provider even if app logic regresses. |
| Spend protection | Hoping the bill stays low | **Twilio billing alerts/usage triggers + app-side spend-cap counter** | Hard ceiling + admin alert per CONTEXT; the app counter cuts sends, Twilio triggers are the backstop. |

**Key insight:** This phase is mostly *orchestration of managed services* (Twilio Verify + Vercel BotID) wrapped by a small amount of app-owned policy (geo, rate limit, spend cap, badge math). The danger is hand-rolling the parts the services already do safely.

## Common Pitfalls

### Pitfall 1: SMS pumping / toll fraud (PITFALLS #10 — the phase-defining risk)
**What goes wrong:** An unprotected "send OTP" endpoint is flooded by bots to trigger mass SMS to premium routes the attacker profits from. Bills spike overnight.
**Why it happens:** The endpoint is necessarily reachable by not-yet-trusted users; teams test with their own phone and never simulate abuse.
**How to avoid:** The full stack in Pattern 1 — BotID → `+1`-only geo → 3/hr+5/day per phone+IP rate limit → spend cap → only then Twilio. Plus Twilio Fraud Guard + Geo Permissions (US/CA only) as provider-side backstop, and Twilio usage-trigger billing alerts.
**Warning signs:** Many sends, few `approved` checks; sends to non-`+1`; spend climbing without sign-ups.

### Pitfall 2: Phone PII leaking out of `profiles_private`
**What goes wrong:** Phone gets written to `profiles_public` or onto `auth.users.phone` (the latter happens automatically if you use Supabase Auth phone flow), where a public read can reach it.
**How to avoid:** Phone lives ONLY in `profiles_private` (owner-RLS). Direct-Twilio approach keeps `auth.users.phone` empty. Re-run the Phase 1 PII contract test (`tests/integration/_supabase.ts` `PII_KEYS`) — it already lists `phone`; assert it never appears in any anon read and the badge boolean does.
**Warning signs:** `phone` key in any anon JSON payload; `auth.users.phone` populated.

### Pitfall 3: The existing migration makes `phone` and `terms_accepted_at` NOT NULL at signup
**What goes wrong:** `0001_foundation_privacy.sql` defines `profiles_private.phone text not null` and `terms_accepted_at timestamptz not null`, both populated by the signup trigger from registration metadata. But CONTEXT's model is **phone + terms happen later, on intent to sell** — so at signup there may be no real verified phone and no marketplace-terms acceptance yet. There is a semantic clash: the column already holds a *registration-form* phone (unverified) and a *registration* terms timestamp, which are NOT the same as a *verified* phone and *marketplace-terms* acceptance.
**How to avoid:** In `0002_verification.sql`: **add** `phone_verified_at timestamptz` (null until OTP approved) and `terms_version text` + treat the *marketplace*-terms acceptance as `terms_accepted_at` being (re)set with a version at wizard step 3. Decide explicitly with the planner whether the registration `phone` is reused as the default in the wizard (pre-fill) or ignored. Keep the badge keyed on `phone_verified_at` (not the mere presence of `phone`) so an unverified registration phone never grants a badge. **This conflict MUST be resolved in the plan — see Open Questions #1.**
**Warning signs:** A user shows Verified immediately after signup without ever doing OTP.

### Pitfall 4: BotID protected-path mismatch
**What goes wrong:** `checkBotId()` returns "bot" for real users because the page that invokes the Server Action isn't listed in `initBotId({ protect: [...] })`, or local dev confusion (`isBot` is always `false` locally unless `developmentOptions` is set).
**How to avoid:** Register the `/verify` page path (the route that *invokes* the action) with `method:'POST'` in `instrumentation-client.ts`; wrap `next.config.ts` with `withBotId`. Remember production-only enforcement — test via a `fetch`/form submit from the page, never `curl`.
**Warning signs:** All submissions blocked in prod, or none blocked when you expect them.

### Pitfall 5: Rate-limit policy keyed only by phone (or only by IP)
**What goes wrong:** Attacker rotates phones behind one IP, or one phone behind many IPs, to evade a single-key limit.
**How to avoid:** Enforce BOTH dimensions (per phone: 3/hr, 5/day; per IP: a parallel cap) in one atomic DB transaction; deny if either trips. Capture IP + user agent for the Phase 10 abuse queue.
**Warning signs:** Same IP, many distinct destination numbers; same number, many IPs.

### Pitfall 6: Caching the personalized wizard / profile-with-badge
**What goes wrong:** `/verify` is per-user; if statically cached it could resume the wrong user's step. The public profile is anon-safe and cacheable, but the badge must reflect current computed state.
**How to avoid:** `/verify` (and any authenticated route) is `force-dynamic` and uses `getClaims()`/`getUser()` (CLAUDE.md invariant 6). The public profile may stay cacheable (it already is in Phase 1) since the badge is a boolean from a function — but if revocation must reflect instantly, read it dynamically.
**Warning signs:** A user resumes into someone else's wizard state; stale badge after phone change.

## Code Examples

### shadcn OTP input (6 boxes, paste-friendly, auto-advance) — built-in
```tsx
// otp-step.tsx  ('use client')
// Source: https://ui.shadcn.com/docs/components/input-otp  (built on input-otp by @guilhermerodz)
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

<InputOTP maxLength={6} value={code} onChange={setCode}>
  <InputOTPGroup>
    {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
  </InputOTPGroup>
</InputOTP>
// maxLength=6 gives auto-advance + full-code paste out of the box.
```

### Verified badge on the public profile
```tsx
// in (public)/u/[username]/page.tsx — read the computed boolean via RPC (mirrors active_listing_count)
const { data: verified } = await supabase.rpc('is_verified_seller', { profile_id: id });
// ...
{verified && (
  <Badge variant="secondary" className="gap-1">
    <BadgeCheck className="size-3.5" aria-hidden /> Verified
  </Badge>
)}
```

### Resend countdown (visible, not just disabled)
```tsx
// otp-step.tsx — disable resend for 30–60s with a live countdown
const [left, setLeft] = useState(0);
useEffect(() => { if (!left) return; const t = setInterval(() => setLeft(s => s-1), 1000); return () => clearInterval(t); }, [left]);
// after a successful sendOtp/resend: setLeft(45);
<Button disabled={left>0} onClick={resend}>{left>0 ? `Resend in ${left}s` : 'Resend code'}</Button>
```

### Twilio Verify Service config via API (alternative to console; one-time)
```ts
// code length, lifetime, attempts are Service-level settings (set once, console or API)
await client.verify.v2.services.create({
  friendlyName: 'TakeOffParts OTP',
  codeLength: 6,        // 6-digit
  // lifetime (default 600s/10min) and max check attempts (5) are Verify defaults — confirm in console
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Visible CAPTCHA (reCAPTCHA v2 checkbox) | Invisible bot scoring (Vercel BotID / Turnstile managed) | 2024–2026 | Zero user friction in front of the send button (CONTEXT requirement). |
| Hand-rolled OTP tables | Managed Verify services (Twilio Verify v2) with Fraud Guard + Geo Permissions | Verify v2 + Fraud Guard (current) | Provider owns lifecycle + fraud defense; app owns only policy. |
| `auth.uid()` un-wrapped in RLS | `(select auth.uid())` | CVE-2025-48757 era | Already followed in Phase 1 migration; continue in 0002. |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs` — deprecated (STACK.md); use `@supabase/ssr` (already in use).
- Twilio Verify v1 API — use v2 (`client.verify.v2...`).

## Open Questions

1. **Registration phone/terms vs verified phone/terms (NOT NULL clash).** *(Pitfall 3.)*
   - What we know: `0001` stores a NOT NULL `phone` + NOT NULL `terms_accepted_at` from the *registration* form/metadata. CONTEXT wants phone+terms captured *later*, on intent to sell, and the badge keyed on *verified* phone + *marketplace*-terms.
   - What's unclear: Does registration actually collect a phone today (the Phase 1 form/trigger reads `raw_user_meta_data->>'phone'`)? Is that phone pre-filled into the wizard, or is the wizard phone independent? Is the existing `terms_accepted_at` "registration TOS" (distinct from marketplace terms) or the same thing?
   - Recommendation: In planning, inspect the Phase 1 registration form and trigger; then `0002` adds `phone_verified_at` (+ `terms_version`) and the badge keys on `phone_verified_at IS NOT NULL`. Pre-fill the wizard from the existing `phone` for UX but require an OTP regardless. Resolve verbatim with the user if "registration terms" ≠ "marketplace terms."

2. **Spend-cap threshold value (Claude's discretion, needs a number).**
   - What we know: Behavior is "block new sends + alert admin." Mechanism = app-side counter (Postgres) + Twilio usage-trigger billing alert.
   - What's unclear: The actual dollar/volume ceiling.
   - Recommendation: Pick a conservative launch ceiling (e.g. N sends/day globally, well above expected legit volume given +1-only + per-phone caps) and a Twilio usage trigger at a matching $ amount; make it an env var so it is tunable without a deploy.

3. **Where the admin alert goes (Phase 10 is the admin console).**
   - What we know: Spend-cap breach must "alert admin"; the admin console doesn't exist until Phase 10.
   - Recommendation: Minimal now — reuse the existing Resend email path to email the marketplace admin address, and write an `abuse_event` row for Phase 10 to surface. Don't build admin UI here.

## Validation Architecture

> `.planning/config.json` does not set `workflow.nyquist_validation`; `workflow.verifier` is `true` and this phase is security-critical, so a test map is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.x` (unit + integration), Playwright `1.60` (e2e) — both already configured |
| Config file | `vitest` via `vite-tsconfig-paths`; `playwright.config` for e2e |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm test && npm run test:e2e` |
| Integration auth model | Anon-key client against Supabase Staging, self-skips without env (`tests/integration/_supabase.ts`, `INTEGRATION_ENABLED`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VERF-02 | Non-`+1` numbers rejected before Twilio call | unit | `vitest run tests/unit/phone.test.ts` | ❌ Wave 0 |
| VERF-02 | Valid US/CA → correct E.164 | unit | `vitest run tests/unit/phone.test.ts` | ❌ Wave 0 |
| VERF-02 | Rate limit trips at 4th/hr and 6th/day per phone; per-IP cap trips | unit/integration | `vitest run tests/unit/ratelimit.test.ts` | ❌ Wave 0 |
| VERF-02 | `sendOtp` short-circuits on `isBot` (mock `checkBotId`) and never calls Twilio (mock) | unit | `vitest run tests/unit/send-otp.test.ts` | ❌ Wave 0 |
| VERF-02 | `checkOtp` sets `phone_verified_at` only on `approved` (mock Twilio) | unit | `vitest run tests/unit/check-otp.test.ts` | ❌ Wave 0 |
| VERF-04 | `is_verified_seller` returns true only when all 3 conditions hold; flips false when `phone_verified_at` cleared | integration (SQL) | `vitest run tests/integration/badge.test.ts` | ❌ Wave 0 |
| VERF-04 / privacy gate | Anon read of profile exposes the badge **boolean** but NO `phone`/PII keys | integration | `vitest run tests/integration/privacy.contract.test.ts` (extend existing) | ✅ extend |
| VERF-03 | `acceptTerms` writes `terms_accepted_at` + `terms_version` for owner only (RLS) | integration | `vitest run tests/integration/rls.test.ts` (extend) | ✅ extend |
| VERF-02/03 | Wizard resumes to correct step from persisted state | e2e | `npm run test:e2e -- verify-wizard` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (fast unit + self-skipping integration).
- **Per wave merge:** `npm test && npm run test:e2e`.
- **Phase gate:** Full suite green + the PII contract test green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/phone.test.ts` — `toE164Plus1` accepts US/CA, rejects non-`+1`, normalizes 10-digit (VERF-02)
- [ ] `tests/unit/ratelimit.test.ts` — window counters trip at policy edges, per-phone AND per-IP (VERF-02)
- [ ] `tests/unit/send-otp.test.ts` / `check-otp.test.ts` — mock `botid/server` + `twilio`; assert guard order and no-Twilio-on-block (VERF-02)
- [ ] `tests/integration/badge.test.ts` — `is_verified_seller` truth table incl. revocation-on-phone-change (VERF-04)
- [ ] Extend `tests/integration/privacy.contract.test.ts` — badge boolean present, `phone` absent (privacy gate)
- [ ] `e2e/verify-wizard.spec.ts` — resume-on-abandon across steps (VERF-02/03)
- [ ] Framework install: none — Vitest + Playwright already present.

## Sources

### Primary (HIGH confidence)
- Vercel BotID — https://vercel.com/docs/botid + https://vercel.com/docs/botid/get-started (invisible CAPTCHA, `withBotId`, `initBotId`, `checkBotId()` in Server Actions, free Basic tier, local-dev behavior) — fetched 2026-06-03
- Twilio Verify — https://www.twilio.com/docs/verify/api/verification + /verification-check (v2 `verifications.create` / `verificationChecks.create`, E.164, statuses) — verified
- Twilio Verify toll-fraud defenses — https://www.twilio.com/docs/verify/preventing-toll-fraud/verify-geo-permissions + /sms-fraud-guard (Geo Permissions US/CA, Fraud Guard) — verified
- Twilio Verify programmable rate limits — https://www.twilio.com/docs/verify/api/programmable-rate-limits (provider-side backstop option) — verified
- libphonenumber-js — https://www.npmjs.com/package/libphonenumber-js + https://github.com/catamphetamine/libphonenumber-js (`parsePhoneNumberFromString`, `.isValid()`, `.country`, `.countryCallingCode`, E.164 `.number`) — verified
- npm registry (versions, 2026-06-03): `twilio@6.0.2`, `botid@1.5.11`, `libphonenumber-js@1.13.5`
- Project Phase 1 artifacts — `supabase/migrations/0001_foundation_privacy.sql` (PII split, `security definer` derived-value pattern), `tests/integration/_supabase.ts` (`PII_KEYS` incl. `phone`), `lib/supabase/admin.ts`, `tests/unit/geo.test.ts` (US/CA-only geo precedent)
- Supabase Phone Login — https://supabase.com/docs/guides/auth/phone-login (confirms native limits 1/60s + 1h expiry; basis for NOT using GoTrue phone path) — verified

### Secondary (MEDIUM confidence)
- shadcn `input-otp` — https://ui.shadcn.com/docs/components/input-otp (6-box, paste, auto-advance) — standard
- Rate-limit-store recommendation (Postgres over Upstash for v1) — reasoned from STACK.md "no new infra in v1" stance + Postgres already present; not a single canonical source.

## Metadata

**Confidence breakdown:**
- Standard stack (Twilio Verify, BotID, libphonenumber-js, versions): HIGH — official docs + npm verified 2026-06-03.
- Architecture (direct-Twilio over GoTrue, computed badge, guard order, PII placement): HIGH — follows CLAUDE.md invariants + Phase 1 precedents; the GoTrue-vs-direct call is a reasoned design decision (documented tradeoffs).
- Pitfalls: HIGH — mirror PITFALLS.md #2/#3/#6/#10 and a real schema clash found in `0001`.
- Rate-limit store + spend-cap threshold + admin-alert wiring: MEDIUM — discretion areas with concrete recommendations, flagged in Open Questions.

**Research date:** 2026-06-03
**Valid until:** ~2026-07-03 (30 days; Twilio Verify + libphonenumber-js stable; BotID is newer/faster-moving — re-confirm `botid` API if planning slips a month)
