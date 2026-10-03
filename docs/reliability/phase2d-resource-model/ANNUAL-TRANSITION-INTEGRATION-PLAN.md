# Annual transition integration after durable ingress

Status: **DESIGN / NOT PROVEN**. The owner approved Certification-origin annual transitions and durable ingress. This document fixes the integration requirements before the next forward migration; it does not certify an implementation or authorize hosted work.

The required order is focused ingress proof, the four known receipt/context/status/ID corrections, then annual transition implementation and proof. Historical migration files and Production provider semantics remain unchanged.

## Authority and shared algorithm

Production and Certification must use the same canonical preparation, readiness, lifecycle, pointer CAS, participant identity, side-game binding, activation and abort rules. Separately admitted wrappers supply their real resource context to private shared logic. An isolated caller must never construct a Production context or satisfy a Production provider fence with invented values.

Production retains its existing platform-owner admission, legacy closure lineage, provider verification, release/admission generations, ingress lease table and abort semantics. Certification uses its registered resource/installation, verified Director/owner, current pointer, admission revision, canonical epoch and the new durable Certification ingress generation. Resource class is server/database-bound; request JSON cannot select it.

The initial Certification origin must reference the completed canonical installation receipt, installation/schema/manifest identities, initial epoch, initial admission generation and initial current pointer. It is immutable evidence, not an alternate score authority. A later transition links its actual preceding Certification annual authority and closed ingress generation. No legacy Google closure, writer lease, workbook or Production activation row may be synthesized.

## Transition contract

| Operation | Required effect | Required denial / uncertainty behavior |
|---|---|---|
| Prepare | Validate owner, current resource/pointer, successor lifecycle and existing readiness; reserve one successor generation using the existing algorithm and control receipt. | Stale pointer/lifecycle/readiness conflicts; another active transition conflicts. No pointer change or write admission to the successor. |
| Close | Take the exclusive admission fence; CAS the actual predecessor generation; stop new admissions/execution; capture its real sequence watermark. | ADMITTED and UNKNOWN operations remain visible blockers. Expiry, zero rows in another ledger, and transport errors do not prove drain. |
| Drain | Recompute selected-generation outcomes/fingerprint under the fence; verify Finals, complete scores, identity, side-game and required worker readiness. | A missing origin, unresolved outcome, post-watermark admission/write, changed fingerprint or domain blocker prevents CLOSED certification. |
| Activate | Consume the valid predecessor certificate and successor readiness; atomically advance pointer/lifecycle/identity/side-game authority and establish a fresh successor ingress generation. | Exact resource/generation/CAS checks remain required. No empty or merely prepared tournament becomes active through a fixture shortcut. |
| Abort | Preserve the aborted transition and closed evidence; follow existing lifecycle rollback rules and create a new predecessor ingress generation when reopening is legitimate. | Never reopen an old generation or make an old executable lease valid again. Unresolved work must be resolved under its original identity. |
| Same-operation retry | Recover the same control receipt with the same logical payload and actor. | Changed payload conflicts. A later current pointer must not silently reinterpret the original target. |

Certification control receipts must bind the stable logical request and verified origin. Current admission tokens are execution authority, not a reason to change the logical request hash on receipt recovery. Receipt recovery grants no new mutation authority. Any corresponding change to the existing receipt storage is limited to truthful resource/origin binding and must leave Production request hashes and replay behavior unchanged.

**Lock order:** the Certification annual mutation wrapper must acquire the exclusive admission advisory lock **before** pushing its validated context or taking resource/pointer/generation row locks. Two transactions must not first acquire the shared context lock and then both attempt to upgrade it. Any annual evidence endpoint that invokes a helper requiring the exclusive fence must follow the same order. A context read in an earlier, completed HTTP/RPC transaction does not retain this lock and is revalidated inside the mutation transaction.

**Context during transition:** ordinary context revalidation must continue rejecting changed pointer/epoch/admission revisions. The transition implementation must order its own atomic pointer/admission changes so downstream shared domain work does not accidentally execute under a stale marker. It must not solve this by allowing generic context rebinding. A private helper parameter used to reserve the successor generation before atomic installation is not client-selectable authority; its use must be tied to the locked transition, readiness certificate and CAS.

## Source seams identified before implementation

| Existing source/function | Required narrow seam |
|---|---|
| `prepare/close/drain/activate/abort_production_annual_scoring_transition_v1` | Preserve public OIDs/admission and extract private shared control logic; Certification wrapper independently admits the same operation. |
| `close_annual_scoring_predecessor_v1`, `advance_annual_scoring_transition_v1` | Select the real class-specific ingress evidence and lineage; keep common readiness and pointer rules. |
| `annual_scoring_predecessor_certificate_*` | Production legacy root remains mandatory; Certification origin/prior annual lineage and durable ingress replace only the provider-specific prerequisite. Existing side-game and internal-worker certificate layers remain required. |
| `annual_scoring_transition_readiness_v1` and current-pointer consumers | Use the approved exact canonical resource context, never a guessed/fallback scope. |
| `bind_future_participant_identity_runtime_v1` | Retain canonical eligibility/linking and generation checks with truthful Certification installation provenance instead of Production workbook identity. |
| `ensure_annual_side_game_runtime_v1` | Bind the same canonical side-game implementation and current pointers to the real resource and annual generation; no rule/publication changes. |
| Closure and annual authority tables | Class-conditioned provenance constraints: actual Production provider references remain required; Certification provider references must be absent and its real origin must be required. Historical rows remain intact. |

These are dependency findings, not evidence that their implementation passes. If a necessary seam changes an unapproved authority, role, scoring rule, receipt authority or worker architecture, stop that change and record it.

## Independent proof oracle

The test oracle reads canonical rows independently of transition response JSON. For both the first and a later transition it must verify: one current pointer with the expected revision increment; predecessor CLOSED and successor ACTIVE; distinct old/new admission generations; immutable closed predecessor watermark/fingerprint; all predecessor admissions terminal; no late committed work; correct initialization/prior-annual lineage; identity and side-game current pointers on the same successor generation; accurate audit and one control receipt; no Google jobs/provider rows or fabricated Production authority.

Negative cases retain snapshots of pointer, lifecycle, receipts, leases and audit. Wrong actor/resource/installation/schema/generation, stale CAS, unresolved work, incomplete match, unready side-game/identity/worker, changed payload and injected failures must either leave those snapshots unchanged or produce the explicitly documented recoverable CLOSING state. Crash/timeout never becomes a fabricated non-commit outcome. Production-shaped positive and negative transition tests remain a separate equivalence gate.

All proof in this task is owned local PostgreSQL / local application proof. Production, hosted staging, physical clients and tournament capacity remain **NOT PROVEN**.
