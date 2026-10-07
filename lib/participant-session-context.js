import { certificationRequested } from "./canonical-resource-registration.js";
import { readCertificationSessionLinkStatus } from "./certification-runtime-server.js";
import { readParticipantIdentityContextForAuth } from "./participant-identity-supabase.js";
import { verifiedParticipantAuthSubject } from "./supabase-auth-server.js";

export async function readParticipantSessionContext(verified, {env = process.env} = {}, dependencies = {}) {
  if (certificationRequested(env)) {
    if (!await readCertificationSessionLinkStatus(verified, {env}, dependencies)) {
      return {payload:{ok:false, code:"ACTIVE_USER_PLAYER_LINK_REQUIRED"}};
    }
  }
  // A true link is not participant authority. Preserve every competitive guard.
  const authUserId = certificationRequested(env) ? verifiedParticipantAuthSubject(verified) : verified.claims.sub;
  return readParticipantIdentityContextForAuth({authUserId}, {env, certificationDependencies:dependencies});
}

export function participantSessionFailure(error, env = process.env) {
  if (!certificationRequested(env)) return null;
  const code = typeof error?.code === "string" && /^(?:CANONICAL_RESOURCE|CERTIFICATION)_[A-Z_0-9]+$/.test(error.code)
    ? error.code : "PARTICIPANT_CONTEXT_UNAVAILABLE";
  const status = [400,401,403,409,503].includes(error?.status) ? error.status : 503;
  return {code, status};
}
