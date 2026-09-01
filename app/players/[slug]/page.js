export const dynamic = "force-dynamic";
import {
  refreshCanonicalCareerHistoricalData,
  refreshHistoricalData,
} from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import ContextBackLink from "../../ContextBackLink";
import HistoryNavigation from "../../history/HistoryNavigation";
import PlayerAvatar from "../../PlayerAvatar";
import { CareerHonors } from "../../HonorBadges";
import { playerPhoto } from "../../../lib/asset-paths";
import {
  formatRecord,
  getCaptainLegacy,
  getPlayerBySlug,
  getPlayerFormatMatchHistory,
  getRecords,
} from "../../../lib/stats";
import { addTournamentRanks } from "../../../lib/rankings";
import styles from "../../historical.module.css";
import { formatPlayerPoints } from "../../../lib/formatters";
import { formatPlayerCareerYears } from "../../../lib/player-career";
import {
  historicalPlayerReturnContext,
  safePlayerDirectoryReturnHref,
  withPlayerOriginContext,
} from "../../../lib/context-navigation";
import { LeaderboardPlayer, LeaderboardRank } from "../../TournamentLeaderboard";
import { pageMetadata } from "../../../lib/seo";
import { getPlayerDrafts } from "../../../lib/draft";
import { getPlayerDraftHistory } from "../../../lib/draft-analytics";
import {
  loadCanonicalCareerScorecardAnalytics,
  loadScorecardAnalytics,
} from "../../../lib/scorecard-data";
import { indexScorecardsByMatch } from "../../../lib/scorecard-index";
import { scorecardPresentationData } from "../../../lib/scorecard-presentation";
import { buildPlayerIntelligence } from "../../../lib/player-intelligence";
import {
  getLeaderboardFromRecords,
  getLeaderboardSlugs,
} from "../../../lib/leaderboards";
import { buildCanonicalRecordHolderAuthority } from "../../../lib/record-holder-authority";
import PlayerIntelligenceSections from "./PlayerIntelligenceSections";
import { isSupabaseSecondaryHistory } from "../../../lib/secondary-history-read-source";
import { loadSecondaryHistoryModel } from "../../../lib/secondary-history-service";
import { applicationPageEnvironment } from "../../../lib/production-shadow-request-environment";

export async function generateMetadata({ params }) {
  const env = await applicationPageEnvironment();
  const useSupabase = isSupabaseSecondaryHistory(env);
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel({ env }) : null;
  if (!useSupabase) await refreshCanonicalCareerHistoricalData();
  const { slug } = await params;
  const player = useSupabase
    ? secondaryHistory.calculations.getPlayerBySlug(slug)
    : getPlayerBySlug(slug);

  const title = player
    ? `${player["Display Name"]} | The Sandbagger Invitational`
    : "Player | The Sandbagger Invitational";
  return pageMetadata({
    title,
    description: player
      ? `${player["Display Name"]}'s Sandbagger Invitational profile, career record, rating, achievements, partners, and rivals.`
      : "Sandbagger Invitational player profile.",
    path: `/players/${slug}`,
    image: player?.["Photo Filename"]
      ? playerPhoto(player["Photo Filename"])
      : undefined,
    type: "profile",
  });
}


