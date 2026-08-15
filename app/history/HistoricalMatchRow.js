import Link from "next/link";
import StatusBadge from "../StatusBadge";
import ScorecardTable from "../ScorecardTable";
import MatchProgressionSummary from "../MatchProgressionSummary";
import { formatOfficialMatchResult } from "../../lib/match-result";
import { matchState } from "../../lib/live-match-ux";
import { formatTeamPoints } from "../../lib/formatters";
import styles from "./historical-match-row.module.css";
import density from "./history-density.module.css";

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function PlayerName({ player }) {
  return player?.slug ? <Link href={`/players/${player.slug}`}>{player.name}</Link> : <>{player?.name}</>;
}

function Side({ team, players = [] }) {
  return <div className={styles.side}>
    <span>{team.name}</span>
    <div>{players.filter(Boolean).map((player) => <strong key={player.id || player.slug || player.name}><PlayerName player={player} /></strong>)}</div>
  </div>;
}

function teamValue(value, tournament) {
  if (value === "Team 1") return tournament.teamOne.name;
  if (value === "Team 2") return tournament.teamTwo.name;
  if (/halved|tie/i.test(String(value || ""))) return "Halved";
  return value || "Not recorded";
}

function replaceTeamLabels(value, tournament) {
  return formatOfficialMatchResult(value)
    .replace(/\bTeam 1\b/gi, tournament.teamOne.name)
    .replace(/\bTeam 2\b/gi, tournament.teamTwo.name);
}

function resultText(match, tournament, state) {
  if (state === "final") {
    return replaceTeamLabels(match.finalResult || match.liveStatusText || match.notes || "Final", tournament);
  }
  if (state === "live") return replaceTeamLabels(match.liveStatusText || "Match in progress", tournament);
  return match.teeTime ? `Tee time ${match.teeTime}` : "Scheduled";
}

export default function HistoricalMatchRow({ match, round, tournament, scorecards = [] }) {
  const state = matchState(match);
  const result = resultText(match, tournament, state);
  const segments = [
    ...(match.format === "SI" ? [] : [["Front 9", match.frontWinner], ["Back 9", match.backWinner]]),
    ["Overall", match.overallWinner || match.matchupWinner],
  ].filter(([, value]) => value);
  const ghost = String(match.status || "").trim().toUpperCase() === "GHOST MATCH";

  return <article className={styles.row} data-state={state} aria-label={`Match ${match.match}. ${result}.`}>
    <header className={`${styles.header} ${density.matchHeader}`}>
      <div><span>Match {match.match}</span><strong>{match.formatName || round?.format || "Match"}</strong></div>
      <StatusBadge status={state} />
    </header>

    <div className={`${styles.matchup} ${density.matchup}`}>
      <Side team={tournament.teamOne} players={match.team1Players} />
      <b aria-label="versus">VS</b>
      <Side team={tournament.teamTwo} players={match.team2Players} />
    </div>

    <div className={`${styles.result} ${density.result}`}>
      <div><span>{state === "final" ? "Official result" : state === "live" ? "Current match" : "Match status"}</span><strong>{result}</strong></div>
      {(hasValue(match.team1Points) || hasValue(match.team2Points)) ? <small>{tournament.teamOne.name} {formatTeamPoints(match.team1Points)} · {tournament.teamTwo.name} {formatTeamPoints(match.team2Points)}</small> : null}
    </div>

    {ghost ? <p className={styles.notice}><strong>Ghost match.</strong> Selected player results are excluded from official records.</p> : null}

    {state === "final" ? <ScorecardTable scorecards={scorecards} compact historyDensity showSummary /> : null}

    {state === "final" && segments.length ? <details className={styles.story}>
      <summary className={density.storySummary}>Match story <span aria-hidden="true">⌄</span></summary>
      <div className={`${styles.storyBody} ${density.storyBody}`}>
        <div className={styles.segments}>{segments.map(([label, value]) => <div key={label}><span>{label}</span><strong>{teamValue(value, tournament)}</strong></div>)}</div>
        <MatchProgressionSummary scorecards={scorecards} />
      </div>
    </details> : null}
  </article>;
}
