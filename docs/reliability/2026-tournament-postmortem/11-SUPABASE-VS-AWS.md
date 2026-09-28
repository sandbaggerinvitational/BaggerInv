# Supabase versus AWS decision gate

## Recommendation

Stay on Supabase for the next hardening cycle. Run an AWS proof of concept only if the decision gates below fail after query isolation, telemetry export, restore rehearsal, and tournament-shaped load testing.

This conclusion is based on the evidence, not platform preference. The current failures include application SQL and observability defects that would carry into RDS. There is no provider metric history proving a Supabase platform fault, and the small operating team would assume materially more infrastructure ownership on AWS.

## What is known and unknown

Known account observation at one point on Sep 27: Supabase Small / `t3a.small`, 2 GB shared compute, 8 GB gp3, 3,000 provisioned IOPS, 125 MB/s, 26/90 connections. Unknown account configuration: plan, region, shared/dedicated pooler mode, pool size, backup retention, PITR, read replicas, network restrictions, log drains, metric export, support tier, and current compute after the observed restart/upgrade.

No exact cost comparison is defensible without a verified Supabase plan, AWS region, RDS/Aurora topology, instance family, storage/I/O selection, RDS Proxy usage, backup retention, data transfer, support tier, log retention, and staff operating cost. This document uses cost categories only.

## Capability comparison

| Dimension | Supabase hardened path | AWS RDS PostgreSQL path |
|---|---|---|
| Operational ownership | Managed Postgres plus integrated Data API, Auth, dashboard, backups, and optional poolers. The team still owns SQL, schema, query performance, restore tests, and alerts. | Team owns VPC/security groups, RDS topology, parameter groups, upgrades, RDS Proxy, IAM/Secrets Manager, monitoring, failover/restore procedures, and the application integration. |
| Connection management | Supavisor shared pooler and a dedicated PgBouncer option are provider capabilities. Data API traffic already avoids a database client in Vercel code. Actual account pool settings are unknown. | RDS Proxy pools and multiplexes connections, can sit in front of RDS PostgreSQL, and is independently highly available. It does not reduce query work and can pin sessions. |
| Availability | Current project topology is unknown. Supabase read replicas are asynchronous read-only capacity and do not by themselves prove write failover. | RDS Multi-AZ instance deployments provide a standby for failover; Multi-AZ DB clusters use two standbys that can also serve reads. Topology must be selected and paid for. |
| Historical read isolation | Supabase read replica or restored copy can isolate analytical/certification work; read replica lag must be monitored. | RDS read replica, restored instance, or separate analytics store; Database Insights/CloudWatch can correlate waits and SQL. |
| Backups | Daily backups and optional PITR are provider features; Production plan/retention/PITR are unverified. Restore makes the project inaccessible during the provider restore. | Automated backups support PITR within configured retention; manual snapshots and cross-Region automated-backup replication are available. All selections and restore tests are team responsibilities. |
| Observability | Supabase Metrics API, logs, `pg_stat_statements`, Reports, and log drains. The 2026 gap was that durable metric history was not available to the incident response. | CloudWatch, Enhanced Monitoring, logs, and Database Insights. More knobs do not create a usable incident practice automatically. |
| Region inventory and network path | Record Supabase and Vercel Function regions, measure the network phase, and configure near the data region only when supported and validated. | Keeping Vercel would require secure network design to RDS and measured region placement, or moving compute into AWS. Either is a meaningful architecture project. |
| Migration risk | Lower. Preserve tested RPC, RLS, Auth, Data API, release bindings, and current operational knowledge. | Higher. Requires compatibility testing for Auth/Data API/RPC/RLS behavior, secrets, networking, connection paths, observability, backups, cutover, and rollback. |

## Official provider facts

These are provider capabilities, not statements about the Bagger account. The linked official documentation was observed on **2026-09-27**.

