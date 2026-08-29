import PreviewModeBadge from "../../PreviewModeBadge.js";
import TournamentDashboard from "../../live/TournamentDashboard.js";
import TournamentSupabaseRead from "../../live/TournamentSupabaseRead.js";
import { getTournamentData } from "../../live/sheetData.js";
import { applicationPageEnvironment } from "../../../lib/production-shadow-request-environment.js";
import { requireTournamentReadSource } from "../../../lib/tournament-read-source.js";
import { workbookInitializationMessage } from "../../../lib/tournament-workbook-initialization.js";

export const dynamic = "force-dynamic";

export default async function ParticipantTournamentPage({ searchParams }) {
  const env = await applicationPageEnvironment();
  const query = await searchParams;
  const initialView = String(query?.view || "") === "calcutta" ? "calcutta" : "";
  const source = requireTournamentReadSource(env);
  if (source.resolved === "supabase") return <>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <TournamentSupabaseRead initialView={initialView} />
  </>;

  let data;
  let error = "";
  try {
    data = await getTournamentData();
  } catch (caughtError) {
    console.error(caughtError);
    error = workbookInitializationMessage(
      caughtError,
      "Tournament data is temporarily unavailable. Confirm the normalized tournament workbook is configured for this environment."
    );
  }
  return <>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <TournamentDashboard initialData={data} initialView={initialView} loadError={error} />
  </>;
}
