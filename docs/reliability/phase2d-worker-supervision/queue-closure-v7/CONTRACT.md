# Certification Queue routing closure v7

Local-only remediation of the hosted V6 transport-lifecycle defect. Base application: `a6c240d698d9dfcd5e76ffba7b10afca1ce8883b`. No hosted query/mutation, publication, deployment, START or worker execution is part of this certificate.

## Root cause and scope

Previously, the callback validated execution lifetime during provider preflight, before it read the invocation. The consumer then applied `SUPERVISOR_DELIVERY_LIMIT` before canonical BEGIN. A retained message could therefore fail the lifetime/delivery guard without reaching the already-terminal reservation. Native notification failures produced 500/503 retries although STOP continued to deny execution.

V7 adds a read-only `DISPOSITION` operation to the existing `execute_certification_queue_supervisor_v2` server transport. Its existing service transport, resource/project/release/deployment checks and function ACL/owner/security/search_path remain unchanged. No owner operation, processor, scoring/financial behavior, mutation/CAS, lease, retention or execution visibility constant changes.

## Ordering

1. Derive exact trusted Certification Preview runtime identity from the existing server registration/provider context.
2. Validate private native callback method/topic/region/group/message ID. Parse only the fixed version/invocation-ID payload.
3. Obtain **actual** createdAt/expiresAt and provider identity: trusted prefetched private callback metadata, or fixed deployment-bound ReceiveMessageById with visibility zero. Reject malformed/missing metadata; never synthesize expiry.
4. Read canonical `DISPOSITION`, with no BEGIN, row mutation, job claim, attempt increment or worker. Require the invocation, owner START receipt for its epoch/deployment, and exact owner-publication provider message ID. Validate current resource and release; recompute the current-epoch reservation digest. A stale epoch can close only from its private historical row, owner receipt and exact publication identity.
5. Known terminal denial: keep `execution_authorized:false`, emit sanitized canonical reason, and acknowledge through the native provider API. Routing-only closure first acquires a short transport-only receipt (at most five seconds, strictly inside actual expiry), because a zero-second peek does not lease the message. There is no SDK worker lifecycle, 90-second renewal, BEGIN or worker on this branch.
6. RUNNING/UNKNOWN or unconfirmed publication: preserve uncertainty. No ACK and no second BEGIN. Request only the existing bounded expiry-safe retry directive, then authoritative owner reconciliation. Exhaustion remains visible.
7. Only canonically eligible work reaches the unchanged delivery-count/lifetime guards, normal SDK lifecycle and canonical BEGIN. BEGIN rechecks all execution authority/CAS, including races with STOP/HALT.

Successful transport closure is **not** successful worker authorization. Response and passive timing receipt retain canonical denial. DELETE must return 204 before `transport_acknowledged:true`; missing/lost/failed acknowledgement is not reported as confirmed.

