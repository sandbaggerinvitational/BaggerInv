# Phase 2 certification

## PARTIAL

The candidate architecture is **not approved for staging/promotion**. Required recovery, delivery, annual runtime, client, control, and performance proofs remain incomplete. Telemetry, test counts, and local medians do not close the broader P0 requirements. The deployment decision is **NOT READY — ADDITIONAL PHASE 2 WORK REQUIRED**.

Base SHA `184b5c65a8e63784e1af8d38121fa2e16a015628`. Candidate migration SHA256 `cd9f6a784741d9e41c7f2e267bf4135549aeeb61333a22e4a31d9a174a3651a8`. The [evidence ledger](evidence-ledger.json) records the source manifest and exact test/artifact hashes. All SQL/runtime measurements are **NON-PRODUCTION**. Physical and Production columns remain NOT PROVEN.

| Required gate | Result / proof |
|---|---|
| Synchronous classification and canonical invariants | PASS for SOURCE and tested SQL; the active future runtime is scoped separately |
| Score/receipt/audit/delivery atomicity | PASS across 8 tested fault boundaries and intent insertion failure |
| Release 139 common and synthetic eligible branches | PASS in local actual SQL; corrected behavior retained and historical failure reproduced |
| 1×/2×/5×/10× history structure and measured growth | PASS for the automated local artifact gate; broader annual runtime and intent-history scope remains PARTIAL |
| Idempotency under duplicates/conflicts | PASS for actual SQL and concurrency within the authorized scope |
| Unknown-outcome recovery | PARTIAL: SQL truth is recoverable; supported participant status resolution after revocation is NOT PROVEN |
| Concurrency and deadlocks | PARTIAL: tested score/Lock/Finalize cases pass; worker 40P01 is contained and retryable; complete control/release/runtime proof is absent |
| Best Ball/Scramble/Singles; gross/strokes/net/winner/progress/points | PASS for the scoped 432-hole + 72-edge-hole actual SQL/oracle comparison; no formula change |
| Handicap/course/tee authority | PASS for frozen-context preservation; the full handicap approval and hosted context lifecycle is NOT PROVEN |
| Authorization/security | PASS for tested real actor checks, grants, and new-table RLS denials; the complete hosted Auth/RLS negative matrix is NOT PROVEN |
| Required audit/receipt | PASS for atomic before/after and replay assertions |
| Phase 1 telemetry/privacy/diagnostic foundation | PASS for local tests; complete hosted correlation/exporter proof is absent |
| Calcutta/Skins derived failure isolation | PASS: score commits survive tested consumer failures; required intent insertion failure intentionally aborts |
| Odds isolation | SOURCE shows no direct score dependency; existing derived projection behavior is retained; the full Odds lifecycle is NOT PROVEN |
| Post-commit correctness | PASS for synthetic public Calcutta/Skins processor parity and the stale-completion guard; autonomous delivery and dead-letter recovery remain PARTIAL |
| Multiple rounds/full round | PASS: 432 holes/24 finalizations without resetting between rounds; this is not the full tournament dress rehearsal |
| Multiple years | PASS with 1/2/5/10 synthetic prior tournaments retained; this is not actual Production history |
| Query plans/index | PASS for inspected frozen 2026 plans and the guard index truth table; future annual/hosted behavior is NOT PROVEN |
| Lock/transaction duration | PARTIAL: lower/upper bounds measured; exact COMMIT release and p99 are not proven |
| Statement-timeout headroom | NOT PROVEN: local default is 0; deliberate 57014 rollback PASS does not establish the deployed setting |
| Resource pressure/HTTP retry storm | NOT PROVEN |
| Client-compatible response source | PASS: shipping API/core RPC shapes are unchanged; isolated hosted PWA/Build 10/Director proof remains PARTIAL |
| Migration/attestation/rollback | PARTIAL: effective clean install, upgrade, rejection, and grants PASS; annual recertification and compatible live rollback remain pending |
| Broad regression | Baseline 4127 pass/26 fail; candidate 4127 pass/26 fail; zero new failure names. One known freeze diagnostic's first offender changed and was explicitly reviewed |
| Local Production build | PASS for compilation only |

## Exact local counts

- Canonical suite: 30 behavioral / 31 Node tests PASS. Baseline: 29/30 behavioral, with one actual timeout caused by locking between independent matches (Node: 29 pass/2 fail, including the parent).
- Derived suite: 14 behavioral / 15 Node tests PASS.
- Migration/worker suite: 11 behavioral / 12 Node tests PASS. Expected annual 42883 and retryable worker 40P01 errors are characterized defects, not capability PASS claims.
- Eligible suite: 19 Node tests PASS, with 48 diagnostic accepted-score samples and two actual calculator/public completion checks. The exact baseline of 17 Node tests PASS remains historical evidence.
- Rehearsal partial-index regression: 4 Node tests PASS; the earlier experiment's 4 PASS results are retained separately.
- Foundation: 96 tests / 94 pass / 2 skip / 0 fail. Includes 18 performance-gate UNIT tests; do not add them again.
- Phase 1 SQL safeguards rerun: 3 tests / 3 pass / 0 fail, using a separately scoped baseline installation.
- Broad application comparison: 4153 tests each, 4127 pass/26 fail. New Phase 2 suites are reported separately and are not included in this count.
- Performance: 4000 common + 960 eligible + 800 accepted lock samples **per before/after side**. These are operation samples, not unit-test counts. Additional truth-table, diagnostic, and round samples are not added to these benchmark totals.

## Explicit exclusions

PRODUCTION QUERIED: NO. MUTATED: NO. DEPLOYED: NO. SCHEMA/REAL HANDICAPS/PAIRINGS/SCORES/RESULTS/NET SKINS/CALCUTTA/ODDS CHANGED: NO. Native shipping source changed: NO. Build 11 implemented: NO. Competitive semantics changed: NO in the compared canonical bodies and tested rules. Phase 1 historical artifacts are unchanged.

There is no claim of Production p99, I/O headroom, connection capacity, Supabase provider stability, restore capability, physical native behavior, complete Round Open/Prepare reliability, the full side-game lifecycle, owner usability, or 2027 Tournament Ready status. Some proof uses synthetic runtime/admission substitutions; the [proof matrix](PROOF-MATRIX.md) prevents SQL evidence from substituting for hosted authority proof.

Next single phase: **continue Phase 2 recovery and derived-delivery proof closure**. See [next phase](NEXT-PHASE.md). No deployment authorization is implied.
