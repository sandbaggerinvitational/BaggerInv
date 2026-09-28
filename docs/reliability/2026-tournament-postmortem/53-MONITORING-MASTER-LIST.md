# Monitoring master list

`monitoring-catalog.json` is the machine-readable source. Every entry supplies category, condition, green/yellow/red, evaluation window, destination, owner action, automatic action, escalation, recovery, threshold status, and rationale.

## Coverage

| Category | Required signals |
|---|---|
| Database | Disk I/O budget, I/O latency/wait, IOPS/throughput, CPU, memory/swap, pool/backend connections, acquisition/login failures, statement/lock timeouts, locks/long transactions, temp spill, WAL/checkpoints, cache/vacuum, restarts/config change, forbidden history access, diagnostic guardrails, backup/PITR, replica lag |
| API/public | availability by semantic result, latency distribution, dependency/database time, unknown outcomes, rate/concurrency, cache/staleness, payload, physical time-to-usable |
| Scoring | success/rollback/unknown, end-to-end and transaction latency, receipt/canonical agreement, duplicates, conflict/recovery, Finalize/Reopen, outbox durability |
| Authority | each health component, aggregate compatibility, split authority, release/config/region drift, maintenance and transition receipts |
| Side games | synchronous-path violations, enqueue failure, queue age, worker failure/retry/dead letter, calculated/current eligible projection freshness, input/result fingerprint agreement, separate owner-publication state/age |
| Release/operations | manifest/preflight, migration/config drift, health window, competitive diff, freeze violation, backup/restore rehearsal, telemetry pipeline, evidence packet, paper reconciliation |

## Threshold governance

Values marked `PROVISIONAL` are proposed protective defaults; they are not measured 2026 percentiles or capacity limits. Values marked `BASELINE REQUIRED` describe a condition that must be instrumented before a number is approved. Ratification requires two complete event-shaped rehearsals, documented sample count/window, first limiting resource, false-positive review, owner approval, and catalog versioning.

Safety invariants do not need a baseline: one unknown score outcome, duplicate canonical hole, authority split, receipt/canonical mismatch, forbidden history query on the primary, or unapproved frozen change is red immediately.

## Routing

`pager` reaches Incident Commander and application/database on-call; `ops-channel` reaches tournament operations; `owner` is the named decision owner; `ticket` tracks non-urgent work; `provider-support` is opened by a human with the evidence packet. Exact integrations and people are **BASELINE REQUIRED**.

## Recovery and closure

Close an alert only on its authoritative recovery condition and after the specified healthy window. A PWA shell 200 does not close database/authority failure; a database restart does not establish root cause; HTTP 200 does not close a capacity alert; a queue drain does not prove side-game correctness. Preserve the incident link and remaining UNKNOWNs.
