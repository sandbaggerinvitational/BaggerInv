"use client";

import { useMemo, useState } from "react";
import styles from "./live.module.css";

function winnerLabel(value, tournament) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["team 1", "team1", "1"].includes(normalized)) {
    return tournament.teamOne.name;
  }

  if (["team 2", "team2", "2"].includes(normalized)) {
    return tournament.teamTwo.name;
  }

  return "Halved";
}

function winnerClass(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["team 1", "team1", "1"].includes(normalized)) return styles.teamOneBadge;
  if (["team 2", "team2", "2"].includes(normalized)) return styles.teamTwoBadge;
  return styles.halvedBadge;
}

function PlayerList({ players }) {
  return (
    <div className={styles.playerList}>
      {players.map((player, index) => (
        <strong key={`${player}-${index}`}>{player}</strong>
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
  const rounds = initialData?.rounds ?? {};
  const tournament = initialData?.tournament ?? {
    status: "Unavailable",
    year: "2026",
    location: "Kiawah Island",
    currentRound: "Round 1",
    teamOne: { name: "Team One", score: 0 },
    teamTwo: { name: "Team Two", score: 0 },
  };

  const availableRounds = Object.keys(rounds);
  const defaultRound = availableRounds.includes(tournament.currentRound)
    ? tournament.currentRound
    : availableRounds[0] ?? "Round 1";

  const [activeRound, setActiveRound] = useState(defaultRound);
  const active = rounds[activeRound];

  const roundTotals = useMemo(() => {
    if (!active?.matches) return { teamOne: 0, teamTwo: 0 };

    return active.matches.reduce(
      (totals, match) => ({
        teamOne: totals.teamOne + Number(match.teamOnePoints || 0),
        teamTwo: totals.teamTwo + Number(match.teamTwoPoints || 0),
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
          <span>Team One</span>
          <strong>{tournament.teamOne.name}</strong>
          <b>{tournament.teamOne.score}</b>
        </div>

        <div className={styles.scoreCenter}>
          <span>Current Round</span>
          <strong>{tournament.currentRound}</strong>
        </div>

        <div className={styles.teamBlock}>
          <span>Team Two</span>
          <strong>{tournament.teamTwo.name}</strong>
          <b>{tournament.teamTwo.score}</b>
        </div>
      </section>

      <section className={styles.content}>
        {loadError ? (
          <div className={styles.placeholderPanel}>{loadError}</div>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Tournament rounds">
              {availableRounds.map((round) => (
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

            {active && (
              <>
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
                    <article
                      className={styles.matchCard}
                      key={`${activeRound}-${match.match}`}
                    >
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
                            <Segment
                              label="Front 9"
                              winner={match.frontWinner}
                              tournament={tournament}
                            />
                            <Segment
                              label="Back 9"
                              winner={match.backWinner}
                              tournament={tournament}
                            />
                          </>
                        )}

                        <Segment
                          label="Overall"
                          winner={match.overallWinner}
                          tournament={tournament}
                        />
                      </div>

                      <div className={styles.pointsPanel}>
                        <span>Round Points</span>
                        <div>
                          <p>
                            <strong>{tournament.teamOne.name}</strong>
                            <b>{match.teamOnePoints}</b>
                          </p>
                          <p>
                            <strong>{tournament.teamTwo.name}</strong>
                            <b>{match.teamTwoPoints}</b>
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

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
                <span>Total</span>
              </div>

              {initialData.leaderboard.map((player) => (
                <div className={styles.leaderboardRow} key={`${player.rank}-${player.player}`}>
                  <strong>{player.rank}</strong>
                  <strong>{player.player}</strong>
                  <span>{player.team}</span>
                  <strong>{player.total}</strong>
                </div>
              ))}
            </div>

            <p className={styles.testNote}>
              Google Sheets refreshes on the website about every 30 seconds.
            </p>
          </>
        )}
      </section>
    </>
  );
}