#!/usr/bin/env node

/**
 * Prepare the reviewed, one-time Production Odds input bootstrap envelope.
 *
 * This command is local-only: it reads certified Production artifacts and the
 * unchanged deterministic stats engine, then writes an owner-private JSON file.
 * It does not connect to Supabase or Google and cannot calculate/publish Odds.
 */

import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildProductionOddsInputBootstrap, productionOddsFingerprint } from
  "../lib/production-odds-input-bootstrap.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const shadowArtifactPath = option("--shadow-artifact");
const projectionsDir = option("--projections-dir");
const outputPath = option("--output");
const repositorySha = option("--repository-sha");

if (!shadowArtifactPath || !projectionsDir || !outputPath) {
  throw new Error(
    "Usage: step10b-prepare-production-odds-input.mjs "
      + "--shadow-artifact <production-shadow.json> "
      + "--projections-dir <production-projections-dir> "
      + "--output <owner-private.json> [--repository-sha <sha>]",
  );
}

const statsPath = new URL("../lib/stats.js", import.meta.url);
const [shadowArtifactText, predictionSettingsText, playerEditorialText, statsSource] =
  await Promise.all([
    readFile(path.resolve(shadowArtifactPath), "utf8"),
    readFile(path.join(path.resolve(projectionsDir), "prediction-settings.json"), "utf8"),
    readFile(path.join(path.resolve(projectionsDir), "player-editorial.json"), "utf8"),
    readFile(statsPath, "utf8"),
  ]);

const envelope = buildProductionOddsInputBootstrap({
  shadowArtifact: JSON.parse(shadowArtifactText),
  predictionSettingsEnvelope: JSON.parse(predictionSettingsText),
  playerEditorialEnvelope: JSON.parse(playerEditorialText),
  statsEngineSourceSha256: productionOddsFingerprint(statsSource, { serialized: true }),
  repositorySha,
});

const serialized = `${JSON.stringify(envelope)}\n`;
await writeFile(path.resolve(outputPath), serialized, { mode: 0o600 });
await chmod(path.resolve(outputPath), 0o600);

console.log(JSON.stringify({
  ok: true,
  output: path.resolve(outputPath),
  request_fingerprint: envelope.request_fingerprint,
  source_fingerprint: envelope.source_fingerprint,
  payload_fingerprint: envelope.payload_fingerprint,
  bundle_fingerprint: envelope.payload.bundle_fingerprint,
  ratings_fingerprint: envelope.payload.ratings_fingerprint,
  settings_fingerprint: envelope.payload.settings_fingerprint,
  effective_settings_fingerprint: envelope.payload.effective_settings_fingerprint,
  pairing_fingerprint: envelope.payload.pairing_fingerprint,
  diagnostics: envelope.diagnostics,
  network_requests: 0,
  google_writes: 0,
  calculations_run: 0,
  publications_created: 0,
}));
