#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiagnosticPlan,
  DiagnosticPolicyError,
} from "../../lib/reliability-diagnostic-policy.js";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(toolDirectory, "diagnostic-operations.json");

export function parseDiagnosticArguments(args) {
  const options = {};
  const valueFlags = new Map([
    ["--operation", "operationName"],
    ["--mode", "mode"],
    ["--environment", "environment"],
    ["--params", "parametersJson"],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--isolation-verified") {
      if ("isolationVerified" in options) throw new Error("Duplicate --isolation-verified.");
      options.isolationVerified = true;
      continue;
    }
    const key = valueFlags.get(argument);
    if (!key) throw new Error(`Unsupported argument: ${argument}`);
    if (key in options) throw new Error(`Duplicate ${argument}.`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    options[key] = value;
    index += 1;
  }

  if (!options.operationName) throw new Error("--operation is required.");
  if (!options.mode) throw new Error("--mode is required.");
  if (!options.environment) throw new Error("--environment is required.");
  if (!options.parametersJson) throw new Error("--params is required.");

  let parameters;
  try {
    parameters = JSON.parse(options.parametersJson);
  } catch {
    throw new Error("--params must be a JSON object.");
  }

  return {
    operationName: options.operationName,
    mode: options.mode,
    environment: options.environment,
    isolationVerified: options.isolationVerified === true,
    parameters,
  };
}

export function loadTrustedDiagnosticCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

export function diagnosticPlanFromArguments(args) {
  const parsed = parseDiagnosticArguments(args);
  return buildDiagnosticPlan({
    catalog: loadTrustedDiagnosticCatalog(),
    operationName: parsed.operationName,
    mode: parsed.mode,
    environment: parsed.environment,
    isolationVerified: parsed.isolationVerified,
    parameters: parsed.parameters,
  });
}

export function main(args = process.argv.slice(2), output = process.stdout, error = process.stderr) {
  try {
    const plan = diagnosticPlanFromArguments(args);
    output.write(`${JSON.stringify({
      status: "VALIDATED_PLAN_ONLY",
      executionEnabled: false,
      plan,
    }, null, 2)}\n`);
    return 0;
  } catch (caught) {
    const code = caught instanceof DiagnosticPolicyError ? caught.code : "INVALID_ARGUMENT";
    error.write(`${JSON.stringify({ status: "REJECTED", code, message: caught.message })}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
