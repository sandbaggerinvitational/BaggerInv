import { notFound } from "next/navigation";
import { participantIdentityAuthorityEnvironment } from "../../lib/participant-identity-authority.js";
import ParticipantAuthRehearsal from "./ParticipantAuthRehearsal.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview Participant Sign-In", robots: { index: false, follow: false } };

export default function ParticipantAuthPage() {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.participantAuthEnabled) notFound();
  return <ParticipantAuthRehearsal />;
}
