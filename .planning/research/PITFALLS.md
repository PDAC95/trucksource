# Pitfalls Research

**Domain:** Privacy-first truck-parts marketplace + specialized social network (Next.js 15 App Router + Supabase)
**Researched:** 2026-06-01
**Confidence:** HIGH for PII/RLS/Next.js auth & caching (Supabase + Next.js official docs, CVE-2025-48757 reporting); MEDIUM for fitment search, chat abuse, cold start, SMS fraud (multiple credible secondary sources, verified against official Postgres/Twilio docs where possible)

---

This product's entire value proposition is **"the seller's real identity is never exposed."** That makes PII leakage not a generic security concern but an existential one: a single leak (an address visible in an API response, a GPS coordinate baked into a photo) destroys the core promise. Pitfalls below are ordered so the most product-fatal ones come first.

## Critical Pitfalls

### Pitfall 1: PII columns leak through over-fetching, JOINs, and `select('*')`

**What goes wrong:**
The seller's private columns (first/last name, email, phone, street, postal code) live in the same database as public listing data. A developer writes `supabase.from('listings').select('*, profiles(*)')` to render a listing card, and the `profiles(*)` pulls the *entire* profile row — including PII — into the API response. Even if the UI only renders `username` and `State, Country`, the private fields are now in the JSON payload sent to the browser, visible in DevTools Network tab and to any scraper. This is the single most common way "privacy-first" marketplaces leak: not a dramatic breach, just a careless `select`.

