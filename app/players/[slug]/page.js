export const dynamic = "force-dynamic";
import {
  refreshCanonicalCareerHistoricalData,
  refreshHistoricalData,
} from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getDrafts } from "../../../lib/draft";
import { getPlayerDraftHistory } from "../../../lib/draft-analytics";
import {
  loadCanonicalCareerScorecardAnalytics,
  loadScorecardAnalytics,
} from "../../../lib/scorecard-data";
import { buildPlayerIntelligence } from "../../../lib/player-intelligence";
import {
  getLeaderboardFromRecords,
  getLeaderboardSlugs,
} from "../../../lib/leaderboards";
import { buildCanonicalRecordHolderAuthority } from "../../../lib/record-holder-authority";
import PlayerIntelligenceSections from "./PlayerIntelligenceSections";
import { cookies } from "next/headers";
import { PLAYER_PASSPORT_COOKIE } from "../../../lib/player-passport";
import { resolvePlayerPassportToken } from "../../../lib/player-passport-server";
import { participantIdentityAuthorityEnvironment } from "../../../lib/participant-identity-authority";
import { resolveSupabaseParticipantIdentity } from "../../../lib/participant-identity-resolver";
import { isSupabaseSecondaryHistory } from "../../../lib/secondary-history-read-source";
import { loadSecondaryHistoryModel } from "../../../lib/secondary-history-service";

export async function generateMetadata({ params }) {
  const useSupabase = isSupabaseSecondaryHistory();
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel() : null;
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


export default async function PlayerPage({ params, searchParams }) {
  const useSupabase = isSupabaseSecondaryHistory();
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel() : null;
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
  const { slug } = await params;
  const query = await searchParams;
  const playerDirectoryReturnHref = safePlayerDirectoryReturnHref(
    query?.returnTo
  );
  const historyReturnContext = historicalPlayerReturnContext(query);
  const player = useSupabase ? calculations.getPlayerBySlug(slug) : getPlayerBySlug(slug);
  if (!player) notFound();
  const cookieStore = await cookies();
  const participantIdentityAuthority = participantIdentityAuthorityEnvironment();
  let participantIdentity = null;
  if (participantIdentityAuthority.resolved === "supabase") {
    try {
      participantIdentity = await resolveSupabaseParticipantIdentity({ cookieStore });
    } catch {
      // Player profiles are public. Missing participant identity only changes
      // the contextual back-link and must not make the profile unavailable.
    }
  } else {
    participantIdentity = await resolvePlayerPassportToken(
      cookieStore.get(PLAYER_PASSPORT_COOKIE)?.value || ""
    );
  }

  const officialRecords = useSupabase ? readSupabaseRecords() : getRecords();
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
    await getDrafts(useSupabase ? { history: calculations } : undefined),
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
  });
  const primaryNavigation = historyReturnContext
    ? {
        href: historyReturnContext.href,
        label: historyReturnContext.label,
        direction: "left",
        ariaLabel: historyReturnContext.accessibleLabel,
        prefetch: false,
      }
    : {
        href: participantIdentity ? "/home" : playerDirectoryReturnHref,
        label: participantIdentity ? "My Tournament" : "All Sandbaggers",
        direction: "left",
        ariaLabel: participantIdentity ? "Back to My Tournament" : "Back to All Sandbaggers",
        prefetch: false,
      };
  const browseNavigation = historyReturnContext || participantIdentity
    ? {
        href: playerDirectoryReturnHref,
        label: "Browse All Sandbaggers",
        ariaLabel: "Browse All Sandbaggers",
        prefetch: false,
      }
    : null;

  return (
    <main data-career-profile data-secondary-history-source={useSupabase ? "supabase" : "google"}>
      <section className={styles.pageHero}>
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

      <HistoryNavigation
        ariaLabel={`${player["Display Name"]} profile navigation`}
        left={primaryNavigation}
        right={browseNavigation}
        surface="player"
      />

      <section className={`${styles.content} ${styles.careerContent}`}>
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
                    href={withPlayerOriginContext(
                      `/history/${season.year}/team/${encodeURIComponent(season.teamSide)}`,
                      player.slug
                    )}
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
            <div className={styles.rivalProfileCard}>
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
              {playerDraftHistory.map((draft) => (
                <article
                  key={draft.year}
                  style={{ "--draft-history-team": draft.teamColor }}
                >
                  <strong>{draft.year}</strong>
                  <span>Pick #{draft.pick}</span>
                  <b>{draft.team}</b>
                  <small>
                    {Number.isFinite(draft.finish)
                      ? `Finished #${draft.finish} · ${draft.dvs > 0 ? "+" : ""}${draft.dvs} DVS`
                      : "Tournament result pending"}
                  </small>
                </article>
              ))}
            </div>
          </section>
        ) : null}


        <section className={styles.section}>
          <span className={styles.sectionLabel}>Team Golf</span>
          <h2>Top Partners</h2>

          <div className={`${styles.dataTable} ${styles.profilePartnersTable}`}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>#</span>
              <span>Partner</span>
              <span>Record</span>
            </div>

            {addTournamentRanks(stats.partners.slice(0, 8), (row) => row.record.points).map((row) => (
              <div className={styles.tableRow} key={row.player["Player ID"]}>
                <LeaderboardRank rank={row.tournamentRank} />
                <LeaderboardPlayer
                  compact
                  linked={false}
                  name={row.player["Display Name"]}
                  slug={row.player.slug}
                  photo={row.player["Photo Filename"]}
                />
                <span className={styles.profilePartnerResult}>
                  <b>{formatRecord(row.record)}</b>
                  <small>
                    Points {row.record.recordedPointMatches > 0
                      ? formatPlayerPoints(row.record.points)
                      : <span aria-label="Points not recorded">—</span>}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
