# Certification global faults v5

This is local certification, not hosted execution. Base candidate is
`ef20ef18299e49b25a4e04b0575287420b9a89d7`. The retained hosted four-family
cycle-29 autonomous positive proof remains valid. No new Queue, provider credential,
route, topic, consumer registration, worker implementation, calculator or scoring
rule is introduced.

## Authority and installation

Install the exact forward artifact
`supabase/production_incremental/certification-queue-global-fault-v5.sql`
only after v1, Queue v2, publisher v3 and safeupdate v4. The installer requires
registered resource `CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51`, physical
project `trmcwrljjxwhgtikfdgu`, registration revision 1, current database,
supervisor OFF, admission disabled, ingress paused, no live invocation, claim or
operation lease. It holds the existing installation/admission locks.

The v4 catalog image and three predecessor function hashes must match. The patch
changes canonical Queue BEGIN to return an installed-contract marker and supports
GLOBAL_FAULT behind its existing run-token validation. Owner RESUME additionally
requires correction of an armed current-epoch global plan. STATUS adds sanitized
plan/remaining/consumed/cancelled/correction counts. All three existing function
owners, ACLs, security modes, search paths, language and volatility metadata are
preserved. All seven safeupdate-qualified singleton mutations remain intact.

Four new private RLS-enabled relations hold plans, consumptions, owner receipts,
and the installation image/history. No client or service_role grants/policies are
added. Three new private SECURITY INVOKER functions use `search_path=pg_catalog`.
Their EXECUTE is revoked from PUBLIC, anon, authenticated and service_role.
The public existing service transport calls private TAKE only after admission.
ARM/CORRECT are managed-owner controls, never client RPCs.

Installation is atomic and idempotent. Its receipt retains exact v1/v2/v3/v4
historical installation rows. Replay checks current bodies, metadata, private
relations/constraints and history; drift aborts, not ad-hoc repair.

## Fixed fault protocol

Default NONE: installing v5 creates no plan. Queue messages remain exactly
`{version, invocation_id}`. No new input grants queue or worker authority.

Global owner ARM accepts only resource/deployment binding, request_id,
expected_revision, action, fault, uses and expires_at. It derives the first N
committed, unpublished, unstarted future reservations from canonical state. It
accepts no client invocation/job IDs, epoch, SQL, error, sleep, method or URL.
One global plan per epoch; it cannot mix with an existing job fault in that epoch.
Maximum expiry is the earlier of supervisor expiry and ten minutes. Existing
reservation cadence, 45-second run bound, finite budget and epoch/revision remain
unchanged. The private plan records binding digest, complete current authority
context, canonical invocation IDs, remaining uses, owner and expiry. Request
receipts reject conflicting replay; audits retain ARM, consumption and CORRECT.

| Fault | Boundary | Uses | Truthful effect |
| --- | --- | --- | --- |
| GLOBAL_TRANSIENT | after canonical BEGIN + TICK STEP, before real discovery | 1–3 | fixed ECONNRESET, existing RETRYABLE tick failure; no job attempt |
| GLOBAL_DETERMINISTIC | same boundary | 1 | fixed terminal tick class; existing immediate HALT |
| INVOCATION_LOST_ACK | after successful real worker, before outward queue ACK | 1 | FINISH UNKNOWN then throw RECONCILE; committed outputs retained |
| DISAPPEAR | existing real CLAIM return seam | 1 | no worker completion; provider termination / owned child SIGKILL |
| TRANSIENT / TERMINAL | existing canonical job WRITE seam | 1 | normal durable job failure/backoff/dead-letter |
| SUPERSEDE | existing real CLAIM barrier | 1 | hold old source until owner RELEASE; canonical stale completion guard |
| CONTENTION | existing claim and reviewed two-slot mode | bounded existing contract | canonical reservation/claim CAS remains authority |

The private consumer still validates trusted Preview runtime, fixed message shape,
canonical reservation, resource/project/release/deployment and current supervisor
before any fault. TAKE additionally locks the singleton and invocation, verifies
its hashed run token, RUNNING state, exact epoch/revision/context, enabled state,
expiry, step and boundary. Consumption has a unique invocation primary key.
An arbitrary message cannot select a fault or broaden authority. SQL role
service_role cannot arm, read the private tables or invoke private TAKE directly.
Production and development runtime identities fail before worker construction.

## Failure, uncertainty and correction

Existing counters are unchanged: five transient tick failures is the tick ceiling;
three FAILED/UNKNOWN invocations reaches the invocation ceiling first. Deterministic
global tick failure halts immediately. Job failures remain a separate ledger.
Independent queue invocations do not reset attempts or counters. Owner RESUME
is an explicit new epoch after correction, not an ordinary restart.

