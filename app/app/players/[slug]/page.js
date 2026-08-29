import PlayerPage from "../../../players/[slug]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantPlayerPage(props) {
  return PlayerPage({ ...props, participantPresentation: true });
}
