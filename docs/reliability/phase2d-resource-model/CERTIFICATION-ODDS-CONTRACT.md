# Certification Odds implementation contract

Status: scoped local Odds implementation proof PASS on131–152. Full program and
hosted certification remain separately governed.

## Final local131–152 refresh — 2026-10-03

**PASS at the stated local layers:** expanded Certification27/27, two-part
freshness9/9, exact same-result publication11/11, protected calculation and
no-adoption denial2/2: **49/49, zero failures/skips**. The combined consumed-source
manifest is unchanged before/after. Evidence:
[final152 receipt](implementation-evidence/odds152-proof-receipt.json) and
[source manifest](implementation-evidence/odds152-run-source-receipt.json).
The run executes the real Director API, calculator,112 expanded RPCs, two
independent databases and concurrency/atomicity/recovery negatives. Original
149/150 counterevidence and successful receipts remain preserved.

Positive historical Production publication/adoption remains **NOT PROVEN**.
The protected test proves actual canonical calculation/replay and unchanged
missing-adoption rejection; it does not manufacture historical evidence. These
local results do not certify hosted operation or Production.

The 2026-10-02 owner extension resolves the publication approval boundary recorded in `CERTIFICATION-ANNUAL-PUBLICATION-BLOCKER.md`. Its observed counterevidence remains preserved. The approved correction adds separate Certification admission to the existing canonical calculator and publication business logic. It does not borrow Production activation/provider authority or change annual CLOSE/Final Recap eligibility.

The existing Director Odds route gains an additive Certification-only context contract. Reads return the current context token and the actual publication CAS state. A mutation requires the server-bound active, non-impersonating Director, a stable operation UUID and the expected context token. Publication additionally requires explicit confirmation, a completed exact calculation and the expected publication revision/snapshot. Fresh authority is `NEVER_PUBLISHED`, revision zero, null snapshot. No historical adoption is fabricated.

Calculation uses the existing deterministic engine, durable claim/checkpoint/retry/result protocol and hashes. Its resource provenance is `CERTIFICATION`. Successful calculation never publishes. Workers can claim/checkpoint/complete/fail but cannot invoke owner publication. The explicit owner publication commits the canonical snapshot/current pointer, job status, operation receipt and required audit atomically. Transport loss means UNKNOWN until an exact operation receipt proves COMMITTED; absence alone does not prove rollback. Retries retain the same operation identity and original CAS.

Actor, resource, project, deployment, release, generation and target authority come from server authentication and validated registration/context. Client JSON cannot supply privileged identity. Domain errors retain their meaning. Missing context fails closed; stale context conflicts. Existing Production and legacy Preview request/response behavior remains unchanged; score DTOs and native shipping source do not change. No new role, fallback, worker subsystem or SaaS is introduced.

Runtime/database proof must cover exact admission, ACL/owner/search path/dependencies, first and later CAS, same-operation replay/conflict, lost acknowledgements, process restart, atomic audit, private-result confinement, resource isolation, release/annual fencing and the actual publication → Final Recap → close chronology. The final bootstrap and application boot will be rerun only after the complete forward profile is fixed.

No hosted resources, Production/legacy Preview/Google access, real messages, deployment or external configuration are authorized by this implementation contract.
# Receipt recovery across annual advance

The client retains the reviewed `operationTournamentId` with its stable operation UUID. This is an untrusted receipt selector, never resource or actor authority. New calculation/publication requests must match the currently admitted tournament. Status may refer to the original tournament after annual advance; the existing SQL recovery contract independently requires the same server-verified actor, exact installed resource, original tournament entitlement/link/role and exact operation receipt. Wrong actor or unauthorized historical target is denied. No receipt scan across resources or years is introduced. Older callers omitting the additive field retain current-target behavior. Production and score DTOs are unchanged.

This implements the approved resource-aware recovery requirement: a committed predecessor publication must not become an apparent unknown successor operation merely because the current pointer advanced. It does not allow new writes to the predecessor or reactivate historical authority.

## Retained snapshot guard resource dispatch — forward149

