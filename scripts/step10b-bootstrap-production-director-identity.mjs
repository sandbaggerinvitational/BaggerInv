#!/usr/bin/env node

/**
 * Reviewed one-time Step 10B Production Director identity/Auth bootstrap.
 *
 * Usage intentionally requires an owner-private evidence file. Raw approved
 * email evidence is never accepted on the command line or printed. Run with
 * Node's react-server condition so the server-only boundary remains enforced:
 *
 *   node --conditions=react-server scripts/step10b-bootstrap-production-director-identity.mjs \
 *     --evidence /absolute/owner-private-production-identity.json
 *
 * This command cannot request an OTP or grant a Director entitlement.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const USAGE = "Usage: node --conditions=react-server scripts/step10b-bootstrap-production-director-identity.mjs --evidence <owner-private.json>";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

if (!process.execArgv.some((value) => value === "--conditions=react-server" || value === "-C=react-server")) {
  throw new Error(USAGE);
}
const evidenceOption = option("--evidence");
if (!evidenceOption) throw new Error(USAGE);
const evidencePath = path.resolve(evidenceOption);
const metadata = await stat(evidencePath);
if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
  const error = new Error("Production identity evidence must be a regular owner-private file with mode 0600 (or stricter).");
  error.code = "PRODUCTION_DIRECTOR_IDENTITY_PRIVATE_FILE_REQUIRED";
  throw error;
}

const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const { bootstrapProductionDirectorIdentityAndAuthUser } = await import(
  "../lib/production-director-identity-bootstrap-admin.js"
);
try {
  const result = await bootstrapProductionDirectorIdentityAndAuthUser(evidence);
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    contractVersion: result.contractVersion,
    evidence: result.evidence,
    currentShadow: result.currentShadow,
    identityProjection: result.identityProjection,
    authCandidate: result.authCandidate,
    safety: result.safety,
    rawEmailExposed: false,
  })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    code: String(error?.code || "PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_FAILED"),
    message: "Production Director identity bootstrap failed closed; inspect server-side diagnostics before retrying.",
    rawEmailExposed: false,
  })}\n`);
  process.exitCode = 1;
}
