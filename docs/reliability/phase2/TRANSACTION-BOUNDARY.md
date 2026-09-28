# Transaction boundary

## Before — PROVEN source and isolated installed catalog

One PostgREST score RPC runs in one PostgreSQL transaction. Application authentication/admission/context HTTP reads happen before it and are not part of its atomic boundary. SQL revalidates the required authority.

1. Shared scoring-admission transaction advisory lock and exact release/pointer/runtime checks.
2. Confirmed active actor/role/membership and optional Director entitlement.
3. One `matches` row `FOR UPDATE`; permission and exact mutation-key lookup.
4. Compare revisions, lifecycle, cardinality and gross inputs; read frozen hole/participant/snapshot authority.
5. Upsert one `hole_scores` row. PostgreSQL AFTER triggers execute immediately in the same transaction: Calcutta, Net Skins, annual derived markers, plus gated future variants.
6. `match_progress` reads at most 18 current-match holes; update the same match and run affected triggers again.
7. Append mutation receipt, revision history, audit and Google outbox intent. The receipt insert runs the rehearsal guard and first-write observational latch; the outbox insert binds annual generation.
8. Commit. Only then can a successful database response prove committed authority. Network loss before the caller sees that response remains ambiguous until readback.

Locks therefore include shared admission, match row, indexed constraint/FK locks, Calcutta current tournament row and enqueue advisory lock, Net Skins round advisory lock, derived job rows and the first-write latch when applicable. Calcutta/Skins/history work holds the match lock longer than canonical golf needs.

## Target / candidate boundary

Steps 1–4 and canonical formulas remain unchanged. Side-game trigger admission predicates remain; only score-origin trigger invocations insert/coalesce small per-match/family intent rows. The five shared competition/intelligence job updates for those score-origin invocations move to materialization. Required receipt/audit and Google outbox remain synchronous. The one-time first-write latch still records evidence without advancing activation (migration 118).

The deferral branch applies only to a hole write and a match update with an exact same-transaction COMPETITION intent already present. This keeps separate Lock/Open/Prepare/Finalize and round-status operations on their original enqueue path. No caller-controlled flag or score RPC body change identifies the scope. The receipt rehearsal guard remains mandatory; a new partial index narrows its physical lookup without narrowing which unrecovered rehearsal can block scoring.

The atomic set is **hole + match state + mutation receipt + revision history + audit + required mirror/derived intent**. If intent append fails, the score rolls back. No fire-and-forget callback can replace the durable intent. No score transaction invokes historical compatibility or side-game source aggregation after this change; this is a behavioral gate, not something established solely by the diagram.

## Worker boundary

An existing authenticated claim function takes a bounded set of pending intents. Each row is locked with `FOR UPDATE SKIP LOCKED`. Existing current-authority enqueue and intent acknowledgement share the worker transaction. A subtransaction catches ordinary materialization errors, rolls back that row’s partial derived work and records safe SQLSTATE/backoff. Query cancellation aborts the worker transaction; the prior committed score and intent remain. At five failed attempts, DEAD_LETTER remains a close blocker. No generic bypass or silent automatic reset exists.

An old intent is a request to observe current canonical state; it is not a stored calculation snapshot. Existing jobs still retain their activation/configuration/source/lease rules. Consuming an intent at a newer compatible deployment creates current work; it does not carry forward an old activation-bound job.

**PROVEN worker contention:** mixed-round Net Skins materialization can take R1 then R2 while another worker takes R2 then R1. `P2-MIG-SKINS-DEADLOCK` captured a cyclic advisory-lock graph and one `40P01`. The inner failed materialization rolls back, records RETRYABLE/attempt/SQLSTATE, and the outer worker transaction commits its earlier successes before releasing its prior round locks. A later fresh claim after `available_at` can process the same retained intent; the test explicitly advances only its fixture retry clock and demonstrates that recovery. This is a known recoverable worker deadlock, not zero deadlocks. A scheduler or subsequent supported worker invocation is still required; backoff does not itself trigger execution.

## Finalize and corrections

Finalize remains a separate RPC requiring complete coherent 18-hole authority, revoking access and committing its immutable scorecard snapshot/archive intent atomically. Its existing synchronous side-game enqueue and engine-marker work is retained when no hole mutation occurs in that transaction. Its archive work is not removed merely to improve a hole-save metric. Score corrections use current revisions and the same audit/derived invalidation transaction as first-entry scoring; they may invalidate side-game state legitimately.

## Measurement limits

Request latency, RPC duration, PostgreSQL transaction elapsed time, nested statement count and lock holding are different metrics. The primary rollback benchmark times the function only; rollback runs outside its timing window. The separate instrumented transaction window includes rollback/socket cost, and neither establishes durable fsync/commit latency. Nested plans can count the same rows/buffers repeatedly. See [performance](PERFORMANCE.md), [concurrency](CONCURRENCY.md) and [failure injection](FAILURE-INJECTION.md) for actual proof and gaps.
