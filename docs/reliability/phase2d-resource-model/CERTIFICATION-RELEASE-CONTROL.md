> **PASS AT THE SCOPED LOCAL PROOF LAYER — focused release18/18 and complete annual13/13 on131–152. Genuine CLOSED rebind/reenable/ACTIVATE and the original equal-result calculation after source advancement pass. Hosted identity, protected historical Production/provider lineage and program-wide certification remain separate.**

# Certification release control contract

SOURCE finding: RM1 explicitly approves owner-only registration/activation controls and separate exact admitted deployment/release. The implemented initializer refuses a changed release after bootstrap; the only other control toggles enabled. A supported same-resource release rebind is absent. This is the proposed bounded implementation of that already-approved control, not a new normal-release engine.

## Exact contract

Owner-only private `production_control.rebind_certification_release_v1(input jsonb)`; SECURITY INVOKER, search_path=pg_catalog, EXECUTE revoked from PUBLIC/anon/authenticated/service_role. Same physical singleton CERTIFICATION resource. No Production branch. All runtime callers denied, including otherwise-valid service-role callers.

Request: contract_version=`certification-release-rebind-v1`; stable operation_request_id UUID; exact current resource tuple; expected_admission_revision; expected old release_commit/deployment_id/deployment_origin; expected current tournament/pointer revision/authority epoch/ingress generation; new release_commit/deployment_id/deployment_origin; reason. The new deployment class must be Preview. Team/project/branch/schema/registry/binding/governance/epoch/pointer/generation/capabilities are not editable.

Admission MUST be explicitly disabled via the existing owner-only control first. Acquire existing exclusive scoring_admission_lock_key before reading/rechecking resource/admission/pointer/generation. This waits out active canonical executions. A queued old request resumes against changed release/admission token and fails closed. No lease is rewritten or silently terminalized. Previously admitted and unknown operations remain durable/recoverable through the new exact deployed envelope plus original actor/operation identity. Old deployment envelopes are denied.

One transaction: validate exact CAS and generation/closure/drain -> update only release/deployment/origin and increment admission_revision -> atomic existing operation_audit_events receipt. No new audit table. Admission stays disabled. No change to activation_revision, authority_epoch_id, binding_id, pointer or durable ingress generation. An actual matching current Certification gate generation takes precedence, including after abort/reopen. Only the untouched origin with its exact resource/installation/project/registration/schema identity, unchanged initial legacy gate shape, no successor and no competing generation may use the origin fallback. CLOSED additionally requires genuine matching canonical closure and drained/fingerprint-valid durable ingress. No timestamp/latest-row discovery grants authority.

The outgoing-release Odds guard examines only the exact Certification resource/installation, current tournament, selected ingress generation, current epoch/pointer and outgoing release. PENDING, RUNNING, RETRYABLE and SUCCEEDED/READY block owner rebind. FAILED, SUPERSEDED/STALE and canonically PUBLISHED history remain retained. There is no expired-lease exception, job adoption, cancellation, relabeling or automatic publication. It is the existing worker/domain protocol that finishes, fails or supersedes work for legitimate reasons; the rebind operation never changes a job.

**Historical before152 limitation:** the original131 owner enable control sets the gate OPEN. Therefore a committed rebind at a genuine CLOSED annual boundary is proved only as terminal maintenance with admission left disabled. The main annual chronology tests this CLOSED branch in a real rollback-contained transaction before genuine ABORT/reopen and activation; it must not pretend that enable preserves PAUSED. OPEN/reopened/activated rebinds may resume normally. The subsequently authorized152 consistency correction is documented below; this limitation describes the preserved pre152 proof, not the corrected candidate claim.

Idempotency: under the same exclusive fence, exact same operation UUID/full normalized request hash returns original audit-contained receipt, even if current revision has subsequently advanced. Same UUID/different request hash conflicts. An idempotent replay cannot change current release. Request hash includes old/new release and all expected context. Missing receipt is UNKNOWN, never NOT_COMMITTED; retry keeps UUID and exact original request. Audit failure rolls back the update. No INSERT/UPDATE grant to runtime roles.

No hosted identity claim: SQL exact strings cannot prove a Vercel deployment's true environment; later owner registration/deployment readback must prove team/project/branch/SHA/Preview identity independently. Local tests use intentionally synthetic identity.

## Focused proof and remaining chronology

