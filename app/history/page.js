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

export const metadata = pageMetadata({
  title: "History | The Sandbagger Invitational",
  description: "The complete Sandbagger Invitational archive of destinations, teams, captains, matches, and champions.",
  path: "/history",
});

export default async function HistoryPage() {
  const useSupabase2026 = isSupabaseHistory2026("2026");
  let tournaments;
  let currentHistoryUnavailable = false;

  if (useSupabase2026) {
    // Older years retain their existing legacy authority, but a private GViz
    // refresh must not sit in front of the explicit Supabase 2026 entry. Render
    // the already-available immutable legacy archive immediately and refresh
    // its process cache only after this participant response has completed.
    const legacyTournaments = getTournaments().filter(
      (tournament) => Number(tournament.year) !== 2026
    );
    after(async () => {
      await refreshHistoricalData();
    });

    const currentTournament = await loadHistory2026View({ year: 2026 })
      .then(history2026TournamentCard)
      .catch(() => null);
    currentHistoryUnavailable = !currentTournament;

    tournaments = [currentTournament, ...legacyTournaments]
      .filter(Boolean)
      .sort((a, b) => Number(b.year) - Number(a.year));
  } else {
    await refreshHistoricalData();
    tournaments = getTournaments();
  }

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
