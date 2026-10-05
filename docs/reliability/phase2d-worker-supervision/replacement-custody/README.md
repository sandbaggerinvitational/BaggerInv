# Replacement worker custody review

Decision date: 2026-10-05. Status: **RECOMMENDED architecture, local model only**.
This is not a deployable remediation or hosted Part 2B-1 PASS. No hosted operation,
credential provisioning, schedule, worker, deployment or configuration was changed.
The installed supervisor remains OFF. The deployed application remains
`a4bb57b1067fa7c50c8120c6fe5778378827a221`.

## Recommendation

Use **Vercel Queues private push consumers with a finite, owner-started batch of
delayed wake messages** on the exact Certification deployment. Each delivery runs
one existing Node worker cycle, with the retained 45-second soft cutoff and an
explicit 60-second function ceiling. No permanent process, SQL HTTP dispatch,
Vault signing key, shared HMAC, protection-bypass credential, or third provider is
needed for waking the worker.

This differs from Vercel Cron. Cron still targets Production. Current Queues
documentation describes private consumers, automatic OIDC publishing credentials,
deployment-partitioned topics, delayed delivery, and bounded deliveries. Queue
availability/configuration on this account and the exact built private consumer
must be proven in a separately approved hosted run. Queues is currently beta.

Choose a finite batch rather than a consumer that endlessly republishes itself:
owner START establishes a bounded window/budget; a server-side producer publishes
only its fixed wake topic and exact current deployment; expiration stops the
window. There is no infinite successor chain or platform restart loop. For the
initial Certification implementation retain the reviewed maximum two-hour window,
120 ticks, one-minute spacing, one normal slot and two explicitly armed test slots.
Production can later use separately reviewed windows and configuration.

## Evidence classification

**PROVIDER-DOCUMENTED:** capabilities cited in [PROVIDERS.md](PROVIDERS.md).
**OBSERVED HOSTED / RETAINED:** the earlier rollback-only probe established
provider-owned pg_net grants and service_role Vault plaintext SELECT. No new
provider experiment was executed here. The current checkpoint is owner-supplied
and retained evidence, not a newly queried hosted checkpoint.
**REPOSITORY CONTRACT:** private controls, bound state, canonical worker and job
contracts exist at `fe3f780e14d0110816c3c6373505c7ffa3e97df6`. The review worktree
also contains the preceding portability evidence commit `b8daba7e`.
**INFERENCE / PROPOSED DESIGN:** a finite native queue batch is the least additional
infrastructure for this one-cycle worker. Managed private delivery is documented,
but is not a substitute for Bagger's own resource/admission/receipt checks.

## Options

| Option | Security / isolation | Worker reuse | Incremental fixed / metered cost | New surface and complexity | Production promotion | Verdict |
|---|---|---|---|---|---|---|
| A1 Vercel Cron | Production trigger; custom environment does not establish Preview Cron | Node reuse | $0 fixed on existing plan; function compute | Small; wrong target for Certification | Production-only review | Reject for this Preview |
| A2 Vercel private Queues delayed batch | Native private consumer; exact originating deployment; no database dispatch credential | Existing Node cycle unchanged | $0 new fixed; regional queue operations + compute | One SDK/private consumer, fixed producer and forward control adapter; medium | Separate resource/configuration/enablement; no automatic promotion | Recommended |
| A3 Vercel Workflow durable sleep | Private generated queue flow; default run pinning; no cross-provider wake secret | Existing Node worker in a step | $0 new fixed; events, storage, queue operations + compute | SDK/compiler, durable orchestration/event store; medium-high | Separate start/binding; old run must stop on rebind | Viable runner-up |
| B Scheduled Edge dispatcher | Edge key custody differs from Vault, but documented cron trigger uses pg_net and an API key/publishable key. Public/publishable trigger is not owner-only, and a queued secret trigger repeats the blocker | Node worker stays Vercel; new Deno dispatcher | $0 new fixed; Edge $2/million above quota + Vercel compute | Additional function, trigger auth and rotation; high | Separate project/function/key deployment | Not selected; custody and nonpublic wake proof pending |
| C Edge executes worker | Removes Vercel dispatch, but has same wake/auth problem; Node npm support is not complete compatibility proof | Deno port/bundle review required; no second engine permitted | $0 new fixed; Edge invocation/egress | 256MB / 2s CPU, restricted Node APIs; high | Separate function and project controls | Not selected |
| D Asymmetric Edge dispatcher → Vercel | SQL need only public key; private key can be in Edge environment in principle. Captured signed request remains a first-use capability; trigger custody still unresolved | Existing worker | $0 new fixed; two compute surfaces | Key rotation, receiver verification, trigger and bypass security; high | Separate signing keys/audiences/resources | Cryptography alone is insufficient |
| E Native short-lived identity + reservation | Vercel OIDC authenticates native queue producer. Plain OIDC subject is project/environment scoped, not proof of exact deployment or owner authorization | Existing worker | No fixed identity fee; underlying native execution cost | Native queue is enough; generic cross-provider federation adds work | Separate trust policy and binding | Use inside A2, not as sole worker authority |
| F New external service | Could isolate credentials and support supervision; not needed after A2/A3 | Node reuse | Provider/plan-specific; no supported $0 guarantee researched because unnecessary | New provider, deploy, credentials, monitoring | New Production service configuration | Reject additional infrastructure now |
| G Operator-started worker | Existing protected transport; no hosted scheduler credential | Exact existing runner | $0 new provider fixed cost; operator host/network/time | Low implementation, high operational duty | Explicit approved environment only | Viable 2026 fallback; autonomous certification remains incomplete |