Historical counterevidence: active-admission/runtime-role and resource/CAS negatives passed before the valid initial-resource request stopped at `CERTIFICATION_RELEASE_CONTEXT_STALE`. The corrected candidate removes that incorrect null-ID assumption only within the now-approved rule. A subsequent test helper used the wrong snapshot key (`snapshot_id` rather than `id`); another run mixed the new148 adapter with a through144 database and correctly returned `ODDS_CALCULATION_INPUT_INCOMPLETE`. Neither is represented as successful release proof. Both owned databases were destroyed.

**PROVEN — POSTGRESQL/RPC counterevidence on the complete through148 profile:** [release run6](implementation-evidence/release-transition-2026-10-03T01-16-39.561Z.json) passed PENDING/RUNNING/RETRYABLE/READY drain denials and a genuine claimed-worker/shared-fence race. Its second explicit owner publication then failed SQLSTATE `P0002` in057's `production_control.guard_odds_snapshot_immutability`: the trigger still reads the Production-only resource-scope row before a current-pointer-only snapshot update. The first publication had no older row to update. No Production row or false publication was inserted; the owned database was destroyed. The parent task assigned the minimum already-authorized resource-aware guard correction separately. The release test will retain and re-exercise the second-publication requirement, rather than avoiding it to obtain a PASS.

1. Active admission denied, wrong resource/owner/old release/pointer/epoch/generation denied; no effect.
2. Actual disable -> CAS rebind -> exact receipt recovery while fresh context admission remains denied -> explicit reenable -> new-context read and unchanged score DTO/domain behavior.
3. Prior committed score/Director/financial operation recovers using exact origin through new deployment; other actor/resource denied.
4. Prior ADMITTED/UNKNOWN remains unresolved and recoverable; old token cannot execute; no silent new ID or context rebind; explicit fence remains only NOT_COMMITTED authority.
5. Pending worker intents preserve origin; new admitted worker consumes without false Production provenance.
6. Same UUID retry/conflict; audit-insert failure rollback; source/ACL/RLS/owner/search_path.
7. Held mutation makes exclusive rebind wait; after completion rebind succeeds; late old envelope denied.
8. Existing Production release functions and control rows remain byte-/fact-equivalent.

Application compatibility is a separately tested prerequisite, not an input boolean that authorizes unknown code. No replacement registry, migration, provider or new actor role is introduced.


## Full 131–149 focused result

**PROVEN — LOCAL POSTGRESQL/RPC/INTEGRATION/CONCURRENCY/FAILURE INJECTION:** [run9](implementation-evidence/release-transition-2026-10-03T01-35-52.340Z.json) passes 18/18 (17 behavioral cases plus parent), sourceStable=true. It exercises initial OPEN rebind; owner ACL/search_path/security; exact resource/CAS denials; held shared-fence serialization; atomic audit rollback; concurrent same-operation receipt replay and conflicting replay; old-envelope denial; committed score/setup and UNKNOWN recovery while disabled; explicit no-write resolution; fresh Director client metadata mutation after reenabling; actual new-release Odds calculation/publication; unchanged prior receipts and job histories; required automatic worker convergence; and denial of CLOSED generation lacking genuine annual closure evidence. Owned PostgreSQL was destroyed after completion.

**PROVEN — counterevidence preserved:** [run7](implementation-evidence/release-transition-2026-10-03T01-29-40.988Z.json) reaches the corrected 149 snapshot guard but an identical Pre-Tournament 10000 recalculation after live score advancement fails inherited `odds_native_publication_idempotency_idx` (23505). The 148 job identity changes while the legacy publication tuple may remain equal. This is not declared repaired. The focused release proof uses actual supported 10000→25000→50000 owner requests and retains the original failure. No index, source fingerprint, replay or publication policy changed.

[Run8](implementation-evidence/release-transition-2026-10-03T01-32-35.933Z.json) exposed a test prerequisite error: an alleged committed TEAM update was correctly rejected after play started. The passing fixture performs that setup before play and explicitly asserts success, then uses the existing permitted tournament-metadata mutation after release. It does not weaken the canonical started-match dependency.

At the focused149 checkpoint, remaining positive generation coverage was the real annual chronology: initial CLOSED rollback-contained rebind, supported ABORT/reopened committed rebind, activated successor committed rebind, and separate terminal CLOSED committed rebind left disabled. This document does not convert the focused initial OPEN result into those yet-unrecorded claims.

## Bounded CLOSED deployment-enablement correction (152)

**SOURCE — before:**131's owner-only `set_certification_admission_v1(enabled:true)` sets the current gate OPEN even after a genuine CLOSED generation and release rebind. This conflates deployment enablement with ingress reopening. The same131 context contract already permits READS and ANNUAL while PAUSED and denies SCORING/DIRECTOR/WORKERS there. The terminal-disabled proof preserves the limitation but does not prove a complete continued annual transition.

