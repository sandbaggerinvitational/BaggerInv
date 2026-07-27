"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AssetImage from "../AssetImage";
import TeamLogoPlate from "../TeamLogoPlate";
import { playerPhoto } from "../../lib/asset-paths";
import {
  buildComparisonSummary,
  compareMetricValues,
  comparisonCategoryEdge,
  COMPARISON_DIRECTIONS,
} from "../../lib/player-comparison-utils";
import styles from "./compare.module.css";

const formatRecord = (record = {}) =>
  `${record.wins || 0}-${record.losses || 0}-${record.halves || 0}`;
const segmentRecord = (segment = {}) =>
  `${segment.won || 0}-${segment.lost || 0}-${segment.halved || 0}`;
const available = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));
const number = (value, places = 1) =>
  available(value) ? Number(value).toFixed(places).replace(/\.0$/, "") : "—";
const percent = (value) =>
  available(value) ? `${Number(value).toFixed(1)}%` : "—";
const points = (value) =>
  available(value) ? Number(value).toFixed(2).replace(/\.?0+$/, "") : "—";
const integer = (value) =>
  available(value) ? String(Math.round(Number(value))) : "—";
const formatName = (format) =>
  ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" }[format] || format);

function validPlayerId(players, requestedId) {
  return players.some((player) => player.id === requestedId) ? requestedId : "";
}

function swapHeadToHead(raw) {
  if (!raw) return raw;
  return {
    ...raw,
    officialRecordA: raw.officialRecordB,
    officialRecordB: raw.officialRecordA,
    pointsA: raw.pointsB,
    pointsB: raw.pointsA,
    playerA: raw.playerB,
    playerB: raw.playerA,
  };
}

function ComparisonRow({
  label,
  playerAValue,
  playerBValue,
  direction = COMPARISON_DIRECTIONS.HIGHER,
  format = number,
  note = "",
}) {
  const edge = compareMetricValues(playerAValue, playerBValue, direction);
  if (edge === "UNAVAILABLE") return null;
  return (
    <div className={styles.statRow}>
      <strong data-edge={edge === "PLAYER_A" ? "true" : undefined}>
        {format(playerAValue)}
        {edge === "PLAYER_A" ? <small>Edge</small> : null}
      </strong>
      <span>{label}{note ? <i>{note}</i> : null}</span>
      <strong data-edge={edge === "PLAYER_B" ? "true" : undefined}>
        {format(playerBValue)}
        {edge === "PLAYER_B" ? <small>Edge</small> : null}
      </strong>
    </div>
  );
}

