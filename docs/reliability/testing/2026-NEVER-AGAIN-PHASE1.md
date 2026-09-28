# 2026 Never Again Phase 1

## Decision and scope

Phase 1 now has permanent, local regression infrastructure for `2026-INC-006` and `2026-INC-007`. It does not implement Build 11, change native application source, contact Production, or certify a release. The passing ordinary tests prove that known Build 10 defects remain reproducible. They do not prove correction.

The corrected-behavior checks live in `tools/reliability/native-never-again/candidate-gate.mjs`, outside default Node test discovery. They fail against Build 10 by design. A future tournament candidate gate must run that file explicitly and must treat a missing candidate checkout or missing simulator evidence as failure.

## NA-2026-006: real SQLite persistence and termination

The harness compiles byte-exact copies of the Build 10 queue model, transition policy, and `SQLiteScoringQueueRepository` from native SHA `e7652b9b65595861f4f7cdf0b8326491581a27b8`. `fixture-manifest.json` records their upstream paths and SHA-256 values. The only compatibility code supplies external model shapes needed to compile repository methods that the harness does not call.

The defect reproduction performs these steps:

1. It finds a deterministic fractional `Date` that changes under Build 10's `secondsSince1970` JSON codec.
2. Process A opens a real SQLite database through `SQLiteScoringQueueRepository`, saves a valid best-ball score intent, verifies the SQLite file header and WAL configuration, closes the repository, and exits.
3. Process B opens that same database, loads the actual stored queue record, reconstructs the original in-memory timestamp from its bit pattern, and invokes the real `replace(_:expecting:)` path.
4. Build 10 observes a 119.20928955078125 ns representation difference and throws `concurrentModification` even though no competing writer exists.

This is stronger than a generic Date demonstration: the assertion crosses the actual Build 10 JSON blob, SQLite row, reopen, equality, validation, and compare-and-swap path in two operating-system processes.

That standalone harness proves the persistence defect, but its direct `replace(_:expecting:)` call does not by itself prove the shipping coordinator's canonical acknowledgement comparison. A second permanent harness now closes that scope gap against the exact pinned Build 10 checkout:

1. Simulator process A runs the actual `ScoringQueueCoordinator` and `SQLiteScoringQueueRepository` with the historical fractional-clock trigger. The real score flow obtains an accepted acknowledgement and matching canonical Official gross/revision evidence, then the timestamp defect leaves the durable row `acknowledged` with `refreshPending=true` and a sticky persistence failure.
2. The process closes after preserving the actual SQLite database and exact accepted mutation request.
3. A separate simulator test process opens the same SQLite file. Its isolated synthetic API reconstructs the already-committed canonical score before coordinator activation; no hosted endpoint is used.
4. The actual Build 10 coordinator loads the persisted acknowledgement, performs its shipping canonical snapshot/revision/gross comparison, clears `refreshPending`, and converts the row to an accepted compact receipt.
5. Recovery sends zero additional score POSTs, preserves the mutation ID, leaves zero unresolved/full records, clears the new coordinator's persistence failure, and permits a later local intent.

The two simulator phases passed at the pinned SHA on iOS Simulator: two tests, zero failures. Process IDs 4216 and 4277 prove separate test processes. The prepare phase observed SQLite/WAL, canonical revisions 13/1, exact matching gross, and the expected sticky failure. The relaunch phase observed an accepted same-mutation receipt, zero extra score POSTs, and zero unresolved rows. This is bounded recovery evidence for an already-accepted matching Official intent after full relaunch. It is not evidence that the live session self-recovers, that every relaunch succeeds, or that Build 10's timestamp defect is corrected.

The durable execution record for both layers is `docs/reliability/testing/evidence/NA-2026-006-build10.json`. The coordinator fixture pins the production coordinator, repository, model, policy, and existing test-support hashes. It uses the shipping transition code with a synthetic `MobileAPIServing` implementation in an iOS simulator; it does not claim physical-device or hosted-transport proof.

Run the passing defect reproduction on macOS:

```sh
node --test test/reliability-native.test.mjs
```

Supply the exact Build 10 checkout and cached packages to include the coordinator reconciliation check:

```sh
BAGGER_NATIVE_BUILD10_ROOT=/path/to/native-build10 \
BAGGER_NATIVE_PACKAGE_CACHE=/path/to/SourcePackages \
  node --test test/reliability-native.test.mjs
```

The corrected-behavior gate copies the three scoring queue source files from `BAGGER_NATIVE_CANDIDATE_ROOT` into a disposable harness package. It therefore tests the supplied candidate implementation rather than the immutable Build 10 fixture:

```sh
BAGGER_NATIVE_CANDIDATE_ROOT=/path/to/native-candidate \
  node --test tools/reliability/native-never-again/candidate-gate.mjs
```

