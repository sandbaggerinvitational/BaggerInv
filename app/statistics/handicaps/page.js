export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../../components";
import { formatHandicap, getHandicapStats } from "../../../lib/stats";
import {
  AdvancedRow,
  AdvancedTable,
} from "../AdvancedTable";
import styles from "../../historical.module.css";
import { addTournamentRanks } from "../../../lib/rankings";
import { LeaderboardPlayer, LeaderboardRank } from "../../TournamentLeaderboard";

export const metadata = {
  title: "Handicap Analytics | The Sandbagger Invitational",
};

function HandicapTable({ title, description, rows, high = false }) {
  const rankedRows = addTournamentRanks(rows, "handicap");
  return (
    <section className={styles.advancedStatSection}>
      <span className={styles.sectionLabel}>Tournament Indexes</span>
      <h2>{title}</h2>
      <p>{description}</p>

      <AdvancedTable
        headers={["Rank", "Player", "Handicap", "Year", "Team"]}
      >
        {rankedRows.map((row) => (
          <AdvancedRow
            key={`${row.player["Player ID"]}-${row.year}-${row.handicap}`}
          >
            <LeaderboardRank rank={row.tournamentRank} />
            <LeaderboardPlayer
              compact
              name={row.player["Display Name"]}
              slug={row.player.slug}
              photo={row.player["Photo Filename"]}
            />
            <strong>{formatHandicap(row.handicap)}</strong>
            <span>{row.year}</span>
            <span>{row.teamName}</span>
          </AdvancedRow>
        ))}
      </AdvancedTable>
    </section>
  );
}

export default async function HandicapsPage() {
  await refreshHistoricalData();
  const handicaps = getHandicapStats();
  const improvedRanks = addTournamentRanks(handicaps.mostImproved, "improvement");

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Tournament Indexes</p>
        <h1>Handicap Analytics</h1>
        <p>
          Single-tournament handicap records and long-term player
          improvement.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.leaderboardTopLinks}>
          <Link href="/records">← Records</Link>
          <Link href="/statistics">Statistics Center →</Link>
        </div>

        <div className={styles.advancedStatsStack}>
          <HandicapTable
            title="Lowest Tournament Handicaps"
            description="The lowest indexes brought into a Sandbagger Invitational."
            rows={handicaps.lowestTournament}
          />

          <HandicapTable
            title="Highest Tournament Handicaps"
            description="The highest indexes recorded at tournament entry."
            rows={handicaps.highestTournament}
            high
          />

          <section className={styles.advancedStatSection}>
            <span className={styles.sectionLabel}>Career Progression</span>
            <h2>Most Improved Handicaps</h2>
            <p>
              Improvement from a player's first recorded tournament
              handicap to their most recent.
            </p>

            <AdvancedTable
              headers={[
                "Rank",
                "Player",
                "Improvement",
                "First",
                "Latest",
              ]}
            >
              {improvedRanks.map((row) => (
                <AdvancedRow key={row.player["Player ID"]}>
                  <LeaderboardRank rank={row.tournamentRank} />
                  <LeaderboardPlayer
                    compact
                    name={row.player["Display Name"]}
                    slug={row.player.slug}
                    photo={row.player["Photo Filename"]}
                  />
                  <strong>{formatHandicap(row.improvement)}</strong>
                  <span>
                    {formatHandicap(row.firstHandicap)} ({row.firstYear})
                  </span>
                  <span>
                    {formatHandicap(row.latestHandicap)} ({row.latestYear})
                  </span>
                </AdvancedRow>
              ))}
            </AdvancedTable>
          </section>
        </div>
      </section>

      <Footer />
    </main>
  );
}
