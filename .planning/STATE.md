---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: OG Rebrand & UI Redesign
status: in_progress
last_updated: "2026-06-18T18:46:26.537Z"
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 11
  completed_plans: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-12 after v1.0 milestone)

**Core value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed.
**Current focus:** Phase 16 Part Taxonomy & Guided Cascade — the original 4 plans done; the YEAR dimension was reopened as 3 new plans (16-05 data+search foundation DONE, 16-06 search year UI DONE, 16-07 create/edit year inputs DONE). **Phase 16 is now functionally complete (7/7).** Phase 11 (v1.1 rebrand) has 11-04 still pending stakeholder logo assets.

## Current Position

Phase: 16 of 16 — Part Taxonomy & Guided Cascade (new functional scope; not v1.1 rebrand) — COMPLETE (7/7)
Plan: 07 of 7 complete — seller Year capture shipped. Phase 16 done; the full Year dimension (data+search 16-05 / buyer surfaces 16-06 / seller capture 16-07) is end-to-end.
Status: 16-07 COMPLETE (human-verify approved) — Year Compatibility section in the create/edit listing form with three modes (Universal default / Specific year / Year range); the same Zod schema validates client + server (trust boundary); toYearColumns() normalises mode+values onto the listings.year_start/year_end pair on create+update; the detail shows "Fits years: …"; edit pre-fills the mode + years from the stored row.
Last activity: 2026-06-18 — executed 16-07-PLAN.md (seller Year capture). schema.ts: yearMode enum + bounded yearStart/yearEnd + cross-field superRefine (specific=>equal, range=>start<=end, universal=>null) + toYearColumns() normaliser. listing-form.tsx: Year Compatibility section (RadioGroup mode toggle + conditional select(s) from yearOptions(), stale-value clearing on toggle). actions/listings.ts: year_start/year_end persisted on create+update via toYearColumns. queries.ts + listing-detail.tsx: select + map + "Fits years" display. sell/[id]/edit/page.tsx: derive yearMode from the row + pre-fill. 3 feat commits b44e77e/2dbcebd/b57b44b. Deviation recovered: parallel-wave commit race put schema.ts on dangling commit 5b42a1e; recovered + recommitted clean as b44e77e (schema.ts only, no 16-06 files mis-attributed). tsc clean; verified + approved at the human-verify checkpoint.

Progress: [■■■■■■■] Phase 16: 7/7 plans complete (4 taxonomy + 16-05 year foundation + 16-06 year search UI + 16-07 seller year capture) · (Phase 11 v1.1 rebrand still has 11-04 pending)

**Milestone dependency:** stakeholder will provide original logo asset files (full logo + icon, PNG/SVG) — blocks BRND-02 asset generation in Phase 11. Reference mockups received 2026-06-12 (home/make browse, model browse, category browse, create-listing + buyer search).

Previous milestone v1.0 MVP is archived (`.planning/milestones/v1.0-ROADMAP.md`, `v1.0-REQUIREMENTS.md`). Phase history, decisions, and per-plan detail live in:

- `.planning/MILESTONES.md` — accomplishments + known gaps
- `.planning/RETROSPECTIVE.md` — lessons + patterns
- `.planning/phases/` — raw execution history (PLAN/SUMMARY per plan; per-plan durations in each SUMMARY)

## Performance Metrics

**v1.1:** 3 plans executed. **Phase 16:** 7 plans executed (4 taxonomy + Year foundation + Year search UI + seller Year capture) — COMPLETE.

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 11    | 01   | ~5 min   | 3     | 3     |
| 11    | 02   | ~5 min   | 3     | 5     |
| 11    | 03   | ~7 min   | 3     | 12    |
| 16    | 01   | ~8 min   | 2     | 3     |
| 16    | 02   | ~2 min   | 1     | 1     |
| 16    | 03   | ~6 min   | 2     | 2     |
| 16    | 04   | ~12 min  | 2     | 3     |
| 16    | 05   | ~6 min   | 3     | 5     |
| 16    | 06   | ~3 min   | 3     | 3     |
| 16    | 07   | ~9 min   | 4     | 6     |

**v1.0 reference:** 57 plans across 13 phases in 12 days (see MILESTONES.md).
| Phase 16 P01 | ~8min | 2 tasks | 3 files |

## Accumulated Context

### Roadmap Evolution

