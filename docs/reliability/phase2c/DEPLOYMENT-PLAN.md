# Phase 2C deployment and rollback addendum

**Candidate advancement is blocked: Phase2C is PARTIAL.** Resolve [Google mirror/archive delivery and financial isolation](GOOGLE-OUTBOX-GAP.md) before owner staging review. The later-stage checklist below is a plan, not current readiness or deployment authorization.
**DOCUMENTATION ONLY. Production deployment requires separate owner authorization. No staging deployment is authorized by this task.** This addendum preserves the [Phase2 plan](../phase2/DEPLOYMENT-PLAN.md); it does not rewrite its historical PARTIAL verdict. The final source identity belongs in the candidate manifest/evidence index. A local test PASS does not authorize promotion.

## Candidate order and scope

Install the reviewed prior schema and Phase2 migration121, then122 (immutable score-receipt origin and read-only recovery),123 (annual SQL corrections, ordered NetSkins locks and exact manifest compatibility),124 (durable derived-delivery policy and supported worker). All SQL runs in transactional migrations. Source hashes and manifest/security predicates reject an unexpected predecessor. Do not edit an existing migration after deployment; these files are undeployed candidates.

Existing annual certificates deliberately block installation. Future staging must exercise an approved recertification sequence that preserves historical receipts. Deleting certifications or substituting permissive guards is forbidden. The local fresh-certificate test does not prove a safe in-place upgrade of a live certified annual runtime. That is an explicit later deployment prerequisite.

The API change is additive: two read-only mutation-status endpoints. Existing score submit response shape, golf rules, score permission admission and Finalize rules remain the same. Only new accepted score receipts acquire immutable originating Auth UUID; legacy receipts stay unbound and return UNKNOWN. Worker policy changes apply to existing derived queues and require coordinated database/application installation. The new three-family runner grants no new financial publication authority. This does not certify the existing Google Finalize writer’s financial side effects; its mirror-only boundary remains an unresolved prerequisite before staging review.

## Exact database candidate and rollback scope

The [complete migration manifest](MIGRATION-MANIFEST.md) and [machine inventory](migration-manifest.json) are the SOURCE-inspected deployment inventory. The reviewed files are:

| Migration | SHA256 |
|---|---|
|122 recovery|`122080a69e1045c4e189e4cd14752edacd5684f4298183c0524f0bd528a696ce`|
|123 annual SQL/locks/manifest|`4159acdfa22d5cd6699cfe2d4c985261ffbf41f3fbf6087d4eeed5a4aec3bee0`|
|124 delivery|`69821b9d98a585c0545e9b5e68968fa7c1a0cebf12e0ba9699c4590f5763bc48`|

The changes add one private20-column attempt ledger;18columns across existing receipt/queue tables; five derived-queue/provenance triggers; five nonunique performance indexes plus two correctness indexes; and five annual dispatcher entries.123 drops only the exact obsolete false-only writer constraint after validating its replacement. No canonical score trigger, handicap formula, match-result rule or direct score-write grant is added. The full exact function/trigger/column/index names belong to the manifest; staging must compare installed catalog definitions and effective grants against it.

There is no explicit historical data backfill. New queue fields have constant defaults, old recovery origins stay NULL, and historical delivery events are not reconstructed. This is not a promise of zero DDL locking or zero hosted write cost. All index builds are transactional and non-concurrent. Measure table/catalog lock duration, index storage/WAL and actual restored-dataset install time before scheduling an authorized deployment.

Installation failure rolls back its enclosing migration, not previously committed migrations.122 and124 rename and chain prior implementation manifests; do not revert a single manifest wrapper independently of its functions, allowlist and schema. Older worker code may ignore delivery delay/dead-letter policy. Stopping only new HTTP routes is not a complete worker rollback.

Once candidate traffic has created receipts, pending jobs or attempt events, preserve all provenance and demand. Prefer a reviewed forward correction. Do not drop the new columns/table to obtain an old schema, delete certificates, reset attempt history or restore expired leases. Reverting123 restores runtime SQL failures and known lock/manifest defects; its removed false-only constraint may reject legitimate rows. Reverting122 loses origin capture for subsequent receipts and cannot reconstruct it later. No destructive live rollback is proven or authorized.

## Separate hosted certification

1. Verify an isolated provider/database identity, synthetic data, outbound notification denial and no shared Production secrets/resources.
2. Record exact candidate SHA, migration hashes, schema, contracts, timezone, finite timeouts, roles and connection profile. Build10 model compatibility requires UTC timestamps; verify the real provider session instead of rewriting DTOs.
3. Install clean and upgrade fixtures, including pending/running/failed/succeeded jobs and legacy/new receipts. Confirm grants, RLS, source/manifest checks, trigger topology and unchanged old score clients.
4. Run the actual PWA/native DTO/Director transport through hosted admission, current and future-year release transitions, recovery after Lock/Finalize, side-game worker crash/backlog/stale delivery and full432-hole sequence.
5. Install the process supervisor/scheduler explicitly and prove cold-start, restart, credentials, worker concurrency, lease expiry, shutdown and alerts. A locally launched child is no proof of hosted scheduling.
6. Rehearse application rollback while retaining required database delivery/recovery functionality and audit history. Review the fallback if new origin-aware recovery is temporarily unavailable.
7. Return evidence for owner review. Do not promote automatically.

## Rollback

Application rollback alone may leave additive columns/functions/indexes and the supported worker installed. Stopping the worker is containment: canonical score intents remain durable, but derived presentation can become stale. Keep backlog visible and never declare the tournament closed while required work is stranded. Legacy applications do not automatically consume the new recovery API.

A database rollback is **NOT a simple old-SHA deployment**. Reverting123 restores known SQL/lock defects; reverting121 restores synchronous scoring dependencies. Prefer a reviewed forward correction. A complete reversal would require paused compatible work, preserved receipts/attempts, reconciled leases/intents and a reviewed function/manifest package. Never drop pending intents, erase ownership provenance, reset attempt history, restore an expired lease or weaken the authorship trigger. Live rollback is NOT PROVEN here.

New queue indexes are on existing tables and may take locks during installation. Measure migration duration and lock impact on a restored/synthetic hosted dataset. Local fixture timing is not Production DDL safety. No Production timeout increase is proposed.

## Future acceptance and abort conditions

In a later explicitly authorized Production task, use bounded health/release/current-authority reads, exact installed function/index metadata and normal legitimate traffic telemetry. Do not create fake competitive scores or process real money games for a canary. Abort on identity/manifest drift, missing origin association, unexpected write admission after Lock/Finalize, current-pointer mismatch, unbounded backlog/retries, new deadlocks, security regression, poor resource headroom or an unreviewed rollback path.

Future deployment risk: **HIGH until separate hosted migration/admission/scheduler/rollback proof completes**. This is driven by database function/manifest and job-policy changes, not by a claimed change to golf formulas. Production capacity, backup restoration and provider behavior remain separate gates.