**PROVEN — LOCAL counterevidence:** release run6 reached a real second explicit owner publication and failed with `P0002` in057 `guard_odds_snapshot_immutability`: its authority lookup requires the Production `resource_scope` row that Certification correctly does not possess. Evidence remains in `implementation-evidence/release-transition-2026-10-03T01-14-48.807Z.json`. First publication had not exercised this row-update trigger because no predecessor snapshot existed.

This is the explicitly approved R2 ordinary defect class: a Production-only pointer retained in a Certification path. The minimum correction replaces only the authority lookup with exact resource dispatch. A Certification update requires the local registered Certification resource, trusted current Director context, same resource/installation/project/target and an intact existing Certification snapshot binding/fingerprint. The guard then applies **every existing immutable-field and retired-Google predicate verbatim** with canonical Supabase authority. The original Production lookup remains the other branch. It does not fabricate a Production row or give a role new privileges.

The publication core already changes only the two existing current-selection flags on the prior snapshot; this correction enables that unchanged operation to reach its existing immutable checks. Historical payload, result/source/provenance, actor, timestamp, financial facts and Google metadata remain protected. Retained snapshot release/generation provenance is preserved, not rewritten to the new release. Existing function/trigger identity, owner, ACL, security mode, search path and stored dependencies must remain identical. A new publication still requires the current canonical job, explicit Director action, first/later CAS and transactionally consistent receipt/audit. Runtime proof must cover a genuine second publication, immutable and Google-metadata failures, missing/wrong context/resource denial and unchanged Production behavior. No hosted or Production access is involved.

**PROVEN — LOCAL runtime:** `implementation-evidence/odds149-proof-receipt.json` records27/27 expanded Certification tests plus2/2 protected wrapper tests on131–149. The actual second publication, rollback, all listed guard negatives and unchanged protected calculation/no-adoption rejection pass. No positive historical Production publication is inferred.

**Rollback limitation:**149 is an in-place function-body correction with no data migration or new object identity. An application rollback retaining the corrected database guard can continue using the existing143 transaction context and snapshot binding contract. Reverting the guard itself to057 restores the demonstrated second-Certification-publication failure; it is not a usable rollback for that capability. Retain the forward guard and all historical snapshots/receipts. This is the149-specific consideration, not certification of a whole-candidate downgrade across148's separate input contract.

## Full-source publication identity — forward150

The inherited nine-field unique publication key used the configuration source
fingerprint. A real score advance could therefore produce a fresh calculation
with the same numerical result and collide on publication. Release run7's23505
counterexample remains preserved. The complete owner approval already permits a
genuine READY result at exact current source with later CAS; it does not require
numerical differences. The scope reconciliation is recorded in
`SAME-RESULT-ODDS-PUBLICATION-APPROVAL-BLOCK.md`.

For new Certification publications,150 uses the versioned hash of the original
configuration source fingerprint plus148's canonical live-source fingerprint as
the stored publication source fingerprint. The immutable source-calculation and
resource-binding JSON retain `publication_source_identity` with its contract,
both component fingerprints and composite fingerprint. Job/configuration
fingerprints retain their original meaning. Existing publication history is not
rewritten. The global index and Production branch stay unchanged; no client role,
publication policy, engine result, public DTO or operation replay rule changes.

**PROVEN — LOCAL:** the focused golden
`NA-CERTIFICATION-ODDS-FULL-SOURCE-PUBLICATION` passes11/11. Real equal-result
10,000-iteration jobs across genuine scoring create revisions1/2 with truthful
different source provenance. Same-source requests do not create duplicate
publications. Atomic receipt failure, actual lost client acknowledgement,
replay/status/conflict, participant projections/freshness, authorization, stale
source and concurrent CAS checks pass. Evidence:
`implementation-evidence/odds-publication-identity-2026-10-03T01-50-45-011Z.json`.
The subsequent full150 expanded Odds/freshness/Production-shaped rerun passes38/38 (27+9+2); `implementation-evidence/odds150-proof-receipt.json` binds its executed source manifest and raw logs. Positive historical Production publication remains NOT PROVEN. Final-profile annual/release/bootstrap/boot certification is separate.
