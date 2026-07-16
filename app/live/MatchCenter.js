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
    label: "Round 1",
    format: "2 vs. 2",
    subtitle: "Front 9, Back 9, and Overall",
    matches: [
      {
        match: 1,
        teamOnePlayers: ["Clay", "Miles"],
        teamTwoPlayers: ["Taylor", "Jack"],
        frontWinner: "Team 1",
        backWinner: "Halved",
        overallWinner: "Team 1",
        teamOnePoints: 2.5,
        teamTwoPoints: 0.5,
      },
      {
        match: 2,
        teamOnePlayers: ["David", "Holman"],
        teamTwoPlayers: ["Tyler", "Matt"],
        frontWinner: "Team 2",
        backWinner: "Team 1",
        overallWinner: "Halved",
        teamOnePoints: 1.5,
        teamTwoPoints: 1.5,
      },
      {
        match: 3,
        teamOnePlayers: ["Klay", "Drew"],
        teamTwoPlayers: ["Chris", "Ryan"],
        frontWinner: "Halved",
        backWinner: "Team 2",
        overallWinner: "Team 2",
        teamOnePoints: 0.5,
        teamTwoPoints: 2.5,
      },
    ],
  },
  "Round 2": {
    label: "Round 2",
    format: "2-Man Scramble",
    subtitle: "Front 9, Back 9, and Overall",
    matches: [
      {
        match: 1,
        teamOnePlayers: ["Clay", "David"],
        teamTwoPlayers: ["Taylor", "Jack"],
        frontWinner: "Team 1",
        backWinner: "Team 2",
        overallWinner: "Team 2",
        teamOnePoints: 1,
        teamTwoPoints: 2,
      },
      {
        match: 2,
        teamOnePlayers: ["Miles", "Holman"],
        teamTwoPlayers: ["Tyler", "Matt"],
        frontWinner: "Halved",
        backWinner: "Team 1",
        overallWinner: "Team 1",
        teamOnePoints: 2.5,
        teamTwoPoints: 0.5,
      },
    ],
  },
  "Round 3": {
    label: "Round 3",
    format: "Singles",
    subtitle: "One point for the overall match",
    matches: [
      {
        match: 1,
        teamOnePlayers: ["Clay"],
        teamTwoPlayers: ["Taylor"],
        overallWinner: "Team 1",
        teamOnePoints: 1,
        teamTwoPoints: 0,
      },
      {
        match: 2,
        teamOnePlayers: ["Miles"],
        teamTwoPlayers: ["Jack"],
        overallWinner: "Halved",
        teamOnePoints: 0.5,
        teamTwoPoints: 0.5,
      },
      {
        match: 3,
        teamOnePlayers: ["David"],
        teamTwoPlayers: ["Tyler"],
        overallWinner: "Team 2",
        teamOnePoints: 0,
        teamTwoPoints: 1,
      },
    ],
  },
};

const leaderboard = [
  { rank: 1, player: "Clay", team: "The Pickles", r1: 2.5, r2: 2, r3: 1, total: 5.5 },
  { rank: 2, player: "Miles", team: "The Pickles", r1: 2.5, r2: 1.5, r3: 0.5, total: 4.5 },
  { rank: 3, player: "Taylor", team: "Team Lipp", r1: 0.5, r2: 2, r3: 0, total: 2.5 },
  { rank: 4, player: "Jack", team: "Team Lipp", r1: 0.5, r2: 1.5, r3: 0.5, total: 2.5 },
];

function winnerLabel(value) {
  if (value === "Team 1") return tournament.teamOne.name;
  if (value === "Team 2") return tournament.teamTwo.name;
  return "Halved";
}

function winnerClass(value) {
  if (value === "Team 1") return styles.teamOneBadge;
  if (value === "Team 2") return styles.teamTwoBadge;
  return styles.halvedBadge;
}

function MatchTrophy() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M20 8h24v8c0 10-4.8 18.2-12 21.2C24.8 34.2 20 26 20 16V8Z"
        fill="currentColor"
      />
      <path
        d="M20 14H10v5c0 9 5.2 15 14 16M44 14h10v5c0 9-5.2 15-14 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M32 37v10M22 55h20M26 47h12v8H26z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function matchWinner(match) {
  if (match.teamOnePoints > match.teamTwoPoints) {
    return tournament.teamOne.name;
  }

  if (match.teamTwoPoints > match.teamOnePoints) {
    return tournament.teamTwo.name;
  }

  return "Halved";
}

function PlayerList({ players }) {
  return (
    <div className={styles.playerList}>
      {players.map((player) => (
        <strong key={player}>{player}</strong>
      ))}
    </div>
  );
}

function Segment({ label, winner }) {
  return (
    <div className={styles.segment}>
      <span>{label}</span>
      <strong className={`${styles.winnerBadge} ${winnerClass(winner)}`}>
        {winnerLabel(winner)}
      </strong>
    </div>
  );
}

