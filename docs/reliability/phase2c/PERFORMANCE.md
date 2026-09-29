# Local performance evidence

**PROVEN for the executed local samples; Production performance and capacity remain NOT PROVEN.** [Common baseline](benchmark-baseline-common.json), [candidate](benchmark-candidate-common.json), [eligible baseline](benchmark-baseline-eligible.json), [eligible candidate](benchmark-candidate-eligible.json), [recovery](benchmark-candidate-recovery.json), [machine gate](performance-gate.json).

See the retained failed comparison and repeat below: comparative tail repeatability remains PARTIAL.

## Comparable method

PostgreSQL17.11 on the recorded local host,32MB shared buffers,20connection limit,fsync disabled; exact host/configuration/resource observations are retained in each artifact. Synthetic fixture `bagger-r139-synthetic-history-v1` plus eligible-history version, seed `2026-never-again-139`. Common/baseline/recovery scales run in deterministic5,1,10,2order. The final candidate eligible repeat uses2,5,1,10; eligible branch order reverses on even scales. Each sample validates the actual SQL/RPC result. Score samples begin and roll back independently; cardinality/digest checks verify reset. Recovery samples read one genuinely accepted owned receipt after the supported Lock operation revokes scoring access; the fixture asserts the match stays locked and access stays revoked throughout each scale. These are RPC elapsed timings, not HTTP or durable fsync/COMMIT measurements.

Each common/recovery cell contains1,000successful samples in five batches of200. P99 is an empirical estimate with only ten tail observations, not a confidence interval or availability guarantee. Eligible cells contain30samples in three batches; p95 is descriptive and p99 NOT PROVEN. First fresh-session observations are retained separately; this is not a cold operating-system cache benchmark. Normal statement limit1s on every clone, not unlimited default. Setup runs separately under a maintenance allowance.

## Common score and recovery

All values below are milliseconds in the same local environment. Baseline is this task's fresh unchanged121function measurement under the same finite UTC profile. Phase1 approximately23–26ms and Phase2's major critical-path reduction are historical context; Phase2C does not claim that earlier improvement as its own.

|History|Before score p50|After score p50|After p95|After p99|After max|Median delta|After batch-median spread|Recovery p50/p95/p99/max|
|---|---:|---:|---:|---:|---:|---:|---:|---|
|1×|0.570|0.575|0.740|1.340|8.732|0.005|0.016|0.072/0.083/0.293/2.521|
|2×|0.679|0.631|0.755|1.417|9.280|-0.048|0.007|0.069/0.083/0.300/2.799|
|5×|0.571|0.623|0.814|1.553|9.149|0.052|0.057|0.071/0.082/0.297/2.614|
|10×|0.595|0.584|0.834|1.730|8.669|-0.011|0.028|0.070/0.082/0.294/2.614|

Observed worst common score9.280ms, eligible score30.278ms, recovery2.799ms versus the isolated1,000ms statement budget. These maxima consume0.93%,3.03% and0.28% respectively. Headroom is adequate for these local query-path samples only. Host CPU/disk contention, remote connection overhead and provider I/O are not inferred from this ratio.

## Eligible-history branches

Eight branch fixtures per scale: none, current_compatible, current_incompatible_consumed, current_incompatible_financial, stale_source, stale_result_binding, superseded_result and multiple_receipts. Synthetic receipt construction tests semantic branches; it does not prove the protected late-R3 issuance workflow. Exact variant labels/counts are in raw artifacts; input/output assertions prevent benchmarking an early rejection as a successful score.

|History|Branch median range ms|Worst observed branch|Its p95 ms|Max ms|Samples|
|---|---:|---|---:|---:|---:|
|1×|1.102–1.156|none|8.324|8.886|240|
|2×|1.088–1.156|stale_source|8.276|8.571|240|
|5×|1.121–1.211|superseded_result|8.978|30.278|240|
|10×|1.188–1.344|current_compatible|9.346|9.614|240|

