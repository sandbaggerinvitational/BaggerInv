# Finite timeout proof

**PROVEN POSTGRESQL / FAILURE_INJECTION:**6 behavioral cases, 7 Node tests pass on the recorded candidate. [Receipt](evidence/finite.json), [raw](evidence/finite.tap), [details](timeout-results.json). Required performance headroom is separately measured in [PERFORMANCE.md](PERFORMANCE.md); this document alone does not close P0-E.

| Profile | Limit | Rationale / boundary |
|---|---:|---|
| Ordinary score and recovery |1000ms|Finite local test ceiling, many times the matched historical local tail; not a proposed Production setting |
| Derived worker SQL |5000ms|Broader post-commit calculation/authority work has a separate finite budget; three independent materialization calls can use up to15s in sequence |
| Intentional fault |25ms|Controlled100ms trigger delay or held lock forces real cancellation; never used to claim normal responsiveness |
| Fixture setup |30000ms where declared|Maintenance-only construction, excluded from measurements |

CREATE DATABASE TEMPLATE does not copy per-database settings. Every new clone explicitly receives and verifies 1 s/UTC; tests fail if a nominal finite profile is actually 0. No Production/request/provider timeout is increased or changed.

| Case | Actual exercise | Result |
|---|---|---|
| P2C-TIME-001 | normal finite database default applies to every new score connection | PASS |
| P2C-TIME-hole_scores | 25ms timeout rolls back canonical and durable work at hole_scores | PASS |
| P2C-TIME-score_mutations | 25ms timeout rolls back canonical and durable work at score_mutations | PASS |
| P2C-TIME-score_derived_intents_v1 | 25ms timeout rolls back canonical and durable work at score_derived_intents_v1 | PASS |
| P2C-TIME-LOCK | score lock timeout cannot fabricate a committed outcome | PASS |
| P2C-TIME-RECOVERY | finite recovery timeout never erases the committed receipt | PASS |

Failure before commit leaves no partial hole, score receipt or derived intent. The client/status path conservatively retains UNKNOWN where absence is ambiguous; controlled successful replay uses the same mutation. Timeout while reading an already committed receipt does not erase the receipt or restore revoked scoring permissions. Once the obstruction is released, recovery returns COMMITTED.

Worker cancellation is tested separately in delivery evidence: explicit PL/pgSQL query_canceled handling rolls back partial materialization, records the retry state and returns statusIncomplete; the runner cannot interpret that response as idle success. Database clocks govern due/lease time. Timing acceleration in designated lease tests is fixture-only and is labeled; actual backoff cases wait until the recorded due time.

Production timeout settings, I/O headroom, service pool behavior and provider restart timing are UNKNOWN. Finite local query correctness is not Production capacity certification.

