import { Header } from "./components";
import TournamentCommandCenter from "./TournamentCommandCenter";

export default function MobileTournamentHome({ liveData, initialParticipantData = null, participantIdentityAuthority = "passport" }) {
  return (
    <main className="mobileHomeMain">
      <Header activeNavigationHref="/live" homeHref="/home" />
      <TournamentCommandCenter
        tournament={liveData?.tournament || {}}
        liveData={liveData}
        initialParticipantData={initialParticipantData}
        participantIdentityAuthority={participantIdentityAuthority}
      />
    </main>
  );
}
