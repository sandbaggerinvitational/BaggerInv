export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../../../lib/stats";
import { notFound } from "next/navigation";
import { Header } from "../../../../components";
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
  getTournamentMatches,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";
import { formatTeamPoints } from "../../../../../lib/formatters";
import { pageMetadata } from "../../../../../lib/seo";
import { loadLegacyHistoryAnalytics } from "../../../../../lib/legacy-history-analytics";
import { buildScoringHighlights, filterScorecards } from "../../../../../lib/scorecard-analytics";
import { buildLegacyHistoryScorecardCoverage } from "../../../../../lib/legacy-history-scorecard-coverage";
import ScoringStatGrid, { formatScoringNumber } from "../../../../ScoringStatGrid";
import {
  history2026RoundPageModel,
  isSupabaseHistory2026,
  loadHistory2026View,
} from "../../../../../lib/history-2026-service";
import HistoryUnavailablePage from "../../../HistoryUnavailable";
import HistoricalMatchRow from "../../../HistoricalMatchRow";
import pwaStyles from "../../../history-participant.module.css";
import completedRoundStyles from "./completed-round-2025.module.css";
import HistoryBackToTop from "../../../HistoryBackToTop";
import {
  build2025ScrambleRoundStatisticHolders,
  canonicalize2025ScrambleScorecardPresentation,
} from "../../../../../lib/history-2025-tournament-records";

function displayPoints(value) {
  return formatTeamPoints(value);
}

