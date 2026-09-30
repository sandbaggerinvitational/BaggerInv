# Local performance closure

**STRONGLY SUPPORTED — NO SYSTEMATIC REGRESSION DETECTED.** Three controlled local batches completed12,000/12,000 accepted canonical score RPC samples with zero failures. There is no monotonic history-growth pattern. Google/Director/annual work was not added to the ordinary score function. These are local rolled-back RPC measurements, not HTTP or durable-commit latency.

## Method and reproducibility

`node tools/reliability/benchmark-phase2c1-closure.mjs` creates only owned disposable Unix-socket PostgreSQL17 databases. Remote networking is denied; provider credentials are removed. Each scale has1,000 samples in each of three batches. Orders are5,1,10,2;2,10,1,5;10,5,2,1. Fixture is`bagger-r139-synthetic-history-v1+phase2-eligible-history-v2`, seed`2026-never-again-139`. Migrations through127 were installed. SHA/file hashes and source stability are in[benchmark-results.json](evidence/benchmark-results.json); full query plans and raw samples remain beneath each batch artifact.

Inherited resource profile: local PostgreSQL17.11,32MB shared buffers,4MB work memory,20connection limit,1,000ms statement timeout,fsync disabled. Exact host/resource observations are retained per scale. Host load/free memory include unrelated processes; physical IOPS and database CPU/peak memory are unavailable. No cache flush or cold-OS-cache claim. Each connection batch includes its first RPC; no slow samples were discarded.

## Results

All values below are milliseconds. Each cell shows batches1/2/3, not pooled percentiles. P99 is an empirical local estimate from1,000 samples per cell (~10tail observations), not a capacity confidence bound.

| History | Prior retirement p50 | Closure p50 | Closure p95 | Closure p99 | Closure max | Batch median spread |
|---|---:|---|---|---|---|---:|
| 1× | 0.570 | 0.544 / 0.546 / 0.597 | 0.628 / 0.711 / 0.725 | 1.328 / 1.292 / 1.341 | 8.024 / 8.297 / 8.332 | 9.74% |
| 2× | 0.600 | 0.599 / 0.549 / 0.600 | 0.708 / 0.689 / 0.714 | 1.346 / 1.373 / 1.350 | 8.433 / 10.652 / 8.853 | 9.29% |
| 5× | 0.558 | 0.545 / 0.566 / 0.551 | 0.630 / 0.773 / 0.716 | 1.321 / 1.624 / 1.357 | 8.337 / 8.714 / 10.109 | 3.85% |
| 10× | 0.606 | 0.551 / 0.565 / 0.552 | 0.789 / 0.907 / 0.724 | 1.611 / 1.526 / 1.353 | 8.896 / 9.388 / 8.412 | 2.54% |

The prior Phase2C.1 fixture was local too, but host scheduling was not controlled. Prior maxima20.444ms at2× and27.974ms at10× did not recur. Do not describe a few-percent difference as an improvement: within-candidate median spread reaches9.74%.

## Tail interpretation

PROVEN from retained samples:65 observations exceeded5ms, of which60 were the first RPC in their200-sample connection batch. Five other outliers occurred at2× or10×. First-RPC startup is a strong association, not proof of a specific internal cost. The5ms boundary is descriptive, not an approved performance budget. There was no task-owned worker activity during these runs; correlation with unrelated host scheduling/I/O remains UNKNOWN.

All scales report85 nested SQL executions, unchanged from retirement. This is not85 HTTP/database round trips. Transactions roll back and fixture rollback checks pass. Separate lock-duration percentiles and durable transaction-commit percentiles are NOT PROVEN; no figures are invented. Worst observed RPC10.652ms has93.88× headroom to the configured1,000ms local statement timeout. This is query-path headroom only.

## Scope and remaining evidence

The changed annual CREATE/readback and isolated Director functions are not called by ordinary canonical score submission. The benchmark rechecks the common no-applicable-compatibility-receipt path. Existing Phase2C eligible-history/receipt/worker tests remain subject to source-hash change-impact review; this report does not pretend all of those branches were remeasured. Full-sequence and finite-timeout revalidation receipts are separately indexed inEVIDENCE.md.

Production capacity, Disk I/O, connection headroom, p99, provider stability and hosted client latency remain NOT PROVEN. The candidate is not promoted by this report.
