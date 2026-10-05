# Required implementation / hosted acceptance gates

This is a plan; execute none of it hosted under the current review authorization.

1. Pin a supported `@vercel/queue` SDK and Node22+ runtime. Local build must produce
   exactly one intended fixed-topic private push consumer with maxDuration60,
   finite maxDeliveries and normal concurrency1. Ordinary public route/export
   must not be able to invoke the worker. No wildcard topic or public enqueue API.
2. Locally implement and certify forward-only native transport correction: owner
   PREPARE/START/STOP/STATUS; hash-only preissued reservations; binding/epoch/window;
   one-time BEGIN CAS; publication accounting; UNKNOWN/reconciliation; unchanged
   claim/lease/job failure semantics. Reject direct service_role mint/reserve/owner
   control and hash replacement. No HMAC/Vault, raw keys, SQL-role secret getter or
   broad owner credential added to runtime. Do not solve issuer custody by granting
   postgres connection privileges to a general application client.
3. Fault/proof coverage must include batch send failure/unknown, delivery before
   START, expired delivery, duplicate provider delivery, STOP/rebind, true SQL CAS,
   missing acknowledgement, five-global-tick/three-invocation ceilings, durable
   attempts, job lease reclaim/supersession/dead-letter recovery. The present local
   model does not satisfy these SQL/provider certification gates.
4. With separate authorization, reconfirm the existing disabled/paused Certification
   checkpoint and exact resource. Install only the reviewed forward correction;
   deploy/rebind exact candidate; verify OFF before any message. Preserve current
   installation receipts truthfully with the forward image.
5. Read account/region feature availability and inspect real build artifacts.
   Verify native delivery in the exact protected Preview deployment without
   disabling protection or provisioned bypass secret. Wrong/public internet POST
   to the consumer must not reach it; forged native headers and ordinary clients
   cannot enqueue. OIDC token/project/env scopes do not permit client targeting.
6. Prove service_role/anon/authenticated SQL cannot read or mint invocation proofs,
   enable native transport, expose env/OIDC values, schedule HTTP or invoke private
   cores. Inspect PostgreSQL/API/log surfaces for unintended token persistence;
   digest-only ledger is necessary but not sufficient if raw proofs are logged.
7. Owner START a minimal finite batch. Create the existing certified minimal
   synthetic demand; no job INSERT or forced demand. Native consumers discover,
   claim, process and acknowledge the four approved families through the existing
   worker. No direct processor call substitutes for this positive proof.
8. Exercise the bounded hosted Part2B1 fault/recovery/concurrency matrix with fixed,
   expiring source-bound controls. Keep empty Calcutta no-demand, Odds0,
   FinalRecap ineligible, Google/messaging0. Stop on any new material defect.
9. Owner STOP; reconcile pending native invocations and job state; drain required
   approved work through the certified mechanism; keep truthful terminal/archive
   evidence. End admissions disabled, ingress paused, native supervisorOFF, pending
   required jobs/claims/leases/UNKNOWN/deadletters0. Preserve fixture.

Production requires independent registered resource, provider environment/topic
configuration, release binding, scope/window, server credentials and owner
authorization. Certification must reject Production-shaped contexts before adapter
creation. No Production scheduler, configuration or enablement is part of this plan.