**Why it happens:**
- `select('*')` is the path of least resistance and gets copy-pasted.
- Supabase's nested-resource syntax (`profiles(*)`) makes JOINs trivial, so pulling the whole related row feels natural.
- The UI looks correct (PII isn't rendered), so the leak is invisible in manual testing — it only shows in the network payload.
- RLS protects *rows* by default, not *columns*. A seller can read their own full profile row legitimately; the bug is exposing it to *other* users via a relationship query.

**How to avoid:**
1. **Physically separate PII from public data.** Two tables: `profiles` (public: `user_id`, `username`, `state`, `country`, `member_since`, `is_verified`) and `private_profiles` (PII: names, email, phone, address, postal). Public queries can only ever touch `profiles`. This is a structural guarantee, not a discipline-based one.
2. **Never `select('*')` on anything joined to user data.** Enumerate columns explicitly, always. Add a lint rule / code-review checklist item banning `select('*')` and `(*)` nested selects in public-facing queries.
3. **Use a Postgres VIEW or a `SECURITY INVOKER` view (`public_listings`) that exposes only safe columns**, and point all public reads at the view, not the base table.
4. **Column-level grants:** `REVOKE` SELECT on PII columns from the `anon` and `authenticated` roles so even a mistaken `select('*')` returns nothing for those columns. Postgres supports column-level privileges; use them as a backstop.
5. **Contract-test the JSON shape:** write an automated test that fetches a public listing as an anonymous user and asserts the response body contains NO email/phone/name/address keys.

**Warning signs:**
- Any `select('*')` in the codebase touching `profiles`, `users`, or contact data.
- A single `profiles` or `users` table holding both `username` and `email`/`phone`/`address`.
- Network payloads on listing/feed pages containing fields the UI never renders.
- RLS policies that allow `authenticated` to `SELECT` the whole profile table for "convenience."

**Phase to address:**
Data-model / schema phase (PII/public separation must be the *first* schema decision). Re-verify in every phase that adds a public surface (listings, feed, comments, profile, chat).

---

### Pitfall 2: RLS disabled, missing, or too permissive (the CVE-2025-48757 class)

**What goes wrong:**
A table is created (via SQL editor or Table Editor) and RLS is **off by default**, so anyone with the public `anon` key — which ships in the browser bundle by design — can read, update, or delete every row. In the 2025 CVE-2025-48757 wave, ~10% of audited Supabase/Lovable apps were leaking data this exact way. Variants: RLS *enabled* but with a permissive policy like `USING (true)`, or a policy on `authenticated` that doesn't scope rows to `auth.uid()`, letting any logged-in user read every other user's private data.

**Why it happens:**
- RLS is **opt-in per table**. Forget one table (e.g. `contact_submissions`, `messages`, `private_profiles`, `reports`) and it's wide open.
- The `anon` key is publicly embedded in the client (correct and expected) — so the *only* thing standing between the public and your data is RLS. People assume the key is a secret; it is not.
- "I'll add policies later" — and later never comes, or a new table added in a later phase silently lacks RLS.
- Policies written against `auth.uid()` without the `(select auth.uid())` wrapping re-evaluate per-row, which both hurts performance and tempts developers to write looser policies.

**How to avoid:**
1. **Enable RLS on every table at creation, no exceptions** — including join tables, log tables, and admin tables. Make `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` part of every migration's definition-of-done.
2. **Default-deny posture:** enable RLS, add zero policies → table is locked. Then add the *minimum* policies needed. Never start from `USING (true)`.
3. **Scope every authenticated policy to the owner:** `USING ((select auth.uid()) = user_id)`. Wrap `auth.uid()` in a subselect so Postgres evaluates it once (CVE-era performance + correctness guidance).
4. **Separate `anon` from `authenticated` policies deliberately.** Public reads of `public_listings` can be `anon`; everything touching PII, chat, contact submissions, and reports must be `authenticated` *and* owner/admin-scoped.
5. **CI check:** query `pg_tables` / `pg_policies` in CI to assert no table in `public` schema has RLS disabled and every table has at least one policy. Supabase's linter/advisor flags RLS-disabled tables — wire it into the pipeline.
6. **Admin access uses the service role on the server only** (see Pitfall 3), never a broad `authenticated` policy that grants admins everything from the client.

**Warning signs:**
- Any migration that creates a table without an accompanying `ENABLE ROW LEVEL SECURITY`.
- Policies containing `USING (true)` or `WITH CHECK (true)`.
- Supabase dashboard "Unrestricted" / "RLS disabled" badge on any table.
- A logged-in test user can fetch another user's messages, contact submissions, or private profile.

**Phase to address:**
Foundational schema/security phase, and a recurring gate in every phase that adds a table. This is the highest-leverage place to put a hard verification checkpoint.

---

### Pitfall 3: Service-role key reaches the client / used in the wrong place

**What goes wrong:**
The `service_role` key bypasses RLS entirely (Postgres superuser-equivalent). In 2025 audits, roughly half of AI-generated Supabase apps had the service_role key reachable from the browser. The classic mistake: prefixing it `NEXT_PUBLIC_SERVICE_ROLE_KEY` so a Server Action or admin feature "just works" — Next.js then **inlines any `NEXT_PUBLIC_`-prefixed var into the client bundle at build time**, publishing a full admin credential to the internet. A subtler variant: in `@supabase/ssr`, initializing the SSR client with the service-role key — the user's session cookie overrides the service-role authorization header, producing confusing RLS errors and tempting devs to "fix" it by loosening policies.

**Why it happens:**
- Admin/analytics features and the contact-logging "copy to admin" flow legitimately need to bypass RLS, so reaching for service_role is natural.
- The `NEXT_PUBLIC_` prefix is required for the *anon* key, so devs habitually prefix the service key too.
- Next.js's build-time inlining of `NEXT_PUBLIC_*` is silent — there's no warning that you just shipped a secret.

**How to avoid:**
1. **Service-role key: server-only, never `NEXT_PUBLIC_`.** Name it `SUPABASE_SERVICE_ROLE_KEY`. Use it exclusively inside Route Handlers / Server Actions / server-only modules.
2. **Create a dedicated server admin client with `supabase-js` directly** (not `@supabase/ssr`), so no user cookie can override the auth header. Keep it in a file marked `import 'server-only'` so an accidental client import is a build error.
3. **Default to the anon/RLS-respecting client everywhere;** reach for the service-role client only for the few admin/logging operations that genuinely must bypass RLS, and gate those behind a server-side admin authorization check.
4. **Build-time guard:** add a check that fails CI if any `NEXT_PUBLIC_*` env var value matches the service-role key, or scan the built `.next` bundle for the key string.
5. **Rotate immediately if ever exposed** — a leaked service_role key = total database compromise.

**Warning signs:**
- A `NEXT_PUBLIC_` env var holding anything other than the anon key + project URL.
- `service_role` referenced in any file that isn't `server-only`.
- Admin features querying Supabase from a Client Component.

**Phase to address:**
Auth/infrastructure setup phase, before any admin or contact-logging feature is built.

---

### Pitfall 4: EXIF GPS data in listing photos leaks the seller's exact location

**What goes wrong:**
A seller photographs a part in their garage/driveway. The phone embeds **GPS coordinates in the image's EXIF metadata**. The photo is uploaded as-is to Supabase Storage and served from the CDN. Anyone can download the image and read the EXIF to get the seller's home coordinates — **defeating the entire privacy model**, which deliberately shows location only as coarse "State, Country." Worse: server-side image resizing/compression libraries **copy the EXIF block through unchanged** (they optimize pixels, not metadata), so even "we resize on upload" does NOT strip it unless explicitly told to. eBay/Etsy-class platforms have been shown to leave this to undefined second-pass behavior.

**Why it happens:**
- EXIF is invisible in normal use — the image looks fine; the coordinates are in a separate metadata structure.
- Resize/thumbnail pipelines preserve metadata by default.
- The team protects PII in the *database* and forgets that a JPEG is also a data carrier.
- Supabase Storage stores and serves whatever bytes you give it; it does not strip EXIF for you.

**How to avoid:**
1. **Strip ALL metadata server-side on upload**, before the file ever lands in Storage. Use `sharp` with `.rotate()` (to bake in orientation) and **without** `.withMetadata()` — sharp drops EXIF by default unless you explicitly re-attach it. Re-encode every uploaded image; never store the original bytes.
2. **Do the strip on the server (Route Handler / Server Action / Edge Function), not the client** — never trust a client-side strip alone (a malicious client can skip it and POST the raw file).
3. **Strip orientation, GPS, timestamps, device model, and thumbnails** (EXIF thumbnails can themselves contain un-stripped GPS).
4. **Verify with a test:** upload a known photo containing GPS EXIF, fetch the stored object back, and assert `exiftool`/`sharp.metadata()` reports no GPS/maker tags. Make this an automated regression test — this is the single most important "looks done but isn't" check in the project.
5. Treat this as part of the privacy guarantee, not an image-quality nicety.

**Warning signs:**
- Upload pipeline that stores the original file or only client-side resizes.
- Use of `.withMetadata()` in sharp, or an image library that preserves EXIF by default (ImageMagick without `-strip`).
- No automated test asserting zero GPS tags on stored images.

**Phase to address:**
Image-upload / Storage phase. Flag explicitly for deeper research — the downstream consumer called this out as a priority. Must ship in v1 before any photo is public.

---

### Pitfall 5: Next.js Server/Client boundary leaks server-only data to the client

**What goes wrong:**
In the App Router, props passed from a Server Component to a Client Component are **serialized and shipped to the browser** (visible in the HTML/RSC payload). A developer fetches a full seller object (with PII) in a Server Component and passes it as a prop to a `'use client'` listing card — the PII is now in the page source even though the card only renders the username. Related: importing a server-only module (one that holds the service-role client or a secret) into a Client Component bundles the secret into client JS.

**Why it happens:**
- The Server/Client boundary is invisible in the code — props "just flow," and there's no compile error for passing too much.
- Devs fetch a convenient wide object on the server and forget that handing it to a client component publishes it.

**How to avoid:**
1. **Fetch narrow, owner-safe shapes** in Server Components; pass only the exact fields the Client Component renders. Combine with the public/private table split (Pitfall 1) so PII literally isn't in the object you fetched.
2. **Mark secret-holding modules with `import 'server-only'`** so importing them client-side is a build error.
3. **Prefer keeping PII-touching logic in Server Components / Server Actions** and never pass raw rows across the boundary.
4. **Inspect the RSC/HTML payload** in review for any PII fields.

**Warning signs:**
- Server Components passing whole DB rows as props to `'use client'` components.
- Secrets appearing in the browser's view-source or RSC stream.

**Phase to address:**
Auth + first listing-render phase; reinforce in feed and profile phases.

---

### Pitfall 6: Caching/ISR serves one user's private data to another

**What goes wrong:**
Next.js 15 no longer caches `fetch` by default, but `use cache` / `unstable_cache` and static/ISR routes still can. If a route that renders user-specific or PII-adjacent data (chat inbox, contact submissions, "my listings") is statically cached or sits behind a CDN, **a second user can be served the first user's cached HTML/session**. The Supabase docs explicitly warn that trusting `getSession()` in Server Components compounds this because the session from cookies can be spoofed and isn't revalidated.

**Why it happens:**
- Caching defaults shifted between Next.js versions; mental models are stale.
- `use cache` keyed on request inputs (cookies/headers) can "poison" a shared cache if the route is treated as static.
- Personalized pages get accidentally marked static.

**How to avoid:**
1. **Use `supabase.auth.getUser()` (not `getSession()`) in all Server Components, middleware, and server code** — it revalidates the token against the Auth server. This is the official Supabase rule and it directly prevents cross-user leakage.
2. **Mark all authenticated/personalized routes dynamic** (`export const dynamic = 'force-dynamic'` or rely on `cookies()`/`headers()` access to opt out of static). Never statically cache pages that render PII, chat, or per-user data.
3. **Do not use `use cache`/`unstable_cache` for per-user private data** in v1; use plain dynamic rendering. Reserve caching for the public fitment taxonomy and anonymous listing feed.
4. **Refresh sessions in middleware** per the Supabase SSR guide, and never cache responses that set auth cookies.

**Warning signs:**
- `getSession()` used in any server context.
- Authenticated pages without `cookies()`/`headers()` access or dynamic marking.
- A user reports seeing someone else's name/messages after a deploy.

**Phase to address:**
Auth/session phase; re-check on chat and admin phases.

---

### Pitfall 7: Fitment search is slow or returns wrong results; Fitment Intelligence false positives erode trust

**What goes wrong:**
Two failure modes. **(a) Modeling/perf:** the 8-level taxonomy (Make → Model → Configuration → Search Terms → Categories → Materials → Condition → Filters) plus many-to-many tagging is queried with deep recursive JOINs or unindexed `ILIKE '%term%'`, which forces sequential scans and gets slow as listings grow. **(b) Correctness:** trucker slang ("359 Guys," "Flat Glass Kenworth," "Aerodyne") doesn't match literal columns; naive `LIKE` returns wrong or empty results. Most damaging: **Fitment Intelligence auto-suggesting that a part fits trucks it doesn't** — false positives. A buyer who shows up for a part that doesn't actually fit their W900L loses trust permanently, and trust is the product's moat.

**Why it happens:**
- `LIKE '%x%'` with a leading wildcard can't use a B-tree index → seq scan.
- pg_trgm/full-text indexes get skipped if queries aren't written to use them, or a query pattern yields "no extractable trigrams" and degenerates to a full scan.
- Synonyms/slang are treated as a search problem to solve at query time rather than modeled as data.
- Fitment Intelligence is tuned for recall ("appear in every relevant search") which directly increases false-positive risk.

**How to avoid:**
1. **Model the taxonomy explicitly** with proper FK relationships and a dedicated many-to-many `listing_fitments` join table; index every FK. Avoid runtime recursive tree-walking for hot paths — denormalize/materialize the fitment paths a listing belongs to.
2. **Model slang/synonyms as data, not query hacks:** a `search_synonyms` / alias table mapping trucker terms → canonical taxonomy nodes ("359 Guys" → Peterbilt 359). Curate it; this is a domain asset.
3. **Use Postgres full-text search (`tsvector` + GIN index)** for the main keyword search, plus **pg_trgm GIN/GiST index** for fuzzy/misspelling tolerance — and confirm `EXPLAIN ANALYZE` actually uses the index (don't assume).
4. **Make Fitment Intelligence a *suggestion the seller confirms*, not an auto-apply.** Show suggested fitments at listing time; require the seller to accept/reject. Tune for *precision over recall* for auto-suggested fits, and clearly label inferred vs. seller-confirmed fitment in the UI ("Seller confirmed fits" vs "May also fit"). A wrong confirmed-fit is far costlier than a missed one.
5. **Add a "report wrong fitment" affordance** so false positives are caught and the synonym/fitment data improves.

**Warning signs:**
- `EXPLAIN ANALYZE` shows `Seq Scan` on listing/fitment search at any real data volume.
- Search uses `ILIKE '%...%'` on raw columns with no trigram/FTS index.
- Fitment auto-applies suggestions without seller confirmation.
- Buyers commenting "this doesn't fit my truck."

**Phase to address:**
Fitment library/schema phase (modeling + synonym table) and search phase (indexing + Fitment Intelligence precision). Flag for deeper research — taxonomy modeling and the precision/recall tradeoff need careful design.

---

### Pitfall 8: Contact/chat abuse — scams, off-platform circumvention, spam, harassment

**What goes wrong:**
The contact-form→chat flow is the surface scammers and spammers attack. Common failures: (a) scammers immediately push buyers off-platform ("text me on WhatsApp/Telegram") to evade logging — the exact behavior the form-first/admin-copy design exists to fight, but which fails if there's no detection; (b) no rate-limiting, so bots blast the same scam message to every listing; (c) harassment with no block/report path; (d) the "copy to admin" log exists but nobody can act on it (no moderation queue, no ability to disable accounts), so it's logging theater.

**Why it happens:**
- Teams build the happy-path messaging and treat moderation/reporting as "v2."
- Phone/email circumvention is easy to type and hard to detect with naive keyword filters.
- Banning by account only — fraudsters just create a new account.

**How to avoid:**
1. **Persist the contact-form submission to DB before opening chat** (already in the design) — this is the abuse base; ensure it captures enough signal (IP, user agent, timestamps) to detect repeat offenders and enable IP-based block of re-registration.
2. **Rate-limit contact submissions and messages** per account *and* per IP (e.g. N contacts/hour) to kill bot blasting.
3. **Behavior-aware filtering, not just keywords:** flag messages containing phone numbers, emails, or "WhatsApp/Telegram/Cashapp/Zelle/wire" early in a thread for review. Keyword filters alone are evadable; combine with frequency/behavior signals.
4. **Ship reporting + a moderation queue in v1**, not v2: a "Report" button on listings, comments, and messages with categories (scam/phishing, spam/promotion, harassment), feeding the admin Reports area. The plan already lists Reports under admin — make sure the *buyer-facing* report action and the *admin action* (restrict/disable account, block IP) both exist.
5. **Block & mute** between users; disable accounts on confirmed fraud and prevent obvious re-registration (IP/device signals).
6. Consider holding first-contact messages for lightweight screening if abuse volume rises.

**Warning signs:**
- Messaging shipped with no rate limit, no report button, or no admin action on reports.
- Contact logs accumulate but no one reviews/acts on them.
- Spike in identical messages across many listings.

**Phase to address:**
Contact/chat phase (form-first persistence, rate limiting, reporting) and admin phase (moderation queue + enforcement actions). Reporting must NOT be deferred to v2.

---

### Pitfall 9: Cold start — empty marketplace with no listings or buyers

**What goes wrong:**
A two-sided marketplace has no value until both sides show up, but neither wants to be first. Launch with zero listings → buyers arrive, see an empty feed and empty search results, leave immediately, and rarely return. The fitment search — the differentiator — looks broken when there's nothing to find.

**Why it happens:**
- Treating launch as "build it and they'll come."
- Trying to grow both sides everywhere at once instead of concentrating density.

**How to avoid:**
1. **Seed supply first.** Buyers come for inventory; manually onboard sellers and hand-create quality listings before any buyer marketing. Concentrate on **one truck make/region first** (e.g. Peterbilt parts in one state/cross-border corridor) to reach local density rather than thin national coverage.
2. **Single-player utility for sellers:** make listing genuinely better than Facebook/Craigslist (fitment auto-surfacing, clean privacy) so sellers get value even before buyer volume — a Trojan-horse reason to list.
3. **Aggregate where supply already exists** (the Airbnb/Craigslist move): identify sellers already posting take-off parts on Facebook groups/Craigslist and recruit them with better tooling and privacy.
4. **Avoid an empty-looking product:** never show "0 results / empty feed" cold; seed enough real listings that fitment search returns hits on common queries before opening to buyers.
5. **Dual-role advantage:** many truckers/shops are both buyers and sellers — lean into that to ease the cold start.

**Warning signs:**
- Launch plan markets to buyers before there's inventory.
- Search/feed returns empty for common makes at launch.
- Spreading thin across all makes/regions instead of dominating one segment.

**Phase to address:**
Not a build phase per se — a launch/go-to-market and seeding strategy concern. Influences MVP scope (admin tools to bulk-onboard sellers / create listings should exist early) and which segment to build fitment data for first.

---

### Pitfall 10: Phone-verification SMS fraud (SMS pumping / toll fraud)

**What goes wrong:**
The Verified Seller flow requires phone verification (OTP via SMS). An unprotected "send OTP" endpoint is a target for **SMS pumping / Artificially Inflated Traffic**: bots flood the endpoint to trigger mass OTP sends to premium routes the attacker profits from via carrier revenue-share. You pay your SMS gateway per message whether or not a real user requested it — global losses topped $1.2B/yr in 2025; Twitter lost ~$60M/yr to this. A small marketplace can rack up a shocking bill overnight.

**Why it happens:**
- The OTP endpoint is public and unauthenticated by nature (you verify *before* trust).
- Teams test with their own phone and never simulate abuse.
- No per-IP/per-account/per-number rate limits.

**How to avoid:**
1. **Rate-limit OTP sends** per IP, per account, and per destination number (e.g. small N/hour, exponential backoff on retries).
2. **Add a CAPTCHA / bot check** (e.g. Turnstile) before sending an SMS, plus require an authenticated, registered account before phone verification is offered (verification is a post-signup step here, which helps).
3. **Geo/route allowlisting:** restrict OTP destinations to expected countries (North America for this product) — blocks the premium international routes pumping exploits.
4. **Use a provider with built-in fraud protection** (Twilio Verify with Fraud Guard, or similar) rather than rolling raw SMS.
5. **Set hard spend caps/alerts** on the SMS account so an attack can't run up an unbounded bill.

**Warning signs:**
- "Send OTP" callable without auth, CAPTCHA, or rate limit.
- SMS spend spikes or sends to unexpected country codes.
- Many OTP requests, few completed verifications.

**Phase to address:**
Verified Seller phase. Don't ship phone verification without rate limiting + bot check + spend caps.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single `users` table holding PII + public fields | One table, simple JOINs | Every public query is one careless `select('*')` away from leaking PII; hard to retrofit | **Never** — the public/private split is foundational |
| `select('*')` / `profiles(*)` nested selects | Fast to write | Ships hidden PII in payloads | Never on user/PII-adjacent data |
| Skip RLS "for now," add later | Build features faster | Wide-open tables; later-added tables silently unprotected | Never — enable at table creation |
| Client-side-only EXIF strip | No server image lib needed | Malicious client skips it; raw GPS lands in Storage | Never as the only line of defense |
| `ILIKE '%term%'` search, no index | Works in dev with 10 rows | Seq scans, slow search at scale | Only as a throwaway spike, never in the search feature |
| Fitment Intelligence auto-applies suggestions | Listings appear everywhere instantly | False positives erode buyer trust irreversibly | Never auto-apply; require seller confirm |
| Defer reporting/moderation to v2 | Ship messaging sooner | Abuse runs unchecked from day one; logs no one acts on | Never — basic report + admin action are v1 |
| OTP endpoint with no rate limit | Verification "works" | SMS-pumping bill / toll fraud | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase RLS | Assuming RLS on by default; assuming anon key is secret | RLS is opt-in per table; anon key is public — RLS is your only guard |
| Supabase service_role | `NEXT_PUBLIC_` prefix; using it in the `@supabase/ssr` client | Server-only env var; dedicated `supabase-js` admin client in a `server-only` module |
| `@supabase/ssr` + Next.js auth | Trusting `getSession()` in server code | Use `getUser()` server-side; refresh session in middleware |
| Supabase Storage | Expecting it to strip EXIF/resize | It stores raw bytes; strip + re-encode with `sharp` before upload |
| Next.js 15 caching | Assuming old default-cache behavior; statically caching personalized routes | Mark per-user routes dynamic; avoid `use cache` for private data |
| SMS/OTP provider | Public unauthenticated send endpoint | Rate limit + CAPTCHA + geo allowlist + spend cap; prefer Verify-with-FraudGuard |
| Postgres pg_trgm / FTS | Adding the extension but not confirming the index is used | `EXPLAIN ANALYZE`; ensure GIN index + query shape that hits it |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `ILIKE '%x%'` / leading-wildcard search | Slow search, rising DB CPU | pg_trgm GIN index + FTS; rewrite query to use index | Hundreds–thousands of listings |
| Deep recursive JOINs across 8-level taxonomy per request | Slow listing/feed pages | Denormalize/materialize fitment paths; index FKs; cache public taxonomy | Thousands of listings + traffic |
| `auth.uid()` un-wrapped in RLS policy | DB CPU spikes under load | Use `(select auth.uid())` so it evaluates once | Many rows per policy check |
| Unindexed many-to-many `listing_fitments` lookups | Slow filtered search | Composite indexes on join columns | As tagging grows |
| Realtime chat without pagination | Slow thread loads | Paginate messages; index by thread + created_at | Long threads |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| PII columns reachable via RLS/joins/`select('*')` | Core privacy promise broken | Public/private table split + column grants + contract tests |
| Table without RLS | Full data read/write via anon key | Enable RLS at creation; CI assertion |
| service_role key in client bundle | Total DB compromise | Server-only; bundle scan in CI; rotate if leaked |
| EXIF GPS in uploaded photos | Seller's home location exposed | Server-side strip + re-encode; automated no-GPS test |
| `getSession()` trusted server-side | Spoofed/cross-user session | `getUser()` everywhere server-side |
| No rate limit on contact/OTP endpoints | Spam blasting; SMS toll fraud | Per-IP/account/number rate limits + CAPTCHA |
| Logs/analytics capturing PII | Leak via log aggregation/analytics vendor | Scrub PII before logging; never send PII to analytics |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Empty feed/search at launch | Buyers bounce, never return | Seed supply first; never show cold empty results |
| Wrong fitment suggestions | Buyer wastes time, loses trust | Seller-confirmed vs inferred labeling; precision over recall; report-wrong-fitment |
| Slang queries return nothing | "This site doesn't have what I need" | Curated synonym/alias table mapping slang → taxonomy |
| No block/report on harassment | Victims leave the platform | v1 block + report with categories |
| Location shown more precisely than promised | Privacy promise feels broken | Only "State/Province, Country" anywhere public; coarse-only |

## "Looks Done But Isn't" Checklist

- [ ] **Public listing API:** Renders correctly but verify the JSON payload contains NO name/email/phone/address/postal keys (DevTools + automated contract test).
- [ ] **Every table:** Looks queryable but verify RLS is ENABLED and has owner/admin-scoped policies (no `USING (true)`).
- [ ] **Image upload:** Photos display fine but verify stored objects have NO GPS/EXIF (re-download + `exiftool`/`sharp.metadata()` test).
- [ ] **Auth on server:** Pages load but verify `getUser()` (not `getSession()`) is used and personalized routes are dynamic (not CDN-cached).
- [ ] **service_role key:** Admin features work but verify the key is NOT in the client bundle (grep built `.next`, check no `NEXT_PUBLIC_` prefix).
- [ ] **Fitment search:** Returns results but run `EXPLAIN ANALYZE` to confirm index usage (no Seq Scan), and test slang queries return correct hits.
- [ ] **Fitment Intelligence:** Suggests fitments but verify seller must confirm and UI distinguishes confirmed vs inferred.
- [ ] **Contact/chat:** Messages send but verify rate limiting, a working Report button, an admin moderation queue, and that admin actually receives the logged copy.
- [ ] **Phone verification:** OTP arrives but verify rate limiting + CAPTCHA + geo allowlist + spend cap protect the send endpoint.
- [ ] **Comments (public):** Post fine but verify commenter is shown by username only, never PII.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| PII leaked in API payload | HIGH | Patch query, audit access logs, assess breach-notification duties; if PII separated from public table the blast radius is smaller |
| Table shipped without RLS | MEDIUM | Enable RLS + policies immediately; audit anon-key access logs for exfiltration window |
| service_role key exposed | HIGH | Rotate key immediately; audit DB activity; assume full compromise of exposure window |
| EXIF GPS in already-stored photos | MEDIUM | Batch re-process all Storage objects through strip pipeline; notify affected sellers if exposed |
| Cross-user cached session | MEDIUM | Switch to `getUser()`, mark routes dynamic, purge CDN cache |
| Fitment false positives at scale | MEDIUM | Switch auto-apply → seller-confirm; backfill corrections from "report wrong fitment" data |
| SMS pumping bill | LOW–MEDIUM | Add rate limit/CAPTCHA/geo allowlist + spend cap; dispute fraudulent traffic with provider |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PII over-fetch / `select('*')` leak | Schema / data-model (public/private split) | Contract test: anon listing fetch has no PII keys |
| RLS disabled / too permissive | Foundational security; gate every table-adding phase | CI assertion: all `public` tables RLS-on with policies |
| service_role key exposure | Auth/infra setup | Bundle scan; no `NEXT_PUBLIC_` service key |
| EXIF GPS leak | Image upload / Storage | Automated no-GPS-tag test on stored objects |
| Server/Client boundary leak | Listing render / feed | Review RSC payload; `server-only` on secret modules |
| Caching serves private data | Auth/session; chat; admin | `getUser()` used; personalized routes dynamic |
| Fitment slow / wrong / false-positive | Fitment library + search | `EXPLAIN ANALYZE` index use; seller-confirm UI; slang tests |
| Contact/chat abuse | Contact/chat + admin moderation | Rate limits; report button; admin queue + enforcement |
| Cold start | Launch/seeding strategy (influences MVP admin tooling) | Search returns hits for common makes pre-launch |
| SMS pumping | Verified Seller | OTP endpoint rate-limited + CAPTCHA + geo + spend cap |

## Sources

- [Supabase RLS: Common Mistakes, the (select auth.uid()) Trap & CVE-2025-48757 Breakdown](https://vibeappscanner.com/supabase-row-level-security) (MEDIUM)
- [Supabase Security Best Practices: RLS, API Keys & CVE-2025-48757](https://vibeappscanner.com/best-practices/supabase) (MEDIUM)
- [Supabase Docs — Why is my service role key client getting RLS errors](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) (HIGH)
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) (HIGH)
- [Setting up Server-Side Auth for Next.js | Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs) (HIGH)
- [Creating a Supabase client for SSR | Supabase Docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client) (HIGH)
- [Supabase — getSession reference (don't trust server-side)](https://supabase.com/docs/reference/javascript/auth-getsession) (HIGH)
- [Caching (Previous Model) | Next.js Docs](https://nextjs.org/docs/app/guides/caching-without-cache-components) (HIGH)
- [Directives: use cache | Next.js Docs](https://nextjs.org/docs/app/api-reference/directives/use-cache) (HIGH)
- [Fix over-caching with Dynamic IO in Next.js 15 — LogRocket](https://blog.logrocket.com/dynamic-io-caching-next-js-15/) (MEDIUM)
- [EXIF Data Risks: Strip Image Metadata — Mochify](https://mochify.xyz/guides/exif-data-risks-image-compression-2026) (MEDIUM)
- [Strip EXIF and GPS Metadata Before Sharing — Konvrt](https://konvrt.dev/blog/exif-metadata-stripping-guide-2026) (MEDIUM)
- [Unstripped Image Metadata (EXIF) Leakage via File Upload — GHSA advisory](https://github.com/NeoRazorX/facturascripts/security/advisories/GHSA-q7f2-rv22-2xgr) (HIGH, real advisory)
- [pg_trgm — PostgreSQL Documentation](https://www.postgresql.org/docs/current/pgtrgm.html) (HIGH)
- [Postgres Text Search: Full Text vs Trigram — Aapeli Vuorinen](https://www.aapelivuorinen.com/blog/2021/02/24/postgres-text-search/) (MEDIUM)
- [Marketplace Content Moderation — GetStream](https://getstream.io/blog/marketplace-content-moderation/) (MEDIUM)
- [Handling promotion, spam and fraud with Content Moderation — Sightengine](https://sightengine.com/promotion-spam-fraud-moderation-guide) (MEDIUM)
- [Trust and Safety on Marketplace — Meta](https://www.meta.com/safety/scam-prevention/marketplace-safety/) (MEDIUM)
- [19 Tactics to Solve the Chicken-or-Egg Problem — NFX](https://www.nfx.com/post/19-marketplace-tactics-for-overcoming-the-chicken-or-egg-problem) (MEDIUM)
- [The Chicken and Egg Problem in Online Marketplaces — Prometora](https://www.prometora.com/learn/chicken-and-egg-problem) (MEDIUM)
- [What Is SMS Pumping Fraud and How to Stop It — Twilio](https://www.twilio.com/en-us/blog/sms-pumping-fraud-solutions) (HIGH)
- [Handling toll fraud and SMS pumping with Twilio in Auth0 — Okta whitepaper](https://www.okta.com/sites/default/files/2025-06/Toll-Fraud-SMS-Pumping.pdf) (HIGH)

---
*Pitfalls research for: privacy-first truck-parts marketplace (Next.js 15 + Supabase)*
*Researched: 2026-06-01*
