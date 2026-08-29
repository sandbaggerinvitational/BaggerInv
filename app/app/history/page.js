import HistoryPage from "../../history/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantHistoryPage(props) {
  return HistoryPage({ ...props, participantPresentation: true });
}
