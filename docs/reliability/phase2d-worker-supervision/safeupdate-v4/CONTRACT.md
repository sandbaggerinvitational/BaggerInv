# Queue supervisor safeupdate and transport correction

Local remediation only. Hosted cycle-29 jobs, supervisor OFF, admission revision 43 and deployment `917d6942350fa835c65b356951019d298a91a4f3` remain untouched.

## Root causes and scope

The retained hosted evidence records PostgREST 14.18's authenticator loading `supautils, safeupdate` with an eight-second statement timeout. The private consumer reached the correct Preview deployment, but Queue BEGIN's `UPDATE production_control.worker_supervisor_v1 SET last_invocation=i.invocation_id` lacked an outer predicate. pg-safeupdate rejected it with `21000`; the transaction rolled back before reservation consumption or worker admission. Job attempts and claims remained zero.

The Queue control and Preview publication transports inferred authorization from HTTP status. An unrecognized non-5xx PostgREST error became status 403; the retry helper acknowledged every status 403 and every fifth delivery. This falsely acknowledged an infrastructure failure. The existing native consumer route and worker engine are retained; only the two directly related transports share the new classifier.

The [mutation inventory](MUTATION-INVENTORY.md) covers all 25 active UPDATEs. Seven singleton mutations require correction. One already-qualified conditional STOPPING transition is narrowed to the same key/context. Three function bodies change: owner control, Queue RPC, owner reconciliation. The private Queue RPC also detects missing singleton state explicitly instead of translating it into an invalid-reservation denial.

## Singleton and forward installation

`worker_supervisor_v1.singleton` is boolean, NOT NULL, PRIMARY KEY, CHECK(singleton). The only legal key is TRUE; a second TRUE conflicts, FALSE fails CHECK and NULL fails NOT NULL. At most one row is possible; expected cardinality is exactly one. A happened-to-be-single-row assumption is not used.

Every unconditional singleton UPDATE targets `WHERE singleton AND epoch=s.epoch AND revision=s.revision`, using the row already locked by the canonical operation. `FOUND` must be true afterward or `P0001 / SUPERVISOR_SINGLETON_DRIFT` aborts the transaction. START checks FOUND after RETURNING. The conditional STOPPING→OFF transition may legitimately affect zero rows, but still requires key/epoch/revision. More than one affected row is impossible under the checked PK/CHECK contract. Initial owner reads use STRICT; Queue BEGIN reports missing singleton state as drift, independently of missing reservation state.

`supabase/production_incremental/certification-queue-safeupdate-v4.sql` is an atomic owner-only forward install with the existing installation advisory lock and admission lock. It requires exact Certification physical resource registration, OFF supervisor, disabled admission, paused ingress and no live invocations/claims/leases. Pending jobs are permitted and untouched.

It requires the exact receipted publisher-v3 predecessor image, verifies singleton constraints and exact old/new SHA-256 function bodies, applies exact counted substitutions, then verifies postimages and owner/ACL/security/search_path/language/volatility/parallel/strict metadata. Its new private receipt captures the historical v1/v2/v3 rows unchanged and the new image. Replay verifies the v4 image/history/metadata and makes no data changes. Catalog/receipt drift aborts. Historical artifacts and receipts are not edited; historical installers must not be replayed over v4.

## Queue error and acknowledgement matrix

| Canonical outcome/error | Classification | Queue effect |
|---|---|---|
| Valid BEGIN, admitted=true | Execute existing bounded worker | ACK only after callback succeeds |
| Consumed reservation, completed ledger | admitted=false, cycles=0 | ACK; never execute again |
| Consumed reservation RUNNING/UNKNOWN | admitted=false, uncertain=true | Retry/reconcile; no second worker |
| `42501 / SUPERVISOR_ADMISSION_DENIED` | Deterministic authority denial | ACK; no worker |
| `42501 / SUPERVISOR_RESERVATION_DENIED` (digest/expiry) | Deterministic authority denial | ACK |
| `SUPERVISOR_REQUEST_DENIED` (missing/bad reservation) | Deterministic authority denial with 42501 | ACK |
| `SUPERVISOR_RESOURCE_DENIED`, `SUPERVISOR_DEPLOYMENT_DENIED` | Deterministic authority denial with 42501 | ACK |
| `SUPERVISOR_DISABLED_OR_STALE` (OFF/STOP/HALT/stale epoch) | Deterministic authority denial with 42501 | ACK |
| `PT409 / SUPERVISOR_AUTHORITY_CONTEXT_STALE`, `SUPERVISOR_REVISION_STALE`, `SUPERVISOR_REQUEST_CONFLICT`, `CANONICAL_RESOURCE_CONTEXT_STALE` | Typed authority conflict | ACK; retain 409 |
| `PT409 / SUPERVISOR_NOT_DUE_OR_BUSY`, `SUPERVISOR_PUBLISHER_BUSY` | Temporarily busy | Reschedule bounded backoff |
| `21000` safeupdate, `P0001 / SUPERVISOR_SINGLETON_DRIFT`, unexpected SQLSTATE, unknown permission failure | Database/programming failure | Fail delivery, no ACK; provider retries bounded by maxDeliveries |
| Known connection SQLSTATE 08xxx, network failure, timeout, 57014, 502/503/504 | Transport/infrastructure uncertainty | Retry/reconcile; do not infer rollback |
| Genuine `40001`, `40P01` | Transaction rolled back; existing retry contract | Reschedule; canonical gates rechecked |
| Unexpected consumer/programming exception | Failed callback | Default provider retry, no fabricated ACK |
| Recorded job transient/terminal failure | Existing worker/durable job contract | Preserve attempt/backoff/dead letter and invocation outcome |

