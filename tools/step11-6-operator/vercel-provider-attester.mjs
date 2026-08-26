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
  createVercelProviderAttestation,
  pinnedEd25519PublicKeyBase64,
  VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
} from "../../lib/vercel-provider-attestation.js";

const execFileAsync = promisify(execFileCallback);
export const VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE =
  "com.baggerinv.step11-6.vercel-provider-attester";
export const VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT =
  "production-vercel-provider-attestation-ed25519-v1";
const SECURITY_BINARY = "/usr/bin/security";

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
    ], { encoding: "utf8", maxBuffer: 64 * 1024, windowsHide: true }));
  } catch {
    fail(
      "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_UNAVAILABLE",
      "The persistent Ed25519 signer was unavailable from the exact macOS Keychain item.",
    );
  }
  const key = String(stdout || "").trim();
  if (!key.includes("BEGIN PRIVATE KEY") || !key.includes("END PRIVATE KEY")) {
    fail(
      "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID",
      "The exact macOS Keychain item did not contain an Ed25519 PKCS8 key.",
    );
  }
  return key;
}

export async function installKeychainAttestationSigner({
  spawnImpl = spawnCallback,
  execFileImpl = execFileAsync,
} = {}) {
  try {
    const existingPem = await readKeychainAttestationPrivateKey({ execFileImpl });
    const existingPrivateKey = createPrivateKey(existingPem);
    if (existingPrivateKey.asymmetricKeyType !== "ed25519") throw new Error("not-ed25519");
    const publicKeyBase64 = pinnedEd25519PublicKeyBase64(
      createPublicKey(existingPrivateKey),
    );
    return Object.freeze({
      service: VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
      account: VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
      publicKeyBase64,
      signerKeyFingerprint: createHash("sha256")
        .update(Buffer.from(publicKeyBase64, "base64")).digest("hex"),
      recovered: true,
    });
  } catch (error) {
    if (error?.code !== "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_UNAVAILABLE") {
      fail("STEP11_6_VERCEL_ATTESTER_KEYCHAIN_KEY_INVALID",
        "The existing macOS Keychain signer could not be verified as Ed25519.");
    }
  }
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKeyBase64 = pinnedEd25519PublicKeyBase64(pair.publicKey);
  await new Promise((resolve, reject) => {
    const child = spawnImpl(SECURITY_BINARY, [
      "add-generic-password",
      "-a", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
      "-s", VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
      "-l", "BaggerInv Step 11.6 Vercel provider attester Ed25519 key",
      // Per `security help add-generic-password`, -w last reads the password
      // interactively. The key is sent over stdin, never argv/stdout/a file.
      "-w",
    ], { stdio: ["pipe", "ignore", "ignore"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("keychain")));
    child.stdin.end(`${privatePem}\n`);
  }).catch(() => fail(
    "STEP11_6_VERCEL_ATTESTER_KEYCHAIN_INSTALL_FAILED",
    "The one-time macOS Keychain signer installation did not complete.",
  ));
  return Object.freeze({
    service: VERCEL_PROVIDER_ATTESTER_KEYCHAIN_SERVICE,
    account: VERCEL_PROVIDER_ATTESTER_KEYCHAIN_ACCOUNT,
    publicKeyBase64,
    signerKeyFingerprint: createHash("sha256")
      .update(Buffer.from(publicKeyBase64, "base64")).digest("hex"),
    recovered: false,
  });
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
  if (!new Set(["attest", "install-keychain-signer"]).has(argv[0])) {
    fail("STEP11_6_VERCEL_ATTESTER_COMMAND_INVALID",
      "Expected attest or install-keychain-signer.");
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
    if (!new Set(["request", "output", "vercel-bin"]).has(name) ||
        Object.prototype.hasOwnProperty.call(parsed, name)) {
      fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID", "An attester argument was not allowed.");
    }
    parsed[name] = value;
  }
  if (!parsed.request) {
    fail("STEP11_6_VERCEL_ATTESTER_ARGUMENT_INVALID",
      "--request is required.");
  }
  return { ...parsed, command: "attest" };
}

export async function runLocalVercelProviderAttester({
  requestPath,
  outputPath,
  vercelBinary,
  execFileImpl = execFileAsync,
  privateKeyLoader = readKeychainAttestationPrivateKey,
  now = Date.now(),
} = {}) {
  const document = JSON.parse(readFileSync(path.resolve(requestPath), "utf8"));
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
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(path.resolve(outputPath), serialized, { mode: 0o600, flag: "wx" });
  }
  return serialized;
}

async function main() {
  try {
    const parsed = args(process.argv.slice(2));
    if (parsed.command === "install-keychain-signer") {
      const installed = await installKeychainAttestationSigner();
      process.stdout.write(`${JSON.stringify(installed, null, 2)}\n`);
      return;
    }
    const output = await runLocalVercelProviderAttester({
      requestPath: parsed.request,
      outputPath: parsed.output,
      vercelBinary: parsed["vercel-bin"] || undefined,
    });
    if (!parsed.output) process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${error?.code || "STEP11_6_VERCEL_ATTESTER_FAILED"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
