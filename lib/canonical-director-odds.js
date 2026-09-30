import { isolatedCanonicalDatabaseEnvironment } from "./canonical-runtime-source.js";
import { publicOddsCalculationJob, requestCanonicalOddsCalculation,
  readPublishableOddsCalculation, markOddsCalculationPublished } from "./championship-odds-resilience.js";
import { buildSupabaseOddsPublication, publishSupabaseOddsSnapshot, logicalOddsResult } from "./championship-odds-supabase.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { readPublishedOddsView } from "./published-odds-supabase.js";
import { ODDS_PHASES, ODDS_SUPPORTED_ITERATION_COUNTS, validateOpeningMatchups, validateRoundThreePairings } from "./tournament-odds.js";

const clean = value => String(value ?? "").trim();
const failure = (code, status = 503) => Object.assign(new Error("Canonical Odds operation could not be confirmed."), { code, status });
function scope(authorization, env) {
  if (!isolatedCanonicalDatabaseEnvironment(env).eligible || authorization?.status !== "active" ||
      authorization?.source !== "entitlement" || authorization.identity?.actor?.role !== "DIRECTOR" ||
      authorization.identity?.impersonating === true || !clean(authorization.identity?.authUserId) ||
      !clean(authorization.identity?.tournamentId)) throw failure("DIRECTOR_ODDS_AUTHORIZATION_REQUIRED", 403);
  return { tournamentId: authorization.identity.tournamentId, actorId: authorization.identity.actor.id };
}
const readCurrentJobs = (tournamentId, jobId, env) => scoringShadowRpc("read_preview_director_odds_jobs_v1", { target_tournament_id: tournamentId, target_job_id: jobId }, { env });
export async function readCanonicalDirectorOdds({ authorization, jobId, env = process.env } = {}, dependencies = {}) {
  const { tournamentId } = scope(authorization, env);
  if (jobId && !/^[a-f0-9]{64}$/.test(jobId)) throw failure("DIRECTOR_ODDS_INPUT_INVALID", 400);
  const state = await (dependencies.readJobs || readCurrentJobs)(tournamentId, jobId || null, env);
  if (!state.payload?.ok || state.payload.contract !== "preview-director-odds-v1" || state.payload.google_runtime !== "RETIRED") throw failure("DIRECTOR_ODDS_STATE_UNAVAILABLE");
  if ((state.payload.jobs || []).some(job => job.tournament_id !== tournamentId)) throw failure("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  return { ok: true, authority: "supabase", jobs: (state.payload.jobs || []).map(publicOddsCalculationJob) };
}
export async function mutateCanonicalDirectorOdds({ authorization, input, env = process.env } = {}, dependencies = {}) {
  const { tournamentId, actorId } = scope(authorization, env);
  // Fail closed before writing unless the installed isolated schema has retired delivery.
  await readCanonicalDirectorOdds({ authorization, env, jobId: input?.action === "publish" ? input.jobId : null }, dependencies);
  if (input?.action === "calculate") {
    if (!ODDS_PHASES.includes(input.phase) || !ODDS_SUPPORTED_ITERATION_COUNTS.includes(input.iterations)) throw failure("DIRECTOR_ODDS_INPUT_INVALID", 400);
    const requested = await (dependencies.requestCalculation || requestCanonicalOddsCalculation)({ tournamentId,
      phase: input.phase, iterations: input.iterations, requestedBy: actorId });
    return { ok: true, accepted: true, jobId: requested.invocation.job_id, publicationCreated: false };
  }
  if (input?.action !== "publish" || !/^[a-f0-9]{64}$/.test(input.jobId || "") || input.confirmPublication !== true) throw failure("DIRECTOR_ODDS_INPUT_INVALID", 400);
  const prepared = await (dependencies.readPublishable || readPublishableOddsCalculation)({ tournamentId, jobId: input.jobId });
  if (prepared.job.tournament_id !== tournamentId || String(prepared.snapshot.year) !== tournamentId) throw failure("DIRECTOR_ODDS_SCOPE_MISMATCH", 403);
  const opening = validateOpeningMatchups(prepared.currentInputs.sheets);
  if (!opening.ready || (["Round 3 Pairings Announced", "Final Results"].includes(prepared.job.phase) &&
      !validateRoundThreePairings(prepared.currentInputs.sheets).ready)) throw failure("DIRECTOR_ODDS_PAIRINGS_NOT_READY", 409);
  const command = buildSupabaseOddsPublication({ snapshot: prepared.snapshot, tournamentId, actorId, metadata: prepared.currentInputs.metadata });
  const publication = await (dependencies.publish || publishSupabaseOddsSnapshot)(command);
  if (!publication.payload?.ok) throw failure(publication.payload?.code || "DIRECTOR_ODDS_PUBLICATION_REJECTED", 409);
  const snapshotId = publication.payload.snapshot_id;
  let canonicalSnapshot;
  try {
    const marked = await (dependencies.markPublished || markOddsCalculationPublished)(input.jobId, { snapshot_id: snapshotId });
    if (!marked.payload?.ok) throw failure("DIRECTOR_ODDS_READBACK_UNCONFIRMED");
    const readback = await (dependencies.readPublished || readPublishedOddsView)({ tournamentId });
    const snapshots = readback.payload?.data?.snapshots || [];
    const canonical = snapshots.find(row => row.milestone === command.milestone && row.publication_verified === true &&
      row.source_fingerprint === command.source_fingerprint && scoringShadowPayloadHash(logicalOddsResult(row.payload)) === command.logical_payload_hash);
    if (!readback.payload?.ok || !canonical) throw failure("DIRECTOR_ODDS_READBACK_UNCONFIRMED");
    canonicalSnapshot = canonical.payload;
  } catch {
    throw Object.assign(failure("DIRECTOR_ODDS_READBACK_UNCONFIRMED"), { committed: true, jobId: input.jobId });
  }
  return { ok: true, authority: "supabase", publicationCreated: true, snapshotId, duplicate: publication.payload.duplicate === true, snapshot: canonicalSnapshot };
}
