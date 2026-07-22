export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../../components";
import { getRivalryStats } from "../../../lib/stats";
import {
  AdvancedRow,
  AdvancedTable,
  PlayerPair,
} from "../AdvancedTable";
import styles from "../../historical.module.css";
import { addTournamentRanks } from "../../../lib/rankings";
import { LeaderboardRank } from "../../TournamentLeaderboard";

export const metadata = {
  title: "Rivalry Analytics | The Sandbagger Invitational",
};

function RivalryRecord({ row }) {
  return `${row.playerOneWins}-${row.playerTwoWins}-${row.halves}`;
}

function RivalryTable({ title, description, rows, valueLabel, value }) {
  const rankedRows = addTournamentRanks(rows, value);
  return (
    <section className={styles.advancedStatSection}>
      <span className={styles.sectionLabel}>Head to Head</span>
      <h2>{title}</h2>
      <p>{description}</p>

      <AdvancedTable
        headers={["Rank", "Rivalry", "Record", "Meetings", valueLabel]}
      >
        {rankedRows.map((row) => (
          <AdvancedRow key={row.key}>
            <LeaderboardRank rank={row.tournamentRank} />
            <PlayerPair
              first={row.playerOne}
              second={row.playerTwo}
            />
            <span>{RivalryRecord({ row })}</span>
            <span>{row.meetings}</span>
            <strong>{value(row)}</strong>
          </AdvancedRow>
        ))}
      </AdvancedTable>
    </section>
  );
}

export default async function RivalriesPage() {
  await refreshHistoricalData();
  const rivalries = getRivalryStats();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Head to Head</p>
        <h1>Rivalry Analytics</h1>
        <p>
          The most-played, closest, and most frequently halved rivalries
          in tournament history.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.leaderboardTopLinks}>
          <Link href="/records">← Records</Link>
          <Link href="/statistics">Statistics Center →</Link>
        </div>

        <div className={styles.advancedStatsStack}>
          <RivalryTable
            title="Most-Played Rivalries"
            description="Players who have opposed each other most often."
            rows={rivalries.mostPlayed}
            valueLabel="Margin"
            value={(row) => row.margin}
          />

          <RivalryTable
            title="Closest Rivalries"
            description="Smallest difference in wins, with at least four meetings."
            rows={rivalries.closest}
            valueLabel="Win Margin"
            value={(row) => row.margin}
          />

          <RivalryTable
            title="Most Halved Rivalries"
            description="Head-to-head matchups producing the most ties."
            rows={rivalries.mostHalves}
            valueLabel="Ties"
            value={(row) => row.halves}
          />
        </div>
      </section>

      <Footer />
    </main>
  );
}
