import { notFound } from "next/navigation";
import { participantIdentityAuthorityEnvironment } from "../../lib/participant-identity-authority.js";
import ParticipantAuthRehearsal from "./ParticipantAuthRehearsal.js";
import { participantAuthExperienceConfiguration } from "../../lib/participant-sms-auth-feature.js";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment.js";
import { privatePageMetadata } from "../../lib/seo.js";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Sign In · The Bagger");

export default async function ParticipantAuthPage() {
  let env;
  try { env = await applicationPageEnvironment(); }
  catch (error) {
    if (error?.code === "PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE") notFound();
    throw error;
  }
  const authority = participantIdentityAuthorityEnvironment(env);
  if (!authority.participantAuthEnabled) notFound();
  const configured = participantAuthExperienceConfiguration(env);
  const experience = authority.resolved === "supabase" ? configured : {
    ...configured,
    smsEnabled: false,
    defaultMethod: "email",
  };
  return <ParticipantAuthRehearsal experience={experience} />;
}
