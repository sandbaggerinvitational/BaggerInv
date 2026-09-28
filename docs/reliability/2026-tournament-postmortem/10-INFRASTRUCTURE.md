# Infrastructure postmortem and 2027 target

## Decision

Harden the existing Supabase + Vercel platform before considering a migration. The evidence supports query isolation, capacity telemetry, connection discipline, backup verification, and rehearsed recovery. It does not prove that Supabase itself was the root cause of the September 26 outages, and it does not show that moving the same queries to AWS would remove the failure modes.

This is a design and postmortem document. It makes no infrastructure or account change.

## What is proven

| Finding | Classification | Evidence and limit |
|---|---|---|
| The Production native health endpoint returned 503 / `AUTHORITY_INCOMPATIBLE` at 01:34:00 and 01:34:50 EDT on September 26. A scheduled endpoint returned 503 at 01:35. | PROVEN | `/private/tmp/bagger-r3-morning-preflight/overnight-logs-sanitized.json`. No runtime exception was retained with those records. |
| The same Release 137 deployment was healthy before and after the overnight failure. | PROVEN | `/private/tmp/bagger-r3-dependency-recovery/REPORT.md` and `/private/tmp/bagger-r3-morning-preflight/REPORT.md`. This narrows the problem away from an observed release change; it does not prove a provider failure. |
| The failure recurred at 08:24:04 EDT: health returned 503 after 10,393 ms, the PWA root returned 200 after 10,303 ms, a small dependency read failed during login-role creation, and the broad eligibility query did not finish within its 90-second client limit. | PROVEN | `/private/tmp/bagger-r3-recovery-continuation/REPORT.md`. A PWA HTML 200 was not database or scoring proof. |
| The database process later reported a postmaster start time of 02:34:52 EDT. | PROVEN | `/private/tmp/bagger-r3-morning-preflight/REPORT.md`. This proves a restart after the first incident, not its cause, duration, or initiator. |
| The owner reported a Supabase warning around 02:30 that the Production Disk I/O budget was depleting. | PROVEN as an owner report | `/private/tmp/bagger-r3-continuous-recovery/DISK-IO-INCIDENT-ADDENDUM.md`. The notice, timezone, budget curve, IOPS, throughput, and I/O wait series were not independently captured. |
| The broad eligibility design handled very large historical JSON payloads: about 36.6 MB Calcutta jobs, 35.1 MB Net Skins jobs, and 13.6 MB Calcutta result history in the exported fixture. | PROVEN | `/private/tmp/bagger-r3-recovery-continuation/REPORT.md`. Its live query plan and resource counters were not captured. |
| A later Sep 27 score-write failure had a different, proven database cause: an expensive derived-state trigger evaluated historical Calcutta compatibility/hash work and hit the existing 8-second statement timeout twice. | PROVEN | `/private/tmp/bagger-r3-write-timeout/REPORT.md`, `HOSTED-ERROR-EVIDENCE.json`, and `GROWTH-PROFILE.json`. This finding must not be retroactively assigned as the cause of the Sep 26 outages. |
| At 07:11 UTC Sep 27, the project was observed on Small / `t3a.small`, 2 GB shared compute, 8 GB gp3, 3,000 provisioned IOPS and 125 MB/s, with 26/90 connections. Disk budget, actual IOPS, throughput, pool metrics, and numeric I/O wait were unavailable. | PROVEN for that observation time | `/private/tmp/bagger-r3-write-timeout/RESOURCE-OBSERVATION.json`. It is not a current account inventory or a capacity guarantee. |

## Incident assignments

- **2026-INC-022 / NA-2026-022 — Overnight authority 503.** User impact: native reads/auth/certification/scoring failed closed. Root cause: UNKNOWN. Database connection/resource failure is strongly supported as a failure domain; exact cause is not proven.
- **2026-INC-023 / NA-2026-023 — Morning recurrence and hazardous diagnostic query.** User impact: health unavailable and recovery stopped. The 90-second broad historical read is a proven unsafe live diagnostic design. Its causal role in the outage is PLAUSIBLE, not proven.
- **2026-INC-024 / NA-2026-024 — Disk I/O budget warning and capacity gap.** The warning plus timeouts supports I/O pressure as a primary hypothesis. Missing metric retention prevents causal attribution and capacity certification.
- **2026-INC-025 / NA-2026-025 — Insufficient observability / unknown root cause.** Treat this as a cross-cutting control failure rather than a separate service interruption unless the master incident register requires a distinct incident row. It explains why INC-022 through INC-024 cannot be closed with a confident causal chain.

## Current request path

