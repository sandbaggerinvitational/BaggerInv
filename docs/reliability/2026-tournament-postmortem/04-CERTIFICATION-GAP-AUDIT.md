# Why certification missed the failures

## Direct conclusion

Component tests protected many calculations, permissions, and idempotency rules. Strong counts and narrow source diffs were sometimes allowed to imply broader operational readiness. The inspected reports often explicitly withheld physical or hosted proof; the failure was both missing proof and later confidence exceeding those boundaries. Do not rewrite every historical PASS as dishonest or useless.

| Incident | Actual prior proof | Missing condition / classification | Proposed gating test |
|---|---|---|---|
| `2026-INC-001` timezone | Fresh renders and time helpers; later 159 browser renders | Long-mounted session across timezone/day boundary; WRONG LIFECYCLE | `NA-2026-001`: mounted clock plus physical timezone profile |
| `2026-INC-002` spectator navigation | Contract and UI tests | Tournament-wide links paired with round-scoped position; WRONG FIXTURE | `NA-2026-002`: full multiround link order |
| `2026-INC-003` More | Gallery and screenshot PASS | DEBUG outer-light fixture masked Release dark appearance; WRONG FIXTURE | `NA-2026-003`: Release-equivalent outer appearance in light/dark |
| `2026-INC-004` Today; `2026-INC-026` physical observation | DTO/refresh tests and bounded reads | Composite pending/retry behavior and physical request correlation; WRONG STATE, OBSERVABILITY | `NA-2026-004` for Today state; `NA-2026-026` for correlated physical observation |
| `2026-INC-005` strokes | Server stroke and scoring math were correct | Unscored-hole physical UI badge; WRONG LAYER | `NA-2026-005`: all player-hole allocations projected before entry |
| `2026-INC-006` queue | Queue/coordinator tests | Real SQLite fractional-`Date` round trip; WRONG FIXTURE, NO PHYSICAL | `NA-2026-006`: real SQLite, deterministic fractional tick, and kill/relaunch matrix |
| `2026-INC-007` shell | Authentication fail-closed behavior tested | Feature 503 mapped to global state; NO ISOLATION SEQUENCE | `NA-2026-007`: every feature plus foreground/background and tab/path preservation |
| `2026-INC-008` Odds | Bounded DTO values | Legitimate large American odds; WRONG DATA RANGE | `NA-2026-008`: extreme valid Odds API/native contract |
| `2026-INC-009` side games | Clean published fixture | R1 Official / R2 Official / R3 Configured; WRONG LIFECYCLE | `NA-2026-009`: chronological mixed states |
| `2026-INC-010`, `2026-INC-012` SQL | JavaScript engine, native DTO, and migration-application tests | SQL claim/read initializer was not invoked; WRONG EXECUTION LAYER | `NA-2026-010`, `NA-2026-012`: exact installed RPC claim → process → complete → read |
| `2026-INC-011` job activation | Guard and processor tested independently | Pending job crossed a normal rebind; NO DEPENDENCY INTERACTION | `NA-2026-011`: compatible release with a pending job |
| `2026-INC-013` Open | Single-write and Open tests | First-write audit plus multistep Open; NO CHRONOLOGY | `NA-2026-013`: fresh first write through a full atomic round |
| `2026-INC-014` PWA | Preview key present | Production key missing; ENVIRONMENT CONFIG GAP | `NA-2026-014`: protected hosted capability/configuration validation |
| `2026-INC-015` service worker | No exact active/waiting evidence from the affected phone | Physical service-worker state UNKNOWN; OBSERVABILITY | `NA-2026-015`: versioned controller and activation telemetry |
| `2026-INC-016` Odds lifecycle | Current-publication guard worked | Stale READY job was hidden; NO CHRONOLOGY / UX | `NA-2026-016`: after-R2 to R3-pairing workflow |
| `2026-INC-017` Prepare | Local 12 READY was later proved | Pairing receipt incorrectly supported a preparation assumption; NO CANONICAL READBACK | `NA-2026-017`: post-Prepare proof of exactly 12 current contexts |
| `2026-INC-018` unknown Open | Atomic idempotency contract | Stored intent became stale after independent operations; UX GAP | `NA-2026-018`: lost response plus concurrent lifecycle change |
| `2026-INC-019` timeout | Clean, small SQL fixtures | Historical growth and predicate planning; WRONG VOLUME, NO PERFORMANCE | `NA-2026-019`: exact RPC with accumulated history and buffer/plan evidence |
| `2026-INC-020` cards | Canonical RPC was safe | No Director bulk physical workflow; NO FALLBACK REHEARSAL | `NA-2026-020`: owner recovery without engineering |
| `2026-INC-021` clear | Entry edit | Removing the last entry was not modeled; WRONG LIFECYCLE | `NA-2026-021`: draft-auction correction chronology |
| `2026-INC-022` through `2026-INC-025` infrastructure | Health 200 and bounded observation windows | No resource/time-series capacity proof; NO RESOURCE PRESSURE | `NA-2026-022` through `NA-2026-025`: matched-compute multihour soak, restart, admission, and observability |
| `2026-INC-026` spectator physical observation | Symptom report plus nearby successful reads | No request-level physical attribution | `NA-2026-026`: physical request correlation without claiming a known cause |

Gap codes also include NO TEST, NO MULTI-DEVICE, NO NETWORK FAILURE, NO LONG-LIVED SESSION, NO SQL/RPC EXECUTION, NO PRODUCTION-SHAPED HISTORY, OVERBROAD PASS CLAIM, and NO FULL-LIFECYCLE. These are incident-specific, not a blanket assertion that no such tests existed anywhere.

## What was actually proven before play

**PROVEN within retained scope:** calculations and DTO validation were tested; spectator public/private boundaries were tested; specified Build 8, 9, and 10 visual/state corrections were tested at their stated layers; exact source lineage/build was established; some isolated SQL/security tests passed; approved HI13 and R1/R2 readiness snapshots existed.

**PARTIALLY PROVEN:** scoring queue behavior, authentication restoration, native public reads, side-game calculators, and release safeguards.

**NOT PROVEN:** physical multi-user, all-format, 18-hole operation through accumulated chronology; current infrastructure resource headroom; complete side-game SQL lifecycle; all hosted PWA secrets; exact future R3 configuration sequence.

**WRONGLY ASSUMED:** an inherited component PASS implied tournament readiness; pairing commit implied prepared state; a healthy read implied capacity; HTTP 200 implied native-usable presentation.

Nearly all missing conditions can be reproduced in advance: real persistence, poor networks, historical growth, state chronology, missing secrets, pending activation jobs, and database degradation. Exact provider-outage timing or cause may be difficult to foresee, but safe behavior under outage is testable.

