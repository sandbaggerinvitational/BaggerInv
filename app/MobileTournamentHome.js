import { Header } from "./components";
import TournamentCommandCenter from "./TournamentCommandCenter";

export default function MobileTournamentHome({ liveData }) {
  return (
    <main className="mobileHomeMain">
      <Header activeNavigationHref="/live" homeHref="/home" />
      <TournamentCommandCenter
        tournament={liveData?.tournament || {}}
        liveData={liveData}
      />
    </main>
  );
}
