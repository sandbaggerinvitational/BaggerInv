#!/usr/bin/env node

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prepareProductionPresentationShadowArtifact } from
  "../lib/production-presentation-shadow-cli-source.js";

const USAGE = [
  "Usage: prepare-production-presentation-shadow",
  "  --output <new-file.json>",
  "  --actor <audit-actor>",
  "  --current-shadow-import-run-id <uuid>",
  "  --current-shadow-source-fingerprint <sha256>",
  "  --current-shadow-database-fingerprint <sha256>",
].join(" ");

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      values.help = true;
      continue;
    }
    if (!token.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`Unsupported or incomplete argument: ${token}`);
    }
    values[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`${USAGE}\n`);
} else {
  for (const required of [
    "output", "actor", "current-shadow-import-run-id",
    "current-shadow-source-fingerprint", "current-shadow-database-fingerprint",
  ]) {
    if (!options[required]) throw new Error(`${USAGE}\nMissing --${required}.`);
  }
  const output = resolve(options.output);
  const artifact = await prepareProductionPresentationShadowArtifact({
    actor: options.actor,
    currentShadowEvidence: {
      importRunId: options["current-shadow-import-run-id"],
      sourceFingerprint: options["current-shadow-source-fingerprint"],
      databaseFingerprint: options["current-shadow-database-fingerprint"],
    },
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await chmod(output, 0o600);
  process.stdout.write(`${JSON.stringify({
    output,
    rpc: artifact.rpc,
    requestFingerprint: artifact.input.request_fingerprint,
    sourceFingerprint: artifact.input.source_fingerprint,
    payloadFingerprint: artifact.input.payload_fingerprint,
    gameCenterRows: artifact.diagnostics.game_center_rows,
    homeRosterPlayers: artifact.diagnostics.home_roster_players,
    googleReadsOnly: true,
    googleWrites: 0,
    supabaseRequests: 0,
  })}\n`);
}
