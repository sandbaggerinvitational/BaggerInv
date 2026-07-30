import { privatePageMetadata } from "../../lib/seo";
import MobileTournamentHome from "../MobileTournamentHome";
import PreviewModeBadge from "../PreviewModeBadge";
import { getTournamentData } from "../live/sheetData";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Home | Sandbagger Invitational");

export default async function MobileHomePage() {
  let liveData;
  let error = "";

  try {
    liveData = await getTournamentData();
  } catch (caughtError) {
    console.error("Mobile tournament dashboard could not be loaded.", caughtError);
    error = "The tournament dashboard is temporarily unavailable.";
  }

  if (!liveData?.tournament) {
    return (
      <main className="mobileHomeMain">
        <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
        <section className="mobileHomeLoadError" role="alert">
          <h1>Tournament dashboard</h1>
          <p>{error || "Tournament data is not available yet."}</p>
          <a href="/home">Retry</a>
        </section>
      </main>
    );
  }

  return (
    <>
      <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
      <MobileTournamentHome liveData={liveData} />
    </>
  );
}
