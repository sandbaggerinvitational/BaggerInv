# Failure injection and atomicity

**Evidence boundary:** all runtime results below are isolated local PostgreSQL17 or local application tests. No Production query, deployment, real competitive mutation or physical-device test occurred. PASS applies only to the named fixture/layer. Recommendations are not implemented facts.

**PROVEN — POSTGRESQL / FAILURE INJECTION:** canonical score,match state,receipt,revision/audit and required durable delivery rollback together in tested failures. A complete SQL hole contains all participant gross values; no separate per-player canonical commit is introduced. No half-hole,advanced match-without-score or receipt-without-canonical authority survived.

| Failure point | Canonical / receipt | Safe resolution / retry | Derived state |
|---|---|---|---|
|Before hole; after hole; after match | Neither commits | Once transaction terminated: NOT_COMMITTED,same mutation | No committed new demand |
|Before/after receipt; after history/audit/Google outbox | Entire transaction rolls back | Same mutation accepted after failure removed | Intent and canonical roll back together |
|Required new intent append fails | Entire score rolls back | Same mutation,corrected infrastructure | No lost derived notification |
|Statement timeout57014 | Whole transaction rollback | Structured SQLSTATE retained; same-ID retry after termination | No partial work |
|Backend connection killed precommit | Rollback | Bounded receipt/current read then same-ID retry | No committed new work |
|Backend killed after commit before delivery | Score/receipt remain | COMMITTED,stored replay | Durable demand remains |
|Owned DB immediate restart before/after commit | Uncommitted rolled back; committed recovered | Exact receipt/status + same ID | Atomic WAL recovery in test only |
|Calcutta/Skins/Competition consumer error | Score already Official | Retry durable worker demand | RETRYABLE,then success;5 failures DEAD_LETTER |
|Worker57014 | Score already Official | Worker transaction rollback; later retry | Prior PENDING survives |
|Mixed-round worker deadlock40P01 | Score unchanged | Recorded RETRYABLE; explicit retry succeeds | No partial acknowledged materialization |
|Telemetry sink failure | Existing Phase 1 tests retain score path | Logging does not replace required audit | No authority mutation |

Database restart uses only the owned disposable cluster. fsync=off means this is process/WAL recovery, **not power-loss durability or backup/restore proof**. Some deterministic hooks intentionally fail immediately after SQL row/statement boundaries; they do not model every arithmetic instruction or provider fault. No cluster/provider shared with Production was used.

Unproven: actual HTTP response serialization/ack drop, serverless process death, realistic CPU/I/O/pool pressure, external metrics/trace exporter behavior beyond existing local sink tests, autonomous delayed dispatch. The complete canonical before/after snapshots and artifact assertions are retained in [score proof](evidence/score-proof-after.json) and [derived proof](evidence/derived-proof-after.json). Tests that reproduce expected annual 42883 and worker40P01 are characterization PASS while their operational capability remains incomplete.
