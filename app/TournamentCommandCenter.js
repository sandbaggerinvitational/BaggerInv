import Link from "next/link";
import PersonalizedPlayerHome from "./PersonalizedPlayerHome";
import MobileIdentityImage from "./MobileIdentityImage";
import TournamentIdentityHeader from "./TournamentIdentityHeader";
import { teamLogo } from "../lib/asset-paths";
import {
  compactTournamentLeaders,
  todaysSchedule,
  tournamentDayLabel,
  tournamentStatusLabel,
} from "../lib/home-dashboard";
import { formatPlayerPoints, formatTeamPoints } from "../lib/formatters";
import { tournamentProgressModel } from "../lib/live-command-center";
import styles from "./tournament-command-center.module.css";

function assetSource(value, resolver) {
  const source = String(value || "").trim();
  if (!source) return null;
  return /^(https?:)?\/\//i.test(source) || source.startsWith("/")
    ? source
    : resolver(source);
}

function ScheduleIcon({ type }) {
  const value = String(type || "").toLowerCase();
  const icon = value.includes("meal") || value.includes("breakfast") ||
    value.includes("lunch") || value.includes("dinner") ? "◆"
    : value.includes("transport") ? "→"
    : value.includes("golf") || value.includes("round") ? "●" : "•";
  return <span aria-hidden="true">{icon}</span>;
}

function TournamentSchedule({ items }) {
  return (
    <section className={styles.schedule} aria-labelledby="today-schedule-title">
      <header className={styles.sectionHeader}>
        <div>
          <p>Today</p>
          <h2 id="today-schedule-title">Today’s Schedule</h2>
        </div>
        <Link href="/tournament-guide#itinerary">View Tournament Guide</Link>
      </header>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.id} data-state={item.state}>
              <time>{item.startTime || "TBD"}</time>
              <ScheduleIcon type={item.type} />
              <div>
                <strong>{item.title}</strong>
                {item.location || item.subtitle ? (
                  <small>{[item.location, item.subtitle].filter(Boolean).join(" · ")}</small>
                ) : null}
              </div>
              {item.state === "next" ? <b>Next</b> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <strong>No additional events scheduled today.</strong>
          <span>View the Tournament Guide for the full itinerary.</span>
        </div>
      )}
    </section>
  );
}

function TournamentPulse({ tournament, progress, roundCount }) {
  const total = Math.max(progress.totalMatches, 1);
  const percentage = Math.min(100, Math.round((progress.completedMatches / total) * 100));
  const status = tournamentStatusLabel(tournament.status);
  return (
    <section className={styles.pulse} aria-labelledby="tournament-pulse-title">
      <header className={styles.pulseHeader}>
        <div>
          <p>Tournament Pulse</p>
          <h2 id="tournament-pulse-title">
            {tournamentDayLabel({
              startDate: tournament.startDate,
              currentRound: tournament.currentRound,
              roundCount,
            })}
          </h2>
        </div>
        <span className={styles.liveBadge}>
          {status === "Live" ? <i aria-hidden="true" /> : null}
          {status}
        </span>
      </header>
      <div className={styles.scoreboard} aria-label="Current tournament score">
        <div>
          <MobileIdentityImage
            sources={[assetSource(tournament.teamOne?.logo, teamLogo)]}
            name={tournament.teamOne?.name}
            alt=""
            className={styles.scoreLogo}
            fallbackClassName={styles.scoreLogoFallback}
          />
          <span>{tournament.teamOne?.name}</span>
          <strong>{formatTeamPoints(tournament.teamOne?.score)}</strong>
        </div>
        <b>–</b>
        <div>
          <MobileIdentityImage
            sources={[assetSource(tournament.teamTwo?.logo, teamLogo)]}
            name={tournament.teamTwo?.name}
            alt=""
            className={styles.scoreLogo}
            fallbackClassName={styles.scoreLogoFallback}
          />
          <span>{tournament.teamTwo?.name}</span>
          <strong>{formatTeamPoints(tournament.teamTwo?.score)}</strong>
        </div>
      </div>
      <div className={styles.progressLabel}>
        <span>{progress.completedMatches} complete</span>
        <span>{progress.liveMatches} live</span>
        <span>{progress.remainingMatches} remaining</span>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="Tournament match progress"
        aria-valuemin="0"
        aria-valuemax={progress.totalMatches}
        aria-valuenow={progress.completedMatches}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </section>
  );
}

function TournamentLeaders({ leaders }) {
  return (
    <section className={styles.leaders} aria-labelledby="tournament-leaders-title">
      <header className={styles.sectionHeader}>
        <div>
          <p>Live Standings</p>
          <h2 id="tournament-leaders-title">Tournament Leaders</h2>
        </div>
        <Link href="/live?view=leaderboards">View all</Link>
      </header>
      {leaders.length ? (
        <ol>
          {leaders.map((leader) => (
            <li key={leader.id}>
              <span className={styles.rank}>{leader.rank}</span>
              <MobileIdentityImage
                sources={[
                  assetSource(leader.photo, (value) => `/images/players/${value.replace(/\.(png|jpe?g|webp)$/i, "")}.webp`),
                  assetSource(leader.teamLogo, teamLogo),
                ]}
                name={leader.player}
                alt=""
                className={styles.leaderImage}
                fallbackClassName={styles.leaderFallback}
              />
              <div><strong>{leader.player}</strong><small>{leader.team}</small></div>
              <div className={styles.leaderMetric}>
                <strong>{formatPlayerPoints(leader.points)}</strong>
                <small>{leader.wins}-{leader.losses}-{leader.halves}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <strong>Leaderboard will appear after the first completed match.</strong>
          <span>Standings update as official results are finalized.</span>
        </div>
      )}
    </section>
  );
}

export default function TournamentCommandCenter({ tournament, liveData }) {
  const rounds = liveData?.rounds || [];
  const liveTournament = liveData?.tournament || tournament;
  const progress = tournamentProgressModel({ tournament: liveTournament, rounds });
  const schedule = todaysSchedule(liveData?.schedule || [], {
    timeZone: liveTournament.timeZone,
  });
  const leaders = compactTournamentLeaders(liveData?.leaderboard || []);
  const status = tournamentStatusLabel(liveTournament.status);
  const pulse = (
    <TournamentPulse
      tournament={liveTournament}
      progress={progress}
      roundCount={rounds.length}
    />
  );

  return (
    <div className={styles.page}>
      <TournamentIdentityHeader
        year={liveTournament.year}
        name={liveTournament.name || "Sandbagger Invitational"}
        location={liveTournament.location || "Tournament week"}
        logo={liveTournament.logo}
        status={status}
      />

      <PersonalizedPlayerHome tournamentPulse={pulse} />
      <TournamentSchedule items={schedule} />
      <TournamentLeaders leaders={leaders} />
    </div>
  );
}
