import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";
import { MobileApiError } from "./mobile-api-v1.js";
import { scoringShadowRpc } from "./scoring-shadow.js";

export const MOBILE_PARTICIPANT_CONTENT_SCOPES = Object.freeze([
  "HISTORY_ARCHIVE",
  "COMPLETED_HISTORY_BUNDLE",
  "ODDS",
]);

const SCOPE_SET = new Set(MOBILE_PARTICIPANT_CONTENT_SCOPES);
const clean = (value) => String(value ?? "").trim();

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

/**
 * One service-mediated, participant-bound Preview RPC for bounded secondary
 * content. The RPC owns tournament membership and never accepts a native
 * Player/tournament override; those values come only from verified identity.
 */
export async function readMobilePreviewParticipantContent(
  scope,
  identity = {},
  { env = process.env, dependencies = {}, timeoutMs = 20_000 } = {},
) {
  const authority = mobileNativeDevelopmentAuthorityEnvironment(env);
  const normalizedScope = clean(scope).toUpperCase();
  const tournamentId = clean(identity.tournamentId);
  const playerId = clean(identity.playerId);
  if (!authority.available || authority.environment !== "preview" ||
      !SCOPE_SET.has(normalizedScope) || !tournamentId || !playerId) {
    throw unavailable();
  }
  const rpc = dependencies.scoringShadowRpc || scoringShadowRpc;
  let read;
  try {
    read = await rpc("read_preview_mobile_participant_content_v1", {
      input: {
        environment: "PREVIEW",
        tournament_id: tournamentId,
        player_id: playerId,
        scope: normalizedScope,
      },
    }, { env, timeoutMs });
  } catch {
    throw unavailable();
  }
  if (!read?.payload?.ok || !read.payload.data ||
      clean(read.payload.data.scope).toUpperCase() !== normalizedScope) {
    throw unavailable();
  }
  return read;
}
