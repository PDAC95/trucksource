---
phase: 09-contact-private-chat
plan: 05
subsystem: messaging
tags: [contact-form, listing-page, msg-01, msg-02, report-menu, rhf, zod]
requires:
  - "09-02: submitContact server action (contact-before-thread spine)"
  - "09-03: ReportMenu component + submitReport"
provides:
  - "ContactSellerButton — the MSG-01 listing-page CTA with five render states"
  - "ContactFormModal — pre-filled RHF contact form, the only door into chat"
  - "Listing page wiring: own-profile prefill, existing-thread check, listing-level ReportMenu"
  - "Login ?next= round-trip (validated same-site paths only)"
affects:
  - "09-06: thread UI receives buyers via router.push(/messages/[threadId])"
  - "09-07: phase checkpoint smoke-tests this flow end to end"
tech-stack:
  added: []
  patterns:
    - "z.input form values + zodResolver parsed-output handler (report-menu precedent)"
    - "SaveButton login-invite posture extended to a full /login?next= round-trip"
key-files:
  created:
    - components/messaging/contact-seller-button.tsx
    - components/messaging/contact-form-modal.tsx
  modified:
    - app/(public)/listings/[id]/page.tsx
    - components/listings/listing-detail.tsx
    - app/(auth)/login/actions.ts
    - app/(auth)/login/page.tsx
decisions:
  - "Inactive-listing check ordered BEFORE the anon check: sold/expired listings show no new-contact CTA for anyone (anon included); only an existing thread survives status changes"
  - "Login ?next= validated server-side: must start with single '/' (rejects '//' and '/\\\\' open-redirect prefixes), else falls back to '/'"
  - "ReportMenu placed beside the save heart in the title row (kebab, non-owner only) rather than a separate header slot"
metrics:
  duration: ~10 min
  completed: 2026-06-11
  tasks: 2
  files: 6
---

# Phase 9 Plan 05: Listing-Page Contact Entry Point Summary

ContactSellerButton + pre-filled ContactFormModal wired into the listing page — the contact form (submitContact) is now the only door into chat, with login round-trip for anon buyers and the listing-level report kebab mounted.

## What was built

**Task 1 — Components (`60293fd`)**
- `components/messaging/contact-seller-button.tsx`: five render states in priority order — owner → nothing; existing thread → secondary "View conversation" link to `/messages/[threadId]` (survives sold/expired); listing not active → nothing; anon → primary "Contact Seller About This Part" linking `/login?next=/listings/[id]`; authenticated buyer → primary button opening the modal.
- `components/messaging/contact-form-modal.tsx`: vendored Dialog + RHF + `zodResolver(contactSchema)`; Name / Email / "Phone (optional)" / Message with `{n}/2000` counter against `MESSAGE_MAX_LENGTH`; "Send & start chat" pending button; microcopy "Your message is saved and shared with our team before the chat opens."; result mapping — ok → `router.push(/messages/[threadId])`, `rate_limited` / `contacts_closed` / generic toasts.

**Task 2 — Wiring (`412ddc9`)**
- `app/(public)/listings/[id]/page.tsx`: for an authenticated non-owner, fetches the viewer's OWN `profiles_private` row (cookie client, owner RLS, enumerated `first_name, last_name, email, phone`) into the `prefill` prop and `getExistingThreadId(listing.id, userId)` in parallel; passes `prefill`, `existingThreadId`, `listingActive` down. PII flows only as the buyer's own form props — nothing new about the seller.
- `components/listings/listing-detail.tsx`: placeholder disabled "Contact seller" button replaced by `<ContactSellerButton/>` in the seller card; `<ReportMenu targetType="listing"/>` mounted next to the save heart (non-owner only); unused `Button` import removed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Login did not honor a return path**
- **Found during:** Task 1
- **Issue:** Must-have truth requires anon buyers be "returned to the listing afterwards", but the login action always redirected to `/`, so `/login?next=…` would silently drop the buyer on the feed.
- **Fix:** Login page forwards `?next=` (read at submit time, no Suspense boundary needed) into the form data; the server action redirects there only after validating it is a same-site path (`/` prefix, rejecting `//` and `/\` open-redirect shapes).
- **Files modified:** `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`
- **Commit:** `60293fd`

## Verification

- `npm run typecheck` and `npm run lint`: 0 errors (14 pre-existing warnings, untouched files).
- `npm run build`: exit 0.
- `npm run test`: 40 files, 285 passed / 1 skipped.
- Grep gates: `submitContact` + `/login?next=` present in `components/messaging/*.tsx`; `ContactSellerButton` + `ReportMenu` present in `listing-detail.tsx`; no "placeholder" contact affordance remains.
- Manual smoke deferred to the 09-07 checkpoint per plan.

## Self-Check: PASSED

- components/messaging/contact-seller-button.tsx — FOUND
- components/messaging/contact-form-modal.tsx — FOUND
- Commits 60293fd, 412ddc9 — FOUND
