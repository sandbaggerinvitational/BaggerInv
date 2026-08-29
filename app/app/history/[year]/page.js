import HistoryYearPage from "../../../history/[year]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantHistoryYearPage(props) {
  return HistoryYearPage({ ...props, participantPresentation: true });
}
