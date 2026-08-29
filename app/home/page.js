import { privatePageMetadata } from "../../lib/seo";
import MobileTournamentHome from "../MobileTournamentHome";
import PreviewModeBadge from "../PreviewModeBadge";
import PwaSplashIdentityBridge from "../PwaSplashIdentityBridge";
import TournamentInitializationRecovery from "../TournamentInitializationRecovery";
import { getTournamentData } from "../live/sheetData";
import ParticipantSupabaseHome from "../ParticipantSupabaseHome";
import { requireHomeReadSource } from "../../lib/home-read-source";
import { requireNetSkinsReadSource } from "../../lib/net-skins-read-source";
import { requireParticipantIdentityAuthority } from "../../lib/participant-identity-authority";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const dynamic = "force-dynamic";
export const metadata = {
  ...privatePageMetadata("The Bagger"),
  // iOS Add to Home Screen can fall back to the document title. An absolute
  // title prevents the root title template from appending the public-site name.
  title: { absolute: "The Bagger" },
  applicationName: "The Bagger",
};

export default async function MobileHomePage() {
  const env = await applicationPageEnvironment();
  const source = requireHomeReadSource(env);
  const participantIdentityAuthority = requireParticipantIdentityAuthority(env).resolved;
  const netSkinsSource = requireNetSkinsReadSource(env);
  const netSkinsReadSource = netSkinsSource.resolved;
  if (source.resolved === "supabase") return <ParticipantSupabaseHome
    netSkinsReadSource={netSkinsReadSource}
    productionNetSkinsV1={netSkinsSource.productionCutover?.handled === true}
  />;

  let liveData;
  try {
    liveData = await getTournamentData();
  } catch (caughtError) {
    console.error("Mobile tournament dashboard could not be loaded.", caughtError);
  }

  if (!liveData?.tournament) {
    return (
      <main className="mobileHomeMain">
        <PwaSplashIdentityBridge tournament={null} />
        <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
        <TournamentInitializationRecovery />
      </main>
    );
  }

  return (
    <>
      <PwaSplashIdentityBridge tournament={liveData.tournament} />
      <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
      <MobileTournamentHome liveData={liveData} participantIdentityAuthority={participantIdentityAuthority} />
    </>
  );
}
