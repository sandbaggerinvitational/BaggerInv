export const dynamic = "force-dynamic";
import { refreshCanonical2023HistoricalData, refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "../../components";
import AssetImage from "../../AssetImage";
import TeamLogoPlate from "../../TeamLogoPlate";
import {
  courseLogo,
  teamLogo,
  tournamentLogo,
} from "../../../lib/asset-paths";
import {
  formatHandicap,
  getAdjacentTournamentYears,
  getFormatName,
  getTournament,
  getTournamentMatches,
  getTournamentPlayerLeaderboard,
  getTournamentRoundPoints,
} from "../../../lib/stats";
import { addTournamentRanks } from "../../../lib/rankings";
import { formatPlayerPoints } from "../../../lib/formatters";
import styles from "../../historical.module.css";
import { pageMetadata } from "../../../lib/seo";
import TournamentLeaderboard from "../../TournamentLeaderboard";
import StatusBadge from "../../StatusBadge";
import { getDraftByYear } from "../../../lib/draft";
import {
  loadCanonical2023HistoryAnalytics,
  loadCanonical2024HistoryAnalytics,
  loadLegacyHistoryAnalytics,
} from "../../../lib/legacy-history-analytics";
import { buildScoringHighlights, filterScorecards } from "../../../lib/scorecard-analytics";
import { buildLegacyHistoryScorecardCoverage } from "../../../lib/legacy-history-scorecard-coverage";
import {
  buildHistoricalScrambleRoundStatisticHolders,
  buildHistoricalTournamentRecords,
  build2025TournamentRecords,
} from "../../../lib/history-2025-tournament-records";
import { selectCanonical2023NetPresentationScorecards } from "../../../lib/history-2023-projection";
import {
  buildHistoricalIndividualBirdieHolders,
  buildHistoricalIndividualStatisticHolders,
  combineHistoricalHolders,
  historicalHolderContext,
  historicalHolderText,
  omitMeaninglessHistoricalBirdieLeader,
  selectCanonical2024IndividualStatisticScorecards,
} from "../../../lib/history-2024-net-projection";
import ScoringStatGrid, { formatScoringNumber } from "../../ScoringStatGrid";
import {
  history2026TournamentCard,
  history2026TournamentPageModel,
  isSupabaseHistory2026,
  loadHistory2026View,
} from "../../../lib/history-2026-service";
import HistoryUnavailablePage from "../HistoryUnavailable";
import HistoryNavigation from "../HistoryNavigation";
import pwaStyles from "../history-participant.module.css";
import completedStyles from "./completed-year-2025.module.css";
import { historyCourseProfileHref } from "../../../lib/history-course-navigation";
import {
  historyEditionLabel,
  historyHeroPath,
  historyCourseDisplayName,
  historyStandingsSummary,
  historyTournamentComplete,
} from "../../../lib/history-presentation";

export async function generateMetadata({ params }) {
  const { year } = await params;
  let tournament;

  if (isSupabaseHistory2026(year)) {
    try {
      tournament = history2026TournamentCard(
        await loadHistory2026View({ year: Number(year) })
      );
    } catch {
      tournament = null;
    }
  } else {
    await (Number(year) === 2023 ? refreshCanonical2023HistoricalData() : refreshHistoricalData());
    tournament = getTournament(year);
  }

  return pageMetadata({
    title: `${year} | The Sandbagger Invitational`,
    description: `Complete ${year} Sandbagger Invitational results, teams, courses, matches, awards, and leaderboard.`,
    path: `/history/${year}`,
    image: tournament?.["Hero Image"]
      ? historyHeroPath(tournament)
      : undefined,
  });
}

function roundNumber(value) {
  return Number(String(value ?? "").replace(/\D/g, ""));
}

function pointsForRound(roundPoints, round) {
  return roundPoints.find((item) => item.round === round)?.pointsAvailable ?? null;
}

function completedFormatName(value) {
  return getFormatName(value).replace(/^2v2\s+/i, "");
}

function tournamentStatus(tournament) {
  const score = String(tournament["Final Score"] ?? "").trim();
  const winner = tournament.championTeamId;
  const runnerUp = tournament.runnerUpTeamId;
  const complete = Boolean(score || winner || runnerUp);

  return {
    complete,
    label: complete ? "Final" : "Upcoming",
    score: score || null,
  };
}

function leaderboardPlayer(row = {}) {
  const player = row.player && typeof row.player === "object" ? row.player : {};
  return {
    name: row.name || (typeof row.player === "string" ? row.player : player["Display Name"]) || row.id,
    slug: row.slug || player.slug || "",
  };
}

function rankAccessibleLabel(rank) {
  const value = String(rank || "—");
  const numeric = Number(value.replace(/\D/g, ""));
  return value.startsWith("T") && numeric
    ? `Tied for rank ${numeric}`
    : `Rank ${value}`;
}

function standingsCountLabel(value, singular, plural = `${singular}s`) {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

function scoringItems(scoringStatistics, participant, courses) {
  return [
    { label: "Best Individual Round", value: formatScoringNumber(scoringStatistics.lowestRound.value), detail: participant(scoringStatistics.lowestRound), sample: scoringStatistics.lowestRound.label, teamSide: scoringStatistics.lowestRound.scorecard?.scoreType === "TEAM" ? scoringStatistics.lowestRound.scorecard.side : null },
    { label: "Best Team Round", value: formatScoringNumber(scoringStatistics.lowestTeamRound.value), detail: participant(scoringStatistics.lowestTeamRound), sample: scoringStatistics.lowestTeamRound.label, teamSide: scoringStatistics.lowestTeamRound.scorecard?.side, participantPlayerIds: scoringStatistics.lowestTeamRound.scorecard?.participantPlayerIds },
    { label: "Average Score", value: formatScoringNumber(scoringStatistics.averageScore.value), sample: scoringStatistics.averageScore.label },
    { label: "Lowest Front", value: formatScoringNumber(scoringStatistics.lowestFrontNine.value), detail: participant(scoringStatistics.lowestFrontNine), sample: scoringStatistics.lowestFrontNine.label, teamSide: scoringStatistics.lowestFrontNine.scorecard?.scoreType === "TEAM" ? scoringStatistics.lowestFrontNine.scorecard.side : null },
    { label: "Lowest Back", value: formatScoringNumber(scoringStatistics.lowestBackNine.value), detail: participant(scoringStatistics.lowestBackNine), sample: scoringStatistics.lowestBackNine.label, teamSide: scoringStatistics.lowestBackNine.scorecard?.scoreType === "TEAM" ? scoringStatistics.lowestBackNine.scorecard.side : null },
    { label: "Birdie Leader", value: formatScoringNumber(scoringStatistics.birdieLeader.value), detail: participant(scoringStatistics.birdieLeader), sample: scoringStatistics.birdieLeader.label, teamSide: null },
    { label: "Hardest Hole", value: scoringStatistics.hardestHole ? `#${scoringStatistics.hardestHole.holeNumber}` : "—", detail: scoringStatistics.hardestHole ? historyCourseDisplayName(scoringStatistics.hardestHole.courseId, courses, scoringStatistics.hardestHole.courseName) : "", sample: scoringStatistics.hardestHole?.averageToPar.label },
    { label: "Easiest Hole", value: scoringStatistics.easiestHole ? `#${scoringStatistics.easiestHole.holeNumber}` : "—", detail: scoringStatistics.easiestHole ? historyCourseDisplayName(scoringStatistics.easiestHole.courseId, courses, scoringStatistics.easiestHole.courseName) : "", sample: scoringStatistics.easiestHole?.averageToPar.label },
    { label: "Scorecard Coverage", value: `${scoringStatistics.scorecardCoverage.available} of ${scoringStatistics.scorecardCoverage.expected}`, detail: "Available scorecards", sample: scoringStatistics.scorecardCoverage.label },
  ];
}

function completedScore(value) {
  return String(value ?? "")
    .trim()
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function CompletedYearOverview({
  tournament,
  leaderboard,
  pointsTracked,
  scorecards,
  matches,
  records = null,
}) {
  const standings = historyStandingsSummary(leaderboard, 5);
  const scoreParts = String(tournament["Final Score"] ?? "")
    .split(/\s*[-–—]\s*/)
    .map(completedScore);
  const championScore = scoreParts[0] || "—";
  const runnerUpScore = scoreParts[1] || "—";
  const allRecords = records || build2025TournamentRecords({
    scorecards,
    matches,
    teams: tournament.teams,
  }).records;
  const defaultRecordLabels = [
    "Best Individual Round",
    "Best Team Round",
    "Birdie Leader",
    "Average Score",
  ];
  const defaultRecords = defaultRecordLabels
    .map((label) => allRecords.find((item) => item.label === label))
    .filter(Boolean);
  const remainingRecords = allRecords.filter(
    (item) => !defaultRecordLabels.includes(item.label)
  );
  const renderRecord = (item, compact = false) => (
    <article className={compact ? completedStyles.recordRow : completedStyles.recordCard} key={item.key || item.label} aria-label={item.accessibleLabel}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      {item.detail ? <b>{item.detail}</b> : null}
      {item.context ? <small className={completedStyles.recordContext}>{item.context}</small> : null}
      {item.sample ? <small>{item.sample}</small> : null}
    </article>
  );
  const renderStanding = (row, keyPrefix) => {
    const player = leaderboardPlayer(row);
    const rank = row.tournamentRank || row.rank;
    return <div className={`${pwaStyles.standingsRow} ${completedStyles.standingRow}`} role="listitem" key={`${keyPrefix}-${row.id || player.name}`} aria-label={`${rankAccessibleLabel(rank)}, ${player.name}, ${standingsCountLabel(row.wins, "win")}, ${standingsCountLabel(row.losses, "loss", "losses")}, ${standingsCountLabel(row.halves, "tie")}, ${formatPlayerPoints(row.points)} points`}>
      <strong>{rank}</strong>
      <span>{player.slug ? <Link href={`/players/${player.slug}`}>{player.name}<small>{row.wins} W · {row.losses} L · {row.halves} T</small></Link> : <>{player.name}<small>{row.wins} W · {row.losses} L · {row.halves} T</small></>}</span>
      <b>{pointsTracked ? formatPlayerPoints(row.points) : `${row.wins}-${row.losses}-${row.halves}`}</b>
    </div>;
  };

  return <div className={completedStyles.story} data-completed-overview={tournament.year}>
    <section className={completedStyles.champion} data-completed-champion aria-labelledby="completed-champion-heading">
      <div className={completedStyles.championHeading}>
        <span>Final</span>
        <h2 id="completed-champion-heading">Tournament Final</h2>
      </div>
      <div className={completedStyles.result} role="group" aria-label={`${tournament.championTeam?.name}, ${tournament.year} Champions, ${championScore} points. ${tournament.runnerUpTeam?.name}, Runner-up, ${runnerUpScore} points.`}>
        <Link className={completedStyles.resultTeam} href={`/history/${tournament.year}/team/${encodeURIComponent(tournament.championTeam?.side || "Team 1")}`}>
          <AssetImage src={teamLogo(tournament.championTeam?.logo)} alt="" className={completedStyles.resultLogo} fallbackClassName={completedStyles.resultLogoFallback} fallback={tournament.championTeam?.name?.slice(0, 1) || "C"} inferFallback={false} />
          <span><small>Champions</small><strong>{tournament.championTeam?.name || "To Be Determined"}</strong></span>
          <b>{championScore}</b>
        </Link>
        <div className={completedStyles.finalDivider}><span>Final score</span><i aria-hidden="true" /></div>
        <Link className={completedStyles.resultTeam} data-runner-up="true" href={`/history/${tournament.year}/team/${encodeURIComponent(tournament.runnerUpTeam?.side || "Team 2")}`}>
          <AssetImage src={teamLogo(tournament.runnerUpTeam?.logo)} alt="" className={completedStyles.resultLogo} fallbackClassName={completedStyles.resultLogoFallback} fallback={tournament.runnerUpTeam?.name?.slice(0, 1) || "R"} inferFallback={false} />
          <span><small>Runner-up</small><strong>{tournament.runnerUpTeam?.name || "To Be Determined"}</strong></span>
          <b>{runnerUpScore}</b>
        </Link>
      </div>
    </section>

    <section className={pwaStyles.overviewSection} data-completed-rounds aria-labelledby="completed-rounds-heading">
      <span className={styles.sectionLabel}>Rounds</span>
      <h2 id="completed-rounds-heading">Tournament Rounds</h2>
      <div className={pwaStyles.overviewRoundList}>
        {tournament.courses.map((course) => {
          const round = roundNumber(course.Round);
          return <article className={pwaStyles.overviewRound} key={`${course["Course ID"]}-${course.Round}`}>
            <Link className={pwaStyles.overviewRoundPrimary} href={`/history/${tournament.year}/round/${round}`}>
              <AssetImage src={courseLogo(course["Course Logo"])} alt="" className={pwaStyles.overviewRoundLogo} fallbackClassName={pwaStyles.overviewRoundLogoFallback} fallback="⛳" />
              <span>
                <b>{course.Round} · {completedFormatName(course.Format)}</b>
                <strong>{course.Course}</strong>
              </span>
              <em>View Round <i aria-hidden="true">→</i></em>
            </Link>
            <Link className={pwaStyles.overviewRoundCourse} href={historyCourseProfileHref({ courseId: course["Course ID"], year: tournament.year, round })}>Course Profile</Link>
          </article>;
        })}
      </div>
    </section>

    <section className={pwaStyles.overviewSection} data-completed-teams aria-labelledby="completed-teams-heading">
      <span className={styles.sectionLabel}>Teams</span>
      <h2 id="completed-teams-heading">The Teams</h2>
      <div className={pwaStyles.overviewTeamList}>
        {tournament.teams.map((team) => <Link className={`${pwaStyles.overviewTeam} ${completedStyles.teamSummary}`} href={`/history/${tournament.year}/team/${encodeURIComponent(team.side)}`} key={team.side}>
          <AssetImage src={teamLogo(team.logo)} alt="" className={pwaStyles.overviewTeamLogo} fallbackClassName={pwaStyles.overviewTeamFallback} fallback={team.name.slice(0, 1)} inferFallback={false} />
          <strong>{team.name}</strong>
          <span className={completedStyles.teamMetadata}>
            <small>Captain · {team.captain?.["Display Name"] || team.captainRecordedName || "Captain not recorded"}</small>
            <small>Avg. Team Handicap · {formatHandicap(team.averageHandicap)}</small>
          </span>
          <b className={completedStyles.teamAction}>View Full Roster <i aria-hidden="true">→</i></b>
        </Link>)}
      </div>
    </section>

    <section className={pwaStyles.overviewSection} data-completed-standings aria-labelledby="completed-standings-heading">
      <span className={styles.sectionLabel}>Player Standings</span>
      <h2 id="completed-standings-heading">Final Player Standings</h2>
      <div className={`${pwaStyles.standingsSummary} ${completedStyles.standings}`} role="list" aria-label="Top final player standings">
        {standings.map((row) => renderStanding(row, "summary"))}
      </div>
      <details className={`${pwaStyles.recordsDetails} ${completedStyles.disclosure}`} data-completed-standings-disclosure>
        <summary><span className={completedStyles.closedLabel}>View Full Standings</span><span className={completedStyles.openLabel}>Hide Full Standings</span></summary>
        <div className={completedStyles.disclosureBody}>
          <div className={`${pwaStyles.standingsSummary} ${completedStyles.standings} ${completedStyles.fullStandings}`} role="list" aria-label="Full final player standings">
            {leaderboard.map((row) => renderStanding(row, "full"))}
          </div>
        </div>
      </details>
    </section>

    <section className={pwaStyles.overviewSection} data-completed-records aria-labelledby="completed-records-heading">
      <span className={styles.sectionLabel}>Records</span>
      <h2 id="completed-records-heading">Tournament Records</h2>
      <div className={completedStyles.recordGrid}>{defaultRecords.map((item) => renderRecord(item))}</div>
      {remainingRecords.length ? <details className={`${pwaStyles.recordsDetails} ${completedStyles.disclosure}`} data-completed-records-disclosure>
        <summary><span className={completedStyles.closedLabel}>View All Tournament Records</span><span className={completedStyles.openLabel}>Hide Tournament Records</span></summary>
        <div className={completedStyles.recordList}>{remainingRecords.map((item) => renderRecord(item, true))}</div>
      </details> : null}
    </section>

    <section className={pwaStyles.overviewSection} data-completed-honors aria-labelledby="completed-honors-heading">
      <span className={styles.sectionLabel}>Honors</span>
      <h2 id="completed-honors-heading">Tournament Honors</h2>
      <div className={completedStyles.honorList}>
        {tournament.awards.length ? tournament.awards.map((award) => <article key={award.Award}>
          <span>{award.Award}</span>
          <strong>{award.winnerPlayer?.["Display Name"] || award.Winner}</strong>
        </article>) : <article><span>Sandbagger of the Year</span><strong>Not awarded</strong></article>}
      </div>
    </section>
  </div>;
}

function CurrentHistoryOverview({ tournament, roundPoints, leaderboard, pointsTracked, scoringStatistics, participant }) {
  const standings = historyStandingsSummary(leaderboard, 5);
  const allStatistics = scoringItems(scoringStatistics, participant, tournament.courses);
  const primaryLabels = new Set(["Best Individual Round", "Best Team Round", "Average Score", "Birdie Leader", "Scorecard Coverage"]);
  const primaryStatistics = allStatistics.filter((item) => primaryLabels.has(item.label));
  const secondaryStatistics = allStatistics.filter((item) => !primaryLabels.has(item.label));
  const renderStanding = (row, keyPrefix) => {
    const player = leaderboardPlayer(row);
    return <div className={pwaStyles.standingsRow} role="listitem" key={`${keyPrefix}-${row.id || player.name}`} aria-label={`${rankAccessibleLabel(row.tournamentRank || row.rank)}, ${player.name}, ${formatPlayerPoints(row.points)} points`}>
      <strong>{row.tournamentRank || row.rank}</strong>
      {player.slug ? <Link href={`/players/${player.slug}`} prefetch={keyPrefix === "full" ? false : undefined}>{player.name}</Link> : <span>{player.name}</span>}
      <b>{pointsTracked ? formatPlayerPoints(row.points) : `${row.wins}-${row.losses}-${row.halves}`}</b>
    </div>;
  };

  return <div className={pwaStyles.overviewSections}>
    <section className={pwaStyles.overviewSection} aria-labelledby="history-rounds-heading">
      <span className={styles.sectionLabel}>Rounds</span>
      <h2 id="history-rounds-heading">Tournament Rounds</h2>
      <div className={pwaStyles.overviewRoundList}>
        {tournament.courses.map((course) => {
          const round = roundNumber(course.Round);
          const availablePoints = pointsForRound(roundPoints, round);
          return <article className={pwaStyles.overviewRound} key={`${course["Course ID"]}-${course.Round}`}>
            <Link className={pwaStyles.overviewRoundPrimary} href={`/history/${tournament.year}/round/${round}`}>
              <AssetImage src={courseLogo(course["Course Logo"])} alt="" className={pwaStyles.overviewRoundLogo} fallbackClassName={pwaStyles.overviewRoundLogoFallback} fallback="⛳" />
              <span><b>{course.Round}</b><strong>{course.Course}</strong><small>{getFormatName(course.Format)}{availablePoints !== null ? ` · ${availablePoints} points` : ""}</small></span>
              <em>View Round <i aria-hidden="true">→</i></em>
            </Link>
            <Link className={pwaStyles.overviewRoundCourse} href={historyCourseProfileHref({ courseId: course["Course ID"], year: tournament.year, round })}>Course Profile</Link>
          </article>;
        })}
      </div>
    </section>

    <section className={pwaStyles.overviewSection} aria-labelledby="history-teams-heading">
      <span className={styles.sectionLabel}>Teams</span>
      <h2 id="history-teams-heading">Tournament Sides</h2>
      <div className={pwaStyles.overviewTeamList}>
        {tournament.teams.map((team) => <Link className={pwaStyles.overviewTeam} href={`/history/${tournament.year}/team/${encodeURIComponent(team.side)}`} key={team.side}>
          <AssetImage src={teamLogo(team.logo)} alt="" className={pwaStyles.overviewTeamLogo} fallbackClassName={pwaStyles.overviewTeamFallback} fallback={team.name.slice(0, 1)} inferFallback={false} />
          <strong>{team.name}</strong><span>View roster <i aria-hidden="true">→</i></span>
        </Link>)}
      </div>
    </section>

    <section className={pwaStyles.overviewSection} aria-labelledby="history-standings-heading">
      <span className={styles.sectionLabel}>Player Standings</span>
      <h2 id="history-standings-heading">Leaders</h2>
      <div className={pwaStyles.standingsSummary} role="list" aria-label="Top player standings">
        {standings.length ? standings.map((row) => renderStanding(row, "summary")) : <p>No completed matches have been recorded for this tournament yet.</p>}
      </div>
      {leaderboard.length > standings.length ? <details className={`${pwaStyles.recordsDetails} ${completedStyles.disclosure}`} data-current-standings-disclosure>
        <summary><span className={completedStyles.closedLabel}>View Full Standings</span><span className={completedStyles.openLabel}>Show Top 5</span></summary>
        <div className={completedStyles.disclosureBody}>
          <div className={`${pwaStyles.standingsSummary} ${completedStyles.fullStandings}`} role="list" aria-label="Full current player standings">
            {leaderboard.map((row) => renderStanding(row, "full"))}
          </div>
        </div>
      </details> : null}
    </section>

    <section className={pwaStyles.overviewSection} aria-labelledby="history-records-heading">
      <span className={styles.sectionLabel}>Tournament Records</span>
      <h2 id="history-records-heading">Scoring Highlights</h2>
      <div className={pwaStyles.recordsSummary}>
        {primaryStatistics.map((item) => <div key={item.label}><span><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}</span><b>{item.value}</b></div>)}
      </div>
      <details className={pwaStyles.recordsDetails}>
        <summary>View All Statistics</summary>
        <ScoringStatGrid items={secondaryStatistics} dense />
      </details>
    </section>

    <section className={`${pwaStyles.overviewSection} ${pwaStyles.overviewAwards}`} aria-labelledby="history-awards-heading">
      <span className={styles.sectionLabel}>Tournament Honors</span>
      <h2 id="history-awards-heading">Awards</h2>
      <div className={pwaStyles.awardsSummary}>
        {tournament.awards.length ? tournament.awards.map((award) => <div key={award.Award}><span>{award.Award}</span><strong>{award.winnerPlayer?.["Display Name"] || award.Winner}</strong></div>) : <div><span>Sandbagger of the Year</span><strong>Not awarded</strong></div>}
      </div>
    </section>
  </div>;
}

export default async function TournamentYearPage({ params }) {
  const { year } = await params;
  const useSupabase2026 = isSupabaseHistory2026(year);
  let tournament;
  let roundPoints;
  let leaderboardRows;
  let previousYear;
  let nextYear;
  let draft = null;
  let scorecardAnalytics;

  if (useSupabase2026) {
    try {
      const model = history2026TournamentPageModel(
        await loadHistory2026View({ year: Number(year) })
      );
      if (
        !model?.tournament ||
        !Array.isArray(model.roundPoints) ||
        !Array.isArray(model.leaderboardRows) ||
        !model.scorecardAnalytics
      ) {
        throw new Error("The 2026 historical view is incomplete.");
      }
      ({
        tournament,
        roundPoints,
        leaderboardRows,
        previousYear,
        nextYear,
        scorecardAnalytics,
      } = model);
    } catch {
      return (
        <HistoryUnavailablePage year={year} section="Tournament History" />
      );
    }
  } else {
    const scorecardAnalyticsPromise = Number(year) === 2023
      ? loadCanonical2023HistoryAnalytics()
      : Number(year) === 2024
        ? loadCanonical2024HistoryAnalytics()
        : loadLegacyHistoryAnalytics();
    await (Number(year) === 2023 ? refreshCanonical2023HistoricalData() : refreshHistoricalData());
    tournament = getTournament(year);
    if (!tournament) notFound();
    roundPoints = getTournamentRoundPoints(year);
    leaderboardRows = getTournamentPlayerLeaderboard(year);
    ({ previousYear, nextYear } = getAdjacentTournamentYears(year));
    draft = await getDraftByYear(year);
    scorecardAnalytics = await scorecardAnalyticsPromise;
  }

  const pointsTracked = leaderboardRows.some((row) => row.pointsTracked);
  const leaderboard = addTournamentRanks(
    leaderboardRows,
    pointsTracked
      ? "points"
      : (row) => `${row.winPercentage.toFixed(6)}|${row.wins}|${row.losses}|${row.halves}`
  );
  const status = tournamentStatus(tournament);
  const tournamentScorecards = filterScorecards(scorecardAnalytics.usableScorecards, { year });
  const missingTournamentScorecards = scorecardAnalytics.missingScorecards.filter(
    (scorecard) => scorecard.year === Number(year)
  );
  const scoringStatistics = buildScoringHighlights(
    tournamentScorecards,
    tournamentScorecards.length + missingTournamentScorecards.length
  );
  const completed2024IndividualStatisticScorecards = Number(tournament?.year) === 2024
    ? selectCanonical2024IndividualStatisticScorecards({
      scorecards: scorecardAnalytics.scorecards,
      projectedScorecards: scorecardAnalytics.history2024NetProjectionScorecards,
    })
    : [];
  const completed2024IndividualStatistics = completed2024IndividualStatisticScorecards.length
    ? buildScoringHighlights(
      completed2024IndividualStatisticScorecards,
      completed2024IndividualStatisticScorecards.length
    )
    : null;
  const completed2024RecordStatistics = completed2024IndividualStatistics
    ? {
      ...scoringStatistics,
      averageScore: completed2024IndividualStatistics.averageScore,
      birdieLeader: completed2024IndividualStatistics.birdieLeader,
    }
    : scoringStatistics;
  const tournamentMatches = useSupabase2026 ? [] : getTournamentMatches(year);
  const legacyScorecardCoverage = useSupabase2026 ? null : buildLegacyHistoryScorecardCoverage({
    year,
    matches: tournamentMatches,
    scorecards: scorecardAnalytics.scorecards,
    teamIds: tournament.teams.map((team) => team.id),
  });
  const participant = (record) =>
    record?.scorecard?.playerName || record?.scorecard?.teamName || record?.scorecard?.playerId || record?.scorecard?.teamId || "";
  const completed2024IndividualHolders = Number(tournament?.year) === 2024
    ? buildHistoricalIndividualStatisticHolders({
      year: 2024,
      scorecards: tournamentScorecards,
      acceptedValues: {
        lowestRound: scoringStatistics.lowestRound.value,
        lowestFrontNine: scoringStatistics.lowestFrontNine.value,
        lowestBackNine: scoringStatistics.lowestBackNine.value,
      },
    })
    : null;
  const completed2024ScrambleHolders = Number(tournament?.year) === 2024
    ? buildHistoricalScrambleRoundStatisticHolders({
      year: 2024,
      round: 2,
      scorecards: tournamentScorecards,
      matches: tournamentMatches,
      teams: tournament.teams,
      acceptedValues: {
        lowestTeamRound: scoringStatistics.lowestTeamRound.value,
        lowestFrontNine: scoringStatistics.lowestFrontNine.value,
        lowestBackNine: scoringStatistics.lowestBackNine.value,
      },
    })
    : null;
  const completed2024BirdieHolders = completed2024IndividualStatistics
    ? buildHistoricalIndividualBirdieHolders({
      year: 2024,
      scorecards: completed2024IndividualStatisticScorecards,
      acceptedValue: completed2024IndividualStatistics.birdieLeader.value,
    })
    : [];
  const completed2024Records = Number(tournament?.year) === 2024
    ? scoringItems(completed2024RecordStatistics, participant, tournament.courses)
      .filter((item) =>
        item.label !== "Scorecard Coverage" &&
        item.value !== "—" &&
        !(item.label === "Birdie Leader" && omitMeaninglessHistoricalBirdieLeader({ year: 2024, value: completed2024RecordStatistics.birdieLeader.value }))
      )
      .map((item) => {
        const holders = item.label === "Best Individual Round"
          ? completed2024IndividualHolders.lowestRound
          : item.label === "Best Team Round"
            ? completed2024ScrambleHolders.lowestTeamRound
            : item.label === "Birdie Leader"
              ? completed2024BirdieHolders
            : item.label === "Lowest Front"
              ? combineHistoricalHolders(completed2024IndividualHolders.lowestFrontNine, completed2024ScrambleHolders.lowestFrontNine)
              : item.label === "Lowest Back"
                ? combineHistoricalHolders(completed2024IndividualHolders.lowestBackNine, completed2024ScrambleHolders.lowestBackNine)
                : [];
        const detail = holders.length ? historicalHolderText(holders) : item.detail;
        const context = holders.length ? historicalHolderContext(holders) : item.context;
        const sample = item.label === "Average Score"
          ? `${completed2024IndividualStatisticScorecards.length} individual rounds`
          : item.sample;
        return {
          ...item,
          detail,
          context,
          sample,
          key: `2024-${item.label}`,
          accessibleLabel: [item.label, item.value, detail, context, sample].filter(Boolean).join(", "),
        };
      })
    : null;
  const completed2023Scorecards = Number(tournament?.year) === 2023
    ? [1, 2, 3].flatMap((round) => selectCanonical2023NetPresentationScorecards({
      year: 2023,
      round,
      scorecards: scorecardAnalytics.scorecards,
      projectedScorecards: scorecardAnalytics.history2023NetProjectionScorecards,
    }))
    : [];
  const completed2023Records = Number(tournament?.year) === 2023
    ? buildHistoricalTournamentRecords({
      year: 2023,
      scorecards: completed2023Scorecards,
      matches: tournamentMatches,
      teams: tournament.teams,
    }).records
    : null;
  const useCompleted2023 = !useSupabase2026 && Number(tournament.year) === 2023;
  const useCompleted2024 = !useSupabase2026 && Number(tournament.year) === 2024;
  const useCompleted2025 = !useSupabase2026 && Number(tournament.year) === 2025;
  const useCompletedMaster = useCompleted2023 || useCompleted2024 || useCompleted2025;
  return (
    <main>
      <Header />

      <section className={`${styles.tournamentHero} ${useSupabase2026 || useCompletedMaster ? pwaStyles.currentTournamentHero : ""} ${useCompletedMaster ? completedStyles.hero : ""}`} data-completed-prototype={useCompletedMaster ? String(tournament.year) : undefined}>
        <AssetImage
          src={historyHeroPath(tournament)}
          alt={`${tournament.year} ${tournament.Destination}`}
          className={styles.tournamentHeroImage}
          fallbackClassName={styles.tournamentHeroFallback}
          fallback={tournament.Destination}
          loading="eager"
          width={1440}
          height={720}
          sizes="100vw"
          decoding="async"
          fetchPriority="high"
        />
        <div className={styles.tournamentHeroOverlay} />

        <div className={`${styles.tournamentHeroContent} ${useSupabase2026 || useCompletedMaster ? pwaStyles.currentTournamentHeroContent : ""} ${useCompletedMaster ? completedStyles.heroContent : ""}`}>
          {tournament.logoFileName ? (
            <AssetImage
              src={tournamentLogo(tournament.logoFileName)}
              alt={`${tournament.year} Sandbagger Invitational tournament logo`}
              className={styles.tournamentEditionLogo}
              fallbackClassName={styles.tournamentEditionLogoFallback}
              fallback=""
              loading="eager"
              width={132}
              height={132}
              sizes="(max-width: 720px) 64px, 132px"
              decoding="async"
            />
          ) : null}
          <p>{useCompletedMaster ? historyEditionLabel(tournament.year) : tournament.editionTitle}</p>
          <h1>{tournament.year}</h1>
          <h2>{tournament.Destination}</h2>
          <span>{tournament.Dates}</span>
        </div>
      </section>

      <HistoryNavigation
        ariaLabel={`${tournament.year} tournament year navigation`}
        center={{
          href: "/history",
          label: "All Tournament Years",
          ariaLabel: "All Tournament Years",
        }}
        left={previousYear ? {
          href: `/history/${previousYear}`,
          label: "Previous Year",
          detail: String(previousYear),
          direction: "left",
          ariaLabel: `Previous Year, ${previousYear}`,
        } : null}
        right={nextYear ? {
          href: `/history/${nextYear}`,
          label: "Next Year",
          detail: String(nextYear),
          direction: "right",
          ariaLabel: `Next Year, ${nextYear}`,
        } : null}
        surface="year"
      />

      <section className={styles.content}>
        {draft ? (
          <Link className={styles.draftHistoryLink} href={`/draft/${year}`}>
            <span>Official Team Selection</span>
            <strong>View {year} Draft</strong>
            <b>View Draft →</b>
          </Link>
        ) : null}
        {useSupabase2026 ? <div className={pwaStyles.currentStatus} role="status" data-complete={historyTournamentComplete(tournament) ? "true" : "false"}>
          <span>{historyTournamentComplete(tournament) ? "Final" : "In progress"}</span>
          <div>
            <strong>{historyTournamentComplete(tournament) ? (tournament.championTeam?.name ? `${tournament.championTeam.name} champions` : "Tournament complete") : "2026 tournament record"}</strong>
            <p>{historyTournamentComplete(tournament) ? (tournament.championTeam?.name ? `Official final: ${tournament["Final Score"]}` : "The official champion is pending canonical tournament resolution.") : "Final results and scorecards appear here as matches become official."}</p>
          </div>
        </div> : useCompletedMaster ? null : <div className={styles.finalScoreCard}>
          <div>
            <span>Champions</span>
            <strong>
              {tournament.championTeam?.name || "To Be Determined"}
            </strong>
          </div>
          <div className={styles.finalScoreCenter}>
            <StatusBadge status={status.label} />
            {status.score ? <b>{status.score}</b> : null}
          </div>
          <div>
            <span>Runner-Up</span>
            <strong>
              {tournament.runnerUpTeam?.name || "To Be Determined"}
            </strong>
          </div>
        </div>}

        {useCompletedMaster ? <CompletedYearOverview
          tournament={tournament}
          leaderboard={leaderboard}
          pointsTracked={pointsTracked}
          scorecards={completed2023Scorecards.length ? completed2023Scorecards : tournamentScorecards}
          matches={tournamentMatches}
          records={completed2023Records || completed2024Records}
        /> : useSupabase2026 ? <CurrentHistoryOverview
          tournament={tournament}
          roundPoints={roundPoints}
          leaderboard={leaderboard}
          pointsTracked={pointsTracked}
          scoringStatistics={scoringStatistics}
          participant={participant}
        /> : <>
        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Teams</span>
          <h2>Rosters</h2>

          <div className={styles.teamSeasonGrid}>
            {tournament.teams.map((team) => (
              <Link
                className={styles.teamSeasonCard}
                href={`/history/${tournament.year}/team/${encodeURIComponent(
                  team.side
                )}`}
                key={team.side}
              >
                <TeamLogoPlate
                  filename={team.logo}
                  teamName={team.name}
                  variant="card"
                />

                <div>
                  <h3>{team.name}</h3>
                  <p>
                    Captain: {team.captain?.["Display Name"] || team.captainRecordedName || "Captain not recorded"}
                  </p>
                  <strong>
                    Avg. Team Handicap: {formatHandicap(team.averageHandicap)}
                  </strong>
                  <em>View full roster →</em>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Destination</span>
          <h2>Courses Played</h2>

          <div className={styles.courseCardGrid}>
            {tournament.courses.map((course) => {
              const round = roundNumber(course.Round);
              const availablePoints = pointsForRound(roundPoints, round);

              return (
                <article
                  className={`${styles.courseCard} ${styles.courseRoundCard}`}
                  key={`${course["Course ID"]}-${course.Round}`}
                >
                  <Link
                    className={styles.courseRoundPrimary}
                    href={`/history/${tournament.year}/round/${round}`}
                  >
                    <AssetImage
                      src={courseLogo(course["Course Logo"])}
                      alt={`${course.Course} logo`}
                      className={styles.courseLogo}
                      fallbackClassName={styles.courseLogoPlaceholder}
                      fallback="⛳"
                    />
                    <span>{course.Round}</span>
                    <h3>{course.Course}</h3>
                    <p>
                      {course.City}, {course.State}
                    </p>
                    <strong>{getFormatName(course.Format)}</strong>
                    <small
                      className={styles.courseRoundPoints}
                      data-empty={availablePoints === null}
                      aria-hidden={availablePoints === null ? "true" : undefined}
                    >
                      {availablePoints !== null
                        ? `${availablePoints} Points Available`
                        : "\u00a0"}
                    </small>
                    <b>View Round Results →</b>
                  </Link>

                  <Link
                    className={styles.courseProfileLink}
                    href={historyCourseProfileHref({ courseId: course["Course ID"], year: tournament.year, round })}
                  >
                    View Course Profile
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Player Standings</span>
          <h2>{tournament.year} Leaderboard</h2>

          <TournamentLeaderboard rows={leaderboard} pointsTracked={pointsTracked} emptyMessage="No completed matches have been recorded for this tournament yet." />
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>{tournamentScorecards.length ? "Tournament Scoring Statistics" : "Historical Scorecards"}</h2>
          {tournamentScorecards.length ? <ScoringStatGrid items={[
            {
              label: "Best Individual Round",
              value: formatScoringNumber(scoringStatistics.lowestRound.value),
              detail: participant(scoringStatistics.lowestRound),
              sample: scoringStatistics.lowestRound.label,
            },
            {
              label: "Best Team Round",
              value: formatScoringNumber(scoringStatistics.lowestTeamRound.value),
              detail: participant(scoringStatistics.lowestTeamRound),
              sample: scoringStatistics.lowestTeamRound.label,
            },
            {
              label: "Average Score",
              value: formatScoringNumber(scoringStatistics.averageScore.value),
              sample: scoringStatistics.averageScore.label,
            },
            {
              label: "Lowest Front",
              value: formatScoringNumber(scoringStatistics.lowestFrontNine.value),
              detail: participant(scoringStatistics.lowestFrontNine),
              sample: scoringStatistics.lowestFrontNine.label,
            },
            {
              label: "Lowest Back",
              value: formatScoringNumber(scoringStatistics.lowestBackNine.value),
              detail: participant(scoringStatistics.lowestBackNine),
              sample: scoringStatistics.lowestBackNine.label,
            },
            {
              label: "Birdie Leader",
              value: formatScoringNumber(scoringStatistics.birdieLeader.value),
              detail: participant(scoringStatistics.birdieLeader),
              sample: scoringStatistics.birdieLeader.label,
            },
            {
              label: "Hardest Hole",
              value: scoringStatistics.hardestHole ? `#${scoringStatistics.hardestHole.holeNumber}` : "—",
              detail: scoringStatistics.hardestHole ? historyCourseDisplayName(scoringStatistics.hardestHole.courseId, tournament.courses, scoringStatistics.hardestHole.courseName) : "",
              sample: scoringStatistics.hardestHole?.averageToPar.label,
            },
            {
              label: "Easiest Hole",
              value: scoringStatistics.easiestHole ? `#${scoringStatistics.easiestHole.holeNumber}` : "—",
              detail: scoringStatistics.easiestHole ? historyCourseDisplayName(scoringStatistics.easiestHole.courseId, tournament.courses, scoringStatistics.easiestHole.courseName) : "",
              sample: scoringStatistics.easiestHole?.averageToPar.label,
            },
            {
              label: "Historical Scorecards",
              value: legacyScorecardCoverage.completeMatchScorecards === legacyScorecardCoverage.canonicalMatches
                ? `All ${legacyScorecardCoverage.canonicalMatches} matches`
                : `${legacyScorecardCoverage.completeMatchScorecards} matches`,
              detail: "Scorecard detail available",
            },
          ]} /> : <p className={pwaStyles.scorecardAvailability}>Detailed historical scorecards are not available for this tournament.</p>}
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Tournament Honors</span>
          <h2>Awards</h2>

          <div className={styles.awardGrid}>
            {tournament.awards.length ? (
              tournament.awards.map((award) => (
                <div className={styles.awardCard} key={award.Award}>
                  <span>{award.Award}</span>
                  <strong>
                    {award.winnerPlayer?.["Display Name"] || award.Winner}
                  </strong>
                </div>
              ))
            ) : (
              <div className={styles.awardCard}>
                <span>Sandbagger of the Year</span>
                <strong>Not awarded</strong>
              </div>
            )}
          </div>
        </section>
        </>}
      </section>

    </main>
  );
}
