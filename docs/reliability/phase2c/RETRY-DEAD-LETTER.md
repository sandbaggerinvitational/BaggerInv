# Retry, terminal state and recovery

**Scope correction: P0-B remains PARTIAL.** The executed automatic-delivery evidence below covers Calcutta, Competition and Intelligence. It does not prove the separate Google reporting outbox or Finalize archive delivery. The missing reporting/export proof cannot be dismissed as a financial owner-approval wait. External-write admission and the legacy writer’s financial side effects require explicit review; see [Google/outbox inventory and unresolved semantics](GOOGLE-OUTBOX-GAP.md).
Candidate-managed calculation job rows hold delivery cycle, attempt count, available time, terminal time and error classification. Existing score intents retain their own durable attempts. A process restart does not reset either budget. Immutable attempt events retain family, work identity, cycle, attempt, transition, safe error code, runtime generation, worker identity, processor contract, known originating activation, and the bounded control row's handling activation/release commit. Unknown historical origin remains null.

For the candidate-managed intent and calculation queues, at most five attempts are allowed per source cycle. This is not a finite-attempt or exact-requeue proof for the legacy Google outbox/archive classes. Retryable database failures are 40001,40P01,57014,55P03 and 08xxx. Known Node/Undici connection failures and HTTP 408/429/502/503/504 normalize to CONNECTION_FAILED before durable acknowledgement. An explicit deterministic SQLSTATE takes priority over an HTTP envelope. Arbitrary TypeError, missing function, authorization denial, invalid input and lifecycle errors are terminal. Backoff grows exponentially with bounded deterministic jitter; no polling resets available time.

The intent materializer explicitly catches real query_canceled 57014 in its subtransaction, records the failed attempt after rollback, and stops the tick immediately. This matters because PL/pgSQL WHEN OTHERS alone excludes query cancellation. The proof issues actual 25 ms statement cancellations across independent database connections; expedited available_at updates are labeled clock injections, not production backoff measurements.

A processor failure is acknowledged against its exact claim or the tick's exact unclaimed work identity/cycle/attempt. A changed claim rejects stale acknowledgement. If a claimed-job failure acknowledgement is lost, the RUNNING lease remains until expiry recovery; it is not assumed to have been persisted. If the adapter cannot obtain a valid preclaim failure acknowledgement, the runner halts visibly instead of repeatedly executing unchanged ready work.

Global tick failure is separate from job failure. A deterministic global failure halts immediately. Transient failures back off and halt after five consecutive attempts. This process-level budget is not durable across process restart when the database itself is unavailable: no unreachable database can record an attempt. Pending work remains durable, and an external supervisor must not blindly restart a halted process forever. Hosted supervision is NOT PROVEN.

Director recovery requires current runtime authority, an actual active Director identity, exact family/work identity/cycle/attempt, a UUID request identity and a bounded correction reason. Identical request replay returns its retained event; changed request contents with that UUID fail. Old-generation work and changed financial source/configuration are rejected. Requeue starts a new cycle and preserves all previous events; it does not erase history or transfer a lease.

## Durable states and transitions

Job terminal state is represented by `status=FAILED` plus `delivery_dead_letter_at`; intents use the explicit `DEAD_LETTER` status. A job's `SUCCEEDED` is calculator completion; an intent's `SUCCEEDED` only acknowledges materialization.

| Before | Trigger and guard | After and durable evidence |
| --- | --- | --- |
| New committed score | Existing score transaction appends/coalesces its transaction/match/family intent | PENDING intent; score rollback also rolls back demand |
| PENDING / RETRYABLE intent, due | One explicit family tick, maximum eight intents, current runtime | Current-authority job materialized and intent SUCCEEDED atomically; failed subtransaction rolls back its writes before recording retry/terminal |
| PENDING job, due | Existing exact claim and current source/authority; attempt below five | RUNNING, attempt incremented, existing lease identity retained, immutable RUNNING event |
| RUNNING | Valid exact completion | SUCCEEDED and current result guarded by existing source/lease checks; immutable success event |
| RUNNING | Transient failure or expired lease, attempt below five | PENDING with RETRYABLE classification, bounded due time, cleared lease, immutable retry event |
| RUNNING | Deterministic failure or fifth transient failure | FAILED with terminal timestamp, cleared lease, immutable DEAD_LETTER event; polls cannot revive it |
| Terminal current work | Authenticated exact Director requeue after cause correction | New cycle, PENDING, attempts zero, retained request/actor/reason receipt; all old events survive |
| Competition/Intelligence demand | A genuinely different canonical source is materialized | New source cycle; a restart or repeated same-source poll does not reset the budget |
| Successful Intelligence sibling | Actual bundle claim proves due nonterminal same-source work and existing final gate where needed | Audited successful-sibling rejoin in a new cycle; failed/terminal siblings are never reset this way |
| Old-activation Calcutta PENDING or expired RUNNING | Equal source/configuration/auction/generation under current authority | Old identity SUPERSEDED and linked new job in one transaction; no lease transfer |