Background `after()` / `waitUntil()` extends an existing request; it does not
independently wake an idle worker. The repository has an unrelated account-deletion
Vercel Cron, but no reviewed other worker hosting, Edge deployment or scheduled CI
workflow. It has no `workflow` or `@vercel/queue` dependency. Do not reuse the
account-deletion endpoint or introduce a Production dispatcher to reach Preview.

## Credential and control boundary

1. Provider-native OIDC authenticates publishing from the Vercel runtime. No
   reusable wake/signing secret is installed in Supabase. Do not put an OIDC
   token, existing Supabase server key, database password or owner credential in
   messages, workflow inputs, outputs, logs or evidence.
2. A queue-triggered consumer has no public URL according to the provider
   contract. A forged header, cookie, ordinary Auth JWT or generic pg_net call
   cannot turn an internet request into a private queue delivery. Keep the old
   public HMAC worker route disabled/deprecated; do not merely remove its HMAC.
3. Queue delivery alone is not application admission. Retain exact registered
   resource/project, initialized binding, deployment ID/origin/team/project/SHA,
   authority epoch/generation/revisions, supervisor ON/window/budget/scope, global
   admission and ingress guards. Derive context from runtime plus private control
   state, never a client target or `latest` alias.
4. Replace SQL HMAC/Vault verification with **owner-issued digest-only single-use
   reservations**. Generate random 256-bit proofs outside SQL. Owner provisioning
   stores only digests with binding/epoch/sequence/due/expiry. Raw proofs travel
   only in private native Vercel messages. service_role SQL must neither mint a
   reservation nor set its digest; private issuer remains owner-only. The existing
   service_role wrapper still requires a matching proof and complete context to
   consume it atomically. It must not become a service-role-only generic RESERVE
   or START operation. SQL-read access to a digest cannot yield the proof.
5. This digest-only issuer/BEGIN adapter is a **required future forward correction**,
   not implemented or proven by this review. No SQL-role ACL is weakened. Preserve
   existing private-core denials. The owner/server START handoff and partial-batch
   publication reconciliation require focused PostgreSQL certification before
   installation. The PoC uses injected object capabilities instead of real ACLs.

The Vercel provider/control-plane and authorized code deployers remain trusted:
they can execute code with the existing application credential. SQL-role denial
does not claim protection from a compromised application runtime, project
administrator or the hosting provider. Existing Supabase server credentials stay
in the Certification server runtime as before; this review creates none.

## Finite START / STOP / failure sequence

Owner PREPARE leaves supervisor OFF, records bound hashes/due times and publication
ledger. Fixed server producer sends messages with `delaySeconds` and bounded TTL,
an idempotency key derived from epoch/sequence, finite `maxDeliveries`, and explicit
normal concurrency 1. Confirm accepted sends before final owner START. Messages
observed during PREPARE cannot run work; their bounded retry/reconciliation must
preserve the start handoff. A missing publish acknowledgement is UNKNOWN until
reconciled; never mark the whole batch published solely from a lost response.

No immediate hot loop. Each due delivery checks current control state, consumes
one reservation, runs `runScoreDerivedWorker({maximumCycles:1,...})`, persists the
sanitized invocation result and acknowledges the platform delivery. Retried
deliveries reconcile existing invocation/canonical job state; they do not start a
second tick or reset attempts. Late/expired tickets are denied and accounted for.
Finite provider deliveries and durable three failed/uncertain invocations / five
transient global tick failures halt further work; deterministic global failures
halt immediately. Queue dropping a wake message is not Bagger job success; STATUS
must flag expired/missing expected invocations and an owner must reconcile/rearm.

