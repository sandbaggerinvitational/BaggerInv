// Isolated Director reads use the same canonical tournament view as participant
// reads. No resource/activation identity is rewritten to enter Production APIs.
import { isolatedCanonicalDatabaseEnvironment } from "./canonical-runtime-source.js";
import { scoringShadowRpc } from "./scoring-shadow.js";
import { readCanonicalScoringAuthority, finalizeCanonicalMatch, reopenCanonicalMatch } from "./scoring-authority-supabase.js";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "./tournament-live-supabase.js";
import { certificationRequested, certificationResourceEnvironment } from "./canonical-resource-registration.js";
import { certificationOperationRpc } from "./certification-runtime-server.js";

export const CANONICAL_DIRECTOR_OVERVIEW_CONTRACT = "canonical-director-overview-v1";
const clean = (value) => String(value ?? "").trim();
function unavailable(code, status = 503) {
  return Object.assign(new Error("Canonical Director data is unavailable."), { code, status });
}
function isolatedEnvironment(env, dependencies) {
  return certificationRequested(env) ? certificationResourceEnvironment(env, dependencies.certificationDependencies) : isolatedCanonicalDatabaseEnvironment(env);
}
async function capabilities(authorization, env, dependencies) {
  if (!certificationRequested(env)) return (dependencies.scoringShadowRpc || scoringShadowRpc)("read_preview_director_capabilities_v1", {}, {env});
  // Installed canonical read + DB Director authorization is required before
  // advertising the already-supported finalization controls.
  const {readIsolatedDirectorOperations} = await import("./isolated-director-operations.js");
  await readIsolatedDirectorOperations({authorization, family:"MATCH_CONTROL", env}, {certificationDependencies:dependencies.certificationDependencies});
  return {payload:{ok:true,contract:"preview-director-canonical-controls-v1",google_runtime:"RETIRED",actions:["finalize","reopen"]}};
}

export async function readIsolatedCanonicalDirectorOverview({ authorization, env = process.env } = {}, dependencies = {}) {
  if (!isolatedEnvironment(env, dependencies).eligible) throw unavailable("DIRECTOR_CANONICAL_AUTHORITY_REQUIRED", 403);
  const identity = authorization?.identity;
  if (authorization?.status !== "active" || authorization?.source !== "entitlement" ||
      !clean(identity?.authUserId) || identity?.actor?.role !== "DIRECTOR" || identity?.impersonating === true) {
    throw unavailable("DIRECTOR_AUTHORIZATION_REQUIRED", 403);
  }
  const tournamentId = clean(identity.tournamentId);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tournamentId)) throw unavailable("DIRECTOR_TOURNAMENT_SCOPE_REQUIRED", 403);
  const read = dependencies.readTournamentLiveView || readTournamentLiveView;
  const current = await read(tournamentId, { env, certificationDependencies:dependencies.certificationDependencies });
  const view = current?.payload?.data;
  if (current?.payload?.ok !== true || !view?.tournament) throw unavailable("DIRECTOR_CANONICAL_READ_UNAVAILABLE");
  if (clean(view.tournament.tournament_id) !== tournamentId ||
      (view.matches || []).some((entry) => clean(entry.match?.tournament_id) !== tournamentId)) {
    throw unavailable("DIRECTOR_CANONICAL_SCOPE_MISMATCH");
  }
  const projected = tournamentLiveDataFromSupabaseView(view);
  const capabilityRead = await capabilities(authorization, env, dependencies);
  const capability = capabilityRead?.payload;
  if (capability?.ok !== true || capability.contract !== "preview-director-canonical-controls-v1" || capability.google_runtime !== "RETIRED") {
    throw unavailable("DIRECTOR_CANONICAL_CAPABILITIES_UNAVAILABLE");
  }
  return {
    contract: CANONICAL_DIRECTOR_OVERVIEW_CONTRACT,
    authority: "supabase", fallbackUsed: false, googleRequests: 0,
    tournament: projected.tournament,
    rounds: projected.rounds.map((round) => ({ ...round, matches: round.matches.map((match) => {
      const current = view.matches.find((entry) => entry.match?.match_id === match.id)?.match || {};
      return { ...match, matchRevision: current.match_revision, permissionRevision: current.permission_revision,
        scorecardComplete: current.scorecard_complete === true, scoringLocked: current.scoring_locked === true };
    }) })),
    revision: projected.revision,
    // Do not advertise Production-only operations or infer permission from a
    // display row. Those operations retain their own authenticated contracts.
    capabilities: { currentRead: true, matchControls: true, actions: ["finalize", "reopen"], setupAuthoring: false,
      reason: "EXPLICIT_CANONICAL_CAPABILITIES" },
    workerHealth: { status: "NOT_OBSERVED" },
  };
}

