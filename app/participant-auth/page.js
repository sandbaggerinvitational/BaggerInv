import { notFound } from "next/navigation";
import { participantIdentityAuthorityEnvironment } from "../../lib/participant-identity-authority.js";
import ParticipantAuthRehearsal from "./ParticipantAuthRehearsal.js";
import { participantAuthExperienceConfiguration } from "../../lib/participant-sms-auth-feature.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign In · The Bagger", robots: { index: false, follow: false } };

export default function ParticipantAuthPage() {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.participantAuthEnabled) notFound();
  const configured = participantAuthExperienceConfiguration();
  const experience = authority.resolved === "supabase" ? configured : {
    ...configured,
    smsEnabled: false,
    defaultMethod: "email",
  };
  return <ParticipantAuthRehearsal experience={experience} />;
}
