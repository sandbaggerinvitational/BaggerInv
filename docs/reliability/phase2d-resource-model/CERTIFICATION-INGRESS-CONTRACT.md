# Certification durable ingress contract

Status: protected-family ingress is PROVEN at the owned local PostgreSQL17/RPC/integration layer. The final source passed **35/35 test-runner cases**: focused ingress17, forward-upgrade/security4 and domain integration14 (32 behavioral cases plus three parents). The final race-independent focused fixture separately passed17/17. See [current proof](implementation-evidence/ingress-current-proof.json) and [runtime log](implementation-evidence/ingress-cross-family-after.log). The earlier9-case lifecycle stress proof includes20-way duplicate/conflict races, actual backend death, PostgreSQL process restart and the real five-minute lease lifetime; its retained scope and source-change analysis are explicit in the current proof. Do not add rerun counts as unique coverage.

The upgrade test reproduced and corrected an already-invoked predecessor function resuming after installation: migration136 acquires the admission fence and advances existing Certification admission revision atomically, invalidating the old context. Unexpected default privileges on private functions, public ingress functions or private relations abort installation. A prepared public call retains its original OID and is denied without a lease after upgrade. Existing non-Certification function bodies, owners, ACLs and configuration remained identical in the synthetic upgrade. This is schema/API equivalence evidence, not complete Production behavior certification.

A later concurrency regression reproduced two leases for one canonical match/mutation key across scoring and Director control. The [before counterevidence](implementation-evidence/ingress-cross-family-before.json) is preserved. The corrected partial unique index and shared admission lock allow only one family, returning the established idempotency conflict to the other after authority checks. The operation identity remains part of the request hash; recovery never substitutes another family's receipt.

Full annual integration, future-year recovery, all-mutation coverage,432-hole sequence and hosted certification remain incomplete. Annual controls are classified under the owner’s explicit operation-family exception (§67–68); their separate receipt/CAS/control protocol still requires runtime proof. Do not describe that exception as scoring ingress admission or claim blanket pre-execution durability for every mutation. Production admission APIs and lease rows retain their existing semantics.

## Storage and authority

Use private `production_control.certification_ingress_generations_v1` and `certification_ingress_leases_v1`. Existing Production lease constraints require `CANONICAL_LEGACY` and Google/provider provenance, so reusing those rows would misrepresent Certification. The new ledger is admission/execution evidence, not competing golf or financial authority. Canonical domain receipts remain authoritative for their committed mutations. No raw request payload is stored; terminal canonical response is retained for exact-origin recovery.

Each generation binds one registered Certification resource, current tournament, authority epoch and pointer revision. One generation per resource can be OPEN/CLOSING. Each lease binds the generation, resource, original context token, verified actor/account, logical operation, match scope where applicable and canonical request hash. For SUBMIT/FINALIZE/REOPEN/MATCH_CONTROL, uniqueness is resource + match key + mutation ID across all four operation families, matching the canonical score-receipt namespace. Other protected Director families retain resource + operation + target + operation-ID uniqueness. Existing text score mutation IDs remain match-scoped. The stored tournament is immutable and recovery derives it from the original lease, never a newly selected pointer. Sequence allocation uses a database-local identity sequence; gaps are valid and row counts are never watermarks. One physical database contains one canonical resource.

The immutable `admission_context` contains the verified, non-secret original resource/control context; it excludes actor authorization and raw payload. `predecessor_auction_revision` retains only the admitted normalized financial predecessor revision for the two auction mutations. Neither is a replacement for fresh execution authorization. The ordinary request hash includes the normalized payload and original actor/target identity. Exact replay can verify that hash without requiring an obsolete write context to become current again.

RLS is enabled with no public/client/service table grants. Only service-only admitted RPC wrappers expose the lifecycle; private cores and transaction markers have no runtime-role EXECUTE. No Google/provider fields exist in the Certification ledger.

## Transactions and states