function ChampionshipTimeline({ years, styles }) {
  const orderedYears = [...years].sort(
    (a, b) => Number(a) - Number(b)
  );
  const rows = [];

  for (let index = 0; index < orderedYears.length; index += 5) {
    rows.push(orderedYears.slice(index, index + 5));
  }

  return (
    <div className={styles.profileChampionshipTimeline}>
      {rows.map((row, rowIndex) => (
        <div
          className={styles.profileChampionshipRow}
          key={rowIndex}
        >
          {row.map((year, index) => (
            <span
              className={styles.profileChampionshipYear}
              key={year}
            >
              <b>{year}</b>
              {index < row.length - 1 ? (
                <i aria-hidden="true">•</i>
              ) : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}


const participantHref = (href, participantPresentation) => {
  if (!participantPresentation) return href;
  return String(href || "")
    .replace(/^\/players(?=\/|\?|$)/, "/app/players")
    .replace(/^\/history(?=\/|\?|$)/, "/app/history")
    .replace(/^\/courses(?=\/|\?|$)/, "/app/courses")
    .replace(/^\/tournament-guide(?=\/|\?|$)/, "/app/guide");
};

export default async function PlayerPage({ params, searchParams, participantPresentation = false }) {
  const env = await applicationPageEnvironment();
  const useSupabase = isSupabaseSecondaryHistory(env);
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel({ env }) : null;
  const calculations = secondaryHistory?.calculations || null;
  const readSupabaseRecords = calculations?.getRecords;
  const scorecardAnalyticsPromise = useSupabase
    ? Promise.resolve(secondaryHistory.scorecardAnalytics)
    : loadCanonicalCareerScorecardAnalytics();
  const recordScorecardAnalyticsPromise = useSupabase
    ? Promise.resolve(secondaryHistory.scorecardAnalytics)
    : loadScorecardAnalytics();
  if (!useSupabase) await refreshHistoricalData();
  const canonicalOfficialRecords = useSupabase ? readSupabaseRecords() : getRecords();
  const routeParams = await params;
  const queryPromise = searchParams;
  const supabasePlayer = useSupabase
    ? calculations.getPlayerBySlug(routeParams.slug)
    : null;
  if (useSupabase && !supabasePlayer) notFound();
  const supabaseDraftsPromise = useSupabase
    ? getPlayerDrafts(supabasePlayer["Player ID"], { history: calculations, env })
    : null;
  const recordScorecardAnalytics = await recordScorecardAnalyticsPromise;
  const recordPlayerNames = Object.fromEntries(
    canonicalOfficialRecords.all.map(({ player }) => [
      player["Player ID"],
      player["Display Name"],
    ])
  );
  const recordAuthority = buildCanonicalRecordHolderAuthority({
    officialLeaderboards: getLeaderboardSlugs().map((recordSlug) =>
      getLeaderboardFromRecords(recordSlug, canonicalOfficialRecords)
    ),
    scorecards: recordScorecardAnalytics.scorecards,
    playerNames: recordPlayerNames,
    ghostMatchExclusions: recordScorecardAnalytics.ghostMatchExclusions,
  });
  if (!useSupabase) await refreshCanonicalCareerHistoricalData();
  const { slug } = routeParams;
  const query = await queryPromise;
  const playerDirectoryReturnHref = safePlayerDirectoryReturnHref(
    query?.returnTo
  );
  const historyReturnContext = historicalPlayerReturnContext(query);
  const player = useSupabase ? supabasePlayer : getPlayerBySlug(slug);
  if (!player) notFound();
  const officialRecords = useSupabase ? canonicalOfficialRecords : getRecords();
  const stats = officialRecords.all.find(({ player: rowPlayer }) =>
    rowPlayer["Player ID"] === player["Player ID"]
  )?.stats;
  if (!stats) notFound();
  const formatMatchHistory = (useSupabase
    ? calculations.getPlayerFormatMatchHistory
    : getPlayerFormatMatchHistory)(
    player["Player ID"],
    stats.records
  );
  const playerDraftHistory = getPlayerDraftHistory(
    useSupabase
      ? await supabaseDraftsPromise
      : await getPlayerDrafts(player["Player ID"], { env }),
    player["Player ID"],
    useSupabase ? { history: calculations } : undefined
  );
  const captainLegacy = (useSupabase ? calculations.getCaptainLegacy : getCaptainLegacy)(player["Player ID"]);
  const rival = stats.biggestRival;
  const recordedAppearanceYears = stats.seasons
    .filter((season) => season.overall.matches > 0)
    .map((season) => season.year);
  const careerYears = formatPlayerCareerYears(player, recordedAppearanceYears);
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const careerScorecards = scorecardAnalytics.canonicalCareerScorecards;
  const playerIntelligence = buildPlayerIntelligence({
    playerId: player["Player ID"],
    stats,
    allPlayerStats: officialRecords.all,
    officialRecords,
    scorecards: careerScorecards,
    ghostMatchExclusions: scorecardAnalytics.ghostMatchExclusions,
    recordsHeld: recordAuthority.recordsHeldForPlayer(player["Player ID"]),
    ...(useSupabase ? {
      holePlayers: recordAuthority.scorecardCatalog.playerAnalytics,
      matchProgression: recordAuthority.matchProgression,
    } : {}),
  });
  const playerMatchIds = new Set(
    Object.values(formatMatchHistory).flatMap((history) =>
      history.matches.map((match) => match.id)
    )
  );
  const indexedCareerScorecards = participantPresentation
    ? null
    : indexScorecardsByMatch(careerScorecards, { matchIds: playerMatchIds });
  const scorecardsByMatch = participantPresentation
    ? {}
    : Object.fromEntries([...playerMatchIds].map((matchId) => [
        matchId,
        scorecardPresentationData(indexedCareerScorecards.get(matchId) || []),
      ]));
  const compareHref = rival
    ? `/compare?player1=${encodeURIComponent(player["Player ID"])}&player2=${encodeURIComponent(rival.player["Player ID"])}`
    : "/compare";
  const primaryNavigation = historyReturnContext
    ? {
        href: participantHref(historyReturnContext.href, participantPresentation),
        label: historyReturnContext.label,
        direction: "left",
        ariaLabel: historyReturnContext.accessibleLabel,
        prefetch: false,
      }
    : {
        href: participantPresentation ? "/home" : playerDirectoryReturnHref,
        label: participantPresentation ? "My Tournament" : "All Sandbaggers",
        direction: "left",
        ariaLabel: participantPresentation ? "Back to My Tournament" : "Back to All Sandbaggers",
        prefetch: false,
      };
  const browseNavigation = historyReturnContext || participantPresentation
    ? {
        href: participantPresentation ? "/app/players" : playerDirectoryReturnHref,
        label: "Browse All Sandbaggers",
        ariaLabel: "Browse All Sandbaggers",
        prefetch: false,
      }
    : null;

  return (
    <main data-career-profile>
      {participantPresentation ? null : <Header />}
      {participantPresentation ? null : (
        <ContextBackLink
          href={playerDirectoryReturnHref}
          label="Back to All Sandbaggers"
        />
      )}
      <section
        className={styles.pageHero}
        data-secondary-history-source={useSupabase ? "supabase" : "google"}
      >
        <div className={styles.profileHeader}>
          <PlayerAvatar
            player={player}
            alt={player["Display Name"]}
            className={styles.profilePhoto}
            fallbackClassName={styles.profilePhotoFallback}
            loading="eager"
          />
          <div>
            <p className={styles.eyebrow}>
              {stats.championships.length
                ? "Bagger Champion"
                : "Sandbagger Competitor"}
            </p>
            <h1>{player["Display Name"]}</h1>
            <div className={styles.profileChampionshipLine}>
              {stats.championships.length ? (
                <ChampionshipTimeline
                  years={stats.championships}
                  styles={styles}
                />
              ) : (
                <strong>Still Chasing the Cup</strong>
              )}
            </div>
          </div>

          {careerYears ? <div className={styles.profileMeta}>{careerYears}</div> : null}
        </div>
      </section>

      {participantPresentation ? (
        <HistoryNavigation
          ariaLabel={`${player["Display Name"]} profile navigation`}
          left={primaryNavigation}
          right={browseNavigation}
          surface="player"
        />
      ) : null}

      <section className={participantPresentation ? `${styles.content} ${styles.careerContent}` : styles.content}>
        <CareerHonors
          championships={stats.championships}
          soyYears={stats.sandbaggerOfYearYears}
          pointsChampionYears={stats.pointsChampionYears}
          isGovernor={player.boardOfGovernors}
          isHandicapCommittee={player.handicapCommittee}
          styles={styles}
        />




        <PlayerIntelligenceSections
          intelligence={playerIntelligence}
          formatMatchHistory={formatMatchHistory}
          playerName={player["Display Name"]}
          playerSlug={player.slug}
          participantPresentation={participantPresentation}
          scorecardsByMatch={scorecardsByMatch}
        />

        <section className={styles.captainLegacySection}>
          <span className={styles.sectionLabel}>Leadership History</span>
          <h2>Captain Legacy</h2>

          {captainLegacy.seasons.length ? (
            <>
              <div className={styles.captainLegacySummary}>
                <div>
                  <span>Captain Record</span>
                  <strong>{formatRecord(captainLegacy.record)}</strong>
                </div>
                <div>
                  <span>Championships as Captain</span>
                  <strong>{captainLegacy.championships}</strong>
                </div>
                <div>
                  <span>Tournaments as Captain</span>
                  <strong>{captainLegacy.seasons.length}</strong>
                </div>
              </div>

              <div className={styles.captainLegacyTimeline}>
                {captainLegacy.seasons.map((season) => (
                  <Link
                    aria-label={`View ${player["Display Name"]}'s ${season.year} ${season.teamName} Team History`}
                    className={`${styles.captainLegacySeason} ${
                      season.result === "Champion"
                        ? styles.captainLegacyChampion
                        : ""
                    }`}
                    href={participantHref(withPlayerOriginContext(
                      `/history/${season.year}/team/${encodeURIComponent(season.teamSide)}`,
                      player.slug
                    ), participantPresentation)}
                    key={season.year}
                    prefetch={false}
                  >
                    <strong>{season.year}</strong>
                    <div>
                      <span>{season.teamName}</span>
                      <small>
                        {season.result === "Champion"
                          ? "🏆 Champions"
                          : season.result}
                      </small>
                    </div>
                    <b>View Team →</b>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.captainLegacyEmpty}>
              Never served as Team Captain.
            </div>
          )}
        </section>

        <section className={styles.rivalSpotlight}>
          <span className={styles.sectionLabel}>Most-Faced Opponent</span>
          <h2>Biggest Rival</h2>

          {rival ? (
            <div className={`${styles.rivalProfileCard} ${participantPresentation ? "" : styles.publicRivalProfileCard}`}>
              <div>
                <span>Rival</span>
                <strong>{rival.player["Display Name"]}</strong>
              </div>
              <div>
                <span>Points Won</span>
                <strong>
                  {rival.record.recordedPointMatches > 0
                    ? formatPlayerPoints(rival.record.points)
                    : <span aria-label="Points not recorded">—</span>}
                </strong>
              </div>
              <div>
                <span>Head-to-Head</span>
                <strong>{formatRecord(rival.record)}</strong>
              </div>
              {participantPresentation ? null : (
                <Link className={styles.rivalCompareLink} href={compareHref}>
                  Compare players →
                </Link>
              )}
            </div>
          ) : (
            <div className={styles.rivalEmpty}>
              Not enough recorded match history.
            </div>
          )}
        </section>

        {playerDraftHistory.length ? (
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Draft Analytics</span>
            <h2>Draft History</h2>
            <div className={styles.profileDraftHistory}>
              {playerDraftHistory.map((draft) => {
                const content = <>
                  <strong>{draft.year}</strong>
                  <span>Pick #{draft.pick}</span>
                  <b>{draft.team}</b>
                  <small>
                    {Number.isFinite(draft.finish)
                      ? `Finished #${draft.finish} · ${draft.dvs > 0 ? "+" : ""}${draft.dvs} DVS`
                      : "Tournament result pending"}
                  </small>
                </>;
                return participantPresentation ? (
                  <article key={draft.year} style={{ "--draft-history-team": draft.teamColor }}>
                    {content}
                  </article>
                ) : (
                  <Link href={`/draft/${draft.year}`} key={draft.year} style={{ "--draft-history-team": draft.teamColor }}>
                    {content}
                  </Link>
                );
              })}
              {participantPresentation ? null : (
                <Link className={styles.profileDraftAnalyticsLink} href="/draft/analytics">
                  Open Historical Draft Analytics →
                </Link>
              )}
            </div>
          </section>
        ) : null}


        <section className={styles.section}>
          <span className={styles.sectionLabel}>Team Golf</span>
          <h2>Top Partners</h2>

          <div className={`${styles.dataTable} ${participantPresentation ? styles.profilePartnersTable : styles.simpleTable}`}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>#</span>
              <span>Partner</span>
              <span>Record</span>
              {participantPresentation ? null : <span>Points Won</span>}
            </div>

            {addTournamentRanks(stats.partners.slice(0, 8), (row) => row.record.points).map((row) => (
              <div className={styles.tableRow} key={row.player["Player ID"]}>
                <LeaderboardRank rank={row.tournamentRank} />
                <LeaderboardPlayer
                  compact
                  linked={!participantPresentation}
                  name={row.player["Display Name"]}
                  slug={row.player.slug}
                  photo={row.player["Photo Filename"]}
                />
                {participantPresentation ? (
                  <span className={styles.profilePartnerResult}>
                    <b>{formatRecord(row.record)}</b>
                    <small>
                      Points {row.record.recordedPointMatches > 0
                        ? formatPlayerPoints(row.record.points)
                        : <span aria-label="Points not recorded">—</span>}
                    </small>
                  </span>
                ) : <>
                  <span>{formatRecord(row.record)}</span>
                  <strong>
                    {row.record.recordedPointMatches > 0
                      ? formatPlayerPoints(row.record.points)
                      : <span aria-label="Points not recorded">—</span>}
                  </strong>
                </>}
              </div>
            ))}
          </div>
        </section>
      </section>
      {participantPresentation ? null : <Footer />}
    </main>
  );
}
