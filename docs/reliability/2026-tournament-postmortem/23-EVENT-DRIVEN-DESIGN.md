# Event-driven derived state

## Boundary

This is a proposed architecture. The pinned source already has a durable Google outbox inserted by the score RPC (`supabase/production_migrations/202608240021_production_scoring_operations.sql:1138-1144`) and a post-commit application fan-out (`lib/mobile-v1-scoring-post-commit.js:7-20`). It also has Calcutta and Net Skins triggers that synchronously construct/enqueue side-game work. The evidence does not support saying that one unified minimal derived-state outbox already exists.

## Transactional event

Every canonical write appends one small event inside the same transaction:

```json
{
  "eventId": "uuid",
  "eventType": "HOLE_SCORE_COMMITTED",
  "tournamentId": "2027",
  "matchId": "2027-R1-1",
  "matchRevision": 7,
  "holeNumber": 3,
  "holeRevision": 1,
  "mutationId": "uuid",
  "authorityGeneration": 301,
  "occurredAt": "timestamp"
}
```

The event contains identities and revisions, not a side-game source snapshot, financial payload, player PII, or historical hash. Its unique semantic key prevents duplicate append for the same committed mutation.

The proposed event seam (`BE-JOB-001`) is implemented after the current-pointer (`DB-PERF-003`) and immutable-receipt (`BE-JOB-003`) foundations. Durable workers (`BE-JOB-002`) and the bounded score transaction (`BE-SCORE-002`) consume that event contract. They coordinate on its schema through `integrationDependencies`, but neither is a prerequisite for creating the event seam.

Rollback semantics are absolute:

- score rolls back → event rolls back;
- score commits → event exists;
- worker unavailability cannot roll back the score;
- event append failure rolls back the score because loss of derived-state demand is unacceptable.

## Consumers

Each consumer owns an independent checkpoint/delivery row:

| Consumer | Reads after commit | Writes |
|---|---|---|
| Calcutta invalidation | Current financial pointer and compact golf revisions | Deduplicated recalculation demand/job |
| Net Skins invalidation | Configuration and affected round revision | Per-round recalculation demand/job |
| Competition projection | Canonical score/result revisions | Derived projection revision |
| Intelligence/storylines | Current projection dependencies | Derived snapshot |
| Google mirror | Event payload plus canonical readback | External write and verified checkpoint |
| Scorecard archive | Final lifecycle/result | Immutable archive job/checkpoint |

Consumers are at-least-once. Every action must be idempotent against event ID and semantic source manifest. One failing consumer does not stop another. A poison event is quarantined per consumer with a safe error; the base event remains immutable.

## Ordering and coalescing

Ordering is by canonical revisions, not wall-clock delivery. A consumer locks one scope and applies only an event whose revisions are not older than its checkpoint. Multiple hole events may coalesce into one recalculation job for the latest source manifest. Coalescing cannot drop audit provenance: the job records the first/last event IDs and count or a join table records every contributing event.

A late old event becomes `OBSOLETE` for that consumer after the current revision has advanced. It is acknowledged with a receipt, not silently deleted.

## Processing pattern

```text
claim consumer delivery with SKIP LOCKED
  -> lock domain scope
  -> read compact current revisions
  -> build bounded versioned source manifest
  -> compare consumer checkpoint
  -> no change: record NOOP/OBSOLETE
  -> change: enqueue or update deduplicated job
  -> commit checkpoint + receipt
```

Side-game calculation is another job step. Completion compare-and-swaps the same source manifest and current pointer. If source advanced, the result is retained as stale/superseded and never published as current.

## Backpressure and tournament priority

Canonical scoring receives the database pool and I/O priority. Consumers have bounded concurrency and may be paused without blocking scoring. Tournament mode exposes:

- oldest pending event age;
- pending/running/failed deliveries by consumer;
- current canonical revision versus consumer checkpoint;
- calculation/publication lag by side game;
- dead-letter count and safe replay eligibility.

If lag crosses policy, participant side-game views show stale/updating state. The system does not make scoring wait for financial recalculation.

## Delivery guarantees

The required guarantee is committed canonical event + eventual idempotent consumer progress, not exactly-once execution. Exactly-once claims are brittle across lost responses. Unique event/delivery keys, compare-and-swap completion and immutable receipts provide the observable equivalent.

External writes require verification before checkpoint. The existing Google worker already demonstrates claim, write, readback/verification, completion and failure/backoff behavior (`lib/scoring-google-outbox.js:269-339`). Reuse the pattern while keeping each consumer's contract separate.

## Acceptance

`NA-2026-019` pauses all workers, commits a physical score, proves one event, restores workers and verifies catch-up. Failure injection covers append rollback, duplicate delivery, lost completion response, worker crash after calculation, out-of-order delivery and one poison consumer. The same incident-numbered gate proves no worker/hash calculation is reachable from the synchronous scoring plan.

## Evidence

- Existing scoring transaction and Google outbox: `supabase/production_migrations/202608240021_production_scoring_operations.sql:1073-1145`.
- Existing synchronous Calcutta trigger: `supabase/production_migrations/202608290056_production_calcutta_v1.sql:1529-1615`.
- Existing synchronous Net Skins trigger: `supabase/production_migrations/202608290055_production_net_skins_v1.sql:1138-1213`.
- Timeout consequence: `/private/tmp/bagger-r3-write-timeout/REPORT.md:62-105`.
