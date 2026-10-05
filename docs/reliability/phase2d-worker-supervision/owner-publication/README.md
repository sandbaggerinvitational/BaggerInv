# Owner Queue-publication identity remediation

**Local certification: PASS. Hosted provider acceptance: PENDING.**

Base: `71d6a3932af7bef735a089cd1a63deb1b62e581d`.
Worktree: `/private/tmp/bagger-worker-provider-portability`.
Branch: `codex/worker-provider-portability`. Local commit only; no push/deploy.

The local owner project token was correctly rejected because its signed identity
is development. Preview variable loading does not establish a Preview Function
runtime. The strict Preview publication predicate is retained. See the
[provider review](PROVIDER-CONTRACT.md) for documented facts, retained hosted
evidence, installed SDK behavior and remaining unknowns.

Owner START still runs through the existing private SQL owner control. A narrow
owner-issued, 60-second single-use digest handoff delegates publication of the
committed finite batch to the exact Preview Function. That Function obtains its
native OIDC, validates Preview/team/project, checks server-derived runtime and
current canonical binding, and uses the existing Queue SDK with explicit
deployment pinning. The owner CLI no longer constructs a Queue publisher.
Its development token is only protection self-access, not publication authority.

No reusable secret, Vault, pg_net, HMAC or public worker authority is introduced.
Participant, anon, authenticated, Director and bare service_role callers cannot
mint publication handoffs/worker reservations or START. The existing server role
is transport for a one-use owner delegation, not owner authority. Topic/body/delay
are fixed or canonical-state derived; clients cannot supply them. Production,
development, wrong resource/project/release/deployment and stale epoch/revision
remain denied.

START commit and Queue publication are not atomic. Partial/unknown publication
remains durable, re-publication preserves epoch/idempotency keys and budget, and
STOP invalidates unconsumed authority. Publisher disappearance waits for finite
session expiry before owner recovery. The existing invocation ledger, consumer
CAS, reconciliation, claims, worker, retry/backoff and dead-letter machinery are
reused. See [protocol](PROTOCOL.md).

Local evidence:

| Check | Result |
|---|---|
| Focused publication/security/consumer proof | 38 pass / 0 fail / 0 skip |
| Frozen broad regression | 4,077 pass / 20 established failures / 0 skip |
| New unexplained failures | 0; baseline failure names/counts match exactly |
| Build | PASS, including Node publication route and pinned Queue SDK |
| Dependency manifest/lock | Byte-identical to base; existing Queue dependency supplies OIDC helper |
| Fresh v1 → v2 → publisher v3 and v3 replay | PASS; v1/v2 receipts preserved |
| Consumer/retired worker route | Byte-identical to base |
| Existing consumer reservation single use | Real local SQL CAS, concurrent delivery and lost-ACK proof PASS |
| Existing RLS/roles/private cores | Unchanged; new private tables deny application access |
| 864-hole/domain rerun | NOT REQUIRED; no scoring/domain semantics changed |

All test executions remove hosted credentials and deny remote application sockets.
Local Queue sends are injected; runtime identity validation and SQL authority
predicates are exercised rather than mocked away. No claim of native provider
publication is made. The owned local expiry/restart models advance only local
permit timestamps; existing consumer expiry also receives real elapsed-time
proof. No hosted row or clock is altered.

The first sandbox run could not create PostgreSQL shared memory and was rerun with
local process permission. An initial unnecessary direct OIDC declaration caused
13 dependency snapshot failures. Removing it restored the exact baseline; the
initial result is retained separately. No test assertions were relaxed to absorb
those failures.

Evidence: [focused](evidence/focused.json), [regression accounting](evidence/regression-accounting.json),
[build](evidence/build.json), compressed raw TAP and source hashes alongside them.

Changed implementation:

- `lib/certification-queue-publication.js`: shared finite accounting loop.
- `lib/certification-queue-publisher.js`: bound Preview identity/owner handoff adapter.
- `app/api/internal/derived-worker/publication/route.js`: protected, capability-only owner publication route.
- `tools/reliability/certification-queue-control.mjs`: SQL owner control → Preview handoff; local SDK publication retired.
- `supabase/production_incremental/certification-queue-preview-publisher-v3.sql`: exact forward correction.
- Focused tests and `tools/reliability/certify-queue-publisher.mjs`.

Hosted mutations, queue publications, supervisor START and worker executions in
this task: **0**. The retained hosted checkpoint remains supervisor OFF,
admission disabled and ingress paused. Production/old Preview/Google/messaging:
no requests/actions. No provider configuration or historical migration changed.

Immediate hosted resumption: **NO**. The candidate is ready for owner review and
separately authorized installation/deployment/provider acceptance. Real Queue
entitlement, Preview OIDC/protection, pinned delivery, metering/retry/termination
remain unproven. The former "OFF-state publish before START" order is incompatible
with the required owner-START publication boundary. The proposed harmless
one-tick/no-work acceptance window needs explicit owner approval; it is not
silently enabled here.

Next owner action: authorize publisher-v3 installation, exact candidate deployment
and safe rebind, plus the narrowly bounded provider acceptance sequence in the
[hosted plan](HOSTED-PLAN.md). Autonomous Part 2B-1 execution stays gated on real
provider acceptance. Part 2B-2 is not started.
