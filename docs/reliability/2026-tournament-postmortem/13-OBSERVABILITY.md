# Observability design

## Goal

An incident responder must be able to answer, within five minutes: which user journey failed, at which component, on which release and authority generation, because of which database query/wait/resource condition, whether a write committed, and what safe recovery action is available.

The public API may continue returning safe generic messages. The internal event must retain the specific failure.

## Correlation envelope

Every request, database RPC, operation receipt, worker job, release action, and alert uses these fields where applicable:

- `request_id`, W3C `trace_id`, and `span_id`;
- `operation_id` or mutation/idempotency key;
- tournament, round, match, and hole identifiers with no secret/token payload;
- release, activation, deployment, commit SHA, native build, and database migration head;
- authority, authority generation, admission generation, runtime pointer/lifecycle revision, maintenance state;
- endpoint/RPC/query fingerprint, workload class, database role, provider/function region;
- started/completed timestamps, wall time, database time, row count, bytes, temp bytes, shared/local block reads/hits where available;
- result class: success, rejected, conflict, timeout-rolled-back, unknown-outcome, dependency-blocked, provider-unavailable;
- retry/replay number and whether the same identity was used.

Logs must never include access tokens, OTPs, cookies, database credentials, raw phone/email values, or full score payloads when identifiers and hashes suffice.

## Health decomposition

Keep `/api/mobile/v1/health` generic externally. Internally emit one structured span/result for each parallel component now hidden behind `AUTHORITY_INCOMPATIBLE`:

1. cutover/read-control inspection;
2. scoring-admission inspection;
3. current-tournament runtime read;
4. identity/auth dependency;
5. database connection acquisition/login-role initialization;
6. aggregate compatibility evaluation.

Each component records latency, timeout phase, provider status, SQLSTATE if present, database PID/transaction when safe, and a normalized cause category. The aggregate health log links all component spans. A PWA root 200 is an independent web-shell signal and never closes a database/authority alert.

## Database telemetry

Export to an independent system with retention covering the full rehearsal and tournament season:

- CPU, memory, swap, I/O wait, Disk I/O budget, IOPS, throughput, latency, queue depth if exposed;
- database/pool client and backend connections, acquisition/login failures, wait time, rejected clients;
- database restarts and configuration/compute/storage changes;
- transactions/second, commits/rollbacks, deadlocks, lock waits, long transactions, idle-in-transaction;
- WAL generation, checkpoint duration/frequency, temp files/bytes, cache hit, tuples, autovacuum progress/age, bloat indicators;
- `pg_stat_statements` calls, plan/exec time, max/mean, rows, shared/local/temp blocks, WAL bytes, normalized query ID;
- statement/lock timeout counts by role, RPC, route, release, and workload class;
- backup/PITR freshness, earliest/latest recovery point, restore job state, and replica lag where used.

Supabase documents a Prometheus-compatible Metrics API for CPU, I/O, WAL, connections, and query statistics. It is currently beta, so collectors must tolerate metric-name changes and alert when scraping itself fails. This provider documentation was observed on **2026-09-27** and does not establish Production enablement or retention. [Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics)

Supabase also documents `pg_stat_statements` plan and execution statistics for finding expensive queries. Capture periodic deltas; do not run expensive exploratory queries against the live tournament primary. This provider documentation was observed on **2026-09-27**; extension/configuration state for Production must be verified. [Supabase pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)

## Application and journey telemetry

Measure separately:

- PWA shell, public current views, historical views, participant auth, My Match, match authorization, scorecard read, score mutation, same-ID recovery, Finalize/Reopen, Director control;
- response status, semantic result code, latency distribution, cold/warm invocation, upstream time, database time, and cache state;
- native build and app-state journey without recording private content;
- spectator concurrency and cache hit/staleness;
- side-game enqueue, queue age, calculation, publication, and result availability;
- release preflight, promotion, rebind, activation, health window, closeout, rollback, and protected diff.

Do not aggregate all 503s into one graph. Separate configuration rejection, authority incompatibility, database connection failure, statement timeout, provider error, maintenance, and intentional fail-closed responses.

## Native telemetry

The native client must emit privacy-safe events for build/contract version, foreground/background transition, selected mode and route, network reachability class, request/trace/operation ID, queue-intent state, save attempt, response class, receipt lookup, canonical readback, same-ID retry, conflict, unresolved outcome, fallback offer and time to usable content. Record device model and OS only at a coarse support level; do not record phone/email, token, OTP, raw score payload, private side-game values or unrestricted device identifiers.

