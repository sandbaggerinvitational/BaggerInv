import { Header } from "./components";
import TournamentCommandCenter from "./TournamentCommandCenter";

export default function MobileTournamentHome({ liveData, initialParticipantData = null }) {
  return (
    <main className="mobileHomeMain">
      <Header activeNavigationHref="/live" homeHref="/home" />
      <TournamentCommandCenter
        tournament={liveData?.tournament || {}}
        liveData={liveData}
        initialParticipantData={initialParticipantData}
      />
    </main>
  );
}