export async function generateMetadata({ params }) {
  const { year, round } = await params;
  let archive;

  if (isSupabaseHistory2026(year)) {
    try {
      archive = history2026RoundPageModel(
        await loadHistory2026View({ year: Number(year) }),
        round
      )?.archive;
    } catch {
      archive = null;
    }
  } else {
    await refreshHistoricalData();
    archive = getHistoricalRound(year, round);
  }

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
  const { year, round } = await params;
  const useSupabase2026 = isSupabaseHistory2026(year);
  let archive;
  let scorecardAnalytics;

  if (useSupabase2026) {
    try {
      const model = history2026RoundPageModel(
        await loadHistory2026View({ year: Number(year) }),
        round
      );
      if (model?.archive && !model.scorecardAnalytics) {
        throw new Error("The 2026 historical round view is incomplete.");
      }
      archive = model?.archive ?? null;
      scorecardAnalytics = model?.scorecardAnalytics ?? null;
    } catch {
      return (
        <HistoryUnavailablePage year={year} section={`Round ${round} History`} />
      );
    }
  } else {
    const scorecardAnalyticsPromise = loadLegacyHistoryAnalytics();
    await refreshHistoricalData();
    archive = getHistoricalRound(year, round);
    scorecardAnalytics = await scorecardAnalyticsPromise;
  }

  if (!archive) notFound();
  const completed2025 = !useSupabase2026 && Number(archive.year) === 2025;
  const canonicalFormat = completed2025 && archive.format === "BB"
    ? "Best Ball"
    : getFormatName(archive.format);
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
  const legacyScorecardCoverage = useSupabase2026 ? null : buildLegacyHistoryScorecardCoverage({
    year: archive.year,
    matches: getTournamentMatches(archive.year).filter((match) => Number(match.Round) === Number(archive.round)),
    scorecards: scorecardAnalytics.scorecards,
    teamIds: [archive.teamOne.id, archive.teamTwo.id],
  });
  const completeLegacyMatchIds = new Set(legacyScorecardCoverage?.completeMatchIds || []);
  const displayScorecardsForMatch = (matchId) => {
    const cards = filterScorecards(scorecardAnalytics.scorecards, { matchId });
    return completed2025 && Number(archive.round) === 2
      ? canonicalize2025ScrambleScorecardPresentation({
        scorecards: cards,
        teams: archive.tournament.teams,
      })
      : cards;
  };
  const scrambleStatisticHolders = completed2025 && Number(archive.round) === 2
    ? build2025ScrambleRoundStatisticHolders({
      scorecards: roundScorecards,
      matches: getTournamentMatches(archive.year).filter((match) => Number(match.Round) === Number(archive.round)),
      teams: archive.tournament.teams,
      acceptedValues: {
        mostBirdies: roundStatistics.mostBirdies.value,
        lowestFrontNine: roundStatistics.lowestFrontNine.value,
        lowestBackNine: roundStatistics.lowestBackNine.value,
        lowestTeamRound: roundStatistics.lowestTeamRound.value,
      },
    })
    : null;
  const participant = (record) => {
    if (record?.scorecard?.scoreType === "TEAM") {
      if (Number(record.scorecard.side) === 1) return archive.teamOne.name;
      if (Number(record.scorecard.side) === 2) return archive.teamTwo.name;
    }
    return record?.scorecard?.playerName || record?.scorecard?.teamName || record?.scorecard?.playerId || record?.scorecard?.teamId || "";
  };
  const holeLabel = (hole) => hole
    ? `Hole ${hole.holeNumber}${hole.tee ? ` · ${hole.tee}` : ""}`
    : "";
  const roundBirdieLeader = completed2025 && archive.format === "SC"
    ? roundStatistics.mostBirdies
    : roundStatistics.birdieLeader;
  const roundStatisticItems = [
    { label: "Lowest Round", value: formatScoringNumber(roundStatistics.lowestRound.value), detail: participant(roundStatistics.lowestRound), sample: roundStatistics.lowestRound.label },
    ...(!completed2025 ? [{ label: "Most Birdies", value: formatScoringNumber(roundStatistics.mostBirdies.value), detail: participant(roundStatistics.mostBirdies), sample: roundStatistics.mostBirdies.label }] : []),
    { label: "Lowest Front Nine", value: formatScoringNumber(roundStatistics.lowestFrontNine.value), detail: participant(roundStatistics.lowestFrontNine), holders: scrambleStatisticHolders?.lowestFrontNine, sample: roundStatistics.lowestFrontNine.label },
    { label: "Lowest Back Nine", value: formatScoringNumber(roundStatistics.lowestBackNine.value), detail: participant(roundStatistics.lowestBackNine), holders: scrambleStatisticHolders?.lowestBackNine, sample: roundStatistics.lowestBackNine.label },
    { label: "Average Score", value: formatScoringNumber(roundStatistics.averageScore.value), sample: roundStatistics.averageScore.label },
    { label: "Hardest Hole", value: roundStatistics.hardestHole ? `#${roundStatistics.hardestHole.holeNumber}` : "—", detail: holeLabel(roundStatistics.hardestHole), sample: roundStatistics.hardestHole?.averageToPar.label },
    { label: "Easiest Hole", value: roundStatistics.easiestHole ? `#${roundStatistics.easiestHole.holeNumber}` : "—", detail: holeLabel(roundStatistics.easiestHole), sample: roundStatistics.easiestHole?.averageToPar.label },
    { label: "Birdie Leader", value: formatScoringNumber(roundBirdieLeader.value), detail: participant(roundBirdieLeader), holders: completed2025 && archive.format === "SC" ? scrambleStatisticHolders?.mostBirdies : undefined, sample: roundBirdieLeader.label },
    { label: "Lowest Team Round", value: formatScoringNumber(roundStatistics.lowestTeamRound.value), detail: participant(roundStatistics.lowestTeamRound), holders: scrambleStatisticHolders?.lowestTeamRound, sample: roundStatistics.lowestTeamRound.label },
  ];
  const applicableRoundStatisticItems = roundStatisticItems.filter((item) =>
    item.value !== "—" && !/^Based on 0 recorded/i.test(String(item.sample || ""))
  );
  const legacyRoundStatisticItems = useSupabase2026 ? roundStatisticItems : [
    ...roundStatisticItems, {
      label: "Historical Scorecards",
      value: legacyScorecardCoverage?.completeMatchScorecards === legacyScorecardCoverage?.canonicalMatches
        ? `All ${legacyScorecardCoverage.canonicalMatches} matches`
        : `${legacyScorecardCoverage?.completeMatchScorecards || 0} matches`,
      detail: "Scorecard detail available",
    },
  ];

  return (
    <main>
      <Header />

      <section className={`${styles.roundArchiveHero} ${useSupabase2026 ? pwaStyles.roundHero : ""}`}>
        <AssetImage
          src={courseHero(archive.course["Course Profile Image"])}
          alt={`${archive.course.Course} course`}
          className={styles.roundArchiveHeroImage}
          fallbackClassName={styles.roundArchiveHeroFallback}
          fallback={archive.tournament.Destination}
          loading="eager"
          width={1440}
          height={720}
          sizes="100vw"
          decoding="async"
          fetchPriority="high"
        />
        <div className={styles.roundArchiveHeroShade} />

        <div className={`${styles.roundArchiveHeroContent} ${useSupabase2026 ? pwaStyles.roundHeroContent : ""}`}>
          <div className={`${styles.roundArchiveCourseLogo} ${useSupabase2026 ? pwaStyles.roundCourseLogo : ""}`}>
            <AssetImage
              src={courseLogo(archive.course["Course Logo"])}
              alt={`${archive.course.Course} logo`}
              className={styles.roundArchiveCourseLogoImage}
              fallbackClassName={styles.roundArchiveCourseLogoFallback}
              fallback="⛳"
              width={150}
              height={150}
              sizes="(max-width: 720px) 72px, 150px"
              decoding="async"
            />
          </div>

          <div>
            <p>
              {archive.year} · Round {archive.round}
            </p>
            <h1>{archive.course.Course}</h1>
            <h2>{canonicalFormat}</h2>
            <span>
              {archive.course.City}, {archive.course.State}
            </span>
          </div>
        </div>
      </section>

      <section className={`${styles.content} ${useSupabase2026 ? pwaStyles.roundContent : ""}`}>
        <HistoricalDetailNavigation
          backHref={`/history/${archive.year}`}
          backLabel="Tournament"
          backDetail={String(archive.year)}
          backAriaLabel={`${archive.year} Tournament`}
          completedYear={Number(archive.year) >= 2017 && Number(archive.year) <= 2026}
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

        <div className={`${styles.roundArchiveScoreboard} ${useSupabase2026 ? pwaStyles.roundScoreboard : ""}`}>
          <div className={`${styles.roundArchiveTeam} ${useSupabase2026 ? pwaStyles.roundScoreTeam : ""}`}>
            <TeamLogoPlate
              filename={archive.teamOne.logo}
              teamName={archive.teamOne.name}
              variant="scoreboard"
            />
            <strong>{archive.teamOne.name}</strong>
            <b>{displayPoints(archive.teamOne.points)}</b>
          </div>

          <div className={`${styles.roundArchiveWinner} ${useSupabase2026 ? pwaStyles.roundScoreWinner : ""}`}>
            <span>{archive.roundWinner === "In Progress" ? "Round Status" : completed2025 && archive.roundWinner === "Halved" ? "Round Result" : "Round Winner"}</span>
            <strong>{archive.roundWinner}</strong>
          </div>

          <div className={`${styles.roundArchiveTeam} ${useSupabase2026 ? pwaStyles.roundScoreTeam : ""}`}>
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
          <div className={`${styles.roundMatchGrid} ${useSupabase2026 ? pwaStyles.matchList : ""} ${completed2025 ? completedRoundStyles.matchList : ""}`}>
            {archive.matches.map((match) => (
              useSupabase2026 ? <HistoricalMatchRow key={match.id} match={match} round={{ label: `Round ${archive.round}`, format: canonicalFormat }} tournament={archive} scorecards={displayScorecardsForMatch(match.id)} /> : <PublicMatchCard key={match.id} match={{ ...match, format: match.format || archive.format, formatName: canonicalFormat }} round={{ label: `Round ${archive.round}`, format: canonicalFormat, course: { name: archive.course.Course } }} tournament={archive} variant="historical" scorecards={completeLegacyMatchIds.has(match.id) ? displayScorecardsForMatch(match.id) : []} historyDensity completedHistoryCompact={completed2025} />
            ))}
          </div>
        )}

        {completed2025 ? (applicableRoundStatisticItems.length ? <section className={styles.section}>
          <span className={styles.sectionLabel}>Round Insights</span>
          <h2>Round Statistics</h2>
          <details className={completedRoundStyles.statistics}>
            <summary>View Round Statistics <span aria-hidden="true">⌄</span></summary>
            <div><ScoringStatGrid items={applicableRoundStatisticItems} /></div>
          </details>
        </section> : null) : <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>{roundScorecards.length ? "Round Statistics" : "Historical Scorecards"}</h2>
          {roundScorecards.length ? <ScoringStatGrid items={legacyRoundStatisticItems} /> : <p className={pwaStyles.scorecardAvailability}>Detailed historical scorecards are not available for this round.</p>}
        </section>}

        <HistoryBackToTop />
      </section>
    </main>
  );
}
