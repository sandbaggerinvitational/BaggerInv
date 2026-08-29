import TournamentGuidePage from "../../tournament-guide/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantGuidePage(props) {
  return TournamentGuidePage({ ...props, participantPresentation: true });
}