The automated gate checks all four scales, complete branch/sample evidence, expected plans, no forbidden historical-derived relation, and finite headroom. Proposed tolerances allow the greater of1ms scheduling floor,25% baselinep95 or three times batch-median spread; history growth allows1ms or50% median. They are local regression-review tolerances, not approved Production SLOs. A tiny faster median inside measured variance is not called a material improvement. The evidence supports bounded behavior over the tested1–10× range; it is not a proof for unbounded future data or every possible branch.

## Transaction and lock brackets

[Before](lock-duration-baseline.json), [after](lock-duration-candidate.json). Eight100sample cells,800candidate observations. A test-only clock is inserted immediately after the actual match FOR UPDATE and successful FOUND check. DB clock to RPC return is a lock-hold lower bound; persistent-session BEGIN/RPC/ROLLBACK wall time is a transaction upper bound. Neither is exact durable COMMIT lock release. Extra clocks have overhead, so do not compare these directly with uninstrumented medians. P99 NOT PROVEN at100/cell.

|Case|Before p50 DB/lock lower/transaction upper|After p50 DB/lock lower/transaction upper|After transaction p95|After transaction max|
|---|---|---|---:|---:|
|1× none|0.559/0.525/0.668|0.614/0.577/0.710|0.911|1.718|
|1× multiple_receipts|0.555/0.520/0.655|0.556/0.522/0.649|0.797|1.488|
|2× none|0.586/0.551/0.678|0.581/0.548/0.677|0.867|1.758|
|2× multiple_receipts|0.565/0.528/0.661|0.612/0.575/0.706|0.923|1.692|
|5× none|0.563/0.528/0.662|0.585/0.551/0.683|0.864|1.599|
|5× multiple_receipts|0.589/0.554/0.683|0.630/0.593/0.735|1.050|1.695|
|10× none|0.574/0.540/0.668|0.599/0.563/0.708|1.207|1.807|
|10× multiple_receipts|0.630/0.592/0.729|0.562/0.530/0.653|1.161|1.851|

## Worker, accumulated history and backlog

[Worker history](evidence/worker-history-detail.json) exercises32cases, three samples each of two family ticks plus actual claim,288observations. The actual final per-operation timing values and maxima are retained in that artifact under a5s limit; those values come from its own run, not the score benchmark. [Annual history](evidence/annual-history.json) executes320protected runtime samples across four scales and4/8/20/40prior years, including5184→51840terminal intent/attempt rows. Process/connection wall time is labeled separately; p99 NOT PROVEN.

[Backlog pressure](evidence/backlog-pressure-results.json) compares18and108genuine committed pending intents while six matches continue scoring. Per-scenario DB/adapter timings, current pending-work observations, connection/lock samples and completed current-source checks are preserved there. Only12measured scores per scenario: no p95/p99 claim. Sampling gaps are explicit; sampled lock/connection counts are not continuous maxima. CPU/IOPS/throughput unavailable. [Repeated backlog tails](evidence/backlog-tail-results.json) separately measures at least1,000qualified ordinary Best Ball writes per normal/larger profile, across independent fresh six-group bursts. Only observations with pending automatic demand immediately before submit enter those distributions; nonqualifying accepted scores remain retained. Test-only lock clocks and autocommit response times bracket lock holding while workers run. The two profiles are never pooled with each other or described as Production/per-formatp99.

[Full sequence](FULL-SEQUENCE.md) is a committed432hole/24Final integration flow with retained history and worker outage/restart. Its adapter timings include different work from rollbackRPC microbenchmarks. It therefore provides lifecycle/convergence proof and a separate local timing series, not a directly comparable speedup.

## Limits

Nested auto_explain statements count executed SQL inside functions; they are not network round trips or distinct rows. EXPLAIN adds instrumentation overhead. Local fsync=off cannot certify power-loss durability. No Production query, load, provider setting, timeout or capacity change occurred. High-cardinality IDs stay in event logs, not metric labels. The candidate adds provenance and durable delivery evidence; its success is correctness, bounded growth and recoverability, not the lowest microbenchmark median.

