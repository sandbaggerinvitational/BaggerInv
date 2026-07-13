
"use client";

import { useMemo, useState } from "react";
import styles from "./live.module.css";

const tournament = {
  year: 2026,
  location: "Kiawah Island",
  status: "Test Mode",
  currentRound: "Round 1",
  teamOne: { name: "The Pickles", score: 4.5 },
  teamTwo: { name: "Team Lipp", score: 3.5 },
};

const rounds = {
  "Round 1": {
    format: "2 vs. 2",
    subtitle: "Front 9, Back 9, and Overall",
    matches: [
      { match: 1, teamOnePlayers: "Clay / Miles", teamTwoPlayers: "Taylor / Jack", frontWinner: "Team 1", frontResult: "2 Up", backWinner: "Halved", backResult: "Halved", overallWinner: "Team 1", overallResult: "3 & 2", teamOnePoints: 2.5, teamTwoPoints: 0.5 },
      { match: 2, teamOnePlayers: "David / Holman", teamTwoPlayers: "Tyler / Matt", frontWinner: "Team 2", frontResult: "1 Up", backWinner: "Team 1", backResult: "2 Up", overallWinner: "Halved", overallResult: "Halved", teamOnePoints: 1.5, teamTwoPoints: 1.5 },
      { match: 3, teamOnePlayers: "Klay / Drew", teamTwoPlayers: "Chris / Ryan", frontWinner: "Halved", frontResult: "Halved", backWinner: "Team 2", backResult: "3 Up", overallWinner: "Team 2", overallResult: "2 & 1", teamOnePoints: 0.5, teamTwoPoints: 2.5 },
    ],
  },
  "Round 2": {
    format: "Scramble",
    subtitle: "Front 9, Back 9, and Overall",
    matches: [
      { match: 1, teamOnePlayers: "Clay / David / Miles / Holman", teamTwoPlayers: "Taylor / Jack / Tyler / Matt", frontWinner: "Team 1", frontResult: "1 Up", backWinner: "Team 2", backResult: "2 Up", overallWinner: "Team 2", overallResult: "1 Up", teamOnePoints: 1, teamTwoPoints: 2 },
      { match: 2, teamOnePlayers: "Klay / Drew / Ben / Luke", teamTwoPlayers: "Chris / Ryan / Sam / Cole", frontWinner: "Halved", frontResult: "Halved", backWinner: "Team 1", backResult: "1 Up", overallWinner: "Team 1", overallResult: "2 Up", teamOnePoints: 2.5, teamTwoPoints: 0.5 },
    ],
  },
  "Round 3": {
    format: "Singles",
    subtitle: "One point for the overall match",
    matches: [
      { match: 1, teamOnePlayers: "Clay", teamTwoPlayers: "Taylor", overallWinner: "Team 1", overallResult: "3 & 2", teamOnePoints: 1, teamTwoPoints: 0 },
      { match: 2, teamOnePlayers: "Miles", teamTwoPlayers: "Jack", overallWinner: "Halved", overallResult: "Halved", teamOnePoints: 0.5, teamTwoPoints: 0.5 },
      { match: 3, teamOnePlayers: "David", teamTwoPlayers: "Tyler", overallWinner: "Team 2", overallResult: "1 Up", teamOnePoints: 0, teamTwoPoints: 1 },
    ],
  },
};

const leaderboard = [
  { rank: 1, player: "Clay", team: "The Pickles", r1: 2.5, r2: 2, r3: 1, total: 5.5 },
  { rank: 2, player: "Miles", team: "The Pickles", r1: 2.5, r2: 1.5, r3: 0.5, total: 4.5 },
  { rank: 3, player: "Taylor", team: "Team Lipp", r1: 0.5, r2: 2, r3: 0, total: 2.5 },
  { rank: 4, player: "Jack", team: "Team Lipp", r1: 0.5, r2: 1.5, r3: 0.5, total: 2.5 },
];

