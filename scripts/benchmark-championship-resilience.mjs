import { logicalOddsResult } from "../lib/championship-odds-supabase.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";
import { createTournamentOddsCheckpoint, executeTournamentOddsChunk, finalizeTournamentOddsExecution, simulateTournamentOdds } from "../lib/tournament-odds.js";
import {
  championshipOddsResilienceFixture,
  RESILIENCE_PHASE,
  RESILIENCE_PUBLISHED_AT,
  RESILIENCE_REFERENCE_FINGERPRINTS,
} from "../test/fixtures/championship-odds-resilience.mjs";

const resilient = process.argv.includes("--resilient");
const chunkArgument = process.argv.find((value) => value.startsWith("--chunk="));
const chunkIterations = Number(chunkArgument?.split("=")[1] || 2_500);
const counts = process.argv.slice(2).filter((value) => !value.startsWith("--")).map(Number).filter(Number.isFinite);
const iterations = counts.length ? counts : [10_000, 25_000, 50_000, 100_000];
const fixture = championshipOddsResilienceFixture();

for (const count of iterations) {
  if (global.gc) global.gc();
  const before = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const started = performance.now();
  const calculation = { ...fixture, phase: RESILIENCE_PHASE, iterations: count };
  let checkpoints = 0;
  let result;
  if (resilient) {
    let checkpoint = createTournamentOddsCheckpoint(calculation);
    while (checkpoint.completedIterations < count) {
      checkpoint = JSON.parse(JSON.stringify(executeTournamentOddsChunk({ ...calculation, checkpoint, chunkIterations })));
      checkpoints += 1;
    }
    result = finalizeTournamentOddsExecution({ ...calculation, checkpoint, publishedAt: RESILIENCE_PUBLISHED_AT });
  } else {
    result = simulateTournamentOdds({ ...calculation, publishedAt: RESILIENCE_PUBLISHED_AT });
  }
  const wallMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuBefore);
  const after = process.memoryUsage();
  const fingerprint = scoringShadowPayloadHash(logicalOddsResult(result));
  console.log(JSON.stringify({
    iterations: count,
    mode: resilient ? "resilient" : "reference",
    chunkIterations: resilient ? chunkIterations : count,
    checkpoints,
    fingerprint,
    referenceFingerprint: RESILIENCE_REFERENCE_FINGERPRINTS[count] || null,
    exactReferenceEquality: !RESILIENCE_REFERENCE_FINGERPRINTS[count] || fingerprint === RESILIENCE_REFERENCE_FINGERPRINTS[count],
    wallMs: Number(wallMs.toFixed(3)),
    cpuMs: Number(((cpu.user + cpu.system) / 1_000).toFixed(3)),
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    rssBytes: after.rss,
  }));
}
