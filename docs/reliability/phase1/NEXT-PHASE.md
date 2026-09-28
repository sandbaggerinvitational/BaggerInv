# Next single phase: score critical-path hardening

## Decision

Recommend **Candidate A — SCORE CRITICAL-PATH HARDENING**, scoped to the canonical score transaction and its synchronous Calcutta dependency work. Do not begin Build 11, a broad side-game redesign, or an AWS migration in that phase.

The Phase 1 local series supports the existing Release 139 repair: the corrected score path is approximately bounded as unrelated history grows, while reinstalling the historical compatibility function makes the same operation grow materially. This is evidence to preserve the repair, not evidence that Production is currently timing out. The remaining architectural exposure is visible in source: a score can still execute tournament-wide Calcutta source construction, hashing, current-pointer locking and job bookkeeping synchronously through database triggers. The eligible-compatibility branch, actual API/auth chain, durable commit, concurrent workers and provider resources remain incompletely measured.

This choice follows approved `BE-SCORE-002`, `BE-SCORE-001`, `DB-PERF-001` and incident `2026-INC-019`. It removes a scoring-availability failure class and establishes a stable backend contract before native work. Connection/I/O capacity and restore evidence remain mandatory parallel planning inputs, not waived because local SQL is fast. The evidence does not justify migration away from Supabase.

## Prerequisites

1. Review and accept this phase's evidence limits, expected native RED gates and known baseline test failures.
2. Approve the exact transaction boundary: identity, authorization, idempotency, current context, gross validation, server strokes/net/hole and match state, required audit and a durable derived-work intent remain transactional.
3. Resolve how a derived consumer will preserve financial freshness, ordering, replay and publication semantics before moving any work. Reuse existing durable job/outbox infrastructure where sufficient; do not introduce distributed services by default.
4. Capture a fresh comparable isolated benchmark at the implementation base. Inspect the relevant eligible-receipt and concurrent-worker branches, not only the favorable ineligible case.

## Scope

- Measure the actual application-to-RPC score chain, with subphase evidence where available, in the non-Production fixture.
- Inventory and justify every synchronous score trigger/helper; separate canonical correctness from derived presentation/freshness work.
- Make irrelevant historical compatibility work structurally impossible on the score path, including both eligible and ineligible receipt states.
- If safe, replace synchronous derived source reconstruction with a bounded durable event/job intent in the canonical transaction and an idempotent post-commit consumer. Preserve existing financial inputs, publication review and audit history.
- Preserve supported mutation IDs, stored receipts, rollback, conflict behavior, server-owned calculation, permission/lease/security checks and finalization invariants.
- Add failure injection: derived consumer unavailable, repeated event, stale input, competing worker, lost score acknowledgement and retry of the same mutation.
- Retain Phase 1 correlation/privacy contracts and update the critical-path diagram, plans and evidence.

## Non-goals

No native navigation/queue/UI fix; no new scoring rules; no handicap/pairing/financial-data change; no lifecycle-wide side-game rewrite; no Director redesign; no Production diagnostic load, deployment or mutation without a separately reviewed release task. No timeout or compute increase as a substitute for the bounded path.

## Acceptance criteria

- Actual score SQL and API behavior preserve gross, server strokes/net, hole/match results, idempotency, authorization, revision checks and required receipts in a baseline/candidate comparison.
- A post-commit derived failure cannot roll back a valid canonical score **only after** durable intent and retry semantics are proven. No event is lost; duplicate delivery cannot duplicate financial results/publications.
- No historical payload aggregate appears in any score branch. Plan evidence, failure-injection spies and 1x/2x/5x/10x data prove this rather than source inspection alone.
- Score latency and query work meet an explicitly approved matched-environment budget; report full API, SQL and durable-commit measurements separately. No invented p99 or hosted claim.
- Worker retry, lease, supersession, ordering, current-pointer freshness and eventual presentation are tested through real SQL and unchanged/calibrated calculators.
- Security, rollback, concurrency, same-mutation replay and the relevant Never Again gates pass. Existing unrelated failures require exact baseline reproduction and documented review.
- A reversible migration/install plan, compatible rollback and source/evidence manifest exist. No live deployment is part of the default task.

## Risks

Moving work after commit changes when derived state becomes visible. A durable queue is necessary but insufficient without correct eligibility, event ordering, publication dependencies and replay. The change must not silently turn stale money-game data into current data. Release/activation compatibility must also remain explicit. If these semantics cannot be proven within a bounded patch, stop the affected implementation and complete the design/evidence rather than weakening guards.

## Recommended next Codex task

Implement the approved score critical-path hardening phase in an isolated worktree using this Phase 1 fixture and evidence. Begin with the transaction-boundary and trigger review, extend the missing branch/concurrency/API fixtures, and make only the smallest correction that removes irrelevant historical/derived work while preserving canonical correctness. Run isolated SQL/API/security/performance/failure-injection gates, produce a rollback plan and exact evidence, and commit the reviewed candidate. Do not deploy, mutate Production, change competitive data, or implement Build 11.

**Recommended configuration:** GPT-6 Astra; highest reasoning effort offered by the selected Codex host (the current desktop advertises `ultra`); Standard speed. This is a cross-cutting transaction, SQL, worker and compatibility change. A narrower follow-up can use GPT-5.6 Sol Extra High after those contracts are stable. Model availability is host-dependent; do not equate an API effort name with every desktop option.

This recommendation is not execution authorization for the next phase. The owner reviews it separately.
