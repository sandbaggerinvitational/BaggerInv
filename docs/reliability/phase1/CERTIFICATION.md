# Phase 1 certification

**PHASE 1: PARTIAL.** The approved local foundation is implemented, measured and usable. This is not a deployment or tournament-readiness certificate. Missing proof and existing failing gates remain explicit.

| Component | Result | Exact scope |
|---|---|---|
| Postmortem preserved | PASS | 119 substantive MD/JSON files byte-exact; all 107 requested files present; four preservation metadata files; external raw logs not all archived |
| Observability foundation | PASS - LOCAL | Allowlisted typed events; 34 route families and shared RPC adapters; optional sink failures contained |
| Correlation | PASS - LOCAL | UUID attempt identity; operation/mutation/job IDs preserved; actual local SQL receipt and same-mutation replay association |
| Score/round/side-game measurements | PARTIAL | Application/RPC spans; no internal PostgreSQL idempotency/stroke/net/audit phase durations or hosted provider metrics |
| Benchmark harness | PASS - LOCAL | Owned socket-only PostgreSQL17, deterministic synthetic accumulated history, no external target option |
| Benchmark determinism | PASS | Two independent seed instances match semantic digest; volatile timestamps excluded |
| Initial Never Again | PASS - SIX FIXTURES; TWO REMEDIATIONS RED | Four protection families pass; native defect reproductions pass while corrected native behavior remains EXPECTED RED |
| Diagnostic safety | PARTIAL | Named plans and single-flight bounded read-only adapter enforced/tested; no restricted Production role/gateway installed |
| Performance baseline | PARTIAL | 17 SQL paths, three actual processor paths, four scales; full APIs, durable commit, concurrency and capacity absent |
| Application regression | PARTIAL | 26 failures on both exact baseline and compared candidate; six differing obsolete byte-freeze diagnostics reviewed, not converted to PASS |
| Production deployment | NO | No release, provider or deployment action |
| Build 11 implemented | NO | Native product source/behavior unchanged; pinned historical test fixtures only |
| 2027 Tournament Ready | NO | Required physical, lifecycle, capacity, recovery and remediation gates remain |

## Preflight and preservation

Original workspace: `/Users/claybeltran/Developer/BaggerInv`, branch `codex/prelaunch-presentation-corrections`, HEAD `65b9767c9abe75fbf192d6fb82a301231bc95dda`, with pre-existing unrelated changes retained. Work was isolated in the managed `reliability-phase1` checkout on `codex/reliability-phase1` from approved Release139 source `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`. See [preflight](PREFLIGHT.md).

Historical Production identity from retained evidence is Release139 / Activation238. Current activity and health are **UNKNOWN**; no live query refreshed those facts. Production scores, results, handicaps, pairings, Net Skins, Calcutta and Odds were not changed. All database writes in this task were synthetic disposable test data.

Source `/private/tmp/bagger-2026-postmortem/` was preserved under `docs/reliability/2026-tournament-postmortem/`. Hashes, exclusions and link inventory are in the [preservation receipt](../2026-tournament-postmortem/PRESERVATION-RECEIPT.md). The original 119 substantive files were not rewritten. The [secret scan](SECRET-SCAN.json) and [privacy review](PRIVACY-REVIEW.md) found explicit test sentinels only, no real credential.

## Exact final local test collection

**75 tests: 73 pass, 0 fail, 2 explicit skips.** The collector result is PARTIAL because it does not automatically execute the two pinned-checkout simulator paths. Separate actual simulator receipts below are retained; the skips remain skips.

| Suite | Layer | Pass | Fail | Skip |
|---|---|---:|---:|---:|
| Preservation | INTEGRATION | 2 | 0 | 0 |
| Telemetry | UNIT | 16 | 0 | 0 |
| Telemetry independent review | UNIT | 6 | 0 | 0 |
| Actual route/adapter wrapper | API | 1 | 0 | 0 |
| Protected-path equivalence | INTEGRATION | 5 | 0 | 0 |
| Diagnostic policy | UNIT | 10 | 0 | 0 |
| Diagnostic CLI | INTEGRATION | 2 | 0 | 0 |
| Diagnostic adapter | INTEGRATION | 6 | 0 | 0 |
| Native fixture registration | PERSISTENCE / SIMULATOR | 1 | 0 | 2 |
| Preparation readback | INTEGRATION | 7 | 0 | 0 |
| Benchmark harness | UNIT | 4 | 0 | 0 |
| Remote benchmark rejection | INTEGRATION | 2 | 0 | 0 |
| Timed-result validation | UNIT | 7 | 0 | 0 |
| Plan evidence compaction | UNIT | 1 | 0 | 0 |
| Calcutta / Net Skins SQL | SQL | 1 | 0 | 0 |
| Score/history SQL | SQL / FAILURE_INJECTION | 1 | 0 | 0 |
| Request-to-SQL receipt | INTEGRATION / SQL | 1 | 0 | 0 |

The API wrapper executes two route/adapter child tests through simulated transports. Calcutta/Net Skins share one SQL test containing both historical/fixed function executions. Score/history executes a real canonical score at 10x history. Receipt correlation executes a real score and exact replay in one transaction. None is physical or hosted authentication proof.

Separate pinned Build10 evidence:

