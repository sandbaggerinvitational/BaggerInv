import OddsCenterPage from "../../odds-center/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantOddsPage(props) {
  return OddsCenterPage({ ...props, participantPresentation: true });
}
