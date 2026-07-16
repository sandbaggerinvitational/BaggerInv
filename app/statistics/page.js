import Link from "next/link";
import { Header, Footer } from "../components";
import {
  getLeaderboard,
  getStatisticsSections,
} from "../../lib/leaderboards";
import styles from "../historical.module.css";

export const metadata = {
  title: "Statistics | The Sandbagger Invitational",
};

export default function StatisticsPage() {
  const sections = getStatisticsSections();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Numbers Behind the Matches</p>
        <h1>Statistics</h1>
        <p>
          Explore career production, efficiency, format performance,
          competitive honors, and handicap history.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.statsHubSections}>
          {sections.map((section) => (
            <section className={styles.statsHubSection} key={section.title}>
              <span className={styles.sectionLabel}>
                Statistics Center
              </span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>

              <div className={styles.statsHubGrid}>
                {section.links.map((item) => {
                  const leaderboard = item.slug
                    ? getLeaderboard(item.slug)
                    : null;
                  const leader = leaderboard?.rows[0];

                  return (
                    <Link
                      className={styles.statsHubCard}
                      href={item.href || `/records/${item.slug}`}
                      key={item.slug}
                    >
                      <span>Leaderboard</span>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>

                      {leader ? (
                        <div className={styles.statsHubLeader}>
                          <small>Current Leader</small>
                          <strong>{leader.name}</strong>
                        </div>
                      ) : null}

                      <b>View Full List →</b>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
