# Final broad regression adjudication

**Final broad suite: FAIL. Overall Phase2C.1: PARTIAL; candidate advancement stopped.**

| Run | Tests | Passed | Failed | Source stable |
|---|---:|---:|---:|---|
| Preserved Phase2C baseline |4,153|4,127|26|Preserved baseline|
| First retirement diagnostic |4,153|3,947|206|NO|
| Second retirement diagnostic |4,159|3,968|191|NO|
| Final retirement run |4,159|3,971|188|YES|

Final receipt: [application.json](application.json); raw [application.tap](application.tap.gz). All188 final failure identities are mapped in [application-failure-adjudication.json](application-failure-adjudication.json). No raw diagnostic was replaced by this classification.

All26 baseline failure identities remain: **0 resolved baseline identities**. Nineteen have the same bounded error signature; seven fail at a different assertion/source blob. Six of those seven are historical byte-preservation fences now stopping at a different changed file. The seventh is the shared scorecard consumer test, now stopping at the Records import/source expectation before the previously failing player-history assertion. They are not26 proven unchanged root causes.

There are **162 additional final failure identities** relative to baseline. None is new outside the previously adjudicated211-identity union. Of that earlier union,22 exact test identities now pass and1 Passport-bootstrap success test was rewritten as denial. Rewriting a retired assertion receives no old-behavior PASS credit.

## Final classification

| Classification | Final failed identities |
|---|---:|
| BASELINE_FAILURE_IDENTITY_UNCHANGED | 26 |
| FIXTURE_UPDATE_REQUIRED | 18 |
| RETIRED_GOOGLE_EXPECTATION | 116 |
| RETIRED_BINDING_CAPABILITY_PROOF_REQUIRED | 11 |
| ASSERTION_CONTRACT_UPDATE_REQUIRED | 14 |
| UNRESOLVED_RESTRICTIVE_CANONICAL_ROUTING_OR_PROOF_GAP | 3 |

These are review dispositions, not passing tests. The116 retired Google expectations include only the exact retired provider bindings/defaults/route actions; mixed tests still retain canonical functionality, authorization, audit, scoping, privacy and negative cases. Eighteen stale fixtures still require admission-correct test data. Eleven Director capability bindings require a real canonical replacement. Fourteen diagnostic/source-shape assertions need narrowly verified updates. No entire test file is waived.

## Three remaining restrictive canonical routing/proof gaps

1. `all migrated candidate selectors resolve only certified Production shadow reads`: current selectors return unavailable for the former special Production-shadow read tuple. This is an availability/retained-contract question, not an observed authorization expansion.
2. `candidate can never acquire Odds publication authority`: its required read-positive assertion fails before publication-denial assertions. It does not demonstrate publishing was enabled, but the intended security case is not proven at the admitted read layer.
3. `representative candidate Supabase services fail closed with zero Google fallback`: canonical History rejects configuration before injected outage. This is not successful outage-injection proof.

The final side-game test previously classified as unresolved passes Net Skins empty-state checks and then fails only its explicit Google Calcutta rollback expectation; classification corrected with line218 evidence. The nested runner full TAP identifies its sole inner failure at line434: an exact `criticalWafEpochId` source assertion on the terminal410 retired Google fence route. It is not a demonstrated ACL bypass. The initial diagnostic uncertainty is preserved in JSON alongside this refinement.

## Scope of closure

P0-B is **PASS at its scoped local non-Production worker layer**: remaining required automatic families are Calcutta internal maintenance, Competition and Intelligence; Google is N/A—RETIRED. See [P0-B recertification](../P0-B-RECERTIFICATION.md). That worker result does not repair isolated Director functionality, prove annual initialization, or make the broad suite baseline-equivalent. Overall retirement stays PARTIAL.

No app/lib/test/tools source changed during this final adjudication. No new tests or provider/database actions were run. The separate7-test fail-closed identity fixture is included in focused security evidence, not added to the fixed4159 broad selection.