export default function MatchCenter() {
  const [activeRound, setActiveRound] = useState("Round 1");
  const active = rounds[activeRound];

  const roundTotals = useMemo(() => {
    return active.matches.reduce(
      (totals, match) => ({
        teamOne: totals.teamOne + match.teamOnePoints,
        teamTwo: totals.teamTwo + match.teamTwoPoints,
      }),
      { teamOne: 0, teamTwo: 0 }
    );
  }, [active]);

  return (
    <>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{tournament.status}</p>
          <h1>Match Center</h1>
          <p>
            {tournament.year} Sandbagger Invitational · {tournament.location}
          </p>
        </div>
      </section>

      <section className={styles.scoreboard}>
        <div className={styles.teamBlock}>
          <strong>{tournament.teamOne.name}</strong>
          <b>{tournament.teamOne.score}</b>
        </div>

        <div className={styles.scoreCenter}>
          <span>Current Round</span>
          <strong>{tournament.currentRound}</strong>
        </div>

        <div className={styles.teamBlock}>
          <strong>{tournament.teamTwo.name}</strong>
          <b>{tournament.teamTwo.score}</b>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.tabs} role="tablist" aria-label="Tournament rounds">
          {Object.keys(rounds).map((round) => (
            <button
              key={round}
              type="button"
              className={activeRound === round ? styles.activeTab : ""}
              onClick={() => setActiveRound(round)}
            >
              <span>{rounds[round].format}</span>
              <strong>{round}</strong>
            </button>
          ))}
        </div>

        <div className={styles.roundHeader}>
          <div>
            <span>{active.format}</span>
            <h2>{active.label} Results</h2>
            <p>{active.subtitle}</p>
          </div>

          <div className={styles.roundTotals}>
            <span>Round Points</span>
            <strong>
              {roundTotals.teamOne} – {roundTotals.teamTwo}
            </strong>
          </div>
        </div>

        <div className={styles.matchGrid}>
          {active.matches.map((match) => (
            <article className={styles.matchCard} key={`${activeRound}-${match.match}`}>
              <div className={styles.matchTop}>
                <span>{active.label} · Match {match.match}</span>
                <span>Complete</span>
              </div>

              <div className={styles.players}>
                <div>
                  <span>{tournament.teamOne.name}</span>
                  <PlayerList players={match.teamOnePlayers} />
                </div>

                <b>VS</b>

                <div>
                  <span>{tournament.teamTwo.name}</span>
                  <PlayerList players={match.teamTwoPlayers} />
                </div>
              </div>

              <div
                className={`${styles.segmentGrid} ${
                  activeRound === "Round 3" ? styles.singleSegmentGrid : ""
                }`}
              >
                {activeRound !== "Round 3" && (
                  <>
                    <Segment label="Front 9" winner={match.frontWinner} />
                    <Segment label="Back 9" winner={match.backWinner} />
                  </>
                )}

                <Segment label="Overall" winner={match.overallWinner} />
              </div>

              <div className={styles.matchResult}>
                <span className={styles.matchResultLabel}>Match Result</span>

                <div
                  className={`${styles.matchWinnerBanner} ${
                    matchWinner(match) === tournament.teamOne.name
                      ? styles.teamOneBadge
                      : matchWinner(match) === tournament.teamTwo.name
                        ? styles.teamTwoBadge
                        : styles.halvedBadge
                  }`}
                >
                  {matchWinner(match) !== "Halved" ? (
                    <MatchTrophy />
                  ) : null}
                  <strong>
                    {matchWinner(match) === "Halved"
                      ? "Match Halved"
                      : matchWinner(match)}
                  </strong>
                </div>

                <div className={styles.matchScoreTable}>
                  <div
                    className={`${styles.matchScoreRow} ${
                      matchWinner(match) === tournament.teamOne.name
                        ? styles.matchScoreWinner
                        : ""
                    }`}
                  >
                    <span>{tournament.teamOne.name}</span>
                    <strong>{match.teamOnePoints}</strong>
                  </div>

                  <div
                    className={`${styles.matchScoreRow} ${
                      matchWinner(match) === tournament.teamTwo.name
                        ? styles.matchScoreWinner
                        : ""
                    }`}
                  >
                    <span>{tournament.teamTwo.name}</span>
                    <strong>{match.teamTwoPoints}</strong>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.leaderboardHeader}>
          <div>
            <span>Player Standings</span>
            <h2>Leaderboard</h2>
          </div>
        </div>

        <div className={styles.leaderboard}>
          <div className={`${styles.leaderboardRow} ${styles.leaderboardHead}`}>
            <span>Rank</span>
            <span>Player</span>
            <span>Team</span>
            <span>R1</span>
            <span>R2</span>
            <span>R3</span>
            <span>Total</span>
          </div>

          {leaderboard.map((player) => (
            <div className={styles.leaderboardRow} key={player.player}>
              <strong>{player.rank}</strong>
              <strong>{player.player}</strong>
              <span>{player.team}</span>
              <span>{player.r1}</span>
              <span>{player.r2}</span>
              <span>{player.r3}</span>
              <strong>{player.total}</strong>
            </div>
          ))}
        </div>

        <p className={styles.testNote}>
          This design still uses test data. The next update will connect it to the
          Google Sheet Website Feed.
        </p>
      </section>
    </>
  );
}
