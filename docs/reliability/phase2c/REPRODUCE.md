# Reproducing the Phase2C proof package

Use a checkout of the exact candidate source commit and Node26/PostgreSQL17 as recorded in the manifest. Install the repository's locked dependencies. Never provide Production environment variables or a remote database URL. The proof tools allocate their own private local PostgreSQL clusters, verify ownership, deny remote sockets for application children, scrub provider credentials, and remove only clusters they created. A separately running developer database is not part of the proof.

## Local prerequisites and retained inputs

Run from the repository root of a Git checkout, not a source-only ZIP. The runner records HEAD and compares source against Phase2 base `b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18`; that commit must be present locally. A shallow checkout missing the base cannot supply the requested before/after provenance. Confirm it before running suites:

```sh
git cat-file -e 'b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18^{commit}'
node --version
npm ci
python3 --version
```

Use the Node26 toolchain recorded in the candidate manifest and the locked npm dependencies. Python3 uses only the standard library for the artifact gate. The Swift decoder additionally requires macOS with Xcode command-line tools providing `xcrun`, `swiftc` and the macOS SDK; it is not a Linux-native or iPhone test. Do not substitute a different model implementation if those tools are unavailable—record that layer NOT PROVEN.

Provide PostgreSQL17 server/client executables and its `auto_explain` loadable module (usually the distribution's contrib package). The local helper checks Homebrew `/opt/homebrew/opt/postgresql@17/bin`, then a PostgreSQL17 `pg_config --bindir`. For another installation, set `BAGGER_RELIABILITY_PG_BIN` to its absolute local executable directory; this is a binary location, never a database URL. Required executables are `initdb`, `pg_ctl`, `postgres`, `createdb`, `dropdb` and `psql`. Local subprocess/Unix-socket access must be allowed. PostgreSQL must run as a normal local user. The fixture uses disposable `fsync=off` clusters, so these timings do not measure durable production storage.

Use a clean checkout without private `.env`/`.env.local` provider credentials. The wrapper strips provider credentials from child environments and denies remote sockets, but source-controlled synthetic fixtures—not real accounts or a developer's provider configuration—are the required inputs. No running Supabase service, Docker stack, provider login or separately managed database is required.

All historical comparison inputs used by the executable proofs are retained in the repository:

- `docs/reliability/phase2c/evidence/annual-sql-before.json`, `calcutta-current-job-before-definitions.json`, `net-owner-control-before-definitions.json`, and `worker-failure-lock-before-9bd77498/phase2c-worker-failure-before-definitions.json`.
- `test/support/reliability/phase2c-delivery-indexes.json`, deterministic fixture modules, the historical annual fixture SQL/test chain, migrations through124, and the two incremental SQL corrections plus `candidates/scored-match-resume.sql`.
- `docs/reliability/phase2/evidence/application-selection.json` and `application-baseline.json` for the unchanged493-file broad comparison.
- `tools/reliability/native-never-again/decoder/fixture-manifest.json`, its12 retained Vendor Swift files, and `docs/reliability/phase2c/evidence/native-timezone-counterexample.json`. Recovery generates the current DTO input before the Swift run.

Do not delete these retained inputs when cleaning generated outputs. The source-provenance helper captures their consumed hashes and fails closed on missing inputs. Temporary clusters, compiled Swift executables and module caches are generated per run and removed by their owning harness; their temporary paths are not retained evidence dependencies. The delivery test permits an optional temporary **output** override, but the supported wrapper always selects the durable repository output. Neither the developer's native checkout nor original chat attachments nor prior `/private/tmp` files are required by the executable proof path. Final requirement dispositions retain the exact requested section text so the titles-only requirement index does not depend on attachment access.

Run database suites sequentially so unrelated fixture construction does not distort performance measurements. Fixture creation has a separately labeled maintenance allowance; score/recovery statements remain1second and worker statements5seconds. Reproducing hundreds of thousands of historical records can take minutes. Extending fixture setup does not extend operational statement limits.

```sh
node tools/reliability/run-phase2c-tests.mjs recovery
node tools/reliability/run-phase2c-tests.mjs annual
node tools/reliability/run-phase2c-tests.mjs deadlock
node tools/reliability/run-phase2c-tests.mjs delivery
node tools/reliability/run-phase2c-tests.mjs worker-lock-order
node tools/reliability/run-phase2c-tests.mjs calcutta-lock-order
node tools/reliability/run-phase2c-tests.mjs net-owner-lock-order
node tools/reliability/run-phase2c-tests.mjs worker-failure-lock-order
node tools/reliability/run-phase2c-tests.mjs delivery-index-review
node tools/reliability/run-phase2c-tests.mjs worker-history
node tools/reliability/run-phase2c-tests.mjs canonical
node tools/reliability/run-phase2c-tests.mjs derived
node tools/reliability/run-phase2c-tests.mjs index
node tools/reliability/run-phase2c-tests.mjs phase1-sql
node tools/reliability/run-phase2c-tests.mjs finite
node tools/reliability/run-phase2c-tests.mjs full-sequence
node tools/reliability/run-phase2c-tests.mjs backlog-pressure
node tools/reliability/run-phase2c-tests.mjs backlog-tail
node tools/reliability/run-phase2c-tests.mjs annual-admission
```

Every runner emits a machine receipt and raw TAP under `evidence/`. It captures transitive local source/data dependencies and fails if source changes during its run. Computed imports and explicit generated-fixture roots are disclosed; this is not a proof of every arbitrary runtime import or every installed dependency byte. Do not edit source while proofs are executing. Preserve old artifacts before intentionally rerunning; a later failure takes precedence over an earlier passing run until understood. The Node parent/subtest count is not a count of unique requirements. The delivery suite includes actual process death during calculation, before completion and after result write for all three automatic families; the during-calculation hook is test-only, conditional, source-hashed and never enabled by the shipping worker.

```sh
node tools/reliability/benchmark-phase2c.mjs --mode baseline --kind common
node tools/reliability/benchmark-phase2c.mjs --mode baseline --kind eligible
node tools/reliability/measure-phase2c-locks.mjs baseline
node tools/reliability/benchmark-phase2c.mjs --mode candidate --kind common
node tools/reliability/benchmark-phase2c.mjs --mode candidate --kind eligible
node tools/reliability/benchmark-phase2c.mjs --mode candidate --kind recovery
node tools/reliability/measure-phase2c-locks.mjs candidate
node tools/reliability/run-phase2c-tests.mjs phase2c-unit
node tools/reliability/run-phase2c-tests.mjs foundation
node tools/reliability/run-phase2c-tests.mjs application
node tools/reliability/run-phase2c-tests.mjs build
```

The broad application suite is expected to return failure while its26known baseline tests remain failing. Compare exact failure identities and normalized diagnostics against the retained unchanged493-file baseline; do not change the runner to exit successfully merely because the count matches. Build PASS proves compilation only.

Run the actual retained Swift model decoder after the recovery suite:

```sh
node tools/reliability/native-never-again/decoder/run.mjs
```

The Swift model harness and its command/source provenance are retained under `tools/reliability/native-never-again/decoder/` and `evidence/native-decoder-proof.json`. Run it against the current recovery DTO artifact; the fixture SHA must match. It uses retained models unchanged, under an explicit UTC compatibility condition, and does not run a phone or simulator.

Run the additional artifact-gate unit tests directly (its hyphenated filename is not discovered by Python unittest's module-name filter):

```sh
python3 test/reliability-phase2c-certification-gate.test.py -v
```

First generate the measured score comparison. This command prints JSON to stdout; the redirection is required to create the file consumed by the combined gate. A FAIL/PARTIAL still writes its truthful result and returns nonzero; do not suppress that exit result.

```sh
node tools/reliability/phase2c-performance-gate.mjs docs/reliability/phase2c/benchmark-baseline-common.json docs/reliability/phase2c/benchmark-candidate-common.json docs/reliability/phase2c/benchmark-baseline-eligible.json docs/reliability/phase2c/benchmark-candidate-eligible.json > docs/reliability/phase2c/performance-gate.json
```

Only after the required runtime artifacts and measured comparison exist, run the combined read-only evaluator:

```sh
python3 tools/reliability/phase2c-certification-gate.py --output docs/reliability/phase2c/certification-gate.json
```

The performance artifact gate takes four local JSON files: baseline common, candidate common, baseline eligible, candidate eligible. The combined artifact gate additionally validates the recovery benchmark, worker/history, backlog, timeout, lock/index and current-source evidence it names. It does not by itself adjudicate the full recovery/Swift/full-sequence/application/build proof package; those runtime receipts remain required by the final engineering certification and proof matrix. Both thresholds and proof limits are explicit; neither approves hosted capacity or Production deployment.

Do not execute `run-score-derived-worker.mjs` as a proof shortcut. That is the deployable process entrypoint and accepts the application's configured authority. Local tests use the owned-fixture adapter and separate child harness instead. Hosted installation requires a separate owner-authorized task.


## Reproducing evidence versus authoring the final decision

The permanent commands above reproduce the local tests, benchmark inputs, comparisons, retained Swift decoding and the specific machine artifact gate without a temporary authoring script. `annual-admission` writes wrapper `evidence/annual-admission-run.json`; other suite wrapper names match their command. Detailed outputs and their proof limits are named in the evidence index. The worker-history suite runs all32 branches, but captures nested plans only at1×/10×;2×/5× remain explicitly timing-only. Final-ready/index counterfactual plans cover only the two `none` extreme profiles.

The machine gate is deliberately narrower than overall Phase2C certification. It does not replace engineering review of query/index necessity, security, exact known broad-test failures, proof-layer applicability, or all314 requested sections. The final durable `evidence/application-comparison.json`, `evidence/final-review.json`, requirement dispositions and reports record those adjudications with exact input hashes. Refresh them from the new artifacts if making a new claim; never copy a historical approval or change a result solely to obtain PASS. Report-authoring scripts used during this investigation were conveniences, not required executable inputs or independent proof. A fresh reviewer can apply the documented evidence/proof matrix and record a new engineering decision; owner acceptance and hosted/Production authorization remain separate.

The tests regenerate their databases and fixtures without manual data surgery. They overwrite the named current evidence outputs; preserve the original candidate receipt set first if comparing runs, and retain a new failure rather than restoring an older PASS. An interrupted process may leave its own temporary cluster. Identify only that exact owned directory and process before cleanup; never kill or remove unrelated developer/provider databases. Rerunning proofs changes evidence files in the disposable checkout; the requested final clean worktree is established after reviewed artifacts are committed, not by discarding failed evidence.
