import { isCanonicalReviewer, requireReviewerRead } from './mobile-reviewer-identity.js';
import { MobileApiError } from "./mobile-api-v1.js";
import { requireOpaqueMatchID } from "./mobile-opaque-match-id.js";
import { authorizeMatchAccess } from "./match-authorization-supabase.js";
import { readGameCenterView } from "./game-center-supabase.js";
import { requireMobileProductionReadContext } from "./mobile-v1-production-read-context.js";

const clean = (value) => String(value ?? "").trim();

// The existing Production dispatch translates both reads and validates the
// current pointer. No Preview RPC or alternate scoring authorization is added.
async function loadProductionMatchDetail(identity, matchId, {
  env = process.env, dependencies = {},
} = {}) {
  const runtime = await requireMobileProductionReadContext(identity, { env, dependencies });
  const id = requireOpaqueMatchID(matchId);
  const scope = { tournamentId: identity.tournamentId, playerId: identity.playerId,
    matchId: id, action: "VIEW_GAME_CENTER" };
  const observer=isCanonicalReviewer(identity.context);
  if(observer) requireReviewerRead(identity.context,{surface:"match-detail",matchId:id});
  const decision = observer ? null : (await (dependencies.authorizeMatchAccess || authorizeMatchAccess)(scope, { env }))?.payload;
  // The shared decision also serves scoring and intentionally requires match
  // assignment. For this read only, its exact non-assignee result proves that
  // the match exists in scope and the viewer's tournament membership is active.
  // Do not reinterpret any other denial or change the shared scoring decision.
  const unassignedReader = !observer && decision?.allowed === false &&
    decision.code === "NOT_MATCH_PARTICIPANT" && decision.membership_active === true &&
    decision.participant_membership === false && decision.read_only === true;
  if (!observer && ((decision?.allowed !== true && !unassignedReader) || clean(decision.player_id) !== scope.playerId ||
      clean(decision.tournament_id) !== scope.tournamentId || clean(decision.match_id) !== id ||
      decision.action !== scope.action)) throw new MobileApiError("PARTICIPANT_NOT_FOUND");
  const read = await (dependencies.readGameCenterView || readGameCenterView)(id, {
    env, tournamentId: scope.tournamentId,
  });
  const raw = read?.payload?.data;
  if (read?.payload?.ok !== true || !raw || clean(raw.tournament?.tournament_id) !== scope.tournamentId ||
      clean(raw.match?.tournament_id) !== scope.tournamentId || clean(raw.match?.match_id) !== id ||
      !Array.isArray(raw.participants) || (!observer &&
        raw.participants.some((p) => clean(p.player_id) === scope.playerId) === unassignedReader)) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  if(observer && (raw.match.status!=="FINAL" || raw.match.scorecard_complete!==true)) throw new MobileApiError("PARTICIPANT_NOT_FOUND");
  // Revalidate after the read: a pointer change cannot publish an old context.
  await requireMobileProductionReadContext(identity, { env, dependencies, expectedRuntime: runtime });
  return { payload: { ...raw, ok: true,
    participants: raw.participants.map((p) => ({ ...p,
      is_authenticated_player: clean(p.player_id) === scope.playerId })),
    navigation: {
      round_match_index: raw.navigation?.position?.index,
      round_match_count: raw.navigation?.position?.total,
      previous_match_id: raw.navigation?.previous?.id ?? null,
      next_match_id: raw.navigation?.next?.id ?? null,
      my_match_id: observer || unassignedReader ? null : id,
      is_my_match: !observer && !unassignedReader,
    },
  } };
}

export async function readMobileProductionMatchDetail(identity, matchId, options = {}) {
  try { return await loadProductionMatchDetail(identity, matchId, options); }
  catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
}
