import Link from "next/link";
import ScoringStatGrid, { formatScoringNumber } from "../../ScoringStatGrid";
import PlayerFormatMatchHistory from "./PlayerFormatMatchHistory";
import { formatPercentage, formatRecord } from "../../../lib/stats";
import { formatPoints } from "../../../lib/formatters";
import styles from "../../historical.module.css";

function IntelligenceSection({ eyebrow, title, children, open = false }) {
  return (
    <details className={styles.playerIntelligenceSection} open={open}>
      <summary>
        <div>
          <span className={styles.sectionLabel}>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <b aria-hidden="true">+</b>
      </summary>
      <div className={styles.playerIntelligenceBody}>{children}</div>
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
        <Link href={row.href} key={row.key}>
          <span>{row.label}</span>
          <i aria-hidden="true" />
          <strong>{rank(row.rank)}</strong>
        </Link>
      ))}
    </div>
  );
}

export default function PlayerIntelligenceSections({
  intelligence,
  formatMatchHistory,
  scorecardsByMatch,
}) {
  const { official, hole, progression } = intelligence;
  const careerRankingRows = intelligence.rankingRows.filter((row) =>
    ["careerPoints", "winPercentage", "holeDifferential", "birdies", "averageGross"].includes(row.key)
  );

  return (
    <div className={styles.playerIntelligence}>
      <IntelligenceSection eyebrow="Complete Career View" title="Career Snapshot" open>
        <h3>Official Career</h3>
        <ScoringStatGrid items={[
          { label: "Overall Record", value: official.recordDisplay },
          { label: "Win Percentage", value: formatPercentage(official.winPercentage) },
          { label: "Career Points", value: formatPoints(official.careerPoints) },
          { label: "Tournament Appearances", value: official.appearances },
          { label: "Championships", value: official.championships },
          { label: "Runner-Up Finishes", value: official.runnerUps },
        ]} />
        <h3>Hole-by-Hole</h3>
        <ScoringStatGrid items={[
          { label: "Hole Differential", value: formatScoringNumber(hole.holeDifferential, { signed: true, decimals: 0 }) },
          { label: "Birdies", value: hole.birdies },
          { label: "Eagles", value: hole.eagles },
          { label: "Average Gross Score", value: formatScoringNumber(hole.averageGrossScore) },
          { label: "Average Net Score", value: formatScoringNumber(hole.averageNetScore) },
        ]} />
        <h3>Career Rankings</h3>
        <RankingList rows={careerRankingRows} />
      </IntelligenceSection>

      <IntelligenceSection eyebrow="Recorded Scorecards" title="Scoring Profile">
        <h3>Gross</h3>
        <ScoringStatGrid items={[
          { label: "Average Gross", value: formatScoringNumber(hole.averageGrossScore) },
          { label: "Average Net", value: formatScoringNumber(hole.averageNetScore) },
        ]} />
        <h3>Par Performance</h3>
        <ScoringStatGrid items={[
          { label: "Par 3 Average", value: formatScoringNumber(hole.averagePar3Score) },
          { label: "Par 4 Average", value: formatScoringNumber(hole.averagePar4Score) },
          { label: "Par 5 Average", value: formatScoringNumber(hole.averagePar5Score) },
        ]} />
        <h3>Scoring Breakdown</h3>
        <ScoringStatGrid items={[
          { label: "Birdie %", value: formatScoringNumber(hole.birdieRate, { percentage: true }) },
          { label: "Par %", value: formatScoringNumber(hole.parRate, { percentage: true }) },
          { label: "Bogey %", value: formatScoringNumber(hole.bogeyRate, { percentage: true }) },
          { label: "Double Bogey+ %", value: formatScoringNumber(hole.doubleBogeyOrWorseRate, { percentage: true }) },
        ]} />
        <h3>Round Breakdown</h3>
        <ScoringStatGrid items={[
          { label: "Front Nine Average", value: formatScoringNumber(hole.averageFrontNineScore) },
          { label: "Back Nine Average", value: formatScoringNumber(hole.averageBackNineScore) },
        ]} />
        <p className={styles.playerIntelligenceCoverage}>
          Based on {hole.sample.completeScorecards} complete or verified scorecards and {hole.sample.scoringHoles} recorded scoring holes.
        </p>
      </IntelligenceSection>

      <IntelligenceSection eyebrow="Reconstructed Match Play" title="Match Play Profile">
        <ScoringStatGrid items={[
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

      <IntelligenceSection eyebrow="Career Trends" title="Tournament History">
        <div className={styles.playerTournamentHistory}>
          {intelligence.tournamentHistory.map((season) => (
            <Link href={`/history/${season.year}`} key={season.year}>
              <strong>{season.year}</strong>
              <span>{season.finish}</span>
              <span>{season.recordDisplay}</span>
              <span>{formatPoints(season.points)} pts</span>
              <span>
                {season.averageScore === null
                  ? "Scorecards unavailable"
                  : `${formatScoringNumber(season.averageScore)} avg.`}
              </span>
            </Link>
          ))}
        </div>
      </IntelligenceSection>

      <IntelligenceSection eyebrow="Best Format First" title="Format Performance">
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
                scorecardsByMatch={scorecardsByMatch}
              />
            </article>
          ))}
        </div>
      </IntelligenceSection>

      {intelligence.recordsHeld.length ? (
        <IntelligenceSection eyebrow="Current Record Book" title="Records Held">
          <div className={styles.playerRecordsHeld}>
            {intelligence.recordsHeld.map((record) => (
              <Link href={record.href} key={record.slug}>
                <span>Record Holder</span>
                <strong>{record.title}</strong>
                <b>View Leaderboard →</b>
              </Link>
            ))}
          </div>
        </IntelligenceSection>
      ) : null}

      <IntelligenceSection eyebrow="Official Leaderboards" title="Current Rankings">
        <RankingList rows={intelligence.rankingRows} />
      </IntelligenceSection>
    </div>
  );
}
