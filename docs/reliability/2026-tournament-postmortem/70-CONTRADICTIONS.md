# Contradictions, corrections, and historical/current separation

| Claim A | Claim B / authoritative evidence | Resolution | Process change |
|---|---|---|---|
| R3 was prepared and ready | Pairing receipt had `snapshotPrepared:false`; canonical state later showed 0 prepared / S1 | Pairings were committed. Preparation was not proven and was later proved absent. | Self-certifying Prepare with exact 12-context readback; `NA-2026-017` |
| Build 10 cannot recover | Unchanged shipping SQLite/HTTP code recovered in separate-process tests | A bounded relaunch path exists. It is not guaranteed: 47/50 syncing placements recovered, 3/50 re-triggered the timestamp defect, and 25/25 acknowledged placements recovered. No physical-native recovery was claimed. | Separate operational recovery from the permanent fix; `NA-2026-006` |
| Every physical phone had the exact `Date` bug | No phone queue was extracted; a deterministic mechanism matched the symptoms | Defect mechanism PROVEN; attribution to every affected device STRONGLY SUPPORTED, not device-proven | Request and intent telemetry; `NA-2026-006` |
| The service-worker banner caused the PWA scoring block | Server returned `START_SCORING` 503 because the signing secret was missing | Scoring cause PROVEN independently; physical phone banner cause UNKNOWN | Separate correlated symptoms; `NA-2026-014` and `NA-2026-015` |
| Odds HTTP 200 means the response is usable | Native semantic numeric bounds reject a large legitimate value | Transport success does not prove native presentation compatibility | Contract semantic probe; `NA-2026-008` |
| 59 holes were authorized for recovery | Fresh final run wrote 34 and skipped 38; one card was completed independently | These are different timestamps; there is no evidence of overwrite or omitted authorized recovery | Fresh per-hole preflight; `NA-2026-020` |
| Calcutta result 231 / 407 / 423 / 424 | Snapshots were taken at different times | Version progression, not contradiction; result 424 was OFFICIAL at 12:26Z on Sep 27 | Timestamp every state claim |
| PWA HTTP 200 means the system is healthy | Authority returned 503 and database timeouts while the HTML shell returned 200 | Shell availability does not prove database authority | Domain-specific health checks |
| Disk I/O caused both outages | The warning is correlated; provider traces are missing | Primary hypothesis; cause UNKNOWN | Retained metrics and provider incident record; `NA-2026-022` through `NA-2026-025` |
| R3 was partially opened by the original Open | No original receipt or child keys exist; later independent Mark Live keys do | Original operation produced no proved commit; later partial current state came from independent operations | Keep operation outcome and current state distinct; `NA-2026-018` |
| The Build 9 report appears to be a physical-device test | It explicitly names an iOS 26.5 simulator and says physical testing is pending | No physical-proof claim may be derived from the simulator device name | Always label device kind; `NA-2026-003` |

The [evidence ledger](evidence-ledger.json) links the original reports. The audit does not silently reconcile genuinely missing evidence. Post-tournament golf completion does not establish every final side-game publication or archive operation.

