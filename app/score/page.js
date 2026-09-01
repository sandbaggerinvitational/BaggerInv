import { privatePageMetadata } from "../../lib/seo";
import { requireParticipantIdentityAuthority } from "../../lib/participant-identity-authority";
import ScoreEntry from "./ScoreEntry";
import PreviewModeBadge from "../PreviewModeBadge";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";
import { productionShadowCandidateReadEnvironment } from "../../lib/production-shadow-candidate";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Enter Live Scores | Sandbagger Invitational");

export default async function ScorePage() {
  const env = await applicationPageEnvironment();
  const previewMode = process.env.VERCEL_ENV === "preview";
  const participantIdentityAuthority = requireParticipantIdentityAuthority(env).resolved;
  const productionShadowReadOnly = productionShadowCandidateReadEnvironment(env).eligible;
  return <main><PreviewModeBadge visible={previewMode} /><ScoreEntry
    localFirstEnabled={previewMode && !productionShadowReadOnly}
    participantIdentityAuthority={participantIdentityAuthority}
    scoringReadOnly={productionShadowReadOnly}
  /></main>;
}
