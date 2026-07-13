import Link from "next/link";
import { Header, Footer } from "../components";
import { getTournaments } from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "History | Sandbagger Invitational",
};

export default function HistoryPage() {
  const tournaments = getTournaments();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Since 2017</p>
        <h1>Tournament History</h1>
        <p>
          Host destinations, team identities, champions, captains, courses, and awards.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.timeline}>
          {tournaments.map((tournament) => (
            <article className={styles.yearCard} key={tournament.year}>
              <div className={styles.yearNumber}>{tournament.year}</div>

              <div>
                <span className={styles.sectionLabel}>{tournament.Location}</span>
                <h2>
                  {tournament["Winning Team"] || "Upcoming Invitational"}
                </h2>
                <p>
                  {tournament["Final Score"]
                    ? `Final score: ${tournament["Final Score"]}`
                    : "Teams and results to be announced."}
                </p>
              </div>

              <Link
                className={styles.yearLink}
                href={`/history/${tournament.year}`}
              >
                View year →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