1. **Admission transaction:** exact resource/deployment/schema/current-context validation; current actor/account/role/membership and target authorization; shared admission-close fence; current generation lock; exact replay/conflict check; durable ADMITTED insert and audit. Return only after commit.
2. **Execution transaction:** same fence, current authority revalidation, exact lease row lock and request/actor/generation/context match; only ADMITTED/UNKNOWN and unexpired execution authorization may proceed. The existing canonical dispatcher runs in a subtransaction. Successful result, canonical receipt/audit and COMMITTED ingress result commit together. A deterministic `ok:false` result rolls back domain side effects and records terminal NOT_COMMITTED with the established domain response. Infrastructure exceptions roll back execution, leaving durable admission unresolved.
3. **Recovery:** exact original resource, current registered deployment and original verified actor/account; no requirement for open write admission, current match permission or the old tournament remaining current. Exact indexed status lookup returns durable state. Missing admission returns UNKNOWN, never NOT_COMMITTED. Mark-unknown is optional evidence; ADMITTED itself is unresolved after crash/expiry.
4. **Authoritative resolution:** shared close fence then exact lease row lock waits for any execution. Terminal result is immutable. If no execution committed, resolution changes ADMITTED/UNKNOWN to NOT_COMMITTED while holding the same row lock; a delayed executor can never pass afterward. This action is explicit, not automatic on timeout/expiry.

States are ADMITTED, UNKNOWN, COMMITTED, NOT_COMMITTED. Expiry prohibits new execution but does not resolve uncertainty or permit drain. Terminal states cannot reverse. No automatic evidence deletion/compaction is introduced.

## RPC and integration contract

`admit_certification_operation_v1(input)` uses the existing operation envelope. Response: `ok`, `contract=certification-ingress-v1`, `lease_id`, `admission_generation_id`, `admission_sequence`, `operation_request_id`, `request_hash`, `state`, optional terminal `result`.

`execute_certification_operation_v1(input)` requires `input.ingress={lease_id,admission_generation_id}` for the enumerated protected families. Existing domain response shape is preserved. The former wrapper body becomes owner-only private implementation; its public OID remains the admitted entry point.

`read_certification_ingress_status_v1`, `mark_certification_ingress_unknown_v1`, `resolve_certification_ingress_v1` accept the static exact resource/deployment envelope plus operation identity, original authorization and match ID where match-scoped. They do not require a fresh open SCORING/DIRECTOR handshake. Ordinary status cannot fence an operation. No caller-supplied generation, outcome, high-watermark or fingerprint is trusted.

Future-year recovery additionally calls `assert_certification_historical_identity_v1`, reserved for the annual identity extension. It retains approved-contact, verified-link and historical binding checks while omitting only current/open write prerequisites. Until that extension is installed, future-target recovery fails closed; the focused 2026 fixture does not prove future identity compatibility.

Private `require_certification_ingress_execution_v1()` validates the PID/transaction marker, current canonical resource marker and locked executable lease, returning its bound identity for first-write receipt provenance. A transaction marker alone is not evidence of durable admission.

## Operation families

| Family | New ingress required | Reason / existing durable authority |
|---|---|---|
| Score submit, Finalize, Reopen | Yes | Competitive mutation and delayed execution affect annual close; canonical score/lifecycle receipt remains truth. |
| Director setup/handicap and pairings | Yes | Mutates readiness and canonical scoring context; existing setup receipt remains truth. |
| Director match control | Yes | Mutates admission/lifecycle and readiness; existing control receipt remains truth. |
| Net Skins entries; Calcutta auction replacement/clear | Yes | Owner mutations affect required side-game readiness; existing private financial receipt remains truth. |
| Net Skins/Calcutta/Competition/Intelligence job claim/complete/fail | No duplicate ingress | Existing durable job, claim lease, generation, result receipt and required annual worker drain govern delayed delivery. Resource wrappers still fence execution. |
| Odds calculation/publication | No new generic gateway | Existing owner-controlled operation/job and publication receipt remain authoritative; no new publication capability is introduced. |
| Annual create/prepare/close/drain/activate/abort | No scoring-generation lease; separately certified control protocol | Owner §67–68 permits family classification. Existing canonical receipts, target/transition revisions, pointer CAS and admission fences govern control execution. Missing receipt remains UNKNOWN; control recovery and late-call tests below are required. Putting CLOSE/DRAIN in the generation they close would self-block closure or introduce post-watermark admissions. |
| Reads/status/optional maintenance | No | No competitive write; exact resource/actor authorization remains required. |

## Close and annual integration

