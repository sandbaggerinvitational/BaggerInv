# Certification finite timeout proof

**PASS — scoped local PostgreSQL/RPC/in-process server proof.** [Final131–152 evidence](implementation-evidence/finite-timeout-matrix-2026-10-03T02-26-09.590Z.json):11/11 tests,10 actual cancellation cases, sourceStable=true. The owned cluster was destroyed; process exit0. No hosted, Production or Google access.

The fixture uses PostgreSQL `statement_timeout=150ms`, with local fault triggers or a held local table lock. Every injected case returns actual SQLSTATE57014 and leaves the observed canonical rows, receipt, lease, audit and publication state unchanged for that transaction. Observed cancellation calls take168.4–181.7ms including local process/readback overhead; this is not a production latency measurement.

| Boundary | Actual proof |
|---|---|
| Ingress admission | Required admission audit stalls; no lease or audit persists. Status stays UNKNOWN, not falsely NOT_COMMITTED. Same operation then admits once and commits. |
| Canonical setup execution | Receipt insertion and terminal audit stall in separate cases; mutation rolls back. Existing admitted identity becomes UNKNOWN, retries safely and returns the retained committed result. |
| Recovery terminalization | Explicit resolution audit stalls; UNKNOWN remains unresolved. Same identity resolves NOT_COMMITTED through the existing fence; delayed execution cannot commit. |
| Canonical score execution | Actual SCORING.SUBMIT_HOLE stalls at terminal audit after its write. Score, match, score receipt, audit and required intents roll back. Same lease/operation retries and replays exactly one committed hole. |
| Required derived delivery | A real intent-table lock cancels delivery. Previously committed score remains committed; the actual shipping worker drains required work after lock release. |
| Odds claim | Job RUNNING transition cancels atomically; same request receipt and job recover through the actual engine. |
| Odds checkpoint | Real engine checkpoint cancels; persisted progress/result remains consistent and the same job resumes. |
| Odds completion | Completion transaction cancels; no partial result or publication appears. Same job resumes and completes. |
| Explicit owner publication | Required publication audit cancels; snapshot, current pointer, receipt and audit roll back. Status is UNKNOWN. Same operation retries once, then duplicate replay returns the same publication. |

The test is `test/reliability-phase2dr2-timeout-matrix.integration.test.mjs`. It uses supported runtime RPCs and server/engine code, with only transport redirected to the owned socket-only fixture. Required automatic work is genuinely processed; no success, receipt or ready state is seeded.

## Preserved counterevidence

[Run1](implementation-evidence/finite-timeout-matrix-2026-10-03T02-24-40.233Z.json) passed the first five cancellation cases, then the worker fixture was rejected22023 before reaching its injected lock because it omitted the existing required `materialization_family`. The fixture now supplies COMPETITION exactly as133 and the shipping adapter require. No runtime validation or timeout was changed. The failed artifact remains retained.

## Limits

This proves local database cancellation/transactional recovery, not hosted HTTP timeouts, provider capacity or physical devices. PostgreSQL statement timeout does not bound JavaScript calculation CPU; the Odds proof covers its actual persistence claim/checkpoint/completion boundaries. Worker and engine durations are functional evidence, not benchmark results. No clock, lease expiry, retry readiness or historical authority timestamp is rewritten. Broad regression and the other certification layers remain separate.

## Final adapter source-impact retention

The later frozen Calcutta change is limited to validating a nonempty Certification claim against existing133/141 response fields. This receipt did not execute that configured claim branch; its recorded source hashes remain unchanged historical evidence. The exercised domain paths remain valid by the [final source-impact review](SOURCE-SAFETY-AUDIT.md). Actual configured initial Calcutta processing is separately proved6/6; no configured future Calcutta runtime is inferred.