Job retries after attempts 1–4 wait 2–4, 4–6, 8–10 and 16–18 seconds respectively. The delay helper has a 300-second ceiling, but the fifth failed attempt is terminal, so it does not schedule another retry in that cycle. Jitter is a stable 0–2 seconds derived from work identity. Global transient tick retries wait 2, 4, 8 and 16 seconds before the fifth consecutive failure halts the process.

## Failure and rollback outcomes

| Observed failure | Local database outcome | Runner / recovery outcome |
| --- | --- | --- |
| 40001, 40P01, 55P03 or retryable connection SQLSTATE | Failed SQL statement/transaction rolls back; exact failure acknowledgement records bounded retry when reachable | Other families continue; due time prevents a hot loop |
| Real materialization 57014 | Current intent's subtransaction rolls back; its attempt is recorded and the tick returns incomplete immediately; earlier successful intent subtransactions may commit with that tick | Adapter stops further family RPCs for the poll; incomplete status cannot establish idle |
| Processor SQL 57014 | Failed calculation/write statement rolls back; prior successful claim is still durable | Exact failure acknowledgement, or retained RUNNING lease if acknowledgement cannot reach the database |
| 42883 / 42501 / 22023 / deterministic lifecycle denial | Failed SQL cannot publish a partial result; exact current work receives terminal acknowledgement where authorized | No infinite retry; exact cause-corrected Director recovery required |
| Known Node/Undici connection error or HTTP 408/429/502/503/504 | Commit outcome may be unknown; no assumed rollback | Normalized CONNECTION_FAILED; retry/lease recovery and current result guards prevent duplicate current publication |
| Response lost after successful completion | Result and SUCCEEDED job remain committed | Later failure acknowledgement cannot undo the completed claim; next poll observes success |
| Late old claim/write | Existing source/lease/generation/activation guard rejects stale work | New current result and pointers remain unchanged; newer demand survives |
| Claiming child exits | Existing RUNNING job and lease survive process loss | Another child recovers only after expiry; tests inject the lease clock explicitly |
| Shutdown AbortSignal | No synthetic terminal acknowledgement is written solely because shutdown was requested | Graceful stop; committed claim survives for ordinary expiry recovery |
| Preclaim failure acknowledgement unavailable or invalid | No fabricated durable failure record | Visible process halt, not repeated execution of unchanged ready work |
| Database unreachable for all tick attempts | No database event can be durably written while unreachable | Five-attempt process budget then visible halt; blind supervisor restart loops are not certified |

## Retention and archive proposal

This migration does not delete attempts, score intents, financial receipts, results or recovery receipts, and adds no archival scheduler. Attempt events contain bounded identifiers/classification/provenance, not financial calculation payloads or credentials. Current selectors use current identities and partial queue indexes; history remains auditable.

Proposed follow-up, requiring a separately approved retention policy: after tournament closure and recovery reconciliation, create a verified immutable export with schema/version, row counts, source release and content hashes before considering any archival move. Keep all active, delayed, terminal-unresolved and referenced financial work online. Recovery UUID receipts must remain replayable: deleting them would permit identity reuse, so any future deletion requires a durable compact replay ledger or equivalent compatible archive lookup first. No retention duration, automatic purge or restored-archive replay behavior is implemented or certified here. The exact-work forensic lookup now has separate annual query-plan evidence over retained attempt history; isolated index write amplification remains unmeasured. It is a privileged forensic query, not a shipped recovery RPC.


Retained exploratory evidence under [evidence/](evidence/):

