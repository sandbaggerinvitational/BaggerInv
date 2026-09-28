# Reproduce Phase 2 safely

Use this isolated branch and the exact Phase 1 base `184b5c65a8e63784e1af8d38121fa2e16a015628`. Requirements: Node26.7.0/npm11.19.0 used here, PostgreSQL17.11 local binaries, available disk, non-root PostgreSQL user. `npm ci` installs the locked dependencies; this execution used the existing offline cache. On other hosts set `BAGGER_RELIABILITY_PG_BIN` to an absolute local PostgreSQL17 binary directory. No Supabase/Vercel credentials or live database are needed.

The inherited harness creates a uniquely owned temporary cluster, disables TCP listening, connects only through its owned Unix socket, checks PostgreSQL17, removes inherited database targets, and rejects unowned cluster objects. It installs source migrations plus explicitly documented historical repairs and synthetic runtime prerequisites. It never accepts a database URL. Setup directly inserts synthetic fixture rows only; measured score writes use the installed canonical RPC.

Run SQL suites **sequentially**. On this macOS host System V shared-memory identifiers are limited; several unrelated existing clusters were left untouched. Never clean another task's database or IPC segment. Each harness stops/removes only its own cluster in `finally`. A failed launch should be diagnosed, not bypassed with a remote database.

## Behavioral proof

From repository root:

```sh
BAGGER_PHASE2_PROOF_OUTPUT=docs/reliability/phase2/evidence/score-proof-after.json node --test test/reliability-phase2-score-proof.integration.test.mjs
BAGGER_PHASE2_DERIVED_OUTPUT=docs/reliability/phase2/evidence/derived-proof-after.json node --test test/reliability-phase2-derived-proof.integration.test.mjs
BAGGER_PHASE2_MIGRATION_OUTPUT=docs/reliability/phase2/evidence/migration-safety.json node --test test/reliability-phase2-migration-safety.integration.test.mjs
BAGGER_PHASE2_ELIGIBLE_MODE=candidate node --test test/reliability-phase2-eligible-history.test.mjs
node --test test/reliability-phase2-fence-history.test.mjs
node tools/reliability/certify-phase2-foundation.mjs unit
node tools/reliability/certify-phase2-foundation.mjs sql
```

The eligible and fence suites emit structured diagnostic JSON; preserve it with the test-run receipt. Do not claim a run if extraction or assertions failed. Baseline score proof uses `BAGGER_PHASE2_CANDIDATE_SQL=BASELINE` with a separate output filename. Baseline eligible uses `BAGGER_PHASE2_ELIGIBLE_MODE=baseline`. Do not overwrite retained historical Phase 1 evidence. The older candidate-v1 directory is retained comparison evidence, not current proof.

## Performance

Run one benchmark process at a time, without other task test/build workloads. Unrelated host activity cannot be fully excluded and remains a limitation.

```sh
node tools/reliability/benchmark-phase2.mjs --mode after --samples 1000 --scales 1,2,5,10
node tools/reliability/benchmark-phase2-eligible.mjs after
node tools/reliability/measure-phase2-locks.mjs after
node tools/reliability/phase2-performance-gate.mjs docs/reliability/phase2/benchmark-before.json docs/reliability/phase2/benchmark-after.json docs/reliability/phase2/eligible-history-before.json docs/reliability/phase2/eligible-history-after.json
```

The corresponding `before` modes install the exact Phase 1 schema and produce a separate before artifact. Archive an existing artifact before intentionally replacing it. Common samples use validated actual RPC and rollback,1000 per scale; eligible uses8states×4scales×30. Lock samples100perbranch record bounds rather than exact COMMIT release. Raw sample arrays permit independent percentile/variance verification. The gate checks all required scales/branches/provenance and leaves `approved:false`.

## Application/build comparison

```sh
node tools/reliability/run-phase2-application.mjs candidate
node tools/reliability/certify-phase2-foundation.mjs build
```

For baseline comparison set `BAGGER_PHASE1_BASELINE_ROOT` to an existing clean checkout at the exact Phase 1 SHA, then run the application runner with `baseline`. It asserts the SHA and executes the retained493-file manifest. Remote sockets are denied and service credentials removed from child environments. The broad baseline has26 known failures; compare failure identities/diagnostics, not totals alone. The new Phase 2 suites are separate.

All disposable databases reset/reseed deterministically; full-round proof intentionally retains state from R1 through R3. A Phase 2 helper hashes the full mutation seed/key because the old short deterministic-UUID helper can collide for long new seeds. It does not rewrite historical fixture evidence. Real Auth/provider/runtime admission is substituted explicitly and must be certified later in isolated hosted staging.

No command here deploys, creates a release, targets Production, sends a notification, creates a real session, or loads real participant/financial data. Do not substitute real credentials or a remote URL to make a local test pass.