## Actual worker and active-backlog observations

Local milliseconds only. Worker history has three samples per branch/operation, so no worker p95 or p99 is inferred. Each history row below reports its largest retained observation across the explicitly different branch fixtures, not a percentile.

| History | Calcutta tick max | Competition tick max | Calcutta claim max |
|---|---:|---:|---:|
| 1× | 21.953 | 8.016 | 30.652 |
| 2× | 23.283 | 8.768 | 36.898 |
| 5× | 19.523 | 7.848 | 27.625 |
| 10× | 23.928 | 8.320 | 35.112 |

The following are separate, conditional active-backlog distributions. Each observation is a successful actual score RPC with pending automatic demand immediately before submission. Repeated fresh six-group bursts preserve ordinary input validation and canonical result checks. These values include test-only clocks; neither table measures hosted capacity.

| Preload | Qualified / nonqualifying | Dimension | p50 | p95 | empirical p99 | max |
|---|---|---|---:|---:|---:|---:|
| normal_preload_one_hole | 1008 / 0 | dbFunctionWallMs | 2.599 | 13.555 | 15.721 | 18.553 |
| normal_preload_one_hole | 1008 / 0 | lockHeldThroughRpcMs | 2.115 | 10.758 | 12.260 | 15.182 |
| normal_preload_one_hole | 1008 / 0 | transactionWallUpperMs | 2.848 | 14.804 | 16.902 | 19.965 |

normal_preload_one_hole: 28 fresh bursts; 0 score failures; worker error observations {"deadlock40P01": 0, "failedInvocations": 28, "statementTimeout57014": 0}. All successful burst conclusions independently validate current derived pointers and unchanged financial/publication authority.


| Preload | Qualified / nonqualifying | Dimension | p50 | p95 | empirical p99 | max |
|---|---|---|---:|---:|---:|---:|
| larger_preload_six_holes | 1008 / 0 | dbFunctionWallMs | 2.546 | 14.122 | 15.787 | 17.500 |
| larger_preload_six_holes | 1008 / 0 | lockHeldThroughRpcMs | 2.104 | 11.206 | 12.803 | 14.831 |
| larger_preload_six_holes | 1008 / 0 | transactionWallUpperMs | 2.830 | 15.752 | 16.975 | 18.449 |

larger_preload_six_holes: 28 fresh bursts; 0 score failures; worker error observations {"deadlock40P01": 0, "failedInvocations": 28, "statementTimeout57014": 0}. All successful burst conclusions independently validate current derived pointers and unchanged financial/publication authority.


Each profile records the Calcutta `40001` retryable failures shown above. Source review strongly supports stale-input rejection while concurrent scores advance authority; the normalized trace retains SQLSTATE but not the original database exception message, so exact exception attribution is not proven. Every burst subsequently completed current Calcutta work without intervention. The observed fast recovery must not be described as the same job completing its full backoff: newer-source replacement/coalescing may select new work.

normal_preload_one_hole: sampled maxima {"blockedSessions": 0, "connections": 7, "lockWaitingSessions": 0, "ungrantedLocks": 0}. Connections exclude the sampling connection; add one for total observed connections. Sampling does not prove absence of shorter waits. CPU, IOPS and continuous wait maxima were unavailable.

larger_preload_six_holes: sampled maxima {"blockedSessions": 0, "connections": 8, "lockWaitingSessions": 0, "ungrantedLocks": 0}. Connections exclude the sampling connection; add one for total observed connections. Sampling does not prove absence of shorter waits. CPU, IOPS and continuous wait maxima were unavailable.


## Historical three-phase comparison

### Phase 1 → Phase 2 → Phase 2C local evidence comparison

