export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { tournamentHero } from "../../lib/asset-paths";
import { getTournaments } from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "History | The Sandbagger Invitational",
};

export default async function HistoryPage() {
  await refreshHistoricalData();
  const tournaments = getTournaments();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Complete Archive</p>
        <h1>Tournament History</h1>
        <p>
          Every destination, course, team, captain, champion, and award
          from The Sandbagger Invitational.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.historyCardGrid}>
          {tournaments.map((tournament) => (
            <Link
              className={styles.historyPhotoCard}
              href={`/history/${tournament.year}`}
              key={tournament.year}
            >
              <div className={styles.historyPhotoFrame}>
                <AssetImage
                  src={tournamentHero(tournament["Hero Image"])}
                  alt={`${tournament.year} ${tournament.Destination}`}
                  className={styles.historyPhoto}
                  fallbackClassName={styles.historyPhotoPlaceholder}
                  fallback={tournament.Destination}
                />
                <div className={styles.historyPhotoShade} />
              </div>

              <div className={styles.historyCardBody}>
                <span>{tournament.Annual} Annual</span>
                <h2>{tournament.year}</h2>
                <p>{tournament.Destination}</p>
                <strong>
                  {tournament["Winning Team"] || "Upcoming Invitational"}
                </strong>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
