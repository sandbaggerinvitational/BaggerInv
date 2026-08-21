export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { after } from "next/server";
import { Header } from "../components";
import AssetImage from "../AssetImage";
import { defaultAssets, optimizedAssetUrl } from "../../lib/asset-paths";
import { getTournaments } from "../../lib/stats";
import {
  historyEditionLabel,
  historyHeroPath,
  historyTournamentCardResult,
} from "../../lib/history-presentation";
import styles from "../historical.module.css";
import pwaStyles from "./history-participant.module.css";
import { pageMetadata } from "../../lib/seo";
import {
  history2026TournamentCard,
  isSupabaseHistory2026,
  loadHistory2026View,
} from "../../lib/history-2026-service";
import { HistoryUnavailableNotice } from "./HistoryUnavailable";
import {
  isSupabaseCompletedHistoryYear,
  loadCompletedHistoryYears,
} from "../../lib/completed-history-service";

export const metadata = pageMetadata({
  title: "History | The Sandbagger Invitational",
  description: "The complete Sandbagger Invitational archive of destinations, teams, captains, matches, and champions.",
  path: "/history",
});

export default async function HistoryPage() {
  const useSupabase2026 = isSupabaseHistory2026("2026");
  const useSupabaseCompleted = isSupabaseCompletedHistoryYear("2017");
  let tournaments;
  let currentHistoryUnavailable = false;
  let completedHistoryUnavailable = false;

  if (useSupabaseCompleted) {
    const [completedResult, currentResult] = await Promise.all([
      loadCompletedHistoryYears()
        .then((result) => ({ tournaments: result.tournaments }))
        .catch(() => ({ tournaments: null })),
      useSupabase2026
        ? loadHistory2026View({ year: 2026 })
          .then(history2026TournamentCard)
          .catch(() => null)
        : Promise.resolve(null),
    ]);
    completedHistoryUnavailable = !completedResult.tournaments;
    currentHistoryUnavailable = useSupabase2026 && !currentResult;
    tournaments = [currentResult, ...(completedResult.tournaments || [])]
      .filter(Boolean)
      .sort((a, b) => Number(b.year) - Number(a.year));
  } else if (useSupabase2026) {
    const legacyTournaments = getTournaments().filter((tournament) => Number(tournament.year) !== 2026);
    after(async () => { await refreshHistoricalData(); });
    const currentTournament = await loadHistory2026View({ year: 2026 })
      .then(history2026TournamentCard)
      .catch(() => null);
    currentHistoryUnavailable = !currentTournament;
    tournaments = [currentTournament, ...legacyTournaments].filter(Boolean)
      .sort((a, b) => Number(b.year) - Number(a.year));
  } else {
    await refreshHistoricalData();
    tournaments = getTournaments();
  }
  const newestCompletedYear = tournaments.find((tournament) => tournament.championTeamId)?.year;

  return (
    <main>
      <Header />

      <section className={`${styles.pageHero} ${pwaStyles.archiveHero}`}>
        <p className={styles.eyebrow}>The Complete Archive</p>
        <h1>Tournament History</h1>
        <p>
          Every destination, course, team, captain, champion, and award
          from The Sandbagger Invitational.
        </p>
      </section>

      <section className={`${styles.content} ${pwaStyles.archiveContent}`} id="champions">
        {currentHistoryUnavailable ? (
          <HistoryUnavailableNotice year="2026" />
        ) : null}
        {completedHistoryUnavailable ? (
          <HistoryUnavailableNotice year="2017–2025" />
        ) : null}
        <div className={`${styles.historyCardGrid} ${pwaStyles.yearGrid}`}>
          {tournaments.map((tournament, index) => {
            const heroPath = historyHeroPath(tournament);
            const completed = Boolean(tournament.championTeamId);
            return <article className={styles.historyPhotoCard} key={tournament.year}>
              <Link
                className={styles.historyCardPrimary}
                href={`/history/${tournament.year}`}
                aria-label={completed
                  ? `View ${tournament.year} Tournament History`
                  : `${tournament.year}, ${historyEditionLabel(tournament.year)}, ${tournament.Destination}, ${historyTournamentCardResult(tournament)}`}
                prefetch={Number(tournament.year) === Number(newestCompletedYear) ? undefined : false}
              >
                <div className={styles.historyPhotoFrame}>
                  <AssetImage
                    src={optimizedAssetUrl(heroPath, 640, 72)}
                    alt=""
                    className={styles.historyPhoto}
                    fallbackClassName={styles.historyPhotoPlaceholder}
                    fallback={tournament.Destination}
                    fallbackSrc={optimizedAssetUrl(defaultAssets.tournamentHero, 640, 72)}
                    loading={index < 2 ? "eager" : "lazy"}
                    width={640}
                    height={360}
                    sizes="(max-width: 720px) 112px, (max-width: 1100px) 50vw, 33vw"
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "auto"}
                  />
                  <div className={styles.historyPhotoShade} />
                </div>

                <div className={styles.historyCardBody}>
                  <span>{historyEditionLabel(tournament.year)}</span>
                  <h2>{tournament.year}</h2>
                  <p>{tournament.Destination}</p>
                  <strong>{historyTournamentCardResult(tournament)}</strong>
                </div>
              </Link>
            </article>;
          })}
        </div>
      </section>
    </main>
  );
}
