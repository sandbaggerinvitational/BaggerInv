# Phase 2C telemetry vocabulary and evidence

This maps the requested operational conditions to the implemented Phase 1 telemetry contract and durable Phase 2C attempt records. The uppercase names below are reporting concepts, not a claim that identically named runtime events were added. No high-cardinality identity becomes a metric label. See [worker contract](DERIVED-WORKER-CONTRACT.md), [recovery contract](RECOVERY-API-CONTRACT.md), and [evidence](EVIDENCE.md).

| Requested condition | Actual signal | What it proves / limit |
|---|---|---|
| RECOVERY_STATUS_CHECK | Operational route lifecycle and SCORING/OUTCOME with phase `mutation_recovery`, outcome COMMITTED or UNKNOWN | A bounded authenticated status check and its outcome; ordinary telemetry is optional |
| POST_REVOCATION_RECOVERY | Same recovery event correlated with the exact receipt and the separately recorded supported Lock/Finalize operation | Recovery succeeds after revocation in the tested sequence. There is no separate permission read or literal POST_REVOCATION_RECOVERY metric. A status event alone does not prove revocation |
| DERIVED_JOB_PICKUP | Durable attempt transition RUNNING; worker `processed` or `failed` after processor invocation | Actual job claim in the database; `processed` alone can report a skipped/empty attempt and is insufficient proof of a current result |
| DERIVED_JOB_RETRY | Durable RETRYABLE transition with attempt, next due time and SQLSTATE; worker failed/RETRYABLE event | Bounded next attempt, not infinite process-level retry |
| DERIVED_JOB_DEAD_LETTER | Durable DEAD_LETTER transition; tick terminal count | Visible terminal work. Aggregated tick count does not identify a job; exact indexed attempt lookup does |
| DERIVED_JOB_RECOVERY | Authorized REQUEUED audit transition followed by RUNNING and SUCCEEDED, with independent current-result verification | Requeue alone is not recovered delivery; original attempts remain retained |
| WORKER_DEADLOCK | Structured SQLSTATE 40P01 in failed/tick-failed and durable retry evidence where failure acknowledgement commits | A typed database error. Controlled injection is distinguished from actual reciprocal-lock reproduction |
| WORKER_BACKLOG | Tick pendingAutomatic, blockedAutomatic, activeLeases, terminal, waitingOwner, waitingPublication, statusIncomplete | Current bounded workload state, including intentional owner/publication waits. Incomplete bounded scans must not be presented as empty queues |
| ANNUAL_WORKER_FAILURE | Existing operational RPC failure event with release/activation/domain and classified database failure | Annual release/admission execution is separately proved; a generic event alone does not establish which annual manifest or worker SQL was executed |

Source: `lib/scoring-mutation-recovery.js`, `lib/scoring-mutation-recovery-route.js`, `lib/score-derived-worker.js`, `lib/score-derived-delivery.js`, and migration 124's private delivery-attempt ledger. Runtime cases and source hashes are linked by the evidence ledger. The worker uses three family RPC operation IDs per poll; its shared cycle ID is present in inputs but is not durably joined in the attempt ledger or current telemetry allowlist. That is an explicit correlation limitation, not a fully joined trace claim.

Hosted collection, alert routing, retention and supervisor restart policy are NOT PROVEN. The separate staging task must exercise them. Optional logging/export failure must not change a canonical score or durable job transition; required score receipts and durable attempts remain database evidence.
