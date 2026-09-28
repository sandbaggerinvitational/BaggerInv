# Query and index review

**Evidence boundary:** all runtime results below are isolated local PostgreSQL17 or local application tests. No Production query, deployment, real competitive mutation or physical-device test occurred. PASS applies only to the named fixture/layer. Recommendations are not implemented facts.

| Family | Before | Candidate | Evidence / remaining risk |
|---|---|---|---|
|SCORE_CANONICAL_WRITE |1 RPC,595 nested executions in common fixture |1 RPC,88 nested executions | Nested auto_explain captured separately; not per-request HTTP query count |
|CALCUTTA source / late-R3 compatibility | Source aggregation under score lock; eligible receipts traverse financial/consumed history | Absent from score call stack; worker retains exact current source/compatibility logic | All8 branches×4scales; moving work does not make worker cost disappear |
|NET_SKINS materialization | Current round scorecard aggregation/job work synchronous | Current config admission + transactional intent only | Calculators/membership unchanged; worker contention remains |
|COMPETITION jobs |Five shared jobs updated twice per score | Per-match transaction intent; later worker updates jobs | Baseline different-match57014 reproduced; candidate independent progress |
|IDEMPOTENCY |Exact match/mutation composite PK |Unchanged | Required lookup not historical scan |
|MATCH_PROGRESS |Indexed current match,≤18holes |Unchanged | Canonical running state remains synchronous |
|FROZEN CONTEXT |Snapshot/match/hole/participants exact keys |Unchanged | Plus/high handicap rules untouched |
|REHEARSAL SAFETY GUARD |SeqScan filters100/1000 restored rows,25/250buffers |Exact-predicate partial index,0irrelevant rows,1buffer | Actual guard and accepted RPC; full safety truth table unchanged |
|INTENT_READY / CLOSE |Absent |Two partial indexes +PK+unique key | Processed history excluded; very large intent-history/resource behavior still requires proof |

Before/after plans: [machine index](query-plan-index.json), `evidence/plans-before-(1, 2, 5, 10)x.json`, `evidence/plans-after-(1, 2, 5, 10)x.json`, and all eligible branch plans at1×/10×. Raw nested plans overlap: do not sum their inclusive time, buffers or rows into request totals. Main after plans may choose a zero-row sequential scan on the empty rehearsal table; that is not an actionable historical scan. The populated history regression proves the chosen candidate index at100/1000restored rows.

New indexes: intent PK,unique transaction-family key,ready partial,unresolved partial (four on new table); one existing-table rehearsal partial index (**five total,three explicit partial indexes**). New index predicate exactly matches the original guard. Safe states remain excluded; RUNNING or FAILED/unrestored still reject score. No speculative index or timeout increase. Rehearsal index causes no added score-table write; it affects rare control-record transitions. Intent index write cost is included in candidate timings.

Index build evidence at0/100/1000synthetic control records is retained in [experiment](evidence/fence-history-experiment.json) and [final regression](evidence/fence-history-final.json). DDL locks on the real existing table require future staging/deployment review; local milliseconds are not Production DDL assurance. Removing the rehearsal index would preserve correctness but restore history cost; dropping unresolved intent indexes/table is unsafe operational rollback.

**Measured plan verdict:** zero forbidden Calcutta/NetSkins historical scan families on the tested score path after; source and all captured relation shapes also show no Odds history read; no material critical plan regression identified; unchanged bounded18-hole scans remain intentional. **Not an exhaustive annual-runtime/production plan certificate.** Runtime manifest recomputation, future deployment schema drift, new intent table extreme growth and financial workers remain separately assessed. Query gate is fail-closed on missing evidence and leaves human plan review/finite-timeout headroom explicit.
