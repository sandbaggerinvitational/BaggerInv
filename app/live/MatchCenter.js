"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addTournamentRanks } from "../../lib/rankings";
import styles from "./live.module.css";

function displayNumber(value) {
  return value === null || value === undefined || value === "" ? "—" : Number(value).toFixed(Number(value) % 1 ? 1 : 0);
}

function handicap(value) {
  return value === null || value === undefined ? "" : ` (${value})`;
}

function strokeText(value) {
  if (value === null || value === undefined || Number(value) === 0) return "";
  return `${value} stroke${Number(value) === 1 ? "" : "s"}`;
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

function PlayerList({ players, format, teamHcp, teamStroke }) {
  if (format === "SC") {
    return (
      <div className={styles.playerList}>
        {players.map((player) => <strong key={player.id}>{player.name}</strong>)}
        {teamHcp !== null && teamHcp !== undefined ? <small>Team Handicap ({teamHcp})</small> : null}
        {strokeText(teamStroke) ? <em>{strokeText(teamStroke)}</em> : null}
      </div>
    );
  }

  return (
    <div className={styles.playerList}>
      {players.map((player) => (
        <div className={styles.playerLine} key={player.id}>
          <strong>{player.name}{handicap(player.playingHcp)}</strong>
          {strokeText(player.stroke) ? <em>{strokeText(player.stroke)}</em> : null}
        </div>
      ))}
    </div>
  );
}

function Segment({ label, winner, tournament }) {
  return (
    <div className={styles.segment}>
      <span>{label}</span>
      <strong className={`${styles.winnerBadge} ${winnerClass(winner)}`}>
        {winnerLabel(winner, tournament)}
      </strong>
    </div>
  );
}

export default function MatchCenter({ initialData, loadError }) {
  const tournament = initialData?.tournament;
  const rounds = initialData?.rounds || {};
  const roundKeys = Object.keys(rounds).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  const [activeRound, setActiveRound] = useState(tournament?.currentRound && rounds[tournament.currentRound] ? tournament.currentRound : roundKeys[0]);
  const active = rounds[activeRound];

  const rankedLeaderboard = useMemo(() => addTournamentRanks(initialData?.leaderboard || [], "points"), [initialData]);
  const roundTotals = useMemo(() => (active?.matches || []).reduce((totals, match) => ({
    teamOne: totals.teamOne + (match.team1Points || 0),
    teamTwo: totals.teamTwo + (match.team2Points || 0),
  }), { teamOne: 0, teamTwo: 0 }), [active]);

  if (!tournament) {
    return <section className={styles.content}><div className={styles.errorBox}><h1>Live Match Center</h1><p>{loadError || "Live data is not available yet."}</p></div></section>;
  }

  return (
    <>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{tournament.status}</p>
          <h1>Match Center</h1>
          <p>{tournament.year} Sandbagger Invitational{tournament.location ? ` · ${tournament.location}` : ""}</p>
          {tournament.liveMessage ? <div className={styles.liveMessage}>{tournament.liveMessage}</div> : null}
        </div>
      </section>

      <section className={styles.scoreboard}>
        <div className={styles.teamBlock}><strong>{tournament.teamOne.name}</strong><b>{displayNumber(tournament.teamOne.score)}</b></div>
        <div className={styles.scoreCenter}><span>Current Round</span><strong>{tournament.currentRound}</strong></div>
        <div className={styles.teamBlock}><strong>{tournament.teamTwo.name}</strong><b>{displayNumber(tournament.teamTwo.score)}</b></div>
      </section>

      <section className={styles.content}>
        {roundKeys.length ? (
          <div className={styles.tabs} role="tablist" aria-label="Tournament rounds">
            {roundKeys.map((round) => (
              <button key={round} type="button" className={activeRound === round ? styles.activeTab : ""} onClick={() => setActiveRound(round)}>
                <span>{rounds[round].format}</span><strong>{round}</strong>
              </button>
            ))}
          </div>
        ) : null}

        {active ? <>
          <div className={styles.roundHeader}>
            <div><span>{active.format}</span><h2>{active.label}</h2><p>Live pairings and results</p></div>
            <div className={styles.roundTotals}><span>Round Points</span><strong>{displayNumber(roundTotals.teamOne)} – {displayNumber(roundTotals.teamTwo)}</strong></div>
          </div>

          <div className={styles.matchGrid}>
            {active.matches.map((match) => (
              <article className={styles.matchCard} key={match.id}>
                <div className={styles.matchTop}><span>{match.course || `${active.label} · Match ${match.match}`}</span><span>{match.teeTime || match.status}</span></div>
                <div className={styles.matchMeta}><span>Match {match.match}</span><strong>{match.status}</strong></div>
                <div className={styles.players}>
                  <div><span>{tournament.teamOne.name}</span><PlayerList players={match.team1Players} format={match.format} teamHcp={match.team1PlayingHcp} teamStroke={match.team1Stroke} /></div>
                  <b>VS</b>
                  <div><span>{tournament.teamTwo.name}</span><PlayerList players={match.team2Players} format={match.format} teamHcp={match.team2PlayingHcp} teamStroke={match.team2Stroke} /></div>
                </div>
                <div className={`${styles.segmentGrid} ${match.format === "SI" ? styles.singleSegmentGrid : ""}`}>
                  {match.format !== "SI" ? <><Segment label="Front 9" winner={match.frontWinner} tournament={tournament}/><Segment label="Back 9" winner={match.backWinner} tournament={tournament}/></> : null}
                  <Segment label="Overall" winner={match.overallWinner || match.matchupWinner} tournament={tournament}/>
                </div>
                {match.notes ? <p className={styles.matchNotes}>{match.notes}</p> : null}
                {(match.team1Points !== null || match.team2Points !== null) ? <div className={styles.matchScoreTable}>
                  <div className={styles.matchScoreRow}><span>{tournament.teamOne.name}</span><strong>{displayNumber(match.team1Points)}</strong></div>
                  <div className={styles.matchScoreRow}><span>{tournament.teamTwo.name}</span><strong>{displayNumber(match.team2Points)}</strong></div>
                </div> : null}
              </article>
            ))}
          </div>
        </> : null}

        <div className={styles.leaderboardHeader}><div><span>Player Standings</span><h2>Leaderboard</h2></div></div>
        <div className={styles.leaderboard}>
          <div className={`${styles.leaderboardRow} ${styles.leaderboardHead}`}><span>Rank</span><span>Player</span><span>Record</span><span>Points</span></div>
          {rankedLeaderboard.map((player) => (
            <div className={`${styles.leaderboardRow} ${player.tournamentRank === "1" ? styles.firstPlace : ""}`} key={player.id}>
              <strong>{player.tournamentRank}</strong>
              <span className={styles.playerCell}><i className={player.teamSide === 1 ? styles.teamOneDot : styles.teamTwoDot}/>{player.slug ? <Link href={`/players/${player.slug}`}>{player.player}</Link> : <strong>{player.player}</strong>}</span>
              <span>{player.wins}-{player.losses}-{player.halves}</span>
              <strong>{displayNumber(player.points)}</strong>
            </div>
          ))}
        </div>
        {loadError ? <p className={styles.testNote}>{loadError}</p> : null}
      </section>
    </>
  );
}
