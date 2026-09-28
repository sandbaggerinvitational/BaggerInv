import { DiagnosticPolicyError } from "../../lib/reliability-diagnostic-policy.js";

const CONTROL_SQL = Object.freeze({
  begin: "BEGIN TRANSACTION READ ONLY",
  budgets: "SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true)",
  commit: "COMMIT",
  rollback: "ROLLBACK",
});

function fail(code, message) {
  throw new DiagnosticPolicyError(code, message);
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Diagnostic execution aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function assertRunnerPlan(plan) {
  if (!plan || typeof plan !== "object" || !Object.isFrozen(plan) ||
      plan.schemaVersion !== 1 || typeof plan.sql !== "string" ||
      !Array.isArray(plan.values) || plan.controls?.readOnly !== true ||
      plan.controls?.connectionLimit !== 1 || plan.controls?.retryCount !== 0 ||
      !Number.isInteger(plan.controls?.statementTimeoutMs) ||
      !Number.isInteger(plan.controls?.lockTimeoutMs)) {
    fail(
      "INVALID_EXECUTION_PLAN",
      "The query-client adapter accepts only a frozen read-only plan from the diagnostic runner.",
    );
  }
}

async function query(client, text, values, signal) {
  throwIfAborted(signal);
  return client.query({ text, values, signal });
}

export function createDiagnosticQueryClientExecutor({ connect }) {
  if (typeof connect !== "function") {
    fail("INVALID_QUERY_CLIENT", "A query-client connect function is required.");
  }

  return async function executeDiagnosticPlan(plan, { signal } = {}) {
    assertRunnerPlan(plan);
    throwIfAborted(signal);

    let client;
    let transactionStarted = false;
    let commitStarted = false;
    let discardReason = null;
    try {
      client = await connect();
      if (!client || typeof client.query !== "function" ||
          typeof client.release !== "function") {
        fail(
          "INVALID_QUERY_CLIENT",
          "The query-client connection must expose query(config) and release().",
        );
      }
      throwIfAborted(signal);

      await query(client, CONTROL_SQL.begin, [], signal);
      transactionStarted = true;
      await query(client, CONTROL_SQL.budgets, [
        `${plan.controls.statementTimeoutMs}ms`,
        `${plan.controls.lockTimeoutMs}ms`,
      ], signal);
      const result = await query(client, plan.sql, plan.values, signal);
      throwIfAborted(signal);
      commitStarted = true;
      await query(client, CONTROL_SQL.commit, [], signal);
      commitStarted = false;
      transactionStarted = false;
      return result;
    } catch (error) {
      if (client && transactionStarted) {
        try {
          // Rollback is cleanup after cancellation and must be attempted even
          // when the operation signal is already aborted.
          await client.query({ text: CONTROL_SQL.rollback, values: [] });
          transactionStarted = false;
        } catch (rollbackError) {
          // Preserve the original operation error, but ensure a pool destroys
          // a connection whose transaction state could not be recovered.
          discardReason = rollbackError;
        }
      }
      // A failed COMMIT has an indeterminate connection/transaction state even
      // if a following ROLLBACK appears to succeed.
      if (commitStarted && discardReason === null) discardReason = error;
      throw error;
    } finally {
      if (client) {
        try { client.release(discardReason || undefined); } catch {}
      }
    }
  };
}

export const DIAGNOSTIC_QUERY_CLIENT_CONTROL_SQL = CONTROL_SQL;
