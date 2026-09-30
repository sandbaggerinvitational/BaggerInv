# Evidence ledger

**PARTIAL.** [Machine-readable ledger](evidence-ledger.json) binds claims to exact artifacts and execution receipts. Every run records source hashes before/after, environment, entry points, limitations and baseHEAD. Final source commit identity belongs in[CANDIDATE-MANIFEST.md](CANDIDATE-MANIFEST.md); tests were not falsely attributed to an uncreated commit.

## Executed selections

Counts are Node test-runner totals, including parent tests where applicable. Suites overlap; do not add these rows as unique coverage. The annualCREATE behavioral matrix has21cases under2Node wrappers; native decoding has24checks.

| Run | Result | Tests / pass / fail / skip | Evidence |
|---|---|---|---|
| annual-client | PASS | 31 / 31 / 0 / 0 | [evidence/annual-client.json](evidence/annual-client.json) |
| annual-create | PASS | 2 / 2 / 0 / 0 | [evidence/annual-create.json](evidence/annual-create.json) |
| annual-odds-contract | PASS | 5 / 5 / 0 / 0 | [evidence/annual-odds-contract.json](evidence/annual-odds-contract.json) |
| annual | PASS | 26 / 26 / 0 / 0 | [evidence/annual.json](evidence/annual.json) |
| application | FAIL | 4095 / 4072 / 23 / 0 | [evidence/application.json](evidence/application.json) |
| boot | PASS | 1 / 1 / 0 / 0 | [evidence/boot.json](evidence/boot.json) |
| boundaries | PASS | 3 / 3 / 0 / 0 | [evidence/boundaries.json](evidence/boundaries.json) |
| build | PASS | Compilation only | [evidence/build.json](evidence/build.json) |
| deadlock | PASS | 10 / 10 / 0 / 0 | [evidence/deadlock.json](evidence/deadlock.json) |
| delivery | PASS | 54 / 54 / 0 / 0 | [evidence/delivery.json](evidence/delivery.json) |
| director-capabilities | PASS | 21 / 21 / 0 / 0 | [evidence/director-capabilities.json](evidence/director-capabilities.json) |
| director-odds-publication | PASS | 13 / 13 / 0 / 0 | [evidence/director-odds-publication.json](evidence/director-odds-publication.json) |
| director-odds | PASS | 4 / 4 / 0 / 0 | [evidence/director-odds.json](evidence/director-odds.json) |
| director-preview | PASS | 9 / 9 / 0 / 0 | [evidence/director-preview.json](evidence/director-preview.json) |
| director | PASS | 21 / 21 / 0 / 0 | [evidence/director.json](evidence/director.json) |
| finite | PASS | 7 / 7 / 0 / 0 | [evidence/finite.json](evidence/finite.json) |
| full-sequence | PASS | 1 / 1 / 0 / 0 | [evidence/full-sequence.json](evidence/full-sequence.json) |
| harness | PASS | 2 / 2 / 0 / 0 | [evidence/harness.json](evidence/harness.json) |
| recovery | PASS | 50 / 50 / 0 / 0 | [evidence/recovery.json](evidence/recovery.json) |
| retirement-release | PASS | 2 / 2 / 0 / 0 | [evidence/retirement-release.json](evidence/retirement-release.json) |
| retirement-security | PASS | 84 / 84 / 0 / 0 | [evidence/retirement-security.json](evidence/retirement-security.json) |
| retirement-sql | PASS | 8 / 8 / 0 / 0 | [evidence/retirement-sql.json](evidence/retirement-sql.json) |
| retirement | PASS | 47 / 47 / 0 / 0 | [evidence/retirement.json](evidence/retirement.json) |
| routing-safety | FAIL | 3 / 0 / 3 / 0 | [evidence/routing-safety.json](evidence/routing-safety.json) |
| routing | FAIL | 14 / 11 / 3 / 0 | [evidence/routing.json](evidence/routing.json) |
| worker-lock-order | PASS | 5 / 5 / 0 / 0 | [evidence/worker-lock-order.json](evidence/worker-lock-order.json) |

## Claim interpretation