| Run | Result and boundary |
| --- | --- |
| [worker-delivery-first.tap](evidence/worker-delivery-first.tap) / [JSON](evidence/worker-delivery-first.json) |9/9 passed, but database clones did not inherit the stated 1 s scoring timeout. Delivery behavior evidence only; finite score profile not established for this run. |
| [worker-delivery-second.tap](evidence/worker-delivery-second.tap) / [JSON](evidence/worker-delivery-second.json) | New status query referenced an absent Net Skins activation column. Retained failing evidence; fixed to actual generation/current-configuration scope. |
| [worker-delivery-third.tap](evidence/worker-delivery-third.tap) / [JSON](evidence/worker-delivery-third.json) | Autonomous delivery, restarts, real cancellation and four source races passed. Eight receipt cases reached canonical convergence but their final test readback used the wrong payload column; corrected to engine_result_payload. |
| [worker-delivery-fourth.tap](evidence/worker-delivery-fourth.tap) / [JSON](evidence/worker-delivery-fourth.json) | Four subtests failed: duplicate cluster role setup, two incomplete Intelligence claim inputs, and a malformed late Calcutta completion probe. Corrected fixtures cannot be treated as a shipping PASS; the next run exposed the actual final-only scheduling defect. |
| [worker-delivery-fifth.tap](evidence/worker-delivery-fifth.tap) / [JSON](evidence/worker-delivery-fifth.json) |28 tests passed; FinalRecap remained pending with ready=false (and its parent failed). Preserving demand at claim alone was insufficient because completion overwrote it. The next correction preserves canonical demand on Intelligence RUNNING→SUCCEEDED, while result/run output metadata stays unchanged. |

[The sixth delivery run](evidence/worker-delivery-sixth.tap) passed 30/30; its [structured evidence](evidence/worker-delivery-sixth.json) records the installed migration hashes, actual before/after completion validity, final-only pickup and immutable attempt provenance. That historical run did not include the later history experiment; final history evidence is linked below. Exploratory runs remain retained and do not acquire claims from the later passing run. No production, hosted scheduling, physical client, payout-accuracy or percentile claim follows from these local tests.

[The retained classifier counterexample](evidence/worker-transport-classifier-counterexample.json) is an actual imported-function unit execution showing three transport shapes misclassified before correction; it did not exercise a production transport. [The corrected unit run](evidence/worker-transport-classifier-after.tap) covers normalized Node/Undici/HTTP errors and deterministic SQLSTATE precedence.


| Additional retained proof | Boundary |
| --- | --- |
| [Classifier counterexample](evidence/worker-transport-classifier-counterexample.json) and [corrected unit](evidence/worker-transport-classifier-after.tap) | Actual imported classifier probe, not a provider transport run |
| [Exporter counterexample](evidence/worker-emitter-counterexample.json) and [after](evidence/worker-emitter-after.json) | Synchronous/async callback failure containment; no hosted exporter delivery claim |
| [Live-expiry first run](evidence/delivery-live-expiry-first.json) | Competition fixture paused only one of two parallel writes; corrected shared barrier preserves both-engine proof |
| [Net first proof](evidence/net-owner-control-proof-first.tap) | Wrong receipt-table name and missing R2 demand were test-fixture defects; actual before cycles remain retained |
| [Net forensic failure](evidence/net-future-max-forensic-first/net-owner-lock-order.json) | All six future completion cases passed; unrelated-history whole-payload oracle timed out before measured completion |
| [History setup failure](evidence/worker-history-first.json) |10× setup exceeded maintenance budget before measured calls; scoring/worker budgets remain1s/5 s |
| [First literal-death run](evidence/delivery-literal-death-first/PRESERVATION.json) | 49/54 passed; four new cases exposed incorrect test assumptions about frozen timestamp claims, not a worker failure. Exact source/raw/detail retained; corrected54/54 preserves all process-death, canonical, lease, identity, cycle, attempt and result assertions |
| [Pre-correction lock receipts](evidence/lock-proofs-before-timestamp-fixture-correction/PRESERVATION.json) | Earlier passing Net20/failure16 refreshed because their transitive test-helper dependency changed |
| [85f9 proof preservation](evidence/worker-proofs-before-five-index-85f91fa8/PRESERVATION.json) | Earlier passing wrappers do not certify the final DDL or later four-path lock correction |

The final 54-test delivery run also includes nine literal calculation/precompletion/postwrite process deaths, independently of held-live or lost-response experiments; see the cutpoint evidence in DERIVED-DELIVERY.md. It independently covers same-source/same-activation live old claims for all three automatic families: only lease expiry is injected, replacement waits real backoff and completes attempt 2, then old resume cannot alter current result identities/hashes or immutable attempt audit. Calcutta rejects42501; Competition returns STALE_DERIVED_JOB; Intelligence returns STALE_INTELLIGENCE_WORKER. Newer-source and compatible-activation cases remain distinct tests.

Net Skins owner completion may provisionally create only the exact eventual Storylines demand. Every later rejected lease/source/generation path rolls it back;2026 and explicit-boundary 2099 runtime proofs retain exact unchanged footprints. Current lock-order proofs and their supported-caller limits are summarized in DERIVED-DELIVERY.md. These corrections do not weaken authority or convert stale42501 into permission to publish.
