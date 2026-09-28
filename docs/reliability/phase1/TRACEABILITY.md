# Phase 1 traceability

The preserved [requirements](../2026-tournament-postmortem/REQUIREMENTS.md) remain the historical authority. This table records implementation scope without declaring the source incidents resolved.

| Incident / origin | Requirement | Phase 1 implementation | Behavioral evidence | Remaining remediation |
|---|---|---|---|---|
| INC-025 observability; INC-018/019 unknown outcome and timeout | OBS-CORE-001 | UUID attempt scope, operation/mutation/job association, typed event schema, 34 route families and shared RPC adapters | OBS-001–018, independent schema/catalog/status/cache tests, baseline/candidate protected-path equivalence | Hosted binding/export/retention, native client telemetry, provider metrics and owner dashboard |
| INC-006 native SQLite false conflict | B11-SCORE-001/002; CERT-NA-001 | Byte-exact Build 10 repository, real SQLite writer/reopen processes, separate future candidate gate | NA-2026-006 PERSISTENCE; historical reproduction passes, Build 10 repair gate remains RED | Build 11 normalization and canonical reconciliation; physical multi-hole proof |
| INC-007 feature failure destroys shell | B11-NAV-001/003; CERT-NA-001 | Exact native checkout simulator harness; shell identity and selected destination assertions | NA-2026-007 SIMULATOR; historical reproduction passes, expected future behavior RED | Approved navigation/session contract and Build 11 implementation; physical proof |
| INC-010 Calcutta invalid SQL | DB-PERF-002; CERT-NA-001 | Real historical/corrected PostgreSQL function fixture | NA-2026-010 SQL; see initial Never Again catalog | Full hosted chronological lifecycle and compatible job recovery |
| INC-012 Net Skins invalid SQL | DB-PERF-002; CERT-NA-001 | Real historical/corrected PostgreSQL function fixture | NA-2026-012 SQL | Full native side-game lifecycle, processing and publication rehearsal |
| INC-017 false preparation assumption | DIR-OPS-002; CERT-001 | Offline operation-scoped verifier rejects placeholder or incomplete canonical context/readiness evidence | NA-2026-017 INTEGRATION; exact match/participant/context/revision comparisons | Director integration and self-certifying atomic Prepare; full R3 night-before chronology |
| INC-019 historical compatibility in score write | BE-SCORE-002; DB-PERF-001; PERF-001 | Release 139 SQL, synthetic accumulated history and old/repaired comparison | NA-2026-019 SQL/PERFORMANCE; benchmark rows identify environment/sample limits | Any remaining synchronous derived work; matched-compute capacity and sustained concurrency proof |
| INC-023 expensive live diagnostic; INC-024 resource pressure | OPS-SAFE-001 | Named current-state catalog, bounded single-flight runner, read-only transaction adapter | Diagnostic policy/CLI/adapter rejection and timeout tests | Dedicated database role/gateway; raw credentials can bypass repository tooling; provider headroom UNKNOWN |
| Certification confidence gaps | CERT-001; CERT-IMPACT-001 | Immutable postmortem hashes, explicit proof labels, local evidence collector | PRESERVE-001/002 and LOCAL-EVIDENCE.json | Full automated release evidence integration, stale-proof invalidation, physical and chronological certification |
| Prospective reproducibility risk | CERT-SYN-001 | Deterministic local-only schema/seed/history profiles; actual SQL calls | Benchmark harness safety/determinism tests | Full golfer/spectator multi-hour workload and tournament chronology |

IDs in the table omit only the common `2026-` prefix for readability. Test/catalog IDs retain their complete stable names. No incident ID is reassigned. Foundation tests demonstrate measurement or reproduction; only a later remediation gate can close an incident.

## P0 dimensions still required

A P0 implementation is not complete because a fixture exists. Each still requires the appropriate implementation, automated/integration test, performance test, physical acceptance where required, runbook, observability and fresh acceptance evidence. The native defects remain **EXPECTED RED — APPROVED P0**, outside default passing-protection assertions. Their candidate gate fails on missing checkout or failing behavior; it cannot turn a skipped simulator into tournament certification.
