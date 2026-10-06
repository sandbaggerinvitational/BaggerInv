# Attempt-ceiling correction — local certification

Base: `6518709089816c0497fdc78ea6a81d67dd6323a4`.
Scope: Certification-only forward SQL, one fixed owner provisioning tool, local
certification tests and evidence. No application route, Queue consumer, worker,
calculator, scoring, financial rule, package or provider configuration changes.
No hosted action was taken. The supplied revision-75 safe checkpoint is retained,
not claimed as a fresh hosted readback.

## Decision

The attempt counter is scoped to a canonical delivery cycle. Five attempts remain
the ceiling. An ordinary identical source demand must preserve the existing job:
success stays satisfied, active claims stay owned, retries retain backoff, and
terminal failures retain dead-letter state. Only a genuine new source or the
existing authorized Director recovery may create a new budget.

The shared transition previously allowed PENDING/current/attempt5. The owned
rollback-only predecessor reproduction demonstrated this for all four families.
The corrected successful identical demand is an exact no-op. A final invariant
denies any other ordinary PENDING transition with an exhausted/dead-letter budget.

Competition completion now retains the requested demand identity, as Intelligence
already did. Match-trigger payload normalization prevents legacy/canonical
provenance differences from manufacturing source cycles. Legacy output-only
markers use trusted OLD/NEW match revision evidence; missing evidence fails closed.

## Fresh demand and recovery

The fixed secondary-match scoring-lock producer is a real supported lifecycle
operation. It advances canonical match revision 0 to 1 while leaving the match
UPCOMING, unscored and access revoked. The empty auction stays at revision2 with
no financial work or facts. It does not invoke processors, prepare scoring, insert
jobs, supply fake revisions or reset attempts. Its durable checkpoint records
COMMITTED, NOT_COMMITTED or UNKNOWN; a committed operation without a source
advance is explicitly NO_NEW_SOURCE. Replay is idempotent, and another fresh plan
on the locked fixture is denied.

The tee-time-only producer cannot replenish a source-cycle budget. Further source
changes for hosted supersession tests require independently lawful operations;
the resumption plan identifies a separately authorized bounded Reopen/re-finalize
of the preserved completed primary match, restoring FINAL without replaying scores.

At attempt5, FAILED/dead-letter remains unchanged under ordinary demand.
DIRECTOR.REQUEUE_DERIVED creates its existing new cycle, records cause correction,
and retains all original events. Duplicate/recovery and claim/enqueue races use
independent real PostgreSQL sessions. Source advancement retires held old ownership
and appends SUPERSEDED evidence; old writes cannot become current.

## Verification

Final result: **PASS for local remediation/certification**.

| Check | Result |
|---|---|
| Focused suites | 82 pass, 0 fail, 0 skip |
| Owned PostgreSQL integration | 16 decisive cases pass; PostgreSQL17 + real pg-safeupdate |
| Application regression | 4,077 pass, 20 exact established failures, 0 skip, 0 new failures |
| Production build | PASS; local only, real credentials removed, remote network denied |
| Source manifests | Stable and identical across final certificates |
| Attempt ledgers retained | 442 cycle-29 events; 76 terminal/recovery/supersession events |
| Final four-family local drain | SUCCEEDED/current, one current output per family, zero stranded work |
| Financial row-shape compatibility | Real supported synthetic Calcutta job; qualified rollback-only no-op unchanged |
| Forward install | Atomic/hash guarded, replay PASS, mismatch rollback PASS, metadata/history preserved |
| Hosted action | NONE |

Forward artifact SHA256:
`21904b5ebc8581cc550e47925460b727ee8568db939ecf0896e1faad9b3cb02d`.

See [focused certificate](evidence/focused.json), [owned PostgreSQL proof](evidence/integration.json),
[application regression](evidence/application.json), and [build](evidence/build.json).
The certificate uses PostgreSQL17 with real pg-safeupdate, synthetic credentials,
and owned local sockets. External network is denied. Historical migrations and
bootstrap are unchanged. The 864-hole chronology was not run.

The accepted 20 application failures are compared by exact test name against the
retained baseline. No unrelated defect is attributed to this correction or hidden
by marking a test skipped. The old frozen Phase2C worker certificate was excluded:
it pins a historical worker digest and cannot certify the later Queue lineage.
The new integration exercises the unchanged current worker/consumer against the
actual corrected canonical functions instead.

## Installation and hosted resumption

The forward artifact corrects exactly three functions over guarded predecessor
hashes, atomically verifies body hashes and metadata, preserves v1–v7 history,
and records a private installation receipt. Replay and rollback-on-mismatch are
proved. No existing job, attempt, snapshot or fixture row is repaired on install.
Private ACLs, existing RLS, resource authority and Production isolation remain intact.

Install only after a fresh readback confirms the preserved hosted checkpoint.
Application runtime is unchanged, so retain the bound V7 deployment/release;
neither deployment nor release rebind is needed solely for this SQL/tool correction.
Then use the reviewed genuine source producer and native Queue worker for only the
remaining Part2B1 gates, with explicit authorization for any additional lifecycle
source changes. Preserve prior PASS evidence; finish with STOP, disabled admission,
paused ingress and zero currently-required work/claims/leases/UNKNOWN/unexpected
dead letters/stranded work/live reservations/handoffs/faults. Part2B2 stays unauthorized.
