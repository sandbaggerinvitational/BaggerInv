import { createHash, randomUUID } from "node:crypto";

import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();

function invocationFingerprint({ tournamentId, calculatedBy, mutationKey }) {
  return createHash("sha256").update([
    "production-calcutta-v1-post-commit",
    clean(tournamentId) || PRODUCTION_TOURNAMENT_ID,
    clean(calculatedBy) || "Canonical scoring worker",
    clean(mutationKey) || randomUUID(),
  ].join("\n")).digest("hex");
}

/**
 * Environment-selected post-commit worker. Production consumes only the
 * canonical V1 queue populated by the scoring transaction triggers. Preview
 * retains its existing operational calculator and Preview-only RPCs.
 */
export async function recalculateCalcuttaAfterCanonicalMutation(
  tournamentId,
  { calculatedBy = "Canonical scoring worker", mutationKey = "" } = {},
  { env = process.env, dependencies = {} } = {},
) {
  const targetTournamentId = clean(tournamentId) || PRODUCTION_TOURNAMENT_ID;
  if (clean(env.VERCEL_ENV).toLowerCase() === "production") {
    if (targetTournamentId !== PRODUCTION_TOURNAMENT_ID) {
      const error = new Error("The Production Calcutta tournament binding is unavailable.");
      error.code = "PRODUCTION_CALCUTTA_TOURNAMENT_REQUIRED";
      error.status = 503;
      throw error;
    }
    const drain = dependencies.drainCurrentProductionCalcuttaV1Jobs ||
      (await import("./production-calcutta-server.js")).drainCurrentProductionCalcuttaV1Jobs;
    return drain({
      workerId: "production-calcutta-v1-post-commit-worker",
      requestFingerprint: invocationFingerprint({
        tournamentId: targetTournamentId,
        calculatedBy,
        mutationKey,
      }),
    }, { env, dependencies });
  }

  const recalculate = dependencies.recalculatePreviewCalcuttaTournament ||
    (await import("./calcutta-supabase.js")).recalculateCalcuttaTournament;
  return recalculate(tournamentId, { calculatedBy });
}
