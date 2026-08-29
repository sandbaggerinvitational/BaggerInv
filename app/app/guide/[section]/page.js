import TournamentGuideDetailPage from "../../../tournament-guide/[section]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantGuideDetailPage(props) {
  return TournamentGuideDetailPage({ ...props, participantPresentation: true });
}
