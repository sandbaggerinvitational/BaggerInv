import Link from "next/link";
import { Header, Footer } from "../components";
import { formatRecord, getAllPlayerStats } from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = { title: "Players | Sandbagger Invitational" };

function ChampionshipLine({ years }) {
  if (!years.length) {
    return <div className={styles.championshipLine}><span>Sandbagger Competitor</span><strong>Still Chasing the Cup</strong></div>;
  }
  return <div className={styles.championshipLine}><span>Bagger Champion</span><strong>{years.join(" • ")}</strong></div>;
}

export default function PlayersPage() {
  const players = getAllPlayerStats();
  return (
    <main>
      <Header />
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Competitors</p><h1>Players</h1>
        <p>Career profiles, format records, points, partnerships, rivalries, and tournament history.</p>
      </section>
      <section className={styles.content}>
        <div className={styles.notice}>Detailed match statistics are tracked from 2020 forward.</div>
        <div className={styles.playerGrid}>
          {players.map(({ player, stats }) => (
            <Link className={styles.playerCard} href={`/players/${player.slug}`} key={player["Player ID"]}>
              <div className={styles.playerTop}>
                <div><h2>{player["Display Name"]}</h2><ChampionshipLine years={stats.championships} /></div>
                <b className={player.active ? styles.activeBadge : styles.inactiveBadge}>{player.active ? "Active" : "Alumni"}</b>
              </div>
              <div className={styles.statStrip}>
                <div><span>Record</span><strong>{formatRecord(stats.records.overall)}</strong></div>
                <div><span>Points</span><strong>{stats.records.overall.points}</strong></div>
                <div><span>Years</span><strong>{stats.appearances.length}</strong></div>
              </div>
              <div className={styles.rivalLine}>
                <span>Biggest Rival</span>
                {stats.biggestRival ? <><strong>{stats.biggestRival.player["Display Name"]}</strong><small>{stats.biggestRival.record.matches} meetings · {formatRecord(stats.biggestRival.record)}</small></> : <strong>Not enough match history</strong>}
              </div>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
