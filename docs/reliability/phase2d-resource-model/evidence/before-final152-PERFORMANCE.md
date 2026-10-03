# Local Certification ingress performance

**PROVEN — scoped local measurements completed.** **STRONGLY SUPPORTED — irrelevant terminal ingress history does not produce a tenfold latency increase in this fixture.** Complete-candidate performance and same-method base/candidate regression remain **UNKNOWN**. The successful profile is131–143,145–147; pending release144 is excluded. This is not a final candidate certification or Production baseline.

[Raw measurements/plans](implementation-evidence/ingress-performance.json), [summary/source hashes](implementation-evidence/ingress-performance-summary.json), [run log](implementation-evidence/ingress-performance.log), [retained tail indices](implementation-evidence/ingress-performance-tail-analysis.json).

## Fixture and method

Owned local PostgreSQL17.11; Node26.7.0; `CERTIFICATION_INGRESS_HISTORY_V1`; no concurrent workers. Deterministic history cardinalities, synthetic data and random UUID operation identities. The scale grows **resolved terminal ingress-lease history**, not every score, side-game or multi-year history table:432,864,2160,4320 old terminal entries. Each batch of history is genuinely admitted, committed, then resolved in a separate transaction. Closed prior generations remain stored; current authority uses a new current generation.

There are **6,800 validated measured samples**, plus100 explicitly excluded warmup samples. For each scale, five primary operations have3 batches of100; fingerprint and close/drain have100 samples each. Each measured sample executes one real top-level SQL/RPC statement inside `BEGIN`/`ROLLBACK`. The score writes new canonical state and its terminal receipt/audit before rollback; it is not an idempotent/no-op timing. Admission and execution are measured separately. A persistent local socket/session is used within each100-sample batch; each batch starts a new `psql` process.

All samples validated, source hashes remained unchanged, zero Google jobs were created and the owned cluster was destroyed. A finite5,000ms statement timeout applied throughout. No timeout increase was used.

## Canonical execution including atomic terminal outcome

All times are milliseconds, local `psql` statement elapsed time. These are not full API or durable commit timings.

| History scale | Old terminal leases | Samples | p50 | p95 | Max | Standard deviation |
|---|---:|---:|---:|---:|---:|---:|
| 1× | 432 | 300 | 1.939 | 2.691 | 13.378 | 1.147 |
| 2× | 864 | 300 | 2.002 | 2.733 | 13.911 | 1.149 |
| 5× | 2,160 | 300 | 1.948 | 2.764 | 13.577 | 1.164 |
| 10× | 4,320 | 300 | 2.017 | 2.822 | 14.377 | 1.211 |

The10× median is1.040× the1× median, while stored irrelevant history increases10×. The maximum statement across all operations/scales is14.377ms, below the5,000ms limit. This observed per-statement margin is not a capacity, contention or end-to-end timeout guarantee. p99 is **NOT PROVEN** at300 samples per primary operation/scale and is deliberately absent.

## Other measured operations

| Operation | Samples per scale | p50 at1× /2× /5× /10× |10× p95 |10× max |
|---|---:|---|---:|---:|
| admission | 300 | 0.437 / 0.439 / 0.444 / 0.446 | 1.017 | 7.620 |
| recovery | 300 | 0.137 / 0.138 / 0.139 / 0.139 | 0.369 | 3.975 |
| contextHandshake | 300 | 0.084 / 0.081 / 0.083 / 0.085 | 0.151 | 2.759 |
| currentRead | 300 | 3.201 / 3.304 / 3.218 / 3.252 | 3.686 | 9.811 |
| fingerprint | 100 | 0.074 / 0.072 / 0.076 / 0.078 | 0.115 | 1.983 |
| closeDrain | 100 | 0.260 / 0.266 / 0.267 / 0.269 | 0.345 | 3.367 |

Fingerprint/close operate on the bounded current generation. Their results do not prove that closing a generation containing thousands of unresolved/current operations is equally fast.

## Tail interpretation

**PROVEN observation:** the maximum is the first sample of its newly started session in all68 measured batches. For canonical execution, the three largest observations at every history scale are exactly overall indices1,101,201; all12 execution-batch maxima occur at within-batch index1. No sample was discarded or replaced.

| Scale | First sample for batches1 /2 /3, ms | Overall first-sample indices |
|---|---|---|
| 1× | 13.378 / 13.124 / 13.276 | 1 / 101 / 201 |
| 2× | 12.864 / 13.911 / 13.482 | 1 / 101 / 201 |
| 5× | 13.378 / 13.366 / 13.577 | 1 / 101 / 201 |
| 10× | 13.933 / 14.377 / 13.556 | 1 / 101 / 201 |

**STRONGLY SUPPORTED inference:** the recurring first-call shape is consistent with per-session function/plan initialization. The source establishes a new `psql` session per batch, and warmup runs in a separate session, so it cannot warm those later session-local caches. The precise internal cause was not instrumented. Smaller non-first-sample outliers remain in the raw data. Worker correlation is not measured because workers were deliberately absent. This pattern does not establish Production p99 or rule out scheduling/storage variance.

## Query plans and limits

All16 captured plans (four queries at four scales) use existing exact indexes and return one row: actor/operation lookup, current-generation sequence, singleton resource and current pointer. No new index was added. Plans and buffers are preserved in the raw artifact.

Only the top-level measured statement count is known: one per sample. Internal query count, separately instrumented lock-hold duration, complete transaction/commit latency, HTTP/Auth time, hosted latency, worker contention and publication/FinalRecap percentile timings were **not measured**. No publication/recap p95 is claimed.

Earlier Phase2/2C score medians are not a directly comparable control: this fixture measures the newer durable-ingress execution path with separate admission and terminal history. It demonstrates bounded behavior within this local profile, not absence of every candidate-versus-base regression. Full score/side-game/multi-year history and Production capacity retain their separate proof requirements.

## Preserved benchmark counterevidence

The first attempt failed semantic validation because the benchmark expected `data.tournament.id`; the established canonical leaderboard DTO returns `tournament_id`. The test was corrected to assert that exact identifier and numeric tournament year. Runtime SQL/admission/authority were unchanged. The safe diagnostic emitted only operation/key names and bounded code/state/boolean fields, no payload values.

Two diagnostic starts failed before SQL because the clean process environment omitted a locale; PostgreSQL reported `postmaster became multithreaded during startup` and requested a valid `LC_ALL`. Process-only `LC_ALL=C LANG=C` corrected the harness environment. No host locale, IPC, sysctl, permission or unrelated process was changed. Every failed/completed owned fixture was cleaned up. [Counterevidence](implementation-evidence/ingress-performance-counterevidence.json).
