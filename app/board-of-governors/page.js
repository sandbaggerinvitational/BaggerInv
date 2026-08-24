export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header, Footer } from "../components";
import PlayerAvatar from "../PlayerAvatar";
import { CompactHonors } from "../HonorBadges";
import {
  refreshHistoricalData,
  formatHandicap,
  formatPercentage,
  formatRecord,
  getAllPlayerStats,
} from "../../lib/stats";
import styles from "../historical.module.css";
import { pageMetadata } from "../../lib/seo";
import { isSupabaseSecondaryHistory } from "../../lib/secondary-history-read-source";
import { loadSecondaryHistoryModel } from "../../lib/secondary-history-service";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Board of Governors | Sandbagger Invitational",
  description: "The stewards of the Sandbagger Invitational.",
  path: "/board-of-governors",
});

export default async function BoardOfGovernorsPage() {
  const env = await applicationPageEnvironment();
  const useSupabase = isSupabaseSecondaryHistory(env);
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel({ env }) : null;
  if (!useSupabase) await refreshHistoricalData();
  const governors = (useSupabase
    ? secondaryHistory.calculations.getAllPlayerStats()
    : getAllPlayerStats()).filter(({ player }) => player.boardOfGovernors);
  const combinedTitles = governors.reduce((sum, { stats }) => sum + (stats.championships?.length || 0), 0);
  const combinedAppearances = governors.reduce((sum, { stats }) => sum + (stats.appearances?.length || 0), 0);

  return (
    <main data-secondary-history-source={useSupabase ? "supabase" : "google"}>
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
                  <div className={styles.playerCardAvatarColumn}>
                    <PlayerAvatar
                      player={player}
                      alt={player["Display Name"]}
                      className={styles.playerCardPhoto}
                      fallbackClassName={styles.playerCardPhotoFallback}
                    />
                    <b className={player.active ? styles.activeBadge : styles.inactiveBadge}>
                      {player.active ? "Active" : "Alumni"}
                    </b>
                  </div>
                  <div className={styles.playerCardIdentity}>
                    <h2>{player["Display Name"]}</h2>
                    <CompactHonors
                      championships={stats.championships}
                      soyYears={stats.sandbaggerOfYearYears}
                      pointsChampionYears={stats.pointsChampionYears}
                      isGovernor
                      isRookie={player.rookie}
                      isHandicapCommittee={player.handicapCommittee}
                      styles={styles}
                    />
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
                  ) : (
                    <>
                      <strong>No recorded rival</strong>
                      <small aria-hidden="true">&nbsp;</small>
                    </>
                  )}
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