**Historical comparison only.** Every number is local disposable PostgreSQL17 with synthetic history, not Production. Phase1/Phase2 are retained historical artifacts; their missing original dependency graph cannot be reconstructed after the fact. The fresh Phase2C matched baseline/candidate comparison is the candidate regression authority. No improvement percentage is computed across different sample sizes, tools, schema, timeout or cache conditions.

The score table shows p50 / p95 / p99 / max in milliseconds. Phase1 n30 is insufficient for p99. Phase2/Phase2C n1000 yields an empirical p99, not a confidence interval or a provider SLO. Score timing is local statement elapsed time including socket/result transport; it is not HTTP latency or server-only exclusive CPU time.

| History | Phase1 score RPC (retained) | Phase2 score RPC (retained candidate) | Phase2C score RPC (current candidate only) |
|---|---|---|---|
| 1× | n=30; 23.026 / 27.540 / NOT PROVEN / 37.602 | n=1000; 0.587 / 0.868 / 1.797 / 9.711 | n=1000; 0.575 / 0.740 / 1.340 / 8.732 |
| 2× | n=30; 24.057 / 26.131 / NOT PROVEN / 36.591 | n=1000; 0.595 / 1.313 / 1.879 / 10.459 | n=1000; 0.631 / 0.755 / 1.417 / 9.280 |
| 5× | n=30; 26.190 / 34.275 / NOT PROVEN / 35.366 | n=1000; 0.573 / 0.729 / 1.633 / 9.714 | n=1000; 0.623 / 0.814 / 1.553 / 9.149 |
| 10× | n=30; 23.071 / 27.840 / NOT PROVEN / 38.898 | n=1000; 0.669 / 0.998 / 1.867 / 13.282 | n=1000; 0.584 / 0.834 / 1.730 / 8.669 |

Instrumented transaction/lock observations are a separate 100-sample series. The table gives p50 / p95 / p99 / max. `Transaction wall upper` includes BEGIN/RPC/ROLLBACK and local transport. `Lock through RPC lower` starts after the real match FOR UPDATE and ends at RPC return; neither is the exact lock-release/COMMIT timestamp. Instrumentation overhead and rollback differ from the score table.

| History | Dimension | Phase1 | Phase2 retained | Phase2C current |
|---|---|---|---|---|
| 1× | Transaction wall upper | NOT PROVEN — not retained separately | n=100; 0.708 / 0.989 / NOT PROVEN / 1.734 | n=100; 0.710 / 0.911 / NOT PROVEN / 1.718 |
| 1× | Database function duration | NOT PROVEN — not retained separately | n=100; 0.590 / 0.853 / NOT PROVEN / 1.573 | n=100; 0.614 / 0.775 / NOT PROVEN / 1.586 |
| 1× | Lock through RPC lower | NOT PROVEN — not retained separately | n=100; 0.557 / 0.816 / NOT PROVEN / 1.119 | n=100; 0.577 / 0.718 / NOT PROVEN / 1.274 |
| 2× | Transaction wall upper | NOT PROVEN — not retained separately | n=100; 0.652 / 0.875 / NOT PROVEN / 2.547 | n=100; 0.677 / 0.867 / NOT PROVEN / 1.758 |
| 2× | Database function duration | NOT PROVEN — not retained separately | n=100; 0.555 / 0.739 / NOT PROVEN / 2.425 | n=100; 0.581 / 0.738 / NOT PROVEN / 1.622 |
| 2× | Lock through RPC lower | NOT PROVEN — not retained separately | n=100; 0.520 / 0.703 / NOT PROVEN / 1.096 | n=100; 0.548 / 0.678 / NOT PROVEN / 1.290 |
| 5× | Transaction wall upper | NOT PROVEN — not retained separately | n=100; 0.679 / 1.382 / NOT PROVEN / 13.269 | n=100; 0.683 / 0.864 / NOT PROVEN / 1.599 |
| 5× | Database function duration | NOT PROVEN — not retained separately | n=100; 0.581 / 1.110 / NOT PROVEN / 13.004 | n=100; 0.585 / 0.741 / NOT PROVEN / 1.473 |
| 5× | Lock through RPC lower | NOT PROVEN — not retained separately | n=100; 0.541 / 0.926 / NOT PROVEN / 12.963 | n=100; 0.551 / 0.703 / NOT PROVEN / 1.167 |
| 10× | Transaction wall upper | NOT PROVEN — not retained separately | n=100; 0.730 / 0.990 / NOT PROVEN / 1.695 | n=100; 0.708 / 1.207 / NOT PROVEN / 1.807 |
| 10× | Database function duration | NOT PROVEN — not retained separately | n=100; 0.630 / 0.886 / NOT PROVEN / 1.557 | n=100; 0.599 / 1.096 / NOT PROVEN / 1.684 |
| 10× | Lock through RPC lower | NOT PROVEN — not retained separately | n=100; 0.594 / 0.850 / NOT PROVEN / 1.220 | n=100; 0.563 / 1.057 / NOT PROVEN / 1.638 |

