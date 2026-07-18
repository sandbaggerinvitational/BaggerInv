export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../components";
import {
  formatPercentage,
  formatRecord,
  getFormatName,
  getRecords,
} from "../../lib/stats";
import styles from "../historical.module.css";
import { addTournamentRanks } from "../../lib/rankings";

function LeaderSection({ title, slug, rows, value }) {
  const rankedRows = addTournamentRanks(rows, ({ stats }) => value(stats));
  return (
    <section>
      <div className={styles.recordSectionHeading}>
        <div>
          <span className={styles.sectionLabel}>All-Time Leaders</span>
          <h2>{title}</h2>
        </div>

        <Link
          className={styles.fullLeaderboardLink}
          href={`/records/${slug}`}
        >
          View Full Leaderboard →
        </Link>
      </div>

      <div className={styles.podium}>
        {rankedRows.slice(0, 5).map(({ player, stats, tournamentRank }) => (
          <Link
            className={styles.podiumCard}
            href={`/players/${player.slug}`}
            key={player["Player ID"]}
          >
            <b>{tournamentRank}</b>
            <h3>{player["Display Name"]}</h3>
            <strong>{value(stats)}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

export const metadata = {
  title: "Records | The Sandbagger Invitational",
};

export default async function RecordsPage() {
  await refreshHistoricalData();
  const records = getRecords();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Record Book</p>
        <h1>Records</h1>
        <p>
          Complete match records begin in 2017. Percentage leaderboards
          require at least five tournament appearances. Career points are
          incomplete for 2017 and 2018.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.statisticsCallout}>
          <div>
            <span className={styles.sectionLabel}>Go Deeper</span>
            <h2>Statistics Center</h2>
            <p>
              Explore career efficiency, format leaders, competitive
              honors, and tournament-handicap statistics.
            </p>
          </div>

          <Link href="/statistics">Explore More Stats →</Link>
        </div>

        <div className={styles.recordSections}>
          <LeaderSection
            title="Career Points"
            slug="career-points"
            rows={records.points}
            value={(stats) => stats.records.overall.points}
          />

          <LeaderSection
            title="Match Wins"
            slug="match-wins"
            rows={records.wins}
            value={(stats) => stats.records.overall.wins}
          />

          <LeaderSection
            title="Bagger Championships"
            slug="championships"
            rows={records.championships}
            value={(stats) => stats.championships.length}
          />

          <LeaderSection
            title="Point Win Percentage"
            slug="win-percentage"
            rows={records.percentage}
            value={(stats) => formatPercentage(stats.percentages.overall)}
          />

          {[
            ["BB", "best-ball"],
            ["SC", "scramble"],
            ["SI", "singles"],
          ].map(([format, slug]) => (
            <LeaderSection
              key={format}
              slug={slug}
              title={`${getFormatName(format)} Leaders`}
              rows={records.byFormat[format]}
              value={(stats) =>
                `${formatRecord(stats.records[format])} · ${formatPercentage(
                  stats.percentages[format]
                )}`
              }
            />
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
