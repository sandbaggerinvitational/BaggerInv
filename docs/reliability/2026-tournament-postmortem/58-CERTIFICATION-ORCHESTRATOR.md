# Automated certification orchestrator


Inputs: candidate SHA, changed-file/function/schema manifest, explicit semantic dependency declarations, target tournament/fixture version, supported native versions and infrastructure profile. Output: required suites, executed results, proof-layer ledger, impacted requirements, outstanding physical tests, readiness decision and evidence manifest.

Modes: FAST CI (targeted deterministic tests); FULL RELEASE (SQL/API/security/performance/staging); TOURNAMENT DRESS REHEARSAL (full chronology/failures/scale); PHYSICAL ACCEPTANCE (human/device evidence intake); POST-DEPLOYMENT SMOKE (bounded nonmutating current reads); TOURNAMENT HEALTH (small current snapshot). Environment capability tokens prevent a heavy mode targeting Production.

Algorithm: resolve impact graph→close transitive requirements→check current valid evidence→schedule missing automated layers→retain all failed runs→collect physical evidence explicitly→validate manifest→generate claims from required proof completeness. Unknown file/function ownership is an explicit manual review gate. Artifact signatures/checksums identify exact candidate; no arbitrary AI confidence upgrade.

No release candidate can report TOURNAMENT READY with a P0 FAIL/NOT TESTED/NOT PROVEN, unaccepted noncritical limitation, unresolved canonical conflict or insufficient capacity. Claim generator prints layer-specific status when aggregate readiness is blocked. Operator may approve scope/limitations but cannot relabel missing physical proof PASS.

Every orchestrator automation itself requires wrong-trigger, stale-candidate, duplicate execution, cancellation, concurrent release, failed artifact upload and evidence-forgery/role-denial tests. Store reports independent of the primary database so a DB outage does not erase diagnosis.