Outward ACK loss is selected only after real success. TICK_RESULT records success;
FINISH records UNKNOWN, then the consumer rejects with finite RECONCILE retry.
Redelivery observes the consumed reservation and never executes a second tick.
At the existing `reconcile_after` (scheduled time + 150 seconds), owner reconciliation
reports `TICK_RECORDED_JOB_STATE_RECONCILED`, retaining tick_success and canonical
job/source/cycle/attempt evidence. It does not assert an absent ACK means rollback.

Owner STOP cancels unconsumed canonical reservations; correctness never depends on
physical Queue cancellation. Owner CORRECT invokes authoritative reconciliation
itself and requires OFF/HALTED, no RESERVED/RUNNING/UNKNOWN invocation, active
claim/lease or dead letter. It cancels unused plan uses and records cause removal;
consumed vs cancelled uses remain distinct. It never edits job attempts, results,
receipts or timestamps. RESUME before this correction fails PT409
`SUPERVISOR_FAULT_CORRECTION_REQUIRED`.

The unchanged effective lease is `coalesce(lease_expires_at, started_at + 90 seconds)`.
Expiry/reclaim uses that real deadline and existing backoff, never timestamp edits.
Terminal job recovery uses `DIRECTOR.REQUEUE_DERIVED`: a new cycle, durable historical
attempt/error evidence, no manual success/reset/delete.

## Local proof and limitations

`node tools/reliability/certify-global-fault.mjs <focused|recovery|jobs|application|build>`
removes real credentials and preloads the existing remote-network denial harness.
PG17 runs only an owned Unix socket with real pg-safeupdate. Child consumers execute
the same private consumer and default worker adapter with socket SQL transport,
not an adapterFactory injection. Global 1/2/3, terminal HALT, outward UNKNOWN,
90-second lease and 150-second reconciliation use actual time.

The local provider boundary is modeled; no Vercel Queue is published. Hosted
fault proof remains a separately authorized run. Scoring/domain mathematics,
financial authorization, RLS policies, registered resource authority and private
worker cores are unchanged. No 864-hole rerun is warranted.

## Subsequent hosted plan — NOT executed

1. Reconfirm preserved OFF/disabled/paused checkpoint, zero required work/claims/
   leases/UNKNOWN/dead letters, current bound deployment and cycle-29 outputs.
2. Install only the exact v5 artifact with verified TLS owner installation;
   catalog/hash/metadata/history and replay proof. Faults default NONE.
3. Push/deploy the reviewed candidate and perform certified safe release rebind;
   retain the already-proven native consumer/provider path. No new provider resource.
4. Activate through existing certified owner controls, reporting actual admission/
   ingress and leaving match permissions unchanged.
5. Global test: owner `start-only` with four finite reservations (240 seconds).
   Immediately ARM `GLOBAL_TRANSIENT`, uses 3, against committed unpublished
   reservations, then existing Preview-native `publish`. No job demand is needed.
   Observe counts 1/2/3, HALT, denied fourth delivery; STOP, CORRECT, owner RESUME
   one healthy reservation. The separate deterministic case uses at most two ticks.
6. For each remaining job recovery case use only supported minimum secondary-match
   demand, arm the existing fixed job fault before START, then native publish.
   Do not re-run scoring-context preparation or fabricate Calcutta facts.
7. Lost ACK: `start-only`, ARM `INVOCATION_LOST_ACK`, publish after actual genuine
   demand. Inspect committed current outputs + UNKNOWN; duplicate delivery must
   not execute; STOP, wait natural reconciliation deadline, CORRECT.
8. DISAPPEAR: observe real claim, independent consumer termination and real effective
   90-second lease. Deny early reclaim, wait natural expiry and reconciliation;
   recover through ordinary subsequent queue ticks and durable backoff.
9. TERMINAL: retain dead-letter evidence; consumed synthetic cause removed, existing
   Director recovery/requeue, owner RESUME, normal queue drain.
10. SUPERSEDE: hold old claim, use supported Director scoring-lock on the UPCOMING
    secondary match to advance true match source revision while closing authority;
    no preparation, scores or financial facts. Verify actual source/cycle advances
    before RELEASE; deny stale current publication, recover/drain current demand.
    If the preserved fixture's lawful operation cannot advance source, STOP for
    review instead of substituting a tee-time-only refresh or bypassing guards.
11. Two-slot CONTENTION and duplicate/out-of-order delivery: bounded independent
    reservations, same-reservation CAS, single canonical job owner/current output.
12. Reconcile/drain all currently-required work and UNKNOWN outcomes. Owner STOP;
    CORRECT global plans, disabled scoring/Director admission and paused ingress.
    Preserve primary FINAL, secondary lawful synthetic state, audits and histories.

The owner CLI adds `start-only`, `arm-global`, `correct-global`; existing healthy
`start` still commits then delegates publication to the exact Preview runtime.
`start-only` intentionally does not acquire publisher transport credentials.
No local native publisher, public fault endpoint, pg_net, Vault, HMAC or Google
is reintroduced. No hosted command in this document is authorized by the local run.