The recognized canonical code must be the complete message and have its expected SQLSTATE. Neither arbitrary HTTP 403 nor an embedded authority-code substring is sufficient. Raw DB message/details are not exposed. Unknown SQLSTATE is not automatically classified as a transient error.

Replay is a ledger outcome, not a new `RESERVATION_REPLAY` error. Expiry uses `SUPERVISOR_RESERVATION_DENIED`; STOP/HALT share `SUPERVISOR_DISABLED_OR_STALE`. These are the actual installed names.

## Provider mapping and failure accounting

Current [Vercel SDK documentation](https://vercel.com/docs/queues/sdk) distinguishes `{acknowledge:true}`, `{afterSeconds:N}` and default behavior. The unmodified installed `@vercel/queue` 0.7.0 source awaits the handler, ACKs on success, ACKs an explicit acknowledge directive, reschedules through changeVisibility for afterSeconds, and rethrows otherwise. Its native handleCallback then returns 500 for failed delivery. A rescheduled callback may itself return HTTP 200: the authoritative difference is lease PATCH versus ACK DELETE, not status alone.

[Current Vercel delivery documentation](https://vercel.com/docs/queues/concepts) says delivery is at least once, retries stop at expiry/maxDeliveries, and there is no built-in provider dead-letter queue. The existing Certification trigger remains maxDeliveries=5, retryAfterSeconds=5. At the fifth failed delivery the classifier does not claim success: the provider limit stops retries. The canonical invocation/publication ledger and owner reconciliation preserve outcome evidence even if the provider drops further delivery. No extra message, hot loop or attempt reset is introduced.

Pre-BEGIN database failure has no admitted invocation and changes neither job attempts nor supervisor tick/invocation counters. It is a provider/control-transport failure, visible in the failed delivery. After BEGIN, the existing durable TICK_RESULT/FINISH and unknown-outcome reconciliation account admitted worker failures. Job attempts remain solely in the canonical claim/retry/dead-letter protocol. The five-transient-tick and three-failed/uncertain-invocation ceilings remain unchanged.

Atomic BEGIN plus the durable invocation ledger prevents a retry from running twice: an uncommitted BEGIN can be retried; a committed BEGIN without acknowledgement yields RUNNING/UNKNOWN and no second worker. Owner reconciliation validates canonical job/claim state. A completed invocation can be acknowledged without repeating work. Canonical claims/CAS and source cycles remain the final output authority.

## Local proof limits

The real upstream pg-safeupdate module is built against PostgreSQL 17.11 and preloaded on disposable, socket-only databases. It rejects unqualified UPDATE/DELETE while corrected START/BEGIN/TICK_RESULT/FINISH/STOP/HALT/RESUME/reconciliation/publication succeed. No safeupdate mock or disabling setting is used.

The harness executes real installed SQL as `SET ROLE service_role` with synthetic JWT role context and maps real SQLSTATE into modeled PostgREST responses. This is a truthful PostgREST-role harness, not a claim that a local provider gateway was installed. The Queue SDK test uses its actual callback and lease protocol with synthetic API I/O; no hosted Queue is created. Provider behavior remains a separately authorized hosted repro.

The cycle-29 model reproduces four PENDING/current family jobs with attempts zero, created through the supported secondary-match upsert. The disposable fixture has its own truthful cycle numbers; it does not fabricate cycle 29 by editing counters. Scoring preparation is not called. Existing worker/claim/output logic drains the jobs with two independent invocations and same-reservation contention. Local elapsed-reconciliation modeling changes only the disposable invocation's eligibility timestamp; it does not alter a job lease/attempt/output or claim a real 90-second expiry test.

## Next hosted sequence (not executed)

1. Independently read current deployment/release/resource/revisions and validate preserved cycle-29 tuples, attempts zero, claims zero, producer COMMITTED and preparation NOT_COMMITTED. Stop on drift; do not recreate demand.
2. Keep OFF/disabled/paused. Install only the guarded v4 forward SQL; verify hashes, singleton predicates, receipt replay, metadata/ACL/RLS, unchanged jobs and safeupdate still enabled.
3. Deploy the exact locally certified candidate to isolated Preview; verify provider identity/config, then owner release rebind and replay with supervisor OFF.
4. Activate only through certified controls, START the minimum finite window, and use Preview-native publication.
5. Let native private Queue delivery prove BEGIN→reservation→existing worker→canonical claim/output/receipt for the existing four jobs. No CLI worker or direct processor.
6. Continue remaining bounded recovery/concurrency gates; classify and drain only legitimate required work.
7. Owner STOP/reconcile; return disabled Director/scoring admission and paused ingress, with zero required work/claims/leases/UNKNOWN/unexpected dead letters. Preserve all evidence; do not begin Part 2B-2.
