# Phase 02 — Deferred Items

## Out-of-scope discoveries

- **[02-05] `lib/verify/ratelimit.ts` typecheck errors (TS2345/TS2339).** Observed during
  plan 02-05's `tsc --noEmit` run, but the file is owned by the in-flight parallel sibling
  plan 02-03 (OTP send/check + anti-abuse). These are PostgrestQueryBuilder typing errors on
  the `otp_send_attempts` query (lines ~72–98). NOT touched by 02-05 (badge files are clean).
  Left for plan 02-03 to resolve — do not fix here.