Nested SQL execution counts come from separate instrumented representative plan runs. They are neither application network calls nor distinct rows examined. Missing Phase1 nested counts remain NOT PROVEN; its one top-level timed statement is not a nested query count.

| History | Phase1 nested count | Phase2 retained nested count | Phase2C current nested count |
|---|---|---|---|
| 1× | NOT PROVEN | 88 | 88 |
| 2× | NOT PROVEN | 88 | 88 |
| 5× | NOT PROVEN | 88 | 88 |
| 10× | NOT PROVEN | 88 | 88 |

Recovery is an additive Phase2C API/RPC. Phase1/Phase2 had no equivalent authorized post-revocation endpoint, so no earlier timing baseline exists. Worker-delivery timing is per family/RPC; unrelated Phase1 calculator timings are not a substitute for the automatic adapter introduced in Phase2C.

| History | Dimension | Phase1 | Phase2 | Phase2C current |
|---|---|---|---|---|
| 1× | Owned recovery p50/p95/p99/max | NOT PROVEN — endpoint absent | NOT PROVEN — endpoint absent | n=1000; 0.072 / 0.083 / 0.293 / 2.521 |
| 1× | Worker Calcutta materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[18.175, 10.155, 9.758] ms; current_compatible: raw[17.592, 10.121, 10.122] ms; current_incompatible_consumed: raw[17.532, 9.779, 9.599] ms; current_incompatible_financial: raw[19.513, 10.613, 10.304] ms; stale_source: raw[19.010, 10.784, 10.355] ms; stale_result_binding: raw[21.953, 11.971, 11.820] ms; superseded_result: raw[17.816, 10.389, 10.930] ms; multiple_receipts: raw[17.723, 9.882, 9.666] ms |
| 1× | Worker Competition materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[7.099, 3.038, 2.585] ms; current_compatible: raw[7.083, 2.823, 3.014] ms; current_incompatible_consumed: raw[6.915, 2.665, 2.794] ms; current_incompatible_financial: raw[7.609, 2.969, 2.735] ms; stale_source: raw[7.671, 3.087, 2.818] ms; stale_result_binding: raw[8.016, 3.272, 2.887] ms; superseded_result: raw[7.645, 2.762, 2.681] ms; multiple_receipts: raw[7.098, 2.788, 2.488] ms |
| 1× | Worker Calcutta claim | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[26.082, 17.276, 17.424] ms; current_compatible: raw[25.816, 18.529, 18.410] ms; current_incompatible_consumed: raw[26.636, 17.150, 17.236] ms; current_incompatible_financial: raw[28.306, 18.300, 18.320] ms; stale_source: raw[28.097, 20.400, 18.612] ms; stale_result_binding: raw[30.652, 19.243, 18.901] ms; superseded_result: raw[27.721, 18.426, 18.269] ms; multiple_receipts: raw[26.649, 17.253, 16.832] ms |
| 2× | Owned recovery p50/p95/p99/max | NOT PROVEN — endpoint absent | NOT PROVEN — endpoint absent | n=1000; 0.069 / 0.083 / 0.300 / 2.799 |
| 2× | Worker Calcutta materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[19.159, 10.080, 10.899] ms; current_compatible: raw[18.642, 10.030, 9.899] ms; current_incompatible_consumed: raw[18.108, 10.931, 13.888] ms; current_incompatible_financial: raw[18.829, 11.873, 10.808] ms; stale_source: raw[23.283, 12.195, 11.402] ms; stale_result_binding: raw[20.122, 12.742, 11.155] ms; superseded_result: raw[22.984, 11.648, 11.784] ms; multiple_receipts: raw[22.225, 11.416, 11.398] ms |
| 2× | Worker Competition materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[7.670, 2.892, 2.718] ms; current_compatible: raw[7.130, 2.812, 2.602] ms; current_incompatible_consumed: raw[8.768, 3.509, 3.173] ms; current_incompatible_financial: raw[8.126, 3.018, 2.820] ms; stale_source: raw[8.444, 3.288, 3.162] ms; stale_result_binding: raw[7.947, 2.963, 2.755] ms; superseded_result: raw[8.471, 6.233, 3.077] ms; multiple_receipts: raw[8.077, 3.381, 4.152] ms |
| 2× | Worker Calcutta claim | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[29.313, 19.619, 19.935] ms; current_compatible: raw[26.491, 17.683, 17.616] ms; current_incompatible_consumed: raw[30.386, 19.846, 19.452] ms; current_incompatible_financial: raw[29.123, 18.667, 18.171] ms; stale_source: raw[31.500, 18.858, 18.829] ms; stale_result_binding: raw[31.437, 19.194, 19.025] ms; superseded_result: raw[36.898, 18.783, 22.421] ms; multiple_receipts: raw[34.563, 19.427, 18.658] ms |
| 5× | Owned recovery p50/p95/p99/max | NOT PROVEN — endpoint absent | NOT PROVEN — endpoint absent | n=1000; 0.071 / 0.082 / 0.297 / 2.614 |
| 5× | Worker Calcutta materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[19.523, 11.285, 10.636] ms; current_compatible: raw[17.933, 9.882, 9.653] ms; current_incompatible_consumed: raw[17.593, 9.887, 9.710] ms; current_incompatible_financial: raw[17.347, 9.984, 10.105] ms; stale_source: raw[17.762, 10.285, 9.793] ms; stale_result_binding: raw[19.022, 10.873, 10.780] ms; superseded_result: raw[17.415, 9.877, 9.883] ms; multiple_receipts: raw[19.514, 10.934, 10.432] ms |
| 5× | Worker Competition materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[7.848, 2.974, 2.753] ms; current_compatible: raw[7.105, 3.050, 2.560] ms; current_incompatible_consumed: raw[7.208, 2.894, 2.605] ms; current_incompatible_financial: raw[7.126, 2.853, 2.607] ms; stale_source: raw[7.120, 2.729, 2.492] ms; stale_result_binding: raw[7.499, 2.913, 2.692] ms; superseded_result: raw[7.310, 2.867, 2.568] ms; multiple_receipts: raw[7.522, 2.909, 2.576] ms |
| 5× | Worker Calcutta claim | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[27.625, 18.199, 18.093] ms; current_compatible: raw[26.146, 17.476, 17.002] ms; current_incompatible_consumed: raw[26.310, 17.043, 17.415] ms; current_incompatible_financial: raw[25.969, 17.347, 16.767] ms; stale_source: raw[26.318, 17.040, 16.774] ms; stale_result_binding: raw[27.130, 17.194, 16.972] ms; superseded_result: raw[26.088, 17.272, 16.919] ms; multiple_receipts: raw[27.246, 19.880, 19.305] ms |
| 10× | Owned recovery p50/p95/p99/max | NOT PROVEN — endpoint absent | NOT PROVEN — endpoint absent | n=1000; 0.070 / 0.082 / 0.294 / 2.614 |
| 10× | Worker Calcutta materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[20.624, 10.708, 10.826] ms; current_compatible: raw[23.928, 12.197, 11.560] ms; current_incompatible_consumed: raw[20.115, 10.639, 12.056] ms; current_incompatible_financial: raw[23.672, 10.767, 10.540] ms; stale_source: raw[21.714, 10.418, 10.213] ms; stale_result_binding: raw[19.838, 10.372, 10.037] ms; superseded_result: raw[17.313, 10.443, 12.227] ms; multiple_receipts: raw[17.906, 9.913, 9.698] ms |
| 10× | Worker Competition materialization | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[8.011, 3.262, 2.774] ms; current_compatible: raw[8.051, 2.985, 2.814] ms; current_incompatible_consumed: raw[7.747, 2.821, 3.088] ms; current_incompatible_financial: raw[7.945, 2.879, 2.555] ms; stale_source: raw[7.194, 2.939, 2.642] ms; stale_result_binding: raw[7.558, 2.825, 2.698] ms; superseded_result: raw[8.320, 3.365, 2.764] ms; multiple_receipts: raw[7.015, 3.217, 2.948] ms |
| 10× | Worker Calcutta claim | NOT PROVEN — not equivalent | NOT PROVEN — autonomous adapter absent | none: raw[35.027, 20.101, 20.148] ms; current_compatible: raw[35.112, 19.206, 18.650] ms; current_incompatible_consumed: raw[31.211, 19.615, 19.612] ms; current_incompatible_financial: raw[30.857, 17.497, 17.418] ms; stale_source: raw[29.452, 17.176, 17.390] ms; stale_result_binding: raw[30.689, 17.457, 16.948] ms; superseded_result: raw[26.514, 17.980, 17.449] ms; multiple_receipts: raw[26.296, 16.976, 18.940] ms |

