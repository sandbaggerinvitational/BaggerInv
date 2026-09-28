# Deterministic isolated benchmark fixture

Fixture version: `bagger-r139-synthetic-history-v1`  
Seed: `2026-never-again-139`  
SQL baseline: Release 139 commit `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`, repository Production migrations through `202609270120_bounded_late_r3_result_compatibility_v1.sql`, plus the recorded Calcutta and Net Skins incremental SQL corrections.

This is a **Production-shaped synthetic fixture**, not a restored Production database. It contains synthetic players, identities, golf and financial facts. No participant credentials or Production rows are imported. Resource/project identifiers used as literal SQL admission inputs are non-secret contract constants; they are never connection targets.

The fixture's deployment SHA of repeated `7` characters and activation revision 139 are synthetic admission bindings. They are not the historical hosted Release 139 / Activation 238 identity. The `release` and `sha` metadata name the SQL source baseline; they do not claim that the synthetic database is a hosted deployment.

## Safety and reproduction

Install the lockfile dependencies with `npm ci`. Provide PostgreSQL 17 binaries locally. The helper discovers Homebrew PostgreSQL 17 or `pg_config`; alternatively set `BAGGER_RELIABILITY_PG_BIN` to an absolute directory containing PostgreSQL 17 executables. Swift/macOS simulator prerequisites belong to the separate native fixture, not the database benchmark.

Run from the repository root:

```sh
npm run benchmark:reliability
npm run benchmark:reliability:telemetry
node tools/reliability/capture-query-plans.mjs
node tools/reliability/benchmark-sidegame-processors.mjs --samples 30
```

Run these **sequentially**, without unrelated test/build load on the host. The scripts initialize a new cluster in a generated private temporary directory with a private Unix socket, TCP listening disabled, explicit local database names and a private in-process ownership marker. They do not accept a database URL, hostname, project selection or Production override. The main CLI rejects unknown connection options before initialization. SQL helpers reject caller-forged cluster objects. Inherited database target variables are removed; explicit socket arguments bind each call. No credential lookup occurs.

Cleanup closes only the owned cluster and removes its generated directory. Existing local or provider databases are not cleanup targets. If the process is forcibly killed, identify its exact generated directory and owning process before any manual cleanup; never perform blanket PostgreSQL cleanup. On macOS local IPC may require sandbox approval. There is no undocumented manual database surgery or live access requirement.

The fixture uses explicit local admission substitutes for hosted deployment/provider attestation. These are fail-closed local scope assertions, not installed application changes. The synthetic fixture loader temporarily disables local triggers while materializing test state; every measured operation runs with triggers restored. Domain function bodies, canonical calculation, SQL claim/complete logic, ordinary dependency guards and actual RPC calls remain the repository implementations. This harness does not certify hosted attestation or RLS by proxy.

## Volume model and assumptions

The retained incident-derived cardinality profile is a reproducible workload hypothesis. In particular, 745 Calcutta jobs and 407 results came from retained isolated incident evidence, not a new census of Production. The fixture intentionally exercises that historical accumulation. Exact current Production volume is **UNKNOWN** and was not queried.

| Family | 1x current-tournament profile | Scaling |
|---|---:|---|
| Active tournament players / rounds / matches | 24 / 3 / 24 | Fixed current authority |
| Match participants / match holes | 72 / 432 | Fixed current authority |
| Current-tournament score rows | 380 | Fixed incomplete tournament state |
| Score mutation receipts / revision history | 327 / 327 | 1x, 2x, 5x, 10x |
| Outbox / setup receipts / setup audit | 285 / 48 / 48 | 1x, 2x, 5x, 10x |
| Release rebindings | 137 | 1x, 2x, 5x, 10x |
| Calcutta configs / auctions / publications | 2 / 37 / 41 | 1x, 2x, 5x, 10x |
| Calcutta jobs / results | 745 / 407 | 1x, 2x, 5x, 10x |
| Net Skins configs / jobs / results | 3 / 569 / 2 | 1x, 2x, 5x, 10x |
| Odds configs / jobs / publications | 2 / 10 / 7 | 1x, 2x, 5x, 10x |
| Additional synthetic archived years | 1 / 2 / 5 / 10 | Each adds 24 players, 3 rounds, 24 matches, 72 participants and 432 scores |

The archived-year series is an explicit sensitivity assumption, not a claim that Production contains only one historical year. It increases unrelated seasons as well as operational history. IDs, generated gross values and source fingerprints are deterministic. Volatile created/updated/effective timestamps are excluded from the semantic determinism digest and are not presented as byte-identical evidence. Two independently seeded local databases must match stable IDs, current inputs, lifecycle state and cardinalities.

The archived golf rows are volume fixtures, not a certified historical champion/result reconstruction. The synthetic Calcutta pot is $24,000 from 24 $1,000 purchases, intentionally distinct from the historical $18,500 auction; nothing in this fixture changes or claims to reproduce those real financial facts.

## Lifecycle variants

A valid score-write fixture is not automatically a valid pre-Open or Prepare fixture. Operations use explicit variants:

- Current scoring history: actual canonical Singles score mutation and current reads.
- Open: canonical unstarted prepared R3 contexts with scores/access cleared only in the disposable fixture setup, outside timing.
- Resume: actual Lock establishes the context/permission authority required by actual Resume.
- Finalize: a complete local canonical scorecard and the required live/permission state.
- Prepare: a separate pre-side-game database state, so the ordinary dependency guard remains effective and is never bypassed to obtain a timing.
- Side-game processors: explicit synthetic point/payout rules and persisted opt-in entries; actual queue, claim, unchanged JavaScript calculator, completion and job readback.

The machine result identifies each operation's actual coverage and variant. A semantic rejection has zero successful samples and null percentiles. Input assembly is labeled as input assembly; it is not an end-to-end calculation result.

## Measurement method

Main SQL samples time the actual statement through one local `psql` session and roll the transaction back after each sample. Fixture setup, reset and rollback are outside the timed statement. This includes local socket/result transfer and PostgreSQL work, but excludes durable commit latency, the deployed API, authentication provider and client rendering. The local cluster has `fsync=off` for disposable testing; it cannot establish durable-write latency or infrastructure capacity.

Thirty successful samples provide a coarse local median and p95. Each original statement's returned payload is captured privately and semantically validated after timing; malformed responses, `ok:false`, partial failures, or score replay/no-op cannot be counted as successful writes. SQL helper outputs have explicit structural/scalar contracts. p99 is `null / INSUFFICIENT_SAMPLE` below 100 samples. This convention does not make 100 observations a sufficient tournament-tail or multi-hour capacity test. Failures, exact sample counts, versions, compute and unmeasured metrics remain explicit.

Nested plans are captured separately using `auto_explain`. Their logging overhead is not mixed into baseline timings. Row counts describe plan-node work, not a deduplicated count of unique records examined. Bounded before/after resource snapshots record host load/free memory and local database size, backend count, buffer/temporary/transaction counters. They are not database CPU utilization, physical IOPS, peak memory or connection headroom; those and provider resource utilization remain unavailable. Zero block I/O timing with `track_io_timing=off` means unavailable, not zero I/O.

## What this fixture cannot prove

It does not prove Production capacity, exact historical payload sizes, hosted release binding, native physical reliability, complete 54-hole chronology, spectator contention, provider restart recovery or tested backups. Enlarge or refine it from safe retained/sanitized evidence; do not query live Production merely to make its name more convincing.
