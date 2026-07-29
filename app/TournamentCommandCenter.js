import Link from "next/link";
import styles from "./tournament-command-center.module.css";
import PersonalizedPlayerHome from "./PersonalizedPlayerHome";
import {
  buildTournamentTimeline,
  featuredMatchModel,
  tournamentProgressModel,
} from "../lib/live-command-center";

const leaderboards = [
  { label: "Birdies", value: "—", name: "Awaiting scores", detail: "Tournament total" },
  { label: "Gross", value: "—", name: "Awaiting scores", detail: "Lowest recorded round" },
  { label: "Net", value: "—", name: "Awaiting scores", detail: "Lowest recorded round" },
];

const recordAlerts = [
  { label: "New Birdie Record", detail: "Record alerts will appear as scores are verified." },
  { label: "Largest Comeback", detail: "Match progression will identify the tournament leader." },
  { label: "Most Holes Won", detail: "Live hole results will update this record automatically." },
];

function TeamScore({ team, side, progress, remainingPoints }) {
  return (
    <article className={styles.teamScore} data-side={side}>
      <div>
        <span>{team.name}</span>
        <small>Current points</small>
      </div>
      <strong>{team.score ?? "—"}</strong>
      <dl>
        <div><dt>Projected</dt><dd>—</dd></div>
        <div><dt>Available</dt><dd>{remainingPoints}</dd></div>
        <div><dt>Matches left</dt><dd>{progress.remainingMatches}</dd></div>
      </dl>
    </article>
  );
}

const timelineIcons = {
  FINAL: "✓",
  LIVE: "●",
  TEE_TIME: "↗",
};

