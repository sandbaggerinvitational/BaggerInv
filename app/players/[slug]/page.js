import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import {
  formatPercentage,
  formatRecord,
  getFormatName,
  getPlayerBySlug,
  getPlayerStats,
} from "../../../lib/stats";
import styles from "../../historical.module.css";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const player = getPlayerBySlug(slug);

  return {
    title: player
      ? `${player["Display Name"]} | Sandbagger Invitational`
      : "Player | Sandbagger Invitational",
  };
}

export default async function PlayerPage({ params }) {
  const { slug } = await params;
  const player = getPlayerBySlug(slug);

  if (!player) notFound();

  const stats = getPlayerStats(player["Player ID"]);
  const biggestRival = stats.opponents[0] ?? null;

  const formats = [
    ["overall", "Overall"],
    ["BB", getFormatName("BB")],
    ["SC", getFormatName("SC")],
    ["SI", getFormatName("SI")],
  ];

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <div className={styles.profileHeader}>
          <div>
            <p className={styles.eyebrow}>
              {stats.championships.length
                ? "Bagger Champion"
                : "Sandbagger Competitor"}
            </p>

            <h1>{player["Display Name"]}</h1>

            <div className={styles.profileChampionshipLine}>
              <strong>
                {stats.championships.length
                  ? stats.championships.join(" • ")
                  : "Still Chasing the Cup"}
              </strong>
            </div>
          </div>

          <div className={styles.profileMeta}>
            {player["First Year"]}–
            {player.active ? "Present" : player["Last Year"]}
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.notice}>
          Detailed match statistics are calculated from recorded results beginning
          with the 2020 Invitational.
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpi}>
            <span>Career Record</span>
            <strong>{formatRecord(stats.records.overall)}</strong>
          </div>

          <div className={styles.kpi}>
            <span>Career Points</span>
            <strong>{stats.records.overall.points}</strong>
          </div>

          <div className={styles.kpi}>
            <span>Point Win %</span>
            <strong>{formatPercentage(stats.percentages.overall)}</strong>
          </div>

          <div className={styles.kpi}>
            <span>Tracked Appearances</span>
            <strong>{stats.appearances.length}</strong>
          </div>

          <div className={styles.kpi}>
            <span>Bagger Championships</span>
            <strong>{stats.championships.length}</strong>
          </div>
        </div>

        <section className={styles.rivalSpotlight}>
          <div>
            <span className={styles.sectionLabel}>Most-Faced Opponent</span>
            <h2>Biggest Rival</h2>
          </div>

          {biggestRival ? (
            <div className={styles.rivalProfileCard}>
              <div>
                <span>Rival</span>
                <strong>{biggestRival.player["Display Name"]}</strong>
              </div>

              <div>
                <span>Meetings</span>
                <strong>{biggestRival.record.matches}</strong>
              </div>

              <div>
                <span>Head-to-Head</span>
                <strong>{formatRecord(biggestRival.record)}</strong>
              </div>

              <Link className={styles.rivalCompareLink} href="/compare">
                Compare players →
              </Link>
            </div>
          ) : (
            <div className={styles.rivalEmpty}>
              Not enough recorded match history to determine a rival.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Format Breakdown</span>
          <h2>Match Records</h2>

          <div className={styles.formatGrid}>
            {formats.map(([key, label]) => (
              <div className={styles.formatCard} key={key}>
                <span>{label}</span>
                <h3>{formatRecord(stats.records[key])}</h3>
                <strong>{stats.records[key].points} points</strong>
                <em>{formatPercentage(stats.percentages[key])}</em>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Season by Season</span>
          <h2>Performance Timeline</h2>

          <div className={`${styles.dataTable} ${styles.simpleTable}`}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>Year</span>
              <span>Team</span>
              <span>Record</span>
              <span>Points</span>
              <span>Championship</span>
            </div>

            {stats.seasons.map((season) => (
              <div className={styles.tableRow} key={season.year}>
                <strong>{season.year}</strong>
                <span className={styles.teamBadge}>{season.teamName}</span>
                <span>{formatRecord(season.overall)}</span>
                <span>{season.overall.points}</span>
                <strong>
                  {stats.championships.includes(season.year) ? "🏆" : "—"}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Team Golf</span>
          <h2>Top Partners</h2>

          <div className={`${styles.dataTable} ${styles.simpleTable}`}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>#</span>
              <span>Partner</span>
              <span>Record</span>
              <span>Points</span>
            </div>

            {stats.partners.slice(0, 8).map((row, index) => (
              <div className={styles.tableRow} key={row.player["Player ID"]}>
                <strong>{index + 1}</strong>
                <span>{row.player["Display Name"]}</span>
                <span>{formatRecord(row.record)}</span>
                <strong>{row.record.points}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