- Supabase says server-side transaction pooling is appropriate for serverless/edge connections and documents separate client and backend connection limits. [Connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- Supabase documents daily backups for Pro, Team, and Enterprise with plan-dependent retention, optional PITR, and project downtime during restore. The Production plan and enabled features are **BASELINE REQUIRED**. [Database Backups](https://supabase.com/docs/guides/platform/backups)
- Supabase read replicas are asynchronous, read-only, and can isolate complex analytical reads from the primary. Auth, Storage, and Realtime requests do not use a read replica endpoint. [Read Replicas](https://supabase.com/docs/guides/platform/read-replicas)
- AWS documents that RDS Proxy pools and multiplexes database connections and can keep accepting new connections through failover, while in-flight transactions/statements can still be canceled. [RDS Proxy concepts](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.howitworks.html)
- AWS documents Multi-AZ instance deployments with one standby for failover and Multi-AZ DB clusters with two standbys that may serve reads. [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- AWS RDS automated backups support point-in-time recovery during the configured retention period; backups can be replicated across Regions when configured. [RDS backups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html), [cross-Region backup replication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/AutomatedBackups.Replicating.Enable.html)
- AWS Database Insights can break load down by waits, SQL, hosts, and users. [CloudWatch Database Insights](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PerfInsights.html)

## Supabase hardening acceptance gate

Continue on Supabase if all of the following pass in two complete 2027 dress rehearsals:

1. Every synthetic scoring write resolves authoritatively, including deliberately injected lost-response cases, with zero unresolved unknown outcomes, duplicates, lost writes, or unreviewed conflicts.
2. Scoring and current-authority latency stay inside the provisional budgets in `28-PERFORMANCE-BUDGETS.md`; thresholds must be recalibrated after baseline collection.
3. Disk I/O budget remains safely above the red condition during the full event-shaped workload, or the selected compute/storage has no operational dependence on burst credit.
4. Historical and certification queries are absent from the primary tournament runtime, proven by query tags and role grants.
5. Connection and provider pool headroom meet `29-CAPACITY-PLAN.md` under two-device scorer conflicts plus spectator load.
6. Metrics/logs/traces retain the complete rehearsal and can identify the top query, wait class, pool state, restart, and exact authority component within five minutes.
7. A restore to an isolated environment meets the approved RPO/RTO and passes semantic score/receipt/authority validation.
8. A provider or database outage drill moves the tournament into paper-scorecard mode without data loss or blind replay.

## Conditions that trigger an AWS proof of concept

Start a bounded POC if any one of these remains true after the hardening cycle:

- sustained tournament load requires a Supabase configuration whose measured reliability or cost is unacceptable;
- required write-availability/failover objectives cannot be met or evidenced on the selected Supabase topology;
- metrics/log retention cannot support the incident evidence standard;
- backup retention, cross-region recovery, or restore automation cannot meet approved RPO/RTO;
- provider support cannot resolve recurring infrastructure incidents with usable telemetry;
- network, compliance, or control requirements demand AWS-native isolation.

The trigger must be an evidenced requirement gap, not the existence of a 503 or a provider warning alone.

## AWS POC scope

The POC should use RDS PostgreSQL Multi-AZ, RDS Proxy for serverless-style connections, CloudWatch Database Insights, encrypted automated backups with a tested retention setting, a cross-Region backup option if required, and a restored-copy analytics path. It must replay the same schema, migrations, transaction RPCs, triggers, RLS/security model, idempotency receipts, scoring burst, side-game event queue, failure injection, and backup restore.

Keep the POC isolated from Production. Compare correctness, p50/p95/p99 latency, DB load/waits, connection/pinning behavior, failover interruption, recovery time, operational labor, and cost categories. Do not perform a migration unless it wins the gate with two rehearsals and a reversible cutover plan.

## Cost categories to compare

- database compute and standby/replica compute;
- storage, provisioned IOPS/throughput, backup storage, and cross-region copy;
- pool/proxy, metrics, logs, traces, and retention;
- Vercel-to-database or AWS networking/data transfer;
- support plan;
- test/staging parity;
- engineering work for migration and annual operations;
- on-call and restore rehearsal time.

## Evidence confidence

Recommendation confidence is **HIGH** that hardening must precede migration: the expensive application query and missing telemetry would carry across providers. Confidence is **LOW** that a provider platform fault caused the September 26 outages because the required I/O, pool, wait and provider-event data is absent. Account-specific capability and cost confidence is **UNKNOWN** until plan, region, topology and dated quotes are verified.