The inspected source shows this Production path:

```text
golfer or Director
  -> Vercel Function in the deployed application region
  -> HTTPS Supabase Data API /rest/v1/rpc/*
  -> PostgREST/provider connection management
  -> PostgreSQL transaction, triggers, receipts, audit, outbox
```

The health route performs three authority/runtime reads in parallel. Any thrown exception is intentionally reduced to a public `AUTHORITY_INCOMPATIBLE` response. That is safe for disclosure, but the internal record needs separate timings and outcomes for read-control, admission, and current-tournament runtime. Source evidence: `lib/mobile-native-admission.js` and `lib/mobile-native-production-authority.js` in `/private/tmp/bagger-r1-open-incident/candidate`.

The inspected `vercel.json` contains only the account-deletion cron schedule. It does not establish the configured Vercel Function region. Incident request IDs use `iad1`, which is an observed request location, not proof of the account's complete region configuration. Supabase region, pool mode, backup plan, PITR state, and restore retention remain **BASELINE REQUIRED**.

## 2027 target architecture

1. Keep one authoritative PostgreSQL primary for scoring and current tournament control.
2. Keep all score writes behind the existing transactional, idempotent RPC boundary. Clients never receive direct score-table DML.
3. Put current scoring, current authority, and small current-tournament reads in an `OLTP` workload class.
4. Move historical comparison, certification hashing, exports, and analytics to a restored copy or read replica. They must be technically unreachable from the tournament runtime role.
5. Export Supabase metrics and provider logs to an independently retained monitoring system before the next rehearsal.
6. Record the actual Vercel Function and Supabase database regions in a machine-readable deployment manifest, measure the network phase, and alert on drift. Change Function placement toward the data region only when platform support and rehearsal evidence justify it.
7. Introduce a dedicated bounded-diagnostic role with allowlisted current-state views, pool size 1 where a database client is used, a short statement timeout, a short lock timeout, no write grants, and no history-schema access.
8. Protect the scoring critical path from synchronous side-game and historical work. A score transaction may append a small idempotent event; workers calculate derived state after commit.
9. Establish tested backup, PITR, restore-to-new-environment, and paper-scorecard procedures with measured RPO/RTO.

## Provider facts, separate from account configuration

Official provider documentation in this section was observed on **2026-09-27**. It describes provider behavior and available capabilities, not the Bagger Production plan, settings, limits, or enabled features.

- Supabase documents that compute sizes through 2XL can use a Disk I/O burst budget and fall back to baseline when the budget is exhausted. Effective disk performance is limited by both compute and provisioned disk. This is a provider behavior, not proof that the Production budget reached zero. [Supabase Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- Supabase exposes a Prometheus-compatible Metrics API with database CPU, I/O, WAL, connection, and query series. The API is documented as beta, so metric names must be version-tolerant. [Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics)
- Supabase recommends a server-side transaction pooler for serverless or edge functions that create many short-lived connections. The current application mostly uses the HTTPS Data API, so actual provider-side pool configuration still requires account evidence. [Supabase connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- Vercel documents that Functions should run near their data source and permits region configuration. This supports a region-alignment check; it does not establish the current project setting. [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region)

## Required technical enforcement

The following controls are requirements, not claims about the current account:

- `scoring_exec`: execute-only on scoring/lifecycle RPCs; no direct table DML; transaction-local operation ID; statement and lock budgets; idempotency receipt required.
- `current_read`: select only on bounded current-tournament views; no historical tables; explicit row caps; server-side timeout.
- `diagnostic_bounded`: pool size 1 per process/invocation, maximum one in-flight query, read-only transaction, short timeout, no retry loop, current-year-only scope, mandatory query tag.
- `history_offline`: unavailable to the Production web runtime; used only against a restored copy/read replica with a separate credential.
- CI rejects imports or route handlers that give `diagnostic_bounded` or tournament runtime code access to history schemas or unbounded JSON aggregation functions.
- Release certification fails if metrics export, backup freshness, provider region, database restart detection, or authority component telemetry is unavailable.

## Capacity conclusion

The 2026 data supports a capacity gap, not a specific required SKU. There were only 24 golfers and at most 12 simultaneously active matches, while spectator concurrency is unknown. The database was small in stored bytes, so storage consumption did not explain the incident. I/O workload shape, historical query amplification, synchronous trigger work, connection churn, and missing telemetry are the useful dimensions.

Do not buy capacity as the only fix. First remove historical work from the write path and Production diagnostics, export metrics, measure tournament-shaped load in an isolated environment, and then choose the smallest tier that sustains the measured peak with headroom and without burst-credit dependence.
