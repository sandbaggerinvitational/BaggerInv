import HistoryRoundPage from "../../../../../history/[year]/round/[round]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantHistoryRoundPage(props) {
  return HistoryRoundPage({ ...props, participantPresentation: true });
}
