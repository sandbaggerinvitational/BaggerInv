"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import AssetImage from "../AssetImage";
import { addTournamentRanks } from "../../lib/rankings";
import { courseLogo, teamLogo } from "../../lib/asset-paths";
import { formatHandicap, formatPoints } from "../../lib/formatters";
import { clinchingScenariosEligible } from "../../lib/live-tournament";
import TournamentLeaderboard from "../TournamentLeaderboard";
import styles from "./live.module.css";

const hasValue = (value) => value !== null && value !== undefined && value !== "";
const initials = (name) => String(name ?? "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const pointsText = (value) => `${formatPoints(value)} point${Number(value) === 1 ? "" : "s"}`;

function Logo({ filename, name, type = "team", size = "medium" }) {
  const src = type === "course" ? courseLogo(filename) : teamLogo(filename);
  return <span className={styles.logoPlate} data-size={size}>
    <AssetImage src={src} alt={`${name} logo`} className={styles.logoImage} fallbackClassName={styles.logoFallback} fallback={initials(name)} inferFallback={false} />
  </span>;
}

function TeamIdentity({ team, side, score, compact = false }) {
  return <div className={styles.bannerTeam} data-side={side} data-compact={compact ? "true" : "false"}>
    <Logo filename={team.logo} name={team.name} size={compact ? "small" : "large"} />
    <div><strong>{team.name}</strong>{hasValue(score) ? <b>{formatPoints(score)}</b> : null}</div>
  </div>;
}

function strokeText(value) {
  if (!hasValue(value) || Number(value) === 0) return "";
  return `${value} stroke${Number(value) === 1 ? "" : "s"} received`;
}

function PlayerSlot({ player, showHandicap = true, showStroke = true }) {
  if (!player) return <div className={styles.playerSlot} aria-hidden="true" />;
  return <div className={styles.playerSlot}>
    <strong>{player.name}</strong>
    <span className={styles.playerHandicapSlot}>
      {showHandicap && hasValue(player.playingHcp) ? <small>HCP {formatHandicap(player.playingHcp)}</small> : null}
    </span>
    <span className={styles.playerStrokeSlot}>
      {showStroke && strokeText(player.stroke) ? <em className={styles.strokeBadge}>{strokeText(player.stroke)}</em> : null}
    </span>
  </div>;
}

function MatchTeamHeader({ team }) {
  return <div className={styles.matchTeamHeader}>
    <Logo filename={team.logo} name={team.name} size="match" />
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
  const { format } = match;
  const scramble = format === "SC";
  const teamOnePlayers = match.team1Players || [];
  const teamTwoPlayers = match.team2Players || [];
  const playerCount = Math.max(format === "SI" ? 1 : 2, teamOnePlayers.length, teamTwoPlayers.length);

  return <div className={styles.matchupTeams}>
    <MatchTeamHeader team={tournament.teamOne} />
    <b>VS</b>
    <MatchTeamHeader team={tournament.teamTwo} />
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

function Segment({ label, winner, tournament }) {
  const className = winner === "Team 1" ? styles.teamOneBadge : winner === "Team 2" ? styles.teamTwoBadge : styles.halvedBadge;
  return <div className={styles.segment}><span>{label}</span><strong className={`${styles.winnerBadge} ${className}`}>{winnerLabel(winner, tournament)}</strong></div>;
}

function ChampionshipBanner({ tournament }) {
  const state = tournament.state;
  const winner = state.championSide === 2 ? tournament.teamTwo : tournament.teamOne;
  const loser = state.championSide === 2 ? tournament.teamOne : tournament.teamTwo;
  return <section className={styles.championBanner}>
    <p>🏆 {tournament.year} Sandbagger Champions</p>
    <Logo filename={winner.logo} name={winner.name} size="champion" />
    <h2>{winner.name}</h2>
    <strong>Final Score · {formatPoints(tournament.teamOne.score)}–{formatPoints(tournament.teamTwo.score)}</strong>
    <span>over {loser.name}</span>
    <Link href={`/champions/${tournament.year}`}>View Final Results →</Link>
  </section>;
}

function LiveBanner({ tournament }) {
  const state = tournament.state;
  return <section className={styles.scoreboard}>
    <TeamIdentity team={tournament.teamOne} side="one" score={tournament.teamOne.score} />
    <div className={styles.scoreCenter}>
      <span>{tournament.status}</span>
      <strong>Tournament Score</strong>
      <b>Round {tournament.currentRound}</b>
    </div>
    <TeamIdentity team={tournament.teamTwo} side="two" score={tournament.teamTwo.score} />
    <div className={styles.statusRibbon}>
      <span>{state.liveMatches} live</span><i>•</i><span>{state.remainingMatches} matches remaining</span><i>•</i><span>{formatPoints(state.remainingPoints)} points remaining</span>
    </div>
  </section>;
}

function RoundNavigation({ rounds, activeRound, onSelect }) {
  return <div className={styles.roundNavigation} role="tablist" aria-label="Tournament rounds">
    {rounds.map((round) => <button type="button" role="tab" aria-selected={round.number === activeRound} className={round.number === activeRound ? styles.activeRound : ""} onClick={() => onSelect(round.number)} key={round.number}>
      <Logo filename={round.course.logo} name={round.course.name || round.label} type="course" size="round" />
      <span><b>{round.label}</b><strong>{round.format}</strong><small>{round.course.name || "Course to be announced"}</small><em data-status={round.status}>{round.status}</em></span>
    </button>)}
  </div>;
}

function RoundProgress({ round }) {
  const progress = round.progress;
  return <section className={styles.roundProgress}>
    <div><p>Round {round.number} Progress</p><h2>{progress.completedMatches} of {progress.totalMatches} matches complete</h2><span>{formatPoints(progress.decidedPoints)} of {formatPoints(progress.totalPoints)} points decided</span></div>
    <div className={styles.progressMeta}><strong>{progress.liveMatches} Live · {progress.completedMatches} Complete · {progress.scheduledMatches} Scheduled</strong><span>{round.status === "Complete" ? "Round Complete" : `${formatPoints(progress.remainingPoints)} round points remaining`}</span></div>
    <div className={styles.progressTrack}><i style={{ width: `${Math.min(100, progress.percent)}%` }} /></div>
  </section>;
}

function TournamentStats({ tournament, rounds, remainingByRound, momentum }) {
  const state = tournament.state;
  const scenariosEligible = clinchingScenariosEligible(rounds);
  const champion = state.championSide === 2 ? tournament.teamTwo : tournament.teamOne;
  return <>
    <div className={styles.statModules}>
      <section className={styles.statCard}>
        <p>{state.clinched ? "Tournament Clinched" : "Points to Clinch"}</p>
        {state.clinched ? <div className={styles.clinchedMini}><Logo filename={champion.logo} name={champion.name} size="small" /><strong>{champion.name}</strong><span>has secured the {tournament.year} Sandbagger Invitational.</span></div> : <div className={styles.clinchRows}>
          {[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; return <div key={team.name}><Logo filename={team.logo} name={team.name} size="small" /><span><strong>{team.name}</strong><small>Need {pointsText(side.pointsToClinch)} to clinch{side.pointsToTie > 0 ? ` · ${pointsText(side.pointsToTie)} guarantees a tie` : ""}</small></span></div>; })}
        </div>}
      </section>
      <section className={styles.statCard}>
        <p>Still on the course</p>
        <div className={styles.bigStats}><div><strong>{state.remainingMatches}</strong><span>Remaining Matches</span></div><div><strong>{formatPoints(state.remainingPoints)}</strong><span>Remaining Points</span></div></div>
        <div className={styles.roundBreakdown}>{remainingByRound.map((round) => <span key={round.number}>{round.label}: {round.matches} match{round.matches === 1 ? "" : "es"} · {formatPoints(round.points)} pts</span>)}</div>
      </section>
      {momentum ? <section className={styles.statCard}><p>Team Momentum</p><div className={styles.momentumRows}><div><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="small" /><span><strong>{tournament.teamOne.name}</strong><small>{momentum.teamOne}</small></span></div><div><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="small" /><span><strong>{tournament.teamTwo.name}</strong><small>{momentum.teamTwo}</small></span></div></div></section> : null}
    </div>
    {scenariosEligible ? <section className={styles.scenarios}>
      <p>{state.clinched ? "Tournament Clinched" : "Clinching Scenarios"}</p>
      {state.clinched ? <h2>{champion.name} have secured the {tournament.year} Sandbagger Invitational.</h2> : <div className={styles.scenarioGrid}>
        {[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; const opponent = index ? tournament.teamOne : tournament.teamTwo; return <div key={team.name}><strong>{team.name} clinch with:</strong><ul><li>{pointsText(side.pointsToClinch)} in Singles</li><li>Any combination of wins and halves totaling {formatPoints(side.pointsToClinch)} points</li><li>Hold {opponent.name} below {formatPoints(state.remainingPoints - side.pointsToClinch + 0.5)} additional points</li></ul></div>; })}
      </div>}
    </section> : null}
  </>;
}