On Build 10, the SQLite candidate check exits nonzero with `concurrentModification`. A corrected candidate must allow the actual compare-and-swap replacement after save, process termination, and reopen. The gate reports whether the decoded record is exactly equal to the original witness, but it does not require that particular implementation: a candidate may preserve representation or compare a normalized durable form.

## NA-2026-007: actual authenticated shell reset

The shell reproduction is the byte-exact simulator test from the preserved Build 10 fallback audit. The runner validates the checkout SHA and hashes of `RootView.swift`, `AppTabShell.swift`, `MobileReadRepository.swift`, `TournamentDataCoordinator.swift`, and `AppCoordinator.swift`. It copies the caller's clean `ios` tree to a disposable directory, injects the test there, and never modifies the caller checkout.

The reproduction mounts the actual `RootView`, selects Matches, Score, Leaders, and More in turn, suspends health, and invokes the actual authority revalidation path. For each destination, Build 10 removes the authenticated tab shell during `.checkingEnvironment`, creates a new shell, and returns to Today index 0. The participant remains authenticated and sign-out count remains zero.

Fresh Phase 1 simulator execution on iOS 26.5 passed the reproduction at the pinned SHA: one test, zero failures, in 53.354 seconds. The corrected-behavior test then failed in 5.370 seconds with eight assertions: shell identity and selected destination both failed for each of the four feature destinations. This is simulator evidence, not physical-device evidence.

The fresh simulator execution record is `docs/reliability/testing/evidence/NA-2026-007-build10-simulator.json`.

Obtain a clean checkout from the authorized repository remote and detach it at the exact Build 10 SHA. The runner does not depend on preserved `/private/tmp` material:

```sh
git clone <authorized-repository-url> /path/to/native-build10
git -C /path/to/native-build10 checkout --detach e7652b9b65595861f4f7cdf0b8326491581a27b8
```

Supply a locally cached Swift package directory so package resolution does not use the network:

```sh
BAGGER_NATIVE_BUILD10_ROOT=/path/to/native-build10 \
BAGGER_NATIVE_PACKAGE_CACHE=/path/to/SourcePackages \
BAGGER_NATIVE_SIMULATOR_DESTINATION='platform=iOS Simulator,name=iPhone 17 Pro Max,OS=latest' \
  node --test test/reliability-native.test.mjs
```

The future candidate gate uses `BAGGER_NATIVE_CANDIDATE_ROOT` and the same local package cache. It fails if the candidate root is absent; simulator coverage cannot silently skip in a tournament gate.

## Evidence interpretation

| Check | Current Build 10 result | Meaning |
|---|---|---|
| SQLite defect reproduction | PASS | Known defect reproduced through real persistence and two processes |
| Matching Official acknowledgement after relaunch | PASS | Actual Build 10 coordinator reloaded the persisted accepted acknowledgement, performed canonical comparison and compacted a same-mutation receipt with no score POST |
| SQLite corrected behavior | EXPECTED RED | Candidate still rejects its own persisted record as a concurrent modification |
| Shell-reset reproduction | PASS | Actual simulator shell resets on all four tested feature destinations |
| Shell preservation | EXPECTED RED | Candidate replaces the shell and resets each selected destination |
| Physical device | NOT RUN | No touch, radio, termination, background, accessibility, or screenshot claim |
| Production | NOT USED | No application, scoring, staging, or Production network calls |

A green defect reproduction must never be reported as a repaired incident or release PASS. A holistic tournament PASS requires the corrected-behavior gates plus the applicable physical and lifecycle evidence.

## Build 10 recovery limit

The permanent two-process coordinator fixture now shows directly that full termination and relaunch can reconcile an already-Official matching intent under the bounded tested conditions. It does not show that relaunch always recovers. The preserved broader fractional-clock matrix found relaunch recurrence at clock positions 16 through 18: the queue could remain `syncing` or `acknowledged`, the sticky persistence failure could remain set, and next-hole entry could remain blocked. Phase 1 therefore preserves both facts: bounded recovery exists, and the underlying timestamp defect can recur during recovery.

## Dependencies and ownership

- macOS, Apple Swift, and SDK SQLite are required for the standalone NA-2026-006 defect reproduction. The coordinator reconciliation layer also requires Xcode, an available iOS simulator, the exact pinned Build 10 checkout, and locally cached package revisions.
- Xcode, an available iOS simulator, a clean caller-supplied native checkout, and locally cached exact Swift package revisions are required for NA-2026-007.
- Root package scripts and CI wiring are owned by the integrating change.
- Backend and SQL catalog entries are owned by the backend workstream and must be merged into `NEVER-AGAIN-CATALOG.json` without renumbering the native IDs.

