import { notFound } from "next/navigation";
import { privatePageMetadata } from "../../lib/seo";
import { liveTournamentV2Enabled } from "../../lib/spreadsheet-environment";
import { requireParticipantIdentityAuthority } from "../../lib/participant-identity-authority";
import PreviewModeBadge from "../PreviewModeBadge";
import ScoreEntry from "../score/ScoreEntry";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";
import { productionShadowCandidateReadEnvironment } from "../../lib/production-shadow-candidate";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("My Match | Sandbagger Invitational");

export default async function MyMatchPage() {
  if (!liveTournamentV2Enabled()) notFound();
  const env = await applicationPageEnvironment();
  const previewMode = process.env.VERCEL_ENV === "preview";
  const participantIdentityAuthority = requireParticipantIdentityAuthority(env).resolved;
  const productionShadowReadOnly = productionShadowCandidateReadEnvironment(env).eligible;
  return <main><PreviewModeBadge visible={previewMode} /><ScoreEntry
    dashboardOnly
    localFirstEnabled={previewMode && !productionShadowReadOnly}
    participantIdentityAuthority={participantIdentityAuthority}
    scoringReadOnly={productionShadowReadOnly}
  /></main>;
}
