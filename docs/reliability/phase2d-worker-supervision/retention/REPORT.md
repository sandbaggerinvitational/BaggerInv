# Queue retention remediation — local PASS

Base: `44784e8b80f1777752ece93fe7cab2d1029f67f4`.
Worktree: `/private/tmp/bagger-worker-provider-portability`.

The candidate separates physical Queue lifetime from canonical authority:
per-message TTL is **remaining scheduled delay +540 seconds**. Reservation
authority remains at most30 seconds, supervisor duration at most2 hours,
canonical job lease90 seconds, and STOP/HALT/epoch/resource/release/deployment
checks remain unchanged. The nine-minute horizon is derived from the worst
bounded recovery graph (510 seconds, rounded to the next60-second cadence).
[CONTRACT.md](CONTRACT.md) contains provider references, derivation, cost and the
exact subsequent hosted sequence.

Before the SDK starts a lease timer, real native message expiry must leave
**more than180 seconds**. Otherwise no SDK receive/renewal/reschedule/ACK or
canonical BEGIN occurs: sanitized503 requests reconciliation/next reservation.
The SDK keeps90-second visibility. All issued renewal deadlines within the
configured60-second runtime fit actual expiry with30-second margin. Retry
directives also check actual expiry. No SDK internals or worker engine replaced.

## Final local proof

| Check | Result |
| --- | --- |
| Focused timing/security/scheduler/SQL regression | 107 pass /0 fail /0 skip |
| Actual ownedPG17 + safeupdate + child recovery | 5 pass /0 fail /0 skip |
| Broad established493-file selection | 4077 pass /20 established failures /0 skip |
| New unexplained failures | 0 |
| Production build | PASS |
| Final executable manifests | Stable and match current files |
| 864-hole rerun | Not required; no scoring/domain change |

The broad raw test process exits1 for the same20 established failures. Accounting
accepts only that established set and count; it does not label them all passing.
Provider credentials were removed, only owned local databases were used, and
remote transport was blocked. Only synthetic SDK/provider requests were modeled.
TAP evidence is retained losslessly as gzip; JSON records its uncompressed hash.

The owned database created the real maximum7200-second START with120 canonical
reservations. All120 TTL plans include delay +540; the maximum initial delay7150
and TTL7690 are below the provider604800 maximum. STOP invalidated this unused
batch without enabling admission or processing work.

A real separate consumer claimed required synthetic work and was SIGKILLed after
60 seconds to model the retained hosted provider termination. The90-second job
lease remained real. An independent early invocation was denied, preserving
attempt1 and exact ownership timestamp. A still-live original message could not
revive its expired/consumed reservation. Lease expiry and150-second reconciliation
were observed in actual wall time, without timestamp writes. Two later independent
ticks swept/backed off/reclaimed lawfully. Attempt1→2, exactly one current output
for all four families, no duplicate tick, and complete drain passed. Successful
reclaim completed about178 seconds after the original schedule, within physical
retention. No visibility-expiry error occurred in the modeled SDK transport.

The real pinned SDK test parsed native callback metadata, issued renewals at
18/36/54 seconds, and ACKed at59 seconds with only181 seconds remaining at entry.
Every actual synthetic PATCH deadline remained below provider expiry. Near-expiry
deliveries never entered the SDK; invalid retry deadlines were not issued.

STOP and stale epoch denial, live-message/expired-reservation denial, lost publisher
ACK accounting, duplicate/uncertain BEGIN, HALT/RESUME, owner/client/service-role
negatives, wrong resource/project/deployment/Production and private ACL boundaries
were covered by affected suites. No new hosted claim is made.

## Exact source impact

Application files:

- `lib/certification-queue-timing.js` — finite timing constants, publish planning,
  real-expiry guard and retry-deadline check.
- `lib/certification-queue-publication.js` — derived TTL, pre-TRY timing validation.
- `lib/certification-queue-supervision.js` — real-expiry guard before BEGIN.
- `lib/certification-queue-errors.js` — reject impossible reschedule deadlines.
- `app/api/internal/derived-worker/queue/route.js` — guard before SDK lease timers.

Tests/tooling:

- `test/certification-queue-timing.test.mjs` — formula, full batch, SDK/API timing,
  near-expiry and publication/retry evidence.
- `test/certification-queue-retention.integration.test.mjs` — realPG/child proof.
- `test/certification-queue-publisher.test.mjs` — scoped byte-equality assertion
  retains unchanged engine/retired ingress while allowing the transport correction.
- `test/certification-queue-supervision.test.mjs` — use one fixture clock so its
  nominal30-second authority interval is exactly30 seconds, not occasionally30s+1ms.
- `test/support/reliability/certification-queue-fixture.mjs` and
  `test/support/reliability/certification-supervisor-child.mjs` — modeled actual
  Queue creation/expiry metadata without altering real database lease time.
- `tools/reliability/certify-queue-retention.mjs` — isolated checks and evidence.
- This retention documentation/evidence directory.

Byte-equal to base: worker calculations/orchestration/job-fault transport,
score-derived delivery, SQL/forward artifacts, package/lock and both Vercel
manifests. No schema, migration, RLS, ACL, owner, registration, admission,
scoring/financial semantics, role or credential change. Empty auction2 creates
no financial work; local final Odds0 and FinalRecap ineligible/unprocessed.

## Hosted boundary and handoff

Hosted mutated/deployed/STARTed/published/workers: **0**. Owner-reported checkpoint
preserved: OFF, disabled/paused, pending0, coherent fixture. No new hosted readback
was attempted under local-only authorization. No forward SQL or Queue manifest
installation is required. Push is deferred to separate hosted authorization.

Ready for owner authorization to push the exact candidate, deploy/rebind it,
verify actual native metadata/TTL, and repro termination/natural reclaim before
finishing only remaining unproven Part2B-1 gates. Do not repeat proven global
HALT/lost-ACK without timing impact. Final STOP/drain/disabled/paused required.
**Part2B-2 remains unauthorized.**
