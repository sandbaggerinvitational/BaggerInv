"use client";

import Link from "next/link";
import { useState } from "react";
import ScoringStatGrid, { formatScoringNumber } from "../../ScoringStatGrid";
import PlayerFormatMatchHistory from "./PlayerFormatMatchHistory";
import { formatPlayerPoints } from "../../../lib/formatters";
import {
  isCompletedHistoryPlayerYear,
  withPlayerOriginContext,
} from "../../../lib/context-navigation";
import TeamLogoPlate from "../../TeamLogoPlate";
import styles from "../../historical.module.css";

function formatRecord(record) {
  return `${record.wins}-${record.losses}-${record.halves}`;
}

function formatPercentage(value) {
  return `${value.toFixed(1)}%`;
}

function IntelligenceSection({ eyebrow, title, children, open = false, defer = false }) {
  const [expanded, setExpanded] = useState(open);
  const [hasRenderedContent, setHasRenderedContent] = useState(open || !defer);

  return (
    <details
      className={styles.playerIntelligenceSection}
      data-career-detail={defer ? "deferred" : "eager"}
      data-detail-mounted={hasRenderedContent ? "true" : "false"}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setExpanded(nextOpen);
        if (nextOpen) setHasRenderedContent(true);
      }}
      open={expanded}
    >
      <summary>
        <div>
          <span className={styles.sectionLabel}>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <b aria-hidden="true">+</b>
      </summary>
      {hasRenderedContent ? <div className={styles.playerIntelligenceBody}>{children}</div> : null}
    </details>
  );
}

function rank(rankValue) {
  return rankValue ? `#${rankValue}` : "—";
}

function RankingList({ rows }) {
  return (
    <div className={styles.playerRankingList}>
      {rows.map((row) => (
        <div key={row.key}>
          <span>{row.label}</span>
          <i aria-hidden="true" />
          <strong>{rank(row.rank)}</strong>
        </div>
      ))}
    </div>
  );
}

