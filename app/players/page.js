import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { CompactHonors } from "../HonorBadges";
import { playerPhoto } from "../../lib/asset-paths";
import {
  formatHandicap,
  formatRecord,
  getAllPlayerStats,
} from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "Players | The Sandbagger Invitational",
};

export default function PlayersPage() {
  const players = getAllPlayerStats();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Competitors</p>
        <h1>Players</h1>
        <p>
          Complete match records from 2017 onward, career handicaps,
          rivalries, partnerships, ratings, and championship history.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.playerGrid}>
          {players.map(({ player, stats }) => (
            <Link
              className={styles.playerCard}
              href={`/players/${player.slug}`}
              key={player["Player ID"]}
            >
              <div className={styles.playerTop}>
                <AssetImage
                  src={playerPhoto(player["Photo Filename"])}
                  alt={player["Display Name"]}
                  className={styles.playerCardPhoto}
                  fallbackClassName={styles.playerCardPhotoFallback}
                  fallback={player["Display Name"]
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                />

                <div className={styles.playerCardIdentity}>
                  <h2>{player["Display Name"]}</h2>

                  <CompactHonors
                    championships={stats.championships}
                    soyYears={stats.sandbaggerOfYearYears}
                    isGovernor={player.boardOfGovernors}
                    styles={styles}
                  />

                  <b
                    className={
                      player.active
                        ? styles.activeBadge
                        : styles.inactiveBadge
                    }
                  >
                    {player.active ? "Active" : "Alumni"}
                  </b>
                </div>
              </div>

              <div className={styles.statStrip}>
                <div>
                  <span>Record</span>
                  <strong>{formatRecord(stats.records.overall)}</strong>
                </div>
                <div>
                  <span>Avg. Handicap</span>
                  <strong>{formatHandicap(stats.averageHandicap)}</strong>
                </div>
                <div>
                  <span>Appearances</span>
                  <strong>{stats.appearances.length}</strong>
                </div>
              </div>

              <div className={styles.rivalLine}>
                <span>Biggest Rival</span>
                {stats.biggestRival ? (
                  <>
                    <strong>
                      {stats.biggestRival.player["Display Name"]}
                    </strong>
                    <small>
                      {stats.biggestRival.record.matches} meetings ·{" "}
                      {formatRecord(stats.biggestRival.record)}
                    </small>
                  </>
                ) : (
                  <strong>No recorded rival</strong>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
