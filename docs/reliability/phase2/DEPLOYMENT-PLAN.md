# Future deployment plan — documentation only

**PRODUCTION DEPLOYMENT REQUIRES SEPARATE OWNER AUTHORIZATION.** No deployment, release attempt, promotion lock, schema mutation, provider change or Production read occurred in Phase 2. This candidate is **NOT READY — ADDITIONAL PHASE 2 WORK REQUIRED**.

Implementation candidate SHA: `73abf170a6ea4457327031ea903b42bcd56120be`.

Candidate branch: `codex/reliability-phase2-score-path`. The exact tested implementation commit/source hashes are in [evidence](EVIDENCE.md); final package commit is returned to owner. This document does not manufacture a self-referential final SHA.

## Scope and risk

Future deployment risk **HIGH until open gates close**: one additive private table, three named partial indexes plus primary/unique intent indexes, three new private intent helpers, hash-checked replacements of existing trigger/claim/reader/close functions, implementation-manifest wrapper. Golf/core submit/finalize formulas and API response shape unchanged. Required durable intent append is a new transactional dependency; financial work becomes separately retried. New annual manifest and close semantics require full certification, not just a fast local score.

Migration order: approved Phase 1 schema and separately tracked certified SQL repairs → candidate `202609280121_score_derived_intents_v1.sql` in one transaction. Exact source hashes reject drift. Existing annual runtime-certification rows cause deliberate fail-closed rejection; do not delete attestation rows to get past it. Design/review authorized recertification before considering an annual-runtime deployment.

## Later staging gate

Use verified isolated database/provider identity with synthetic data and no Production credentials/authority. Reproduce clean install and actual prior-schema upgrade; retain grants/RLS/security-definer/search-path proofs. Execute actual current runtime/admission rather than the local stubs. Run supported PWA/Build 10/Director score/replay/status contracts, all formats, concurrent score/Lock/Resume/Finalize/Open boundaries, timeout/lost acknowledgement, worker retry/dead-letter/backlog/out-of-order, financial freshness and result parity, annual generation/activation, performance smoke and rollback rehearsal. No promotion follows automatically.

## Rollback and migration handling

Never assume deploying the old application SHA reverses database functions. Existing clients are unchanged and keep using the canonical score RPC. Rolling back the database seam requires stopped/reconciled writes, preserved unresolved intents, safe draining or explicit owner-reviewed reconciliation, compatible original trigger/claim/reader/close/manifest definitions, and renewed attestation. Do not drop the intent table with pending work; do not replay financial outputs from stale intent payloads. Retain additive indexes/table during a function rollback until all audit/delivery requirements are resolved. A verified scripted live rollback is **NOT PROVEN**, so future deployment remains blocked.

Migration is intentionally non-repeatable; failed reapply and hash drift must rollback completely. Test indexes against plans/write cost. No statement/request timeout increase. Do not run CONCURRENTLY inside the migration transaction; the new intent table initially has no live rows. The rehearsal index targets an existing control table and acquires an index-build lock; size and maintenance-window feasibility must be assessed safely in staging before authorization. Its tested 0/100/1000-row local DDL timing is not Production lock-time proof.

## Production preflight and acceptance, only in a later authorized task

Owner approves exact SHA/migration/attestation/rollback and change window. Capture small current health/release/activation facts via supported bounded endpoints; confirm provider resource headroom, backups and no active competitive operation. Preserve release-control compatibility and acquire locks only through normal protected workflow. Abort on authority drift, unsupported annual certification, security/contract failure, unreconciled intent backlog or unavailable rollback.

Post-deployment acceptance: deployment health, actual release/activation, read-only current authority and function metadata through approved bounded tooling, telemetry sink health and workers' safe status. **No fake golf scores in Production; no historical archive edits.** Mutation/concurrency/load/failure proof belongs in synthetic staging. Later legitimate scoring traffic may supply real latency/outcome evidence; until that exists Production score-write performance stays NOT PROVEN. Observe 57014/5xx/unknown outcomes/intent failures and rollback eligibility; no automatic promotion from local PASS.
