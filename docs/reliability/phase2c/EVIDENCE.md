# Evidence index

Overall PARTIAL; P0-B remains open for admitted Google reporting and related scorecard archive lifecycle. Passing automatic-delivery entries cover Calcutta/Competition/Intelligence only. Owner acceptance was not performed and the candidate is not ready for staging.

All new executed evidence is local, non-Production. Source hashes, fixture/environment details, raw TAP hashes and limitations live in the linked records. The execution HEAD is the base plus the exact recorded uncommitted source manifest; the final candidate commit is separately recorded in CANDIDATE-MANIFEST. Do not attribute an uncommitted execution to a nonexistent future SHA.

|Evidence|Requirement|Proof layer|Result|Artifact|
|---|---|---|---|---|
|E-P2C-B-EXPIRY-FAILURE-LOCK|P2C-B-EXPIRY-FAILURE-LOCK|CONCURRENCY/POSTGRESQL|PASS|[evidence/worker-failure-lock-order.json](evidence/worker-failure-lock-order.json)|
|E-P2C-B-INDEXES|P2C-B-INDEXES|POSTGRESQL/PERFORMANCE|PASS|[evidence/delivery-index-review.json](evidence/delivery-index-review.json)|
|E-P2C-SCORE|P2C-SCORE|POSTGRESQL/CONCURRENCY/FAILURE_INJECTION|PASS|[evidence/canonical.json](evidence/canonical.json)|
|E-P2C-SCORE-ISOLATION|P2C-SCORE-ISOLATION|POSTGRESQL/INTEGRATION|PASS|[evidence/derived.json](evidence/derived.json)|
|E-P2C-QUERY|P2C-QUERY|PERFORMANCE/POSTGRESQL|PASS|[evidence/index.json](evidence/index.json)|
|E-P2C-A|P2C-A|POSTGRESQL/API/INTEGRATION|PASS|[evidence/recovery.json](evidence/recovery.json)|
|E-P2C-C|P2C-C|POSTGRESQL|PASS|[evidence/annual.json](evidence/annual.json)|
|E-P2C-F|P2C-F|POSTGRESQL/INTEGRATION|PASS|[evidence/annual-admission-run.json](evidence/annual-admission-run.json)|
|E-P2C-D|P2C-D|CONCURRENCY/POSTGRESQL|PASS|[evidence/deadlock.json](evidence/deadlock.json)|
|E-P2C-B|P2C-B|INTEGRATION/FAILURE_INJECTION|PASS|[evidence/delivery.json](evidence/delivery.json)|
|E-P2C-BD-LOCK|P2C-BD-LOCK|CONCURRENCY|PASS|[evidence/worker-lock-order.json](evidence/worker-lock-order.json)|
|E-P2C-B-CAL-LOCK|P2C-B-CAL-LOCK|CONCURRENCY/POSTGRESQL|PASS|[evidence/calcutta-lock-order.json](evidence/calcutta-lock-order.json)|
|E-P2C-B-NET-OWNER-LOCK|P2C-B-NET-OWNER-LOCK|CONCURRENCY/POSTGRESQL|PASS|[evidence/net-owner-lock-order.json](evidence/net-owner-lock-order.json)|
|E-P2C-B-TAIL|P2C-B-TAIL|PERFORMANCE/CONCURRENCY|PASS|[evidence/backlog-tail.json](evidence/backlog-tail.json)|
|E-P2C-B-HISTORY|P2C-B-HISTORY|POSTGRESQL/PERFORMANCE|PASS|[evidence/worker-history.json](evidence/worker-history.json)|
|E-P2C-B-BACKLOG|P2C-B-BACKLOG|INTEGRATION/PERFORMANCE/CONCURRENCY|PASS|[evidence/backlog-pressure.json](evidence/backlog-pressure.json)|
|E-P2C-FULL|P2C-FULL|INTEGRATION|PASS|[evidence/full-sequence.json](evidence/full-sequence.json)|
|E-P2C-E|P2C-E|FAILURE_INJECTION|PASS|[evidence/finite.json](evidence/finite.json)|
|E-P2C-UNIT|P2C-UNIT|UNIT|PASS|[evidence/phase2c-unit.json](evidence/phase2c-unit.json)|
|E-P2C-FOUNDATION|P2C-FOUNDATION|UNIT/API/INTEGRATION|PASS|[evidence/foundation.json](evidence/foundation.json)|
|E-P2C-NA|P2C-NA|POSTGRESQL|PASS|[evidence/phase1-sql.json](evidence/phase1-sql.json)|
|E-P2C-BROAD|P2C-BROAD|UNIT/INTEGRATION|FAIL|[evidence/application.json](evidence/application.json)|
|E-P2C-BUILD|P2C-BUILD|BUILD|PASS|[evidence/build.json](evidence/build.json)|
|E-P2C-PERF-COMMON|P2C-E|PERFORMANCE|MEASURED_VALIDATED_LOCAL|[benchmark-candidate-common.json](benchmark-candidate-common.json)|
|E-P2C-PERF-ELIGIBLE|P2C-E|PERFORMANCE|MEASURED_VALIDATED_LOCAL|[benchmark-candidate-eligible.json](benchmark-candidate-eligible.json)|
|E-P2C-PERF-RECOVERY|P2C-E|PERFORMANCE|MEASURED_VALIDATED_LOCAL|[benchmark-candidate-recovery.json](benchmark-candidate-recovery.json)|
|E-P2C-GAP-GOOGLE_REPORTING_OUTBOX|P2C-B|SOURCE_REVIEW|NOT_PROVEN_AUTONOMOUS_DELIVERY|[evidence/google-outbox-scope-review.json](evidence/google-outbox-scope-review.json)|
|E-P2C-GAP-SCORECARD_ARCHIVE|P2C-B|SOURCE_REVIEW|NOT_PROVEN_AUTONOMOUS_DELIVERY|[evidence/google-outbox-scope-review.json](evidence/google-outbox-scope-review.json)|
|E-P2C-IMPORT-ORDER-REVIEW|P2C-SCOPE|SOURCE_REVIEW|REVIEWED|[evidence/import-order-review-addendum.json](evidence/import-order-review-addendum.json)|
|E-P2C-GOOGLE-GAP|P2C-B|SOURCE_REVIEW|NOT_PROVEN_DELIVERY|[evidence/google-outbox-scope-review.json](evidence/google-outbox-scope-review.json)|
|E-P2C-ENGINEERING-REVIEW|P2C-SCOPE|SOURCE_REVIEW|HISTORICAL_REVIEW_WITH_CURRENT_IMPORT_ADDENDUM|[evidence/independent-engineering-review.json](evidence/independent-engineering-review.json)|
|E-P2C-BACKLOG-REVIEW|P2C-B|PERFORMANCE_REVIEW|REVIEWED|[evidence/backlog-tail-independent-review.json](evidence/backlog-tail-independent-review.json)|
|E-P2C-ARTIFACT-UNIT|P2C-PROOF|UNIT|PASS|[evidence/artifact-gate-unit.json](evidence/artifact-gate-unit.json)|
|E-P2C-COMBINED-GATE|P2C-E|ARTIFACT_VALIDATION|PASS|[certification-gate.json](certification-gate.json)|
|E-P2C-SWIFT|P2C-F|INTEGRATION|PASS|[evidence/native-decoder-proof.json](evidence/native-decoder-proof.json)|
|E-P2C-AUDIT-PLANS|P2C-B|POSTGRESQL/PERFORMANCE|PASS|[evidence/audit-index-plans.json](evidence/audit-index-plans.json)|
|E-P2C-FINAL-PUBLICATION-PLANS|P2C-B|POSTGRESQL/PERFORMANCE|PASS|[evidence/final-publication-plans.json](evidence/final-publication-plans.json)|
|E-P2C-LOCKS|P2C-E|PERFORMANCE|MEASURED|[lock-duration-candidate.json](lock-duration-candidate.json)|
|E-P2C-PERF-GATE|P2C-E|PERFORMANCE|PASS|[performance-gate.json](performance-gate.json)|
|E-P2C-BROAD-COMPARISON|P2C-BROAD|REGRESSION_COMPARISON|NO_NEW_FAILURE_IDENTITIES|[evidence/application-comparison.json](evidence/application-comparison.json)|

