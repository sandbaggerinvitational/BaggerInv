# Observability roadmap

## P0: make incidents diagnosable

1. Instrument the six authority/health components and preserve normalized internal failure detail behind the generic public response.
2. Propagate request, trace, operation, tournament, release, deployment, authority generation, workload class, and query identity through Vercel, Supabase/Postgres, receipts, and workers.
3. Export Supabase/Postgres CPU, memory, I/O, Disk I/O budget, IOPS/throughput, WAL, connection/pool, restart, timeout, lock, temp, checkpoint, and query statistics outside the app/provider failure path.
4. Add scoring transaction phase spans, including receipt, lock, trigger/function, outbox, commit/rollback, and canonical readback.
5. Preserve an automatic bounded evidence packet on SEV-1/SEV-2 and alert when any telemetry source is missing.
6. Verify backup/PITR and provider-change signals and display them beside release/authority state.

Acceptance: injected versions of INC-022 through INC-025 can be classified to a component/resource/query or explicitly recorded UNKNOWN in under five minutes, with no broad Production query.

## P1: establish valid baselines

- Run event-shaped rehearsals and build statistically valid p50/p95/p99 histograms with sample counts and cold/warm/cache state.
- Measure 24-golfer scoring/read cadence and step spectator load through a saturation knee.
- Establish role/pool, I/O, CPU, memory, WAL, temp, lock, queue, cache, payload, and dependency baselines.
- Calibrate every provisional threshold in `monitoring-catalog.json`, retaining rationale and approval.
- Measure physical-device time-to-usable and Server-Timing/dependency splits for current views.
- Establish retention/privacy, high-cardinality, and clock-skew controls.

## P2: automate safe operations

- Link alerts to current runbook, release manifest, authority state, evidence packet, and owner.
- Automate approved reversible shedding and last-known-good public snapshots.
- Add query-plan regression checks to isolated CI/rehearsal data with realistic growth.
- Track restore rehearsal age, actual RPO/RTO, and semantic validation results.
- Run monthly failure injection and quarterly recovery exercises; retain trend evidence.

## Evidence posture

Current confidence is high that the 2026 telemetry is insufficient for outage root cause and that two sequential samples are insufficient for percentile/capacity claims. It is high that the September 27 query-shape pathology was real under the observed tests. Provider involvement, Disk I/O causation, and post-fix hosted score latency remain UNKNOWN until correlated telemetry exists.

Supabase's Metrics API and `pg_stat_statements` are relevant provider capabilities, observed in official documentation on 2026-09-27; account enablement and retention remain unknown. [Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics) [Supabase pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)