Provider API references: [Receive/acknowledge/visibility](https://vercel.com/docs/queues/api), [native SDK retry directives](https://vercel.com/docs/queues/sdk). Installed SDK is pinned at 0.7.0. Acknowledgement removes the message from this fixed consumer group's view; it does not delete canonical history.

## Disposition matrix

| Canonical condition | Execution | Transport |
|---|---|---|
| Current, due, admitted | Existing BEGIN/CAS and worker | Existing successful SDK ACK |
| Current, NOT_DUE | No admitted tick | Existing sanitized relative delay, floor 5 seconds |
| Current, BUSY | No admitted tick | Existing 15-second native retry |
| OFF/STOPPING, known unconsumed invocation | Denied; no BEGIN | ACK/CLOSE with STOPPED reason |
| Cancelled publication/reservation | Denied; no BEGIN | ACK/CLOSE with CANCELLED reason |
| Expired reservation/supervisor | Denied; no BEGIN | ACK/CLOSE with EXPIRED reason |
| Historical stale epoch/revision, safely identified | Denied; no BEGIN | ACK/CLOSE; historical owner receipt and provider ID required |
| Completed/reconciled invocation replay | No second BEGIN/tick | ACK/CLOSE with REPLAY or known terminal reason |
| HALTED unused authority | Denied; no BEGIN | ACK/CLOSE; owner reconciliation/RESUME creates fresh authority |
| Admission/context revoked | Denied; no BEGIN | ACK/CLOSE for safely identified terminal authority |
| RUNNING/UNKNOWN, including concurrent STOP/expiry | No second tick | Bounded retry/reconcile; never infer rollback or ACK |
| Publication acknowledgement unconfirmed | No tick via this preflight | Reconcile; cannot delete an unbound provider message |
| Database/connection/timeout failure | No authority granted | Failed/retryable notification; no false ACK |
| Wrong resource/project/deployment/release/message | Denied | No terminal ACK/DELETE from untrusted identity |
| Malformed/unidentifiable payload or timing | Denied | Fail closed; no canonical terminal ACK |
| Still-eligible message beyond delivery cap | Denied | Visible failed delivery; no ACK or manual completion. Existing expiry/owner reconciliation remains authoritative |
| Still-eligible exhausted execution horizon | Denied | Visible failed delivery; no visibility request outside expiry |
| Provider reports locked/not found/already processed | No execution | Existing skipped-notification semantics; no arbitrary ACK/DELETE |

RUNNING/UNKNOWN takes precedence over every terminal-looking control/expiry condition: work may already have committed. Terminal completion is learned from the durable invocation, not from a transport error.

## Accounting and security

Physical provider delivery counts are distinct from invocation admission, global tick failures and job attempts. Peeks, short closure receipts, NOT_DUE/BUSY and terminal read/close do not increment any canonical attempt/failure counter. The existing admissible-delivery cap remains five; it is not asserted to be a provider cutoff. Canonical jobs are not relabeled completed by transport closure.

Only the existing server transport can obtain sanitized disposition. Participant/anon/authenticated have no RPC grant; service_role cannot invoke private owner START/STOP/publication/mint or private worker cores. Existing public service transport permission is unchanged. No private claim/run token, message payload, financial/participant data or credential enters closure evidence. An arbitrary queued payload cannot claim STOPPED, supply a resource/URL or choose terminal state: both its strict payload and exact stored provider ID must match an owner-issued invocation.

STOP, HALT and reservation expiry are irreversible for that invocation's execution authority. RESUME/START issue a fresh epoch/reservation. Provider retention never grants execution authority. RLS remains enforced; the new private installation receipt has RLS and no client/service read privilege. Historical v1–v6 installation receipts remain unchanged.

## Forward installation

Artifact: `supabase/production_incremental/certification-queue-routing-closure-v7.sql`.

One existing function changes: the read-only DISPOSITION branch and its local variables. Exact predecessor prosrc SHA-256 is `26168835e5edd3448f7a38d64ce87c89d767b1f749fbd117d7ae77d7e16a2d33`; postimage is recorded in the artifact manifest. The transaction requires the exact registered Certification resource/physical database, supervisor OFF, disabled admission, paused ingress and no live invocations/claims/leases. It preserves function metadata, checks the complete predecessor image, stores private historical evidence and is idempotent on replay. No historical migration or bootstrap is edited. Fresh canonical installation followed by v1–v7 is exercised locally.

## Local proof and limits

Owned PostgreSQL 17 uses real pg-safeupdate. Protocol tests use the installed Queue SDK and a fixed synthetic provider transport; all remote sockets and real credentials are denied/stripped by the certificate launcher. Real canonical START, publication accounting, STOP, natural reservation expiry, existing worker/claims/output/FINISH and private ACLs are exercised. No scoring preparation is needed for the truthful four-family producer.

The provider ACK/short-receipt API behavior remains a hosted repro gate. Local success does not claim a new hosted PASS, queue publication, or hosted worker execution. Existing hosted passes for autonomous processing, retention, visibility, termination/reclaim, HALT and lost ACK remain retained; their complete chronologies are not rerun by this correction.
