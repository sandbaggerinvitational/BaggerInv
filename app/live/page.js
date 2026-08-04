export const dynamic = "force-dynamic";
import { Header, Footer } from "../components";
import MatchCenter from "./MatchCenter";
import { getTournamentData } from "./sheetData";
import { pageMetadata } from "../../lib/seo";
import PreviewModeBadge from "../PreviewModeBadge";
import styles from "./tournament-dashboard.module.css";
import { workbookInitializationMessage } from "../../lib/tournament-workbook-initialization";

export const metadata = pageMetadata({
  title: "Match Center | Sandbagger Invitational",
  description: "Round-by-round Sandbagger Invitational results and team scoring.",
  path: "/live",
});

export default async function LivePage() {
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

  return (
    <main>
      <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
      <Header homeHref="/home" />
      <MatchCenter initialData={data} loadError={error} previewMode={process.env.VERCEL_ENV === "preview"} />
      <div className={styles.tournamentFooter}><Footer /></div>
    </main>
  );
}
