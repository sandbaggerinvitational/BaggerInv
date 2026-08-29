import PlayersPage from "../../players/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantPlayersPage(props) {
  return PlayersPage({ ...props, participantPresentation: true });
}
