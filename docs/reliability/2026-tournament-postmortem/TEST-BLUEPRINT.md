# Test and fixture target blueprint

All test architecture in this document is proposed.

## Independent proof layers

A release earns every applicable proof layer independently:

1. Unit tests.
2. Real PostgreSQL and RPC tests.
3. API and persistence integration.
4. Model and property-based sequences.
5. Performance and growth tests.
6. Failure injection.
7. Full synthetic chronology.
8. Physical phones.
9. Owner rehearsal.
10. Protected hosted smoke tests.

Independent layers may run in parallel. No layer substitutes for another.

## Permanent 2026 Never Again suite

Keep exact incidents separate: SQL claim and read qualification, activation-bound jobs and first-write activation, fractional SQLite timestamps, global Today reset, semantic Odds bounds, stale jobs, missing prepared contexts, historical-query timeout, missing configuration secrets, and physical recovery.

Provider and service-worker causes that remain unknown stay unknown. Tests cover their documented fault behavior and containment without claiming to reproduce exact causality.

## Fixtures and performance

The fixture generator records a deterministic seed, schema and contract versions, 24 players, all tournament formats, 54 holes, ownership, and expected golf and side-game outputs. Include realistic old jobs, results, receipts, and fractional dates.

Benchmarks run on the same provisioned profile and record query count, rows, buffers, temporary work, latency distributions, sample count, and cold or warm state. Growth tests at current, 2×, 5×, and 10× history reject critical-path cost growth. Normal, 2×, and 5× bursts plus an hours-long soak include spectator, Director, and worker loads.

These are proposed test shapes. Exact release thresholds come from the infrastructure-owned budget and matched-compute measurement.

## Failure injection

Cover lost acknowledgement, duplicate requests, request-before-acknowledgement, stale fingerprints, database restart, latency and connection pressure, 503 and 504 responses, worker crash, compatible activation changes, app background and termination, radio switching, and long-lived day transitions.

Invariants assert preserved authority, one commit for one operation ID, no partial round mutation, retained context, and explicit fallback.

## Physical acceptance

Record device, OS, build, role, network, test, expected result, actual result, time, and artifact. Use two distinct iPhones and accounts plus PWA and Director. Cover upgrade from Build 10, every format across an 18-hole flow, simultaneous same-match work, pending handoff, and feature-local 503 behavior.

The owner runs the full Director chronology and card-recovery workflow without engineering assistance.

Proof gaps, flake policy, chronological acceptance, and ownership are detailed in [30-TESTING-STRATEGY](30-TESTING-STRATEGY.md), [31-NEVER-AGAIN-SUITE](31-NEVER-AGAIN-SUITE.md), [32-2027-DRESS-REHEARSAL](32-2027-DRESS-REHEARSAL.md), [33-PHYSICAL-DEVICE-PLAN](33-PHYSICAL-DEVICE-PLAN.md), and [54-TEST-MASTER-LIST](54-TEST-MASTER-LIST.md).