STOP disables future reservation consumption before cancelling/ignoring remaining
wakes. Already-committed job results remain recoverable. A few platform deliveries
may still arrive and be acknowledged as dormant; STOP promises no new job claims,
not deletion of the deployment or instantaneous erasure of provider messages.
Release rebind invalidates the old epoch/batch. Old deployments can still receive
their native messages, but the Bagger binding must deny new work. Never rely on
promotion/rollback alone to stop workers.

Canonical database job CAS remains final authority. Its 90-second lease, source
cycle, durable retry/backoff, five-attempt ceiling, failure evidence and Director
recovery are unchanged. Supervisor state does not replace the job database. The
native queue is only a finite wake system. No autonomous Odds/FinalRecap/Calcutta
work is added; empty Calcutta remains inapplicable and FinalRecap ineligible.

## Asymmetric alternative

Not recommended for the selected native design. If ever needed, a dispatcher-only
private Ed25519 key can live in an independently protected function environment,
and a receiver needs only the public key. SQL stores public verification material,
never a private key. Sign method/path/origin/resource/deployment/release/reservation,
body digest and expiry. No arbitrary signer API, client identity or target input.
Rotation: owner installs the new public key/kid, replaces dispatcher private key,
retires old reservations/epoch, then removes old verifier after expiry. Production
must have distinct keys/trust and an independent owner start.

This prevents forging new tickets from the public key. It does **not** make a
captured still-valid ticket harmless before its first consumption: a capturer can
win the race and use the exact permitted operation, or deny the legitimate caller
its nonce. CAS prevents duplicate execution and expiry bounds exposure, but neither
authenticates which caller spent the ticket. Use a private provider delivery path
or a second noncapturable identity/channel; do not certify signing alone as a fix.

## 2026 operational decision

Autonomous supervision is not a scoring/domain prerequisite demonstrated by source.
An operator-started worker is a possible **separately owner-accepted operating mode**
for a three-day annual tournament: dedicated trusted non-sleeping host, named
primary/backup operator, sanitized liveness/failure monitoring, required-work
latency/drain checks and a restart/recovery runbook. Operator burden and recovery
latency are real costs. No such host/SLA or unattended supervision is proven here.
It cannot satisfy Part 2B-1's autonomous-hosted PASS or justify silently changing
2026 readiness criteria. Derived-data pickup while the process is running works;
restart after host/process loss requires the operator unless separately supervised.
No requirement to add a third paid platform follows merely from the annual event.

## Existing schema and implementation reuse

Keep OFF state, epoch/revision, binding, engine scope, expiry/budget, invocation
ledger, failure counters, halt latch, owner controls, reconciliation semantics and
Certification-only bounded faults. Keep the existing worker/delivery adapters and
canonical claim/lease/retry/dead-letter functions unchanged.

Deprecate Vault secret references/key reader, HMAC ticket issue/validation,
pg_net dispatch/response reconciliation, cron scheduler/provider-ACL normalization,
and the public HTTP worker ingress. Existing installed schema may remain OFF
unchanged **now**; before native execution review a forward transport correction
and installation-image/receipt update. Do not change historical migrations or
provider-owned ACLs. Production configuration remains absent/OFF.

## Local PoC and limits

`node --test test/replacement-worker-custody-poc.test.mjs`: **23 pass / 0 fail /
0 skipped**. Real existing `runScoreDerivedWorker` runs one cycle with modeled
tick/processors. Synthetic Ed25519 keys exist only in process memory. Tests cover
old-ticket preplay, model OFF/owner/private delivery, digest-only evidence, replay,
expiry, binding drift, contention, restart observation, budget and STOP.

No SDK/platform delivery, real SQL control adapter, canonical claim/lease processor,
hosted Edge custody, provider ACL or HTTP/private-function isolation is tested by
this PoC. The Symbol-based boundary is explicitly a local model. No runtime source,
schema, dependency, provider config or shipping behavior changed. Broad suite/build
and 864 holes were not rerun; this is an isolated design test, not a new application
candidate. Retain existing certified application evidence without claiming these
new tests certify hosted autonomy.

## Next bounded owner action

Authorize **local implementation/certification only** of the private Vercel Queues
finite-batch adapter and owner-issued digest-only reservation forward correction,
including START publication reconciliation and private build-output checks. Keep
hosted install/deploy/START separately gated. If private Preview consumer behavior
or safe owner-to-producer handoff cannot be preserved, STOP; use Workflow only after
review rather than silently broadening authority.