export async function mutateIsolatedCanonicalDirectorMatch({ authorization, input, env = process.env } = {}, dependencies = {}) {
  if (!isolatedEnvironment(env, dependencies).eligible || authorization?.status !== "active" ||
      authorization?.source !== "entitlement" || authorization?.identity?.actor?.role !== "DIRECTOR" ||
      authorization?.identity?.impersonating === true || !clean(authorization?.identity?.authUserId)) {
    throw unavailable("DIRECTOR_AUTHORIZATION_REQUIRED", 403);
  }
  const action = clean(input?.action);
  const matchId = clean(input?.matchId);
  const key = clean(input?.operationRequestId);
  if (!["finalize", "reopen"].includes(action) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(matchId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key) ||
      !Number.isSafeInteger(input?.expectedMatchRevision) || input.expectedMatchRevision < 0 ||
      !Number.isSafeInteger(input?.expectedPermissionRevision) || input.expectedPermissionRevision < 1) {
    throw unavailable("DIRECTOR_CANONICAL_INPUT_INVALID", 400);
  }
  const read = dependencies.readCanonicalScoringAuthority || readCanonicalScoringAuthority;
  const transportOptions = {env, certificationDependencies:dependencies.certificationDependencies};
  const mutate = action === "finalize" ? dependencies.finalizeCanonicalMatch || finalizeCanonicalMatch
    : dependencies.reopenCanonicalMatch || reopenCanonicalMatch;
  const command = { match_id: matchId, mutation_key: key, expected_match_revision: input.expectedMatchRevision,
    authorization: { passport_verified: true, role: "DIRECTOR", auth_user_id: authorization.identity.authUserId,
      player_id: authorization.identity.actor.id, tournament_id: authorization.identity.tournamentId,
      match_id: matchId, permission_revision: input.expectedPermissionRevision } };
  const {authorization: actor, ...statusPayload} = command;
  // Exact origin recovery precedes gates for a new mutation. A committed retry
  // cannot be made ambiguous merely because Lock/annual advance closed ingress.
  let status, match;
  if (certificationRequested(env)) status = await certificationOperationRpc("SCORING.READ_DIRECTOR_OPERATION_STATUS", {...statusPayload,action},
    {env,authorization:actor,operationRequestId:key}, dependencies.certificationDependencies);
  if (status?.payload?.committed !== true) {
    const capabilityRead = await capabilities(authorization, env, dependencies);
    if (capabilityRead?.payload?.contract !== "preview-director-canonical-controls-v1" ||
        capabilityRead?.payload?.google_runtime !== "RETIRED" || !capabilityRead?.payload?.actions?.includes(action)) {
      throw unavailable("DIRECTOR_CANONICAL_CAPABILITIES_UNAVAILABLE");
    }
    const before = await read({ mode: "MATCH", match_id: matchId }, transportOptions);
    match = before?.payload?.data;
    if (before?.payload?.ok !== true || match?.tournament_id !== authorization.identity.tournamentId || match?.match_id !== matchId) {
      throw unavailable("DIRECTOR_CANONICAL_SCOPE_MISMATCH", 403);
    }
    if (!status) status = await (dependencies.scoringShadowRpc || scoringShadowRpc)("read_preview_director_operation_v1", {
      input: { ...command, action },
    }, { env });
  }
  if (status?.payload?.ok !== true) throw unavailable("DIRECTOR_CANONICAL_OPERATION_CONFLICT", 409);
  const result = status.payload.committed === true ? { payload: status.payload.receipt } : await mutate(command, transportOptions);
  if (result?.payload?.ok !== true) throw Object.assign(unavailable("DIRECTOR_CANONICAL_OPERATION_REJECTED", 409),
    { operationCode: /^[A-Z_]{3,100}$/.test(result?.payload?.code || "") ? result.payload.code : "OPERATION_REJECTED" });
  let after;
  try { after = await read({ mode: "MATCH", match_id: matchId }, transportOptions); }
  catch {
    throw Object.assign(unavailable("DIRECTOR_CANONICAL_READBACK_UNCONFIRMED"), { committed: true, operationRequestId: key });
  }
  const state = after?.payload?.data;
  if (after?.payload?.ok !== true || state?.tournament_id !== (match?.tournament_id || authorization.identity.tournamentId) ||
      state?.match_id !== matchId || state.match_revision < result.payload.match_revision ||
      (state.match_revision === result.payload.match_revision && state.status !== (action === "finalize" ? "FINAL" : "LIVE"))) {
    throw Object.assign(unavailable("DIRECTOR_CANONICAL_READBACK_UNCONFIRMED"), { committed: true, operationRequestId: key });
  }
  return { ok: true, authority: "supabase", fallbackUsed: false, googleRequests: 0, receipt: result.payload,
    canonical: { matchId, status: state.status, matchRevision: state.match_revision, permissionRevision: state.permission_revision } };
}
