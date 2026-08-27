#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { spawn as spawnCallback } from "node:child_process";
import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  createVercelWafProviderEvidence,
  createVercelWafRuleInsertDispatchResult,
  createVercelProviderAttestation,
  pinnedEd25519PublicKeyBase64,
  VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
  VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
  VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
} from "../../lib/vercel-provider-attestation.js";

const execFileAsync = promisify(execFileCallback);
export const VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE =
  "com.baggerinv.step11-6.vercel-provider-attester";
export const VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT =
  "production-vercel-provider-attestation-ed25519-v1";
export const VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SECRET_PREFIX =
  "STEP11_6_ED25519_PKCS8_B64_V1_";
const SECURITY_BINARY = "/usr/bin/security";
const KEYCHAIN_READ_TIMEOUT_MS = 15_000;
const KEYCHAIN_ADD_TIMEOUT_MS = 30_000;
const KEYCHAIN_LABEL = "BaggerInv Step 11.6 Vercel provider attester Ed25519 key";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export async function readKeychainAttestationPrivateKey({
  execFileImpl = execFileAsync,
} = {}) {
  let stdout;
  try {
    ({ stdout } = await execFileImpl(SECURITY_BINARY, [
      "find-generic-password",
      "-a", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
      "-s", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
      "-w",
    ], {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      windowsHide: true,
      timeout: KEYCHAIN_READ_TIMEOUT_MS,
      killSignal: "SIGKILL",
    }));
  } catch {
    fail(
      "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_UNAVAILABLE",
      "The persistent Ed25519 signer was unavailable from the exact macOS Keychain item.",
    );
  }
  const stored = String(stdout || "").trim();
  const match = stored.match(
    /^STEP11_6_ED25519_PKCS8_B64_V1_([A-Za-z0-9_-]+)$/,
  );
  if (!match) {
    fail(
      "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID",
      "The exact macOS Keychain item did not contain a versioned signer token.",
    );
  }
  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64url");
  } catch {
    decoded = Buffer.alloc(0);
  }
  const key = decoded.toString("utf8");
  if (decoded.length === 0 || decoded.toString("base64url") !== match[1] ||
      !Buffer.from(key, "utf8").equals(decoded) || key !== key.trim() ||
      key.includes("\0") || !key.startsWith("-----BEGIN PRIVATE KEY-----\n") ||
      !key.endsWith("-----END PRIVATE KEY-----")) {
    fail(
      "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID",
      "The exact macOS Keychain signer token was not canonical PKCS8 material.",
    );
  }
  return key;
}

