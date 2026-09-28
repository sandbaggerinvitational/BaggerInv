# Capacity Evidence Gaps

Review date: 2026-09-27  
Method: read-only repository inspection; no Production, provider-account, network, or database access

## Finding

The repository does not contain a database backup, point-in-time recovery, or isolated database restore procedure that can be executed and verified. It also does not contain a completed database restore rehearsal artifact with measured recovery point and recovery time.

This is an evidence gap. It does not prove that provider backups are disabled or unavailable. Current account configuration remains **UNKNOWN**.

## Evidence inspected

The review checked repository paths and terms associated with backup, restore, PITR, recovery points, retention, and disaster recovery. The postmortem package already records the same account-level unknowns:

- `docs/reliability/2026-tournament-postmortem/40-DISASTER-RECOVERY.md`
- `docs/reliability/2026-tournament-postmortem/41-BACKUP-RESTORE.md`
- `docs/reliability/2026-tournament-postmortem/29-CAPACITY-PLAN.md`
- `supabase/migrations/`
- `supabase/production_migrations/`
- `tools/`, including Step 11.6 operator material
- `test/` and `docs/` outside the preserved postmortem package

The Step 11.6 material restores an application/provider write fence and Google ACL state. Application tests also use “restore” for sessions, projections, and user-interface state. Those artifacts are not evidence that a database backup can be restored, that PITR is configured, or that recovered data is semantically correct.

## Missing durable evidence

| Area | Repository evidence | Required proof |
|---|---|---|
| Account backup configuration | **UNKNOWN** | Sanitized export of enabled backup types, schedule, retention, encryption, region, and responsible owner |
| Latest recoverable point | **UNKNOWN** | Timestamped provider evidence and an alert for stale or unavailable recovery points |
| PITR window | **UNKNOWN** | Account-specific enabled state and earliest/latest recoverable timestamps |
| Database restore procedure | Not found | Versioned runbook with prerequisites, isolation checks, ordered restore steps, abort points, and cleanup |
| Isolated restore rehearsal | Not found | Receipt for a completed non-Production restore with source recovery point, start/end times, and result |
| Semantic recovery checks | Not found | Bounded checks for current tournament IDs, match counts, current scoring state, authority state, and referential integrity |
| Measured RPO and RTO | **UNKNOWN** | Exercise-derived recovery-point loss and elapsed recovery time; proposed objectives must remain labeled provisional |
| Storage/object recovery | **UNKNOWN** | Inventory and recovery test for any provider storage objects required by the application |
| Roles and secrets recovery | **UNKNOWN** | Procedure to recreate least-privilege roles and rotate/rebind secrets without copying Production secrets into the exercise |
| Regional recovery | **UNKNOWN** | Provider/account capability record and an isolated exercise or documented limitation |
| Capacity headroom | **UNKNOWN** | Time-series compute, memory, connection, disk I/O, storage growth, and query-load evidence for event and non-event windows |
| Scale change rehearsal | Not found | Two isolated rehearsals with timing, connection behavior, rollback conditions, and application verification |

## Safe next evidence step

Create an isolated non-Production recovery exercise with a named owner and a sanitized receipt. Record the chosen recovery point, actual start and end, measured data loss relative to that point, validation query names, row-count summaries, and cleanup confirmation. Use only bounded named validations; do not run whole-history comparisons against Production.

Provider documentation can describe available product capabilities, but it cannot establish this account’s enabled plan, retention, recovery window, backup freshness, region, or tested restore behavior. Those facts remain **UNKNOWN** until captured from the account and demonstrated by an isolated restore.
