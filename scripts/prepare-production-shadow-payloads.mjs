#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prepareProductionShadowPayloadArtifact } from "../lib/production-shadow-payload-cli-source.js";

const USAGE = "Usage: prepare-production-shadow-payloads --output <new-file.json> --actor <director-id>";

function args(argv) {
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

const options = args(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`${USAGE}\n`);
} else {
  if (!options.output || !options.actor) {
    throw new Error(USAGE);
  }
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  const artifact = await prepareProductionShadowPayloadArtifact({ actorId: options.actor });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    output,
    artifactFingerprint: artifact.artifact_fingerprint,
    completedHistoryYears: artifact.completed_history.length,
    currentCounts: artifact.current_tournament.counts,
    remoteWrites: 0,
    authorizationEmbedded: false,
  })}\n`);
}