function MobileInsight({ title, preview, children, highlighted = false }) {
  return <details className={styles.mobileInsight} data-highlighted={highlighted ? "true" : "false"}>
    <summary><span><strong>{title}</strong><small>{preview}</small></span><i aria-hidden="true">⌄</i></summary>
    <div>{children}</div>
  </details>;
}

function MobileTournamentInsights({ tournament, round, rounds, remainingByRound, momentum }) {
  if (!round) return null;
  const state = tournament.state;
  const scenariosEligible = clinchingScenariosEligible(rounds);
  const leaderSide = state.clinched
    ? (state.championSide === 2 ? state.teamTwo : state.teamOne)
    : (state.teamOne.pointsToClinch <= state.teamTwo.pointsToClinch ? state.teamOne : state.teamTwo);
  const leaderTeam = leaderSide === state.teamOne ? tournament.teamOne : tournament.teamTwo;
  return <div className={styles.mobileInsights}>
    <MobileInsight title="Round Progress" preview={`${round.progress.completedMatches} / ${round.progress.totalMatches} matches complete`}>
      <RoundProgress round={round} />
    </MobileInsight>
    <MobileInsight title={state.clinched ? "Tournament Clinched" : "Points to Clinch"} preview={state.clinched ? `${leaderTeam.name} have secured the Cup` : `${leaderTeam.name} need ${pointsText(leaderSide.pointsToClinch)} more`}>
      <div className={styles.clinchRows}>{[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; return <div key={team.name}><Logo filename={team.logo} name={team.name} size="small" /><span><strong>{team.name}</strong><small>{side.pointsToClinch > 0 ? `Need ${pointsText(side.pointsToClinch)} to clinch` : "At the clinching target"}</small></span></div>; })}</div>
    </MobileInsight>
    <MobileInsight title="Still On Course" preview={`${state.remainingMatches} match${state.remainingMatches === 1 ? "" : "es"} remain`}>
      <div className={styles.bigStats}><div><strong>{state.remainingMatches}</strong><span>Remaining Matches</span></div><div><strong>{formatPoints(state.remainingPoints)}</strong><span>Remaining Points</span></div></div>
      <div className={styles.roundBreakdown}>{remainingByRound.map((item) => <span key={item.number}>{item.label}: {item.matches} match{item.matches === 1 ? "" : "es"} · {formatPoints(item.points)} pts</span>)}</div>
    </MobileInsight>
    {momentum ? <MobileInsight title="Team Momentum" preview={momentum.teamOne}>
      <div className={styles.momentumRows}><div><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="small" /><span><strong>{tournament.teamOne.name}</strong><small>{momentum.teamOne}</small></span></div><div><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="small" /><span><strong>{tournament.teamTwo.name}</strong><small>{momentum.teamTwo}</small></span></div></div>
    </MobileInsight> : null}
    {scenariosEligible ? <MobileInsight title="Clinching Scenarios" preview={`${formatPoints(state.remainingPoints)} points remain`} highlighted>
      <div className={styles.scenarioGrid}>{[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; return <div key={team.name}><strong>{team.name} clinch with:</strong><ul><li>{pointsText(side.pointsToClinch)} in Singles</li><li>Any combination totaling {formatPoints(side.pointsToClinch)} points</li></ul></div>; })}</div>
    </MobileInsight> : null}
  </div>;
}

