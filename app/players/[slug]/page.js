export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import ContextBackLink from "../../ContextBackLink";
import AssetImage from "../../AssetImage";
import { CareerHonors } from "../../HonorBadges";
import { playerPhoto } from "../../../lib/asset-paths";
import {
  formatHandicap,
  formatPercentage,
  formatRecord,
  getCaptainLegacy,
  getFormatName,
  getPlayerBySlug,
  getPlayerFormatMatchHistory,
  getPlayerStats,
  getSandbaggerRatings,
} from "../../../lib/stats";
import { addTournamentRanks } from "../../../lib/rankings";
import styles from "../../historical.module.css";
import { formatPoints } from "../../../lib/formatters";
import { formatPlayerCareerYears } from "../../../lib/player-career";
import { safePlayerDirectoryReturnHref } from "../../../lib/context-navigation";
import { LeaderboardPlayer, LeaderboardRank } from "../../TournamentLeaderboard";
import { pageMetadata } from "../../../lib/seo";
import PlayerFormatMatchHistory from "./PlayerFormatMatchHistory";
import { getDrafts } from "../../../lib/draft";
import { getPlayerDraftHistory } from "../../../lib/draft-analytics";
import { loadScorecardAnalytics } from "../../../lib/scorecard-data";
import { filterScorecards } from "../../../lib/scorecard-analytics";
import { playerHoleByHoleAnalytics } from "../../../lib/hole-by-hole-analytics";
import ScoringStatGrid, { formatScoringNumber } from "../../ScoringStatGrid";

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


