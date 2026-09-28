# Phase 2 traceability

The historical postmortem and Phase 1 remain unchanged. New requirements are implementation/proof slices of preserved requirements, not silent replacements.

| Incident / requirement | Candidate implementation | Behavioral proof / performance | Remaining |
|---|---|---|---|
| 2026-INC-019 / BE-SCORE-002 / NA-2026-SCORE-CALCUTTA-HISTORY (alias NA-2026-019) | Migration 121 score-origin intents; current admission only | P2-DERIVED-*, 8 eligible branches, common/eligible benchmarks at 4 scales | Future annual runtime, current intent history, hosted capacity |
| 2026-INC-019 / BE-JOB-001 | Atomic family intent coalescing; existing workers | Atomic failure, 432-intent backlog, current-source parity | ADR's 3-family variation NEEDS OWNER REVIEW; the literal one-event requirement is not closed |
| 2026-INC-010/011/012/016/019 / BE-JOB-002 | Bounded retry/SQLSTATE/dead-letter handling | Injected failures in 3 families, 57014, 40P01, stale completion | Scheduler, dead-letter operations, annual worker SQL |
| 2026-INC-018/020 / BE-SCORE-003 | Existing receipt semantics preserved and characterized | 20 concurrent replays, connection loss before/after commit, restart, unknown outcome while in flight | Supported participant status resolution after revocation |
| 2026-INC-019/020 / BE-SCORE-001 | No formula/ownership change | 432 holes/24 Final matches + 72 edge holes; actor/grant checks | Physical, hosted, and complete context approval proof |
| 2026-INC-020 / BE-SCORE-004 | Canonical hole operations preserved | Current-revision correction, matching/same-Official/missing-hole behavior | No Director Scorecard Recovery UI; bounded batch design comes later |
| 2026-INC-019 / DB-PERF-001/002/003 | Required lookups and exact partial guard index | Plans, history scale, lock bounds, guard truth table | Capacity, finite timeout headroom, new intent history growth |
| 2026-INC-019 / OBS-CORE-001 | Phase 1 telemetry unchanged; worker SQLSTATE summary | Foundation: 88 pass, 2 skip; typed 57014 | Full worker correlation/release association |

New findings: P2-GUARD-HISTORY-001 (restored rehearsal scan), P2-CONTENTION-001 (shared markers), P2-WORKER-LOCK-001 (retryable worker 40P01), P2-ANNUAL-001 (pre-existing 42883), P2-RECOVERY-001 (permission before receipt), and P2-DELIVERY-001 (no autonomous retry). See the [P0 register](P0-REGISTER.md).

The change-impact addendum invalidates core, derived, concurrency, performance, and security tests when migration/core RPC/idempotency/context/helper/job contracts change. All new tests have incident or prospective traceability in the [test catalog addendum](test-catalog-addendum.json). Native expected-red tests remain unchanged and block future releases. No 2026 incident is marked fully resolved by this phase.
