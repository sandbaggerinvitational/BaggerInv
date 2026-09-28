const MODES = Object.freeze({
  TOURNAMENT: "tournament",
  MAINTENANCE: "maintenance",
});

const ENVIRONMENTS = Object.freeze({
  PRODUCTION: "production",
  ISOLATED_NON_PRODUCTION: "isolated-non-production",
});

const HARD_CAPS = Object.freeze({
  concurrency: 1,
  timeoutMs: 3_000,
  lockTimeoutMs: 500,
  maxRows: 100,
  maxPayloadBytes: 65_536,
});

const OPERATION_NAME = /^[a-z][a-z0-9_]{2,63}$/;
const IDENTIFIER_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SAFE_RELATION = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$/;
const SAFE_COLUMN = /^[a-z_][a-z0-9_]*$/;
const FORBIDDEN_SQL = /\b(?:insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|explain|set|show|listen|notify|prepare|execute|deallocate|lock|refresh|reindex|cluster)\b/i;
const FORBIDDEN_QUERY_SHAPE = /\b(?:with|union|intersect|except|offset|for\s+(?:update|share)|pg_sleep|generate_series)\b/i;
const FORBIDDEN_AGGREGATE = /\b(?:json_agg|jsonb_agg|json_object_agg|jsonb_object_agg|json_build_object|jsonb_build_object|array_agg|string_agg|xmlagg)\s*\(/i;
const FORBIDDEN_RELATION = /(?:^|\.)(?:[a-z0-9_]*_)?(?:history|histories|historical|archive|archives|audit|audits|revision|revisions|events|snapshots)(?:_|$)/i;
const SYSTEM_RELATION = /^(?:pg_catalog|information_schema|pg_toast|pg_temp)(?:\.|$)|(?:^|\.)pg_stat/i;

export const DIAGNOSTIC_MODES = MODES;
export const DIAGNOSTIC_ENVIRONMENTS = ENVIRONMENTS;
export const DIAGNOSTIC_HARD_CAPS = HARD_CAPS;

export class DiagnosticPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DiagnosticPolicyError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new DiagnosticPolicyError(code, message);
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) fail("INVALID_DEFINITION", `${label} must be a plain object.`);
}

function requirePositiveInteger(value, label, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail("BUDGET_EXCEEDED", `${label} must be an integer from 1 through ${maximum}.`);
  }
}

function normalizedRelation(value) {
  return String(value).replaceAll('"', "").toLowerCase();
}

