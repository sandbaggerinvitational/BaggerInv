# Private Queues finite-batch supervision v2

This is a local Certification candidate, based on fe3f780e14d0110816c3c6373505c7ffa3e97df6
with the retained provider-review documentation commit b8daba7e. No hosted
installation, queue publication, credential provisioning or deployment occurred.
The owner's retained hosted checkpoint remains application a4bb57b1, supervisor
OFF, admissions disabled and ingress paused. That checkpoint was not queried in
this task.

Owner START commits the complete finite reservation set. A separate owner tool
publishes delayed messages to one fixed Vercel topic, explicitly pinned to the
currently bound immutable Preview deployment. The private consumer revalidates
provider runtime identity, current canonical binding and its one-time reservation
before calling the existing bounded worker. Queue delivery is a wake mechanism;
canonical database job claims remain the final processing authority.

## Limits and unchanged contracts

- OFF by default; one slot normally; two slots only with an owner-armed,
  expiring, source-bound Certification contention plan.
- START: 60–7,200 seconds, exactly 60-second cadence, 1–120 total reservations,
  constrained by duration. First invocation is due after ten seconds. Each
  reservation has a 30-second admission window; unconsumed late delivery denies.
  Two-slot testing pairs reservations at the same minute without enlarging the
  total budget. This is a finite window, not an indefinite scheduler.
- One existing worker cycle; 45-second cooperative cutoff; configured Vercel
  provider maximum 60 seconds. Local proof does not certify provider termination.
- Existing claim CAS, 90-second lease, attempt/backoff/five-attempt source-cycle
  ceiling, dead-letter, current-source guards and Director recovery stay intact.
- Four permitted engines: TEAM_MOMENTUM, TOURNAMENT_STORYLINES,
  TOURNAMENT_INTELLIGENCE and PROJECTION_EDITORIAL. Eligible nonempty Calcutta or
  FinalRecap scope fails closed. Empty current Calcutta has no financial demand;
  Odds publication, Google and messaging are absent.
- START/STOP do not enable competitive admission. Invocation BEGIN/STEP require
  separately enabled canonical admission/open ingress. Activation changes its
  revision: activate before START, not between START and consumption.
- STOP cancels unused canonical authority and preserves outcomes, publication
  evidence and the halt latch. Running uncertainty is reconciled from canonical
  work after the deadline. No physical queue cancellation is needed.

## Repository components

| Component | Role |
|---|---|
| certification-worker-queue-supervision-v2.sql | Private forward control/ledger correction; owner minting, publication, consume CAS and reconciliation |
| certification-queue-control.mjs | Managed-owner START/STOP/STATUS/reconcile and finite SDK publication; no browser API |
| certification-queue-supervision.js | Strict runtime/message adapter into the existing bounded supervisor |
| internal/derived-worker/queue/route.js | Provider-private Queues callback when registered with the Certification manifest |
| vercel.certification-queue.json | One fixed queue/v2beta trigger; maxDeliveries 5; provider ceiling 60 |
| internal/derived-worker/run/route.js | Retired public path; unconditional 403 |

The ordinary vercel.json has no new queue configuration. Production therefore
receives no queue trigger, publisher or enablement. A consumer route without
native private registration defaults closed; `BAGGER_CERTIFICATION_QUEUE_TRANSPORT`
is absent/OFF until separately authorized native privacy checks pass. Historical
v1 parsing/helpers remain for historical proof, but neither the shipping public
route nor the corrected database exposes the old HMAC transport.

## Proof layers

The local tests use owned socket-only PostgreSQL 17, real canonical wrappers,
fixture demand, processors, claims, outputs, recovery and SQL authorization.
Queue publication/delivery and Vercel system identity are injected local models.
No Vercel service is contacted by the tests. Crash proof kills a real child after
its canonical claim, waits the actual 90-second lease and 150-second invocation
reconciliation deadline, then reclaims normally. No rows are corrupted to simulate
expiry or success. Independent worker processes exercise actual SQL claim CAS.

The producer is the already-certified owner synthetic secondary-match
setup/preparation operation. It changes only the fixed synthetic tee-time setup
fact and calls canonical preparation, causing genuine required demand. It does
not INSERT a job, force rebuild, call a processor or disable a shipping after-hook.
The tests verify zero request-path worker claims before private queue delivery.

The broad suite uses the same frozen 493 application files and compares the exact
20 established failures. Thirteen tests with literal complete dependency
inventories now include the authorized @vercel/queue 0.7.0 addition; their product,
presentation and request assertions remain intact. No History/Awards source changed.

See [protocol/security](PROTOCOL.md), [hosted acceptance and installation](HOSTED-ACCEPTANCE.md)
and the machine receipts under evidence/. Local PASS is not hosted Part 2B-1 PASS.
