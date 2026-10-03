import { createHash, randomUUID } from "node:crypto";

import { certificationRequested } from "./canonical-resource-registration.js";
import { certificationWorkerContext } from "./certification-worker-adapter.js";
import { createCurrentScoreDerivedDeliveryAdapter } from "./score-derived-delivery.js";

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
  {
    calculatedBy = "Canonical scoring worker",
    mutationKey = "",
    matchId = "",
  } = {},
  { env = process.env, dependencies = {} } = {},
) {
  const suppliedTournamentId = clean(tournamentId);
  if (certificationRequested(env)) {
    const options = { env, certificationDependencies: dependencies.certificationDependencies };
    const context = await certificationWorkerContext(options);
    if (!suppliedTournamentId || suppliedTournamentId !== context.current_tournament_id ||
        suppliedTournamentId !== context.tournament_id) {
      const error = new Error("The Certification Calcutta tournament binding is unavailable.");
      error.code = "CERTIFICATION_CALCUTTA_TARGET_MISMATCH";
      error.status = 409;
      throw error;
    }
    // Reuse the required durable worker with this exact branded context. A
    // concurrent annual/release change must conflict, never rebind this hook.
    // Its normal tick materializes required families; only Calcutta is processed.
    const adapter = await createCurrentScoreDerivedDeliveryAdapter({
      ...options, scoringDispatchContext: context,
    });
    const workerId = "certification-calcutta-post-commit-worker";
    const tickResult = await adapter.tick({ workerId, operationId: randomUUID() });
    if (tickResult.scope?.tournamentId !== suppliedTournamentId) {
      const error = new Error("The Certification Calcutta worker target is unavailable.");
      error.code = "CERTIFICATION_CALCUTTA_TARGET_MISMATCH";
      error.status = 409;
      throw error;
    }
    if (tickResult.ready?.CALCUTTA !== true) {
      return { ok: true, skipped: true, reason: "NO_READY_CANONICAL_CALCUTTA_JOB" };
    }
    return adapter.processors.CALCUTTA({ workerId, operationId: randomUUID(), tickResult });
  }
  if (clean(env.VERCEL_ENV).toLowerCase() === "production") {
    const resolveMatch = dependencies.resolveProductionCalcuttaPostCommitMatch ||
      (await import("./production-calcutta-server.js"))
        .resolveProductionCalcuttaPostCommitMatch;
    const resolved = await resolveMatch({ matchId: clean(matchId) }, {
      env,
      dependencies,
    });
    const targetTournamentId = clean(resolved?.tournamentId);
    if (!targetTournamentId || (suppliedTournamentId &&
        suppliedTournamentId !== targetTournamentId)) {
      const error = new Error("The Production Calcutta tournament binding is unavailable.");
      error.code = "PRODUCTION_CALCUTTA_MATCH_TOURNAMENT_MISMATCH";
      error.status = 409;
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
