# Review templates and proposed architecture decisions

These records are proposed, not approved or implemented. Each must acquire an owner decision, date, implementation links and evidence before it becomes release authority.

## ADR register

| ADR | Context / decision proposed | Alternatives rejected or deferred | Consequences / acceptance |
|---|---|---|---|
| ADR-001 Server scoring authority | Retain gross-only client input; immutable server contexts calculate strokes/net/results. INC005/006/020 show client unreliability did not require rewriting golf authority. | Client handicap/net authority; direct-table recovery | Database is critical dependency; exact RPC/security/invariant tests and physical fallback required. |
| ADR-002 Native state ownership | Session identity, participant write admission, mounted tab shell and feature state have independent owners. INC007 proves the cost of coupling. | Persist tab only while still destroying shell; catch one feature503 | More explicit states; test every typed error, revocation and navigation transition. |
| ADR-003 Minimal transactional event seam | Commit canonical golf, audit/receipt and a minimal durable event atomically; derive optional side-game/projection state afterward. INC019 proves history must leave score path. | Increase timeout; synchronous historical comparison; broad event-sourcing rewrite | Eventual derived freshness becomes visible; duplicate/crash/retry/outbox integrity tests required. |
| ADR-004 Semantic current authority | Current pointers and versioned component manifests protect exact competitive meaning. INC016/017/019 show broad revision/history coupling. | Hash every convenient pointer; discover current authority from history | Explicit dependency declarations and current-pointer integrity; compatibility/property tests. |
| ADR-005 Tournament and maintenance separation | Bounded current workload on primary during play; deep diagnostics/chaos/history on isolated copy. INC023 shows diagnostic risk. | Prompt-only caution; larger compute without admission | Separate roles/routes/budgets and current snapshot freshness; security/load tests. |
| ADR-006 Supabase hardening first | Retain stack while optimizing queries, measuring capacity and verifying restore. Outage resource cause is unknown. | Immediate AWS migration based on one warning | Conditional equivalent-workload AWS POC only after measurable unmet requirements; no provider guarantee inferred. |
| ADR-007 Self-certifying operations | Stable ID, exact reviewed authority, atomic mutation, durable receipt and scoped readback are one operation contract. INC013/017/018 motivate it. | UI success from200; new request after timeout | Status endpoint and stale-review explanation; same-ID replay/concurrency/rollback proof. |
| ADR-008 Proof-layer readiness | Claims generated from fresh requirement/evidence graph; no PASS by proxy. INC006/010/012/019 expose wrong layers. | Count tests and infer readiness | More explicit NOT PROVEN statuses; physical and owner rehearsal cannot be automated away. |

## Change review template

```text
CHANGE_ID:
OWNER / ACCOUNTABLE REVIEWER:
INCIDENT OR PROSPECTIVE RISK:
DOMAIN:
COMPETITIVE IMPACT:
CONTRACT / SCHEMA / CONFIGURATION IMPACT:
NATIVE / PWA / DIRECTOR IMPACT:
DEPENDENCY / FINGERPRINT INPUTS:
BEFORE / AFTER CRITICAL PATH:
REQUIRED AUTOMATED / SQL / API / PERFORMANCE TESTS:
REQUIRED PHYSICAL / OWNER TESTS:
QUERY PLAN / LOCK / CONNECTION IMPACT:
UNKNOWN-OUTCOME / IDEMPOTENCY IMPACT:
SECURITY / RLS / SERVICE-ROLE IMPACT:
ROLLBACK AND DATA COMPATIBILITY:
EVIDENCE INVALIDATED / RETAINED WITH REASON:
DOCUMENTATION / RUNBOOK CHANGES:
KNOWN LIMITATIONS / EXPIRATION:
```

Native supplement must explicitly answer session impact, shell/tab/path ownership, local persistence and migration, network/offline behavior, supported contract versions, feature-local error mapping, privacy telemetry and physical test scope. A shared shell change automatically requires navigation regression; a score persistence change requires round-trip/kill/ACK/recovery regression. An old native contract must remain supported or degrade explicitly; no silent incompatible response.

Database function supplement requires owner, callers, exact input/output, transactional side effects, locks, required indexes, cost/timeout budget, volatility/planning implications, idempotency, grants/search_path and error contract. Migration applies cleanly is not enough; invoke the installed function and exercise every reachable critical branch.

Dependency guard supplement requires exact protected fact, reason to block, semantic compatibility rule, current-pointer lookup, owner-visible explanation, supported clearance, race behavior and safe automatic classes. New generic guards with no clearance path fail review.

## Source guard feasibility

Use SQL AST/function reachability plus targeted lint for schema-qualified special expressions; use known critical entrypoint call graphs to flag history aggregates and side-game calls. Couple static findings with query-plan and growth tests because dynamic SQL/planner inlining can evade text matching. Swift navigation/error lint can flag global authority invalidation or tab assignment outside approved owners; code review and state tests determine whether a flagged transition is legitimate. Mutation schemas must require idempotency for critical operations; grants enforce no direct canonical table writes. New hashes require a semantic input declaration checked in review and property tests. Static analysis is a warning/gate aid, not runtime proof.

## Pre-mortem and architecture review gate

Assume2027fails: (1) a new trigger reintroduces synchronous history; (2) a semantic contract change breaks older installed native; (3) physical network/queue state remains untested; (4) hidden stale publication blocksR3; (5) resource or restore assumptions were never measured; (6) automation retries a changed operation; (7) owner must interpret a generic error again. Each has a corresponding Never Again, mixed-version, performance, lifecycle, restore or owner rehearsal gate. Rank these before cosmetic expansion.

Review before coding: native state/error/intent/fallback/telemetry; backend score/current-pointer/job/dependency/error/operations contracts; database plans/indexes/migration/rollback; Director mobile review/status/recovery; test fixture/physical/evidence strategy. Record accepted choices and unresolved assumptions. Missing evidence is not approval.
