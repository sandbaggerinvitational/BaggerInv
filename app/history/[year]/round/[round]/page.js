export const dynamic = "force-dynamic";
import {
  refreshCanonical2023HistoricalData,
  refreshCanonical2024HistoricalData,
  refreshHistoricalData,
} from "../../../../../lib/stats";
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
import {
  loadCanonical2023HistoryAnalytics,
  loadCanonical2024HistoryAnalytics,
  loadLegacyHistoryAnalytics,
} from "../../../../../lib/legacy-history-analytics";
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
  buildHistoricalScrambleRoundStatisticHolders,
  canonicalizeHistoricalScrambleScorecardPresentation,
  build2025ScrambleRoundStatisticHolders,
  canonicalize2025ScrambleScorecardPresentation,
} from "../../../../../lib/history-2025-tournament-records";
import {
  build2026BestBallLowestTeamRound,
  build2026ScrambleRoundStatisticHolders,
} from "../../../../../lib/history-2026-round-presentation";
import {
  buildHistoricalIndividualBirdieHolders,
  buildHistoricalIndividualStatisticHolders,
  omitMeaninglessHistoricalBirdieLeader,
  selectCanonical2024IndividualStatisticScorecards,
  selectCanonical2024NetPresentationScorecards,
} from "../../../../../lib/history-2024-net-projection";
import {
  completedHistoryHoleStatisticItem,
  orderCompletedHistoryRoundStatistics,
} from "../../../../../lib/completed-history-round-statistics";
import {
  reconcileCanonical2023ScorecardPresentation,
  selectCanonical2023IndividualStatisticScorecards,
  selectCanonical2023NetPresentationScorecards,
} from "../../../../../lib/history-2023-projection";

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
    await (Number(year) === 2023
      ? refreshCanonical2023HistoricalData()
      : Number(year) === 2024
        ? refreshCanonical2024HistoricalData()
        : refreshHistoricalData());
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
    const canonical2023 = Number(year) === 2023;
    const canonical2024 = Number(year) === 2024;
    const scorecardAnalyticsPromise = canonical2023
      ? loadCanonical2023HistoryAnalytics()
      : canonical2024
        ? loadCanonical2024HistoryAnalytics()
        : loadLegacyHistoryAnalytics();
    await (canonical2023
      ? refreshCanonical2023HistoricalData()
      : canonical2024
        ? refreshCanonical2024HistoricalData()
        : refreshHistoricalData());
    archive = getHistoricalRound(year, round);
    scorecardAnalytics = await scorecardAnalyticsPromise;
  }

  if (!archive) notFound();
  const completed2023 = !useSupabase2026 && Number(archive.year) === 2023;
  const completed2024 = !useSupabase2026 && Number(archive.year) === 2024;
  const completed2025 = !useSupabase2026 && Number(archive.year) === 2025;
  const completedHistoryMaster = completed2023 || completed2024 || completed2025;
  const canonicalFormat = completedHistoryMaster && archive.format === "BB"
    ? "Best Ball"
    : getFormatName(archive.format);
  const canonical2023RoundScorecards = completed2023
    ? selectCanonical2023NetPresentationScorecards({
      year: archive.year,
      round: archive.round,
      scorecards: scorecardAnalytics.scorecards,
      projectedScorecards: scorecardAnalytics.history2023NetProjectionScorecards,
    })
    : [];
  const roundScorecards = completed2023
    ? canonical2023RoundScorecards.filter((scorecard) =>
      ["COMPLETE", "VERIFIED"].includes(String(scorecard?.status || "").toUpperCase()) &&
      Number(scorecard?.completedHoleCount) === 18
    )
    : filterScorecards(scorecardAnalytics.usableScorecards, {
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
  const canonical2024IndividualStatisticScorecards = completed2024
    ? selectCanonical2024IndividualStatisticScorecards({
      scorecards: scorecardAnalytics.scorecards,
      projectedScorecards: scorecardAnalytics.history2024NetProjectionScorecards,
    }).filter((scorecard) => Number(scorecard?.round) === Number(archive.round))
    : [];
  const canonical2024IndividualStatistics = canonical2024IndividualStatisticScorecards.length
    ? buildScoringHighlights(
      canonical2024IndividualStatisticScorecards,
      canonical2024IndividualStatisticScorecards.length
    )
    : null;
  const canonical2023IndividualStatisticScorecards = completed2023
    ? selectCanonical2023IndividualStatisticScorecards({
      scorecards: scorecardAnalytics.scorecards,
      projectedScorecards: scorecardAnalytics.history2023NetProjectionScorecards,
    }).filter((scorecard) => Number(scorecard?.round) === Number(archive.round))
    : [];
  const canonical2023IndividualStatistics = canonical2023IndividualStatisticScorecards.length
    ? buildScoringHighlights(
      canonical2023IndividualStatisticScorecards,
      canonical2023IndividualStatisticScorecards.length
    )
    : null;
  const legacyScorecardCoverage = useSupabase2026 ? null : buildLegacyHistoryScorecardCoverage({
    year: archive.year,
    matches: getTournamentMatches(archive.year).filter((match) => Number(match.Round) === Number(archive.round)),
    scorecards: scorecardAnalytics.scorecards,
    teamIds: [archive.teamOne.id, archive.teamTwo.id],
  });
  const completeLegacyMatchIds = new Set(legacyScorecardCoverage?.completeMatchIds || []);
  const legacyMatchCoverageById = new Map((legacyScorecardCoverage?.matches || []).map((match) => [match.matchId, match]));
  const scorecardCoverageForMatch = (matchId) => legacyMatchCoverageById.get(matchId) || null;
  const legacyRoundMatches = useSupabase2026
    ? []
    : getTournamentMatches(archive.year).filter((match) => Number(match.Round) === Number(archive.round));
  const displayScorecardsForMatch = (matchId) => {
    const presentationScorecards = completed2023
      ? canonical2023RoundScorecards
      : completed2024 && [1, 3].includes(Number(archive.round))
        ? selectCanonical2024NetPresentationScorecards({
          year: archive.year,
          round: archive.round,
          scorecards: scorecardAnalytics.scorecards,
          projectedScorecards: scorecardAnalytics.history2024NetProjectionScorecards,
        })
        : scorecardAnalytics.scorecards;
    const cards = filterScorecards(presentationScorecards, { matchId });
    const formatAwareCards = Number(archive.round) === 2 && (completed2023 || completed2024 || completed2025)
      ? completed2025
        ? canonicalize2025ScrambleScorecardPresentation({
          scorecards: cards,
          matches: legacyRoundMatches,
          teams: archive.tournament.teams,
        })
        : canonicalizeHistoricalScrambleScorecardPresentation({
          year: archive.year,
          round: archive.round,
          scorecards: cards,
          matches: legacyRoundMatches,
          teams: archive.tournament.teams,
        })
      : cards;
    return completed2023
      ? reconcileCanonical2023ScorecardPresentation({
        scorecards: formatAwareCards,
        matches: legacyRoundMatches,
      })
      : formatAwareCards;
  };
  const scrambleStatisticHolders = completedHistoryMaster && Number(archive.round) === 2
    ? completed2025
      ? build2025ScrambleRoundStatisticHolders({
        scorecards: roundScorecards,
        matches: legacyRoundMatches,
        teams: archive.tournament.teams,
        acceptedValues: {
          mostBirdies: roundStatistics.mostBirdies.value,
          lowestFrontNine: roundStatistics.lowestFrontNine.value,
          lowestBackNine: roundStatistics.lowestBackNine.value,
          lowestTeamRound: roundStatistics.lowestTeamRound.value,
        },
      })
      : buildHistoricalScrambleRoundStatisticHolders({
        year: archive.year,
        round: archive.round,
        scorecards: roundScorecards,
        matches: legacyRoundMatches,
        teams: archive.tournament.teams,
        acceptedValues: {
          mostBirdies: roundStatistics.mostBirdies.value,
          lowestFrontNine: roundStatistics.lowestFrontNine.value,
          lowestBackNine: roundStatistics.lowestBackNine.value,
          lowestTeamRound: roundStatistics.lowestTeamRound.value,
        },
      })
    : useSupabase2026 && archive.format === "SC"
      ? build2026ScrambleRoundStatisticHolders({
        scorecards: roundScorecards,
        acceptedValues: {
          birdieLeader: roundStatistics.mostBirdies.value,
          lowestFrontNine: roundStatistics.lowestFrontNine.value,
          lowestBackNine: roundStatistics.lowestBackNine.value,
          lowestTeamRound: roundStatistics.lowestTeamRound.value,
        },
      })
      : null;
  const individualStatisticHolders = completedHistoryMaster && archive.format !== "SC"
    ? buildHistoricalIndividualStatisticHolders({
      year: archive.year,
      round: archive.round,
      scorecards: roundScorecards,
      acceptedValues: {
        lowestRound: roundStatistics.lowestRound.value,
        lowestFrontNine: roundStatistics.lowestFrontNine.value,
        lowestBackNine: roundStatistics.lowestBackNine.value,
      },
    })
    : null;
  const bestBallLowestTeamRound = useSupabase2026 && archive.format === "BB"
    ? build2026BestBallLowestTeamRound(roundScorecards)
    : null;
  const participant = (record) => {
    if (record?.scorecard?.scoreType === "TEAM") {
      if (Number(record.scorecard.side) === 1) return archive.teamOne.name;
      if (Number(record.scorecard.side) === 2) return archive.teamTwo.name;
    }
    return record?.scorecard?.playerName || record?.scorecard?.teamName || record?.scorecard?.playerId || record?.scorecard?.teamId || "";
  };
  const roundBirdieLeader = (completedHistoryMaster || useSupabase2026) && archive.format === "SC"
    ? roundStatistics.mostBirdies
    : roundStatistics.birdieLeader;
  const birdieLeaderHolders = completedHistoryMaster && archive.format === "SC"
    ? scrambleStatisticHolders?.mostBirdies
    : useSupabase2026 && archive.format === "SC"
      ? scrambleStatisticHolders?.birdieLeader
      : undefined;
  const completed2023RoundBirdieLeader = canonical2023IndividualStatistics?.birdieLeader || null;
  const completed2023RoundBirdieHolders = completed2023RoundBirdieLeader
    ? buildHistoricalIndividualBirdieHolders({
      year: archive.year,
      round: archive.round,
      scorecards: canonical2023IndividualStatisticScorecards,
      acceptedValue: completed2023RoundBirdieLeader.value,
    })
    : [];
  const completed2024RoundBirdieLeader = canonical2024IndividualStatistics?.birdieLeader || null;
  const completed2024RoundBirdieHolders = completed2024RoundBirdieLeader
    ? buildHistoricalIndividualBirdieHolders({
      year: archive.year,
      round: archive.round,
      scorecards: canonical2024IndividualStatisticScorecards,
      acceptedValue: completed2024RoundBirdieLeader.value,
    })
    : [];
  const displayedBirdieLeader = completed2023RoundBirdieLeader || completed2024RoundBirdieLeader || roundBirdieLeader;
  const lowestTeamRound = bestBallLowestTeamRound || roundStatistics.lowestTeamRound;
  const lowestTeamRoundHolders = bestBallLowestTeamRound?.holders || scrambleStatisticHolders?.lowestTeamRound;
  const showLowestRound = !((completedHistoryMaster || useSupabase2026) && archive.format === "SC");
  const showLowestTeamRound = !useSupabase2026 || archive.format === "SC" ||
    (archive.format === "BB" && bestBallLowestTeamRound?.sampleSize > 0);
  const lowestRoundStatisticItem = { label: "Lowest Round", value: formatScoringNumber(roundStatistics.lowestRound.value), detail: participant(roundStatistics.lowestRound), holders: individualStatisticHolders?.lowestRound, sample: roundStatistics.lowestRound.label };
  const lowestFrontNineStatisticItem = {
    label: "Lowest Front Nine",
    value: formatScoringNumber(roundStatistics.lowestFrontNine.value),
    detail: participant(roundStatistics.lowestFrontNine),
    holders: scrambleStatisticHolders?.lowestFrontNine,
    ...(individualStatisticHolders?.lowestFrontNine ? { holders: individualStatisticHolders.lowestFrontNine } : {}),
    sample: roundStatistics.lowestFrontNine.label,
  };
  const lowestBackNineStatisticItem = {
    label: "Lowest Back Nine",
    value: formatScoringNumber(roundStatistics.lowestBackNine.value),
    detail: participant(roundStatistics.lowestBackNine),
    holders: scrambleStatisticHolders?.lowestBackNine,
    ...(individualStatisticHolders?.lowestBackNine ? { holders: individualStatisticHolders.lowestBackNine } : {}),
    sample: roundStatistics.lowestBackNine.label,
  };
  const averageScoreStatisticItem = { label: "Average Score", value: formatScoringNumber(roundStatistics.averageScore.value), sample: roundStatistics.averageScore.label };
  const courseDifficultyStatistics = canonical2023IndividualStatistics || canonical2024IndividualStatistics || roundStatistics;
  const hardestHoleStatisticItem = completedHistoryMaster
    ? completedHistoryHoleStatisticItem({ label: "Hardest Hole", hole: courseDifficultyStatistics.hardestHole })
    : { label: "Hardest Hole", value: roundStatistics.hardestHole ? `#${roundStatistics.hardestHole.holeNumber}` : "—", detail: roundStatistics.hardestHole ? `Hole ${roundStatistics.hardestHole.holeNumber}${roundStatistics.hardestHole.tee ? ` · ${roundStatistics.hardestHole.tee}` : ""}` : "", sample: roundStatistics.hardestHole?.averageToPar.label };
  const easiestHoleStatisticItem = completedHistoryMaster
    ? completedHistoryHoleStatisticItem({ label: "Easiest Hole", hole: courseDifficultyStatistics.easiestHole })
    : { label: "Easiest Hole", value: roundStatistics.easiestHole ? `#${roundStatistics.easiestHole.holeNumber}` : "—", detail: roundStatistics.easiestHole ? `Hole ${roundStatistics.easiestHole.holeNumber}${roundStatistics.easiestHole.tee ? ` · ${roundStatistics.easiestHole.tee}` : ""}` : "", sample: roundStatistics.easiestHole?.averageToPar.label };
  const birdieLeaderStatisticItem = { label: "Birdie Leader",
    value: formatScoringNumber(displayedBirdieLeader.value),
    detail: participant(displayedBirdieLeader),
    holders: birdieLeaderHolders,
    ...(completed2023RoundBirdieLeader ? { holders: completed2023RoundBirdieHolders } : {}),
    ...(completed2024RoundBirdieLeader ? { holders: completed2024RoundBirdieHolders } : {}),
    sample: displayedBirdieLeader.label,
  };
  const showBirdieLeader = !omitMeaninglessHistoricalBirdieLeader({
    year: archive.year,
    value: displayedBirdieLeader.value,
  });
  const lowestTeamRoundStatisticItem = { label: "Lowest Team Round", value: formatScoringNumber(lowestTeamRound.value), detail: bestBallLowestTeamRound ? "" : participant(roundStatistics.lowestTeamRound), holders: lowestTeamRoundHolders, sample: lowestTeamRound.label };
  const legacyHistoricalRoundStatisticItems = [
    ...(showLowestRound ? [lowestRoundStatisticItem] : []),
    ...(!completed2025 && !useSupabase2026 ? [{ label: "Most Birdies", value: formatScoringNumber(roundStatistics.mostBirdies.value), detail: participant(roundStatistics.mostBirdies), sample: roundStatistics.mostBirdies.label }] : []),
    lowestFrontNineStatisticItem,
    lowestBackNineStatisticItem,
    averageScoreStatisticItem,
    hardestHoleStatisticItem,
    easiestHoleStatisticItem,
    ...(showBirdieLeader ? [birdieLeaderStatisticItem] : []),
    ...(showLowestTeamRound ? [lowestTeamRoundStatisticItem] : []),
  ];
  const completedHistoryRoundStatisticItems = orderCompletedHistoryRoundStatistics({
    format: archive.format,
    lowestFrontNine: lowestFrontNineStatisticItem,
    lowestBackNine: lowestBackNineStatisticItem,
    lowestRound: lowestRoundStatisticItem,
    lowestTeamRound: lowestTeamRoundStatisticItem,
    birdieLeader: showBirdieLeader ? birdieLeaderStatisticItem : null,
    averageScore: averageScoreStatisticItem,
    hardestHole: hardestHoleStatisticItem,
    easiestHole: easiestHoleStatisticItem,
  });
  const roundStatisticItems = useSupabase2026 ? [
    ...(showLowestRound ? [lowestRoundStatisticItem] : []),
    lowestFrontNineStatisticItem,
    lowestBackNineStatisticItem,
    averageScoreStatisticItem,
    birdieLeaderStatisticItem,
    ...(showLowestTeamRound ? [lowestTeamRoundStatisticItem] : []),
    hardestHoleStatisticItem,
    easiestHoleStatisticItem,
  ] : completedHistoryMaster ? completedHistoryRoundStatisticItems : legacyHistoricalRoundStatisticItems;
  const applicableRoundStatisticItems = roundStatisticItems.filter((item) =>
    item.value !== "—" && !/^Based on 0 recorded/i.test(String(item.sample || ""))
  );
  const legacyRoundStatisticItems = useSupabase2026 ? applicableRoundStatisticItems : [
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
            <span>{archive.roundWinner === "In Progress" ? "Round Status" : completedHistoryMaster && archive.roundWinner === "Halved" ? "Round Result" : "Round Winner"}</span>
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
          <div className={`${styles.roundMatchGrid} ${useSupabase2026 ? pwaStyles.matchList : ""} ${completedHistoryMaster ? completedRoundStyles.matchList : ""}`}>
            {archive.matches.map((match) => (
              useSupabase2026 ? <HistoricalMatchRow key={match.id} match={match} round={{ label: `Round ${archive.round}`, format: canonicalFormat }} tournament={archive} scorecards={displayScorecardsForMatch(match.id)} /> : completed2023 ? <PublicMatchCard
                key={match.id}
                match={{ ...match, format: match.format || archive.format, formatName: canonicalFormat }}
                round={{ label: `Round ${archive.round}`, format: canonicalFormat, course: { name: archive.course.Course } }}
                tournament={archive}
                variant="historical"
                scorecards={scorecardCoverageForMatch(match.id)?.state !== "NONE" ? displayScorecardsForMatch(match.id) : []}
                scorecardCoverage={scorecardCoverageForMatch(match.id)}
                historyDensity
                completedHistoryCompact={completedHistoryMaster}
              /> : <PublicMatchCard
                key={match.id}
                match={{ ...match, format: match.format || archive.format, formatName: canonicalFormat }}
                round={{ label: `Round ${archive.round}`, format: canonicalFormat, course: { name: archive.course.Course } }}
                tournament={archive}
                variant="historical"
                scorecards={completeLegacyMatchIds.has(match.id) ? displayScorecardsForMatch(match.id) : []}
                historyDensity
                completedHistoryCompact={completedHistoryMaster}
              />
            ))}
          </div>
        )}

        {completedHistoryMaster ? (applicableRoundStatisticItems.length ? <section className={styles.section}>
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
