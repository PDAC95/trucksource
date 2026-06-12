# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-12
**Phases:** 11 (1–10 + inserted 5.1) | **Plans:** 57 | **Commits:** 306 over 12 days (2026-06-01 → 2026-06-12)

### What Was Built

- Privacy-by-structure marketplace foundation: `profiles_public`/`profiles_private` split, RLS default-deny on every table, server-only service-role key, PII contract tests per phase.
- Verified Seller (email + Twilio OTP + terms, SMS-pumping hardened), 8-level fitment taxonomy + slang library, My Garage with fits-my-truck.
- EXIF-safe listing pipeline (sharp re-encode, no-GPS regression gate), 90-day lifecycle, fitment intelligence (confirm-only suggestions), 3–8 photo publish window.
- Slang-tolerant FTS+trigram search, feed, public profiles, comments/saves/sold, contact-form→admin-copy→private realtime chat trust spine.
- Service-role-isolated admin console: enforcement ladder, moderation, grouped report queue, audited message monitoring, taxonomy CRUD, CSV bulk import, analytics dashboard.

### What Worked

- **Strict dependency-ordered phases** — taxonomy before garage before listings before search meant nothing was built twice; the inserted 5.1 (stakeholder check.md) slotted in without reopening verified phases.
- **Architectural invariants in CLAUDE.md** — privacy split, RLS-in-migration, getClaims-only, EXIF gate — were re-verified per phase instead of trusted; every UAT privacy probe passed first try.
- **Shared Zod schema as the single client+server trust boundary** — the same schema in RHF resolver and Server Action caught the LIST-08 gap cleanly at one edit point.
- **Live human-verify checkpoints per phase** — three real UAT bugs at Phase 5 and two at Phase 10 were caught and fixed forward before they compounded.

### What Was Inefficient

- **Parallel-wave lint-staged race** cross-attributed files into the wrong commits twice (10-03/10-06 into 10-07's commits); verification had to switch to file-on-disk instead of commit messages.
- **Migration prefix collision** (duplicate 0020_) from parallel plans; renamed at gate sweep. Sequential prefixes need a reservation step in parallel waves.
- **`supabase db push` unusable against Staging** (remote history only records 0001-0003) — every migration applied via `db query --linked -f`, easy to forget.
- **Server Action photo upload** worked locally but hits Vercel's ~4.5MB prod body cap — should have routed signed-URL-direct from the start (now a pre-launch blocker).
- **Zod 4 `.default()` does not validate the default** — the LIST-08 min(3) gate was silently bypassable for omitted fields until a test caught it; `.prefault()` is the correct form.

### Patterns Established

- RLS policies live in the same migration that creates the table; zero-policy tables (audit log) are deliberate default-deny-both-directions.
- Admin actions: `requireAdmin()` → zod → service-role client → **throwing** `logAdminAction()` before any sensitive read → revalidate.
- Public read surfaces enumerate columns and join `profiles_public` only; the single PII join is named `getAdminUserDetailWithPII` so misuse is self-evident.
- Component-managed form state (photos, fitment) must be mirrored into RHF via `form.setValue` or the resolver validates stale values.
- Search RPCs are SECURITY DEFINER with the visibility predicate repeated in-body (non-leakproof `@@` can't use GIN indexes under RLS quals).

### Key Lessons

1. Structural guarantees (table splits, RLS, server-only modules) beat disciplinary ones — every privacy gate passed because the data model made leaks impossible, not because queries were careful.
2. UAT with the real stakeholder on real Staging finds bugs automated suites can't (silent publish, slang search misses, split-pane composer state) — keep a human checkpoint per phase.
3. In parallel execution waves, anything global (git staging, migration numbering) needs explicit coordination; verify by artifact-on-disk, not by commit attribution.
4. Validate library semantics at the boundary you depend on (Zod default vs prefault) — a green typecheck says nothing about runtime validation gaps.

### Cost Observations

- Model profile: quality (GSD `model_profile: quality`), yolo mode, comprehensive depth, parallelization on.
- ~305 tests (unit + integration) across 47 test files; integration suites run live against Supabase Staging.
- Notable: 12 calendar days from `git init` to stakeholder-approved v1 with zero rollback commits.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 11 | 57 | Baseline: GSD yolo + comprehensive depth + parallel waves; live UAT checkpoint per phase |

### Cumulative Quality

| Milestone | Tests | Migrations | Notable |
|-----------|-------|------------|---------|
| v1.0 | ~305 | 24 | PII contract + no-GPS + RLS gates green at ship |

### Top Lessons (Verified Across Milestones)

1. (Single milestone so far — candidates above await re-validation in the next cycle.)
