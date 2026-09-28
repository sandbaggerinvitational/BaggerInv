# Database and SQL hardening

## Proven failure classes

### SQL syntax that parsed only when invoked

Calcutta and Net Skins used `pg_catalog.greatest(...)` and `pg_catalog.least(...)`. These are PostgreSQL special expressions, not schema functions. The Calcutta claim failed during declaration initialization before job execution. Net Skins failed in the configured participant read and had latent claim and normalization failures. These defects survived source review and application-level tests because the installed functions were not executed on all branches in real PostgreSQL.

Required gate: create a disposable database on the supported PostgreSQL major, install every migration, resolve every function by exact signature, and execute read, claim, complete, fail, malformed input, boundary, idempotency, lease expiry and concurrency paths. Add a static rule rejecting schema-qualified special forms. Preserve owner, grants, `SECURITY DEFINER`, volatility, `search_path` and exact function hashes across `CREATE OR REPLACE`.

### Planner-time historical work

Incident 019 was not caused by the core scoring math. A score insert/update fired Calcutta and Net Skins triggers. The Calcutta enqueue path called `late_r3_result_compatible_v1`, whose SQL form allowed the planner to evaluate expensive stable fingerprint functions before an ineligible receipt filter. The original helper aggregated financial/result history, Net Skins history and broad tournament authority. Both live requests hit the existing eight-second statement timeout and rolled back.

Release 139's bounded correction is correct for the immediate defect: the PL/pgSQL function first checks the exact result/current/receipt/policy eligibility and returns false before the expensive predicate (`supabase/production_migrations/202609270120_bounded_late_r3_result_compatibility_v1.sql:3-31`). This is a local repair, not the final architecture. Scoring must not synchronously enter this compatibility path at all.

## SQL rules for 2027

1. No live write-path function may aggregate an unbounded history table.
2. No trigger may call a worker claim, calculation engine, publication transition or broad fingerprint.
3. Every trigger on `hole_scores`, `matches`, permissions and snapshots has a named latency budget and a transitive call inventory.
4. Every current-row lookup has a supporting unique or partial index and a database-enforced cardinality invariant.
5. JSON fingerprints use canonical, versioned manifests. Raw `to_jsonb(row)` over evolving schemas is prohibited for durable semantic compatibility.
6. `STABLE` and `IMMUTABLE` labels are not performance controls. CI retains `EXPLAIN (ANALYZE, BUFFERS)` evidence on production-shaped data.
7. Completion uses compare-and-swap on expected source, configuration, contract version and pointer revision.
8. Read projections have explicit time and row budgets and never scan payload history merely to report current state.

## Index and storage plan

Required indexes are driven by the proposed access paths:

- Outbox claim: partial index on `(available_at, occurred_at, event_id)` for `PENDING`/expired `RUNNING`.
- Outbox dedupe: unique `(consumer_key, event_id)` or one event plus unique consumer delivery key.
- Jobs: partial claim index by domain/scope/status/available time; unique active semantic input per scope when the lifecycle requires it.
- Results: unique `(domain, tournament, scope, result_revision)` plus one authoritative pointer foreign key. Avoid a second independently mutable `is_current` flag.
- Receipts: unique `(operation_type, operation_id)` and indexed scope/time lookup.
- Fingerprint components: `(domain, scope, contract_version, component_name, source_revision)` with the digest stored beside the exact manifest version.

Indexes do not fix a query that calls whole-history hashes during planning. The first performance requirement is to remove that work from the critical path and narrow inputs; indexing follows measured plans.

## Migration certification

Each migration produces a machine-readable manifest:

| Field | Required value |
|---|---|
| Objects changed | Exact signatures, tables, triggers and policies |
| Definition pins | Before and after SHA-256 |
| Privilege pins | Owner, grants, RLS, security-definer and search path |
| Data effect | Inert, bounded backfill, or explicit revision transition |
| Rollback | Exact predecessor definitions and data limitations |
| Execution tests | Branch and denial matrix in PostgreSQL |
| Performance tests | Baseline and candidate plan/time/buffers at certified scale |
| Compatibility | Accepted contract versions and job disposition |

The migration harness must run with realistic history growth. Incident 019's synthetic 407-result case exposed a helper growing from milliseconds to more than a second even before hosted resource pressure. Small fixtures were insufficient.

## Read-only reconciliation

The database should expose bounded views or functions that report:

- multiple-current or orphan current pointers;
- pointer revision/reference mismatch;
- current result whose state is incompatible with its pointer state;
- job bound to a noncurrent activation without an approved transition;
- stale READY/SUCCEEDED work that still blocks setup;
- published snapshot referencing a superseded calculation;
- missing outbox delivery for a committed canonical mutation;
- active leases beyond their expected deadline.

These checks must use keys and current pointers. They must not rebuild whole-history JSON aggregates in Production.

## Evidence boundaries

The exact inspected source includes Calcutta, Net Skins, scoring, Odds configuration checks and late-R3 compatibility at the pinned SHA. It is not an assertion that every hash or every database function in the repository was independently audited. The scoped inventory is in `21-FINGERPRINT-REDESIGN.md`.

- Invalid Calcutta SQL: `/private/tmp/bagger-calcutta-processor-incident/REPORT.md:63-100`.
- Invalid Net Skins SQL: `/private/tmp/bagger-net-skins-incident/REPORT.md:124-150`.
- Timeout and plan evidence: `/private/tmp/bagger-r3-write-timeout/REPORT.md:80-105`.
- Score RPC: `supabase/production_migrations/202608240021_production_scoring_operations.sql:931-1145`.
- Synchronous triggers: `supabase/production_migrations/202608290056_production_calcutta_v1.sql:1601-1615` and `supabase/production_migrations/202608290055_production_net_skins_v1.sql:1204-1213`.
