import PreviewModeBadge from "../PreviewModeBadge";
import { notFound } from "next/navigation";
import { liveTournamentV2Enabled } from "../../lib/spreadsheet-environment";
import PlayerPassportActivation from "./PlayerPassportActivation";
import { cookies } from "next/headers";
import { PLAYER_PASSPORT_COOKIE } from "../../lib/player-passport";
import { resolvePlayerPassportToken } from "../../lib/player-passport-server";
import { privatePageMetadata } from "../../lib/seo";

export const metadata = privatePageMetadata("Activate Player Passport");

export default async function ActivatePage({ searchParams }) {
  if (!liveTournamentV2Enabled()) notFound();
  const query = await searchParams;
  const cookieStore = await cookies();
  const identity = await resolvePlayerPassportToken(cookieStore.get(PLAYER_PASSPORT_COOKIE)?.value || "");
  return <main>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <PlayerPassportActivation invitedReference={query?.player || ""} activePlayer={identity?.player || null} />
  </main>;
}
