# Account deletion minimization — certified local candidate

Date: 2026-09-14. Production base: release 107,
`c0d3e5e059c0083dc9b282ac8924239d3e77f114`.
Production deployment: `dpl_8fckDA8yq16LUfRg2n7P4kVdaM1S`.
Current approved handicap: revision 8,
`4cc2e2d2-92f9-4c79-95c2-4260b56ffb32`.

## Scope

- Private transaction/backend-bound attribution capability, frozen 63-column
  historical-authorship inventory, and final complete-row equality checks.
- Identity-only exceptions for existing immutable guards, including exact audited
  Odds snapshot and Net Skins entry-history guard bodies. Unknown versions fail
  installation, and unknown future authored FKs fail deletion atomically.
- Redact only a deleting account's Auth-attribution columns. Preserve competition
  Player IDs, numeric values, status, event timestamps, and original request hashes.
- Erase the deleting Player's `maskedGhinNumber` from source-operation receipts,
  even when a different Director entered the mapping. Preserve unrelated Player
  identifiers and all other response/receipt fields.
- Erase full GHIN identifiers while preserving referenced internal identity rows.
- Original-request continuation: private bounded claims, expiring leases, five-minute
  retries, protection rechecks, canonical completion receipts, and completed retries.
- Authenticated `/api/cron/account-deletion` route, five-minute Vercel cron schedule,
  aggregate-only responses, and bounded provider HTTP requests. No client-supplied
  Auth identity or deletion-request creation through this route.

## Certification

90 relevant application/PostgreSQL tests passed with
`node --conditions=react-server --test --test-concurrency=1`.
Coverage includes actual revision/entry/current-pointer DDL, Odds and Net Skins
guards, masked receipt redaction, original-request continuation, protected accounts,
malicious trigger changes, immutable values, reviewer/native boundaries, SQL handicap
parity, Odds withdrawal, Net Skins and Setup integrations.

The package additionally passed complete-source installation and forced-error
rollback testing: every original function was restored after failed installation;
successful installation created no deletion requests or retry rows. Production
build passed. Existing CSS warnings are outside this backend-only change.

The tracked migration-102 source is an already-installed baseline dependency
required to reproduce the deployed historical-authorship schema in tests. It is
**not** a new Production migration to execute again.

## Deployment gate — not deployed

Vercel's Production project is Pro, Cron Jobs is enabled, and currently has no
configured jobs. The new route deliberately rejects requests unless `CRON_SECRET`
is configured with at least 32 characters. This credential has not been read,
created, changed, or verified by this task. Its secure provisioning/verification is
a required release gate; do not deploy an unauthenticated worker or claim automatic
completion is live without it.

Vercel documents automatic Bearer delivery of this variable:
https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

After credential setup and fresh release-baseline checks, use the established
controlled release procedure. The only new SQL installation is the atomic output of
`node scripts/package-account-deletion-minimization.mjs`. Do not separately apply
its component files or rerun historical migration 102. Do not use real accounts for
destructive testing. Non-destructive acceptance must establish the empty queue,
unauthenticated worker denial, authorized empty-batch completion and unchanged
competitive fingerprints before certifying Production.

## Production findings and boundaries

- Deletion requests: 0.
- Existing source receipts containing masked GHIN: 24; all have a stable Player ID.
  These active-account records were not erased wholesale. Synthetic deleted-subject
  receipts retain zero masked identifiers after cleanup.
- Production revision 8/receipts redacted by this task: none.
- Production schema/data/environment/release changes: none.
- Privacy page not included or deployed in this backend candidate.
- No native source/build change. Build 3 portrait suppression remains required
  under the prior shipping-binary audit. It is not the only remaining release gate
  until backend deployment and certification are complete.
