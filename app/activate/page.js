import PreviewModeBadge from "../PreviewModeBadge";
import { notFound } from "next/navigation";
import { liveTournamentV2Enabled } from "../../lib/spreadsheet-environment";
import PlayerPassportActivation from "./PlayerPassportActivation";

export const metadata = {
  title: "Activate Player Passport",
  robots: { index: false, follow: false },
};

export default async function ActivatePage({ searchParams }) {
  if (!liveTournamentV2Enabled()) notFound();
  const query = await searchParams;
  return <main>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <PlayerPassportActivation invitedReference={query?.player || ""} />
  </main>;
}
