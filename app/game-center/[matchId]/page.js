import { Header } from "../../components";
import PreviewModeBadge from "../../PreviewModeBadge";
import TournamentIdentityHeader from "../../TournamentIdentityHeader";
import { privatePageMetadata } from "../../../lib/seo";
import GameCenter from "../GameCenter";
import { getGameCenterData } from "../gameCenterData";
import styles from "../game-center.module.css";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Game Center | Sandbagger Invitational");

export default async function GameCenterPage({ params, searchParams }) {
  const { matchId } = await params;
  const query = await searchParams;
  const initialData = await getGameCenterData(matchId);
  const backTo = query?.from === "my-match" ? "my-match" : "tournament";

  return <main className={styles.page}>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <Header />
    <div className={styles.content}>
      <TournamentIdentityHeader
        year={initialData.tournament.year}
        name={initialData.tournament.name}
        location={initialData.tournament.location}
        logo={initialData.tournament.logo}
        status={initialData.tournament.status}
      />
      <GameCenter initialData={initialData} matchId={matchId} backTo={backTo} />
    </div>
  </main>;
}