Private close/drain functions take the exclusive existing database admission fence, current generation CAS and generation lock. Closing rejects new admission/execution and captures actual maximum sequence, deterministic generation-local lease fingerprint and counts. ADMITTED/UNKNOWN remain blockers until explicit authoritative resolution. Closed evidence is recomputed/checked under the fence. No unrelated generations participate in per-generation queries. Post-close evidence checks for sequence beyond watermark or a terminal competitive commit beyond the close fence; delayed execute is structurally denied by generation and lease state.

Abort/reopen creates a new generation and advances CAS revision; it never reopens an old generation. Unresolved old leases remain durable and require resolution; annual activation cannot consume an unresolved predecessor. Root annual transition integration must consume this evidence together with all existing readiness, Final, side-game, identity, worker and pointer-CAS conditions.

Ordinary admission/recovery uses exact unique indexes. Close/fingerprint cost is proportional only to the selected generation's actual admissions. Local performance and query plans remain required proof; no Production capacity claim is made.

## Annual control classification addendum

**STRONGLY SUPPORTED — SOURCE, runtime proof pending.** The owner’s §67–68 explicitly requires classification and warns against forcing every Director operation into the scoring lease protocol. The §164 self-audit must distinguish protected competitive admissions from these separately certified controls; it cannot be answered with an unqualified assertion that all mutations have136 leases.

| Control family | Existing authority / late-write boundary | Recovery requirement | Required proof |
|---|---|---|---|
|134 annual CREATE / structure | CREATE produces a Draft. Other supported structural actions require DRAFT/CONFIGURING, target setup revision and target advisory serialization. They do not write the closed predecessor’s competitive scores. Shared admission context fence serializes against pointer movement. | Exact target/action/operation-ID/hash canonical receipt gives COMMITTED. Missing receipt is UNKNOWN. Retry retains original logical request and expected context/revision; no silent target rebinding. | Lost ACK, same-ID conflict/replay, queued call across Prepare/activation and locked target denial. |
|138 PREPARE | Exclusive admission fence, exact current pointer, lifecycle/readiness fingerprint and runtime-generation CAS; successful preparation locks the successor structure through READY_FOR_ACTIVATION. | Exact-origin canonical action receipt. | Competing prepares, old readiness, changed structure and response loss. |
|138 CLOSE / DRAIN | Exclusive admission fence, transition state and exact predecessor/runtime generation. CLOSE captures the actual protected scoring generation; DRAIN consumes its real terminal/unresolved evidence. | Same action/operation ID and full hash; receipt after commit, UNKNOWN before authoritative commit evidence. | In-flight score exclusion, unresolved lease blocking, duplicate controls, response loss and no self-counting control lease. |
|138 ACTIVATE | Exclusive fence, immutable predecessor certificate, exact transition/pointer/lifecycle CAS; pointer/epoch/runtime authority and receipt commit together. | Static registered resource plus exact original actor and receipt identity must recover after the pointer advances. A fresh current write context cannot be required to read the old receipt. | Lost ACK, delayed old invocation, concurrent activate/abort, wrong resource and stale certificate. |
|138 ABORT | Exclusive fence and exact transition/runtime CAS; existing contract creates a new generation and invalidates predecessor evidence rather than reopening a closed generation. | Same original receipt identity and actor; no blind new operation ID. | Retry after new generation, late old request, unresolved predecessor denial and truthful rebind. |

An exclusive fence followed by receipt absence is **not** proof of NOT_COMMITTED: a request that has not yet acquired the fence could execute later. The minimum supported control contract therefore retains UNKNOWN until an exact receipt resolves it or the same-ID canonical retry completes. Any future NOT_COMMITTED resolution must additionally prove irreversible invalidation of every original execution predicate; no such resolution is claimed here. Receipt readback must preserve actor privacy and resource binding without re-admitting an old write.

Certification annual mutation wrappers acquire the exclusive admission fence before pushing a context that takes its shared fence, avoiding shared-to-exclusive lock conversion between concurrent control requests. Existing Production wrappers retain their historical semantics.

This classification does not automatically exempt all139 authoring. Guide, Draft and Prediction guards can admit current ACTIVE and future READY_FOR_ACTIVATION targets. Each must be classified by actual effect: presentation-only work may remain outside scoring drain; anything affecting readiness/side-game authority must preserve its canonical revision/fingerprint and fence checks. Activation must re-evaluate those facts, and delayed prior-pointer work must fail. Those behavior tests remain required before overall certification.
