# Testing architecture and proof ownership

**Audit boundary:** historical evidence and source review only. No Production/staging requests, mutations, builds, deployments or source changes in this audit. Proposed designs are not implemented or approved release evidence. Unknown measurements remain unknown.

The missing dimension in 2026 was often not another unit assertion: it was the execution layer or chronological input state. Calcutta's calculator passed while the real PostgreSQL claim initializer failed; native queue fixtures did not expose a fractional Date persistence round trip; isolated setup tests did not traverse post-R2 dependencies and real preparation pointers. The large passing suites remain valuable for the precise contracts they executed.

## Environment and suite ladder

| Level | Purpose / target | Trigger | Responsible | Cannot prove |
|---|---|---|---|---|
| Unit | Pure calculations, validation, DTO and state transitions | Commit | Domain owner | SQL runtime, device/network behavior |
| SQL/RPC | Clean install + prior-schema upgrade; execute claim/complete/read/write; grants/RLS/locks/rollback | Every SQL/critical change | Database owner | Physical UI |
| API | Real auth/configuration/serialization/error and idempotency contracts | PR | Backend/PWA | Phone SQLite precision alone |
| Integration | Client coordinator→HTTP→RPC→receipt→readback, actual persistence | PR/release | Cross-domain owner | Cellular radios |
| Model/property | Every legal transition, deny illegal transition, generated sequences | PR/nightly | Domain owner | Unmodeled lifecycle |
| Performance | Current and accumulated history, exact plans/buffers/percentiles | Critical PR/candidate | Database/infra | Production capacity without matched compute |
| Failure injection | Lost ACK, DB restart/latency, worker crash, release change, duplicate calls | Candidate | Reliability | All provider failures |
| Synthetic tournament | All 54 holes in chronology, all configurations/dependencies | Freeze candidate | Certification | Physical acceptance |
| Physical tournament | Multiple phones/accounts/radios, upgrade and app kill | Final candidate | QA + owner | Unlimited device population |
| Owner rehearsal | Operate Director and recover incidents without engineering | T-21/T-14 candidate | Owner | Operations never exercised |
| Hosted smoke | Release identity/config/grants/cheap canonical reads | Promotion | Release owner | Load/chaos/SQL branch coverage |

Use local for fast tests, CI for deterministic suites, integration DB for real SQL, staging for deployment contracts, Production-shaped certification clone for history/load, physical QA backend for phones, Production for bounded smoke only, maintenance clone for audits. Never point bots/synthetic writes/chaos at Production. Environment allowlist and distinct credentials must enforce this.

## Fixture quality

Version deterministic pre-tournament, R1 ready/live/final, R2 ready/final, R3 unpaired/paired/unprepared/prepared/live, final tournament and side-game variants. Include fractional native timestamps at known failing positions, stale READY jobs, published/withdrawn/superseded revisions, mixed R1 Official/R2 Official/R3 Configured, activation-bound work, accumulated audit/history and large Odds numbers. Keep expected outcomes independently derived; do not mirror the production function as its own oracle.

Generator: 24 synthetic stable IDs, diverse plus/high handicaps, two teams, Best Ball/Scramble/Singles, courses and stroke indexes, all 54 gross holes, dormie/early result/ties, ownership single/split exactly100%, auction totals, Net Skins ties, extreme Odds. Record seed/fixture schema/hash and expected score/net/results/points/side-game outputs. Reset tooling restores an isolated initial snapshot transactionally; it refuses Production destinations.

Participant bots operate the real API one hole at a time, retain mutation IDs, pause, lose responses, replay, background, reconnect, use stale contexts and contend on same match. Spectator bots are separately budgeted and exercise Today/Matches/cards/leaders/Odds/history; they cannot starve scores. Model 24 participants, observed spectator baseline once measured, normal/2x/5x burst and multi-hour/day-boundary soak. Do not invent 2026 traffic peaks.

## Properties and model tests

Always: one golfer per round; exact match participants; immutable Official revision except audited correction; same mutation yields ≤1 commit; prepared context matches HI/course/tee/pairings; Final implies result and no active access; points sum; ownership100%; current pointer valid; optional feature failure does not invalidate identity. Apply CI property tests and affected-scope post-mutation monitors. Model Round,Match,Score,NetSkins,Calcutta,Odds,Pairing,Preparation,Intent,Session,Navigation. Test sequences, not just snapshots.

## Flaky test policy

A P0 flake blocks release until explained and deterministically reproduced or its required proof is replaced by an equally valid independent test. One diagnostic rerun can distinguish harness/environment failure; never rerun until green and erase the original. Quarantine means NOT PROVEN, with owner, deadline and impact; deleting/skipping P0 requires review. Failures retain seed, fixture, SHA, exact operation/request IDs, scoped DB state, logs and relevant screenshots.

Physical automation can launch/terminate via XCTest and use conditioned networks; simulator automation remains labeled simulator. Owner radio switching and long-lived app behavior remain required. Participant beta includes multiple real users, independent accounts and confusion/recovery observations. Test ownership is explicit in the catalog; no “another suite covers it.”
