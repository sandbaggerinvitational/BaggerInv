import Link from "next/link";
import styles from "./tournament-command-center.module.css";

const timelineEvents = [
  {
    time: "Now",
    icon: "●",
    title: "Tournament Mode is active",
    detail: "Live tournament events will appear here as scoring updates arrive.",
  },
  {
    time: "12 min",
    icon: "↗",
    title: "Featured match update",
    detail: "Momentum and hole status will be connected in a future sprint.",
  },
  {
    time: "28 min",
    icon: "✓",
    title: "Score confirmed",
    detail: "Finalized results will automatically join the tournament timeline.",
  },
];

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

function TeamScore({ team, side }) {
  return (
    <article className={styles.teamScore} data-side={side}>
      <div>
        <span>{team.name}</span>
        <small>Current points</small>
      </div>
      <strong>{team.score ?? "—"}</strong>
      <dl>
        <div><dt>Projected</dt><dd>—</dd></div>
        <div><dt>Available</dt><dd>—</dd></div>
        <div><dt>Matches left</dt><dd>—</dd></div>
      </dl>
    </article>
  );
}

export default function TournamentCommandCenter({ tournament }) {
  const currentRound = tournament.currentRound && tournament.currentRound !== "Not started"
    ? `Round ${tournament.currentRound}`
    : "Round in progress";

  return (
    <div className={styles.page}>
      <section className={styles.pulse} aria-labelledby="tournament-pulse-title">
        <div className={styles.pulseTopline}>
          <span className={styles.liveBadge}><i aria-hidden="true" /> Live</span>
          <span>{tournament.year} Sandbagger Invitational</span>
        </div>
        <div className={styles.pulseHeading}>
          <div>
            <p>Tournament Pulse</p>
            <h1 id="tournament-pulse-title">{currentRound}</h1>
            <span>{tournament.location}</span>
          </div>
          <div className={styles.pulseLeader}>
            <small>Tournament leader</small>
            <strong>Even</strong>
            <span>Live scoring will determine the leader</span>
          </div>
        </div>
        <div className={styles.pulseMetrics}>
          <div><span>Current team points</span><strong>{tournament.teamOne.score ?? 0}–{tournament.teamTwo.score ?? 0}</strong></div>
          <div><span>Projected points</span><strong>—</strong></div>
          <div><span>Tournament status</span><strong>Live</strong></div>
          <div><span>Remaining matches</span><strong>—</strong></div>
        </div>
      </section>

      <section className={styles.featured} aria-labelledby="featured-match-title">
        <div className={styles.sectionLabel}>
          <div>
            <p>Featured Match</p>
            <h2 id="featured-match-title">Match spotlight</h2>
          </div>
          <span>Awaiting live selection</span>
        </div>
        <div className={styles.featuredMatch}>
          <div className={styles.featuredTeam}>
            <span>{tournament.teamOne.name}</span>
            <strong>—</strong>
            <small>Win probability</small>
          </div>
          <div className={styles.featuredStatus}>
            <span>Hole —</span>
            <b>Match status</b>
            <small>Momentum will appear here</small>
          </div>
          <div className={`${styles.featuredTeam} ${styles.featuredTeamRight}`}>
            <span>{tournament.teamTwo.name}</span>
            <strong>—</strong>
            <small>Win probability</small>
          </div>
        </div>
        <Link href="/live">Open Match Center <span aria-hidden="true">→</span></Link>
      </section>

      <section className={styles.scoreboard} aria-labelledby="team-scoreboard-title">
        <div className={styles.sectionLabel}>
          <div>
            <p>Live Team Scoreboard</p>
            <h2 id="team-scoreboard-title">The race for the Cup</h2>
          </div>
          <span>Projected scoring ready</span>
        </div>
        <div className={styles.teamGrid}>
          <TeamScore team={tournament.teamOne} side="one" />
          <TeamScore team={tournament.teamTwo} side="two" />
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
          <ol>
            {timelineEvents.map((event) => (
              <li key={`${event.time}-${event.title}`}>
                <time>{event.time}</time>
                <span className={styles.timelineIcon} aria-hidden="true">{event.icon}</span>
                <div><strong>{event.title}</strong><p>{event.detail}</p></div>
              </li>
            ))}
          </ol>
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
