export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import ContextBackLink from "../../ContextBackLink";
import PlayerAvatar from "../../PlayerAvatar";
import { CareerHonors } from "../../HonorBadges";
import { playerPhoto } from "../../../lib/asset-paths";
import {
  formatRecord,
  getCaptainLegacy,
  getPlayerBySlug,
  getPlayerFormatMatchHistory,
  getPlayerStats,
  getRecords,
} from "../../../lib/stats";
import { addTournamentRanks } from "../../../lib/rankings";
import styles from "../../historical.module.css";
import { formatPlayerPoints } from "../../../lib/formatters";
import { formatPlayerCareerYears } from "../../../lib/player-career";
import { safePlayerDirectoryReturnHref } from "../../../lib/context-navigation";
import { LeaderboardPlayer, LeaderboardRank } from "../../TournamentLeaderboard";
import { pageMetadata } from "../../../lib/seo";
import { getDrafts } from "../../../lib/draft";
import { getPlayerDraftHistory } from "../../../lib/draft-analytics";
import { loadScorecardAnalytics } from "../../../lib/scorecard-data";
import { filterScorecards } from "../../../lib/scorecard-analytics";
import { buildPlayerIntelligence } from "../../../lib/player-intelligence";
import PlayerIntelligenceSections from "./PlayerIntelligenceSections";
import { cookies } from "next/headers";
import { PLAYER_PASSPORT_COOKIE } from "../../../lib/player-passport";
import { resolvePlayerPassportToken } from "../../../lib/player-passport-server";

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { slug } = await params;
  const player = getPlayerBySlug(slug);

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
  const scorecardAnalyticsPromise = loadScorecardAnalytics();
  await refreshHistoricalData();
  const { slug } = await params;
  const query = await searchParams;
  const playerDirectoryReturnHref = safePlayerDirectoryReturnHref(
    query?.returnTo
  );
  const player = getPlayerBySlug(slug);
  if (!player) notFound();
  const cookieStore = await cookies();
  const passportIdentity = await resolvePlayerPassportToken(
    cookieStore.get(PLAYER_PASSPORT_COOKIE)?.value || ""
  );

  const stats = getPlayerStats(player["Player ID"]);
  const formatMatchHistory = getPlayerFormatMatchHistory(
    player["Player ID"],
    stats.records
  );
  const playerDraftHistory = getPlayerDraftHistory(
    await getDrafts(),
    player["Player ID"]
  );
  const captainLegacy = getCaptainLegacy(player["Player ID"]);
  const rival = stats.biggestRival;
  const recordedAppearanceYears = stats.seasons
    .filter((season) => season.overall.matches > 0)
    .map((season) => season.year);
  const careerYears = formatPlayerCareerYears(player, recordedAppearanceYears);
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const officialRecords = getRecords();
  const playerIntelligence = buildPlayerIntelligence({
    playerId: player["Player ID"],
    stats,
    allPlayerStats: officialRecords.all,
    officialRecords,
    scorecards: scorecardAnalytics.scorecards,
    ghostMatchExclusions: scorecardAnalytics.ghostMatchExclusions,
  });
  const playerMatchIds = new Set(
    Object.values(formatMatchHistory).flatMap((history) => history.matches.map((match) => match.id))
  );
  const scorecardsByMatch = Object.fromEntries(
    [...playerMatchIds].map((matchId) => [
      matchId,
      filterScorecards(scorecardAnalytics.scorecards, { matchId }),
    ])
  );

  const compareHref = rival
    ? `/compare?player1=${encodeURIComponent(
        player["Player ID"]
      )}&player2=${encodeURIComponent(rival.player["Player ID"])}`
    : "/compare";

  return (
    <main>
      <Header />
      <ContextBackLink
        href={passportIdentity ? "/home" : playerDirectoryReturnHref}
        label={passportIdentity ? "Back to My Tournament" : "Back to All Sandbaggers"}
      />
      {passportIdentity ? <ContextBackLink
        href={playerDirectoryReturnHref}
        label="Browse All Sandbaggers"
      /> : null}

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

      <section className={styles.content}>
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
                    className={`${styles.captainLegacySeason} ${
                      season.result === "Champion"
                        ? styles.captainLegacyChampion
                        : ""
                    }`}
                    href={`/history/${season.year}/team/${encodeURIComponent(
                      season.teamSide
                    )}`}
                    key={season.year}
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
                <strong>{rival.record.matches}</strong>
              </div>
              <div>
                <span>Head-to-Head</span>
                <strong>{formatRecord(rival.record)}</strong>
              </div>
              <Link className={styles.rivalCompareLink} href={compareHref}>
                Compare players →
              </Link>
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
                <Link
                  href={`/draft/${draft.year}`}
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
                </Link>
              ))}
              <Link className={styles.profileDraftAnalyticsLink} href="/draft/analytics">
                Open Historical Draft Analytics →
              </Link>
            </div>
          </section>
        ) : null}


        <section className={styles.section}>
          <span className={styles.sectionLabel}>Team Golf</span>
          <h2>Top Partners</h2>

          <div className={`${styles.dataTable} ${styles.simpleTable}`}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>#</span>
              <span>Partner</span>
              <span>Record</span>
              <span>Points Won</span>
            </div>

            {addTournamentRanks(stats.partners.slice(0, 8), (row) => row.record.points).map((row) => (
              <div className={styles.tableRow} key={row.player["Player ID"]}>
                <LeaderboardRank rank={row.tournamentRank} />
                <LeaderboardPlayer
                  compact
                  name={row.player["Display Name"]}
                  slug={row.player.slug}
                  photo={row.player["Photo Filename"]}
                />
                <span>{formatRecord(row.record)}</span>
                <strong>{formatPlayerPoints(row.record.points)}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
