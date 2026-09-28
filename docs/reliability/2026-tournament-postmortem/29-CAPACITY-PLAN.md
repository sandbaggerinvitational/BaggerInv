# Capacity plan

## Planning unit

The known competitive workload is 24 golfers. Spectator count, concurrency, refresh behavior, and geographic distribution are unknown. Capacity is therefore selected from an event-shaped rehearsal, not a golfer multiplier or the 2026 HTTP samples.

The September 27 observation recorded a small shared Supabase compute shape, 2 GB memory, 8 GB gp3 storage, about 0.39 GB used, 3,000 provisioned IOPS, 125 MB/s provisioned throughput, 4% point-in-time CPU, 26% point-in-time memory, and 26/90 connections. Those point observations do not prove headroom during either September 26 outage, the September 27 scoring timeout, or a future tournament. Actual IOPS, throughput, I/O wait, Disk I/O budget, pool waits, and event concurrency were unavailable.

## Workload classes

| Priority | Class | During Tournament Mode |
|---|---|---|
| P0 | authority, identity required for play, canonical score commit/recovery, Director safety controls | reserve capacity; never shed automatically |
| P1 | participant current-round reads and canonical confirmation | preserve; bounded cache only where semantics allow |
| P2 | public current leaderboard/current tournament | serve bounded current data or time-stamped last-known-good snapshot |
| P3 | side-game calculation/publication | asynchronous; pause at red if score correctness is unaffected |
| P4 | archive/history/export/certification | deny on primary; route to isolated target |
| P5 | analytics, reindex/maintenance, noncritical cron | schedule outside event; pause at yellow |

## Sizing sequence

1. Remove the proven expensive query shape and isolate P4/P5 work. A compute upgrade must not be used to conceal preventable full-history planning/temp I/O.
2. Verify Vercel and database regions and the serverless connection path. Record the exact account configuration rather than inferring it from source.
3. Export database and application telemetry outside the failure domain.
4. Rehearse the 24-golfer workload with controlled spectator steps, current/side-game traffic, recovery, and background work.
5. Measure saturation knees for score latency, connection acquisition, CPU, memory, I/O wait, IOPS/throughput, Disk I/O budget, temp spill, locks, WAL/checkpoints, and cache behavior.
6. Select compute/storage with approved headroom through peak and recovery, then repeat the rehearsal twice.

## Admission and headroom

Exact numeric headroom is **BASELINE REQUIRED**. The approval record must state steady, burst, and recovery load; sample count and duration; selected compute/storage/pool settings; safe connection allocation by role; and the first limiting resource. A green result requires both rehearsals to meet the performance budgets with no use of historical primary reads and no dependence on unmeasured burst capacity.

Use per-role connection budgets. Reserve database capacity for P0/P1, cap P2, give side-game workers a small bounded share, and fix the diagnostic role at pool size 1 with one in-flight statement. Reject or queue excess lower-priority demand before the database becomes the queue.

Supabase documents that effective IOPS/throughput is the lower of compute and provisioned storage limits, and that smaller compute sizes may use a daily burst I/O budget. Provider documentation was observed on 2026-09-27; it describes provider behavior, not the Production account configuration. [Supabase Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)

Supabase recommends transaction-mode pooling for serverless or auto-scaling applications. Pool size, mode, reserved direct connections, and role allocation must be verified in the account. Provider documentation was observed on 2026-09-27. [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)

## Spectator discovery

Instrument unique sessions, concurrent requests, refresh frequency, cache hit/miss, payload bytes, dependency count, TTFB, and total latency. Use conservative admission until real demand is known. Cache only current public projections with explicit age; archive/history never falls back to the primary during play.

## Scaling and migration decisions

Harden Supabase first. Consider a larger/consistent-I/O Supabase shape, storage changes, or a read replica only after workload cleanup and measured rehearsals. A read replica may serve isolated read-only archive/analytics with explicit lag; it never receives score writes.

Open an AWS RDS proof of concept only if two hardened Supabase rehearsals still fail the budgets, required telemetry/control/recovery cannot be achieved, or an approved compliance/availability requirement demands it. Compare the same schema, RPCs, roles, failure cases, event load, RPO/RTO, operational staffing, and cost categories.

## Capacity evidence due before Tournament Mode

- exact provider/project/region/compute/storage/pool configuration;
- independent metric export and missing-data alarms;
- two complete rehearsal reports and raw histograms;
- selected resource thresholds with rationale;
- workload-shedding and recovery test results;
- verified spectator admission assumption;
- no outstanding red query, connection, backup, authority, or restore gate.

Evidence confidence is **HIGH** for the dated point-in-time resource observation and **UNKNOWN** for resource utilization during the outage windows. Recommendation confidence is **HIGH** for workload isolation and event-shaped measurement; the required compute/storage SKU remains deliberately unspecified.

## Pre-tournament infrastructure scale-up automation

Scale-up is conditional on measured need; it is not a ritual or an automated reaction to one warning.

Automation may inventory the current shape, compare it with the sealed manifest, analyze rehearsal evidence and prepare an exact proposal. It may not apply or purchase capacity.

### Infrastructure upgrade runbook

1. At the T-14 review, inventory the exact project, region, compute, storage, IOPS/throughput, pool mode/limits, backups/PITR, metrics and support entitlement. Compare them with the last rehearsed manifest.
2. Run the frozen event-shaped workload and identify the first limiting resource after query and workload isolation.
3. If a change is required, automation prepares the exact before/after proposal, provider fact links, expected benefit, cost categories, maintenance behavior, recovery point, rollback/downscale path and affected proof.
4. A named infrastructure operator and Incident/Release owner authorize the exact provider change. Automation does not resize, restart, change storage/pool/region or purchase a plan independently.
5. Apply the change before the T-7 infrastructure freeze through the protected change path. Capture provider event IDs and before/after configuration.
6. Repeat the complete load, failure, backup and restore gates on the changed shape twice. A nominally larger tier is not accepted without proof.
7. At T-48 hours, seal the exact infrastructure manifest. Later change uses the emergency protocol.
8. After event closeout, verified backup and the approved observation window, evaluate downscale with the same rehearsal and rollback discipline. Do not downscale while recovery, reconciliation or evidence collection is open.

Current Production account configuration, provider support entitlement, upgrade/restart behavior and safe target SKU are **UNKNOWN**. This audit performed no scale-up and supplies no evidence that a compute upgrade alone would fix the observed failures.