function winnerSide(match) {
  if (hasValue(match.team1Points) && hasValue(match.team2Points) && Number(match.team1Points) !== Number(match.team2Points)) return Number(match.team1Points) > Number(match.team2Points) ? 1 : 2;
  if ([match.matchupWinner, match.overallWinner].includes("Team 1")) return 1;
  if ([match.matchupWinner, match.overallWinner].includes("Team 2")) return 2;
  return null;
}

function MatchCard({ match, round, tournament }) {
  const winningSide = winnerSide(match);
  return <article className={styles.matchCard}>
    <div className={styles.matchTop}><span>{match.course.name || `${round.label} · Match ${match.match}`}</span><span>{match.teeTime || match.status}</span></div>
    <div className={styles.matchMeta}><span>Match {match.match}</span><strong>{match.status}</strong></div>
    <MatchupRoster tournament={tournament} match={match} />
    <div className={`${styles.segmentGrid} ${match.format === "SI" ? styles.singleSegmentGrid : ""}`}>
      {match.format !== "SI" ? <><Segment label="Front 9" winner={match.frontWinner} tournament={tournament} /><Segment label="Back 9" winner={match.backWinner} tournament={tournament} /></> : null}
      <Segment label="Overall" winner={match.overallWinner || match.matchupWinner} tournament={tournament} />
    </div>
    {match.notes ? <p className={styles.matchNotes}>{match.notes}</p> : null}
    {(hasValue(match.team1Points) || hasValue(match.team2Points)) ? <div className={styles.matchResult}><span className={styles.matchResultLabel}>{winningSide ? "Match Winner" : "Match Points"}</span><div className={styles.matchScoreTable}>
      <div className={`${styles.matchScoreRow} ${winningSide === 1 ? styles.matchScoreWinner : ""}`}><span><i aria-hidden="true" />{tournament.teamOne.name}</span><strong>{formatPoints(match.team1Points)}</strong></div>
      <div className={`${styles.matchScoreRow} ${winningSide === 2 ? styles.matchScoreWinner : ""}`}><span><i aria-hidden="true" />{tournament.teamTwo.name}</span><strong>{formatPoints(match.team2Points)}</strong></div>
    </div></div> : null}
  </article>;
}

