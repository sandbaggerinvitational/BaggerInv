### SAFEUPDATE / QUEUE TRANSPORT REMEDIATION STATUS

PASS — local candidate certified. Hosted proof remains for the separately authorized resume.

### SAFEUPDATE ROOT CAUSE

HOSTED ROLE: PostgREST authenticator session loading safeupdate; RPC runs through service_role.

EXTENSION: pg-safeupdate, preserved.

FAILING STATEMENT: `UPDATE production_control.worker_supervisor_v1 SET last_invocation=i.invocation_id`.

WHY REJECTED: No outer WHERE; SQLSTATE 21000. Atomic rollback before reservation consumption/worker admission.

### MUTATION INVENTORY

See [every statement](MUTATION-INVENTORY.md) and [full before/after source](evidence/mutation-inventory.json). 25 active UPDATEs: 18 predicate-safe, seven unqualified singleton updates, no active DELETEs or other unsafe mutations. START/RESUME, STOP, BEGIN, tick success/failure, FINISH and UNKNOWN reconciliation are corrected. The already-safe conditional STOPPING→OFF transition is narrowed. Publisher-v3/fault/invocation updates remain predicate-safe; STATUS and context helpers are read-only. Historical installer cleanup and retired HMAC bodies are classified separately.

### SINGLETON CONTRACT

TABLE: `production_control.worker_supervisor_v1`.

KEY: boolean singleton, PRIMARY KEY, NOT NULL, CHECK(singleton); TRUE is the only legal key.

EXPECTED ROWS: exactly 1; duplicate TRUE, FALSE and NULL denied by real PostgreSQL constraints.

ZERO-ROW HANDLING: strict initial reads; explicit drift error for Queue singleton lookup/zero-effect UPDATE. BEGIN rolls back without consuming reservation. Conditional STOPPING transition may legitimately affect zero rows.

MULTIROW HANDLING: impossible under verified key/check constraints; installation refuses drift.

### SAFEUPDATE CORRECTION

OLD: seven unqualified singleton UPDATEs.

NEW: `WHERE singleton AND epoch=s.epoch AND revision=s.revision`, followed by FOUND assertion; exact locked canonical row/context.

SAFEUPDATE DISABLED: NO. MEANINGLESS WHERE TRUE: NO.

### QUEUE ERROR ROOT CAUSE

DATABASE ERROR: 21000 / UPDATE requires a WHERE clause.

OLD CLASSIFICATION: unrecognized non-5xx DB error → generic 403.

OLD QUEUE EFFECT: every 403, and every fifth failure, acknowledged.

WHY INCORRECT: database rollback/programming failure is not proof of deterministic authorization denial or successful execution.

### QUEUE ERROR CONTRACT

