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

      <section className={styles.content} id="champions">
        <div className={styles.historyCardGrid}>
          {tournaments.map((tournament) => (
            <article className={styles.historyPhotoCard} key={tournament.year}>
              <Link
                className={styles.historyCardPrimary}
                href={`/history/${tournament.year}`}
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
                  <span>{tournament.editionTitle}</span>
                  <h2>{tournament.year}</h2>
                  <p>{tournament.Destination}</p>
                  <strong>
                    {tournament.championTeam?.name || "Upcoming Invitational"}
                  </strong>
                </div>
              </Link>

              {tournament.championTeamId ? (
                <Link
                  className={styles.historyChampionLink}
                  href={`/champions/${tournament.year}`}
                >
                  View {tournament.year} Champion →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
