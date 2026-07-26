export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../../../lib/stats";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import AssetImage from "../../../../AssetImage";
import HistoricalDetailNavigation from "../../../../HistoricalDetailNavigation";
import PublicMatchCard from "../../../../PublicMatchCard";
import TeamLogoPlate from "../../../../TeamLogoPlate";
import {
  courseHero,
  courseLogo,
} from "../../../../../lib/asset-paths";
import {
  getFormatName,
  getHistoricalRound,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";
import { formatPoints } from "../../../../../lib/formatters";
import { pageMetadata } from "../../../../../lib/seo";
import { loadScorecardAnalytics } from "../../../../../lib/scorecard-data";
import { buildScoringHighlights, filterScorecards } from "../../../../../lib/scorecard-analytics";
import ScoringStatGrid, { formatScoringNumber } from "../../../../ScoringStatGrid";

function displayPoints(value) {
  return formatPoints(value);
}

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { year, round } = await params;
  const archive = getHistoricalRound(year, round);

  const title = archive
    ? `${archive.year} Round ${archive.round} | The Sandbagger Invitational`
    : "Historical Round | The Sandbagger Invitational";
  return pageMetadata({
    title,
    description: archive
      ? `${archive.year} Round ${archive.round} ${getFormatName(archive.format)} results from ${archive.course.Course}.`
      : "Historical Sandbagger Invitational round results.",
    path: `/history/${year}/round/${round}`,
    image: archive?.course?.["Course Profile Image"]
      ? courseHero(archive.course["Course Profile Image"])
      : undefined,
  });
}

