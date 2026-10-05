# Global fault control local certification — PASS

Base: `ef20ef18299e49b25a4e04b0575287420b9a89d7`.
Worktree: `/private/tmp/bagger-worker-provider-portability`.
Hosted mutation, deployment, publication, START and worker executions: **0**.
Retained hosted checkpoint: supervisor OFF, admission disabled, ingress paused,
required work/claims/leases/UNKNOWN/dead letters 0. Cycle-29 positive proof preserved.

## Local certificates

| Certificate | Result |
| --- | --- |
| Focused security/regression | 99 pass / 0 fail / 0 skip |
| Global recovery: independent processes | 4 pass / 0 fail / 0 skip |
| Job recovery/source/concurrency | 6 pass / 0 fail / 0 skip |
| Additional expired/client-target negatives | 6 pass / 0 fail / 0 skip (overlaps focused) |
| Broad established selection | 4,077 pass / 20 established failures / 0 skip |
| New unexplained failures | 0 |
| Production build | PASS |

All runtime/SQL source manifests match final files. Evidence retains TAP hashes,
actual-time case results and final source/test hashes. The raw broad suite exits 1
for the same established 20 failures; accounting accepts that exact baseline only.
No scoring/calculator/domain semantics changed, so no 864-hole rerun.

## Decisive proof

Real separate consumers persisted transient tick counts 1/2/3 and reached
`INVOCATION_RETRY_EXHAUSTED`; job attempts remained 0. Deterministic global failure
immediately reached `TERMINAL_TICK_FAILURE`. HALTED delivery and early RESUME were
denied. Owner reconciliation/cause correction and healthy RESUME passed.

Four canonical outputs committed before outward ACK loss. UNKNOWN remained durable;
redelivery executed 0 cycles. Natural reconciliation returned
`TICK_RECORDED_JOB_STATE_RECONCILED` with real tick_success and SUCCEEDED job evidence.

A real process disappeared after claim. The effective 90-second lease was observed,
early ownership transfer denied, natural expiry/reconciliation followed, and normal
retry/reclaim advanced attempts 1 to 2. Terminal fault recorded attempt 1 and real
dead-letter evidence. `DIRECTOR.REQUEUE_DERIVED` recovered a new cycle while retaining
historical attempts/errors; no manual reset/delete/relabel.

With valid empty auction revision 2, a held old claim was superseded by supported
Director scoring-lock (source cycle 5 to 6). Old completion created no output;
new current work drained. No scoring preparation, scores or Calcutta automatic work.
A separate owned PENDING-work fixture qualified two-slot, same-reservation,
duplicate and out-of-order contention, single canonical owners and unique outputs.
All final local work/claim/lease/UNKNOWN/dead-letter counts were 0.

A tee-time-only refresh after current output is not assumed to create eligible work.
Every future hosted job fault must validate actual current PENDING demand first.
If a proposed producer does not create it, STOP and classify; do not force/insert
jobs. Independent local fixtures qualify contracts, not indefinite replay of one
hosted source cycle.

## Security and impact

Client/service_role ARM/private TAKE/read denied. Wrong resource/project/release/
deployment, stale revision, development/Production, client-selected epoch/job/error/
URL and expired/arbitrary fault denied. Defaults NONE; canonical BEGIN precedes fault.
Native consumer/publisher/routes, worker engine/job faults, packages and Vercel config
are unchanged. Existing owners/ACL/RLS/private-core authority preserved; new private
fault tables have RLS and no client grants. No role expansion.

Forward SQL: `supabase/production_incremental/certification-queue-global-fault-v5.sql`.
Atomic predecessor/hash guarding, fresh forward stack and replay PASS; v1–v4 history
retained. [CONTRACT.md](CONTRACT.md) contains the narrow owner controls and exact
subsequent hosted plan. Push not run under this local-only authorization.

Next owner action: authorize push/install/deploy/rebind of the candidate and bounded
native Queue proof of only remaining Part 2B-1 recovery/concurrency, then reconcile/
drain/STOP and disable/pause. Part 2B-2 remains unauthorized.