export default function MatchCenter({ initialData, loadError }) {
  const tournament = initialData?.tournament;
  const rounds = initialData?.rounds || [];
  const [activeRound, setActiveRound] = useState(
    Number.isFinite(Number(tournament?.currentRound)) ? Number(tournament.currentRound) : rounds.at(-1)?.number || rounds[0]?.number
  );
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const active = rounds.find((round) => round.number === activeRound) || rounds[0];
  const rankedLeaderboard = useMemo(() => addTournamentRanks(initialData?.leaderboard || [], "points"), [initialData]);
  const leaderboard = showLeaderboard ? rankedLeaderboard : rankedLeaderboard.slice(0, 5);
  const roundTotals = useMemo(() => (active?.matches || []).reduce((totals, match) => ({ teamOne: totals.teamOne + (match.team1Points || 0), teamTwo: totals.teamTwo + (match.team2Points || 0) }), { teamOne: 0, teamTwo: 0 }), [active]);

  if (!tournament) return <section className={styles.content}><div className={styles.errorBox}><h1>Live Match Center</h1><p>{loadError || "Live data is not available yet."}</p></div></section>;
  const championshipMode = tournament.state.complete && tournament.state.championSide;
  const isLive = ["live", "in progress", "in-progress"].includes(String(tournament.status).toLowerCase());
  const leaderboardTitle = championshipMode ? "Final Player Leaderboard" : isLive ? "Live Player Leaderboard" : "Player Standings";

  return <>
    <section className={styles.hero}><div><p className={styles.eyebrow}>{tournament.status}</p><h1>Match Center</h1><p>{tournament.year} Sandbagger Invitational{tournament.location ? ` · ${tournament.location}` : ""}</p>{tournament.liveMessage ? <div className={styles.liveMessage}>{tournament.liveMessage}</div> : null}</div></section>
    {championshipMode ? <ChampionshipBanner tournament={tournament} /> : <LiveBanner tournament={tournament} />}
    <section className={styles.content}>
      {rounds.length ? <RoundNavigation rounds={rounds} activeRound={active?.number} onSelect={setActiveRound} /> : null}
      <div className={styles.desktopInsights}>{active ? <RoundProgress round={active} /> : null}<TournamentStats tournament={tournament} rounds={rounds} remainingByRound={initialData?.remainingByRound || []} momentum={initialData?.momentum} /></div>
      <MobileTournamentInsights tournament={tournament} round={active} rounds={rounds} remainingByRound={initialData?.remainingByRound || []} momentum={initialData?.momentum} />
      {active ? <><div className={styles.roundHeader}><div><span>{active.format}</span><h2>{active.label}</h2><p>{active.course.name}{active.course.tee ? ` · ${active.course.tee} tees` : ""}</p></div><div className={styles.roundTotals}><span>Round Points</span><strong>{formatPoints(roundTotals.teamOne)} – {formatPoints(roundTotals.teamTwo)}</strong></div></div><div className={styles.matchGrid}>{active.matches.map((match) => <MatchCard match={match} round={active} tournament={tournament} key={match.id} />)}</div></> : null}
      {rankedLeaderboard.length ? <><div className={styles.leaderboardHeader}><div><span>Individual Leaders</span><h2>{leaderboardTitle} {isLive || championshipMode ? <em data-mode={championshipMode ? "final" : "live"}>{championshipMode ? "Final" : "Live"}</em> : null}</h2></div></div>
        <TournamentLeaderboard rows={leaderboard} />
        {rankedLeaderboard.length > 5 ? <button className={styles.leaderboardToggle} type="button" onClick={() => setShowLeaderboard((value) => !value)}>{showLeaderboard ? "Show Top Five" : "View Full Leaderboard →"}</button> : null}</> : null}
      {loadError ? <p className={styles.testNote}>{loadError}</p> : null}
    </section>
  </>;
}
