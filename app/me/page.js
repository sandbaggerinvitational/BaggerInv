import { privatePageMetadata } from "../../lib/seo";
import PreviewModeBadge from "../PreviewModeBadge";
import ParticipantProfile from "./ParticipantProfile";
import { requireParticipantIdentityAuthority } from "../../lib/participant-identity-authority";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Me | Sandbagger Invitational");

export default function MePage() {
  const participantIdentityAuthority = requireParticipantIdentityAuthority().resolved;
  return <main>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <ParticipantProfile participantIdentityAuthority={participantIdentityAuthority} />
  </main>;
}
