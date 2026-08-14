import { notFound } from "next/navigation";
import { privatePageMetadata } from "../../lib/seo";
import { liveTournamentV2Enabled } from "../../lib/spreadsheet-environment";
import { requireParticipantIdentityAuthority } from "../../lib/participant-identity-authority";
import PreviewModeBadge from "../PreviewModeBadge";
import ScoreEntry from "../score/ScoreEntry";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("My Match | Sandbagger Invitational");

export default function MyMatchPage() {
  if (!liveTournamentV2Enabled()) notFound();
  const previewMode = process.env.VERCEL_ENV === "preview";
  const participantIdentityAuthority = requireParticipantIdentityAuthority().resolved;
  return <main><PreviewModeBadge visible={previewMode} /><ScoreEntry dashboardOnly localFirstEnabled={previewMode} participantIdentityAuthority={participantIdentityAuthority} /></main>;
}
