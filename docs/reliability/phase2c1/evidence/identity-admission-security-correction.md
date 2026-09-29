# Identity admission security correction

PROVEN — local UNIT/injected evidence. A requested but invalid Production-shadow candidate could report `eligible:false` while remaining `blocked:false`, `resolved:supabase`, and `participantAuthEnabled:true` when ordinary Preview credentials were otherwise valid. Administrative admission also ignored blocked/invalid identity selection and Auth/database origin mismatch.

The seven new behavioral tests reproduced six failures before correction. They prove the failure class rather than relying on source text. Artifacts: [before](identity-admission-before.tap.gz), [after](identity-admission-after.tap), [structured receipt](identity-admission-security-correction.json).

`participantIdentityAuthorityEnvironment` now derives blocked state from the selected authority's eligibility. Requested candidate failure cannot fall through to ordinary Preview; participant Auth enablement respects blocked state; candidate diagnostic reason remains explicit. `assertParticipantIdentityAdministrativeEnvironment` uses the same required authority guard before any operation-specific branch.

After correction the new7 tests and existing21 Director/participant tests pass: **28 passed /0 failed /0 skipped**. Verified: invalid requested candidate denied before claims, entitlement, Passport or canonical context; unknown/retired authority and Auth-origin mismatch denied before administrative/Auth-client construction; valid ordinary Preview remains supported without Google configuration. No operation permission allowlist, Production activation gate, canonical scoring rule, RPC, or native code changed.

This fixes an actual candidate admission defect, not an obsolete assertion. Source files were frozen after focused verification for the parent's source-stable broad run. Full broad/build evidence, isolated Director replacement and hosted/Production proof remain separate.