All durable COMMIT/fsync, physical storage IOPS, provider connection headroom and Production p99 remain NOT PROVEN. Final workload-overlap tails live separately in `backlog-tail-results.json`; they cannot be inferred from idle common-path or 12-score backlog smoke measurements.

Sources: [Phase1 benchmark](../performance/BENCHMARK-RESULTS.json), [Phase2 benchmark](../phase2/benchmark-after.json), [Phase2 lock bounds](../phase2/lock-duration-after.json), [Phase2C benchmark](benchmark-candidate-common.json), [Phase2C lock bounds](lock-duration-candidate.json), [Phase2C recovery](benchmark-candidate-recovery.json), [Phase2C worker history](evidence/worker-history-detail.json).


## Retained failed comparison and one controlled repeat

**P2C-NEW-PERF-VARIANCE — P1, OPEN; cause UNKNOWN.** The prior exact-source eligible run failed the unchanged tail gate for 2× current_compatible: n=30, p50 2.908 ms, p95 27.137 ms, max 31.633 ms. All scores succeeded below the same 1,000 ms statement limit. The raw run, gate and 40 plans are preserved in [counterevidence](evidence/eligible-comparison-counterexample/PRESERVATION.json).

One repeat, with unchanged source/thresholds and scale order 2,5,1,10, measured that cell at p50 1.129 ms, p95 8.126 ms, max 8.214 ms; the scoped gate passed. No further run-until-green was performed. The difference was not causally explained; host CPU/I/O outside the test was not controlled. The repeat does not erase the failure, prove a host cause, or establish universal latency non-regression. Requirement 73 remains PARTIAL pending repeatability investigation with resource observations. See [adjudication](evidence/performance-variance-review.json).

The benchmark tables describe the named final run, not every retained observation. Worst observed eligible latency across both runs is 31.633 ms (3.16% of the isolated statement budget). No approved replacement baseline or Production headroom follows.