- Phase 16 added (2026-06-18): **Part Taxonomy & Guided Cascade** — new *functional* scope from a stakeholder taxonomy review (3-level part taxonomy + hierarchical category search + guided cascade rework on welcome & /browse). NOT part of the v1.1 rebrand. **Year deferred** to its own later phase. Full scope + the Fuel Tanks subtree captured in `.planning/phases/16-part-taxonomy-guided-cascade/16-CONTEXT.md`.

### Decisions

- Requirement count corrected during roadmap creation: v1.1 has **29** REQ-IDs (5 BRND + 4 THEM + 5 CHRM + 8 SURF + 3 A11Y + 2 FIX + 2 QA), not 27 as initially noted in REQUIREMENTS.md.
- A11Y-01/02/03 mapped to Phase 15 as the formal audit gate; contrast/focus/motion discipline is still built in from Phase 11 tokens onward (cross-cutting gates in ROADMAP.md).
- FIX-01/FIX-02 mapped to Phase 15 for verification; their isolated commits may land during any earlier phase without mixing with visual commits.
- Rename sweep + e2e brand-assertion updates are atomic within Phase 11 (suite stays usable as behavior oracle throughout the milestone).
- [Phase 11]: Plan 11-01: dark token values live on single :root; legacy dark: utils layer same values until Phase 12 (no separate light :root)
- [Phase 11]: Plan 11-02: metadataBase = https://trucksource.vercel.app (Vercel project name); trivially swappable, user to confirm final public domain
- [Phase 11]: Plan 11-02: Barlow Condensed (display) + Inter (body) via next/font; Geist_Mono kept for --font-mono; next-themes removed (dark-only, sonner pinned theme="dark")
- [Phase 11]: Plan 11-03: product renamed to "OG Truck Parts" everywhere user-visible (auth/header/suspended/README) + package name og-truck-parts; repo/Vercel/Supabase slugs unchanged (BRND-01); lib/* email senders + near-expiry cron URL still "Take-Off Parts" by design (Phase 15 deferral)
- [Phase 11]: Plan 11-03: home.spec brand assertion reconciled from heading-role to link-role (home h1 is "Find your part"; brand is the header wordmark link) — Pitfall 4 fix
- [Phase 11]: Plan 11-03: pre-existing e2e failure auth.spec:95 (unauth /->/login redirect) confirmed at HEAD pre-changes; logged to phases/11.../deferred-items.md, owner Phase 15
- [Phase 16]: Plan 16-01: root set = the 18 unique roots from 16-CONTEXT.md as-listed (Task 0 checkpoint resolved: context-18); admin editor can add/rename roots later
- [Phase 16]: Plan 16-01: "Lighting" kept as a root despite collision with the old flat tree — deactivate in Section C then explicit reactivate in Section B so on-conflict-do-nothing doesn't swallow the kept name (Pitfall 5); on Staging Lighting = id 1, active, root
- [Phase 16]: Plan 16-01: search_listings signature + return columns byte-identical to 0024 (diff-verified); only the part-category facet arm body changed to a recursive subtree CTE
- [Phase 16]: Plan 16-01: Staging forward-migrated (NOT reset) via db push; old tree deactivated, affected listings re-tagged onto leaf 'Driver Side Fuel Tanks' (0 stale tags)
- [Phase 16]: Plan 16-01: Staging ids for Plans 03/04 (resolve by NAME in code, ids are Staging-specific): Fuel Tanks root=91, 'Fuel Tanks' subcat=96, 'Driver Side Fuel Tanks' leaf=111; 18 active roots, 172 total cats (128 active)
- [Phase 16]: Plan 16-01: repaired remote migration history (0004-0024 marked applied) — pre-existing desync where remote schema_migrations only recorded 0001-0003 though objects existed; required before 0025 could push
- [Phase 16]: Plan 16-02: added getChildCategories(parentId) + getRootCategories() single-level cascade readers to lib/listings/cascade.ts; exported local CategoryOption ({ id; name }) — Plans 03/04 import that symbol (NOT garage CascadeOption); getPartCategories left untouched for create-listing; readers mirror garage posture (is_active filter, order(name), [] on error, id+name only)
- [Phase 16]: Plan 16-03: welcome explorer reworked to a guided drill (Step = make|model|category|advanced): Make -> Model -> (search now) -> Category(root) -> Advanced(Subcategory -> Item + Condition). Configuration step REMOVED from the welcome flow (still a /browse facet; getConfigs dropped). Category is an OPTIONAL refinement, not a gate — the dd5b81e fix lifted the Condition picker + "See results" out of the advanced step into shared elements rendered on BOTH the category and advanced steps, so Make + Model alone can search. runSearch emits a SINGLE deepest `category` id (item ?? subcategory ?? rootCategory) or OMITS the param; no subcategory/item params (subtree RPC expands one id). Single-deepest category chip (user-confirmed): one chip labels the deepest chosen level and updates as you narrow; removal (removeRootCategory) clears root+sub+item and rewinds to "category". Model -> Category hop kept isolated (no fused handler) so a future Year step slots in without rewriting siblings (Pitfall 7). page.tsx swapped getPartCategories() -> getRootCategories(), prop partCategories -> rootCategories. Human-verify checkpoint approved.
- [Phase 16]: Plan 16-05: YEAR dimension added to listings + search. listings.year_start/year_end smallint nullable — both null = UNIVERSAL (fits all years), specific year = year_start = year_end, range = year_start <= year_end. Two CHECKs: listings_year_bounds (1970..2027, mirrors garage 0005) + listings_year_pairing (both-null or both-set ordered). Listing year is OPTIONAL (no backfill, no NOT NULL) — existing listings stay universal + findable; contrast garage year which is mandatory. Buyer filters by a SINGLE year; match arm `p_year is null or l.year_start is null or (p_year between l.year_start and l.year_end)`. search_listings signature INTENTIONALLY changed to 0025+p_year (p_year after p_condition_id, before p_fits_model_id) — no longer byte-identical to 0024/0025; ALL five 0025 arms reproduced unchanged. CRITICAL migration detail: adding a parameter mid-signature makes `create or replace` a NEW overload, so 0026 DROPs the exact old 9-arg signature first, then creates the single 10-arg fn (else ambiguous named calls). lib/listings/years.ts = single source of truth for the 1970..2027 range (YEAR_MIN/MAX, yearOptions() descending, isValidYear) — 16-06 search UI + 16-07 form both import it. `year` wired into lib/search/params.ts (SearchQuery+KEYS+parse clamp+serialize+hasCriteria) and forwarded as p_year in lib/search/queries.ts (both searchListings + autocomplete calls). search.year.test.ts: universal-matches-any arm runs on existing Staging listings; range inside/outside arm self-skips until 16-07 seeds ranged listings. Migration 0026 pushed to Staging cleanly (no history desync). tsc clean; 14 existing search tests + new year test pass.
- [Phase 16]: Plan 16-06: Year surfaced in BOTH buyer search surfaces. Welcome explorer machine is now `Make -> Model -> Year(optional) -> Category -> Advanced` — the Year step lands in the reserved Model->Category seam (Pitfall 7 paid off: pickModel just advances to "year", no sibling rewrite). Year is OPTIONAL everywhere: the welcome step offers "Any year" + the shared "See results" so search runs without a year; /browse Year defaults to "All years". A SINGLE `year` URL param (the buyer's truck year) is independent of Make/Model — no cascade, no dependents, always-enabled select. Year `<Select>` added to FacetControls after Model (one edit covers desktop sidebar + mobile Filters sheet). Year chip sits between Model and Category in the welcome summary (removal rewinds to the year step, clears year only); /browse gets a `Year: <n>` active-filter chip (removal key ["year"], no active-filter-chips edit). Year options come from lib/listings/years.ts (16-05) — no re-hardcoded range. tsc clean; human-verify approved. No deviations.
- [Phase 16]: Plan 16-07: SELLER Year capture (create/edit listing) — completes the Year dimension end-to-end. `lib/listings/schema.ts` gained `yearMode` enum (universal/specific/range, default universal) + bounded coerced `yearStart`/`yearEnd` (YEAR_MIN..YEAR_MAX from lib/listings/years.ts) + a `superRefine` cross-field guard (specific=>yearEnd equals yearStart; range=>both set & start<=end with the error on yearEnd; universal=>stray values ignored). `toYearColumns()` is the SINGLE form-shape->DB-shape mapper (specific: y/y; range: pair; universal/incomplete: null/null), called by createListing/updateListing AFTER the shared-schema re-validation (trust boundary, CLAUDE.md). DB stays the two-column year_start/year_end pair (16-05 migration 0026) — yearMode is a UI/validation construct RECONSTRUCTED from the pair on edit pre-fill (both null=universal; start===end=specific; else range). Form: "Year compatibility" section after Fitment with a RadioGroup mode toggle; Specific shows one select (yearEnd kept synced to yearStart) and Range shows Start+End, both from yearOptions(); `onYearModeChange` clears stale year values on toggle. listing-detail shows "Fits years: 2008–2015" / single year / nothing for universal. Year is non-PII public listing data — columns on the public listings table, no RLS change. 3 feat commits b44e77e/2dbcebd/b57b44b. DEVIATION (recovered): the parallel-wave husky/lint-staged stash/restore put the schema.ts commit on a dangling commit (5b42a1e); recovered schema.ts from it and recommitted clean as b44e77e — `git show --stat b44e77e` confirms schema.ts ONLY, no 16-06 files mis-attributed (memory: precommit-hook-parallel-attribution). tsc clean; human-verify approved.
- [Phase 16]: Plan 16-04: /browse Category facet reworked into three dependent selects (Category root -> Subcategory -> Item) in FacetControls — one edit covers desktop sidebar AND mobile sheet (browse-toolbar-mobile.tsx spreads the same body). URL contract: `category` = DEEPEST chosen id (RPC-facing, subtree-expanded by 16-01 RPC); `root`/`subcategory`/`item` are UI-only memory keys the RPC never reads. Parent change deletes dependent keys + recomputes deepest `category` (no stale URL combos). Chip label via resolveCategoryLabel walking up to 2 parents, deepest-LAST with " › " (Pitfall 6); chip removal clears all four category keys. active-filter-chips.tsx needed NO edit (keys array set on chip in page.tsx). Human-verify checkpoint approved.

### Research flags (from research/SUMMARY.md)

- **Phase 13 (Signage grid):** confirm browse data queries + URL param coverage at plan time (`lib/search/params.ts`, `lib/listings/cascade.ts`); decide feed-empty-state vs dedicated `/browse` route.
- **Phase 15 (FIX-01):** check `message_threads` membership in `supabase_realtime` publication before writing any migration.
- **Phase 15 (dashboard sweep):** Twilio Verify SMS friendly name wording — verify in Twilio console; evidence-gated checklist (trigger real sends).
- **Phase 11:** Tilt Neon accent font decision deferred to hi-fi mockup review during Phase 11 planning; confirm `npm ls tailwindcss` resolves >= 4.1 before relying on `text-shadow-*` utilities.

### Todos

- None.

### Blockers

- Stakeholder logo asset package (full logo + icon, PNG/SVG) not yet delivered — needed for Phase 11 BRND-02 (favicon/OG generation). Mockups exist; plan can proceed with asset-path contingency (sharp from PNG if no vector).

## Open Blockers (deferred — not in v1.1 scope)

1. **Photo upload prod cap** — Server Action path breaks on Vercel ~4.5MB; switch to signed-URL-direct-to-Storage + clean staging-path orphans (pre-launch).
2. **LIST-09 automation dormant** — pg_cron not enabled on Staging; CRON_SECRET not set on Vercel (migration 0011 authored, unscheduled).
3. **Provider hygiene pre-launch** — Production Supabase project; own-domain Resend SMTP; Twilio upgrade + Geo US/CA allowlist.
4. **Part-category catalog** (~600 lines, check.md) — pending stakeholder confirmation.

## Session Continuity

Last session: 2026-06-18 — executed 16-07-PLAN.md (seller Year capture in create/edit listing). Stopped at: Completed 16-07-PLAN.md — Year Compatibility section (universal/specific/range), shared-schema client+server validation, toYearColumns() normaliser onto listings.year_start/year_end, detail "Fits years" display, edit pre-fill; 3 feat commits b44e77e/2dbcebd/b57b44b (b44e77e recovered from a parallel-wave dangling commit, recommitted clean); human-verify approved. Phase 16 now COMPLETE (7/7).
Next action: Phase 11 v1.1 rebrand 11-04 (still pending stakeholder logo assets). The full Year dimension is shipped end-to-end; ranged listings can now be seeded on Staging to activate the range arm of 16-05's search.year.test.ts.
