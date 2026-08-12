import { Header } from "../../components";
import PreviewModeBadge from "../../PreviewModeBadge";
import TournamentIdentityHeader from "../../TournamentIdentityHeader";
import { privatePageMetadata } from "../../../lib/seo";
import GameCenter from "../GameCenter";
import { getGameCenterData } from "../gameCenterData";
import { cookies } from "next/headers";
import { PLAYER_PASSPORT_COOKIE, playerPassportEffectivePlayerId, verifyPlayerPassportSession } from "../../../lib/player-passport";
import styles from "../game-center.module.css";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Game Center | Sandbagger Invitational");

export default async function GameCenterPage({ params, searchParams }) {
  const { matchId } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();
  let currentPlayerId = "";
  try {
    currentPlayerId = playerPassportEffectivePlayerId(verifyPlayerPassportSession(
      cookieStore.get(PLAYER_PASSPORT_COOKIE)?.value || ""
    ));
  } catch {}
  const initialData = await getGameCenterData(matchId, currentPlayerId);
  const backTo = ["home", "my-match"].includes(query?.from) ? query.from : "tournament";

  return <main className={styles.page}>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <Header homeHref="/home" />
    <div className={styles.content}>
      <TournamentIdentityHeader
        year={initialData.tournament.year}
        name={initialData.tournament.name}
        location={initialData.tournament.location}
        logo={initialData.tournament.logo}
        status={initialData.tournament.status}
        compact
      />
      <GameCenter initialData={initialData} matchId={matchId} backTo={backTo} />
    </div>
  </main>;
}
