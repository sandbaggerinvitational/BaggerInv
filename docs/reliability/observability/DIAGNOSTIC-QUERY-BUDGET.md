# Diagnostic Query Budget

Status: Phase 1 machine-enforced application boundary  
Scope: named diagnostic operations in this repository  
Historical measurements: **UNKNOWN**; the numbers below are proposed safety limits, not observed 2026 percentiles

## Purpose

Tournament diagnostics must answer a narrow current-state question without turning an incident into an additional database load event. The policy in [`lib/reliability-diagnostic-policy.js`](../../../lib/reliability-diagnostic-policy.js) rejects arbitrary SQL and builds plans only for operations in [`tools/reliability/diagnostic-operations.json`](../../../tools/reliability/diagnostic-operations.json).

The checked-in command is plan-only. It validates an operation from the repository-owned catalog and prints the bounded plan. It has no database client, reads no credentials, and cannot execute a query. The CLI has no alternate-catalog or raw-SQL option:

```sh
node tools/reliability/diagnostic-runner.mjs \
  --operation current_match_summary \
  --mode tournament \
  --environment production \
  --params '{"tournamentId":"2026","matchId":"R3-M01"}'
```

## Machine-enforced rules

Every catalog operation must satisfy all of these rules before an executor can receive it:

- one named `SELECT` operation with explicit columns and one literal `LIMIT`;
- exact current-ID equality predicates for every parameter;
- relations declared by that operation and restricted to current-state tables;
- no history, historical, archive, audit, revision, event, snapshot, system-catalog, or statistics relations;
- no CTE, subquery, SQL function call, JSON/array/string aggregation, or JSON object construction;
- no mutation, DDL, administrative command, `EXPLAIN`, `ANALYZE`, multi-statement SQL, comments, `OR`, set operation, offset, or row lock;
- no caller-supplied SQL, row limit, relation, sort expression, or extra parameter;
- read-only execution intent, zero retries, and one process-local in-flight operation.

The runtime runner enforces returned row and serialized payload caps and aborts at the time cap. The injected query-client adapter opens a read-only transaction, applies local statement and lock timeouts, passes the abort signal to the query client, and commits or rolls back before releasing the connection. A timeout rejection alone cannot guarantee cancellation if a driver ignores the signal; the runner keeps its single-flight lock until that query settles.

The catalog is trusted repository code reviewed and deployed with the application. Its validation rejects known unsafe shapes and catches catalog mistakes, but regular expressions are not a SQL parser or proof that arbitrary SQL is safe. No request field, environment variable, alternate file path, or CLI option can supply a catalog or SQL statement.

## Proposed budgets

These are prospective controls chosen to keep incident diagnostics materially smaller than user traffic. They do not claim a measured 2026 baseline.

| Control | Hard ceiling | Current catalog |
|---|---:|---:|
| In-flight diagnostics | 1 | 1 |
| Statement time | 3,000 ms | 1,000–2,000 ms |
| Lock wait | 500 ms | 250 ms |
| Returned rows | 100 | 1–18 |
| Serialized response | 65,536 bytes | 4,096–32,768 bytes |
| Automatic retries | 0 | 0 |

A budget breach fails closed. Raising a ceiling requires a reviewed code and catalog change with an isolated non-Production test; it is not a command-line option.

## Modes and environments

**Tournament mode** may build only the current-state catalog operations. Production is an explicit environment value, so an omitted or misspelled environment fails closed.

**Maintenance mode** uses the same named-operation and budget rules, and is accepted only when the environment is `isolated-non-production` and isolation is explicitly verified. There is no Production maintenance override in the policy or CLI. This Phase 1 catalog contains no whole-history comparison operation.

## Executor contract

The injected adapter applies a frozen runner plan without changing its SQL or bindings. A future shipping executor or gateway must provide the query client and enforce:

1. a dedicated login with only `SELECT` on the named current-state projections;
2. `transaction_read_only = on`;
3. `statement_timeout` and `lock_timeout` no greater than the plan values;
4. a connection pool maximum of one for diagnostic work;
5. response row and byte enforcement before returning data;
6. no transparent retry.

The adapter is dependency-injected and has no checked-in database driver, credentials, or Production entrypoint. It makes transaction behavior locally testable, but it does not make the plan-only CLI operational.

The injected client must implement query(config) and release(error). A normal commit or confirmed rollback calls release without an error. If rollback fails or COMMIT has an indeterminate result, the adapter passes an error to release so a pool can destroy rather than reuse the connection. The original operation or commit error remains the caller-visible error.

The JavaScript runner and adapter provide application-level enforcement for callers that use them. They cannot prevent an engineer who holds a raw database credential from opening another SQL client and bypassing this code. Making the boundary authoritative requires a future database role and diagnostic gateway, plus removal of direct raw credentials from routine operator access.

## Adding an operation

A new operation must name the operational question, use exact current IDs, declare every relation, select only necessary columns, and use a literal limit at or below its response budget. Add a rejection or acceptance test that exercises the real policy. History analysis belongs on an isolated restored copy or replica under a separately reviewed maintenance workflow.

## Verification

The targeted tests cover catalog validation, the known heavy historical JSON shape, `EXPLAIN ANALYZE`, Production maintenance denial, parameter validation, concurrency, timeout, row and payload caps, no retry, and CLI rejection of raw SQL.

Adapter tests use a fake query client to prove read-only transaction order, local budgets, exact bindings, rollback and release, pre-connect policy rejection, and lock retention when a query ignores cancellation. They make no network or Production connection.