export async function installKeychainAttestationSigner({
  spawnImpl = spawnCallback,
  execFileImpl = execFileAsync,
} = {}) {
  function signerResult(privatePem, recovered) {
    let privateKey;
    try {
      privateKey = createPrivateKey(privatePem);
      if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("not-ed25519");
    } catch {
      fail("STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID",
        "The existing macOS Keychain signer could not be verified as Ed25519.");
    }
    const publicKeyBase64 = pinnedEd25519PublicKeyBase64(
      createPublicKey(privateKey),
    );
    return Object.freeze({
      service: VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
      account: VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
      publicKeyBase64,
      signerKeyFingerprint: createHash("sha256")
        .update(Buffer.from(publicKeyBase64, "base64")).digest("hex"),
      recovered,
    });
  }

  try {
    const existingPem = await readKeychainAttestationPrivateKey({ execFileImpl });
    return signerResult(existingPem, true);
  } catch (error) {
    if (error?.code !== "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_UNAVAILABLE") {
      fail("STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID",
        "The existing macOS Keychain signer could not be verified as Ed25519.");
    }
  }
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKeyBase64 = pinnedEd25519PublicKeyBase64(pair.publicKey);
  const encodedPrivateKey = `${VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SECRET_PREFIX}${
    Buffer.from(privatePem.trim(), "utf8").toString("base64url")}`;
  const interactiveAddCommand = [
    "add-generic-password",
    "-a", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
    "-s", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
    "-l", `"${KEYCHAIN_LABEL}"`,
    "-T", SECURITY_BINARY,
    "-w", encodedPrivateKey,
  ].join(" ");
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId;
      const settle = (error) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (error) reject(error);
        else resolve();
      };
      const child = spawnImpl(SECURITY_BINARY, ["-i"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      child.once("error", (error) => settle(error));
      child.once("exit", (code) => settle(code === 0 ? null : new Error("keychain")));
      timeoutId = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        settle(new Error("keychain-timeout"));
      }, KEYCHAIN_ADD_TIMEOUT_MS);
      timeoutId.unref?.();
      try {
        child.stdin.end(`${interactiveAddCommand}\nquit\n`);
      } catch (error) {
        settle(error);
      }
    });
  } catch {
    // A duplicate or a lost process response is resolved only by reading and
    // validating the exact add-only item below. No retry ever overwrites it.
  }

  let storedPem;
  try {
    storedPem = await readKeychainAttestationPrivateKey({ execFileImpl });
  } catch (error) {
    if (error?.code === "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID") throw error;
    fail(
      "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_INSTALL_FAILED",
      "The one-time macOS Keychain signer installation did not complete.",
    );
  }
  const stored = signerResult(storedPem, false);
  if (stored.publicKeyBase64 === publicKeyBase64) return stored;
  // `security -i` can itself exit zero even when its inner add reports a
  // duplicate. A different, strictly decoded Ed25519 readback is therefore an
  // authoritative concurrent/existing signer, never a reason to overwrite it.
  return Object.freeze({ ...stored, recovered: true });
}

export function createVercelCliReadApi({
  vercelBinary,
  execFileImpl = execFileAsync,
} = {}) {
  if (typeof execFileImpl !== "function") throw new TypeError("execFileImpl must be a function.");
  return async (apiPath) => {
    if (typeof apiPath !== "string" || !apiPath.startsWith("/") ||
        !new Set([
          "/v1/security/firewall/config",
          "/v6/deployments",
          "/v4/aliases",
        ]).has(apiPath.split("?")[0]) &&
        !/^\/v9\/projects\/[^/?]+\/env\?/.test(apiPath)) {
      fail("STEP11_6_VERCEL_ATTESTER_ENDPOINT_FORBIDDEN",
        "The local attester requested an endpoint outside its read-only allowlist.");
    }
    let stdout;
    try {
      const binary = vercelBinary || "npx";
      const commandArgs = vercelBinary
        ? ["api", apiPath]
        : ["--no-install", "vercel", "api", apiPath];
      ({ stdout } = await execFileImpl(binary, commandArgs, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      }));
    } catch {
      fail(
        "STEP11_6_VERCEL_ATTESTER_API_UNAVAILABLE",
        "The authenticated local Vercel CLI could not complete a read-only provider query.",
      );
    }
    try { return JSON.parse(stdout); }
    catch {
      fail(
        "STEP11_6_VERCEL_ATTESTER_API_RESPONSE_INVALID",
        "The authenticated local Vercel CLI returned a non-JSON provider response.",
      );
    }
  };
}