Persist the minimum unresolved-operation correlation locally across termination, and upload it only through the authenticated bounded telemetry path. A telemetry failure cannot clear or mutate the scoring queue. Simulator events and physical-device events remain distinct proof layers. The actual 2026/Build 10 native telemetry coverage, ingestion success rate and retention are **UNKNOWN** from the supplied infrastructure evidence.

## Scoring trace

One score trace spans:

```text
request -> identity -> authority -> permission/revision -> idempotency receipt
        -> match lock -> score calculation -> hole write/trigger
        -> match update/trigger -> receipt/history/audit/outbox -> commit
        -> canonical readback -> client confirmation
```

Record duration for each phase. The Sep 27 investigation only became conclusive after the stack showed the Calcutta compatibility/hash path. This breakdown must exist before an incident.

Unknown outcome is a first-class metric: transport ended without a verified transaction result. Timeout with authoritative readback proving rollback is a different result. Alerts, UI, and runbooks must preserve that distinction.

## Root-cause evidence packet

On every SEV-1/SEV-2 alert, automatically preserve a read-only packet covering at least 15 minutes before through 30 minutes after:

- metric snapshots and alert evaluations;
- Vercel request/function logs and trace links;
- Supabase/Postgres logs by request/query/transaction ID;
- database restart/config/compute/storage change events;
- pool and connection telemetry;
- top query deltas and wait classes;
- release/activation/deployment/authority state;
- backup/PITR state;
- job/queue/outbox/dead-letter state;
- bounded current-tournament semantic snapshot.

The packet collector may read only allowlisted small views through the bounded diagnostic role. It must never launch historical aggregation, `EXPLAIN ANALYZE` on Production, or retry a timed-out query aggressively.

## Retention and clocks

Retain raw incident logs/traces/metrics through the postmortem window and summarized yearly evidence longer under an approved policy. Exact durations are **BASELINE REQUIRED** with cost/privacy review. All systems use UTC internally and render local tournament time at the edge. Monitor clock skew and store both event time and ingestion time.

### Observability, Production log and provider metric retention

Retention classes:

| Evidence class | Minimum semantic requirement | Exact duration/account status |
|---|---|---|
| High-resolution provider/database metrics | Full rehearsal, T-14 through event closeout, and every incident evidence window | **UNKNOWN / BASELINE REQUIRED** |
| Application/function/database logs | Request/trace/query correlation through investigation and postmortem | **UNKNOWN / BASELINE REQUIRED** |
| Distributed traces and native journey events | Critical journey, release and device proof with privacy-safe attributes | **UNKNOWN / BASELINE REQUIRED** |
| Immutable SEV-1/SEV-2 evidence packet | Incident decision, repair and later audit | Duration requires owner/legal/security approval |
| Release/activation/configuration manifest and change receipts | Life of the competitive record plus approved archive | **BASELINE REQUIRED** |
| Aggregated reliability/SLO reports | Year-over-year prevention and readiness comparison | **BASELINE REQUIRED** |

Deletion, legal hold, access review and export verification must be tested. Provider UI availability is not durable retention. No part of this proposal proves that Production log or provider metric retention is currently configured.

## Dashboard set

1. Tournament command: scoring success/latency, authority state, unknown outcomes, active matches, current views, spectator traffic.
2. Database capacity: I/O budget, IOPS/throughput, I/O wait, CPU, memory/swap, connections/pool, locks, temp spill, WAL/checkpoints.
3. Query workload: top total/max/plan/exec time, temp/block I/O, timeouts, workload classes, forbidden history queries.
4. Side games/workers: queue age, failures, retries, calculated/current eligible projection age, input fingerprints, dead letters, and separate owner-publication state/age.
5. Release/authority: exact manifest, drift, pending intents/locks, health samples, component health, recent changes.
6. Recovery: backups/PITR, replica lag, last restore rehearsal, paper mode and reconciliation state.

## Evidence confidence

- **High confidence:** the 2026 incident material lacked component-level authority failures, retained I/O/pool series, query correlation, and provider change events needed for a causal chain.
- **High confidence:** request/result timing alone and two sequential physical samples cannot establish percentiles or capacity.
- **High confidence:** the September 27 query-shape comparison proved a material query cost difference under the recorded tests.
- **Unknown:** the exact resource state and query contributors during the September 26 outages, and hosted post-correction score latency.
