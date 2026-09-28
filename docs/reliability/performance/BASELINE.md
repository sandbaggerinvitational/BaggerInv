# Phase 1 local performance baseline

## Result and interpretation

The corrected Release 139 score RPC stayed approximately bounded across this synthetic history series: median **23.026 / 24.057 / 26.190 / 23.071 ms** at 1x / 2x / 5x / 10x. Restoring the historical compatibility function made the same score grow from **74.087 to 294.089 ms**. This is direct local evidence for the existing repair, not a Production measurement or proof of sufficient capacity.

Run started `2026-09-28T06:06:42.648Z`. All **2,040 main samples** (17 paths × four scales × 30) and **480 old/corrected comparison samples** passed semantic validation **for every timed result**, after timing. A fast rejection, null body, score replay or no-op cannot qualify as a successful score mutation. These are rolled-back SQL invocations, not committed golf scores or end-to-end API requests.

## Environment and method

- [Machine results](BENCHMARK-RESULTS.json); [fixture contract](BENCHMARK-FIXTURE.md).
- PostgreSQL 17.11 (Homebrew), local socket; Apple M5, 10 logical cores, 16 GiB RAM; macOS kernel 25.5.0; Node 26.7.0.
- shared_buffers 32 MB; work_mem 4 MB; max_connections 20; fsync OFF; synchronous_commit ON; JIT ON.
- Task benchmarks/builds/simulator work were serialized. Unrelated host activity was not controlled; local load/free-memory snapshots are retained.
- Each timing covers one statement through psql including socket/result transfer. Setup, reset, rollback, durable commit, API/auth network, client rendering and provider resources are excluded.
- p50 and coarse p95 use 30 samples; **p99: INSUFFICIENT SAMPLE** in every row.
- Before/after snapshots record DB size, connections and cumulative buffer/temp/transaction counters. They do not measure DB CPU, physical IOPS, peak memory or connection headroom. track_io_timing was off.
- Internal query count and unique rows examined are unavailable in timing runs. Separate nested plans record observed statements and node work; these are not network query count.

## Main operation timings

Each cell is p50 / p95 / max in milliseconds; each cell represents 30 semantically successful samples and zero failures.

| Operation / actual coverage | 1x | 2x | 5x | 10x |
|---|---:|---:|---:|---:|
| canonical score write — ACTUAL_RPC_ROLLBACK | 23.026 / 27.540 / 37.602 | 24.057 / 26.131 / 36.591 | 26.190 / 34.275 / 35.366 | 23.071 / 27.840 / 38.898 |
| score canonical readback — ACTUAL_RPC | 0.049 / 0.136 / 1.829 | 0.052 / 0.122 / 1.668 | 0.072 / 0.163 / 2.255 | 0.053 / 0.142 / 1.737 |
| participant Today — ACTUAL_RPC | 0.071 / 0.352 / 2.941 | 0.223 / 3.811 / 11.511 | 0.090 / 0.482 / 3.262 | 0.083 / 0.399 / 3.020 |
| Matches — ACTUAL_RPC | 4.356 / 4.733 / 7.608 | 5.060 / 7.355 / 10.739 | 4.674 / 5.336 / 8.498 | 4.590 / 4.868 / 7.608 |
| Leaders — ACTUAL_SQL_FUNCTION | 6.725 / 9.451 / 10.059 | 6.823 / 11.534 / 11.678 | 6.973 / 7.350 / 10.284 | 7.081 / 8.239 / 10.099 |
| Prepare match — ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED | 31.856 / 39.629 / 45.659 | 32.628 / 43.705 / 58.744 | 30.124 / 35.399 / 44.240 | 33.927 / 38.237 / 49.032 |
| Open Round — ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED | 271.500 / 299.191 / 307.360 | 284.931 / 323.673 / 416.090 | 293.125 / 330.977 / 379.894 | 300.801 / 330.517 / 331.370 |
| Lock Round — ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED | 64.727 / 79.051 / 83.554 | 73.189 / 92.552 / 93.621 | 90.413 / 104.171 / 127.870 | 131.117 / 148.158 / 150.420 |
| Resume Round — ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED | 187.581 / 215.685 / 248.242 | 183.541 / 218.025 / 228.350 | 198.302 / 230.265 / 237.589 | 210.578 / 260.784 / 328.829 |
| Finalize — ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED | 14.838 / 17.814 / 26.179 | 15.992 / 29.383 / 32.736 | 14.323 / 16.800 / 27.367 | 14.555 / 17.847 / 23.681 |
| Net Skins participant read — ACTUAL_RPC | 16.191 / 21.010 / 22.664 | 16.930 / 19.378 / 24.649 | 15.410 / 16.517 / 23.656 | 19.936 / 27.559 / 27.823 |
| Net Skins calculation path — ACTUAL_SQL_INPUT_ASSEMBLY_ONLY | 10.087 / 10.916 / 15.188 | 10.149 / 10.766 / 15.338 | 9.553 / 12.964 / 13.821 | 10.194 / 11.087 / 15.945 |
| Calcutta participant read — ACTUAL_RPC | 10.042 / 13.143 / 18.358 | 10.888 / 13.923 / 20.063 | 11.251 / 12.505 / 22.206 | 11.273 / 12.035 / 20.876 |
| Calcutta calculation path — ACTUAL_SQL_INPUT_ASSEMBLY_ONLY | 10.008 / 10.777 / 16.596 | 9.592 / 10.261 / 15.684 | 10.285 / 11.987 / 15.751 | 10.129 / 11.205 / 15.202 |
| Odds participant read — ACTUAL_RPC | 0.250 / 0.401 / 3.925 | 0.215 / 0.327 / 3.021 | 0.256 / 0.444 / 4.007 | 0.238 / 0.416 / 3.584 |
| Odds calculation path — ACTUAL_RPC_INPUT_READ_ONLY | 7.539 / 8.787 / 12.204 | 7.440 / 8.457 / 10.734 | 7.707 / 9.039 / 13.437 | 7.969 / 8.620 / 12.003 |
| Director readiness/current-state read — ACTUAL_RPC | 13.393 / 14.653 / 25.545 | 11.867 / 12.676 / 23.556 | 14.651 / 17.419 / 28.495 | 16.135 / 19.417 / 28.452 |