function sqlRelations(sql) {
  const relations = [];
  const pattern = /\b(?:from|join)\s+((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)/gi;
  for (const match of sql.matchAll(pattern)) relations.push(normalizedRelation(match[1]));
  return [...new Set(relations)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateBudget(budget, operationName) {
  requirePlainObject(budget, `${operationName}.budget`);
  const exactKeys = ["timeoutMs", "lockTimeoutMs", "maxRows", "maxPayloadBytes"];
  for (const key of Object.keys(budget)) {
    if (!exactKeys.includes(key)) {
      fail("INVALID_DEFINITION", `${operationName}.budget contains unsupported key ${key}.`);
    }
  }
  for (const key of exactKeys) {
    if (!(key in budget)) fail("INVALID_DEFINITION", `${operationName}.budget.${key} is required.`);
  }
  requirePositiveInteger(budget.timeoutMs, `${operationName}.budget.timeoutMs`, HARD_CAPS.timeoutMs);
  requirePositiveInteger(budget.lockTimeoutMs, `${operationName}.budget.lockTimeoutMs`, HARD_CAPS.lockTimeoutMs);
  requirePositiveInteger(budget.maxRows, `${operationName}.budget.maxRows`, HARD_CAPS.maxRows);
  requirePositiveInteger(
    budget.maxPayloadBytes,
    `${operationName}.budget.maxPayloadBytes`,
    HARD_CAPS.maxPayloadBytes,
  );
}

export function validateDiagnosticOperation(operationName, definition) {
  if (!OPERATION_NAME.test(String(operationName))) {
    fail("INVALID_DEFINITION", `Invalid diagnostic operation name: ${operationName}.`);
  }
  requirePlainObject(definition, operationName);

  const allowedKeys = [
    "description", "modes", "sql", "parameters", "allowedRelations", "budget",
  ];
  for (const key of Object.keys(definition)) {
    if (!allowedKeys.includes(key)) {
      fail("INVALID_DEFINITION", `${operationName} contains unsupported key ${key}.`);
    }
  }

  if (typeof definition.description !== "string" || !definition.description.trim()) {
    fail("INVALID_DEFINITION", `${operationName}.description is required.`);
  }

  if (!Array.isArray(definition.modes) || definition.modes.length === 0) {
    fail("INVALID_DEFINITION", `${operationName}.modes must not be empty.`);
  }
  for (const mode of definition.modes) {
    if (!Object.values(MODES).includes(mode)) {
      fail("INVALID_DEFINITION", `${operationName} has unsupported mode ${mode}.`);
    }
  }

  const sql = String(definition.sql ?? "").trim();
  if (!/^select\b/i.test(sql)) {
    fail("UNSAFE_SQL", `${operationName} must be one SELECT statement.`);
  }
  if (sql.includes(";") || /--|\/\*/.test(sql)) {
    fail("UNSAFE_SQL", `${operationName} cannot contain statement separators or comments.`);
  }
  if (FORBIDDEN_SQL.test(sql) || FORBIDDEN_QUERY_SHAPE.test(sql)) {
    fail("UNSAFE_SQL", `${operationName} contains a forbidden SQL operation or query shape.`);
  }
  const selectCount = (sql.match(/\bselect\b/gi) || []).length;
  if (selectCount !== 1) {
    fail("SUBQUERY_FORBIDDEN", `${operationName} cannot contain a CTE or subquery.`);
  }
  if (FORBIDDEN_AGGREGATE.test(sql)) {
    fail("HEAVY_QUERY_SHAPE", `${operationName} contains a forbidden aggregate or JSON construction.`);
  }
  if (/\b[a-z_][a-z0-9_]*\s*\(/i.test(sql)) {
    fail("FUNCTION_CALL_FORBIDDEN", `${operationName} cannot call SQL functions.`);
  }
  if (/\bor\b/i.test(sql)) {
    fail("UNSAFE_SQL", `${operationName} cannot use OR predicates.`);
  }
  if (sql.includes("*")) {
    fail("UNSAFE_SQL", `${operationName} must select explicit columns.`);
  }

  if (!Array.isArray(definition.allowedRelations) || definition.allowedRelations.length === 0) {
    fail("INVALID_DEFINITION", `${operationName}.allowedRelations must not be empty.`);
  }
  const allowedRelations = new Set();
  for (const value of definition.allowedRelations) {
    const relation = normalizedRelation(value);
    if (!SAFE_RELATION.test(relation) || SYSTEM_RELATION.test(relation) ||
        FORBIDDEN_RELATION.test(relation)) {
      fail("FORBIDDEN_RELATION", `${operationName} declares forbidden relation ${relation}.`);
    }
    allowedRelations.add(relation);
  }

  const relations = sqlRelations(sql);
  if (relations.length === 0) {
    fail("UNSAFE_SQL", `${operationName} must read an allowlisted relation.`);
  }
  for (const relation of relations) {
    if (SYSTEM_RELATION.test(relation) || FORBIDDEN_RELATION.test(relation)) {
      fail("FORBIDDEN_RELATION", `${operationName} reads forbidden relation ${relation}.`);
    }
    if (!allowedRelations.has(relation)) {
      fail("FORBIDDEN_RELATION", `${operationName} reads undeclared relation ${relation}.`);
    }
  }
  for (const relation of allowedRelations) {
    if (!relations.includes(relation)) {
      fail("INVALID_DEFINITION", `${operationName} declares unused relation ${relation}.`);
    }
  }

  if (!Array.isArray(definition.parameters) || definition.parameters.length === 0) {
    fail("INVALID_DEFINITION", `${operationName}.parameters must contain current IDs.`);
  }
  const names = new Set();
  const positions = new Set();
  for (const parameter of definition.parameters) {
    requirePlainObject(parameter, `${operationName}.parameter`);
    const parameterKeys = ["name", "position", "kind", "scopeColumn"];
    for (const key of Object.keys(parameter)) {
      if (!parameterKeys.includes(key)) {
        fail("INVALID_DEFINITION", `${operationName} parameter contains unsupported key ${key}.`);
      }
    }
    if (!/^[a-z][A-Za-z0-9]{1,63}$/.test(String(parameter.name)) ||
        names.has(parameter.name)) {
      fail("INVALID_DEFINITION", `${operationName} has an invalid or duplicate parameter name.`);
    }
    if (!Number.isInteger(parameter.position) || parameter.position < 1 ||
        positions.has(parameter.position)) {
      fail("INVALID_DEFINITION", `${operationName} has an invalid or duplicate parameter position.`);
    }
    if (parameter.kind !== "current-id") {
      fail("INVALID_DEFINITION", `${operationName} parameters must be current-id bindings.`);
    }
    if (!SAFE_COLUMN.test(String(parameter.scopeColumn ?? ""))) {
      fail("INVALID_DEFINITION", `${operationName} parameter ${parameter.name} needs a safe scopeColumn.`);
    }
    const column = escapeRegExp(parameter.scopeColumn);
    const predicate = new RegExp(
      `(?:\\b[a-z_][a-z0-9_]*\\.)?"?${column}"?\\s*=\\s*\\$${parameter.position}\\b`,
      "i",
    );
    if (!predicate.test(sql)) {
      fail(
        "MISSING_CURRENT_SCOPE",
        `${operationName} must bind ${parameter.name} to ${parameter.scopeColumn} with $${parameter.position}.`,
      );
    }
    names.add(parameter.name);
    positions.add(parameter.position);
  }
  const orderedPositions = [...positions].sort((a, b) => a - b);
  if (orderedPositions.some((position, index) => position !== index + 1)) {
    fail("INVALID_DEFINITION", `${operationName} parameter positions must be contiguous from 1.`);
  }

  validateBudget(definition.budget, operationName);
  const limits = [...sql.matchAll(/\blimit\s+(\d+)\b/gi)].map((match) => Number(match[1]));
  if (limits.length !== 1 || limits[0] < 1 || limits[0] > definition.budget.maxRows) {
    fail(
      "MISSING_ROW_BOUND",
      `${operationName} must have one literal LIMIT no greater than its row budget.`,
    );
  }

  return true;
}

export function validateDiagnosticCatalog(catalog) {
  requirePlainObject(catalog, "catalog");
  const keys = Object.keys(catalog);
  if (keys.some((key) => !["schemaVersion", "operations"].includes(key))) {
    fail("INVALID_DEFINITION", "Catalog contains unsupported top-level keys.");
  }
  if (catalog.schemaVersion !== 1) {
    fail("INVALID_DEFINITION", "Catalog schemaVersion must be 1.");
  }
  requirePlainObject(catalog.operations, "catalog.operations");
  const names = Object.keys(catalog.operations);
  if (names.length === 0) fail("INVALID_DEFINITION", "Catalog must contain operations.");
  for (const name of names) validateDiagnosticOperation(name, catalog.operations[name]);
  return true;
}

function validateInvocationShape(input) {
  requirePlainObject(input, "invocation");
  const allowed = [
    "catalog", "operationName", "mode", "environment", "isolationVerified", "parameters",
  ];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) fail("UNKNOWN_OPTION", `Unsupported invocation option: ${key}.`);
  }
}

export function buildDiagnosticPlan(input) {
  validateInvocationShape(input);
  const {
    catalog,
    operationName,
    mode,
    environment,
    isolationVerified = false,
    parameters,
  } = input;
  validateDiagnosticCatalog(catalog);

  if (!Object.values(MODES).includes(mode)) {
    fail("INVALID_MODE", "Diagnostic mode must be tournament or maintenance.");
  }
  if (!Object.values(ENVIRONMENTS).includes(environment)) {
    fail(
      "INVALID_ENVIRONMENT",
      "Environment must be production or explicitly isolated non-production.",
    );
  }
  if (mode === MODES.MAINTENANCE &&
      (environment !== ENVIRONMENTS.ISOLATED_NON_PRODUCTION || isolationVerified !== true)) {
    fail(
      "MAINTENANCE_ISOLATION_REQUIRED",
      "Maintenance diagnostics require verified isolated non-production; Production has no override.",
    );
  }
  if (mode === MODES.TOURNAMENT && isolationVerified === true &&
      environment !== ENVIRONMENTS.ISOLATED_NON_PRODUCTION) {
    fail("INVALID_ENVIRONMENT", "Isolation can only be verified for isolated non-production.");
  }

  const definition = catalog.operations[operationName];
  if (!definition) fail("UNKNOWN_OPERATION", `Unknown diagnostic operation: ${operationName}.`);
  if (!definition.modes.includes(mode)) {
    fail("MODE_NOT_ALLOWED", `${operationName} is not allowed in ${mode} mode.`);
  }

  requirePlainObject(parameters, "parameters");
  const expected = new Set(definition.parameters.map((parameter) => parameter.name));
  for (const key of Object.keys(parameters)) {
    if (!expected.has(key)) fail("UNKNOWN_PARAMETER", `Unknown parameter for ${operationName}: ${key}.`);
  }
  const values = [];
  for (const parameter of [...definition.parameters].sort((a, b) => a.position - b.position)) {
    const value = String(parameters[parameter.name] ?? "").trim();
    if (!IDENTIFIER_VALUE.test(value)) {
      fail(
        "INVALID_CURRENT_ID",
        `${operationName} requires a bounded current ID for ${parameter.name}.`,
      );
    }
    values.push(value);
  }

  return deepFreeze({
    schemaVersion: 1,
    operationName,
    mode,
    environment,
    sql: definition.sql,
    values,
    controls: {
      readOnly: true,
      connectionLimit: HARD_CAPS.concurrency,
      statementTimeoutMs: definition.budget.timeoutMs,
      lockTimeoutMs: definition.budget.lockTimeoutMs,
      maxRows: definition.budget.maxRows,
      maxPayloadBytes: definition.budget.maxPayloadBytes,
      retryCount: 0,
    },
  });
}

function resultRows(result) {
  if (Array.isArray(result)) return result;
  if (isPlainObject(result) && Array.isArray(result.rows)) return result.rows;
  fail("INVALID_EXECUTOR_RESULT", "Diagnostic executor must return an array or { rows: [] }.");
}

function validateResult(result, plan) {
  const rows = resultRows(result);
  if (rows.length > plan.controls.maxRows) {
    fail(
      "ROW_BUDGET_EXCEEDED",
      `${plan.operationName} returned ${rows.length} rows; maximum is ${plan.controls.maxRows}.`,
    );
  }
  let serialized;
  try {
    serialized = JSON.stringify(rows);
  } catch {
    fail("INVALID_EXECUTOR_RESULT", "Diagnostic result must be JSON serializable.");
  }
  const payloadBytes = Buffer.byteLength(serialized, "utf8");
  if (payloadBytes > plan.controls.maxPayloadBytes) {
    fail(
      "PAYLOAD_BUDGET_EXCEEDED",
      `${plan.operationName} returned ${payloadBytes} bytes; maximum is ${plan.controls.maxPayloadBytes}.`,
    );
  }
  return deepFreeze({
    operationName: plan.operationName,
    rowCount: rows.length,
    payloadBytes,
    rows,
  });
}

export function createDiagnosticRunner({ catalog, execute }) {
  validateDiagnosticCatalog(catalog);
  if (typeof execute !== "function") {
    fail("INVALID_EXECUTOR", "A diagnostic execute(plan, { signal }) function is required.");
  }

  let activeExecution = null;

  return Object.freeze({
    async run(invocation) {
      if (activeExecution) {
        fail("CONCURRENCY_LIMIT", "Only one diagnostic operation may be in flight.");
      }
      const plan = buildDiagnosticPlan({ ...invocation, catalog });
      const controller = new AbortController();
      let timer;
      let executorPromise;
      executorPromise = Promise.resolve()
        .then(() => execute(plan, { signal: controller.signal }))
        .finally(() => {
          if (activeExecution === executorPromise) activeExecution = null;
        });
      activeExecution = executorPromise;

      const timeoutPromise = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DiagnosticPolicyError(
            "TIME_BUDGET_EXCEEDED",
            `${plan.operationName} exceeded ${plan.controls.statementTimeoutMs} ms.`,
          ));
        }, plan.controls.statementTimeoutMs);
      });

      try {
        const result = await Promise.race([executorPromise, timeoutPromise]);
        return validateResult(result, plan);
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
