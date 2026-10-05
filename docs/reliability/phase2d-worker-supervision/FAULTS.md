# Certification-only bounded fault controls

Owner arms while admission is disabled, ingress paused and supervisor OFF. The plan binds the original synthetic fixture audit, exact resource/current release, engine, pending source/cycle, immutable context, expiry (at most ten minutes), next supervision epoch and one-use consumption. Changed sources cannot silently retarget a plan. No HTTP request flags, SQL injection or arbitrary error/target selector exists. These controls must be absent from a future Production installation.

| Contract | Implemented seam / authoritative proof |
|---|---|
| Transient | Consume an exact post-claim/pre-write plan; fixed transport failure; normal processor fail ACK records retry/backoff and attempts. Next independent invocation succeeds without reset. |
| Terminal | Same exact seam, fixed 22023 response; normal fail ACK records terminal/dead-letter history. Supervisor halts. Existing Director REQUEUE_DERIVED after cause correction starts a new cycle while old events remain. |
| Lost ACK | Consume while the exact claimed tuple still exists; execute normal canonical completion; drop only its successful response. Actual output stays SUCCEEDED; status/retry never fabricate rollback or duplicate output. |
| Disappearance | Hold immediately after a real committed claim without returning to its processor; real child termination locally / provider maxDuration later. No fake fail or finish ACK. Real expiry/reconciliation/reclaim preserve attempts. |
| Supersession | Hold a real old claim; supported fixed producer advances source; owner releases the plan. Canonical timestamp/cycle CAS denies the obsolete completion, current work wins on the next invocation. |
| Contention | Fixed two-slot owner plan permits two simultaneous signed invocations; real independent Node processes exercise existing canonical SQL claim protection. No substitute supervisor job lock. |

All fault operations read committed canonical claim receipts from the existing audit and record sanitized claim tuples. Competition completion must name the exact planned engine and claim timestamp; Intelligence completion must contain that exact engine and timestamp in its canonical bundle. A different engine cannot consume the plan. Obsolete completion may trigger the existing terminal classification; its halt latch survives STOP and requires cause-corrected owner RESUME before current work proceeds. Frozen 2026 receipts are timestamp-based; no fabricated owner/token/generation is assigned. Normal local drain leaves zero pending automatic work, active/expired claims, ingress leases, unresolved invocation outcomes and current dead letters. Terminal history is retained through the certified recovery operation.

Provider disappearance is not locally claimed as a Vercel restart. The local proof kills an actual owned child; later hosted proof must show the configured provider ceiling terminates that request and the real schedule performs recovery. Waiting actual 30/90/120-second deadlines replaces timestamp edits. Source supersession and contention use real supported canonical operations, not manual job insertion or status updates.
