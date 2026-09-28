# ADR: separate canonical score commit from derived source materialization

Status: **NEEDS OWNER REVIEW**. Candidate implemented in isolated branch only; not deployment authorization. Evidence: Phase 2 SOURCE, actual PostgreSQL, failure/concurrency/performance fixtures. See [package](../reliability/phase2/README.md).

## Context

Release 139 avoided historical Calcutta work only when no applicable compatibility receipt existed. Actual eligible branches still traversed history under the match lock. Separate competition/intelligence upserts serialized independent matches on shared tournament job rows. Golf correctness does not require financial/presentation recalculation before score commit, while dropping its durable demand would undermine final close and freshness.

## Decision

Keep canonical runtime/actor/permission/context/gross/strokes/net/hole/match/receipt/history/audit and existing Google outbox synchronous. Replace only hole/score-origin match Calcutta/NetSkins/projection source/job work with compact transactional family intents. Existing worker claims flush≤8 into unchanged downstream job systems, atomically acknowledge materialization, retain retries and dead letters. Current readers/close guard account for pending work. Emergency admission stop stays independent. No new service, network broker or scoring-rule change.

This is a deliberate variation from BE-JOB-001's literal one-event/five-consumer design: three family checkpoints coalesce per match/transaction; competition/intelligence reuse engine jobs and Google retains its existing outbox. It meets atomic invalidation and family failure isolation in tested cases but does not close that broader requirement. Owner/architecture review must accept the variation or require a unified event later.

## Alternatives

Increasing timeouts masks unbounded work and prolongs locks. A current-pointer-only patch helps lookup but does not remove Calcutta current-source construction or shared marker locking. Fire-and-forget loses correctness-relevant derived demand. A new distributed broker is unnecessary for a24-player tournament. Pure append without guarded consumers/close integration would cause false finality. Relaxing score permissions or returning receipts before auth is not acceptable recovery design.

## Consequences

Score path becomes independent of slow derived source/job history, but durable intent insert can correctly abort a score if recording required delivery fails. Side-game presentation may be updating until current source is materialized/calculated; existing freshness/publication checks remain. Worker backlog/retry/retention/metrics become explicit operational responsibilities. Autonomous retry, dead-letter recovery, future annual-runtime defects/attestation and client status recovery remain blockers. Existing calculation functions and compatible response shapes stay unchanged.

## Rollback

Application rollback alone is insufficient. Preserve and reconcile outstanding intents before restoring trigger/claim/reader/close definitions; never drop unresolved financial demand. Re-certify manifest/runtime authority. No live rollback or deployment has been performed; see [deployment plan](../reliability/phase2/DEPLOYMENT-PLAN.md).

## Scope containment and required safety lookup

Non-score round/match controls keep their original enqueue/marker work. Exact same-transaction COMPETITION intent provenance distinguishes the canonical score match update; no client flag or RPC behavior change is introduced. A separate index-only hardening of the existing unrestored-writer-rehearsal guard excludes restored history. The before/after plan and RUNNING/FAILED/RESTORED truth-table evidence justify the index while preserving the global safety fence.
