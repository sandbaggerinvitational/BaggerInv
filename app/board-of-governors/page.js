export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { CompactHonors } from "../HonorBadges";
import { playerPhoto } from "../../lib/asset-paths";
import {
  refreshHistoricalData,
  formatHandicap,
  formatPercentage,
  formatRecord,
  getAllPlayerStats,
} from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "Board of Governors | Sandbagger Invitational",
  description: "The stewards of the Sandbagger Invitational.",
};

export default async function BoardOfGovernorsPage() {
  await refreshHistoricalData();
  const governors = getAllPlayerStats().filter(({ player }) => player.boardOfGovernors);
  const combinedTitles = governors.reduce((sum, { stats }) => sum + (stats.championships?.length || 0), 0);
  const combinedAppearances = governors.reduce((sum, { stats }) => sum + (stats.appearances?.length || 0), 0);

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Guardians of the Invitational</p>
        <h1>Board of Governors</h1>
        <p>
          The players entrusted with preserving the traditions, competition,
          and future of the Sandbagger Invitational.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.statStrip} style={{ marginBottom: "32px" }}>
          <div><span>Current Governors</span><strong>{governors.length}</strong></div>
          <div><span>Combined Titles</span><strong>{combinedTitles}</strong></div>
          <div><span>Combined Appearances</span><strong>{combinedAppearances}</strong></div>
        </div>

        {governors.length ? (
          <div className={styles.playerGrid}>
            {governors.map(({ player, stats }) => (
              <Link className={styles.playerCard} href={`/players/${player.slug}`} key={player["Player ID"]}>
                <div className={styles.playerTop}>
                  <AssetImage
                    src={playerPhoto(player["Photo Filename"])}
                    alt={player["Display Name"]}
                    className={styles.playerCardPhoto}
                    fallbackClassName={styles.playerCardPhotoFallback}
                    fallback={player["Display Name"].split(" ").map((part) => part[0]).slice(0, 2).join("")}
                  />
                  <div className={styles.playerCardIdentity}>
                    <h2>{player["Display Name"]}</h2>
                    <CompactHonors
                      championships={stats.championships}
                      soyYears={stats.sandbaggerOfYearYears}
                      pointsLeaderYears={stats.individualPointsLeaderYears}
                      isGovernor
                      isRookie={player.rookie}
                      styles={styles}
                    />
                    <b className={player.active ? styles.activeBadge : styles.inactiveBadge}>
                      {player.active ? "Active Governor" : "Governor Emeritus"}
                    </b>
                  </div>
                </div>

                <div className={styles.statStrip}>
                  <div><span>Career</span><strong>{formatRecord(stats.records.overall)}</strong></div>
                  <div><span>Win %</span><strong>{formatPercentage(stats.percentages.overall)}</strong></div>
                  <div><span>Avg. Handicap</span><strong>{formatHandicap(stats.averageHandicap)}</strong></div>
                  <div><span>Appearances</span><strong>{stats.appearances.length}</strong></div>
                </div>

                <div className={styles.rivalLine}>
                  <span>Biggest Rival</span>
                  {stats.biggestRival ? (
                    <>
                      <strong>{stats.biggestRival.player["Display Name"]}</strong>
                      <small>{stats.biggestRival.record.matches} meetings · {formatRecord(stats.biggestRival.record)}</small>
                    </>
                  ) : <strong>No recorded rival</strong>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            No players are currently marked as Board of Governors in the Players sheet.
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
