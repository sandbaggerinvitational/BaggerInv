# Native Queue retry envelope and visibility contract

Base: `720857e17a39f088b86583a22f6722812a695147`. Local remediation only.
No hosted reads, mutations, publications, worker starts or deployment.

## Evidence and provider contract

The retained hosted observations are authoritative: requested TTL 608 seconds;
actual TTL 607.324; delay 68.291; post-schedule horizon 540.411; initial provider
visibility about 300 seconds; SDK renewal at 59.940 seconds, requesting 90
seconds, accepted HTTP 200 below actual expiry. There were no visibility-expiry
errors. Real provider termination was HTTP 504 at the 60-second ceiling. The
90-second canonical lease denied early reclaim, expired naturally, and autonomous
reclaim advanced attempts 1 to 2 with four current outputs and no duplicates.

The offline receipt checker now accepts this retained proof. It distinguishes
90-second SDK renewals from shorter retry directives. Three total PATCH receipts
are one SDK renewal plus two retry directives, not three periodic renewals.

Current official primary sources:

- [Vercel Queue SDK](https://vercel.com/docs/queues/sdk): callback completion
  acknowledges; the retry callback can return `afterSeconds` or `acknowledge`.
- [Queue API](https://vercel.com/docs/queues/api): authenticated, deployment-bound
  receive-by-ID supports zero visibility; provider responses carry actual
  creation/expiry. Visibility requests cannot extend beyond expiry.
- [Queue concepts](https://vercel.com/docs/queues/concepts): physical delivery
  retry, expiry and backoff; no native built-in dead-letter queue.
- Installed `@vercel/queue@0.7.0`, `ConsumerGroup.startVisibilityExtension`:
  first interval uses the remaining provider visibility deadline; subsequent
  intervals use configured visibility. Both apply `min(60,max(10,seconds/5))`.
  A 300-second initial deadline gives a first renewal near 60 seconds; configured
  90-second visibility gives subsequent intervals of 18 seconds if execution
  lawfully continues. The test's previous 18/36/54 sequence assumed an initial
  90-second window. It was never a shipping/provider requirement.

## Visibility invariant

Every requested visibility deadline must be strictly less than actual provider
`expiresAt`. For completed responses the conservative deadline calculated from
response completion plus requested seconds must also be below expiry. Initial
provider visibility is checked separately. No SDK assumed 24-hour expiry is
accepted as actual provider metadata. Accepted renewal proof requires at least
one accepted 90-second renewal when exercising a lifecycle that requests one;
short successful ticks need no renewal. Fixed timestamps/counts are not required.

The existing constants remain identical: 45-second soft cutoff, 60-second
function ceiling, 90-second canonical lease/SDK visibility, 30-second clock and
network margin, actual remaining lifetime strictly above 180 seconds at SDK
entry, and 540-second post-schedule transport horizon. Neither visibility nor
retention extends canonical reservation execution authority.

## Root cause and bounded correction

The first NOT_DUE/BUSY delivery already used the SDK's delayed retry directive:
its visibility PATCH and callback response were HTTP 200. Provider redelivery
then used a routing-only v2 notification, without prefetched receipt/creation/
expiry headers. The pre-SDK guard rejected that valid notification as missing
timing and returned HTTP 503 (12 retained observations). BEGIN had not consumed
the reservation, and no worker/job attempt began on those probes.

Prefetched callbacks keep the existing raw provider timing guard. Routing-only
callbacks now perform a bounded zero-visibility receive-by-ID lookup using
provider runtime OIDC and the exact bound deployment, fixed iad1 endpoint and
fixed Certification topic. Actual immutable expiry is established before the
unmodified SDK receives with 90-second visibility. SDK handler metadata must
match that actual message ID/creation/expiry exactly before canonical BEGIN.
Missing, malformed, changed or exhausted timing fails closed. Lookup is limited
to one 8-KiB response with a five-second deadline; no inferred expiry, destination
selection, generic proxy, new worker engine or reusable credential is introduced.

Consumer-group identity is native routing metadata from the private provider
trigger, validated as a bounded name. It cannot supply Bagger resource, release,
deployment, reservation, queue topic or destination authority. OIDC and exact
runtime/resource checks precede dispatch; canonical BEGIN remains authoritative.
The provider's public/private consumer boundary is retained unchanged.

## Outcome matrix

| Canonical/native result | Queue envelope | Worker/job effect |
|---|---|---|
| Successful committed invocation | SDK ACK/DELETE; HTTP 200 | Truthful completion |
| `SUPERVISOR_NOT_DUE_OR_BUSY`, NOT_DUE detail | SDK `afterSeconds`; HTTP 200 | No admission or job attempt |
| Same code, BUSY detail / publisher busy | SDK delayed retry; HTTP 200 | No admission or job attempt |
| Exact `42501` authority denial | SDK ACK/DELETE; HTTP 200 | Denied, not worker success |
| Exact stale authority `PT409` | SDK ACK/DELETE; HTTP 200 | Denied; no future authority inferred |
| STOP/HALT/stale epoch, expired/replayed invalid reservation | Canonical denial/ACK, or durable duplicate observation | No second tick |
| Provider receive 404/409/410 | Native skipped notification, HTTP 200; no DELETE | Missing/locked/processed message cannot execute |
| Connection/timeout, `57014`, class `08` | Bounded retry/reconciliation | Never assume rollback |
| `40001` / `40P01` | Existing transaction retry/reconciliation | Predicate/attempt contracts preserved |
| `SUPERVISOR_ACK_UNKNOWN` or durable RUNNING/UNKNOWN | Retry/reconcile from ledger | Never consume a second time |
| Unexpected programming/infrastructure SQLSTATE | Failed SDK delivery/HTTP 500, no ACK | Visible failure, finite provider budget |
| Lawful terminal job outcome | Durable terminal receipt, message ACK | Dead letter remains; recovery stays owner-controlled |

HTTP 200 for an explicit delayed retry means the provider accepted the transport
directive. It is not a worker-success receipt or deletion of unfinished work.
Undefined retry directive leaves the delivery failed, not falsely acknowledged.
The application caps admissible consumer deliveries at five; that is not a
proven provider physical-delivery cutoff. The unchanged manifest contains
`maxDeliveries:5`, but current official documentation does not establish that
field as a supported native cutoff. Vercel documents retries until expiry and
forced backoff after 32 attempts. Correctness relies on finite actual TTL, the
canonical invocation budget, reservation CAS and application admission cap, not
that undocumented manifest field. The five-second provider retry delay remains
unchanged. Exhaustion stays visible for owner reconciliation. Job attempts,
durable backoff/dead letters, supervisor failure counters and HALT are separate.

## Retry timing and forward correction

`certification-queue-retry-envelope-v6.sql` adds only sanitized `DETAIL` to the
existing `SUPERVISOR_NOT_DUE_OR_BUSY` exception in one function. All predicates,
SQLSTATE and mutations remain identical. NOT_DUE supplies the rounded-up relative interval to the canonical maximum
of scheduled time and supervisor `next_at`; BUSY supplies a 15-second probe interval.
Relative intervals avoid database/runtime clock-skew errors.
The adapter accepts only those two fields from that exact typed error. It honors
that relative interval, with a five-second minimum; legacy missing detail uses 15
seconds. Every retry must fit below actual expiry including the margin and the provider
3,600-second visibility ceiling; otherwise it fails visibly without ACK or an
impossible PATCH. Redelivery
always rechecks canonical authority. Slot availability is never promised by a
transport delay, and no job attempt increments until canonical admission/claim.

The forward install is atomic, OFF/disabled/paused and resource/physical-project
guarded. Exact v5 predecessor/postimage hashes and owner/ACL/security/search_path
metadata are checked; v1-v5 receipts are preserved. A new private installation
receipt records the correction. Replay converges without rewriting history.
Existing RLS/roles/worker cores and provider configuration are unchanged.

## Subsequent hosted sequence (not executed)

1. Reconfirm the preserved clean checkpoint and current deployment binding.
2. Separately authorize push, exact v6 forward installation while OFF/disabled/
   paused, candidate deployment and safe owner release rebind.
3. Retain accepted TTL, termination, natural lease expiry and reclaim proofs.
   Verify actual visibility receipts with the offline checker and `--visibility`.
4. Exercise one bounded early delivery: native delayed retry is accepted; the
   routing notification obtains actual expiry, passes SDK processing and rechecks
   canonical authority. This real zero-visibility provider lookup is the new
   hosted acceptance gate; do not weaken it if provider behavior differs.
5. Continue only incomplete transient/backoff, terminal/recovery, source
   supersession, same-reservation/two-slot/out-of-order/claim-expiry concurrency,
   authority negatives and late-STOP gates. Do not repeat the successful
   termination/reclaim sequence unless new evidence shows impact.
6. Reconcile/drain, owner STOP, return admissions disabled and ingress paused;
   require no current work, claims, leases, UNKNOWN or unexpected dead letters.
   Part 2B-2 remains unauthorized.

Cost: no fixed resource. Routing retries add one authenticated peek operation
before the SDK's normal receive. Actual metering remains a hosted measurement;
no Queue was created or used during local certification.
