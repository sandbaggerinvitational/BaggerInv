# Concurrency and lock evidence

**Evidence boundary:** all runtime results below are isolated local PostgreSQL17 or local application tests. No Production query, deployment, real competitive mutation or physical-device test occurred. PASS applies only to the named fixture/layer. Recommendations are not implemented facts.

**PARTIAL overall.** Implemented deterministic SQL race cases pass in the tested frozen2026 authority. Independent-match blocking was reproduced on the exact Phase 1 baseline and removed by candidate score-origin deferred materialization. Full hosted control/release/revocation/worker scheduling is not proven.

| Case / test | Observed result | Meaning / limit |
|---|---|---|
|20 identical requests, P2-CONC-001 |1 write,19 replay,19 actual lock waiters | One canonical hole/receipt; actual concurrent connections |
|New IDs/same gross, P2-CONC-002 | One accepted,one revision conflict | Refresh canonical revision before retry; no duplicate |
|New IDs/different gross, P2-CONC-003 | One accepted,one revision conflict | No silent overwrite; current-revision audited correction remains intentional |
|Adjacent holes, P2-CONC-004 | Serialize,stale request conflicts; same-ID refreshed retry works | Clients cannot assume independent match revisions |
|Independent matches, P2-CONC-005 | Candidate second match finishes before first commits | Baseline57014 held on shared derived marker; no tournament-wide score serialization in this fixture |
|Score wins Lock / Lock wins score | Loser gets revision conflict or authorization denial | Lock revokes score authority; no score after losing lock race |
|Final score vs Finalize | Incomplete denies; stale Finalize conflicts; refreshed same-ID finalizes | Never Final with missing hole |
|12 Singles matches, P2-DERIVED-BURST |12 accepted,zero timeout/deadlock | Synthetic configured history; not provider concurrency certification |
|Score vs worker holding shared markers | Score commits before worker releases markers | Durable intent separates score from derived job locks |
|Net Skins mixed-round worker inversion | Cycle captured; one40P01 becomes RETRYABLE; explicit retry succeeds | Deadlock not eliminated; score remains committed |

The per-match FOR UPDATE lock remains required for revisions,correction,progress,idempotency and lifecycle. Frozen context/permission checks and current admission stay fail-closed. Intent inserts avoid shared derived job-row locks; their row/index locks, tournament foreign-key parent protection and relation/DDL locks remain. Required audit/receipt/index locks remain. The rehearsal partial index removes irrelevant work while holding the score lock; it does not change security lock semantics.

Worker deadlock evidence: `P2-MIG-SKINS-DEADLOCK` captures pg_blocking_pids and advisory lock graph. The savepoint around one materialization rolls back its side effects, records40P01 and backoff, while a later explicit flush succeeds. This is understood deterministic recovery, **not zero deadlocks**, and it does not prove autonomous retries. Max8 claim batch is a candidate bound; Production worker concurrency must not be inferred from a12-score burst.

Not tested exhaustively: score versus correction independent devices over HTTP, Resume/round-Lock/whole-round Open races, actor revocation snapshot boundaries, full compatible release transition, pathological5× retry storms and annual manifest contention. These remain visible in the [proof matrix](PROOF-MATRIX.md) and P0 register.

Artifacts: [canonical proof](evidence/score-proof-after.json), [derived proof](evidence/derived-proof-after.json), [migration/worker graph](evidence/migration-safety.json), [baseline failure](evidence/score-proof-before.json), [machine subset](concurrency-results.json). Local lock bounds: [performance](PERFORMANCE.md).
