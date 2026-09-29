# Committed three-round score-path sequence

**PASS — PROVEN within the recorded local INTEGRATION / POSTGRESQL / FAILURE_INJECTION fixture.** [Raw receipt](evidence/full-sequence.json), [test output](evidence/full-sequence.tap), [canonical result artifact](full-sequence-results.json). This is not a complete Open/Prepare/side-game-publication rehearsal.

| Round | Final matches | Official holes | Local adapter p50 ms | p95 ms | Max ms | Unexpected score failures |
|---|---:|---:|---:|---:|---:|---:|
| R1 | 6 | 108 | 1.596 | 9.420 | 19.342 | 0 |
| R2 | 6 | 108 | 1.551 | 9.623 | 10.203 | 0 |
| R3 | 12 | 216 | 1.340 | 9.084 | 10.597 | 0 |

The actual shipping PWA persistence adapter submits each hole through local transport to the unchanged canonical scoring/calculation body, with Phase1 request/correlation telemetry enabled. The independent oracle checks gross, strokes, net, hole winner, running scored-hole count, final winner and Nassau/Singles points; frozen context is unchanged. All 432 score receipts and 24 Final results are present. Final active access 0, unresolved score mutations 0, pending intents 0. No historical reset occurs between rounds. The records are synthetic and private to an owned Unix-socket database.

Score statements have a 1-second budget; worker statements 5 seconds. Fixture construction uses a separately labeled 30-second maintenance budget and is excluded from latency. The all-hole adapter median is 1.510 ms, p95 9.128 ms and maximum 19.342 ms locally. P99 is NOT PROVEN with 432 samples. These measurements include the local adapter/telemetry envelope, not hosted HTTP/Auth or durable fsync latency.

## Interruptions and reconciliation

Actual ACCESS_ACTIVATE records the first match's authority anchor before scoring. The following two score acknowledgements are deliberately discarded only after the real canonical transaction commits. Supported Lock or Finalize then commits before the participant resolves the original mutation through the status RPC. The recovered receipt supplies the canonical result used by the independent golf oracle; a retained client acknowledgement is not substituted.

| Match / hole | Original mutation | Discarded client outcome | Control committed before recovery | Recovered status | Active permissions | Exact receipts | Score request ms |
|---|---|---|---|---|---:|---:|---:|
| 2026-R1-1 / H2 | `d6acc6de-6b22-4623-87dd-d8bf5cd513e2` | LOST_ACK_AFTER_COMMIT | SCORING_LOCK | COMMITTED | 0 | 1 | 2.797 |
| 2026-R1-1 / H18 | `87359007-c207-4947-89ac-fa507ffae1c9` | LOST_ACK_AFTER_COMMIT | FINALIZE | COMMITTED | 0 | 1 | 1.593 |

Both cases verify locked state, zero active score permissions and exactly one canonical receipt for the original mutation. After the Hole 2 case, submit replay is denied and supported Resume restores access through its existing guard. Every match's final-hole receipt remains recoverable after Finalize. Normal score latency ends before the control operation and status recovery; the two recorded score-request measurements exclude both. Status recovery does not grant permission to write another score.

Before R2, the worker stops. A real 25 ms statement timeout against a 100 ms injected trigger rolls back gross/receipt/intent state completely; readback remains UNKNOWN and the same mutation then succeeds. There were 179 retained pending intents at the measured restart checkpoint. The separate child restarts and drains while subsequent scoring continues. An injected actual SQLSTATE 40P01 at claim creates a durable retry and then completes automatically. This particular injection is not a real lock cycle; separate deadlock tests preserve and exercise real reciprocal wait graphs.

## Result freshness is stronger than empty queue

The final idle observation must START after the last canonical Final commit, have complete status, zero materialization, pending automatic work, blocked work, active leases and terminal work, and all ready flags false. Independently reread canonical inputs then execute unchanged calculators to verify exact source fingerprints for four current Competition/Intelligence snapshots and one current Calcutta result linked to its successful job. NetSkins remains WAITING_OWNER; FinalRecap remains WAITING_PUBLISHED_FINAL_GATE. Neither is hidden as a delivered automatic result.

## Retained failed attempts

The first/second combined runs exposed a real worker/control lock inversion and retained 57014. A later run passed Lock but correctly failed Resume because the synthetic Live fixture lacked its original access receipt. The fixture was corrected by actual ACCESS_ACTIVATE, without replacing the guard. The fourth run completed all 432 holes/current result checks but its summary referenced a nonexistent column; the readback was corrected to the actual result_revision. All raw attempts remain in evidence; they are not rewritten into passing runs.

A subsequent rerun exposed a separate Calcutta current/job inversion during Finalize. That failed receipt and the exact previous migration 124 source are preserved. Focused tests reproduced claim, complete and fail reciprocal waits; the corrected paths acquire intent/current/job in compatible order. The final combined run is required again after every relevant shipping correction, including the independently discovered Net Skins owner-completion/control cycle.

The receipt completed at 2026-09-29T21:12:09.988Z; its recorded dependency closure, raw output digest and installed migration identities must match before this report is written. Source/migration hashes are attached to the successful receipt. Later source changes require impact-aware rerun; unrelated test additions do not retroactively alter this executed result. Hosted supervision, full Director UI, whole tournament setup chronology, physical clients and Production are NOT PROVEN.


## Complete-work inventory limitation

The final zero pending/terminal/lease observation covers only the new Calcutta, Competition and Intelligence worker families. It does not certify Google reporting outbox or external scorecard-archive completion. Those classes remain NOT PROVEN and P0-B remains PARTIAL; see [scope review](GOOGLE-OUTBOX-GAP.md). Scripted fault injection, supported owner controls and explicit owner-held financial gates must not be described as a universally intervention-free tournament rehearsal.