See the [canonical error/outcome matrix](CONTRACT.md#queue-error-and-acknowledgement-matrix). Known complete canonical authority codes plus their expected SQLSTATE ACK. Replay observes durable ledger state. Busy conflicts retry; genuine 40001/40P01 retain transaction retry. Timeout/connection/unknown completion require retry/reconciliation. 21000 and unexpected programming/SQL errors fail delivery without ACK. Unknown permission errors are not mislabeled as participant denial. Actual installed error names are used.

### PROVIDER RETRY MAPPING

ACK: successful callback or explicit deterministic denial; SDK deletes lease.

RETRY: explicit transient/busy directive changes visibility; fifth failure uses failed-delivery/default handling rather than fabricated success. Existing maxDeliveries=5 bounds provider delivery.

RECONCILE: committed/uncertain BEGIN and worker outcomes remain in canonical ledger; retry cannot execute another tick for that reservation.

TERMINAL: unexpected programming failure yields native callback 500 without ACK; provider retry limit/expiry is distinct from canonical job dead letter. No new provider DLQ is assumed.

### IDEMPOTENCY

RESERVATION: atomic single use. INVOCATION: durable ledger. CLAIMS: existing canonical CAS/attempt/source guards unchanged.

DUPLICATE DELIVERY: no second tick/current output. UNKNOWN BEGIN: observes RUNNING/UNKNOWN; zero repeated worker execution until authoritative reconciliation.

### FAILURE ACCOUNTING

PRE-BEGIN FAILURE: provider/control transport failure; no job attempt or supervisor tick/invocation counter increment.

ADMITTED TICK FAILURE: existing durable TICK_RESULT/FINISH accounting.

JOB FAILURE: existing attempt/backoff/dead-letter protocol.

GLOBAL SUPERVISOR FAILURE: existing five transient ticks / three failed or uncertain invocations and halt latch; preserved.

### SECURITY

AUTHORITY DENIAL RETRY: NO for explicit deterministic canonical denials.

PARTICIPANT / ANON / AUTHENTICATED / SERVICE_ROLE MINT: DENIED.

WRONG RESOURCE / WRONG DEPLOYMENT / PRODUCTION: DENIED.

RLS CHANGED: NO existing RLS changes; new forward receipt is private with RLS and no client grants.

ROLE EXPANSION: NO. Private cores, Preview identity, resource/release/deployment binding, owner control and canonical claims preserved.

### LOCAL PROOF

SAFEUPDATE ENABLED: YES — real upstream module, PG17.11, socket-only disposable DB; no mock/skip fallback.

FORMER BEGIN PATH: old path reproduces 21000, corrected path succeeds.

UNQUALIFIED UPDATE/DELETE: rejected by real safeupdate.

VALID WORKER TICK: real canonical four-family claim/process/output/receipt, no scoring preparation or direct processor substitute.

INFRASTRUCTURE RETRY: PASS, actual installed SDK lease/callback protocol with synthetic provider I/O.

AUTHORIZATION ACK: PASS. DUPLICATE: PASS. LOST ACK: PASS. STOP/LATE DELIVERY: PASS.

FOCUSED TESTS: 88 pass / 0 fail / 0 skip, final frozen sources.

BROAD RESULT: 4,077 pass / 20 established failures / 0 skip / 0 cancelled; exact established failure names retained, no new failures. Raw test exit 1 is the established baseline, not silently called all-green.

BUILD: PASS, application source frozen. NEW UNEXPLAINED FAILURES: 0.

An exploratory old calculation-crash suite had three stale hash-pin failures plus its parent failure. Targets and harness are byte-identical to the working baseline; evidence is retained in initial-focused logs and exploratory-worker-baseline.json. It is outside this unchanged worker/calculation scope and was not patched. The historical Queue byte-identity assertion was narrowed to preserve the actual private route/worker while allowing this explicitly authorized transport correction.

864-HOLE RERUN: NO; scoring/domain/calculation semantics unchanged.

LOCAL LIMITS: real SQL/safeupdate and SET ROLE service_role, modeled PostgREST HTTP and Queue provider I/O. The four-job counterpart has truthful local cycles, not manually fabricated cycle 29. UNKNOWN reconciliation uses a disclosed disposable local elapsed-time model; no hosted claim/lease is expired or edited. No hosted success is claimed.

### FORWARD SQL

REQUIRED: YES.

ARTIFACT: `supabase/production_incremental/certification-queue-safeupdate-v4.sql`.

REPLAY: PASS. Atomic rollback after the first replacement followed by a deliberately corrupted local postimage expectation: PASS.

HISTORY PRESERVED: v1/v2/v3 unchanged; three exact function postimages, eight singleton UPDATE corrections/narrowings and one explicit missing-row guard. New private v4 receipt preserves history, full image and owner/ACL/security/search_path metadata.

### SOURCE

BASE SHA: 917d6942350fa835c65b356951019d298a91a4f3.

WORKING PARENT: 90208e983f2a2adbf11ba6303cc914ed4df257c7 — previously reviewed local demand-producer correction; no hosted redeployment is inferred from it.

NEW SHA / COMMIT: the commit containing this report, exact SHA provided in the completion response.

PUSH: NO; local-only authorization. WORKTREE: `/private/tmp/bagger-worker-provider-portability`.

Application changes are confined to the Queue transport classifier/control and Preview publication transport. Worker engine, canonical claims/calculators, private consumer route, package/runtime config and historical SQL remain unchanged. Hashes and impact accounting: [source-impact.json](evidence/source-impact.json).

### HOSTED

MUTATED: NO. No hosted SQL/account/API operation, deployment, queue publication or worker execution.

SUPERVISOR: OFF, as the preserved reported checkpoint.

CYCLE-29 JOBS: PRESERVED; no hosted readback or processing in this local remediation.

Scoring/Director admission DISABLED, ingress PAUSED, revision 43 retained as reported. Production, old Preview, Google and real messaging untouched.

### READY TO RESUME HOSTED PART 2B-1

YES — after owner authorization to push/install/deploy/rebind; real hosted repro still required.

### NEXT OWNER ACTION

Authorize push of the exact local candidate, Certification-only guarded safeupdate-v4 installation, deployment/rebind, and resumption of Part 2B-1 from freshly validated preserved cycle-29 work. Do not recreate demand or begin Part 2B-2.