| ID | Result / confidence | Proof layers | Limitation |
|---|---|---|---|
| CL-ODDS-OWNER-PUBLICATION | PASS_SCOPED / PROVEN | API, POSTGRESQL, INTEGRATION, SECURITY, FAILURE_INJECTION | Actual After Round1 publication and real calculator; synthetic identity/Next after callback, manually driven processor. Owner confirmation, stale-input checks, audit rollback, same-job readback/replay,0newGooglejobs. No hosted Auth/automatic scheduling proof. |
| CL-ANNUAL | PASS_SCOPED / PROVEN | UNIT, POSTGRESQL, API, INTEGRATION, SECURITY, FAILURE_INJECTION | One current-authority scope plus explicit future target year; draft receipt/readback/retry/rollback. Synthetic auth/activation and socket transport, no hosted proof. |
| CL-ANNUAL-WIRE-HASH | PASS_SCOPED / PROVEN | UNIT, POSTGRESQL, API, INTEGRATION | Actual PostgreSQL JSONB wire hash parity; legacyv1CREATE digest unchanged. Full annual activation chronology unproved. |
| CL-DIRECTOR-SCOPED | PASS_SCOPED / PROVEN | SOURCE, UNIT, POSTGRESQL, API, INTEGRATION, SECURITY, FAILURE_INJECTION | Overview, Finalize and Reopen only. Other required capabilities remain individually classified. |
| CL-CAPABILITY-PARITY | PARTIAL / PROVEN | SOURCE | Preview bulk imports would not preserve canonical setup, immutable entry/auction and readiness semantics; safe isolated command context missing. |
| CL-ROUTING | FAIL_REQUIRED_RED / PROVEN | UNIT, API, INTEGRATION | Three original gaps plus no-fallback guard remain RED; automatic approval review rejected source edit and explicit owner confirmation is pending. |
| P0-A | PASS_SCOPED / PROVEN | POSTGRESQL, API, INTEGRATION, FAILURE_INJECTION | Recovery after authority revocation; synthetic local fixture, no physical client or hosted admission. |
| P0-B | PASS_SCOPED / PROVEN | POSTGRESQL, INTEGRATION, FAILURE_INJECTION | Required automatic Calcutta/Competition/Intelligence families; owner-controlled publication not automated; Google retired, not delivery-certified. |
| P0-C | PASS_SCOPED / PROVEN | POSTGRESQL, INTEGRATION | Known14-function worker inventory. AnnualCREATE is a separate claim. |
| P0-D | PASS_SCOPED / PROVEN | POSTGRESQL, INTEGRATION, CONCURRENCY, FAILURE_INJECTION | Known mixed-round Net Skins lock case only, no Production contention capacity. |
| P0-E | PASS_SCOPED / PROVEN | POSTGRESQL, INTEGRATION, FAILURE_INJECTION | Finite local statement timeout and57014rollback/recovery; no timeout increase. |
| P0-F | PARTIAL / PROVEN | SOURCE, UNIT, POSTGRESQL, API, INTEGRATION | Required isolated Director contexts and routing proofs missing. Existing scoped client/control/release passes do not close parity. |
| CL-FULL-SEQUENCE | PASS_SCOPED / PROVEN | POSTGRESQL, API, INTEGRATION, FAILURE_INJECTION | 432holes/24Final/432receipts/0Google/0required automatic backlog. Synthetic preparedLive starting state; fsyncOFF; no Prepare/Open rehearsal. |
| CL-HISTORY-RECORDS | PASS_SCOPED / PROVEN | UNIT, API, INTEGRATION | Synthetic2017–2026canonical fixtures/8checks; no real archive completeness or Google artifact preservation access. |
| CL-PERFORMANCE | NO_SYSTEMATIC_REGRESSION_DETECTED / STRONGLY_SUPPORTED | POSTGRESQL, PERFORMANCE | 12000rollbackRPCsamples,3batches/fourscales; empiricaltails, external scheduling uncontrolled; noProductioncapacityclaim. |
| CL-NATIVE-DTO | PASS_SCOPED / PROVEN | INTEGRATION | 24checks actual retainedSwiftdecoder/newsyntheticDTO; UTC only. Build10lineage stronglysupported; no physical/appqueue/UIproof. |
| CL-BROAD-ACCOUNTING | ACCOUNTED_KNOWN_FAILURES / PROVEN | UNIT | Exactidentity accounting; original493-file selection. KnownrequiredRED remainsfailure, obsolete deletions notpasses. |
| CL-BUILD-BOOT | PASS_SCOPED / PROVEN | INTEGRATION | Local compilation and loopbackboot with scrubbedcredentials/remotesocketsdenied; no deployment. |
| CL-SECURITY | PASS_SCOPED / STRONGLY_SUPPORTED | SOURCE, UNIT, POSTGRESQL, API, SECURITY | No observednewregression in exercisedchangedpaths. KnownroutingadmissionRED remainsseparate; no global/hostedsecurityclaim. |

## Evidence preservation and freshness

Earlier Phase1/2/2C/retirement evidence is unchanged. Closure reruns write beneath `evidence/revalidation/`; benchmark batches each have their own directory. Before-state failures are retained. Large rawTAP/log files may be losslessly compressed with an artifact-storage index mapping the original receipt hash to the stored file. This is storage-only, not result editing.

The global changed-file manifest is broader than each execution’s dependency graph. Any later unrelated verification-only change is identified by the final freshness review; affected runtime/tests rerun. Neither a later source hash nor a total test count retroactively upgrades an earlier proof.

Full-sequence Google counters apply to the exact installed Production-shaped synthetic profile. Separate Preview score/snapshot/publication branches require their own actual SQL proof. The earlier retirement claim is narrowed accordingly, not silently rewritten.

All Production/physical columns remain NOT PROVEN. No real Google artifact, database or participant was accessed. Google absence is expected runtime configuration; external historical preservation is a later owner task.

## Final source and packaging reconciliation

Source candidate: `63fd9f0e47993eb48e89ae268d03b939b0a5c10c`. The separate documentation commit contains this evidence package. Tests retain their actual execution HEAD and candidate file hashes; they are not relabeled as having run after the source commit.

[Freshness review](evidence/freshness.json) covers all26 executed selections with zero unadjudicated dependency changes. Retained-operation byte equivalence is recorded separately. The last fixture edit removed only one extra EOF blank line; both dependent suites reran: Director Preview9/9 and owner Odds13/13. Their prior receipts/raw outputs remain under `evidence/before/fixture-eof-format/`. The independent review links its exact reviewed receipt rather than implying it reviewed a later run.

[Artifact storage index](evidence/artifact-storage-index.json) records 48 losslessly compressed raw artifacts (3,929,040 decompressed bytes; 586,673 stored bytes). Decompression hashes are the original receipt hashes. No result was trimmed or rewritten.
