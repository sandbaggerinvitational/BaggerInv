# Future deployment plan — documentation only

**NOT READY. No staging or Production deployment is authorized by this task. Production deployment requires separate owner authorization.** Candidate identity is recorded in [CANDIDATE-MANIFEST.md](CANDIDATE-MANIFEST.md); this branch is a draft, not a deployable approval.

Before staging, complete the isolated Director replacement and actual annual initialization proof, reconcile open broad/security contracts, and close the remaining retirement gates. Preserve the scoped local P0-B proof. Review full combined Phase 2/2C source and schema changes, not only this patch. Create a manifest binding source commit, migrations 125/126 hashes, Preview provenance migration, fixtures, worker/process contracts, client models and exact test receipts. Retain the previous deployment and credentials through rollback review.

## Isolated hosted proof after separate authorization

1. Verify separate non-Production database/project identity and synthetic/sanitized data; no shared Production authority or notification credentials.
2. Install the correct baseline and upgrade path: canonical Phase 2C through migration 124; candidate migration 125 (runtime producers/worker grants/admission retirement), followed by migration 126 (canonical release admission); Preview `202609290001_canonical_history_provenance_v1.sql` only in its intended Preview schema. The directories are distinct deployment tracks, not a combined numeric migration stream.
3. Certify clean installation and upgrade with pending/failed/completed legacy Google rows retained. Migration 125 is a one-shot migration; blind repeat application is not an idempotency guarantee. Review installed function/grant/RLS/allowlist definitions and retained current pointers.
4. Deploy the candidate without Google configuration. Boot/health alone does not prove database access. Exercise actual signed synthetic identity, client DTOs, score/recovery, round controls, required side games, History/Records, autonomous worker restart/retry/dead-letter/recovery/backlog, annual init and full 432-hole/24-Final-result sequence.
5. Count adapter invocations and new legacy jobs, not merely outbound success. Require zero; remote Google domains denied. Verify financial ownership/prices/publication approval unchanged.
6. Compare hosted performance only to a hosted baseline with stated compute/pool/load. Exercise finite timeouts and lost responses. Repeat backup/restore separately; local fsync-off tests are not recovery proof.
7. Rehearse rollback. Owner reviews the evidence before any Production task.

## Rollback and compatibility

Application-only rollback is not sufficient if an old runtime requires Google admission/enqueue/functions now disabled. Prepare reviewed reverse function/grant/allowlist definitions from base `ab909d45` and restore them in a compatible release window; do not blindly rerun the entire old migration history. Preserve immutable legacy jobs, delivery receipts and snapshots. New canonical scores and receipts must never be rolled back as data. Old receipts retain their historical Google booleans; new receipts truthfully say false. No external credentials/resources may be revoked until the rollback window closes. Pending old Google jobs are preserved historical delivery evidence and excluded from current readiness, not falsely marked delivered.

Future deployment risk: **HIGH while required replacements and broad failures remain open**. SQL function/admission/grant changes and large legacy HTTP retirement require staged compatibility/migration review. No new outbox, microservice, index or scoring-rule change is introduced by this retirement patch.

## Future Production acceptance

Only after explicit authorization: frozen SHA/release/activation preflight; inspect safe current health/resource identity and tiny canonical readbacks; no fake competitive scores or real side-game processing. Observe legitimate traffic telemetry and zero Google invocation/job creation. Export/artifact preservation, rollback readiness and an appropriate observation window precede credential cleanup. See [PRODUCTION-GOOGLE-CLEANUP-PLAN.md](PRODUCTION-GOOGLE-CLEANUP-PLAN.md). Capacity and backup restoration remain separate P0s.