function resolveWinner(value) {
  if (value === "Team 1") return tournament.teamOne.name;
  if (value === "Team 2") return tournament.teamTwo.name;
  return "Halved";
}

function Segment({ label, winner, result }) {
  return (
    <div className={styles.segment}>
      <span>{label}</span>
      <strong>{resolveWinner(winner)}</strong>
      <em>{winner === "Halved" ? "Halved" : result}</em>
    </div>
  );
}

export default function MatchCenter() {
  const [activeRound, setActiveRound] = useState("Round 1");
  const active = rounds[activeRound];
  const totals = useMemo(() => active.matches.reduce((sum, match) => ({
    teamOne: sum.teamOne + match.teamOnePoints,
    teamTwo: sum.teamTwo + match.teamTwoPoints,
  }), { teamOne: 0, teamTwo: 0 }), [active]);

  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>{tournament.status}</p>
        <h1>Live Match Center</h1>
        <p>{tournament.year} Sandbagger Invitational · {tournament.location}</p>
      </section>

      <section className={styles.scoreboard}>
        <div className={styles.teamBlock}><span>Team One</span><strong>{tournament.teamOne.name}</strong><b>{tournament.teamOne.score}</b></div>
        <div className={styles.scoreCenter}><span>Overall Score</span><strong>{tournament.currentRound}</strong></div>
        <div className={styles.teamBlock}><span>Team Two</span><strong>{tournament.teamTwo.name}</strong><b>{tournament.teamTwo.score}</b></div>
      </section>

      <section className={styles.content}>
        <div className={styles.tabs}>
          {Object.keys(rounds).map((round) => (
            <button key={round} className={activeRound === round ? styles.activeTab : ""} onClick={() => setActiveRound(round)}>
              <span>{rounds[round].format}</span><strong>{round}</strong>
            </button>
          ))}
        </div>

        <div className={styles.roundHeader}>
          <div><span>{active.format}</span><h2>{activeRound} Results</h2><p>{active.subtitle}</p></div>
          <div className={styles.roundTotals}><span>Round Points</span><strong>{totals.teamOne} – {totals.teamTwo}</strong></div>
        </div>

        <div className={styles.matchGrid}>
          {active.matches.map((match) => (
            <article className={styles.matchCard} key={`${activeRound}-${match.match}`}>
              <div className={styles.matchTop}><span>Match {match.match}</span><span>Complete</span></div>
              <div className={styles.players}>
                <div><span>{tournament.teamOne.name}</span><strong>{match.teamOnePlayers}</strong></div><b>vs.</b>
                <div><span>{tournament.teamTwo.name}</span><strong>{match.teamTwoPlayers}</strong></div>
              </div>
              <div className={styles.segmentGrid}>
                {activeRound !== "Round 3" && <><Segment label="Front 9" winner={match.frontWinner} result={match.frontResult} /><Segment label="Back 9" winner={match.backWinner} result={match.backResult} /></>}
                <Segment label="Overall" winner={match.overallWinner} result={match.overallResult} />
              </div>
              <div className={styles.pointsRow}><span>Points earned</span><strong>{match.teamOnePoints} – {match.teamTwoPoints}</strong></div>
            </article>
          ))}
        </div>

        <div className={styles.leaderboardHeader}><span>Player Standings</span><h2>Leaderboard</h2></div>
        <div className={styles.leaderboard}>
          <div className={`${styles.leaderboardRow} ${styles.leaderboardHead}`}><span>Rank</span><span>Player</span><span>Team</span><span>R1</span><span>R2</span><span>R3</span><span>Total</span></div>
          {leaderboard.map((player) => <div className={styles.leaderboardRow} key={player.player}><strong>{player.rank}</strong><strong>{player.player}</strong><span>{player.team}</span><span>{player.r1}</span><span>{player.r2}</span><span>{player.r3}</span><strong>{player.total}</strong></div>)}
        </div>

        <p className={styles.testNote}>This version uses test data to approve the design. The next update will replace these values with your Google Sheet Website Feed.</p>
      </section>
    </>
  );
}
