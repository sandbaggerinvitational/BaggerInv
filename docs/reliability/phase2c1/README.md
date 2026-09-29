# Phase 2C.1 — Google runtime retirement

**PARTIAL. Do not stage or deploy this draft.** Google has been disconnected from the examined candidate tournament runtime, and P0-B has scoped local proof for the remaining required automatic worker families. Required isolated Director replacement, actual annual initialization and broad compatibility closure are incomplete.

Start with [OWNER-REVIEW.md](OWNER-REVIEW.md), then [CERTIFICATION.md](CERTIFICATION.md). The candidate does not demonstrate that Production no longer uses Google; Production and the real Google account were untouched.

## What changed

Canonical scoring, required audit and finalized scorecard snapshots remain PostgreSQL authority. Candidate score/control/Finalize functions no longer create Google mirror/archive jobs; post-commit delivery hooks and Google-specific HTTP maintenance/cron paths are disconnected. Canonical readers default to Supabase and fail closed rather than selecting Google. Canonical release/annual admission no longer requires external workbook completion. Historical job/receipt rows and old provenance are retained, not marked delivered or deleted.

Google/Sheets/Drive code is not blindly erased. Historical import/builders and old implementation evidence remain maintenance/history material. No supported optional Google runtime export is retained. A provider-neutral convenience report can be considered later if needed; this task does not build a new reporting system.

## What the evidence shows

- Final local score sequence: 432 holes and 24 Final results, with 0 Google calls/jobs and no required automatic delivery left stranded. The fixture retains 526 audit rows and 24 snapshots. Net Skins owner work and publication-gated FinalRecap are explicitly waiting, not falsely completed.
- 295 test executions across scoped suites passed, and the local build passed. These executions overlap in coverage; they do not represent 295 independent capabilities. The two-test release wrapper includes a passing reproduction of the annual CREATE defect. Annual initialization itself remains expected red.
- 4,000 local benchmark samples succeeded. Median score RPC times were 0.558–0.606 ms across 1×/2×/5×/10× history; nested SQL executions were 85 versus 88 previously. Higher tail latency is unexplained, so performance non-regression remains PARTIAL. These results do not establish Production latency or capacity.
- Broad 493-file selection: 3,971 pass / 188 fail across 4,159 tests. All 26 baseline failure identities remain; 7 have changed diagnostics. The 162 additional failure identities include obsolete provider expectations and required capability/proof gaps. The broad suite is not PASS.

## What blocks completion

The isolated Director still loads a legacy client whose route is retired. Actual annual CREATE has a pre-existing current-year/target-year contradiction. Canonical read/client expectations in the broad suite still need closure. No new source workaround weakens Production gates or silently routes a Preview environment into real authority.

Next single task: [Phase 2C.1 canonical capability and proof closure](NEXT-PHASE.md). Hosted/staging certification is later and requires separate authorization. Build 11, Production capacity, backup restore, full round/lifecycle/physical proof and owner rehearsal remain outside this phase.

## Package index

| Decision / design | Proof / implementation |
| --- | --- |
| [Retirement decision](RETIREMENT-DECISION.md) | [Certification](CERTIFICATION.md) |
| [Owner review](OWNER-REVIEW.md) | [Engineering review](ENGINEERING-REVIEW.md) |
| [Dependency register](GOOGLE-DEPENDENCY-REGISTER.md) | [Machine register](google-dependency-register.json) |
| [Architecture](GOOGLE-RETIREMENT-ARCHITECTURE.md) | [Contract](GOOGLE-RETIREMENT-CONTRACT.md) |
| [Canonical ownership/replacement](CAPABILITY-REPLACEMENT.md) | [Change summary](CHANGE-SUMMARY.md) |
| [History preservation](HISTORICAL-PRESERVATION.md) | [History source proof](HISTORY-SOURCE-PROOF.md) |
| [Financial isolation](FINANCIAL-ISOLATION.md) | [P0-B recertification](P0-B-RECERTIFICATION.md) |
| [Annual initialization](ANNUAL-INITIALIZATION.md) | [Release admission](RELEASE-ADMISSION.md) |
| [Zero-Google matrix](ZERO-GOOGLE-CERTIFICATION.md) | [Proof layers](PROOF-MATRIX.md) |
| [Client compatibility](CLIENT-COMPATIBILITY.md) | [Broad adjudication](evidence/application-failure-adjudication.json) |
| [Performance](PERFORMANCE.md) | [Benchmark results](benchmark-results.json) |
| [Traceability](TRACEABILITY.md) | [Evidence index](EVIDENCE.md) |
| [Future deployment only](DEPLOYMENT-PLAN.md) | [Candidate manifest](CANDIDATE-MANIFEST.md) |
| [Future Google cleanup](PRODUCTION-GOOGLE-CLEANUP-PLAN.md) | [Next phase](NEXT-PHASE.md) |

The preserved Phase 1/2/2C/postmortem evidence remains unchanged. New receipts bind exact source hashes and proof layers. Run `node docs/reliability/phase2c1/collect-evidence.mjs` to rebuild the receipt index locally. Diagnostic runs that observed changing source are retained separately and cannot certify PASS.

Additional controls: [Preflight and boundary audit](PREFLIGHT.md), [report completeness](REPORT-COMPLETENESS.md).
