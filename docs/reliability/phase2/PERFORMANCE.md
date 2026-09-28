# Phase 2 performance evidence

**Evidence boundary:** all runtime results below are isolated local PostgreSQL17 or local application tests. No Production query, deployment, real competitive mutation or physical-device test occurred. PASS applies only to the named fixture/layer. Recommendations are not implemented facts.

**PROVEN — PERFORMANCE:** the candidate removes the measured eligible Calcutta history-growth mechanism and shared synchronous derived source/job work from canonical score writes. **PARTIAL** for the complete Phase 2 performance gate: active annual-runtime admission, finite deployed timeout headroom, hosted network/pool/I/O and exhaustive resource-pressure behavior remain NOT PROVEN.

Candidate migration SHA256: `cd9f6a784741d9e41c7f2e267bf4135549aeeb61333a22e4a31d9a174a3651a8`. Exact source/proof manifests are in [evidence](EVIDENCE.md).

## Same-method common path (milliseconds)

| History | Before p50 | Candidate p50 | Candidate p95 | Candidate p99 | Candidate max | p50 delta | Nested SQL before → after |
|---|---:|---:|---:|---:|---:|---:|---|
| 1× | 20.103 | 0.587 | 0.868 | 1.797 | 9.711 | -97.1% | 595 → 88 |
| 2× | 20.126 | 0.595 | 1.313 | 1.879 | 10.459 | -97.0% | 595 → 88 |
| 5× | 20.246 | 0.573 | 0.729 | 1.633 | 9.714 | -97.2% | 595 → 88 |
| 10× | 20.356 | 0.669 | 0.998 | 1.867 | 13.282 | -96.7% | 595 → 88 |

Each side:4,000 validated ACCEPTED writes,1,000 per scale, five independent local psql sessions/batches of200. Samples execute the actual score RPC in rolled-back transactions; no NO_CHANGE/replay is counted as accepted new-write performance. One first fresh-session observation is retained separately. This is not OS cold-cache or durable fsync performance. Phase 1 fixture uses fsync=off,32MB shared buffers,4MB work_mem,20 max connections; host/resources/version are captured in JSON. Server CPU utilization/I/O wait/pool saturation unavailable; local cumulative buffer counters do not establish provider headroom.

The endpoint includes authentication, dispatch and serialization that this RPC timing excludes. Nested execution counts are not network calls and overlapping plan rows cannot be summed as distinct rows examined. One network RPC remains one RPC. Full-round committed tests prove state transitions separately; rollback latency is not called durable-commit latency.

## Synthetic eligible-history branch fixtures

| Branch | Before1× p50 | Before10× p50 | Candidate1× p50 | Candidate10× p50 |
|---|---:|---:|---:|---:|
| none | 23.141 | 21.533 | 1.152 | 1.209 |
| current_compatible | 55.084 | 204.381 | 1.100 | 1.339 |
| current_incompatible_consumed | 54.404 | 205.229 | 1.222 | 1.134 |
| current_incompatible_financial | 35.505 | 129.366 | 1.056 | 1.135 |
| stale_source | 49.827 | 205.793 | 1.569 | 1.111 |
| stale_result_binding | 21.210 | 22.210 | 1.100 | 1.181 |
| superseded_result | 25.038 | 21.175 | 1.304 | 1.290 |
| multiple_receipts | 83.841 | 396.421 | 1.255 | 1.193 |

Each side:960 accepted samples across32 branch/scale cases,30 per case in3 sessions of10. Deterministic scale order5,1,10,2 and alternating branch order reduce simple ordering bias. Fresh-session planning occurs at each batch start; its tail differs from the200-sample common-path batches. Do not compare their p95 values as though methodology is identical. Eligible-branch p99 is NOT PROVEN. Retained variants force absent,current-compatible,two incompatible,stale-source,stale-result,superseded and multiple receipt paths; behavioral spies prove the installed SQL recognizes branch eligibility before the score and avoids historical compatibility calls within candidate score. Receipt rows are synthetic: the protected issuer has not been exercised to produce every adversarial receipt state. Full issuance-lifecycle proof remains open.

## Transaction and lock bounds

| History / branch | Before DB p50 | Candidate DB p50 | Before lock lower p50 | Candidate lock lower p50 | Candidate transaction upper p50 |
|---|---:|---:|---:|---:|---:|
| 1× / none | 20.584 | 0.590 | 20.529 | 0.557 | 0.708 |
| 1× / multiple_receipts | 76.706 | 0.556 | 76.638 | 0.521 | 0.654 |
| 2× / none | 20.591 | 0.555 | 20.534 | 0.520 | 0.652 |
| 2× / multiple_receipts | 107.636 | 0.643 | 107.575 | 0.604 | 0.751 |
| 5× / none | 21.214 | 0.581 | 21.097 | 0.541 | 0.679 |
| 5× / multiple_receipts | 207.350 | 0.556 | 207.284 | 0.521 | 0.653 |
| 10× / none | 21.157 | 0.630 | 21.099 | 0.594 | 0.730 |
| 10× / multiple_receipts | 374.572 | 0.702 | 374.489 | 0.663 | 0.806 |

Each side800 accepted rollback samples (100 per case). A test-only timestamp immediately after the actual match lock yields a **lower bound** through RPC return; BEGIN/RPC/ROLLBACK client wall time supplies an **upper bound** on total transaction occupancy. Neither is an exact COMMIT lock-release timestamp. Database-clock RPC duration is separately recorded. Sample size does not support p99. Canonical digest plus audit/outbox count checks prove reset; full atomicity tests provide stronger content assertions.

Local default statement_timeout is0 (unbounded), with deliberate finite57014 tests separately. Therefore **finite-timeout headroom NOT PROVEN**; no deployed setting is guessed and no timeout was raised. Candidate latency is far below test race limits but that is not a Production timeout budget.

## Variance, plans and decision

Raw batches/first observations/min/max remain in [before](benchmark-before.json), [candidate](benchmark-after.json), [eligible before](eligible-history-before.json), [eligible candidate](eligible-history-after.json). The gate uses observed batch variance, a50% relative history-growth allowance and1ms noise floor; tolerances are candidate proposals, not approved Production SLOs. Its18 unit cases reject malformed/missing evidence, wrong provenance and forbidden plan families. Full query/index review remains a separate human gate. The order-of-magnitude source-work removal is material; tiny differences across scales are not advertised as improvements.

[Query report](QUERY-PLANS.md) documents the second restored-rehearsal history scan and exact partial-index proof. [Concurrency](CONCURRENCY.md) and [failure injection](FAILURE-INJECTION.md) cover commit semantics. The full432-hole R1→R2→R3 sequence retains earlier operational history; formats/inputs differ so round medians are diagnostic, not a matched history-scaling experiment. Prior-year fixture scales retain1/2/5/10 archived tournaments. New intent completed-history growth and actual annual-runtime manifest costs need additional proof.

**No approved PHASE2_SCORE_PATH_BASELINE is promoted while Phase 2 is PARTIAL.** Preserve candidate results as measured evidence alongside untouched Phase 1. New instrumentation overhead versus uninstrumented hosted API, controlled CPU/I/O pressure, realistic HTTP retry storms, concurrent6/6/12-round soak and provider connection limits are NOT PROVEN. The12-connection burst is an architectural contention test, not a capacity certificate.
