# Control, custody and reconciliation

## Trusted context

The consumer requires Node22+, VERCEL=1, explicit Certification transport flag and
the existing reviewed server registration. Provider system deployment ID, project
ID, Preview environment, immutable URL, Git SHA and branch must agree with that
registration and the currently initialized database release. No header, cookie or
message selects context. The database additionally verifies physical database,
fixed Certification ref/resource/revision, initialization epoch, release binding,
pointer, admission/activation revisions and structurally OPEN generation ID/revision.

The native SDK authenticates with provider OIDC. The owner publisher uses a
short-lived scoped token outside SQL, with provider signature validation. Local
decoded claim checks only reject wrong team/project/environment/expiry; decoding
is not authorization. Publishing sets explicit deploymentId and fixed iad1 region.
NODE_ENV=development is rejected because the SDK's local mode unpins delivery.
Do not use deploymentless publishing.

Provider-documented runtime identity and private triggers are supporting evidence,
not sufficient worker authority. See official [system variables](https://vercel.com/docs/environment-variables/system-environment-variables)
and [Queues registration](https://vercel.com/docs/queues/quickstart). Native identity,
private reachability and deployment pinning still require hosted acceptance.

## Private reservation

Owner START is unavailable to anon/authenticated/service_role and requires the
canonical table owner, expected supervisor revision and exact authority context.
It atomically creates a new epoch and its bounded budget. Invocation IDs are opaque
UUIDs, not reusable credentials. A private digest binds version, ID, epoch,
supervisor revision, sequence, scheduled time, expiry, full authority context and
fixed engine scope. Raw tickets are not stored. Existing installation history and
audit are preserved; no SQL/Vault secret is introduced.

Messages contain exactly `{version, invocation_id}`. No database credential,
HMAC, claim token, private identity, financial payload, resource or destination is
allowed. BEGIN validates the private reservation against current control/binding
then locks and consumes it once. Only after successful consumption does it return
an ephemeral run token to server memory. That token is never in a queue message,
owner status or evidence. Subsequent STEP/outcome operations require it. Existing
private worker cores remain denied to application roles.

The public Supabase wrapper is a narrowly scoped service transport for consumption,
not an owner issuer: it has no START/mint/publication operation. Possessing a
generic HTTP or SQL service credential without an owner-issued reservation does
not create a tick. Legitimate opaque IDs must be protected by native private queue
delivery. The threat model does not claim resistance to a provider/account owner
who controls deployments; such control is outside application SQL-role authority.

## Cross-system publication

1. Owner START commits reservations/control/audit before any SDK call.
2. BATCH reads remaining RESERVED/UNKNOWN entries with a fixed deployment.
3. TRY commits publication UNKNOWN and increments its attempt before sending.
4. The SDK uses the identical epoch/sequence idempotency key on retries.
5. A valid provider message ID records ACCEPTED. Consumer BEGIN records DELIVERED.
   ACCEPTED is not execution success. An absent response/null SDK message ID is
   UNKNOWN, never proof of NOT_PUBLISHED.
6. Partial publication stops at the first uncertainty. A later publication pass
   retries only unfinished entries. Duplicates are safe even if provider
   idempotency retention ends, because reservation CAS admits at most one tick.
7. STOP wins against publication: unused entries become NOT_STARTED/CANCELLED,
   with prior publication/ACK evidence retained. A message accepted after STOP is
   harmless; delivery cannot restart the worker.

Status deliberately returns schedule_installed=false/delivery_certified=false:
there is no permanent installed schedule to infer from a local SDK response.
It reports reserved/unknown/accepted/delivered/cancelled counts, consumed and
remaining authority, pending jobs, claims, dead letters and durable failure state.

## Delivery, stop and failure

No correctness depends on queue order or exactly-once delivery. Duplicate BEGIN
reports the existing invocation without a second cycle. Known durable completion
settles lost consumer ACK; unresolved RUNNING/UNKNOWN stays uncertain until owner
reconciliation. Expired, stopped, halted, stale or foreign authority cannot execute.
Normal one-slot admission prevents overlap; reviewed two-slot mode retains job CAS
as the final arbiter and permits independent jobs to progress.

Database global/tick failures and per-job failures remain separate. Three failed
or uncertain invocations halt, deterministic failure halts immediately, and the
five-global-tick latch remains. Provider restart/redelivery does not reset durable
counts. STOP retains HALTED evidence; RESUME requires explicit owner cause/
reconciliation evidence and safe settled state. Queue retries are bounded to five
deliveries, with finite delay. They never mint a fresh job attempt or reservation.

An unconsumed expired reservation is authoritatively NOT_STARTED, not a failed
job or false success. Missing wakes are visible through publication/status and
pending work; the finite budget expires and the owner must reconcile/STOP before a
new window. A crashed consumed invocation waits its real deadline and reconciles
canonical claim state. Job retry follows existing backoff/attempt rules.

Faults remain owner-only, fixed, single-use, Certification/source/cycle bound and
expiring: lost ACK, disappearance after claim, transient transport, terminal,
supersession and two-slot contention. Recovery uses existing Director requeue;
dead-letter evidence is never erased or manually relabeled.

## Forward-only installation

Install the reviewed v2 artifact while supervisor OFF, admissions disabled,
ingress paused and no unresolved invocation. It compares the installed predecessor
catalog image to its original receipt before replacing Bagger functions. It stores
a separate queue installation image with that immutable predecessor receipt.
Replay requires the current queue image match and converges. Ownership/security
and existing RLS stay intact; new private ledger metadata remains denied to client
roles. Only the new consume wrapper has service_role EXECUTE. Historical HMAC RPC
EXECUTE is revoked and its body, key/configure/reserve/dispatch/schedule/provider
ACL helpers are inert. No provider extension ACL/ownership changes are attempted.

A fresh local add-on installs the retained v1 schema while OFF, then v2 immediately,
without configuring extensions, secrets, dispatch or schedule. Canonical bootstrap
and historical migrations are unchanged. Do not replay v1 after installing v2.
