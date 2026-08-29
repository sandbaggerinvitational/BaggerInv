import PreviewModeBadge from "../../PreviewModeBadge.js";
import LeaderboardsDashboard from "../../live/LeaderboardsDashboard.js";
import LeaderboardsSupabaseRead from "../../live/LeaderboardsSupabaseRead.js";
import { getTournamentData } from "../../live/sheetData.js";
import { applicationPageEnvironment } from "../../../lib/production-shadow-request-environment.js";
import { requireLeaderboardsCoreReadSource } from "../../../lib/leaderboards-core-read-source.js";
import { requireNetSkinsReadSource } from "../../../lib/net-skins-read-source.js";
import { workbookInitializationMessage } from "../../../lib/tournament-workbook-initialization.js";

export const dynamic = "force-dynamic";

export default async function ParticipantLeaderboardsPage() {
  const env = await applicationPageEnvironment();
  const source = requireLeaderboardsCoreReadSource(env);
  const netSkinsReadSource = requireNetSkinsReadSource(env).resolved;
  if (source.resolved === "supabase") return <>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <LeaderboardsSupabaseRead
      previewMode={process.env.VERCEL_ENV === "preview"}
      netSkinsReadSource={netSkinsReadSource}
    />
  </>;

  let data;
  let error = "";
  try {
    data = await getTournamentData();
  } catch (caughtError) {
    console.error(caughtError);
    error = workbookInitializationMessage(
      caughtError,
      "Tournament standings are temporarily unavailable. Confirm the normalized tournament workbook is configured for this environment."
    );
  }
  return <>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <LeaderboardsDashboard initialData={data} loadError={error} previewMode={process.env.VERCEL_ENV === "preview"} />
  </>;
}
