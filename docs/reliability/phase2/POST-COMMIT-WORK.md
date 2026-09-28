# Durable derived work and operational limits

| Family | Trigger/delivery | Idempotency/order/current pointer | Failure/recovery |
|---|---|---|---|
| Calcutta | Hole/score-origin match triggers append same-transaction family intent; existing public claim calls private flush (up to8) | Existing current source/fingerprint/claim/complete guards; old intent materializes latest canonical source, never its obsolete financial payload | SQL materialization failure retained RETRYABLE, five attempts DEAD_LETTER; score already committed |
| Net Skins | Configured-round hole/score-origin match intent; existing claim | Existing round input/result revision and completion checks; membership/calculator unchanged | Same durable retry; provisional/Official publication rules retained |
| Competition / intelligence | Hole/score-origin match intent replaces five shared synchronous job updates; existing claim flushes | Latest match provenance + existing engine jobs/current authority; no new financial authority | Worker failures do not hold score match lock; existing source guards reject stale completion |
| Google mirror/archive | Existing separate canonical outbox/finalization archive machinery | Existing event revision/lease/completion contract | Unchanged; no provider calls made by tests |

Intent state: PENDING → SUCCEEDED; ordinary error → RETRYABLE with bounded exponential delay → DEAD_LETTER on fifth failed attempt. A worker cancellation (57014) rolls back the flush transaction and leaves the prior intent eligible. `SKIP LOCKED` and limit8 bound each dispatch. Intent acknowledgement and creation/update of the downstream job are atomic; acknowledgement does not mean calculation/publication completed.

The key `(tournament,match,source_transaction,family)` prevents duplicate family append within a transaction; distinct transactions append independent intent rows. Three families allow isolated failures; this differs from postmortem BE-JOB-001’s literal single event/five consumers. The ADR records the variation and keeps that broader requirement open. Existing Google delivery is not duplicated.

**PROVEN locally:** intent append failure rolls back score; three derived failures preserve Official score;432 queued intents drain using batches≤8; replay/repeated materialization and older intent do not create duplicate financial result; five failures become visible dead letter; score progresses while a worker holds shared projection jobs. Actual Calcutta and Net Skins claim→calculator→complete parity are separate tests.

**Not proven / required follow-up:** independent periodic retry trigger, supported dead-letter operator recovery, autonomous catch-up without another request, worker throughput under provider resource contention, annual future-runtime functions, supported queue health API. A cached EMPTY claim replay can return its receipt before flushing new intents. A fresh worker mutation is required; automatic scheduling is not added in this phase. Durable retention is not a liveness guarantee.

Candidate default is max8 per flush, inherited local database max20 connections. Neither is a Production-certified throughput/concurrency limit. Worker tests are local architectural evidence only. Bound external dispatch concurrency, back off, preserve scoring priority, and certify capacity before choosing Production settings.

Retention proposal: keep unresolved/dead-letter rows hot and indexed; archive successful rows by tournament only after audit retention and restore policy approval. No deletion or housekeeping job is implemented. New ready/unresolved partial indexes exclude completed history from admission. Database storage/I/O growth still needs operational monitoring.

Compatibility binds canonical tournament/generation + processor contract, not obsolete activation. Existing claim/complete release checks remain. Closed admission pauses draining; final tournament close refuses unresolved intents. There is no universal bypass. Emergency stop does not wait for derived work.

Mixed-round Net Skins worker transactions can acquire advisory locks in opposite order. The deterministic safety test captures the lock graph and SQLSTATE40P01, retains one RETRYABLE intent, preserves canonical score, and succeeds on an explicit later retry. This proves containment and recoverability, not absence of deadlocks or autonomous recovery. Production worker concurrency is not certified. Standalone lifecycle triggers retain their previous synchronous behavior.