export default function TournamentCommandCenter({ tournament, liveData }) {
  const rounds = liveData?.rounds || [];
  const liveTournament = liveData?.tournament || tournament;
  const currentRound = liveTournament.currentRound && liveTournament.currentRound !== "Not started"
    ? `Round ${liveTournament.currentRound}`
    : "Round in progress";
  const progress = tournamentProgressModel({ tournament: liveTournament, rounds });
  const featured = featuredMatchModel({ tournament: liveTournament, rounds });
  const timelineEvents = buildTournamentTimeline({ tournament: liveTournament, rounds });
  const remainingPoints = liveTournament.state?.remainingPoints ?? "—";

  return (
    <div className={styles.page}>
      <PersonalizedPlayerHome />
      <section className={styles.pulse} aria-labelledby="tournament-pulse-title">
        <div className={styles.pulseTopline}>
          <span className={styles.liveBadge}><i aria-hidden="true" /> Live</span>
          <span>{liveTournament.year} Sandbagger Invitational</span>
        </div>
        <div className={styles.pulseHeading}>
          <div>
            <p>Tournament Pulse</p>
            <h1 id="tournament-pulse-title">{currentRound}</h1>
            <span>{liveTournament.location}</span>
          </div>
          <div className={styles.pulseLeader}>
            <small>Tournament progress</small>
            <strong>{progress.completedMatches} of {progress.totalMatches}</strong>
            <span>
              {progress.remainingMatches} matches remaining
              {progress.liveMatches ? ` · ${progress.liveMatches} live` : ""}
            </span>
          </div>
        </div>
        <div className={styles.pulseMetrics}>
          <div><span>Current team points</span><strong>{liveTournament.teamOne.score ?? 0}–{liveTournament.teamTwo.score ?? 0}</strong></div>
          <div><span>Projected points</span><strong>—</strong></div>
          <div><span>Matches complete</span><strong>{progress.completedMatches}</strong></div>
          <div><span>Remaining matches</span><strong>{progress.remainingMatches}</strong></div>
        </div>
      </section>

      <section className={styles.featured} aria-labelledby="featured-match-title">
        <div className={styles.sectionLabel}>
          <div>
            <p>Featured Match</p>
            <h2 id="featured-match-title">{featured?.label || "Match spotlight"}</h2>
          </div>
          <span>{featured ? [featured.format, featured.course].filter(Boolean).join(" · ") : "No match available"}</span>
        </div>
        {featured ? (
          <div className={styles.featuredMatch}>
            <div className={styles.featuredTeam}>
              <span>{featured.teamOneName}</span>
              {featured.teamOnePlayers ? <b>{featured.teamOnePlayers}</b> : null}
              <strong>—</strong>
              <small>Win probability</small>
            </div>
            <div className={styles.featuredStatus}>
              <span>{featured.holeLabel}</span>
              <b>{featured.status}</b>
              <small>{featured.momentum}</small>
            </div>
            <div className={`${styles.featuredTeam} ${styles.featuredTeamRight}`}>
              <span>{featured.teamTwoName}</span>
              {featured.teamTwoPlayers ? <b>{featured.teamTwoPlayers}</b> : null}
              <strong>—</strong>
              <small>Win probability</small>
            </div>
          </div>
        ) : (
          <div className={styles.featuredEmpty}>No configured match is available for the current round.</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
          <Link href="/score" style={{ marginTop: 0, padding: "12px 18px", borderRadius: 999, background: "#0b4435", color: "#fff", textDecoration: "none" }}>My Match <span aria-hidden="true">→</span></Link>
          <Link href="/live">Open Match Center <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className={styles.scoreboard} aria-labelledby="team-scoreboard-title">
        <div className={styles.sectionLabel}>
          <div>
            <p>Live Team Scoreboard</p>
            <h2 id="team-scoreboard-title">The race for the Cup</h2>
          </div>
          <span>{progress.liveMatches ? `${progress.liveMatches} matches live` : `${progress.remainingMatches} matches remaining`}</span>
        </div>
        <div className={styles.teamGrid}>
          <TeamScore
            team={liveTournament.teamOne}
            side="one"
            progress={progress}
            remainingPoints={remainingPoints}
          />
          <TeamScore
            team={liveTournament.teamTwo}
            side="two"
            progress={progress}
            remainingPoints={remainingPoints}
          />
        </div>
      </section>

      <div className={styles.split}>
        <section className={styles.timeline} aria-labelledby="timeline-title">
          <div className={styles.sectionLabel}>
            <div>
              <p>Tournament Timeline</p>
              <h2 id="timeline-title">What’s happening</h2>
            </div>
          </div>
          {timelineEvents.length ? (
            <ol>
              {timelineEvents.map((event) => (
                <li key={event.id}>
                  <time>{event.time}</time>
                  <span className={styles.timelineIcon} data-type={event.type} aria-hidden="true">
                    {timelineIcons[event.type] || "•"}
                  </span>
                  <div><strong>{event.title}</strong><p>{event.detail}</p></div>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.timelineEmpty}>Tournament events will appear when tee times or scoring activity are recorded.</div>
          )}
        </section>

        <section className={styles.leaderboards} aria-labelledby="leaderboards-title">
          <div className={styles.sectionLabel}>
            <div>
              <p>Live Player Leaderboards</p>
              <h2 id="leaderboards-title">Tournament leaders</h2>
            </div>
          </div>
          <div className={styles.leaderboardGrid}>
            {leaderboards.map((board) => (
              <article key={board.label}>
                <span>{board.label}</span>
                <strong>{board.value}</strong>
                <b>{board.name}</b>
                <small>{board.detail}</small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className={styles.records} aria-labelledby="live-records-title">
        <div className={styles.sectionLabel}>
          <div>
            <p>Live Records</p>
            <h2 id="live-records-title">History in motion</h2>
          </div>
          <span>Verified scorecards only</span>
        </div>
        <div className={styles.recordGrid}>
          {recordAlerts.map((record) => (
            <article key={record.label}>
              <span aria-hidden="true">!</span>
              <div><strong>{record.label}</strong><p>{record.detail}</p></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
