# Queue retention and visibility contract

Base: `44784e8b80f1777752ece93fe7cab2d1029f67f4`. Local-only correction.
No hosted access/mutation, deployment, START, Queue publication or workers.
Retained owner-reported hosted checkpoint: supervisor OFF, admission disabled,
ingress PAUSED, admission revision 51, required work/claims/leases/UNKNOWN/dead
letters/reservations/handoffs/armed faults 0. This task does not claim a fresh
hosted readback.

## Evidence and provider contract

- **Observed hosted, retained:** the previous private consumer terminated at the
  configured 60 seconds. A renewal requested expiry 20:15:47.522Z for a message
  expiring 20:14:09Z; Vercel returned HTTP 400. Canonical natural 90-second lease
  recovery separately succeeded. No authority bypass occurred.
- **Provider documented, reviewed 2026-10-05:** per-message TTL defaults to 24h,
  supports 60–604800 seconds; delay consumes the same lifetime and cannot exceed
  TTL. Visibility is relative to now, supports up to 3600 seconds, and cannot
  extend past actual message expiry. See [API](https://vercel.com/docs/queues/api)
  and [concepts](https://vercel.com/docs/queues/concepts).
- **Provider documented:** the callback exposes publication `createdAt` and
  actual `expiresAt`; successful handlers ACK, exceptions/default retry fail the
  delivery, and a retry directive can ACK or change visibility. See the
  [SDK reference](https://vercel.com/docs/queues/sdk).
- **Installed SDK 0.7.0:** its local delivery model computes expiry as
  `createdAt + retentionSeconds`; publication accepts/stores a delayed message
  immediately. Therefore the transport calculation includes publication-to-
  availability delay; it never assumes TTL starts at scheduled availability.
  Runtime decisions use real provider expiry, not inferred creation + default
  TTL. Actual provider timestamp/TTL equality is also a next-hosted-run check.
- **Installed SDK 0.7.0:** fixed 90-second renewals occur normally every 18 seconds.
  First renewal follows provider visibility-deadline metadata, using an interval
  between 10 and 60 seconds, or immediately for an elapsed deadline. The SDK does
  not clamp renewal to expiry. A 4xx stops its timer; retry directives can also
  issue a relative visibility change. These behaviors were read from the pinned
  source and exercised through the real SDK against a synthetic provider.
- **Repository contract:** maxDuration 60, soft worker cutoff 45, canonical job
  lease 90, reservation authority at most 30 seconds after scheduled time,
  reconciliation gate scheduled +150, cadence 60, five provider deliveries.
  Job retry remains its separate five-attempt source-cycle contract.
- **Inference/model:** the bounded healthy recovery horizon below assumes the
  certified 60-second runtime ceiling and 30-second dispatch/network/clock margin.
  It does not promise execution through indefinite outages, missing authority,
  repeated failures/HALT or an arbitrarily delayed owner reconciliation.

## Timing model and minimum retained horizon

Let `S` be the scheduled reservation time. Keep all SQL authority unchanged.
For one already-committed claim followed by disappearance:

| Bound relative to S | Seconds | Derivation |
| --- | ---: | --- |
| Latest admitted claim before termination | 90 | 30-second admission window + 60-second function ceiling |
| Claim expiry / earliest safe reconciliation | 180 | max(90 + 90-second job lease, 150-second reconciliation gate) |
| Next expiry-observation tick | 180 | next 60-second cadence boundary |
| Expiry sweep and durable availability | 275 | 180 + 30 dispatch margin + 60 runtime + 5 first-attempt backoff bound |
| Next fresh reclaim reservation | 300 | next 60-second boundary after 275 |
| Reclaim execution complete | 390 | 300 + 30 dispatch margin + 60 runtime |
| Last possible relative visibility deadline | 480 | 390 + 90 visibility |
| Deadline plus transport margin | 510 | 480 + 30 network/clock margin |
| Minimum complete cadence-rounded retention | **540** | ceil(510 / 60) × 60; 30 additional rounding seconds |

The first lease-expiry retry is 2 seconds plus deterministic 0–2-second jitter;
the model rounds this up to 5 seconds. Observation sweeps, then a **new lawful
reservation/message** processes the retry. A consumed reservation never reruns
its worker. Same-message redelivery reconciles/denies the old invocation; it does
not mint job recovery authority. Subsequent job failures retain their existing
backoff (up to 34 seconds), fresh-reservation and five-attempt contracts. Repeated
failure does not prolong either reservation or supervisor authority.

Publication computes, immediately before TRY/provider I/O:

```text
delaySeconds     = max(0, ceil((scheduled_at - publication_now) / 1000))
retentionSeconds = delaySeconds + 540
physical expiry  >= scheduled_at + 540 seconds
```

Malformed authority dates, authority beyond scheduled +30, unsupported delay, or
retention below this derived horizon fail before provider send. No client can
select retention, delay, target or message fields. Lost publisher ACK remains
UNKNOWN; START, TRY, native send and ACK remain separate commits. Duplicate
publication retains the same idempotency key. No distributed atomicity claim.

For the maximum one-slot START: `S[n] = start + 10 + (n-1)*60`, 120 reservations,
7200-second supervisor window. The last message has delay 7150 seconds and TTL
**7690 seconds (2h 8m 10s)** from immediate publication, well below 604800.
Every delayed message has its own full 540-second post-schedule horizon. The
last authority expires at start +7180, before supervisor +7200. Physical messages
can outlive that window. No finite-batch redesign is required. An expired window
cannot reclaim work without a separately lawful owner START/RESUME.

## Visibility and exhaustion

Keep the SDK's configured 90 seconds. Before invoking `handleCallback`, require
native queue/v2 small-body metadata with receipt, actual creation/expiry and
valid provider visibility deadline. No default-24h fallback or routing-only
callback is admitted. The two-field fixed message is far below 4KiB.

Require **remaining actual lifetime >180 seconds**:

```text
180 = function ceiling 60 + visibility 90 + network/clock margin 30
request time <= delivery start +60
requested visibility deadline <= delivery start +150 < message expiry -30
```

Repeat the actual-expiry guard at worker entry before canonical BEGIN. Initial
provider visibility is read/validated; the SDK then requests 90-second renewal.
This retains installed SDK parsing/renewal/ACK behavior without internal SDK
patching or a second worker/Queue implementation.

With missing expiry or insufficient remaining lifetime, the outer guard returns
sanitized **503, reconciliation required, worker_admitted=false**. It never starts
the SDK timer, performs receive/renewal/reschedule/ACK or calls BEGIN. This is a
failed physical delivery, not false successful acknowledgement or authorization
denial. Provider TTL/maxDeliveries bound further traffic. Existing owner ledger
reconciliation and a current subsequent reservation recover required work.

For an admitted handler, retry directives are emitted only if their deadline
plus margin fits actual expiry; otherwise return `undefined` (fail/default finite
delivery), never ACK or an impossible visibility PATCH. Existing deterministic
authority denials remain ACKs. The real SDK test observes renewals at 18/36/54
seconds and ACK at 59 seconds, even with only 181 seconds remaining at entry.
Network delays beyond the bounded margin or missing provider metadata are a
hosted STOP/reconciliation condition, not permission to weaken authority.

## Authority, domain and compatibility

Resource, physical project, release/deployment, Preview identity, current
generation/revisions, epoch, single-use digest, STOP/HALT and expiry checks stay
canonical. Private cores, owners/ACL/RLS, service_role mint denial, job claims,
source guards, calculations and five-attempt accounting are unchanged.
No credential/HMAC/Vault/pg_net; no Production configuration or Queue manifest
change. No SQL, migration, bootstrap or installation receipt change is needed.
Physical existence after expiry/STOP/stale epoch creates zero authority.

Owned PG17 + real safeupdate + actual child process proof qualifies a natural
90-second lease, early denial, reconciliation and new-message reclaim. SDK time
is modeled; database lease time is **not** shortened or rewritten. Local child
termination models the retained hosted 60-second observation; this task does
not claim fresh hosted provider termination.

## Cost

Current [Queue pricing](https://vercel.com/docs/queues/pricing) meters send,
receive, delete, visibility change and notify in 4KiB units; idempotent sends
cost 2 units. It lists no retention-duration/storage line item. This means the
longer TTL alone adds no listed charge, **not** that redelivery is free.
[iad1 pricing](https://vercel.com/docs/pricing/regional-pricing/iad1) lists $0.60
per million operations; Functions still incur normal compute charges.

Estimate, not hosted billing: 120 sub-4KiB normal small-body callbacks, 2 send
units +1 notify +1 ACK +up to4 renewal units = up to960 units, about **$0.000576**
before credits/tax and Function compute. Each further notify, retry, receive,
visibility or ACK attempt adds metered usage. maxDeliveries remains5; STOP does
not rely on physical cancellation. No new fixed-cost resource; hosted spend here0.

## Exact next hosted sequence (not executed)

1. Authorize push of the final local candidate, deploy exact SHA, safe release
   rebind; verify current fixture/authority, supervisor OFF and disabled/paused.
   **No forward SQL or Queue configuration change.**
2. Verify the new private consumer registration and real v2 creation/expiry
   metadata. Verify native publication TTL = derived delay +540 and actual
   provider expiry covers scheduled +540. Preserve earlier provider acceptance.
3. Activate only certified worker prerequisites; owner START a minimal finite
   window and publish through the exact Preview deployment.
4. Repro termination → real90-second lease → natural expiry → current subsequent
   reservation/reclaim; record every visibility deadline below actual expiry.
5. Complete only unproven 2B-1 transient/backoff, terminal/recovery, supersession,
   same-reservation/two-slot/out-of-order, claim/expiry race, remaining authority
   negatives and late STOP delivery. Validate genuine PENDING source before any
   fault; no scoring preparation or manual demand/processor invocation.
6. Reconcile/drain required work and all claims/leases/UNKNOWN/dead letters;
   owner STOP; disabled scoring/Director admission and PAUSED ingress. Preserve
   existing fixture, empty auction2, Odds0, FinalRecap ineligible/unprocessed.

Do not repeat proven HALT/RESUME or lost-ACK cases without a concrete timing
impact. Any material provider/source/authority defect: STOP, preserve evidence,
reconcile safely; no patch/redeploy inside that run. No Part2B-2 authorization.
