import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import AssetImage from "../../AssetImage";
import { CareerHonors } from "../../HonorBadges";
import { playerPhoto } from "../../../lib/asset-paths";
import {
  formatHandicap,
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
      ? `${player["Display Name"]} | The Sandbagger Invitational`
      : "Player | The Sandbagger Invitational",
  };
}

export default async function PlayerPage({ params }) {
  const { slug } = await params;
  const player = getPlayerBySlug(slug);
  if (!player) notFound();

  const stats = getPlayerStats(player["Player ID"]);
  const rival = stats.biggestRival;

  const compareHref = rival
    ? `/compare?player1=${encodeURIComponent(
        player["Player ID"]
      )}&player2=${encodeURIComponent(rival.player["Player ID"])}`
    : "/compare";

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
          <AssetImage
            src={playerPhoto(player["Photo Filename"])}
            alt={player["Display Name"]}
            className={styles.profilePhoto}
            fallbackClassName={styles.profilePhotoFallback}
            fallback={player["Display Name"]
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
            loading="eager"
          />
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
            <span>Avg. Tournament Handicap</span>
            <strong>{formatHandicap(stats.averageHandicap)}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Bagger Championships</span>
            <strong>{stats.championships.length}</strong>
          </div>
        </div>

        <CareerHonors
          championships={stats.championships}
          soyYears={stats.sandbaggerOfYearYears}
          isGovernor={player.boardOfGovernors}
          styles={styles}
        />

        <section className={styles.rivalSpotlight}>
          <span className={styles.sectionLabel}>Most-Faced Opponent</span>
          <h2>Biggest Rival</h2>

          {rival ? (
            <div className={styles.rivalProfileCard}>
              <div>
                <span>Rival</span>
                <strong>{rival.player["Display Name"]}</strong>
              </div>
              <div>
                <span>Points Won</span>
                <strong>{rival.record.matches}</strong>
              </div>
              <div>
                <span>Head-to-Head</span>
                <strong>{formatRecord(rival.record)}</strong>
              </div>
              <Link className={styles.rivalCompareLink} href={compareHref}>
                Compare players →
              </Link>
            </div>
          ) : (
            <div className={styles.rivalEmpty}>
              Not enough recorded match history.
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

          <div className={`${styles.dataTable} ${styles.seasonTable}`}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>Year</span>
              <span>Team</span>
              <span>Handicap</span>
              <span>Record</span>
              <span>Points</span>
              <span>Title</span>
            </div>

            {stats.seasons.map((season) => (
              <div className={styles.tableRow} key={season.year}>
                <strong>{season.year}</strong>
                <Link
                  className={styles.teamBadge}
                  href={`/history/${season.year}/team/${encodeURIComponent(
                    season.teamSide
                  )}`}
                >
                  {season.teamName}
                </Link>
                <span>{formatHandicap(season.handicap)}</span>
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
              <span>Points Won</span>
            </div>

            {stats.partners.slice(0, 8).map((row, index) => (
              <div className={styles.tableRow} key={row.player["Player ID"]}>
                <strong>{index + 1}</strong>
                <Link href={`/players/${row.player.slug}`}>
                  {row.player["Display Name"]}
                </Link>
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
