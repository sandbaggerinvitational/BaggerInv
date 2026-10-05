# Queue envelope / visibility remediation

Status: **PASS — local remediation and certification**. Hosted retry repro is
pending separate owner authorization. The retained hosted retention, renewal,
termination and natural lease/reclaim evidence is accepted and preserved.

## Visibility and retention disposition

| Item | Result |
|---|---|
| Provider initial visibility | Approximately 300 seconds, observed hosted |
| SDK first renewal | Provider deadline controls the first interval; approximately 60 seconds here |
| Subsequent SDK interval | 18 seconds with configured 90-second visibility, when execution continues |
| Fixed 18/36/54 requirement | NOT REQUIRED; modeled initial-90-second assumption |
| Correct invariant | Every requested deadline and completed-response conservative upper bound strictly below actual provider expiry |
| Hosted SDK renewal | 59.940 seconds; requested 90; accepted HTTP 200 |
| Visibility errors | 0; retained receipt check PASS |
| Requested/actual TTL | 608 / 607.324 seconds, PASS |
| Requested/observed delay | 68 / 68.291 seconds |
| Post-schedule horizon | 540.411 seconds, PASS |
| Real provider termination | 60-second HTTP 504, PASS |
| Lease/reclaim | Real 90-second lease; early denial, natural expiry, autonomous attempts 1→2, four current outputs, duplicates 0, PASS |
| Overall retention | PASS; no termination/reclaim rerun needed for this correction |

The retained 59 receipts contain seven initial deadlines and three accepted
visibility PATCHes: one SDK 90-second renewal and two short retry directives.
The checker distinguishes those rather than reporting three SDK renewals.

## Retry envelope

Root cause: the first early/BUSY callback already used a successful SDK retry
directive. The subsequent native routing-only notification omitted prefetched
timing headers and was rejected before SDK processing. That guard generated the
12 observed HTTP 503s; no improper reservation consumption, worker execution,
job claim or competitive mutation occurred.

The private consumer now verifies routing-only retries with a bounded,
deployment-bound zero-visibility provider lookup before the existing SDK receives
and starts its visibility lifecycle. Exact actual expiry/creation/message identity
must match SDK handler metadata before BEGIN. The prefetched path keeps its
existing raw timing checks. OIDC is the same official helper already installed
and used by the reviewed publisher; package/lockfile and Queue SDK stay unchanged.

| Outcome | Correction / preserved behavior |
|---|---|
| SUCCESS | SDK ACK/DELETE; truthful invocation receipt |
| NOT_DUE | Canonical relative interval to due/next_at; minimum five seconds; SDK delayed retry, HTTP 200; no ACK of unfinished work |
| BUSY | Canonical 15-second slot probe; SDK delayed retry, HTTP 200; BEGIN rechecks authority |
| Provider message already locked | Supported skipped notification; no DELETE and no worker; existing owner keeps its lease |
| AUTHORITY_DENIED / expired / STOP / HALT / stale authority | Exact typed deterministic denial acknowledged; no worker authority granted |
| TRANSIENT infrastructure / connection / timeout | Existing bounded retry/reconciliation; no false successful ACK |
| UNKNOWN commit/ACK | Canonical ledger reconciliation; duplicate cannot start another tick |
| Terminal job outcome | Truthful terminal receipt and durable dead letter; invocation ACK once, existing owner recovery preserved |
| Unexpected programming/database failure | Failed SDK delivery; not ACKed as an authority denial |

Retry deadlines must fit actual expiry with the 30-second margin and the provider
3,600-second visibility ceiling. Missing expiry is no longer accepted by retry
classification tests. Relative database intervals prevent clock differences from
advancing retry before its canonical eligible time. NOT_DUE/BUSY are transport
probes, not job attempts. Job claims/backoff/attempts remain authoritative.

Current Vercel documentation describes physical retries until expiry, with forced
backoff after 32 attempts. The application's five admissible deliveries and the
manifest's legacy `maxDeliveries:5` are not proof of a physical provider cutoff.
No safety property relies on that undocumented cutoff. Provider configuration
was not changed. This distinction is clarified without changing executable logic.

## Authority and SQL

Reservation CAS, claim CAS, 90-second leases, STOP, HALT, resource/release/
deployment binding and all worker/domain/scoring/financial semantics are unchanged.
Existing RLS/roles/private-core protections are unchanged. Production remains
denied and unconfigured. There is no public worker authority, reusable secret,
Vault, pg_net, Google or messaging fallback.

Forward SQL is required:
`supabase/production_incremental/certification-queue-retry-envelope-v6.sql`.
One existing function gains only sanitized exception DETAIL (reason and relative
retry interval). Its exact predecessor hash is
`4fb00bc4d25645732a46174656186120b8139bf4fa9d0c7a13b418125597075e`;
postimage is
`26168835e5edd3448f7a38d64ce87c89d767b1f749fbd117d7ae77d7e16a2d33`.
The install is atomic, idempotent, OFF/disabled/paused and exact-resource guarded,
preserving metadata and v1-v5 history. Only a new private installation receipt
is added. No historical artifact or provider ACL is modified.

## Local proof

- Focused: **135 pass, 0 fail, 0 skip**. Real PostgreSQL 17 and safeupdate;
  predecessor/hash rollback, replay/history/ACL preservation; canonical early
  denial; genuine four-family demand without scoring preparation; installed SDK
  processing/claim/output/receipt; duplicate, STOP and security negatives.
- Node 24.21.0: **63 pass, 0 fail, 0 skip** using the installed Queue SDK and
  native loopback diagnostics. Initial five-minute visibility produces one
  accepted renewal near 60 seconds, not fixed three renewals. Early retry uses
  HTTP 200/PATCH, then routing-only lookup and normal SDK receive succeed.
- Broad: **4,077 pass / 20 established failures / 0 skip**. **0 new failures**.
- Build: **PASS**. Queue consumer remains private, Node runtime, maxDuration 60.
- Remote sockets denied and real credentials removed from certification runs.
- 864 holes: **NOT RUN**. Domain/scoring/worker processor semantics did not change.

The first broad run exposed dependency-list regressions from unnecessarily
declaring an already-installed OIDC dependency. The package set was restored,
and the final broad result matches baseline exactly. The provider-cap annotation
after functional tests is comment-only; evidence records exact inverse-comment
equivalence and the final build's source manifest.

## Source and hosted boundary

Base: `720857e17a39f088b86583a22f6722812a695147`.
Branch: `codex/worker-provider-portability`.
Worktree: `/private/tmp/bagger-worker-provider-portability`.
Candidate is committed locally; exact SHA is reported with the final response.
Push: **NOT PERFORMED** — this task authorizes local work only.

Hosted mutations: **0**. Deployment/publication/START/worker calls: **0**.
Supplied preserved checkpoint stays supervisor OFF; admissions DISABLED; ingress
PAUSED; pending/claims/leases/UNKNOWN/dead letters/reservations/handoffs/faults 0.
Fixture preserved. Production/old Preview/Google/real messaging accesses: 0.

## Next owner action

Authorize push of the committed candidate, Certification-only v6 SQL installation,
exact candidate deployment and safe release rebind, then one bounded native early-
delivery/routing-retry repro and only the remaining Part 2B-1 gates. The actual
provider zero-visibility lookup/counter behavior is a hosted acceptance check;
do not weaken the expiry guard if it differs. Preserve the already-passing
retention/termination/reclaim proofs. Drain/reconcile, STOP, disabled/paused.
Do not begin Part 2B-2.