- Real standalone SQLite round-trip: timestamp/CAS failure reproduced; corrected gate EXPECTED RED.
- Actual coordinator acknowledgement persistence/reopen: **2/2 simulator tests PASS**, separate processes, matching Official evidence, accepted same-mutation receipt, zero extra score POSTs and zero unresolved rows. This bounded relaunch case does not fix the live-session defect.
- Actual native shell reproduction: **1/1 simulator test PASS** across four destinations; future shell-preservation gate fails with eight expected assertions.
- Physical iPhone: **NOT TESTED** in this phase.

Broad paired application evidence: **4,127 pass / 26 fail / 4,153** in both baseline and compared candidate; **30/30 SSR** and **17/17 local browser** in each. No additional failing test name; 20 normalized diagnostics match. Six obsolete source-freeze diagnostics differ and received explicit source/behavior review. Subsequent bounded job-ID telemetry/fixture changes have final focused evidence; the broad run is not silently re-dated. See [regression notes](REGRESSION-NOTES.md) and [instrumentation review](INSTRUMENTATION-REVIEW.md). Forty-five legacy PostgreSQL files were outside that broad selection; no claim is made that all ran.

Final local application build: **PASS**, with provider credential variables omitted and Next telemetry disabled. [Build receipt](BUILD-EVIDENCE.json) records timestamps, exit and log digest. Compilation is a distinct proof layer.

## Performance and plans

- **2,040/2,040** semantically validated main SQL samples; **480/480** old/corrected comparison samples. Every timed output was validated after timing.
- **360/360** actual processor samples: Calcutta, Net Skins and checkpointed Odds. No publication, mirror or hosted-worker claim.
- **34/34** successful nested-plan invocations at 1x/10x; every distinct query/shape and invocation count retained in compact evidence.
- Score medians **23.026 / 24.057 / 26.190 / 23.071 ms** at 1x/2x/5x/10x. Old-function comparison **74.087 to 294.089 ms**. The sampled repaired branch is approximately bounded.
- Lock median **64.727 to 131.117 ms**. Job-history scans remain in side-game/Director reads. These are investigation findings, not unapproved repairs.
- p99: **INSUFFICIENT SAMPLE**. Main samples roll back; fsync is off. No durable commit, hosted API, concurrency, soak or Supabase-capacity conclusion.

Instrumentation comparison, 30 rotating samples per mode: uninstrumented median **40.849 ms**, disabled **40.760 ms**, enabled **40.847 ms**. Enabled-minus-uninstrumented median **-0.002 ms**, p95 **+0.962 ms**. The negative median is noise, not a speedup. This local SQL plus synthetic-fetch test serializes/discards events; it does not measure hosted console/export delivery. No approved overhead budget or statistical no-regression guarantee is claimed.

See [baseline](../performance/BASELINE.md), [plans](../performance/QUERY-PLANS.md), [processors](../performance/SIDEGAME-PROCESSORS.md) and [fixture](../performance/BENCHMARK-FIXTURE.md). Local counters are not physical IOPS/headroom; zero I/O timing with tracking off is unavailable.

## Evidence identity

Tested source digest: `128dbe03730f6cbc2a9c65ccab1a4b8eca4300a93f432f341a813c9b5bc4dc82`. [LOCAL-EVIDENCE.json](LOCAL-EVIDENCE.json) contains exact source hashes, fixture/schema inputs, suite timestamps and artifact hashes. It records pre-commit HEAD/dirty state honestly; subsequent commits preserve those tested source bytes. Documentation-only certification updates do not manufacture runtime proof.

The [evidence index](EVIDENCE.md), [traceability](TRACEABILITY.md), [final quality review](FINAL-QUALITY-REVIEW.md) and [Never Again catalog](../testing/NEVER-AGAIN-CATALOG.json) form the proof chain. No incident is resolved merely because a reproduction or telemetry field exists.

## Unresolved P0 and admission gaps

1. Remaining synchronous Calcutta work and eligible compatibility branches; actual API, durable-commit and concurrency proof.
2. Native timestamp/navigation defects and physical, long-lived, lost-acknowledgement and multi-device scoring acceptance.
3. Atomic round-control and unknown-outcome recovery through actual Director and complete R3 chronology.
4. Supabase I/O/connection headroom, provider restart causation, sustained capacity and alert delivery.
5. Verified backup source and exercised isolated restore.
6. Before live diagnostic access: server-enforced least-privilege/query admission; raw credentials bypass repository policy.

The [remaining-proof register](REMAINING-PROOF.md) distinguishes future tournament gates from an active Production incident. Supabase remains HARDEN/MEASURE FIRST; this evidence does not justify AWS migration.

## Next single phase

[Score critical-path hardening](NEXT-PHASE.md), beginning with remaining trigger/eligible-branch/API/concurrency proof and exact transaction/financial-freshness boundaries. GPT-6 Astra, highest available reasoning, Standard speed. This is a recommendation, not execution of the next phase.

## What Phase 1 does not prove

It does not prove Build11 reliability, repaired native navigation or queue, redesigned side-game lifecycle, 2027 Tournament Ready, sufficient database capacity, tested restoration, or that AWS can never become justified. It establishes measurement and evidence for those decisions. Production deployment requires a separate reviewed task.
