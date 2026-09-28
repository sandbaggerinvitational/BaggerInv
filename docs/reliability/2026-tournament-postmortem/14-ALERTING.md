# Alerting and automatic incident detection

The machine-readable source is `monitoring-catalog.json`. Numerical thresholds are provisional unless the catalog says `BASELINE REQUIRED`. They must be recalibrated from isolated load tests and two complete dress rehearsals. No threshold is a claim about a measured 2026 p95.

## Severity

| Severity | Meaning | Initial response |
|---|---|---|
| SEV-1 | Scoring commit or authority unavailable, unknown write outcome, data-integrity risk, dual authority, restore/failover active, or widespread outage during Tournament Mode | Page Incident Commander and database/application on-call immediately; enter INCIDENT; preserve evidence; stop low-priority workloads |
| SEV-2 | Sustained capacity red, repeated scoring errors/timeouts, side-game write-path regression, release/authority drift, backup/PITR failure near event | Page on-call within 5 minutes; investigate and contain; owner notified |
| SEV-3 | Yellow capacity trend, latency regression, queue delay, scrape/log gap, approaching backup/restore deadline | Operations channel and ticket; owner action in the defined window |
| INFO | Expected state transition, completed recovery, resolved alert, rehearsal result | Evidence ledger only unless subscribed |

## Destinations and roles

- `pager`: Incident Commander plus primary/secondary application and database on-call.
- `ops-channel`: tournament operations and Director view, with safe human-readable impact.
- `owner`: designated tournament owner for state-changing decisions.
- `ticket`: backlog item with evidence link and acceptance test.
- `provider-support`: opened by a human with the preserved metric/log packet when provider involvement is plausible.

Exact people, phone numbers, chat/email tools, and provider support plan are **BASELINE REQUIRED**. Alerts are never sent to golfers unless the Incident Commander activates a preapproved status message.

## Alert behavior

- Group by tournament, service, incident signature, release, and authority generation.
- Deduplicate component alerts behind one incident while keeping each component visible.
- Page immediately on a single scoring unknown outcome, dual authority, or canonical integrity mismatch.
- Require a short sustained window for noisy resource gauges; do not wait for multiple failures when a hard safety invariant breaks.
- Yellow automatically pauses P4/P5 workloads where safe. Red pauses P2-P5 as defined by Tournament Mode; this is workload shedding, not a database mutation.
- Auto-recovery is limited to reversible actions: pause a worker, reduce refresh, serve a time-stamped last-known-good public snapshot, or retry an idempotent background job within policy.
- Never automatically deploy, migrate, resize, restart, restore, fail over, switch authority, replay an unknown score, finalize/reopen, or publish a side game.

## Incident-specific detection

### INC-022 overnight authority 503

Detect health component failures separately. Alert red when aggregate health is incompatible in two consecutive 30-second probes during Tournament Mode or when any scoring request encounters the same condition. Include component result, connection-acquire phase, request IDs, release/authority, database restart time, and provider metrics.

### INC-023 morning recurrence / heavy diagnostic

Alert immediately on any query from a tournament runtime role that accesses a history schema or exceeds its bounded role timeout. The primary prevention is grants and route policy. A 90-second Production diagnostic must be impossible, not merely observable.

### INC-024 Disk I/O budget

Provisional policy: green at less than 1% daily budget consumed, because Supabase documents any value above 1% as evidence that workload exceeded baseline; yellow at 1% to less than 50%; red at 50% or more during the event window, or any rapid depletion projected to exhaust before event close. A provider warning, elevated I/O wait, or unresponsive instance also raises severity. These conservative thresholds must be validated against the actual metric semantics and selected compute. Supabase documents that 100% means the available budget has been used. Official provider documentation observed on **2026-09-27**; Production metric history/configuration remains unverified. [Supabase Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)

### INC-025 observability gap

Alert if metrics, logs, traces, backup status, or authority-component telemetry is absent for more than two scrape intervals. During Tournament Mode, missing observability is at least SEV-2 because it invalidates capacity and root-cause claims.

## Recovery criteria

An alert resolves only when the invariant is restored for its configured window and the recovery signal is authoritative. Examples: successful component health samples plus database access; an unknown mutation resolved by same-ID receipt/canonical readback; I/O and connection headroom stable with low-priority work still paused; queue age drained; release/authority manifest exact; backup/PITR point verified.

HTTP 200 alone does not resolve a capacity alert. A PWA shell 200 does not resolve an authority alert. A restarted database does not resolve root cause. Alert resolution records the evidence link and any remaining UNKNOWN.

## Supabase support and provider escalation

Open a provider case when a core outage, unplanned restart, sustained provider/resource red state, control-plane failure or unexplained service degradation remains after bounded application/query checks. A human opens and owns the case; automation may assemble the draft.

The case packet includes project/reference and region, UTC/local incident window, request and provider event IDs, exact release/activation/deployment/database start time, user impact, component-health results, resource/pool/query/wait graphs, change history, backup/PITR state, bounded reproduction, mitigations already taken, and explicit questions. Remove credentials, tokens, participant data and raw competitive/financial payloads.

Do not ask the provider to infer application correctness from a restart or HTTP status. Record every provider statement as provider-supplied evidence with timestamp and case ID. The Production support plan, entitlement, response objective, case channel and named escalation contacts are **UNKNOWN / BASELINE REQUIRED** and must be verified before Tournament Mode.