**Authorized correction — runtime proof recorded below:** preserve PAUSED when enabling a deployment over the exact current genuinely CLOSED Certification generation. Reuse144's exact gate-precedence/untouched-origin, no-successor/no-competing-generation, canonical closure and drained fingerprint/watermark checks. A malformed current CLOSED context fails closed, never falls through to OPEN. Existing valid initial/OPEN behavior is unchanged. This does not reopen a generation, add a capability, broaden a role, admit a Production resource, or change CLOSING/ABORT policy.

The existing private setter remains owner-only, SECURITY INVOKER, with identical OID, ACL, search_path, resource/database checks, admission CAS, exclusive fence and atomic audit. Request and success response fields stay unchanged. New owner-only closed-context/evidence failures are explicit40001 conflicts. No current state is selected by timestamp. No new table, grant or public RPC is introduced.

Required proof: committed CLOSED rebind → explicit owner deployment enable → unchanged PAUSED ingress and closed canonical graph → READS/ANNUAL context admitted → SCORING/DIRECTOR/WORKERS rejected → actual supported ACTIVATE. Missing/mismatched closure or drain must reject without admission/audit changes. No forged closure, direct history repair or new authority is permitted. The earlier rollback-only and terminal-disabled artifacts remain historical proof, not substitutes for this continuation.

152 first local install counterevidence: annual20 (`annual-transition-2026-10-03T02-00-38-488Z.json`) stopped at initial owner enable, before tournament operations, because the new PL/pgSQL variable `g` collided with the existing SQL alias `g`. The correction renames only the inserted variable to `closed_generation`; it leaves the original setter body/alias and all predicates unchanged. The failed owned cluster was destroyed. Runtime proof of the corrected body remains separate.

## Full131–152 genuine annual release continuation

**PROVEN — LOCAL POSTGRESQL/API/INTEGRATION:** [annual22](implementation-evidence/annual-transition-2026-10-03T02-08-24-102Z.json) completes13/13 test cases and1056 supported operations with864 canonical holes and48 Finals; sourceStable=true. Both genuine initial and future CLOSED release changes commit, then the actual owner setter enables the deployment while leaving the canonical generation CLOSED and ingress PAUSED. Actual READS and ANNUAL context checks succeed; SCORING, DIRECTOR and WORKERS context checks are denied. Owner-only role checks, stale admission CAS, wrong resource, setter metadata and atomic audit rollback are exercised. The complete chronology continues through genuine ABORT/reopen, subsequent close/drain, successor activation and preserved shipping History reads. No canonical closure or readiness was fabricated. The owned cluster was destroyed.

Annual21 had already passed these152 cases but stopped at a test expecting the wrong SQLSTATE for WRONG_ANNUAL_ROOT. The unchanged138 contract correctly returns42501/CERTIFICATION_ANNUAL_LINEAGE_REQUIRED; annual22 changes only that exact test expectation. The earlier failed artifact is retained. This does not erase the separate protected historical Production/provider input gaps, and it is not hosted or Production certification.

## Final focused131–152 release result

**PROVEN — LOCAL POSTGRESQL/RPC/API/CONCURRENCY/FAILURE INJECTION:** [run10](implementation-evidence/release-transition-2026-10-03T02-24-05.900Z.json) passes18/18, sourceStable=true, with the original supported10000→10000 calculation after genuine score advancement restored.150 resolves the earlier publication source collision without index, Production or replay-policy change. The second publication and new-release calculation/publication succeed; scoped pending/running/retryable/ready work still blocks release, terminal failed/superseded/published history is retained, and no job is adopted or auto-published. Missing genuine annual closure denies both rebind and152 owner enable with unchanged admission and PAUSED gate. The owned cluster was destroyed and the process exited0.

Together with annual22 this covers exact initial OPEN, genuine initial CLOSED, supported ABORT/reopened, activated successor OPEN and genuine future CLOSED release states. The result remains limited to the local synthetic resource and exact source manifests; it does not certify hosted deployment identity or the separately unresolved protected historical provider/Production lineage.

## Final adapter source-impact retention

The later frozen Calcutta change is limited to validating a nonempty Certification claim against existing133/141 response fields. This receipt did not execute that configured claim branch; its recorded source hashes remain unchanged historical evidence. The exercised domain paths remain valid by the [final source-impact review](SOURCE-SAFETY-AUDIT.md). Actual configured initial Calcutta processing is separately proved6/6; no configured future Calcutta runtime is inferred.
