# Frozen Phase 2 before-state

Base: `184b5c65a8e63784e1af8d38121fa2e16a015628`, the pushed Phase 1 candidate. Historical Release 139 application SHA remains `b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6`. These are separate identities. This worktree is isolated from the owner’s dirty checkout and Production.

## Preflight

- Branch: `codex/reliability-phase2-score-path`; exact base / Phase 1 SHA above.
- Worktree: `/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv`.
- Node26.7.0 / npm11.19.0; local PostgreSQL17.11; macOS M5/16GB.
- Test environment: owned socket-only disposable PostgreSQL, synthetic identities, explicit runtime substitutions. No staging or Production access.
- Schema120 plus explicitly recorded historical SQL repairs/Resume fixture candidate; benchmark fixture/version/seed below.
- Original owner checkout was dirty and was left untouched. Managed isolated worktree created from the exact Phase 1 commit.
- Current Production release/activation and live activity were not queried. Preserved tournament evidence is historical, not current health metadata.

## Evidence captured before implementation

- [Baseline smoke](evidence/baseline-smoke.json): the Phase 1 owned local PostgreSQL harness reproduced all 17 operations × 2 samples and 4 comparison operations × 2 samples. Successful score rows mean ACCEPTED, not NO_CHANGE or replay. This is isolated SQL evidence, not hosted API or Production evidence.
- [Before catalog](evidence/before-catalog.json): installed local functions, indexes and triggers from the exact Phase 1 schema. It is not a live Production catalog. The trigger subset covers hole_scores/matches; the complete source inventory additionally includes mutation-receipt and Google outbox triggers.
- [Phase 1 score graph](../architecture/SCORE-CRITICAL-PATH-BASELINE.md), [current pointers](../architecture/CURRENT-POINTER-BASELINE.md), [benchmark fixture](../performance/BENCHMARK-FIXTURE.md), [Phase 1 results](../performance/BENCHMARK-RESULTS.json) remain unchanged historical evidence.
- Phase 1 schema boundary: `202609270120_bounded_late_r3_result_compatibility_v1.sql`, plus the explicit certified SQL repairs and scored-match Resume candidate recorded by `test/support/reliability/release139-schema.mjs`.
- Fixture: `bagger-r139-synthetic-history-v1`; seed `2026-never-again-139`; synthetic identities only. Scales 1, 2, 5 and 10 add operational and prior-year history while preserving the current tournament’s competitive shape.

## Before architecture — PROVEN by installed source

PWA/native request authentication → current identity/admission → canonical context → dispatch/runtime → `submit_production_hole_score` → current match lock → permission and mutation receipt lookup → revision/gross validation → frozen strokes/net/winner → hole upsert → synchronous Calcutta, Net Skins and projection triggers → bounded match progress → match update → triggers again → mutation receipt/first-write latch → revision history/audit/Google outbox → commit.

The frozen score function is intentionally revision-aware: a stale overwrite conflicts, while a different score with current revisions is a supported audited correction. It is not append-only. Match admission explicitly rejects locked/Final, checks current permissions, and depends on prepared authority; an invented standalone LIVE predicate is not substituted for the actual source.

## Before hazards

**PROVEN (SOURCE):** Calcutta source JSON/current result/job work executes under the match lock. Eligible late-R3 compatibility can call financial and consumed-history aggregates. Net Skins constructs current-round source and manages round jobs. Competition/intelligence updates the same five tournament job rows from both hole and match triggers. Those are derived responsibilities, not prerequisites for canonical gross/strokes/net/result truth.

**PROVEN (Phase 1 PERFORMANCE, local only):** score medians 23.026/24.057/26.190/23.071 ms at 1/2/5/10 history for the no-applicable-receipt path; historical defective comparison 74.087/96.206/155.672/294.089 ms. Those rolled-back local measurements do not prove durable commit, eligible-history, concurrency or Production latency.

**UNKNOWN before Phase 2 tests:** complete concurrent outcome behavior, eligible branch performance, durable lost-response resolution, Production resource headroom and physical clients. See [current certification](CERTIFICATION.md); later results must not be retroactively described as known before implementation.

## Later discoveries about the unchanged before-state

This addendum preserves what was initially known above. Later query-plan work identified another history-dependent security check: the mutation-receipt writer-fence guard scanned restored rehearsal history. An isolated 0/100/1000-row experiment found 25/250 buffers for the 100/1000 restored-row cases. The candidate adds an exact-predicate partial index; the guard and its global fail-closed meaning remain unchanged. See [query plans](QUERY-PLANS.md) for the experiment and before/after plans.

Later direct execution also reproduced SQLSTATE `42883` in three pre-existing future annual worker initializers: Calcutta, competition and intelligence claims still qualify LEAST/GREATEST with `pg_catalog`. Both the unchanged Phase 1 schema and Phase 2 candidate fail these actual function invocations. [Migration-safety evidence](evidence/migration-safety.json), `P2-MIG-ANNUAL-EXPECTED-RED`, records the counterevidence; a successful migration does not prove those future workers execute.
