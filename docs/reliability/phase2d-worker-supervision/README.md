# Certification worker supervision candidate

**Historical v1 design, retired from active dispatch.** The current candidate is
the [private Queues v2 implementation](queue-v2/README.md). Its forward correction
disables the HTTP/HMAC/Vault/pg_net dispatch functions. This document and its
original receipts remain as truthful historical evidence; they are not authority
to install or start the old transport.

Local implementation of the approved Supabase-local scheduling → signed immutable Vercel invocation → existing Node worker architecture. This package does not install, deploy, activate or run anything hosted. The application base is a4bb57b1067fa7c50c8120c6fe5778378827a221.

The new private forward add-on provides owner START/STOP/STATUS, cause-corrected RESUME, reservation, reconciliation, provider dispatch and schedule installation. The HTTP endpoint accepts only a valid 30-second HMAC ticket already recorded in the private ledger. It runs `runScoreDerivedWorker` with `maximumCycles=1`, using the existing current Certification adapter, calculators and canonical SQL gateways. Participant cookies, Director sessions, cron headers and protection bypass alone grant nothing.

The registered physical resource is fixed to CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51 / trmcwrljjxwhgtikfdgu. Current server deployment metadata must equal the initialized release binding. Neither the HTTP body nor an environment overlay can select another resource. The initial implementation cannot select Production. A future Production installation requires a separate reviewed resource guard, credentials, deployment binding, enablement and artifact without Certification faults; the architecture and existing engine are reusable.

## Boundaries

- Default OFF; no schedule is installed by the forward add-on. An installed minute schedule is inert while OFF and may reconcile truthful existing outcomes without invoking the worker.
- A window is at most two hours / 120 total invocations. Normal one slot; two slots require the owner-armed fixed contention plan. Each invocation has a 45-second soft step cutoff and Node `maxDuration=60`. Soft cancellation is not proof of transaction rollback; Vercel termination is the hard hosted bound, still to be verified there.
- START does not enable scoring, Director admission or ingress. Dispatch and per-step authority require the existing certified runtime gates separately. STOP prevents future reservation/admission/steps and retains already committed outcomes. Outstanding invocations keep STOPPING until reconciled.
- Allowed engines: TEAM_MOMENTUM, TOURNAMENT_STORYLINES, TOURNAMENT_INTELLIGENCE, PROJECTION_EDITORIAL. Existing score-intent materialization remains canonical. Eligible financial work or FinalRecap changes fail closed; empty current Calcutta creates no financial demand. No Odds publication or Google path.
- Job failures keep the existing durable attempt/backoff/five-attempt/dead-letter contract. Supervisor failures persist across independent invocations: three unsuccessful/uncertain invocations halt; deterministic global failure halts immediately. The durable five-global-tick ceiling remains, with the three-invocation ceiling normally acting first. STOP retains the halt latch; explicit owner RESUME with cause/reconciliation evidence is required to clear it.

## Truthful local proof

Owned socket-only PostgreSQL 17 runs the real installed baseline, original four-player fixture and approved forward corrections. Only HTTP/provider transport is substituted. Local Vault/pg_net objects model secure secret references and enqueue semantics; no real Supabase extension scheduler, Vercel invocation or provider credentials are used. Actual process death uses SIGKILL after a real claim, followed by the unchanged 90-second lease and 120-second reconciliation window. No lease timestamps or attempts are rewritten.

Frozen 2026 Competition/Intelligence claims use timestamp/cycle CAS and the 90-second fallback deadline; future canonical jobs use explicit owner/token leases. Fault binding therefore reads the actual committed canonical claim audit receipt and exact work tuple, rather than assuming a populated `claimed_by` field.

The minimal producer updates only the fixed synthetic second match's tee-time presentation between 08:01 and 08:02, then calls supported `prepare-scoring-context`. Existing triggers create truthful demand. It neither invokes a shipping request with an after-hook disabled nor manually inserts jobs. The owner provisioning module leaves work for autonomous discovery. Primary-match, scores, snapshots, financial state and publication hashes must be compared again during hosted execution.

See [control/security contract](CONTROL-AND-SECURITY.md), [fault/recovery proof](FAULTS.md), [local certification](CERTIFICATION.md), [hosted installation plan](HOSTED-INSTALLATION.md), and [cost](COST.md). Local readiness does not constitute hosted Part 2B-1 PASS.
