# Infrastructure blueprint

## Architecture decision

Use a hardened Supabase/Vercel deployment for the next qualification gate. Isolate history and derived work, measure the real event workload, and prove recovery before considering migration. The evidence supports query and observability remediation; it does not prove a provider root cause.

```text
participants/directors -> Vercel region near database -> authority + current API
                                                    -> Supabase pool -> primary Postgres
                                                                          |
                                                               canonical transaction
                                                                          |
                                                                 small outbox event
                                                                          v
                                                              bounded side-game worker
                                                                          |
                                                                derived/public snapshot

spectators -> cached current API/snapshot -----------^         

history/export/certification -> separate credential -> read replica or restored copy
diagnostics -> read-only current views -> pool size 1, one in flight, short timeouts

metrics/logs/traces/backups/change events -> independent retained observability/evidence store
```

## Non-negotiable boundaries

- One canonical writer authority and explicit fail-closed admission.
- Score transaction contains canonical validation/write, durable receipt/audit, and a small idempotent outbox event. No whole-history side-game hash or analytics.
- Tournament runtime role cannot read history schemas or execute broad history RPCs.
- Diagnostic role is read-only, current-year/view allowlisted, pool size 1, one in flight, row/byte/time limited, tagged, and never automatically retries.
- History/export/certification use a lag-labeled replica or restored isolated copy and cannot fall back to the primary.
- Workload priorities and reserved connection budgets preserve authority/scoring/current participant reads before spectators, side games, history, and analytics.
- Observability and evidence retention remain available when the app or database is impaired.
- Backups and PITR count only after an isolated semantic restore rehearsal.

## Tournament operation

NORMAL, PREPARE, TOURNAMENT, INCIDENT, RECOVERY, and CLOSED are explicit durable states. At yellow capacity, pause P4/P5 and reduce P2 refresh; at red, preserve P0/P1 and serve a time-stamped public snapshot. Automation can perform only preapproved reversible shedding. Named humans authorize deployment, migration, resize, restart, restore, failover, authority switch, unknown-score replay, Finalize/Reopen, and result publication.

Freeze schema at T-14 days, application/infrastructure at T-7, and the exact candidate/configuration at T-48 hours. Emergency changes use one reviewed artifact, a durable operation identity, abort thresholds, rollback/forward-recovery, a health window, and evidence closeout.

## Evidence-based sizing

Start with 24 golfers and unknown spectators. Instrument actual spectator concurrency/refresh/cache/payload behavior, then step load in isolation until the first saturation knee. Select compute, storage, IOPS/throughput, pool/connection allocations, and cache policy with approved headroom through peak and recovery. Do not use the 2026 point-in-time resource snapshot or two sequential requests as capacity certification.

Supabase provider documentation observed on 2026-09-27 describes transaction pooling for serverless workloads, compute/disk burst behavior, metrics export, backups/PITR, and asynchronous read replicas. These are available design inputs, not verified Production account settings. [Connections](https://supabase.com/docs/guides/database/connecting-to-postgres) [Pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits) [Compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk) [Metrics API](https://supabase.com/docs/guides/observability/metrics) [Backups](https://supabase.com/docs/guides/platform/backups) [Read replicas](https://supabase.com/docs/guides/platform/read-replicas)

Vercel documents placing Functions near the data source and supports function-region configuration subject to plan/platform behavior. Exact Production region is unknown and must be recorded. Documentation observed on 2026-09-27. [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region)

## Recovery architecture

Continuously monitor backup/PITR freshness and restore-exercise age. Recovery restores to isolation, validates schema/grants/functions plus tournament semantics, reconciles paper/offline records, then transfers a single writer authority through the protected protocol. Proposed RPO/RTO values live in `40-DISASTER-RECOVERY.md` and remain provisional until exercises prove them.

## Migration gate

An AWS RDS POC begins only if two hardened Supabase rehearsals fail approved budgets, needed telemetry/control/recovery remains unavailable, or another approved requirement mandates it. The POC must reproduce the exact workload and correctness/failure tests. Compare operational and cost categories without undated list-price claims.

## 2026 evidence posture

- **Proven, high confidence:** September 26 authority health failed at 01:34 ET and again at 08:24 ET; the latter included a database login/connection timeout. A database restart time of 02:34:52 ET is evidence of a restart, not its cause.
- **Proven, high confidence:** the September 27 scoring timeout was a rolled-back statement timeout and the original side-game-related query shape was materially expensive under the captured tests.
- **Correlated, low confidence for causation:** the owner-reported Supabase Disk I/O budget warning around 02:30 ET is consistent with resource pressure but lacks the underlying metric/timezone/account event data.
- **Observed risk, not outage cause:** a broad historical diagnostic exceeded 90 seconds and large exported payloads existed; no trace ties that query to an outage or restart.
- **Unknown:** exact root cause of both September 26 outages, I/O budget level/trajectory, provider/control-plane events, concurrent demand, pool waits, and causal restart/upgrade sequence.

Those proof gaps are addressed by the observability, monitoring, recovery, and rehearsal gates in this package.

