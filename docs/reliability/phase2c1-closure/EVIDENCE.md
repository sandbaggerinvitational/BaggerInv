# P0-F current evidence index

Status **PASS at the required non-Production layer**, local candidate on base`7b6ca99510dc2f44cc411bfe7769e7f0c05ed962`. [Final machine-readable index](evidence/p0f-approved/final-index.json) records current receipts and hashes. Older `evidence-ledger.json`, original `evidence/*.json` and test-accounting reports describe the pre-approval7b6 checkpoint; they are preserved, not silently rewritten. This addendum is authoritative for current P0-F status.

| Suite | Verdict | Total / pass / fail / skip | Artifact |
|---|---|---|---|
| context | PASS | 1 / 1 / 0 / 0 | [receipt](evidence/p0f-approved/context.json) |
| setup | PASS | 10 / 10 / 0 / 0 | [receipt](evidence/p0f-approved/setup.json) |
| financial | PASS | 17 / 17 / 0 / 0 | [receipt](evidence/p0f-approved/financial.json) |
| capabilities | PASS | 10 / 10 / 0 / 0 | [receipt](evidence/p0f-approved/capabilities.json) |
| api | PASS | 38 / 38 / 0 / 0 | [receipt](evidence/p0f-approved/api.json) |
| workspace | PASS | 17 / 17 / 0 / 0 | [receipt](evidence/p0f-approved/workspace.json) |
| routing | PASS | 42 / 42 / 0 / 0 | [receipt](evidence/p0f-approved/routing.json) |
| retirement | PASS | 45 / 45 / 0 / 0 | [receipt](evidence/p0f-approved/retirement.json) |
| security | PASS | 84 / 84 / 0 / 0 | [receipt](evidence/p0f-approved/security.json) |
| release | PASS | 2 / 2 / 0 / 0 | [receipt](evidence/p0f-approved/release.json) |
| annual-create | PASS | 2 / 2 / 0 / 0 | [receipt](evidence/p0f-approved/annual-create.json) |
| full-sequence | PASS | 1 / 1 / 0 / 0 | [receipt](evidence/p0f-approved/full-sequence.json) |
| finite | PASS | 7 / 7 / 0 / 0 | [receipt](evidence/p0f-approved/finite.json) |
| recovery | PASS | 50 / 50 / 0 / 0 | [receipt](evidence/p0f-approved/recovery.json) |
| delivery | PASS | 54 / 54 / 0 / 0 | [receipt](evidence/p0f-approved/delivery.json) |
| deadlock | PASS | 10 / 10 / 0 / 0 | [receipt](evidence/p0f-approved/deadlock.json) |
| annual | PASS | 26 / 26 / 0 / 0 | [receipt](evidence/p0f-approved/annual.json) |
| harness | PASS | 3 / 3 / 0 / 0 | [receipt](evidence/p0f-approved/harness.json) |
| application | FAIL | 4097 / 4077 / 20 / 0 | [receipt](evidence/p0f-approved/application.json) |
| build | PASS | Local compilation | [receipt](evidence/p0f-approved/build.json) |
| read-adapters | PASS | 112 / 112 / 0 / 0 | [receipt](evidence/p0f-approved/read-adapters.json) |

Counts include Node parent tests; suites overlap and must not be summed as unique coverage. Annual CREATE has21 behavioral cases under 2 runner tests. Protected equivalence has4 setup/control + 3 financial internal comparisons, not7extraNode tests. Seven Director identities are within capabilities 10. Fullsequence is432 canonical holes under 1 test. The CREATE helper's schema 127 identifies its contract; the enclosing receipt/manifests installthrough 130.

