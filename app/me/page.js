import { privatePageMetadata } from "../../lib/seo";
import PreviewModeBadge from "../PreviewModeBadge";
import ParticipantProfile from "./ParticipantProfile";
import { requireParticipantIdentityAuthority } from "../../lib/participant-identity-authority";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Me | Sandbagger Invitational");

export default async function MePage() {
  const env = await applicationPageEnvironment();
  const participantIdentityAuthority = requireParticipantIdentityAuthority(env).resolved;
  return <main>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} compact />
    <ParticipantProfile participantIdentityAuthority={participantIdentityAuthority} />
  </main>;
}
