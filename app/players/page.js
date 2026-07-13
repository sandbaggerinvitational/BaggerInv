import Link from "next/link";
import { Header, Footer } from "../components";
import { formatRecord, getAllPlayerStats } from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "Players | Sandbagger Invitational",
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
          Career profiles, format records, points, partnerships, and tournament
          history. Detailed match statistics are tracked from 2020 forward.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.notice}>
          Championships and detailed match records shown here cover the
          stat-tracking era beginning in 2020. The tournament archive begins in 2017.
        </div>

        <div className={styles.playerGrid}>
          {players.map(({ player, stats }) => (
            <Link
              className={styles.playerCard}
              href={`/players/${player.slug}`}
              key={player["Player ID"]}
            >
              <div className={styles.playerTop}>
                <div>
                  <span>{player["Player ID"]}</span>
                  <h2>{player["Display Name"]}</h2>
                </div>

                <b className={player.active ? styles.activeBadge : styles.inactiveBadge}>
                  {player.active ? "Active" : "Alumni"}
                </b>
              </div>

              <div className={styles.statStrip}>
                <div>
                  <span>Record</span>
                  <strong>{formatRecord(stats.records.overall)}</strong>
                </div>
                <div>
                  <span>Points</span>
                  <strong>{stats.records.overall.points}</strong>
                </div>
                <div>
                  <span>Years</span>
                  <strong>{stats.appearances.length}</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