function IntelligenceSection({ eyebrow, title, children, open = false }) {
  return (
    <details className={styles.intelligenceSection} open={open}>
      <summary>
        <div><span>{eyebrow}</span><h2>{title}</h2></div>
        <b aria-hidden="true">⌄</b>
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

function PlayerHeader({ player }) {
  return (
    <article className={styles.playerHeader}>
      <AssetImage
        src={playerPhoto(player.photo)}
        alt={player.name}
        className={styles.playerPhoto}
        fallbackClassName={styles.playerPhotoFallback}
        fallback={player.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
        loading="eager"
      />
      <div className={styles.playerHeaderCopy}>
        <h2>{player.name}</h2>
        {player.team ? (
          <div className={styles.playerTeam}>
            <TeamLogoPlate
              filename={player.team.logo}
              teamName={player.team.name}
              variant="scoreboard"
            />
            <span>{player.team.name}</span>
          </div>
        ) : null}
        <div className={styles.headerFacts}>
          <span><b>{number(player.handicap)}</b> Handicap</span>
          <span><b>{integer(player.rating)}</b> Overall SBR</span>
          <span><b>{formatRecord(player.official.record)}</b> Career</span>
          <span><b>{points(player.official.points)}</b> Points</span>
          <span><b>{integer(player.official.championships)}</b> Championships</span>
        </div>
        <Link href={`/players/${player.slug}`}>View Player Profile →</Link>
      </div>
    </article>
  );
}

function CategoryEdge({ label, edge, one, two }) {
  const value = edge === "PLAYER_A" ? one.name : edge === "PLAYER_B" ? two.name : "Tie";
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InsightCard({ player }) {
  return (
    <article className={styles.insightCard}>
      <h3>{player.name}</h3>
      <div>
        <span>Strengths</span>
        {player.insights.strengths.length ? (
          <ul>{player.insights.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        ) : <p>No strength clears the current sample threshold.</p>}
      </div>
      <div>
        <span>Tendencies</span>
        {player.insights.tendencies.length ? (
          <ul>{player.insights.tendencies.map((item) => <li key={item}>{item}</li>)}</ul>
        ) : <p>No clear tendency in the available data.</p>}
      </div>
    </article>
  );
}

function FormatCard({ format, one, two }) {
  const a = one.formats[format];
  const b = two.formats[format];
  const scoringLabel = format === "BB"
    ? "Team Net Best Ball Avg"
    : format === "SC"
      ? "Team Scramble Avg"
      : "Individual Gross Avg";
  const scoreA = format === "SI" ? a.grossAverage : format === "SC" ? a.grossAverage : a.netAverage;
  const scoreB = format === "SI" ? b.grossAverage : format === "SC" ? b.grossAverage : b.netAverage;
  return (
    <article className={styles.formatCard}>
      <div className={styles.formatTitle}>
        <span>{format}</span>
        <h3>{formatName(format)}</h3>
      </div>
      <ComparisonRow label="Official Record" playerAValue={a.record.matches ? formatRecord(a.record) : null} playerBValue={b.record.matches ? formatRecord(b.record) : null} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value || "—"} />
      <ComparisonRow label="Win Percentage" playerAValue={a.record.matches ? a.winPercentage : null} playerBValue={b.record.matches ? b.winPercentage : null} format={percent} />
      <ComparisonRow label="Points Won" playerAValue={a.record.matches ? a.points : null} playerBValue={b.record.matches ? b.points : null} format={points} />
      <ComparisonRow label={scoringLabel} note={format === "SI" ? "" : "Team-derived"} playerAValue={scoreA} playerBValue={scoreB} direction={COMPARISON_DIRECTIONS.LOWER} />
      <ComparisonRow label="Hole Differential" playerAValue={a.holeDifferential} playerBValue={b.holeDifferential} />
      <ComparisonRow label="Recorded Matches" playerAValue={a.recordedMatches || null} playerBValue={b.recordedMatches || null} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
    </article>
  );
}

export default function CompareTool({
  players,
  headToHead,
  initialPlayerOne = "",
  initialPlayerTwo = "",
}) {
  const requestedOne = validPlayerId(players, initialPlayerOne);
  const requestedTwo = validPlayerId(players, initialPlayerTwo);
  const defaultOne = requestedOne || players[0]?.id || "";
  const defaultTwo = requestedTwo && requestedTwo !== defaultOne
    ? requestedTwo
    : players.find((player) => player.id !== defaultOne)?.id || "";
  const [oneId, setOneId] = useState(defaultOne);
  const [twoId, setTwoId] = useState(defaultTwo);
  const one = players.find((player) => player.id === oneId);
  const two = players.find((player) => player.id === twoId);
  const h2h = useMemo(() => {
    const direct = headToHead[`${oneId}|${twoId}`];
    if (direct !== undefined) return direct;
    return swapHeadToHead(headToHead[`${twoId}|${oneId}`]);
  }, [headToHead, oneId, twoId]);

  function changePlayerOne(value) {
    setOneId(value);
    if (value === twoId) setTwoId(players.find((player) => player.id !== value)?.id ?? "");
  }
  function changePlayerTwo(value) {
    setTwoId(value);
    if (value === oneId) setOneId(players.find((player) => player.id !== value)?.id ?? "");
  }

  const categoryEdges = one && two ? {
    official: comparisonCategoryEdge(one, two, "official"),
    scoring: comparisonCategoryEdge(one, two, "scoring"),
    matchPlay: comparisonCategoryEdge(one, two, "matchPlay"),
    BB: comparisonCategoryEdge(one, two, "BB"),
    SC: comparisonCategoryEdge(one, two, "SC"),
    SI: comparisonCategoryEdge(one, two, "SI"),
  } : {};

  return (
    <>
      <section className={styles.hero}>
        <p>PLAYER INTELLIGENCE</p>
        <h1>Compare Sandbaggers</h1>
        <span>See how two Sandbaggers differ across official results, recorded scoring, match play, and formats.</span>
      </section>

      <section className={styles.content}>
        <div className={styles.selectors}>
          <label>Player One<select value={oneId} onChange={(event) => changePlayerOne(event.target.value)}>
            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
          <b>VS</b>
          <label>Player Two<select value={twoId} onChange={(event) => changePlayerTwo(event.target.value)}>
            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select></label>
        </div>

        {one && two && one.id !== two.id ? (
          <>
            <div className={styles.playerHeaders}>
              <PlayerHeader player={one} />
              <span className={styles.versus}>VS</span>
              <PlayerHeader player={two} />
            </div>

            <IntelligenceSection eyebrow="At a glance" title="Player Overview" open>
              <div className={styles.comparisonGrid}>
                <ComparisonRow label="Current Handicap" playerAValue={one.handicap} playerBValue={two.handicap} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Overall Sandbagger Rating" playerAValue={one.rating} playerBValue={two.rating} format={integer} />
                <ComparisonRow label="Overall Record" playerAValue={formatRecord(one.official.record)} playerBValue={formatRecord(two.official.record)} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value} />
                <ComparisonRow label="Win Percentage" playerAValue={one.official.winPercentage} playerBValue={two.official.winPercentage} format={percent} />
                <ComparisonRow label="Career Points" playerAValue={one.official.points} playerBValue={two.official.points} format={points} />
                <ComparisonRow label="Championships" playerAValue={one.official.championships} playerBValue={two.official.championships} format={integer} />
                <ComparisonRow label="Tournament Appearances" playerAValue={one.official.appearances} playerBValue={two.official.appearances} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
                <ComparisonRow label="Career Points Ranking" playerAValue={one.currentRanking} playerBValue={two.currentRanking} direction={COMPARISON_DIRECTIONS.LOWER} format={(value) => finiteRank(value)} />
              </div>
            </IntelligenceSection>

            <IntelligenceSection eyebrow="Official record" title="Official Career Comparison">
              <div className={styles.comparisonGrid}>
                <ComparisonRow label="Match Wins" playerAValue={one.official.record.wins} playerBValue={two.official.record.wins} format={integer} />
                <ComparisonRow label="Match Losses" playerAValue={one.official.record.losses} playerBValue={two.official.record.losses} direction={COMPARISON_DIRECTIONS.LOWER} format={integer} />
                <ComparisonRow label="Ties" playerAValue={one.official.record.halves} playerBValue={two.official.record.halves} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
                <ComparisonRow label="Matches Played" playerAValue={one.official.record.matches} playerBValue={two.official.record.matches} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
                <ComparisonRow label="Point Win Percentage" playerAValue={one.official.winPercentage} playerBValue={two.official.winPercentage} format={percent} />
                <ComparisonRow label="Career Points" playerAValue={one.official.points} playerBValue={two.official.points} format={points} />
                {["BB", "SC", "SI"].map((format) => (
                  <ComparisonRow key={format} label={`${formatName(format)} Record`} playerAValue={formatRecord(one.formats[format].record)} playerBValue={formatRecord(two.formats[format].record)} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value} />
                ))}
                <ComparisonRow label="Championships" playerAValue={one.official.championships} playerBValue={two.official.championships} format={integer} />
                <ComparisonRow label="Runner-Up Finishes" playerAValue={one.official.runnerUps} playerBValue={two.official.runnerUps} format={integer} />
              </div>
            </IntelligenceSection>

            <IntelligenceSection eyebrow="Complete and verified cards" title="Scorecard Intelligence">
              <p className={styles.sampleContext}>Available recorded scorecards: {one.name} {one.scorecard.sample.completeScorecards} · {two.name} {two.scorecard.sample.completeScorecards}</p>
              <div className={styles.comparisonGrid}>
                <ComparisonRow label="Average Gross Score" playerAValue={one.scorecard.averageGrossScore} playerBValue={two.scorecard.averageGrossScore} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Average Net Score" playerAValue={one.scorecard.averageNetScore} playerBValue={two.scorecard.averageNetScore} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Birdie Rate" playerAValue={one.scorecard.birdieRate} playerBValue={two.scorecard.birdieRate} format={percent} />
                <ComparisonRow label="Eagles" playerAValue={scoringValue(one, "eagles")} playerBValue={scoringValue(two, "eagles")} format={integer} />
                <ComparisonRow label="Par Rate" playerAValue={one.scorecard.parRate} playerBValue={two.scorecard.parRate} format={percent} />
                <ComparisonRow label="Bogey Rate" playerAValue={one.scorecard.bogeyRate} playerBValue={two.scorecard.bogeyRate} direction={COMPARISON_DIRECTIONS.LOWER} format={percent} />
                <ComparisonRow label="Double Bogey+ Rate" playerAValue={one.scorecard.doubleBogeyOrWorseRate} playerBValue={two.scorecard.doubleBogeyOrWorseRate} direction={COMPARISON_DIRECTIONS.LOWER} format={percent} />
                <ComparisonRow label="Front Nine Average" playerAValue={one.scorecard.averageFrontNineScore} playerBValue={two.scorecard.averageFrontNineScore} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Back Nine Average" playerAValue={one.scorecard.averageBackNineScore} playerBValue={two.scorecard.averageBackNineScore} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Par-3 Average" playerAValue={one.scorecard.averagePar3Score} playerBValue={two.scorecard.averagePar3Score} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Par-4 Average" playerAValue={one.scorecard.averagePar4Score} playerBValue={two.scorecard.averagePar4Score} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Par-5 Average" playerAValue={one.scorecard.averagePar5Score} playerBValue={two.scorecard.averagePar5Score} direction={COMPARISON_DIRECTIONS.LOWER} />
                <ComparisonRow label="Recorded Rounds" playerAValue={scoringSample(one)} playerBValue={scoringSample(two)} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
              </div>
            </IntelligenceSection>

            <IntelligenceSection eyebrow="Hole-by-hole performance" title="Match Play Intelligence">
              <div className={styles.comparisonGrid}>
                <ComparisonRow label="Holes Won" playerAValue={matchPlayValue(one, "holesWon")} playerBValue={matchPlayValue(two, "holesWon")} format={integer} />
                <ComparisonRow label="Holes Lost" playerAValue={matchPlayValue(one, "holesLost")} playerBValue={matchPlayValue(two, "holesLost")} direction={COMPARISON_DIRECTIONS.LOWER} format={integer} />
                <ComparisonRow label="Holes Halved" playerAValue={matchPlayValue(one, "holesHalved")} playerBValue={matchPlayValue(two, "holesHalved")} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
                <ComparisonRow label="Hole Differential" playerAValue={matchPlayValue(one, "holeDifferential")} playerBValue={matchPlayValue(two, "holeDifferential")} format={integer} />
                <ComparisonRow label="Largest Lead" playerAValue={progressionValue(one, "largestLeadHeld")} playerBValue={progressionValue(two, "largestLeadHeld")} format={integer} />
                <ComparisonRow label="Largest Comeback" playerAValue={progressionValue(one, "largestComebackCompleted")} playerBValue={progressionValue(two, "largestComebackCompleted")} format={integer} />
                <ComparisonRow label="Matches Won After Trailing" playerAValue={progressionValue(one, "matchesWonAfterTrailing")} playerBValue={progressionValue(two, "matchesWonAfterTrailing")} format={integer} />
                <ComparisonRow label="Consecutive Holes Won" playerAValue={progressionValue(one, "mostConsecutiveHolesWon")} playerBValue={progressionValue(two, "mostConsecutiveHolesWon")} format={integer} />
                <ComparisonRow label="Front Nine Hole Record" playerAValue={progressionRecord(one, "frontNine")} playerBValue={progressionRecord(two, "frontNine")} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value || "—"} />
                <ComparisonRow label="Back Nine Hole Record" playerAValue={progressionRecord(one, "backNine")} playerBValue={progressionRecord(two, "backNine")} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value || "—"} />
                <ComparisonRow label="Closing Holes Record" playerAValue={progressionRecord(one, "closing")} playerBValue={progressionRecord(two, "closing")} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value || "—"} />
                <ComparisonRow label="Closing Holes Won" playerAValue={progressionValue(one, "totalClosingHolesWon")} playerBValue={progressionValue(two, "totalClosingHolesWon")} format={integer} />
                <ComparisonRow label="Lead Changes Experienced" playerAValue={progressionValue(one, "totalLeadChangesExperienced")} playerBValue={progressionValue(two, "totalLeadChangesExperienced")} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
              </div>
            </IntelligenceSection>

            <IntelligenceSection eyebrow="By competition type" title="Format Performance">
              <div className={styles.formatGrid}>{["BB", "SC", "SI"].map((format) => <FormatCard key={format} format={format} one={one} two={two} />)}</div>
            </IntelligenceSection>

            <IntelligenceSection eyebrow="Deterministic player profile" title="Strengths and Tendencies">
              <div className={styles.insightGrid}><InsightCard player={one} /><InsightCard player={two} /></div>
            </IntelligenceSection>

            <IntelligenceSection eyebrow="Direct opposition only" title="Head-to-Head">
              {h2h ? (
                <>
                  <div className={styles.comparisonGrid}>
                    <ComparisonRow label="Official Record" playerAValue={formatRecord(h2h.officialRecordA)} playerBValue={formatRecord(h2h.officialRecordB)} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={(value) => value} />
                    <ComparisonRow label="Points Won" playerAValue={h2h.pointsA} playerBValue={h2h.pointsB} format={points} />
                    <ComparisonRow label="Holes Won" playerAValue={h2h.playerA.holesWon} playerBValue={h2h.playerB.holesWon} format={integer} />
                    <ComparisonRow label="Holes Lost" playerAValue={h2h.playerA.holesLost} playerBValue={h2h.playerB.holesLost} direction={COMPARISON_DIRECTIONS.LOWER} format={integer} />
                    <ComparisonRow label="Holes Halved" playerAValue={h2h.playerA.holesHalved} playerBValue={h2h.playerB.holesHalved} direction={COMPARISON_DIRECTIONS.INFORMATIONAL} format={integer} />
                    <ComparisonRow label="Hole Differential" playerAValue={h2h.playerA.holeDifferential} playerBValue={h2h.playerB.holeDifferential} format={integer} />
                    <ComparisonRow label="Birdies" playerAValue={h2h.playerA.averageGross === null ? null : h2h.playerA.birdies} playerBValue={h2h.playerB.averageGross === null ? null : h2h.playerB.birdies} format={integer} />
                    <ComparisonRow label="Average Gross Score" playerAValue={h2h.playerA.averageGross} playerBValue={h2h.playerB.averageGross} direction={COMPARISON_DIRECTIONS.LOWER} />
                    <ComparisonRow label="Largest Lead" playerAValue={h2h.playerA.largestLead} playerBValue={h2h.playerB.largestLead} format={integer} />
                    <ComparisonRow label="Largest Comeback" playerAValue={h2h.playerA.largestComeback} playerBValue={h2h.playerB.largestComeback} format={integer} />
                  </div>
                  <div className={styles.h2hContext}>
                    <span>Most Recent Meeting <b>{h2h.mostRecent ? `${h2h.mostRecent.year} · Round ${h2h.mostRecent.round}` : "—"}</b></span>
                    <span>Formats Played <b>{h2h.formats.map(formatName).join(", ") || "—"}</b></span>
                    {h2h.mostRecent?.year && h2h.mostRecent?.round ? <Link href={`/history/${h2h.mostRecent.year}/round/${h2h.mostRecent.round}${h2h.mostRecent.matchId ? `#match-${encodeURIComponent(h2h.mostRecent.matchId)}` : ""}`}>View Head-to-Head Match →</Link> : null}
                  </div>
                </>
              ) : <p className={styles.emptyState}>These Sandbaggers have not faced each other in a recorded match.</p>}
            </IntelligenceSection>

            <section className={styles.summary}>
              <span>SBI Comparison Summary</span>
              <p>{buildComparisonSummary(one, two)}</p>
              <div className={styles.categoryEdges}>
                <CategoryEdge label="Official Career Edge" edge={categoryEdges.official} one={one} two={two} />
                <CategoryEdge label="Scoring Edge" edge={categoryEdges.scoring} one={one} two={two} />
                <CategoryEdge label="Match Play Edge" edge={categoryEdges.matchPlay} one={one} two={two} />
                <CategoryEdge label="Best Ball Edge" edge={categoryEdges.BB} one={one} two={two} />
                <CategoryEdge label="Scramble Edge" edge={categoryEdges.SC} one={one} two={two} />
                <CategoryEdge label="Singles Edge" edge={categoryEdges.SI} one={one} two={two} />
              </div>
            </section>
          </>
        ) : <div className={styles.empty}>Choose two different players.</div>}
      </section>
    </>
  );
}

function finiteRank(value) {
  return available(value) ? `#${value}` : "—";
}
function scoringSample(player) {
  return player.scorecard.sample.completeScorecards || null;
}
function scoringValue(player, field) {
  return player.scorecard.sample.scoringHoles ? player.scorecard[field] : null;
}
function matchPlayValue(player, field) {
  return player.scorecard.sample.matchPlayHoles ? player.scorecard[field] : null;
}
function progressionValue(player, field) {
  return player.progression.matches ? player.progression[field] : null;
}
function progressionRecord(player, field) {
  return player.progression.matches ? segmentRecord(player.progression[field]) : null;
}
