# Infrastructure roadmap

## Decision

Harden the existing Supabase/Vercel architecture first. The supplied evidence proves an avoidable expensive query path and substantial missing telemetry; it does not prove that Supabase caused either September 26 outage or that AWS would have prevented them. An AWS RDS proof of concept is conditional on measured failure of the hardened design or a separate approved requirement.

## P0: before qualification

- Remove whole-history work from the synchronous score transaction; commit a small idempotent outbox event and calculate side games asynchronously.
- Deny historical/export/certification access to the tournament runtime role. Provide an isolated restored copy or read-only target.
- Create the read-only diagnostic role: current-year allowlisted views, pool size 1, one in flight, short statement/lock/idle timeouts, row/byte bounds, mandatory query tags, no automatic retry.
- Export database/resource/pool/query metrics to an independent retained store and add missing-data alerts.
- Inventory exact Production regions, compute, storage, pool mode/size, backup/PITR, recovery points, and provider change history. Record region alignment as a design input; change it only with measured need and rehearsal.
- Rehearse 24 golfers plus stepped spectator load and select compute/storage/pool allocations from measured saturation/headroom.
- Prove backup restore/PITR, paper reconciliation, workload shedding, and emergency change.

## P1: resilience and isolation

- Add a read replica or continuously refreshed isolated target for archive/analytics if staleness, cost, and provider features fit. Keep scoring on the primary.
- Reserve pool/connection budgets by workload class; introduce explicit backpressure before the database.
- Add time-stamped public current snapshots and bounded cache behavior for spectator bursts.
- Automate immutable evidence packets, configuration drift checks, and authority-component health.
- Run quarterly restore and event-shaped reliability exercises.

## P2: conditional AWS proof of concept

Start only when two hardened Supabase rehearsals fail approved budgets, required observability/control/recovery cannot be achieved, or compliance/availability mandates it. Test the identical schema, functions/triggers, grants/RLS semantics, serverless pool behavior, failure recovery, backups/PITR, monitoring, and event workload.

AWS provider capabilities relevant to a POC include RDS Proxy connection pooling/multiplexing and Multi-AZ deployment options. RDS Proxy can improve connection management but cannot make expensive SQL cheap. Multi-AZ instance deployments use a standby that does not serve reads; Multi-AZ DB clusters have different readable-standby behavior. Documentation observed on 2026-09-27. [RDS Proxy](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.howitworks.html) [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)

## Decision evidence

Compare correctness, latency distributions, first limiting resource, operational labor/on-call burden, migration/cutover/rollback risk, backup/restore outcomes, vendor/control-plane dependencies, and cost categories: compute, storage/IOPS/throughput, backups/PITR/cross-region copies, replicas/HA, proxy/connections, observability/log retention, network/egress, support, rehearsal environments, and engineering effort. Use verified dated quotes only for a later financial decision.