| Claim | Source/test/artifact | Layer and limitation |
|---|---|---|
|Exact independent context|128, isolated server/API, context/API tests|POSTGRESQL/SECURITY; inert owner-installed binding, synthetic Auth transport|
|Same canonical setup/control|130, setup fixture, seven-chain integration|POSTGRESQL/API;2026scoped, no broaderRound Controlcertification|
|Reduced financial authority/provenance|129, financial fixture/results|POSTGRESQL/FAILURE/CONCURRENCY; only3 approved mutations|
|Private-core privilege/dependency|context/setup/financial catalog results|Owner/ACL/searchpath/OID/textual/cachedcall proof; not hosted|
|Protected wrapper equivalence|protected-equivalence.json +release receipt|Original guards installed;4+3internalcases on syntheticprotectedfixture|
|Unknown response containment|actual client/API/workspace/status|OriginalUUID/token retained; absentreceiptUNKNOWN; browsercrashpersistencenot proven|
|Read routing|routing receipt + required failure in read-adapters.json|All3original selector cases PASS; actual History transport RED; Prediction fail-closed correction PASS|
|P0 A–E|recovery/delivery/annual/deadlock/finite|Retained current scoped evidence; relevant dependency hashes unchanged after the final read correction, no Google reinstatement|
|Whole synthetic sequence|revalidation/phase2c/full-sequence-results.json|432/24; preparedLivefixture, nofull chronology/power-loss claim|
|Test-accounting integrity|P0F-TEST-ACCOUNTING-ADDENDUM.md and final freshness comparison|493 files / 4,097 tests,2added0 deleted;20 full baseline diagnostics unchanged|

Each suite stores start/end, executionHEAD, implementationSourceManifest, static/dynamicdeclared sourceProvenance, rawTAPSHA256, stable-source result and explicit limits. [Freshness audit](evidence/p0f-approved/evidence-freshness.json) distinguishes the relevant dependencies from unrelated global source deltas. The setup catalog narrative's `/private/tmp` development snapshot is only supporting development evidence; final setup 10/10 independently asserts catalog properties. Failed development release and first broad/build attempts remain separately preserved.

All results are LOCAL / NON-PRODUCTION. Node remote sockets are denied and provider credentials removed. Synthetic identities/session transport are explicit test seams; the installed PostgreSQL actor, domain, receipt and audit enforcement is exercised. The protected fixture uses the original runtime guards, not Production. Browser/hosted Auth and physical-device proof remain NOT PROVEN. Virtual component tests do not certify browser usability. Unknown-outcome handles are retained in memory; tab/browser-crash persistence is not certified. No new performance or Production capacity claim is made.

Production queried/mutated/deployed/configured: NO. Staging deployed: NO. Real Google accessed/changed: NO. Google credentials changed: NO. Real competitive data changed: NO. Native shipping source changed: NO. Build 11 implemented: NO. No infrastructure change. The final candidate is the enclosing Git commit containing this report; per-run base SHA and source manifests identify executed bytes. No hosted/staging or Production action is authorized by local PASS.

Final hygiene: [source-hygiene.json](evidence/p0f-approved/source-hygiene.json) records zero detected credential patterns, unchanged native/package/deployment configuration, unique migration IDs and the reviewed scope of the approved adapter changes. All task-owned PostgreSQL clusters were cleaned up; unrelated pre-existing processes were left untouched. The staged source/document whitespace check excludes only verbatim TAP evidence and the preserved rejected-proposal unified diff, whose literal whitespace and hashes remain intact. The full raw check reports those explicit evidence-format warnings; it is not represented as warning-free. The new helper EOF formatting correction changed no function body and its four affected suites were refreshed.

## Approved History/Prediction extension and final History RPC correction

Prior PARTIAL routing/broad/build/retirement receipts remain under `pre-read-extension/`; the subsequent required-red actual-History result remains under `pre-history-rpc/`. Direct before/after characterizations retain the original failure instead of rewriting it. The exact owner-approved History RPC correction carries only the validated diagnostic bit and reuses its existing certified alias; no allowlist or role change.

The new focused adapter inventory is 55 tests: original 44 identities retained plus 11 actual service/adjacent-reader/compatibility cases, zero deleted or renamed. These supplement 57 existing tests, giving 112/112 PASS. The frozen 493-file broad selection remains 4,097 tests: 4,077 PASS / 20 unchanged baseline failures. Broad and focused suites overlap and are not summed into a unique total.

The service test runs real History, Guide and leaderboard readers, translators, builder and sanitizer against synthetic wire payloads; adjacent completed-history and player-editorial readers also execute their mapped paths. No reader/sanitizer dependency replacement is used for the positive History service test. Protected selector fixtures are synthetic data and all transport is mocked under the remote-socket guard. No Production request is made. Role hints never grant privileged inspection; signed-out public History itself is not improperly reclassified as forbidden.

Retained PostgreSQL, full-432 and A–E evidence has unchanged relevant source dependencies, verified by the freshness audit. The fresh adapter, routing, security, retirement, application and build receipts cover affected source. Historical performance evidence remains qualified; no new benchmark or capacity claim is made.