## Deferred P1 discovery

A complete active future-year annual dispatch lifecycle fixture remains deferred. Phase 1 does include archived-year volume fixtures; those do not certify future-year dispatch or a chronological tournament.

## NA-2026-017: R3 canonical preparation readback

The offline certification fixture `tools/reliability/preparation-readback.mjs` prevents a successful mutation response or a local “12 pairings” count from standing in for canonical preparation evidence. It accepts only when the acknowledged operation matches the reviewed operation ID, setup revision 48, current handicap revision 13, pairing and protected fingerprints, exact dependency revisions, the exact 12-match set, and the exact 24-golfer set. Canonical readback must then contain those same 12 pairings, 12 current `:S2` contexts with their exact per-match preparation fingerprints, the reviewed current HI 13 identity, and 12 READY results.

The fixture rejects the historical weak shape where the operation is acknowledged and 12 pairings are present but `ready` is a placeholder zero and canonical current contexts are absent. It also rejects stale operation revisions, fingerprint drift, dependency drift, substituted matches or golfers, a noncurrent context, and a changed readiness set. Seven behavioral tests pass, including CLI exit-code checks, mandatory operation/dependency identity, exact match-to-golfer/team/course/tee mapping and independent canonical lifecycle counts. The verifier checks consistency of caller-supplied evidence; it does not authenticate that evidence as a real RPC response. This is offline certification-tool evidence; it does not assert that Production R3 was prepared.

Run it with:

```sh
node --test test/reliability-readback.test.mjs
```

The standalone verifier accepts a JSON file path or JSON on standard input. It performs no network or database work and returns exit code 0 only for exact canonical acceptance.

## Telemetry changes on PN1/PN2 protected paths

The original PN1/PN2 byte-freeze checks remain unchanged and remain red for both existing Release 139 drift and the explicitly reviewed Phase 1 telemetry deltas. The telemetry changes therefore do not receive a byte-equivalence waiver.

`test/reliability-telemetry-protected-equivalence.test.mjs` adds five behavioral comparisons against exact Release 139 source SHA `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`. It executes both versions and compares current-tournament RPC input, transport, decoded payload, and error results; scoring dispatch authority-read order, bounded body, transport, and acknowledgement; post-commit fan-out order, arguments, and settled results; and the hole/finalize route authority, mutation, scheduling, and response semantics. The only route response difference it permits is the Phase 1 request-correlation header. All five comparisons pass.

Run it with:

```sh
node --test test/reliability-telemetry-protected-equivalence.test.mjs
```

## NA-2026-010 and NA-2026-012: actual PostgreSQL execution

`test/reliability-sql-never-again-postgres.integration.test.mjs` installs the exact Release 139 schema and invokes the actual Calcutta claim and Net Skins read/claim functions. The historical invalid schema qualification produces SQLSTATE 42883. Applying the recorded incremental repairs inside the disposable database removes that failure: a valid empty-queue claim returns `ok:true` with no job, and the Net Skins participant read succeeds. Function owner, ACL, SECURITY DEFINER and configuration invariants are compared. Invalid inputs still fail closed.

This is SQL execution evidence, not JavaScript calculator proxy proof. The SQL test deliberately distinguishes a valid empty queue from a claimed-job calculation. Full local queue/claim/calculation/completion measurements, where successful, are recorded separately in `performance/SIDEGAME-PROCESSORS.json`. Neither artifact proves hosted worker scheduling or publication chronology.

## Catalog and release gate

### NA-2026-019: score versus Calcutta history

`test/reliability-score-history-postgres.integration.test.mjs` passed against disposable PostgreSQL 17 with 7,450 synthetic Calcutta jobs and zero eligible compatibility receipts. A test-only stable function raises a sentinel if consumed-history fingerprint work is evaluated. The actual Release 139 score RPC returns `ACCEPTED`; installing the historical compatibility function makes the same score reach the sentinel; reinstalling migration 120 restores acceptance with identical gross, strokes and net values. This is a behavioral SQL/failure-injection regression, not a source-string assertion or timeout-only test.

The separate 1x/2x/5x/10x benchmark measures old/repaired score and compatibility paths. The fixture proves the ineligible-receipt short circuit; it does not establish every eligible-receipt path, durable commit, concurrent worker behavior or hosted capacity. The application function and Production are unchanged.

The six stable incident families are 006, 007, 010, 012, 017 and 019. `NEVER-AGAIN-CATALOG.json` records the current proof and limits for each. Historical native reproductions are ordinary passing tests; corrected native behavior is an explicit expected-red future gate. No skip or successful reproduction may satisfy a tournament candidate's repair gate. Wiring these gates into the future tournament release orchestrator remains follow-up work; this phase does not claim that existing Production release tooling automatically enforces all six.
