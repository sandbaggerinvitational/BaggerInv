# Phase 2C failure-injection contract

**Proof scope: local PostgreSQL, API/adapter integration and controlled process failure.** The current executed source hashes, exact counts and outcomes are in the linked wrapper receipts and [certification](CERTIFICATION.md). Earlier lock failures, corrected fixture errors and superseded source runs remain retained. This failure inventory cannot substitute for a current runtime result.

All injections run in owned disposable socket-only PostgreSQL17 and local Node processes. No Production, provider, real participant or hosted service was targeted. A synthetic runtime substitution is disclosed in each fixture; the protected annual-admission suite independently executes real manifest/admission/release guards.

| Boundary | Injected failure | Required invariant | Test/artifact (status must be checked) |
|---|---|---|---|
| Hole, receipt, derived-intent insert | Actual PostgreSQL25ms timeout against100ms trigger | Entire score/receipt/intents roll back; absent receipt remains UNKNOWN; retry same mutation succeeds | [finite timeout](timeout-results.json) |
| Score row lock | Held match lock plus25ms timeout | No partial score or fabricated commit | [finite timeout](timeout-results.json) |
| Recovery after committed score/Lock | Receipt table blocked,25ms timeout | Receipt survives; later lookup COMMITTED; scoring stays denied | [finite timeout](timeout-results.json) |
| API response loss | Child commits via unchanged PWA adapter then exits77 before acknowledgement | New process resolves owned receipt after Lock | [recovery](evidence/recovery-proof.json) |
| Concurrent in-flight mutation | Independent transaction not committed | Recovery never says NOT_COMMITTED based on absence | [recovery](evidence/recovery-proof.json) |
| Worker process | Stop/restart, crash after claim, lease expiry, duplicate and stale completion | Durable work remains visible and retryable or terminal; newer current result wins | [delivery](evidence/worker-delivery-results.json) |
| Worker calculation | Actual SIGKILL at a source-hashed hook inside each real Calcutta, Competition and Intelligence calculation | New process reclaims unfinished work after the tested lease boundary; exact current result count, claim/cycle identity and canonical parity checked | [nine literal death cases](evidence/worker-delivery-results.json) |
| Before worker completion | Actual SIGKILL after computation and before the completion RPC for all three automatic families | Durable unfinished claim is recoverable; no fabricated result or duplicate completion | [delivery](evidence/worker-delivery-results.json) |
| After result write | Child exits77 after one committed completion but before acknowledgement for all three families | Already completed work stays at attempt1; only unfinished work is reclaimed; exact1/2/2 family result counts remain | [delivery](evidence/worker-delivery-results.json) |
| Worker query | Actual57014; SQLSTATE40P01/40001; known transport failures | Bounded backoff, five attempts per cycle, retained attempt trail, authorized exact requeue | [delivery](evidence/worker-delivery-results.json) |
| Expired leases / failure acknowledgement | Six actual historical worker/control wait cycles; same schedules after consistent ordering | Supported worker/control callers complete without reversed locks; stale claim checks and score authority remain intact | [four-path lock proof](evidence/worker-failure-lock-order.json) |
| NetSkins lock order | Historical opposite-round advisory cycle | Historical40P01 reproduced; ordered candidate locks prevent the same cycle | [deadlock](evidence/net-skins-deadlock.json) |
| Full sequence | Worker interruption, injected40P01 at claim, real score57014, Lock/Resume/Finalize |432canonical holes,24Final, no unresolved automatic work, same-mutation recovery | [sequence](full-sequence-results.json) |
| Optional telemetry | Sync throw and async rejection | A valid committed recovery still returns200/COMMITTED | [unit](evidence/phase2c-unit.json) |

The full-sequence40P01 is a controlled SQLSTATE injection, not proof of an actual lock cycle. The separate deadlock suite captures the real historical cycle. Clock advancement used to exercise backoff/lease boundaries is test-only and is labelled in raw evidence. No claim is made about provider restart availability or hosted network behavior. Inspect results in the linked receipts; this inventory alone does not certify PASS.

The final delivery suite passes54 Node tests (parent included). Its earlier49/54 run remains in [first literal-death attempt](evidence/delivery-literal-death-first/). Those failures were traced to two fixture assumptions: frozen jobs derive expiry from started_at plus90seconds, and frozen Intelligence returns claim_started_at rather than claim_token. The corrected harness preserves actual process death and independent database assertions. Expiry-clock injection does not prove waiting90seconds on hosted infrastructure.
