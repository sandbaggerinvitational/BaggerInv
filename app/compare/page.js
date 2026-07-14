import { Header, Footer } from "../components";
import {
  getAllPlayerStats,
  getEloRatings,
  getHeadToHead,
} from "../../lib/stats";
import CompareTool from "./CompareTool";

export const metadata = {
  title: "Player Comparison | Sandbagger Invitational",
};

export default async function ComparePage({ searchParams }) {
  const params = await searchParams;

  const ratings = Object.fromEntries(
    getEloRatings().map((row) => [
      row.player["Player ID"],
      row.rating,
    ])
  );

  const players = getAllPlayerStats().map(({ player, stats }) => ({
    id: player["Player ID"],
    name: player["Display Name"],
    slug: player.slug,
    record: stats.records.overall,
    points: stats.records.overall.points,
    championships: stats.championships.length,
    appearances: stats.appearances.length,
    percentage: stats.percentages.overall,
    rating: ratings[player["Player ID"]] ?? 1500,
    formats: {
      BB: stats.records.BB,
      SC: stats.records.SC,
      SI: stats.records.SI,
    },
  }));

  const headToHead = {};

  for (const one of players) {
    for (const two of players) {
      if (one.id < two.id) {
        headToHead[`${one.id}|${two.id}`] = getHeadToHead(
          one.id,
          two.id
        );
      }
    }
  }

  return (
    <main>
      <Header />

      <CompareTool
        players={players}
        headToHead={headToHead}
        initialPlayerOne={params?.player1 ?? ""}
        initialPlayerTwo={params?.player2 ?? ""}
      />

      <Footer />
    </main>
  );
}
