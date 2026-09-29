# Local performance non-regression assessment

**LOCAL NON-PRODUCTION ONLY. Execution: 4,000 accepted / 0 failed. Performance conclusion: PARTIAL — medians show no material growth across the measured common-path history scales; tail non-regression is not fully proven.** A benchmark JSON `result:PASS` means successful validated samples, not Production performance or closure of every performance gate.

## Method

Actual canonical RPC, fixture `bagger-r139-synthetic-history-v1+phase2-eligible-history-v2`, seed `2026-never-again-139`; migrations 125/126 applied with exact hashes in `benchmark-results.json`. 1,000 samples per scale in five 200-sample batches, deterministic order 5×→1×→10×→2×. Each accepted sample rolls back and verifies fixture determinism. Finite statement timeout 1,000 ms. First fresh-session timing is retained separately; this is not a cold OS-cache measurement.

Apple M5 / 10 logical CPUs, 16 GiB host; PostgreSQL 17.11, 32 MB shared_buffers, 4 MB work_mem, 20 connections, fsync OFF. RPC time excludes HTTP and durable commit. No other task-owned benchmarks ran concurrently; unrelated host load was not controlled. CPU/memory/I/O utilization sampling unavailable; initial cumulative counters/load are not provider-capacity evidence.

## Before / after (milliseconds)

Before is the preserved Phase 2C local run, not a paired same-time control. Differences are observations, not automatically causal effects.

| Scale | 2C p50 | 2C.1 p50 | 2C p95 | 2C.1 p95 | 2C p99 | 2C.1 p99 | 2C.1 max | Median ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1× | 0.575 | 0.570 | 0.740 | 1.369 | 1.340 | 1.748 | 8.977 | 0.991× |
| 2× | 0.631 | 0.600 | 0.755 | 0.702 | 1.417 | 1.465 | 20.444 | 0.951× |
| 5× | 0.623 | 0.558 | 0.814 | 0.724 | 1.553 | 1.383 | 8.751 | 0.896× |
| 10× | 0.584 | 0.606 | 0.834 | 1.289 | 1.730 | 4.888 | 27.974 | 1.038× |

P99 is an empirical local percentile with about 10 tail samples per 1,000, not a confidence interval or hosted SLO. Five batches alone do not eliminate host noise. Candidate medians 0.558–0.606 ms and 1×→10× ratio 1.063 show no median history explosion in this path. The 10× p99 rose 1.730→4.888 ms and max 8.669→27.974 ms; 1× p95 also rose 0.740→1.369 ms. This counterevidence is retained. No claim that retirement improved tails or that the differences are harmless noise is made. Root cause remains UNKNOWN.

An earlier retirement run, before the response-flag correction, also measured higher 10× tails: p99 3.726 ms / max 17.779 ms. It is preserved under evidence/pre-receipt-field-correction. It is not silently replaced with the more favorable median. Existing Phase 2C variance finding P2C-NEW-PERF-VARIANCE remains open; this task does not claim to resolve it.

## Work / lock / plan scope

Every scale measures 85 nested SQL executions per score versus 88 in the retained Phase 2C plan. These include loops and are not 85 network calls or rows examined. Removed Google producer work explains the source-level reduction; no new synchronous provider work is added. Plans still show the same three bounded canonical intent eligibility relations: calcutta_v1_current, net_skins_v1_configuration_current and net_skins_v1_configuration_revisions. Exact rows/plans are in the raw artifacts; no speculative index added.

| Scale | Fresh-session RPC ms | Batch median min–max ms | Nested SQL | Max to 1-second timeout headroom | Raw plan |
| --- | ---: | ---: | ---: | ---: | --- |
| 1× | 24.512 | 0.548–0.705 | 85 | 111.4× | [plan](evidence/revalidation/phase2c/evidence/candidate-common-1x-none-plan.json) |
| 2× | 13.733 | 0.595–0.605 | 85 | 48.9× | [plan](evidence/revalidation/phase2c/evidence/candidate-common-2x-none-plan.json) |
| 5× | 15.650 | 0.548–0.598 | 85 | 114.3× | [plan](evidence/revalidation/phase2c/evidence/candidate-common-5x-none-plan.json) |
| 10× | 25.115 | 0.587–0.648 | 85 | 35.7× | [plan](evidence/revalidation/phase2c/evidence/candidate-common-10x-none-plan.json) |

Transaction duration: measured RPC duration within a rollback transaction; durable COMMIT latency NOT PROVEN. Lock holding duration: NOT MEASURED SEPARATELY. No new claim about Production locks, I/O, connections or CPU. Local observed timeout headroom is adequate for this common path, but finite failure/recovery evidence is separate and provider pressure is unproved.

Eligible-history branches and all higher contention/tail budgets were not rerun by this four-scale common benchmark. Preserve the Phase 2C eligible-history evidence as historical, not fresh candidate PASS. The full sequence/worker tests separately execute committed canonical mutations, recovery and financial/internal delivery branches.

## Reproduction and artifacts

Run `node tools/reliability/benchmark-phase2c1.mjs` on the isolated checkout with local PostgreSQL 17 installed. It accepts no target argument, scrubs inherited credentials, denies remote sockets, uses owned disposable clusters, verifies migration hashes, and destroys its cluster. The full sequence uses `node tools/reliability/run-phase2c1-tests.mjs full-sequence`. Never supply Production URLs or copy real credentials.

Raw sample/plan evidence: [benchmark-candidate-common.json](evidence/revalidation/phase2c/benchmark-candidate-common.json); summary: [benchmark-results.json](benchmark-results.json). The immutable Phase 2C baseline is unchanged. Candidate is not approved as a new replacement performance baseline while retirement/compatibility gates remain incomplete.
