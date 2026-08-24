export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../components";
import {
  getLeaderboard,
  getLeaderboardFromRecords,
  getStatisticsSections,
} from "../../lib/leaderboards";
import styles from "../historical.module.css";
import { pageMetadata } from "../../lib/seo";
import { isSupabaseSecondaryHistory } from "../../lib/secondary-history-read-source";
import { loadSecondaryHistoryModel } from "../../lib/secondary-history-service";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Statistics | The Sandbagger Invitational",
  description: "Sandbagger Invitational career statistics, player performance, handicaps, partnerships, and rivalries.",
  path: "/statistics",
});

export default async function StatisticsPage() {
  const env = await applicationPageEnvironment();
  const useSupabase = isSupabaseSecondaryHistory(env);
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel({ env }) : null;
  if (!useSupabase) await refreshHistoricalData();
  const records = useSupabase
    ? secondaryHistory.calculations.getRecords()
    : null;
  const sections = getStatisticsSections();

  return (
    <main data-secondary-history-source={useSupabase ? "supabase" : "google"}>
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
                    ? useSupabase
                      ? getLeaderboardFromRecords(item.slug, records)
                      : getLeaderboard(item.slug)
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
