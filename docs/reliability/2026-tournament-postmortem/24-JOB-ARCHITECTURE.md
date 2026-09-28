# Background job architecture

## Goals

Jobs must survive deploys, worker crashes, timeouts and duplicate delivery without becoming invisible, unsafe to retry, or permanent blockers. They must preserve exact release and source authority without coupling every job to a deployment so tightly that a routine compatible release strands it.

The implementation order is intentional: database execution certification → current-pointer and bounded-plan foundations → receipts and semantic manifests → compatibility and the minimal event seam → durable workers. Mutual API design is tracked with `integrationDependencies`; it is not expressed as a reverse prerequisite.

## Job identity

A job is keyed by:

- domain and operation type;
- tournament and scope, such as Calcutta tournament or Net Skins round;
- contract version;
- semantic source-manifest digest;
- configuration/financial pointer revisions;
- request or contributing event lineage.

An active unique constraint prevents two jobs for the same semantic input/scope. A newer semantic input may supersede an older unclaimed job. It cannot silently replace a published or in-flight result.

## Lifecycle

```text
PENDING -> RUNNING -> SUCCEEDED
   |          |          |
   |          |          +-> result/current pointer transition
   |          +-> RETRYABLE (lease expired or classified transient failure)
   |          +-> FAILED (terminal input/code failure)
   +-> SUPERSEDED (newer compatible source)

Any nonterminal state -> CANCELLED only through an authorized domain policy
```

`STALE` describes input/result freshness; it is not a substitute for execution status. `READY` describes an output awaiting review/publication. Odds incident 016 showed why combining these dimensions makes a finished row look like a worker in progress.

## Claim and lease

Claims use a bounded lease, `FOR UPDATE SKIP LOCKED`, attempt limit, worker ID and unpredictable claim token. Completion requires the same worker/token, unexpired lease, exact job/source/configuration/contract and expected current-pointer revision. A heartbeat may extend a lease only up to a job-class maximum and records every extension.

Malformed lease input is rejected. Lease boundaries are tested below/at/above minimum/default/maximum. The Calcutta and Net Skins qualifier incidents show these initializer cases must execute in PostgreSQL before release.

## Failure classification

| Class | Example | Automatic action |
|---|---|---|
| Transient infrastructure | connection reset before transaction, worker crash | Retry with same job after bounded backoff |
| Unknown completion | response lost after commit possibility | Query receipt/job/result; no blind retry |
| Source advanced | newer score/configuration/pairing | Supersede retained output; enqueue current source |
| Contract incompatible | release cannot safely execute old job | Block release/job and require explicit transition |
| Deterministic code/input | SQL 42883, validation failure | FAILED; stop unchanged retries |
| Operator review | financial result ready | READY; no auto-publication unless domain policy explicitly allows it |

## Release compatibility

Every release candidate runs a job disposition gate:

1. List nonterminal jobs and unpublished READY outputs.
2. Resolve the running/current release contract version for each class.
3. Drain, supersede, block or produce an exact carry-forward plan.
4. Test claim/complete against the candidate definitions.
5. Record the chosen disposition in the release plan and receipt.

Activation equality remains enforced. A carry-forward changes job authority only through a private transition that proves contract/source/configuration compatibility. Incident 011's exact-job repair is the bounded example; it should become planned infrastructure rather than emergency SQL.

## Receipts and operator access

Every job action creates an immutable receipt: enqueue/coalesce, claim, lease extension, complete, fail, supersede, cancel and carry-forward. Receipts include safe metadata and hashes, never secrets or full financial payloads.

Director shows:

- job status and freshness separately;
- source/configuration/contract versions;
- attempts, lease owner/expiry and last safe error;
- contribution/event lineage;
- result and publication references;
- why it blocks another action;
- one supported next action.

The Odds stale-job operation changed the retained row but had no separate immutable operation receipt (`/private/tmp/bagger-r3-odds-clearance/REPORT.md:17-21`). The 2027 contract closes that observability gap.

## Worker scheduling

Use independent queues/concurrency pools:

1. Canonical event invalidation and receipt reconciliation.
2. Tournament-critical score mirrors/archives.
3. Current-round side-game calculations.
4. Participant projections.
5. Historical rebuilds and diagnostics, disabled during live tournament unless explicitly authorized.

Historical work never shares an unbounded query with a live job. Per-domain concurrency is capped. Queue lag and oldest event age are alertable.

## Acceptance

- `NA-2026-011`: claim races, expiry/reclaim, attempt exhaustion, duplicate delivery, lost completion, stale completion, exact release disposition across compatible and incompatible candidates, and current-pointer compare-and-swap; guards stay exact.
- `NA-2026-018`: immutable receipts for success, no-op, denial, failure, supersession and unknown outcome.
- `NA-2026-016`: stale unpublished, current published and active calculation states each produce the correct blocker/action.

## Evidence

- Calcutta job schema/invariants: `supabase/production_migrations/202608290056_production_calcutta_v1.sql:187-263`.
- Net Skins job schema/invariants: `supabase/production_migrations/202608290055_production_net_skins_v1.sql:78-153`.
- Activation-stranded job: `/private/tmp/bagger-calcutta-processor-repair/REPORT.md:82-109`.
- Odds orphan READY job: `/private/tmp/bagger-r3-pairing-blocker/REPORT.md:72-92`.
- Unknown Open outcome: `/private/tmp/bagger-r3-open-outcome/REPORT.md:1-11`.
