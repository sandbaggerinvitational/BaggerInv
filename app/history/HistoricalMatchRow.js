import Link from "next/link";
import StatusBadge from "../StatusBadge";
import ScorecardTable from "../ScorecardTable";
import MatchProgressionSummary from "../MatchProgressionSummary";
import { formatOfficialMatchResult } from "../../lib/match-result";
import { matchState } from "../../lib/live-match-ux";
import { formatTeamPoints } from "../../lib/formatters";
import { build2026CanonicalFinalResult } from "../../lib/history-2026-round-presentation";
import { scorecardPresentationData } from "../../lib/scorecard-presentation";
import styles from "./historical-match-row.module.css";
import resultStyles from "./historical-match-result.module.css";
import density from "./history-density.module.css";

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function PlayerName({ player, participantPresentation = false }) {
  return player?.slug ? <Link href={`${participantPresentation ? "/app/players" : "/players"}/${player.slug}`}>{player.name}</Link> : <>{player?.name}</>;
}

function Side({ team, players = [], participantPresentation = false }) {
  return <div className={styles.side}>
    <span>{team.name}</span>
    <div>{players.filter(Boolean).map((player) => <strong key={player.id || player.slug || player.name}><PlayerName player={player} participantPresentation={participantPresentation} /></strong>)}</div>
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

function resultText(match, tournament, state, scorecards, use2026Presentation) {
  if (state === "final") {
    const canonicalResult = use2026Presentation ? build2026CanonicalFinalResult(scorecards) : null;
    if (canonicalResult?.text) return canonicalResult.text;
    return replaceTeamLabels(match.finalResult || match.liveStatusText || match.notes || "Final", tournament);
  }
  if (state === "live") return replaceTeamLabels(match.liveStatusText || "Match in progress", tournament);
  return match.teeTime ? `Tee time ${match.teeTime}` : "Scheduled";
}

export default function HistoricalMatchRow({ match, round, tournament, scorecards = [], participantPresentation = false }) {
  const state = matchState(match);
  const use2026Presentation = Number(tournament?.year) === 2026;
  const result = resultText(match, tournament, state, scorecards, use2026Presentation);
  const segments = [
    ...(match.format === "SI" ? [] : [["Front 9", match.frontWinner], ["Back 9", match.backWinner]]),
    ["Overall", match.overallWinner || match.matchupWinner],
  ].filter(([, value]) => value);
  const ghost = String(match.status || "").trim().toUpperCase() === "GHOST MATCH";
  const scorecardTableData = scorecardPresentationData(scorecards);

  return <article className={styles.row} data-state={state} aria-label={`Match ${match.match}. ${result}.`}>
    <header className={`${styles.header} ${density.matchHeader}`}>
      <div><span>Match {match.match}</span><strong>{match.formatName || round?.format || "Match"}</strong></div>
      <StatusBadge status={state} />
    </header>

    <div className={`${styles.matchup} ${density.matchup}`}>
      <Side team={tournament.teamOne} players={match.team1Players} participantPresentation={participantPresentation} />
      <b aria-label="versus">VS</b>
      <Side team={tournament.teamTwo} players={match.team2Players} participantPresentation={participantPresentation} />
    </div>

    <div
      className={`${styles.result} ${resultStyles.resultLayout} ${density.result}`}
      data-official-result={state === "final" ? "true" : undefined}
    >
      <div><span>{state === "final" ? "Official result" : state === "live" ? "Current match" : "Match status"}</span><strong>{result}</strong></div>
      {(hasValue(match.team1Points) || hasValue(match.team2Points)) ? <small>{tournament.teamOne.name} {formatTeamPoints(match.team1Points)} · {tournament.teamTwo.name} {formatTeamPoints(match.team2Points)}</small> : null}
    </div>

    {ghost ? <p className={styles.notice}><strong>Ghost match.</strong> Selected player results are excluded from official records.</p> : null}

    {state === "final" ? <ScorecardTable scorecards={scorecardTableData} compact deferClosedContent historyDensity showSummary stackPairingIdentities={use2026Presentation} participantPresentation={participantPresentation} /> : null}

    {state === "final" && segments.length ? <details className={styles.story}>
      <summary className={density.storySummary}>Match story <span aria-hidden="true">⌄</span></summary>
      <div className={`${styles.storyBody} ${density.storyBody}`}>
        <div className={styles.segments}>{segments.map(([label, value]) => <div key={label}><span>{label}</span><strong>{teamValue(value, tournament)}</strong></div>)}</div>
        <MatchProgressionSummary scorecards={scorecards} />
      </div>
    </details> : null}
  </article>;
}