function args(argv) {
  if (!new Set([
    "attest", "attest-waf", "attest-rule-insert-result",
    "install-keychain-signer",
  ]).has(argv[0])) {
    fail("STEP11_6_VERCEL_ATTESTER_COMMAND_INVALID",
      "Expected attest, attest-waf, attest-rule-insert-result, or install-keychain-signer.");
  }
  if (argv[0] === "install-keychain-signer") {
    if (argv.length !== 1) fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
      "The one-time key installer accepts no arguments.");
    return { command: argv[0] };
  }
  const parsed = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID", "An attester argument was invalid.");
    }
    const name = key.slice(2);
    if (!new Set([
      "request", "output", "vercel-bin", "firewall-readback",
      "provider-response", "outcome",
    ]).has(name) ||
        Object.prototype.hasOwnProperty.call(parsed, name)) {
      fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID", "An attester argument was not allowed.");
    }
    parsed[name] = value;
  }
  if (!parsed.request) {
    fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
      "--request is required.");
  }
  const command = argv[0];
  if (command === "attest" &&
      (parsed["firewall-readback"] || parsed["provider-response"] ||
        parsed.outcome)) {
    fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
      "The deployment attester accepts only request, output, and vercel-bin.");
  }
  if (command !== "attest" && parsed["vercel-bin"]) {
    fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
      "Signed WAF readback commands do not execute a provider CLI.");
  }
  if (command === "attest-waf" &&
      (!parsed["firewall-readback"] || parsed["provider-response"] || parsed.outcome)) {
    fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
      "attest-waf requires exactly one --firewall-readback file.");
  }
  if (command === "attest-rule-insert-result") {
    const outcome = String(parsed.outcome || "").trim().toUpperCase();
    const target = outcome === "TARGET_CONFIRMED";
    const unknown = outcome === "OUTCOME_UNKNOWN";
    if (!(target || unknown) || target &&
        (!parsed["firewall-readback"] || !parsed["provider-response"]) ||
        unknown && (parsed["firewall-readback"] || parsed["provider-response"])) {
      fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
        "TARGET_CONFIRMED requires exact provider-response and firewall-readback files; OUTCOME_UNKNOWN forbids both.");
    }
    parsed.outcome = outcome;
  }
  return { ...parsed, command };
}