function TournamentHistoryRow({ playerName, playerSlug, season }) {
  const upcoming = season.finish === "Upcoming";
  const completedHistoryYear = isCompletedHistoryPlayerYear(season.year);
  // Preserve the existing current-tournament destination. It is deliberately
  // separate from the completed-year History context contract above.
  const currentTournamentYear = Number(season.year) === 2026;
  const linkedTournamentYear = completedHistoryYear || currentTournamentYear;
  const finishKey = String(season.finish || "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const content = <>
      <strong>{season.year}</strong>
      <div className={styles.playerTournamentTeam}>
        {season.teamLogo ? (
          <TeamLogoPlate
            filename={season.teamLogo}
            teamName={season.teamName}
            variant="scoreboard"
          />
        ) : null}
        {season.teamName ? <b>{season.teamName}</b> : null}
      </div>
      <span data-label="Finish">
        <em className={styles.playerTournamentFinish}>{season.finish}</em>
      </span>
      <span data-label="Record">{upcoming ? "—" : season.recordDisplay}</span>
      <span
        aria-label={upcoming || !season.pointsRecorded ? "Points not recorded" : undefined}
        data-label="Points"
      >
        {upcoming || !season.pointsRecorded ? "—" : formatPlayerPoints(season.points)}
      </span>
      <span
        aria-label={upcoming || season.averageScore === null ? "Average score not recorded" : undefined}
        data-label="Avg Score"
      >
        {upcoming || season.averageScore === null
          ? "—"
          : formatScoringNumber(season.averageScore)}
      </span>
    </>;
  const rowStyle = {
    "--history-team-color": season.teamColor || "var(--tsi-gold-600)",
  };
  const historyHref = completedHistoryYear
    ? withPlayerOriginContext(`/history/${season.year}`, playerSlug)
    : `/history/${season.year}`;

  return linkedTournamentYear ? (
    <Link
      aria-label={completedHistoryYear
        ? `View ${playerName}'s ${season.year} Tournament History`
        : `View ${playerName}'s current ${season.year} Tournament`}
      className={styles.playerTournamentHistoryRow}
      data-finish={finishKey}
      href={historyHref}
      prefetch={false}
      style={rowStyle}
    >
      {content}
    </Link>
  ) : (
    <div
      className={styles.playerTournamentHistoryRow}
      data-finish={finishKey}
      style={rowStyle}
    >
      {content}
    </div>
  );
}

export default function PlayerIntelligenceSections({
  intelligence,
  formatMatchHistory,
  playerName,
  playerSlug,
}) {
  const { official, hole, progression } = intelligence;
  const careerRankingRows = intelligence.rankingRows.filter((row) =>
    ["careerPoints", "matchWins", "winPercentage", "holeDifferential", "birdies", "averageGross"].includes(row.key)
  );

  return (
    <div className={styles.playerIntelligence}>
      <IntelligenceSection eyebrow="Complete Career View" title="Career Snapshot" open>
        <h3>Official Career</h3>
        <ScoringStatGrid career dense items={[
          { label: "Overall Record", value: official.recordDisplay },
          { label: "Win Percentage", value: formatPercentage(official.winPercentage) },
          { label: "Career Points", value: formatPlayerPoints(official.careerPoints) },
          { label: "Tournament Appearances", value: official.appearances },
          { label: "Championships", value: official.championships },
          { label: "Runner-Up Finishes", value: official.runnerUps },
        ]} />
        <h3>Hole-by-Hole</h3>
        <ScoringStatGrid career dense layout="fiveBalanced" items={[
          { label: "Hole Differential", value: formatScoringNumber(hole.holeDifferential, { signed: true, decimals: 0 }) },
          { label: "Birdies", value: hole.birdies },
          { label: "Eagles", value: hole.eagles },
          { label: "Average Gross Score", value: formatScoringNumber(hole.averageGrossScore) },
          { label: "Average Net Score", value: formatScoringNumber(hole.averageNetScore) },
        ]} />
        <h3>Career Rankings</h3>
        <RankingList rows={careerRankingRows} />
      </IntelligenceSection>

      <IntelligenceSection defer eyebrow="Recorded Scorecards" title="Scoring Profile">
        <h3>Gross</h3>
        <ScoringStatGrid career dense items={[
          { label: "Average Gross", value: formatScoringNumber(hole.averageGrossScore) },
          { label: "Average Net", value: formatScoringNumber(hole.averageNetScore) },
        ]} />
        <h3>Par Performance</h3>
        <ScoringStatGrid career dense layout="threeAcross" items={[
          { label: "Par 3 Average", value: formatScoringNumber(hole.averagePar3Score) },
          { label: "Par 4 Average", value: formatScoringNumber(hole.averagePar4Score) },
          { label: "Par 5 Average", value: formatScoringNumber(hole.averagePar5Score) },
        ]} />
        <h3>Scoring Breakdown</h3>
        <ScoringStatGrid career dense items={[
          { label: "Birdie %", value: formatScoringNumber(hole.birdieRate, { percentage: true }) },
          { label: "Par %", value: formatScoringNumber(hole.parRate, { percentage: true }) },
          { label: "Bogey %", value: formatScoringNumber(hole.bogeyRate, { percentage: true }) },
          { label: "Double Bogey+ %", value: formatScoringNumber(hole.doubleBogeyOrWorseRate, { percentage: true }) },
        ]} />
        <h3>Round Breakdown</h3>
        <ScoringStatGrid career dense items={[
          { label: "Front Nine Average", value: formatScoringNumber(hole.averageFrontNineScore) },
          { label: "Back Nine Average", value: formatScoringNumber(hole.averageBackNineScore) },
        ]} />
        <p className={styles.playerIntelligenceCoverage}>
          Based on {hole.sample.completeScorecards} complete or verified scorecards and {hole.sample.scoringHoles} recorded scoring holes.
        </p>
      </IntelligenceSection>

      <IntelligenceSection defer eyebrow="Reconstructed Match Play" title="Match Play Profile">
        <ScoringStatGrid career dense items={[
          { label: "Holes Won", value: hole.holesWon },
          { label: "Holes Lost", value: hole.holesLost },
          { label: "Holes Halved", value: hole.holesHalved },
          { label: "Hole Differential", value: formatScoringNumber(hole.holeDifferential, { signed: true, decimals: 0 }) },
          { label: "Largest Lead", value: progression.largestLeadHeld },
          { label: "Largest Comeback", value: progression.largestComebackCompleted },
          { label: "Most Consecutive Holes Won", value: progression.mostConsecutiveHolesWon },
          { label: "Front Nine Record", value: progression.frontNineRecord },
          { label: "Back Nine Record", value: progression.backNineRecord },
          { label: "Closing Holes Record (16–18)", value: progression.closingRecord },
        ]} />
      </IntelligenceSection>

      <IntelligenceSection defer eyebrow="Career Trends" title="Tournament History">
        <div className={styles.playerTournamentHistory}>
          <div className={styles.playerTournamentHistoryHead} aria-hidden="true">
            <span>Year</span>
            <span>Team</span>
            <span>Finish</span>
            <span>Record</span>
            <span>Points</span>
            <span>Avg Score</span>
          </div>
          {intelligence.tournamentHistory.map((season) => (
            <TournamentHistoryRow playerName={playerName} playerSlug={playerSlug} season={season} key={season.year} />
          ))}
        </div>
      </IntelligenceSection>

      <IntelligenceSection defer eyebrow="Best Format First" title="Format Performance">
        <div className={styles.playerFormatIntelligence}>
          {intelligence.formats.map((format, index) => (
            <article key={format.code}>
              <div className={styles.playerFormatIntelligenceHeader}>
                <div>
                  {index === 0 ? <small>Best Format</small> : null}
                  <h3>{format.label}</h3>
                </div>
                <strong>{formatPercentage(format.winPercentage)}</strong>
              </div>
              <div className={styles.playerFormatMetrics}>
                <span><b>{formatRecord(format.record)}</b>Record</span>
                <span><b>{formatPercentage(format.winPercentage)}</b>Win %</span>
                <span>
                  <b>{formatScoringNumber(format.scoringAverage)}</b>
                  {format.scoringLabel}
                </span>
              </div>
              <PlayerFormatMatchHistory
                history={formatMatchHistory[format.code]}
                playerName={playerName}
                playerSlug={playerSlug}
              />
            </article>
          ))}
        </div>
      </IntelligenceSection>

      {intelligence.recordsHeld.length ? (
        <IntelligenceSection eyebrow="Current Record Book" title="Records Held">
          <div className={styles.playerRecordsHeld}>
            {intelligence.recordsHeld.map((record) => (
              <article key={record.slug}>
                <strong>{record.title}</strong>
              </article>
            ))}
          </div>
        </IntelligenceSection>
      ) : null}
    </div>
  );
}
