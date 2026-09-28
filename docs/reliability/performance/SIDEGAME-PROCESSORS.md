# Side-game processor benchmark

## Result

The local Release 139 processor matrix completed **360 of 360 samples** with no failure: 30 samples for Calcutta, Net Skins, and Odds at retained-history factors 1×, 2×, 5×, and 10×. This certifies the synthetic local queue/request → claim → unchanged JavaScript engine → completion → canonical readback paths exercised by the benchmark. It is not Production performance or capacity evidence.

The machine-readable evidence is [`SIDEGAME-PROCESSORS.json`](./SIDEGAME-PROCESSORS.json). Its run timestamp is `2026-09-28T05:49:13.646Z`, fixture version is `bagger-r139-synthetic-history-v1`, and deterministic seed is `2026-never-again-139`.

| History | Processor | Success | Total p50 (ms) | Total p95 (ms) | Total max (ms) | Engine/non-SQL p95 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1× | Calcutta | 30/30 | 64.397 | 78.769 | 111.897 | 14.758 |
| 1× | Net Skins | 30/30 | 49.331 | 67.822 | 71.749 | 0.934 |
| 1× | Odds | 30/30 | 6,270.355 | 6,586.208 | 6,692.475 | 6,574.785 |
| 2× | Calcutta | 30/30 | 71.725 | 89.199 | 191.068 | 12.991 |
| 2× | Net Skins | 30/30 | 53.574 | 60.734 | 71.829 | 0.873 |
| 2× | Odds | 30/30 | 6,380.109 | 6,680.235 | 6,742.560 | 6,670.350 |
| 5× | Calcutta | 30/30 | 70.517 | 77.437 | 106.883 | 15.038 |
| 5× | Net Skins | 30/30 | 56.860 | 66.865 | 76.563 | 0.746 |
| 5× | Odds | 30/30 | 6,376.656 | 6,967.530 | 6,980.445 | 6,955.515 |
| 10× | Calcutta | 30/30 | 71.359 | 88.919 | 111.681 | 14.333 |
| 10× | Net Skins | 30/30 | 57.446 | 65.778 | 81.995 | 0.828 |
| 10× | Odds | 30/30 | 6,452.109 | 6,855.757 | 6,922.766 | 6,842.174 |

Every p95 above is measured from 30 samples. Every p99 is `null` with status `INSUFFICIENT_SAMPLE`; this run does not relabel a maximum as p99.

## Paths exercised

Calcutta and Net Skins each use four explicit timed SQL protocol calls per sample: enqueue, claim, complete, and canonical job readback. Every call must return `ok: true`; claim must return a real job; the unchanged full-net engine must produce the claimed payload; completion must succeed; and readback must report `SUCCEEDED`. Calcutta produced `PROVISIONAL` results in this synthetic state. Net Skins produced `OFFICIAL` results.

Odds uses the unchanged shared `processOddsCalculationJob` worker with the smallest supported 10,000-iteration run. Each sample performs one SQL request, one claim, four durable checkpoint calls, one completion, and one canonical readback, for eight explicit timed SQL calls. All 30 samples in every scale reported four checkpoints. Readback must report `SUCCEEDED` and `REHEARSAL_ONLY`. The benchmark never enables Odds publication or a Google mirror; `publicationCreated` and `mirrorCreated` are false in every result row.

The Odds `worker_non_sql` phase is derived by subtracting measured claim, checkpoint, completion, and failure-call duration from the whole worker duration. It includes the unchanged engine plus JavaScript serialization, hashing, metrics collection, and adapter overhead; it is not a pure CPU timer. Odds request preparation is timed separately and excluded from `total`.

## Environment and interpretation

The run used local PostgreSQL 17.11 over a private Unix socket on an Apple M5 host with 10 logical CPUs and 16 GiB memory. The disposable cluster used 32 MiB `shared_buffers`, 4 MiB `work_mem`, `max_connections=20`, JIT on, and `fsync=off`. Each sample ran in one private session and rolled back, so durable commit/fsync, network transport, hosted admission, connection-pool contention, and provider I/O are outside this evidence.

The structured evidence records the initial resource snapshot. Its host load and memory included unrelated processes, PostgreSQL counters were cumulative, and `track_io_timing` was off. Consequently, zero recorded block time is unavailable timing rather than proof of zero physical I/O. No database CPU, peak memory, physical IOPS, headroom, nested statement count, rows examined, or server-only duration is claimed.

Within this local run, Calcutta and Net Skins did not show a monotonic total-duration increase from 1× to 10× retained history. That observation does not establish a capacity ceiling or Production percentile. Odds remained dominated by its 10,000-iteration worker computation. The run supplies implementation and regression evidence; alert thresholds and capacity decisions still require controlled hosted measurements and live observability.

## Fixture boundary

The processor fixture contains synthetic financial rules, explicit Net Skins entry consent/provenance, and a calculation-only Odds rehearsal configuration. It does not contain real ownership, purchase, entry, identity, or scoring records. The Release 139 schema and certified SQL repairs are installed in disposable databases. Provider admission checks that cannot be reproduced locally remain narrow documented substitutions in the shared reliability fixture.

No query plans were captured in this processor window. Query plans, instrumentation overhead, NA-2026-019 correlation work, and the strict main benchmark sweep are separate evidence owned by the remaining Phase 1 measurement sequence.
