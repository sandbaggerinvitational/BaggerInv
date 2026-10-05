# Certification owner-to-Preview publication

The owner commits START through the existing TLS-verified managed-postgres owner
control. START still creates the epoch, finite budget and digest reservations.
It does not enable competitive admission, ingress or workers by itself.

The private owner-only `worker_supervisor_publisher_permit_v3` then verifies the
current Certification binding, enabled/non-halted supervisor, epoch/revision and
expiry. It issues one random 256-bit handoff valid for 60 seconds. Only its SHA-256
digest is stored. Audit contains permit identity/epoch/revision, never the bearer.
Bare service_role, anon, authenticated and Director/participant clients cannot
mint it, read its table, START or access owner status.

The CLI passes only `{permit}` in the body to the fixed bound immutable Preview
origin at `/api/internal/derived-worker/publication`. No permit is printed, placed
in a URL or persisted to an owner credential file. A local OIDC token supplies
only the provider protection-access header. The route ignores caller OIDC as
publication identity and obtains its own provider Function OIDC using the SDK.
It checks the unchanged Preview predicate before consuming the handoff.

The route is an owner-delegation endpoint, not a generic queue publisher or worker
ingress. Application Auth, Director entitlement, protection access, and a bare
service-role credential alone are insufficient. The new service-only transport
RPC cannot START or mint reservations. It requires possession of the private
owner-issued, single-use handoff and exact current canonical resource/deployment
binding. This narrow delegation is explicit; it does not turn service_role into
the supervisor owner.

`BEGIN` consumes the handoff once and returns a transient publisher-session
bearer to the server, stored only as a digest in private SQL. It expires 45
seconds after admission. Competing handoffs cannot overlap an active session.
The route runs a finite loop with a 40-second deadline and 5-second per-send
acknowledgement bound; it leaves time for control accounting. It stops issuing
new sends with less than ten seconds remaining. Provider ceiling is 60 seconds.

The existing private BATCH/TRY/ACK semantics are factored into one private
accounting helper. Owner SQL retains its original owner guard. The server bridge
can use that same helper only for the admitted publication session. Each TRY
commits UNKNOWN **before** native send. The topic is fixed; body contains only
`version` and canonical `invocation_id`; delay, TTL and idempotency key are derived
from committed reservations. No resource, URL, claim token or reusable secret is
published. The SDK explicitly pins the server's immutable deployment.

START and provider publication remain separate transactions. Partial sends,
missing provider/HTTP ACK, caller restart and provider deduplication never imply
NOT_PUBLISHED or complete schedule installation. Accepted IDs and consumer
delivery reconcile the durable ledger. Re-publication uses the same epoch and
sequence key. The unchanged consumer reservation CAS remains single-use even if
the provider duplicates or reorders messages.

After a publisher disappears, its session remains non-reusable; owner completion
waits until the 45-second session limit. It issues a new handoff for the same
unconsumed budget. UNKNOWN rows and attempt counts persist. No job attempt is
reset. An uncertain SDK send may complete remotely after the caller's finite
wait; the ledger remains UNKNOWN and retries remain deduplicated/CAS protected.

STOP/halt/expiry, current authority drift, or a new epoch/revision denies both
unused handoffs and admitted publication sessions. A send already in flight may
be accepted after STOP, but its worker reservation cannot execute. Physical
message cancellation is not a correctness requirement.

The consumer, worker, canonical job claims, 90-second leases, retry/dead-letter,
financial logic and competitive authority are unchanged. Existing private-core
ACLs and application RLS remain unchanged. Two new private tables have RLS enabled
with no application grants. The new capability transport RPC grants only narrow
execution to existing server service_role; it confers no owner minting authority.

Forward install order is v1 → queue v2 →
`certification-queue-preview-publisher-v3.sql`. The v3 receipt validates the exact
v2 installation image and preserves v1/v2 receipts. Replay v3 after v3; replaying
an older artifact over a later correction is not supported. No historical
migration, bootstrap/domain tables, provider ACL, Vault or pg_net change occurs.
