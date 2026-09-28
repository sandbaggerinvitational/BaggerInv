# Phase 2 evidence index

Base `184b5c65a8e63784e1af8d38121fa2e16a015628`; final candidate migration SHA256 `cd9f6a784741d9e41c7f2e267bf4135549aeeb61333a22e4a31d9a174a3651a8`. The execution HEAD in historical run artifacts is the exact Phase 1 base plus the captured candidate hash; it is not presented as an already committed release. The [machine ledger](evidence-ledger.json) hashes source and receipts; the [source commit receipt](SOURCE-RECEIPT.md) binds them to the later implementation commit.

| Claim | Proof / artifact | Limitation |
|---|---|---|
| Before fixture is reproducible | [Smoke](evidence/baseline-smoke.json), [catalog](evidence/before-catalog.json) | Local synthetic fixture; admission stubs |
| Core correctness, idempotency, atomicity, races | [Canonical proof](evidence/score-proof-after.json) | No HTTP/physical proof; restart test uses fsync off |
| Derived isolation/backlog/order/ACL | [Derived proof](evidence/derived-proof-after.json) | Explicit drain, not an autonomous scheduler |
| Migration/security/known worker defects | [Migration proof](evidence/migration-safety.json) | Future 42883 reproduction is not capability PASS; 40P01 is contained, not eliminated |
| Eligible branches/actual financial engine parity | [Eligible-history proof](evidence/eligible-history-candidate.json) | Synthetic provisional results; not the entire Official financial lifecycle |
| History-scale timing | [Benchmark index](benchmark-results.json) | Rolled-back RPC timing; no Production SLO proof |
| Rehearsal index | [Experiment](evidence/fence-history-experiment.json), [final regression](evidence/fence-history-final.json) | Synthetic restored records, not provider restore proof |
| Full round | Canonical artifact P2-GOLF-432 | 432 holes/24 finalizations; separate from side-game orchestration |
| Broad tests | [Comparison](evidence/application-comparison.json) | 26 baseline failures remain; the freeze diagnostic's first-offender change is explained |
| Telemetry/security/diagnostics | [Foundation unit](evidence/foundation-unit.json), [foundation SQL](evidence/foundation-sql.json) | SQL foundation tests install the baseline; candidate tests are separate |
| Build | [Build evidence](evidence/foundation-build.json) | Compilation, not deployment |
| Gate | [Performance gate](performance-gate.json) | Proposed artifact gate; approved is false |

No source-only finding substitutes for runtime proof. PROVEN applies to exact deterministic SQL/source/test observations. STRONGLY SUPPORTED applies to generalizing the common-path mechanism. Annual runtime, hosted behavior, capacity, and physical proof remain UNKNOWN/NOT PROVEN. Raw performance arrays, compact nested plans, test details, and failure graphs remain checked in. Temporary human-readable logs have hashes and locations; substantive claims do not rely solely on those temporary paths.

Earlier candidate-v1 measurements are preserved under [evidence/candidate-v1](evidence/candidate-v1/README.md) with their original migration hash. They are **superseded**, not final candidate proof. Initial fixture/restart-harness failures remain explicitly named in the evidence; later corrected test results do not erase them.
