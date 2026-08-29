import HistoryTeamPage from "../../../../../history/[year]/team/[side]/page.js";

export const dynamic = "force-dynamic";

export default function ParticipantHistoryTeamPage(props) {
  return HistoryTeamPage({ ...props, participantPresentation: true });
}