export default async function HistoricalRoundPage({ params }) {
  const scorecardAnalyticsPromise = loadScorecardAnalytics();
  await refreshHistoricalData();
  const { year, round } = await params;
  const archive = getHistoricalRound(year, round);
  if (!archive) notFound();
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const roundScorecards = filterScorecards(scorecardAnalytics.usableScorecards, {
    year: archive.year,
    round: archive.round,
  });
  const missingRoundScorecards = scorecardAnalytics.missingScorecards.filter((scorecard) =>
    scorecard.year === Number(archive.year) && scorecard.round === Number(archive.round)
  );
  const roundStatistics = buildScoringHighlights(
    roundScorecards,
    roundScorecards.length + missingRoundScorecards.length
  );
  const participant = (record) =>
    record?.scorecard?.playerName || record?.scorecard?.teamName || record?.scorecard?.playerId || record?.scorecard?.teamId || "";
  const holeLabel = (hole) => hole
    ? `Hole ${hole.holeNumber}${hole.tee ? ` · ${hole.tee}` : ""}`
    : "";

  return (
    <main>
      <Header />

      <section className={styles.roundArchiveHero}>
        <AssetImage
          src={courseHero(archive.course["Course Profile Image"])}
          alt={`${archive.course.Course} course`}
          className={styles.roundArchiveHeroImage}
          fallbackClassName={styles.roundArchiveHeroFallback}
          fallback={archive.tournament.Destination}
          loading="eager"
        />
        <div className={styles.roundArchiveHeroShade} />

        <div className={styles.roundArchiveHeroContent}>
          <div className={styles.roundArchiveCourseLogo}>
            <AssetImage
              src={courseLogo(archive.course["Course Logo"])}
              alt={`${archive.course.Course} logo`}
              className={styles.roundArchiveCourseLogoImage}
              fallbackClassName={styles.roundArchiveCourseLogoFallback}
              fallback="⛳"
            />
          </div>

          <div>
            <p>
              {archive.year} · Round {archive.round}
            </p>
            <h1>{archive.course.Course}</h1>
            <h2>{getFormatName(archive.format)}</h2>
            <span>
              {archive.course.City}, {archive.course.State}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <HistoricalDetailNavigation
          backHref={`/history/${archive.year}`}
          backLabel={`Back to ${archive.year} Tournament`}
          previousHref={
            archive.previousRound
              ? `/history/${archive.year}/round/${archive.previousRound.number}`
              : null
          }
          previousLabel={archive.previousRound?.label}
          nextHref={
            archive.nextRound
              ? `/history/${archive.year}/round/${archive.nextRound.number}`
              : null
          }
          nextLabel={archive.nextRound?.label}
          position="top"
        />

        <div className={styles.roundArchiveScoreboard}>
          <div className={styles.roundArchiveTeam}>
            <TeamLogoPlate
              filename={archive.teamOne.logo}
              teamName={archive.teamOne.name}
              variant="scoreboard"
            />
            <strong>{archive.teamOne.name}</strong>
            <b>{displayPoints(archive.teamOne.points)}</b>
          </div>

          <div className={styles.roundArchiveWinner}>
            <span>Round Winner</span>
            <strong>{archive.roundWinner}</strong>
          </div>

          <div className={styles.roundArchiveTeam}>
            <TeamLogoPlate
              filename={archive.teamTwo.logo}
              teamName={archive.teamTwo.name}
              variant="scoreboard"
            />
            <strong>{archive.teamTwo.name}</strong>
            <b>{displayPoints(archive.teamTwo.points)}</b>
          </div>
        </div>

        {!archive.matches.length ? (
          <div className={styles.roundArchiveEmpty}>
            No matchups have been recorded for this round.
          </div>
        ) : (
          <div className={styles.roundMatchGrid}>
            {archive.matches.map((match) => (
              <PublicMatchCard
                key={match.id}
                match={match}
                round={{ label: `Round ${archive.round}` }}
                tournament={archive}
                variant="historical"
                scorecards={filterScorecards(scorecardAnalytics.scorecards, { matchId: match.id })}
              />
            ))}
          </div>
        )}

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>Round Statistics</h2>
          <ScoringStatGrid items={[
            {
              label: "Lowest Round",
              value: formatScoringNumber(roundStatistics.lowestRound.value),
              detail: participant(roundStatistics.lowestRound),
              sample: roundStatistics.lowestRound.label,
            },
            {
              label: "Most Birdies",
              value: formatScoringNumber(roundStatistics.mostBirdies.value),
              detail: participant(roundStatistics.mostBirdies),
              sample: roundStatistics.mostBirdies.label,
            },
            {
              label: "Lowest Front Nine",
              value: formatScoringNumber(roundStatistics.lowestFrontNine.value),
              detail: participant(roundStatistics.lowestFrontNine),
              sample: roundStatistics.lowestFrontNine.label,
            },
            {
              label: "Lowest Back Nine",
              value: formatScoringNumber(roundStatistics.lowestBackNine.value),
              detail: participant(roundStatistics.lowestBackNine),
              sample: roundStatistics.lowestBackNine.label,
            },
            {
              label: "Average Score",
              value: formatScoringNumber(roundStatistics.averageScore.value),
              sample: roundStatistics.averageScore.label,
            },
            {
              label: "Hardest Hole",
              value: roundStatistics.hardestHole ? `#${roundStatistics.hardestHole.holeNumber}` : "—",
              detail: holeLabel(roundStatistics.hardestHole),
              sample: roundStatistics.hardestHole?.averageToPar.label,
            },
            {
              label: "Easiest Hole",
              value: roundStatistics.easiestHole ? `#${roundStatistics.easiestHole.holeNumber}` : "—",
              detail: holeLabel(roundStatistics.easiestHole),
              sample: roundStatistics.easiestHole?.averageToPar.label,
            },
            {
              label: "Birdie Leader",
              value: formatScoringNumber(roundStatistics.birdieLeader.value),
              detail: participant(roundStatistics.birdieLeader),
              sample: roundStatistics.birdieLeader.label,
            },
            {
              label: "Lowest Team Round",
              value: formatScoringNumber(roundStatistics.lowestTeamRound.value),
              detail: participant(roundStatistics.lowestTeamRound),
              sample: roundStatistics.lowestTeamRound.label,
            },
            {
              label: "Scorecard Coverage",
              value: `${roundStatistics.scorecardCoverage.available} of ${roundStatistics.scorecardCoverage.expected}`,
              detail: "Available scorecards",
              sample: roundStatistics.scorecardCoverage.label,
            },
          ]} />
        </section>

        <HistoricalDetailNavigation
          backHref={`/history/${archive.year}`}
          backLabel={`Back to ${archive.year} Tournament`}
          previousHref={
            archive.previousRound
              ? `/history/${archive.year}/round/${archive.previousRound.number}`
              : null
          }
          previousLabel={archive.previousRound?.label}
          nextHref={
            archive.nextRound
              ? `/history/${archive.year}/round/${archive.nextRound.number}`
              : null
          }
          nextLabel={archive.nextRound?.label}
        />
      </section>

      <Footer />
    </main>
  );
}