function CareerTimelineItem({ season, styles }) {
  const content = (
    <>
      <strong>{season.year}</strong>
      <span
        className={styles.careerTimelineMarker}
        aria-hidden="true"
      />
      <div>
        <h3>
          {season.result === "Champion"
            ? "🏆 Champion"
            : season.result}
        </h3>
        <p>
          {season.attended
            ? season.teamName
            : "Did not participate"}
        </p>
      </div>
      {season.attended ? <b>View Year →</b> : null}
    </>
  );

  const className = `${styles.careerTimelineItem} ${
    season.result === "Champion"
      ? styles.careerTimelineChampion
      : season.result === "Runner-Up"
        ? styles.careerTimelineRunnerUp
        : season.result === "Upcoming"
          ? styles.careerTimelineUpcoming
          : !season.attended
            ? styles.careerTimelineAbsent
            : ""
  }`;

  return season.attended ? (
    <Link
      className={className}
      href={`/history/${season.year}`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
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

  const stats = getPlayerStats(player["Player ID"]);
  const formatMatchHistory = getPlayerFormatMatchHistory(
    player["Player ID"],
    stats.records
  );
  const playerDraftHistory = getPlayerDraftHistory(
    await getDrafts(),
    player["Player ID"]
  );
  const overallRating = getSandbaggerRatings().byCategory.OVERALL.find(
    (row) => row.player["Player ID"] === player["Player ID"]
  );
  const captainLegacy = getCaptainLegacy(player["Player ID"]);
  const rival = stats.biggestRival;
  const recentCareerSeasons = stats.careerTimeline.slice(-5);
  const earlierCareerSeasons = stats.careerTimeline.slice(0, -5);
  const timelineChampionships = stats.careerTimeline.filter(
    (season) => season.result === "Champion"
  ).length;
  const timelineRunnerUps = stats.careerTimeline.filter(
    (season) => season.result === "Runner-Up"
  ).length;
  const recordedAppearanceYears = stats.seasons
    .filter((season) => season.overall.matches > 0)
    .map((season) => season.year);
  const careerYears = formatPlayerCareerYears(player, recordedAppearanceYears);
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const playerScoring = scorecardAnalytics.playerSummary(player["Player ID"]);
  const playerHoleAnalytics = playerHoleByHoleAnalytics(
    scorecardAnalytics.scorecards,
    player["Player ID"]
  );
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

  const formats = [
    ["overall", "Overall"],
    ["BB", getFormatName("BB")],
    ["SC", getFormatName("SC")],
    ["SI", getFormatName("SI")],
  ];

  return (
    <main>
      <Header />
      <ContextBackLink
        href={playerDirectoryReturnHref}
        label="Back to All Sandbaggers"
      />

      <section className={styles.pageHero}>
        <div className={styles.profileHeader}>
          <AssetImage
            src={playerPhoto(player["Photo Filename"])}
            alt={player["Display Name"]}
            className={styles.profilePhoto}
            fallbackClassName={styles.profilePhotoFallback}
            fallback={player["Display Name"]
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
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
        <div className={styles.kpiGrid}>
          <div className={styles.kpi}>
            <span>Career Record</span>
            <strong>{formatRecord(stats.records.overall)}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Career Points</span>
            <strong>{formatPoints(stats.records.overall.points)}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Point Win %</span>
            <strong>{formatPercentage(stats.percentages.overall)}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Avg. Tournament Handicap</span>
            <strong>{formatHandicap(stats.averageHandicap)}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Bagger Championships</span>
            <strong>{stats.championships.length}</strong>
          </div>
          <div className={styles.kpi}>
            <span>Overall SBR</span>
            <strong>{overallRating?.rating || "—"}</strong>
          </div>
        </div>

        <CareerHonors
          championships={stats.championships}
          soyYears={stats.sandbaggerOfYearYears}
          pointsChampionYears={stats.pointsChampionYears}
          isGovernor={player.boardOfGovernors}
          isHandicapCommittee={player.handicapCommittee}
          styles={styles}
        />




        <section className={styles.careerTimelineSection}>
          <span className={styles.sectionLabel}>Career Journey</span>
          <h2>Career Timeline</h2>

          <div className={styles.careerTimelineSummary}>
            <div>
              <span>Appearances</span>
              <strong>{stats.careerTimeline.filter((season) => season.attended).length}</strong>
            </div>
            <div>
              <span>Championships</span>
              <strong>{timelineChampionships}</strong>
            </div>
            <div>
              <span>Runner-Ups</span>
              <strong>{timelineRunnerUps}</strong>
            </div>
          </div>

          <div className={styles.careerTimeline}>
            {recentCareerSeasons.map((season) => (
              <CareerTimelineItem
                season={season}
                styles={styles}
                key={season.year}
              />
            ))}
          </div>

          {earlierCareerSeasons.length ? (
            <details className={styles.careerTimelineDetails}>
              <summary>View Earlier Tournaments</summary>
              <div className={styles.careerTimelineEarlier}>
                {earlierCareerSeasons.map((season) => (
                  <CareerTimelineItem
                    season={season}
                    styles={styles}
                    key={season.year}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>

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

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Format Breakdown</span>
          <h2>Match Records</h2>

          <div className={styles.formatGrid}>
            {formats.map(([key, label]) => (
              <div className={styles.formatCard} key={key}>
                <span>{label}</span>
                <h3>{formatRecord(stats.records[key])}</h3>
                <strong>{formatPoints(stats.records[key].points)} points</strong>
                <em>{formatPercentage(stats.percentages[key])}</em>
                {key !== "overall" ? (
                  <PlayerFormatMatchHistory history={formatMatchHistory[key]} scorecardsByMatch={scorecardsByMatch} />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>Scoring Statistics</h2>
          <ScoringStatGrid items={[
            {
              label: "Recorded Rounds",
              value: playerScoring.recordedScoringAverage.sampleSize,
              sample: playerScoring.scorecardCoverage.label,
            },
            {
              label: "Gross Scoring Average",
              value: formatScoringNumber(playerScoring.recordedScoringAverage.value),
              sample: playerScoring.recordedScoringAverage.label,
            },
            {
              label: "Average To Par",
              value: formatScoringNumber(playerScoring.averageToPar.value, { signed: true }),
              sample: playerScoring.averageToPar.label,
            },
            {
              label: "Best Round",
              value: formatScoringNumber(playerScoring.lowestRecordedRound.value),
              sample: playerScoring.lowestRecordedRound.label,
            },
            {
              label: "Lowest Front Nine",
              value: formatScoringNumber(playerScoring.bestFrontNine.value),
              sample: playerScoring.bestFrontNine.label,
            },
            {
              label: "Lowest Back Nine",
              value: formatScoringNumber(playerScoring.bestBackNine.value),
              sample: playerScoring.bestBackNine.label,
            },
            { label: "Birdies", value: playerScoring.birdies.value, sample: playerScoring.birdies.label },
            { label: "Pars", value: playerScoring.pars.value, sample: playerScoring.pars.label },
            { label: "Bogeys", value: playerScoring.bogeys.value, sample: playerScoring.bogeys.label },
            { label: "Double+", value: playerScoring.doubleOrWorse.value, sample: playerScoring.doubleOrWorse.label },
            {
              label: "Par 3 Average",
              value: formatScoringNumber(playerScoring.par3Average.value),
              sample: playerScoring.par3Average.label,
            },
            {
              label: "Par 4 Average",
              value: formatScoringNumber(playerScoring.par4Average.value),
              sample: playerScoring.par4Average.label,
            },
            {
              label: "Par 5 Average",
              value: formatScoringNumber(playerScoring.par5Average.value),
              sample: playerScoring.par5Average.label,
            },
            {
              label: "Closing Average (16–18)",
              value: formatScoringNumber(playerScoring.closingAverage.value),
              sample: playerScoring.closingAverage.label,
            },
            {
              label: "Scorecard Coverage",
              value: `${playerScoring.scorecardCoverage.available} of ${playerScoring.scorecardCoverage.expected}`,
              sample: playerScoring.scorecardCoverage.label,
            },
          ]} />
        </section>

        <details className={styles.holeAnalyticsDetails}>
          <summary>
            <div>
              <span className={styles.sectionLabel}>Complete Scorecards Only</span>
              <h2>Hole-by-Hole Analytics</h2>
            </div>
            <b>View analytics</b>
          </summary>
          <div className={styles.holeAnalyticsBody}>
            <p>Based only on COMPLETE and VERIFIED scorecards. Partial and missing scorecards are excluded.</p>
            <h3>Match Play</h3>
            <ScoringStatGrid items={[
              { label: "Total Holes Played", value: playerHoleAnalytics.totalHolesPlayed, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
              { label: "Holes Won", value: playerHoleAnalytics.holesWon, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
              { label: "Holes Lost", value: playerHoleAnalytics.holesLost, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
              { label: "Holes Halved", value: playerHoleAnalytics.holesHalved, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
              { label: "Hole Differential", value: formatScoringNumber(playerHoleAnalytics.holeDifferential, { signed: true, decimals: 0 }), sample: "Holes won minus holes lost" },
              { label: "Front Nine Holes Won", value: playerHoleAnalytics.frontNineHolesWon, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
              { label: "Back Nine Holes Won", value: playerHoleAnalytics.backNineHolesWon, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
              { label: "Closing Holes Won (16–18)", value: playerHoleAnalytics.closingHolesWon, sample: `Based on ${playerHoleAnalytics.sample.matchPlayHoles} match-play holes` },
            ]} />
            <h3>Scoring</h3>
            <ScoringStatGrid items={[
              { label: "Birdies", value: playerHoleAnalytics.birdies, sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Eagles", value: playerHoleAnalytics.eagles, sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Pars", value: playerHoleAnalytics.pars, sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Bogeys", value: playerHoleAnalytics.bogeys, sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Double Bogeys+", value: playerHoleAnalytics.doubleBogeysOrWorse, sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
            ]} />
            <h3>Scoring Averages</h3>
            <ScoringStatGrid items={[
              { label: "Average Gross Score", value: formatScoringNumber(playerHoleAnalytics.averageGrossScore), sample: `Based on ${playerHoleAnalytics.sample.completeScorecards} complete scorecards` },
              { label: "Average Net Score", value: formatScoringNumber(playerHoleAnalytics.averageNetScore), sample: `Based on ${playerHoleAnalytics.sample.completeScorecards} complete scorecards with official stroke mapping` },
              { label: "Par 3 Average", value: formatScoringNumber(playerHoleAnalytics.averagePar3Score), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Par 4 Average", value: formatScoringNumber(playerHoleAnalytics.averagePar4Score), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Par 5 Average", value: formatScoringNumber(playerHoleAnalytics.averagePar5Score), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Front Nine Average", value: formatScoringNumber(playerHoleAnalytics.averageFrontNineScore), sample: `Based on ${playerHoleAnalytics.sample.completeScorecards} complete scorecards` },
              { label: "Back Nine Average", value: formatScoringNumber(playerHoleAnalytics.averageBackNineScore), sample: `Based on ${playerHoleAnalytics.sample.completeScorecards} complete scorecards` },
            ]} />
            <h3>Percentages</h3>
            <ScoringStatGrid items={[
              { label: "Birdie %", value: formatScoringNumber(playerHoleAnalytics.birdieRate, { percentage: true }), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Par %", value: formatScoringNumber(playerHoleAnalytics.parRate, { percentage: true }), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Bogey %", value: formatScoringNumber(playerHoleAnalytics.bogeyRate, { percentage: true }), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
              { label: "Double Bogey+ %", value: formatScoringNumber(playerHoleAnalytics.doubleBogeyOrWorseRate, { percentage: true }), sample: `Based on ${playerHoleAnalytics.sample.scoringHoles} scoring holes` },
            ]} />
          </div>
        </details>

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
                <strong>{formatPoints(row.record.points)}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
