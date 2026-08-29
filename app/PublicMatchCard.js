import Link from "next/link";
import MatchStatusBlock from "./MatchStatusBlock";
import { formatOfficialMatchResult } from "../lib/match-result";
import { Fragment } from "react";
import AssetImage from "./AssetImage";
import { teamLogo } from "../lib/asset-paths";
import { formatHandicap, formatTeamPoints } from "../lib/formatters";
import { scorecardPresentationData } from "../lib/scorecard-presentation";
import styles from "./live/live.module.css";
import scoreStyles from "./score-typography.module.css";
import ScorecardTable from "./ScorecardTable";
import { matchState } from "../lib/live-match-ux";
import MatchProgressionSummary from "./MatchProgressionSummary";
import { reconstructMatchProgression } from "../lib/match-progression";
import {
  historicalPairingPlayerRows,
  historicalStrokeText,
} from "../lib/history-match-presentation";

const hasValue = (value) => value !== null && value !== undefined && value !== "";
const initials = (name) => String(name ?? "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();

function TeamLogo({ team }) {
  return <span className={styles.logoPlate} data-size="match">
    <AssetImage
      src={teamLogo(team.logo)}
      alt={`${team.name} logo`}
      className={styles.logoImage}
      fallbackClassName={styles.logoFallback}
      fallback={initials(team.name)}
      inferFallback={false}
    />
  </span>;
}

function strokeText(value) {
  return historicalStrokeText(value);
}

function PlayerName({ player, participantPresentation = false }) {
  if (!player?.slug) return <>{player?.name}</>;
  return <Link href={`${participantPresentation ? "/app/players" : "/players"}/${player.slug}`}>{player.name}</Link>;
}

function PlayerSlot({ player, showHandicap = true, showStroke = true, reserveStrokeRow = true, participantPresentation = false }) {
  if (!player) return <div className={`${styles.playerSlot} ${reserveStrokeRow ? "" : styles.playerSlotWithoutStroke}`} aria-hidden="true" />;
  return <div className={`${styles.playerSlot} ${reserveStrokeRow ? "" : styles.playerSlotWithoutStroke}`}>
    <strong><PlayerName player={player} participantPresentation={participantPresentation} /></strong>
    <span className={styles.playerHandicapSlot}>
      {showHandicap && hasValue(player.playingHcp) ? <small>HCP {formatHandicap(player.playingHcp)}</small> : null}
    </span>
    {reserveStrokeRow ? <span className={styles.playerStrokeSlot}>
      {showStroke && strokeText(player.stroke) ? <em className={styles.strokeBadge}>{strokeText(player.stroke)}</em> : null}
    </span> : null}
  </div>;
}

function TeamHeader({ team }) {
  return <div className={styles.matchTeamHeader}>
    <TeamLogo team={team} />
    <span>{team.name}</span>
  </div>;
}

function ScrambleTeamMeta({ teamHcp, teamStroke, showStroke = true }) {
  return <div className={`${styles.scrambleTeamMeta} ${showStroke ? "" : styles.scrambleTeamMetaWithoutStroke}`}>
    <span className={styles.teamHandicapSlot}>
      {hasValue(teamHcp) ? <small className={styles.teamHandicap}>Team Handicap: <b>{formatHandicap(teamHcp)}</b></small> : null}
    </span>
    {showStroke ? <span className={styles.teamStrokeSlot}>
      {strokeText(teamStroke) ? <em className={styles.strokeBadge}>{strokeText(teamStroke)}</em> : null}
    </span> : null}
  </div>;
}

function MatchupRoster({ tournament, match, showStrokeCopy = true, participantPresentation = false }) {
  const scramble = match.format === "SC";
  const teamOnePlayers = match.team1Players || [];
  const teamTwoPlayers = match.team2Players || [];
  const playerCount = Math.max(match.format === "SI" ? 1 : 2, teamOnePlayers.length, teamTwoPlayers.length);

  return <div className={styles.matchupTeams}>
    <TeamHeader team={tournament.teamOne} />
    <b>VS</b>
    <TeamHeader team={tournament.teamTwo} />
    {Array.from({ length: playerCount }, (_, index) => (
      <Fragment key={`player-row-${index}`}>
        <PlayerSlot player={teamOnePlayers[index]} showHandicap={!scramble} showStroke={showStrokeCopy && !scramble} reserveStrokeRow={showStrokeCopy} participantPresentation={participantPresentation} />
        <span className={`${styles.playerPairSpacer} ${showStrokeCopy ? "" : styles.playerPairSpacerWithoutStroke}`} aria-hidden="true" />
        <PlayerSlot player={teamTwoPlayers[index]} showHandicap={!scramble} showStroke={showStrokeCopy && !scramble} reserveStrokeRow={showStrokeCopy} participantPresentation={participantPresentation} />
      </Fragment>
    ))}
    {scramble ? <>
      <ScrambleTeamMeta teamHcp={match.team1PlayingHcp} teamStroke={match.team1Stroke} showStroke={showStrokeCopy} />
      <span aria-hidden="true" />
      <ScrambleTeamMeta teamHcp={match.team2PlayingHcp} teamStroke={match.team2Stroke} showStroke={showStrokeCopy} />
    </> : null}
  </div>;
}

function CompactHistoricalSide({ team, players = [], teamStroke = null, showStroke = true, participantPresentation = false }) {
  const teamStrokeLabel = strokeText(teamStroke);
  return <div className={styles.historicalFinalSide}>
    <span>{team.name}</span>
    <div>
      {players.filter(Boolean).map((player) => {
        const playerStrokeLabel = strokeText(player.stroke);
        return <div key={player.id || player.slug || player.name}>
          <strong><PlayerName player={player} participantPresentation={participantPresentation} /></strong>
          {showStroke && playerStrokeLabel ? <small>{playerStrokeLabel}</small> : null}
        </div>;
      })}
    </div>
    {showStroke && teamStrokeLabel ? <small>{teamStrokeLabel}</small> : null}
  </div>;
}

function CompactHistoricalPlayerName({ player, side, slot, participantPresentation = false }) {
  if (!player) {
    return <span className={styles.historicalFinalPlayerName} data-side={side} data-player-slot={slot} aria-hidden="true" />;
  }
  return <strong className={styles.historicalFinalPlayerName} data-side={side} data-player-slot={slot}>
    <PlayerName player={player} participantPresentation={participantPresentation} />
  </strong>;
}

function CompactHistoricalStrokeLine({ label, side, slot }) {
  const empty = !label;
  return <small
    className={`${styles.historicalFinalStrokeLine} ${empty ? styles.historicalFinalStrokePlaceholder : ""}`}
    data-side={side}
    data-player-slot={slot}
    data-empty={empty ? "true" : undefined}
    aria-hidden={empty ? "true" : undefined}
  >{label || "\u00a0"}</small>;
}

function CompactHistoricalPairing({ teamOne, teamTwo, teamOnePlayers = [], teamTwoPlayers = [], teamOneStroke = null, teamTwoStroke = null, showStroke = true, participantPresentation = false }) {
  const playerRows = historicalPairingPlayerRows(teamOnePlayers, teamTwoPlayers);
  const teamOneStrokeLabel = strokeText(teamOneStroke);
  const teamTwoStrokeLabel = strokeText(teamTwoStroke);
  const hasTeamStrokeLine = Boolean(teamOneStrokeLabel || teamTwoStrokeLabel);

  return <div className={`${styles.historicalFinalMatchup} ${styles.historicalFinalPairing}`}>
    <span className={styles.historicalFinalTeamLabel} data-side="1">{teamOne.name}</span>
    <span className={styles.historicalFinalPairSpacer} aria-hidden="true" />
    <span className={styles.historicalFinalTeamLabel} data-side="2">{teamTwo.name}</span>
    {playerRows.map((row, index) => <Fragment key={`historical-player-slot-${row.slot}`}>
      <CompactHistoricalPlayerName player={row.left.player} side="1" slot={row.slot} participantPresentation={participantPresentation} />
      {index === 0 ? <b aria-label="versus">VS</b> : <span className={styles.historicalFinalPairSpacer} aria-hidden="true" />}
      <CompactHistoricalPlayerName player={row.right.player} side="2" slot={row.slot} participantPresentation={participantPresentation} />
      {showStroke ? <>
        <CompactHistoricalStrokeLine label={row.left.strokeText} side="1" slot={row.slot} />
        <span className={styles.historicalFinalPairSpacer} aria-hidden="true" />
        <CompactHistoricalStrokeLine label={row.right.strokeText} side="2" slot={row.slot} />
      </> : null}
    </Fragment>)}
    {showStroke && hasTeamStrokeLine ? <>
      <small className={styles.historicalFinalTeamStroke} data-side="1">{teamOneStrokeLabel || "\u00a0"}</small>
      <span className={styles.historicalFinalPairSpacer} aria-hidden="true" />
      <small className={styles.historicalFinalTeamStroke} data-side="2">{teamTwoStrokeLabel || "\u00a0"}</small>
    </> : null}
  </div>;
}

function reconstructedResult(scorecards = [], useHistoricalProgression = false) {
  if (scorecards.some((scorecard) => scorecard.historyProgressionSuppressed)) return "";
  const progression = reconstructMatchProgression(useHistoricalProgression
    ? scorecards.map((scorecard) => scorecard.historyProgressionMatchNetScoring
      ? { ...scorecard, matchNetScoring: scorecard.historyProgressionMatchNetScoring }
      : scorecard)
    : scorecards);
  if (!progression) return "";
  if (!progression.winnerSide) return "Match Halved";
  const winner = progression.winnerSide === "A" ? progression.sideA : progression.sideB;
  const holder = winner.playerNames?.length ? winner.playerNames.join(" & ") : winner.teamName;
  return `${holder} ${winner.playerNames?.length > 1 ? "win" : "wins"} ${progression.finalMargin.label}`;
}

function winnerLabel(value, tournament) {
  if (value === "Team 1") return tournament.teamOne.name;
  if (value === "Team 2") return tournament.teamTwo.name;
  if (value === "Halved") return "Halved";
  return "Pending";
}

function winnerClass(value) {
  if (value === "Team 1") return styles.teamOneBadge;
  if (value === "Team 2") return styles.teamTwoBadge;
  return styles.halvedBadge;
}

function Segment({ label, winner, tournament, participant = "" }) {
  return <div className={styles.segment}>
    <span>{label}</span>
    {participant ? <b className={styles.segmentParticipant}>{participant}</b> : null}
    <strong className={`${styles.winnerBadge} ${winnerClass(winner)}`}>{winnerLabel(winner, tournament)}</strong>
  </div>;
}

function winnerSide(match) {
  if (hasValue(match.team1Points) && hasValue(match.team2Points) && Number(match.team1Points) !== Number(match.team2Points)) {
    return Number(match.team1Points) > Number(match.team2Points) ? 1 : 2;
  }
  if ([match.matchupWinner, match.overallWinner].includes("Team 1")) return 1;
  if ([match.matchupWinner, match.overallWinner].includes("Team 2")) return 2;
  return null;
}

function TrophyIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M20 8h24v8c0 10-4.8 18.2-12 21.2C24.8 34.2 20 26 20 16V8Z" fill="currentColor" />
    <path d="M20 14H10v5c0 9 5.2 15 14 16M44 14h10v5c0 9-5.2 15-14 16M32 37v10M22 55h20M26 47h12v8H26z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function PublicMatchCard({ match, round, tournament, variant = "live", scorecards = [], scorecardCoverage = null, historyDensity = false, completedHistoryCompact = false, participantPresentation = false }) {
  const scorecardTableData = historyDensity ? scorecardPresentationData(scorecards) : scorecards;
  const winningSide = winnerSide(match);
  const halved = !winningSide && [match.matchupWinner, match.overallWinner].includes("Halved");
  const overallWinner = match.overallWinner || match.matchupWinner;
  const topLabel = match.course?.name || `${round?.label || `Round ${match.round || ""}`} · Match ${match.match}`;
  const isGhostMatch = String(match.status || "").trim().toUpperCase() === "GHOST MATCH";
  const cardStyle = {
    "--team-one-color": tournament.teamOne.primaryColor || "#0b3529",
    "--team-two-color": tournament.teamTwo.primaryColor || "#24386f",
  };
  const liveLeader = Number(match.team1HolesWon) === Number(match.team2HolesWon)
    ? 0 : Number(match.team1HolesWon) > Number(match.team2HolesWon) ? 1 : 2;
  const state = completedHistoryCompact ? "final" : matchState(match);
  const historyYear = Number(tournament?.year ?? tournament?.Year ?? match?.year ?? match?.Year);
  const historyScorecardParity = variant === "historical" &&
    historyYear >= 2023 && historyYear <= 2025 &&
    scorecards.length > 0;
  const completedHistoryMatchupCleanup = completedHistoryCompact && [2023, 2024, 2025].includes(historyYear) ||
    completedHistoryCompact && historyYear >= 2017 && historyYear <= 2022;
  const showCompletedHistoricalNineHoleSegments = match.format !== "SI" ||
    (historyYear === 2023 && match.id === "2023-R3-7");
  const completedHistoricalSegmentParticipant = (winner) => {
    if (historyYear !== 2023 || match.id !== "2023-R3-7") return "";
    if (winner === "Team 1") return match.team1Players?.[0]?.name || "";
    if (winner === "Team 2") return match.team2Players?.[0]?.name || "";
    return "";
  };
  const hasPairing = [...(match.team1Players || []), ...(match.team2Players || [])].some((player) => player?.name);
  const hasSegments = Boolean(match.frontWinner || match.backWinner || overallWinner);
  const winnerName = halved ? "Match halved" : winningSide === 1 ? tournament.teamOne.name : winningSide === 2 ? tournament.teamTwo.name : "";
  const statusText = state === "final"
    ? (formatOfficialMatchResult(match.finalResult) || reconstructedResult(scorecards) || winnerName || "Final")
    : state === "live"
      ? (match.liveStatusText || (liveLeader ? `${liveLeader === 1 ? tournament.teamOne.name : tournament.teamTwo.name} ${Math.abs(Number(match.team1HolesWon) - Number(match.team2HolesWon))} UP` : "All square"))
      : (match.teeTime ? `Tee time ${match.teeTime}` : "Scheduled");

  if (completedHistoryCompact) {
    const winningPlayers = winningSide === 1
      ? (match.team1Players || [])
      : winningSide === 2 ? (match.team2Players || []) : [];
    const fallbackWinner = winningPlayers.map((player) => player?.name).filter(Boolean).join(" & ");
    const useReconstructedFinalResult = historyYear !== 2024 || match.format === "SC";
    const finalResult = (useReconstructedFinalResult
      ? reconstructedResult(scorecards, historyYear === 2024)
      : "") || (halved
      ? "Match Halved"
      : fallbackWinner
        ? `${fallbackWinner} ${winningPlayers.length === 1 ? "wins" : "win"}`
        : winningSide ? `${winnerName} win` : "Final result recorded");
    const sideOneLabel = (match.team1Players || []).map((player) => player?.name).filter(Boolean).join(" and ");
    const sideTwoLabel = (match.team2Players || []).map((player) => player?.name).filter(Boolean).join(" and ");
    const participantLabel = `${sideOneLabel} versus ${sideTwoLabel}`;
    const hasCompletePointAllocation = hasValue(match.team1Points) && hasValue(match.team2Points);
    const pointsLabel = hasCompletePointAllocation
      ? `${tournament.teamOne.name} ${formatTeamPoints(match.team1Points)}, ${tournament.teamTwo.name} ${formatTeamPoints(match.team2Points)}`
      : "Team points not recorded";

    return <article className={`${styles.matchCard} ${styles.historicalFinalCard}`} id={match.id ? `match-${match.id}` : undefined} style={cardStyle} data-match-state="final" aria-label={`Match ${match.match}, Final. ${participantLabel}. ${finalResult}. ${pointsLabel}.`}>
      <header className={styles.historicalFinalHeader}>
        <span>Match {match.match} · {match.formatName || round?.format}</span>
        <MatchStatusBlock status="final" result="" meta="" />
      </header>

      {variant === "historical" && isGhostMatch ? <div className={styles.ghostMatchNotice}><strong>GHOST MATCH</strong><span>Selected player results are excluded from official records.</span></div> : null}

      {match.format === "SI" ? <div className={styles.historicalFinalMatchup}>
        <CompactHistoricalSide team={tournament.teamOne} players={match.team1Players} showStroke={!completedHistoryMatchupCleanup} participantPresentation={participantPresentation} />
        <b aria-label="versus">VS</b>
        <CompactHistoricalSide team={tournament.teamTwo} players={match.team2Players} showStroke={!completedHistoryMatchupCleanup} participantPresentation={participantPresentation} />
      </div> : <CompactHistoricalPairing
        teamOne={tournament.teamOne}
        teamTwo={tournament.teamTwo}
        teamOnePlayers={match.team1Players}
        teamTwoPlayers={match.team2Players}
        teamOneStroke={match.format === "SC" ? match.team1Stroke : null}
        teamTwoStroke={match.format === "SC" ? match.team2Stroke : null}
        showStroke={!completedHistoryMatchupCleanup}
        participantPresentation={participantPresentation}
      />}

      <div className={styles.historicalFinalResult}>
        <span>Final result</span>
        <strong>{finalResult}</strong>
        {hasCompletePointAllocation ? <small>{tournament.teamOne.name} {formatTeamPoints(match.team1Points)} <i aria-hidden="true">—</i> {formatTeamPoints(match.team2Points)} {tournament.teamTwo.name}</small> : <small>Team points not recorded</small>}
      </div>

      <ScorecardTable
        scorecards={scorecardTableData}
        historicalCoverage={scorecardCoverage}
        compact
        deferClosedContent={historyDensity}
        historyDensity={historyDensity}
        showSummary={historyScorecardParity}
        stackPairingIdentities={historyScorecardParity}
        participantPresentation={participantPresentation}
      />

      {(hasSegments || scorecards.length || match.notes) ? <details className={styles.historicalMatchDetails}>
        <summary>View Match Details <span aria-hidden="true">⌄</span></summary>
        <div className={styles.historicalMatchDetailsBody}>
          {scorecards.length ? <MatchProgressionSummary scorecards={scorecards} /> : null}
          {hasSegments ? <div className={`${styles.segmentGrid} ${match.format === "SI" ? styles.singleSegmentGrid : ""}`}>
            {showCompletedHistoricalNineHoleSegments ? <>
              <Segment label="Front 9" winner={match.frontWinner} tournament={tournament} participant={completedHistoricalSegmentParticipant(match.frontWinner)} />
              <Segment label="Back 9" winner={match.backWinner} tournament={tournament} participant={completedHistoricalSegmentParticipant(match.backWinner)} />
            </> : null}
            <Segment label="Overall" winner={overallWinner} tournament={tournament} participant={completedHistoricalSegmentParticipant(overallWinner)} />
          </div> : null}
          {match.notes ? <p className={styles.matchNotes}>{match.notes}</p> : null}
        </div>
      </details> : null}

    </article>;
  }

  return <article className={styles.matchCard} id={match.id ? `match-${match.id}` : undefined} style={cardStyle} data-match-state={state} aria-label={`Match ${match.match}: ${statusText}`} tabIndex="0">
    <div className={styles.matchTop}><span>{topLabel}</span><span>{state === "upcoming" ? match.teeTime || match.status : match.status}</span></div>
    <div className={styles.matchMeta}>
      <span>Match {match.match} · {match.formatName || round?.format}</span>
      <MatchStatusBlock
        status={state}
        result={state === "upcoming" ? "" : statusText}
        meta={state === "live" && match.currentHole ? `Through ${match.currentHole}` : ""}
      />
    </div>
    {variant === "historical" && isGhostMatch ? (
      <div className={styles.ghostMatchNotice}>
        <strong>GHOST MATCH</strong>
        <span>Selected player results are excluded from official records.</span>
      </div>
    ) : null}
    {hasPairing ? <MatchupRoster tournament={tournament} match={match} showStrokeCopy={!historyScorecardParity} participantPresentation={participantPresentation} /> : <div className={styles.pairingPending}><strong>Pairing announcement coming soon</strong><span>{match.teeTime ? `${match.teeTime} · ` : ""}{match.course?.name || round?.course?.name || "Course to be announced"}</span></div>}
    {variant === "live" && (match.currentHole || match.liveStatusText) ? <div className={styles.liveTracker}>
      <span>Through {match.currentHole || "—"}</span>
      <div data-leading={liveLeader === 1 ? "true" : undefined}><strong>{tournament.teamOne.name}</strong><b>{match.team1HolesWon}</b></div>
      <div data-leading={liveLeader === 2 ? "true" : undefined}><strong>{tournament.teamTwo.name}</strong><b>{match.team2HolesWon}</b></div>
      <em>{liveLeader ? `${liveLeader === 1 ? tournament.teamOne.name : tournament.teamTwo.name} ${Math.abs(Number(match.team1HolesWon) - Number(match.team2HolesWon))} UP` : "All square"}</em>
    </div> : null}
    {variant === "historical" ? (
      <>
        <ScorecardTable
          scorecards={scorecardTableData}
          historicalCoverage={scorecardCoverage}
          compact
          deferClosedContent={historyDensity}
          historyDensity={historyDensity}
          showSummary={historyScorecardParity}
          stackPairingIdentities={historyScorecardParity}
          participantPresentation={participantPresentation}
        />
        <MatchProgressionSummary scorecards={scorecards} />
      </>
    ) : null}
    {hasSegments ? <details className={styles.segmentDetails} open={state === "final"}>
      <summary>Front, back and overall results</summary>
      <div className={`${styles.segmentGrid} ${match.format === "SI" ? styles.singleSegmentGrid : ""}`}>
        {match.format !== "SI" ? <>
          <Segment label="Front 9" winner={match.frontWinner} tournament={tournament} />
          <Segment label="Back 9" winner={match.backWinner} tournament={tournament} />
        </> : null}
        <Segment label="Overall" winner={overallWinner} tournament={tournament} />
      </div>
    </details> : null}
    {match.notes ? <p className={styles.matchNotes}>{match.notes}</p> : null}
    {(hasValue(match.team1Points) || hasValue(match.team2Points) || (variant === "historical" && (winningSide || halved))) ? <div className={styles.matchResult}>
      <span className={styles.matchResultLabel}>{halved ? "Match Halved" : winningSide ? "Match Result" : "Match Points"}</span>
      {variant === "historical" && (winningSide || halved) ? <div className={`${styles.matchWinnerBanner} ${halved ? styles.halvedBadge : winningSide === 1 ? styles.teamOneBadge : styles.teamTwoBadge}`}>
        {winningSide ? <TrophyIcon /> : null}
        <strong>{halved ? "Match Halved" : winningSide === 1 ? tournament.teamOne.name : tournament.teamTwo.name}</strong>
      </div> : null}
      {(hasValue(match.team1Points) || hasValue(match.team2Points)) ? <div className={styles.matchScoreTable}>
        <div className={`${styles.matchScoreRow} ${winningSide === 1 ? styles.matchScoreWinner : ""}`} data-team="one"><span><i aria-hidden="true" />{tournament.teamOne.name}</span><strong className={scoreStyles.centeredScore}>{formatTeamPoints(match.team1Points)}</strong></div>
        <div className={`${styles.matchScoreRow} ${winningSide === 2 ? styles.matchScoreWinner : ""}`} data-team="two"><span><i aria-hidden="true" />{tournament.teamTwo.name}</span><strong className={scoreStyles.centeredScore}>{formatTeamPoints(match.team2Points)}</strong></div>
      </div> : null}
    </div> : null}
    <footer className={styles.matchFreshness}>{match.updatedAt ? <>Last confirmed {match.updatedAt}{match.updatedBy ? ` by ${match.updatedBy}` : ""}</> : state === "live" ? "Waiting for the next confirmed update" : state === "final" ? "Official result" : `${match.course?.name || round?.course?.name || "Course TBA"} · ${match.formatName || round?.format || "Format TBA"}`}</footer>
  </article>;
}
