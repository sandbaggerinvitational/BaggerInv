import Link from "next/link";
import MatchStatusBlock from "./MatchStatusBlock";
import { formatOfficialMatchResult } from "../lib/match-result";
import { Fragment } from "react";
import AssetImage from "./AssetImage";
import { teamLogo } from "../lib/asset-paths";
import { formatHandicap, formatTeamPoints } from "../lib/formatters";
import styles from "./live/live.module.css";
import ScorecardTable from "./ScorecardTable";
import { matchState } from "../lib/live-match-ux";
import MatchProgressionSummary from "./MatchProgressionSummary";

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
  if (!hasValue(value) || Number(value) === 0) return "";
  return `${value} stroke${Number(value) === 1 ? "" : "s"} received`;
}

function PlayerName({ player }) {
  if (!player?.slug) return <>{player?.name}</>;
  return <Link href={`/players/${player.slug}`}>{player.name}</Link>;
}

function PlayerSlot({ player, showHandicap = true, showStroke = true }) {
  if (!player) return <div className={styles.playerSlot} aria-hidden="true" />;
  return <div className={styles.playerSlot}>
    <strong><PlayerName player={player} /></strong>
    <span className={styles.playerHandicapSlot}>
      {showHandicap && hasValue(player.playingHcp) ? <small>HCP {formatHandicap(player.playingHcp)}</small> : null}
    </span>
    <span className={styles.playerStrokeSlot}>
      {showStroke && strokeText(player.stroke) ? <em className={styles.strokeBadge}>{strokeText(player.stroke)}</em> : null}
    </span>
  </div>;
}

function TeamHeader({ team }) {
  return <div className={styles.matchTeamHeader}>
    <TeamLogo team={team} />
    <span>{team.name}</span>
  </div>;
}

function ScrambleTeamMeta({ teamHcp, teamStroke }) {
  return <div className={styles.scrambleTeamMeta}>
    <span className={styles.teamHandicapSlot}>
      {hasValue(teamHcp) ? <small className={styles.teamHandicap}>Team Handicap: <b>{formatHandicap(teamHcp)}</b></small> : null}
    </span>
    <span className={styles.teamStrokeSlot}>
      {strokeText(teamStroke) ? <em className={styles.strokeBadge}>{strokeText(teamStroke)}</em> : null}
    </span>
  </div>;
}

function MatchupRoster({ tournament, match }) {
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
        <PlayerSlot player={teamOnePlayers[index]} showHandicap={!scramble} showStroke={!scramble} />
        <span className={styles.playerPairSpacer} aria-hidden="true" />
        <PlayerSlot player={teamTwoPlayers[index]} showHandicap={!scramble} showStroke={!scramble} />
      </Fragment>
    ))}
    {scramble ? <>
      <ScrambleTeamMeta teamHcp={match.team1PlayingHcp} teamStroke={match.team1Stroke} />
      <span aria-hidden="true" />
      <ScrambleTeamMeta teamHcp={match.team2PlayingHcp} teamStroke={match.team2Stroke} />
    </> : null}
  </div>;
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

function Segment({ label, winner, tournament }) {
  return <div className={styles.segment}>
    <span>{label}</span>
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

export default function PublicMatchCard({ match, round, tournament, variant = "live", scorecards = [] }) {
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
  const state = matchState(match);
  const hasPairing = [...(match.team1Players || []), ...(match.team2Players || [])].some((player) => player?.name);
  const hasSegments = Boolean(match.frontWinner || match.backWinner || overallWinner);
  const winnerName = halved ? "Match halved" : winningSide === 1 ? tournament.teamOne.name : winningSide === 2 ? tournament.teamTwo.name : "";
  const statusText = state === "final"
    ? (formatOfficialMatchResult(match.finalResult) || winnerName || "Final")
    : state === "live"
      ? (match.liveStatusText || (liveLeader ? `${liveLeader === 1 ? tournament.teamOne.name : tournament.teamTwo.name} ${Math.abs(Number(match.team1HolesWon) - Number(match.team2HolesWon))} UP` : "All square"))
      : (match.teeTime ? `Tee time ${match.teeTime}` : "Scheduled");

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
    {hasPairing ? <MatchupRoster tournament={tournament} match={match} /> : <div className={styles.pairingPending}><strong>Pairing announcement coming soon</strong><span>{match.teeTime ? `${match.teeTime} · ` : ""}{match.course?.name || round?.course?.name || "Course to be announced"}</span></div>}
    {variant === "live" && (match.currentHole || match.liveStatusText) ? <div className={styles.liveTracker}>
      <span>Through {match.currentHole || "—"}</span>
      <div data-leading={liveLeader === 1 ? "true" : undefined}><strong>{tournament.teamOne.name}</strong><b>{match.team1HolesWon}</b></div>
      <div data-leading={liveLeader === 2 ? "true" : undefined}><strong>{tournament.teamTwo.name}</strong><b>{match.team2HolesWon}</b></div>
      <em>{liveLeader ? `${liveLeader === 1 ? tournament.teamOne.name : tournament.teamTwo.name} ${Math.abs(Number(match.team1HolesWon) - Number(match.team2HolesWon))} UP` : "All square"}</em>
    </div> : null}
    {variant === "historical" ? (
      <>
        <ScorecardTable scorecards={scorecards} compact />
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
        <div className={`${styles.matchScoreRow} ${winningSide === 1 ? styles.matchScoreWinner : ""}`} data-team="one"><span><i aria-hidden="true" />{tournament.teamOne.name}</span><strong>{formatTeamPoints(match.team1Points)}</strong></div>
        <div className={`${styles.matchScoreRow} ${winningSide === 2 ? styles.matchScoreWinner : ""}`} data-team="two"><span><i aria-hidden="true" />{tournament.teamTwo.name}</span><strong>{formatTeamPoints(match.team2Points)}</strong></div>
      </div> : null}
    </div> : null}
    <footer className={styles.matchFreshness}>{match.updatedAt ? <>Last confirmed {match.updatedAt}{match.updatedBy ? ` by ${match.updatedBy}` : ""}</> : state === "live" ? "Waiting for the next confirmed update" : state === "final" ? "Official result" : `${match.course?.name || round?.course?.name || "Course TBA"} · ${match.formatName || round?.format || "Format TBA"}`}</footer>
  </article>;
}