function readJsonDocument(filePath, code, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path.resolve(filePath), "utf8"));
  } catch {
    fail(code, `${label} was not a readable JSON document.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(code, `${label} was not a JSON object.`);
  }
  return value;
}

function exactRequestFromDocument(document, {
  schemaVersion,
  wrapperKey,
  code,
  label,
}) {
  if (document.schemaVersion === schemaVersion) return document;
  const request = document[wrapperKey];
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      request.schemaVersion !== schemaVersion) {
    fail(code, `${label} had the wrong schema.`);
  }
  return request;
}

function writeSignedOutput(envelope, outputPath) {
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(path.resolve(outputPath), serialized, { mode: 0o600, flag: "wx" });
  }
  return serialized;
}

export async function runLocalVercelProviderAttester({
  requestPath,
  outputPath,
  vercelBinary,
  execFileImpl = execFileAsync,
  privateKeyLoader = readKeychainAttestationPrivateKey,
  now = Date.now(),
} = {}) {
  const document = readJsonDocument(
    requestPath,
    "STEP11_6_VERCEL_ATTESTER_REQUEST_INVALID",
    "The provider-attestation request file",
  );
  // The protected route emits a public wrapper. Accept that exact wrapper or
  // an already extracted request; never reconstruct challenge fields locally.
  const request = document?.providerAttestationRequest || document;
  if (request?.schemaVersion !== VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA) {
    fail("STEP11_6_VERCEL_ATTESTER_REQUEST_INVALID",
      "The provider-attestation request file had the wrong schema.");
  }
  const envelope = await createVercelProviderAttestation({
    request,
    privateKey: await privateKeyLoader({ execFileImpl }),
    readApi: createVercelCliReadApi({ vercelBinary, execFileImpl }),
    now,
  });
  return writeSignedOutput(envelope, outputPath);
}

export async function runLocalVercelWafProviderAttester({
  requestPath,
  firewallReadbackPath,
  outputPath,
  execFileImpl = execFileAsync,
  privateKeyLoader = readKeychainAttestationPrivateKey,
  now = Date.now(),
} = {}) {
  const document = readJsonDocument(
    requestPath,
    "STEP11_6_VERCEL_WAF_ATTESTER_REQUEST_INVALID",
    "The WAF provider-evidence request file",
  );
  const request = exactRequestFromDocument(document, {
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
    wrapperKey: "wafProviderEvidenceRequest",
    code: "STEP11_6_VERCEL_WAF_ATTESTER_REQUEST_INVALID",
    label: "The WAF provider-evidence request file",
  });
  const firewallPayload = readJsonDocument(
    firewallReadbackPath,
    "STEP11_6_VERCEL_WAF_ATTESTER_READBACK_INVALID",
    "The read-only WAF provider readback",
  );
  const envelope = createVercelWafProviderEvidence({
    request,
    firewallPayload,
    privateKey: await privateKeyLoader({ execFileImpl }),
    now,
  });
  return writeSignedOutput(envelope, outputPath);
}

export async function runLocalVercelWafRuleInsertResultAttester({
  requestPath,
  outcomeStatus,
  providerResponsePath,
  firewallReadbackPath,
  outputPath,
  execFileImpl = execFileAsync,
  privateKeyLoader = readKeychainAttestationPrivateKey,
  now = Date.now(),
} = {}) {
  const document = readJsonDocument(
    requestPath,
    "STEP11_6_VERCEL_WAF_RESULT_ATTESTER_REQUEST_INVALID",
    "The WAF rule-insert result request file",
  );
  const request = exactRequestFromDocument(document, {
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    wrapperKey: "wafRuleInsertDispatchResultRequest",
    code: "STEP11_6_VERCEL_WAF_RESULT_ATTESTER_REQUEST_INVALID",
    label: "The WAF rule-insert result request file",
  });
  const outcome = String(outcomeStatus || "").trim().toUpperCase();
  const target = outcome === "TARGET_CONFIRMED";
  const unknown = outcome === "OUTCOME_UNKNOWN";
  if (!(target || unknown) || target &&
      (!providerResponsePath || !firewallReadbackPath) ||
      unknown && (providerResponsePath || firewallReadbackPath)) {
    fail("STEP11_6_VERCEL_WAF_RESULT_ATTESTER_ARGUMENT_INVALID",
      "The signed rule-insert outcome files did not match its exact outcome.");
  }
  const providerResponse = target ? readJsonDocument(
    providerResponsePath,
    "STEP11_6_VERCEL_WAF_RESULT_ATTESTER_RESPONSE_INVALID",
    "The exact provider mutation response",
  ) : null;
  const firewallPayload = target ? readJsonDocument(
    firewallReadbackPath,
    "STEP11_6_VERCEL_WAF_RESULT_ATTESTER_READBACK_INVALID",
    "The read-only post-dispatch WAF readback",
  ) : null;
  const envelope = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: outcome,
    providerResponse,
    firewallPayload,
    privateKey: await privateKeyLoader({ execFileImpl }),
    now,
  });
  return writeSignedOutput(envelope, outputPath);
}

async function main() {
  try {
    const parsed = args(process.argv.slice(2));
    if (parsed.command === "install-keychain-signer") {
      const installed = await installKeychainAttestationSigner();
      process.stdout.write(`${JSON.stringify(installed, null, 2)}\n`);
      return;
    }
    const output = parsed.command === "attest"
      ? await runLocalVercelProviderAttester({
        requestPath: parsed.request,
        outputPath: parsed.output,
        vercelBinary: parsed["vercel-bin"] || undefined,
      })
      : parsed.command === "attest-waf"
        ? await runLocalVercelWafProviderAttester({
          requestPath: parsed.request,
          firewallReadbackPath: parsed["firewall-readback"],
          outputPath: parsed.output,
        })
        : await runLocalVercelWafRuleInsertResultAttester({
          requestPath: parsed.request,
          outcomeStatus: parsed.outcome,
          providerResponsePath: parsed["provider-response"],
          firewallReadbackPath: parsed["firewall-readback"],
          outputPath: parsed.output,
        });
    if (!parsed.output) process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${error?.code || "STEP11_6_VERCEL_ATTESTER_FAILED"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