Today is the actual participant-context RPC, not the full mobile endpoint. Matches and Leaders cover their SQL paths, not the full auth/projection/client chain. The three calculation rows above measure input assembly only; they must not be relabeled full processors.

## Actual side-game processors

[SIDEGAME-PROCESSORS.md](SIDEGAME-PROCESSORS.md) and [its machine result](SIDEGAME-PROCESSORS.json) separately record **360/360 successful samples**, with actual queue, nonempty claim, unchanged calculator/checkpoint processing, completion and canonical job status. Calcutta total p95 is 77.437–89.199 ms; Net Skins 60.734–67.822 ms; Odds 6,586.208–6,967.530 ms across the four scales. Odds is a 10,000-iteration checkpointed rehearsal-only path with four checkpoints, not a public publication. Different timing envelopes must remain separate.

## Old / corrected compatibility comparison

Only the compatibility function is replaced in the disposable database for this comparison. Values are local medians in milliseconds.

| Path | 1x | 2x | 5x | 10x |
|---|---:|---:|---:|---:|
| oldCompatibility | 33.617 | 47.641 | 86.547 | 142.576 |
| fixedCompatibility | 10.553 | 9.018 | 9.995 | 10.322 |
| oldScore | 74.087 | 96.206 | 155.672 | 294.089 |
| fixedScore | 21.705 | 22.935 | 22.502 | 24.225 |

The repaired fixture exercises zero eligible recovery receipts. NA-2026-019 makes any irrelevant consumed-history evaluation raise a deterministic sentinel; old/fixed score behavior is compared independently of timing. Eligible-receipt branches remain further required proof.

## History-growth findings

| Operation | 1x → 10x median (ms) | Ratio | Interpretation / next evidence |
|---|---:|---:|---|
| score-write | 23.026 → 23.071 | 1.00x | Approximately bounded sampled branch; extend eligible receipts, actual API/auth, durable commit and concurrency. |
| score-readback | 0.049 → 0.053 | 1.08x | Sub-millisecond SQL; no whole-client claim. |
| participant-today | 0.071 → 0.083 | 1.17x | Participant-context RPC only; full Today endpoint still unmeasured. |
| matches | 4.356 → 4.590 | 1.05x | Fixed current dataset; no proportional unrelated-year growth. |
| leaders | 6.725 → 7.081 | 1.05x | Fixed current dataset; no proportional unrelated-year growth. |
| prepare-match | 31.856 → 33.927 | 1.07x | Separate valid pre-side-game lifecycle fixture; guards unchanged. |
| round-open | 271.500 → 300.801 | 1.11x | Actual atomic SQL operation; status resolution and hosted behavior remain separate. |
| round-lock | 64.727 → 131.117 | 2.03x | Material growth warrants current-state/job lookup plan investigation; no index fix inferred from timing alone. |
| round-resume | 187.581 → 210.578 | 1.12x | Actual Open→Lock setup; investigate relevant source/pointer work. |
| finalize | 14.838 → 14.555 | 0.98x | Complete local scorecard; no durable archive worker proof. |
| net-skins-read | 16.191 → 19.936 | 1.23x | History-sensitive read candidate; inspect filtering/current pointer plans. |
| calcutta-read | 10.042 → 11.273 | 1.12x | No 10x-proportional growth here; eligible compatibility remains separate. |
| odds-read | 0.250 → 0.238 | 0.95x | Low absolute SQL time; processor runtime measured separately. |
| director-current | 13.393 → 16.135 | 1.20x | Moderate current-state growth; nested plan review required before redesign. |

No local result warrants an AWS migration decision. Supabase I/O budget, sustained capacity, connection headroom and restart causation remain UNKNOWN.

## Determinism

Two independently seeded databases matched semantic digest `da0ccb945c8e92af2058c5613bf0dc15a17b94c4b179f0043cee25464d4fd177`. Stable IDs, current inputs, lifecycle and counts are included; volatile timestamps are excluded. This is semantic fixture determinism, not byte-for-byte database equivalence.

## Proposed budgets — not approved or enforced

For every operation row, the matched-environment proposed target is recorded p95; warning is repeatable p95 above 1.25× baseline; failure for review is above 1.50× or any semantic/SQL failure. Require at least 1 ms absolute regression before interpreting ratios for sub-millisecond reads. These 25%/50% bands are provisional noise/review bands, not tournament SLOs. Calibrate against at least three separate quiet runs before CI enforcement; do not increase budgets to excuse regressions.

History sensitivity additionally requires the deterministic no-history spy and an approved same-host latency band across 1x–10x. Hosted total score, endpoint, worker-lag, pool-wait and durable-commit budgets remain **BASELINE REQUIRED**: actual APIs, matched non-Production compute, concurrent golfers/spectators, resource telemetry and a multi-hour soak.

## Remaining proof

[Query plans](QUERY-PLANS.md), [instrumentation overhead](TELEMETRY-OVERHEAD.json) and processor measurements have separate methods. No Production, full chronological tournament, physical scoring, provider capacity, restore or restart proof is implied.