[Machine ledger](evidence-ledger.json), [requirement traceability](TRACEABILITY.md), [all numbered requests](AUDIT-COMPLETENESS.md), [Never Again catalog](never-again-catalog.json), [change impact](change-impact-graph.json), [proof matrix](PROOF-MATRIX.md).

PASS applies to the exact executed fixture/layer. PROVEN, STRONGLY SUPPORTED, PLAUSIBLE and UNKNOWN distinguish confidence in a conclusion; they do not substitute for test results. Retained native model build lineage is STRONGLY SUPPORTED, while exact model bytes and decoder outcomes are PROVEN. Counterexamples and failed attempts remain in evidence. A failed setup, stale injection target or incorrect test oracle is not silently rewritten into a product failure or a historical PASS.

Current versus historical: BEFORE/Phase1/Phase2 evidence retains its original dates and code. Current Phase2C result files represent the final local run only; they do not report current Production state. Post-change evidence freshness follows exact function/client dependencies. Unrelated later test additions do not invalidate previously executed SQL, but changed shipping dependencies require rerun.

No Production, physical-device, provider-capacity, restore or2027readiness PASS is present. Absence/inflight/legacy receipt is UNKNOWN, not evidence that a score failed to commit. No successful derived intent is treated as proof of a fresh calculated result without its independent canonical/current-pointer check.

PHASE 2C: PARTIAL — SCORE-PATH CANDIDATE NOT READY FOR STAGING; REMAINING GATES LISTED ABOVE

## Retained performance counterevidence

[E-P2C-PERF-VARIANCE](evidence/performance-variance-review.json) records a fixed-gate FAIL and one unchanged-code repeat PASS. P2C-073 remains PARTIAL; causal attribution UNKNOWN. No run-until-green or unconditional latency claim.

## Final engineering review

[Query/index/security review](evidence/final-query-index-security-review.json) validates the named source and local artifacts. [Root review](evidence/final-review.json) records the scoped PARTIAL decision; neither substitutes for missing delivery, hosted or physical proof.
