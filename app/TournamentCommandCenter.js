import Link from "next/link";
import PersonalizedPlayerHome from "./PersonalizedPlayerHome";
import MobileIdentityImage from "./MobileIdentityImage";
import StatusBadge from "./StatusBadge";
import TournamentIdentityHeader from "./TournamentIdentityHeader";
import TournamentMoments from "./TournamentMoments";
import TournamentSchedule from "./TournamentSchedule";
import { teamLogo } from "../lib/asset-paths";
import {
  compactTournamentLeaders,
  tournamentDayLabel,
  tournamentStatusLabel,
} from "../lib/home-dashboard";
import { formatPlayerPoints, formatTeamPoints } from "../lib/formatters";
import { tournamentProgressModel } from "../lib/live-command-center";
import { tournamentMoments } from "../lib/tournament-storylines";
import styles from "./tournament-command-center.module.css";

function assetSource(value, resolver) {
  const source = String(value || "").trim();
  if (!source) return null;
  return /^(https?:)?\/\//i.test(source) || source.startsWith("/")
    ? source
    : resolver(source);
}

function remainingMatchesLabel(value) {
  const count = Number(value) || 0;
  return `${count} Match${count === 1 ? "" : "es"} Remaining`;
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
        <StatusBadge status={status} />
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
        <span>{remainingMatchesLabel(progress.remainingMatches)}</span>
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
  const timelineAvailable = Boolean(liveData?.timeline?.available);
  const scheduleEvents = (liveData?.timeline?.events || []).filter((event) => event.displayOnHome);
  const leaders = compactTournamentLeaders(liveData?.leaderboard || []);
  const moments = tournamentMoments(liveData);
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

      <PersonalizedPlayerHome tournamentPulse={pulse} tournamentMoments={<TournamentMoments moments={moments} />} netSkins={liveData?.netSkins} />
      {timelineAvailable ? <TournamentSchedule events={scheduleEvents} timeZone={liveTournament.timeZone} initialNow={liveData.timeline.previewDateActive ? liveData.timeline.effectiveNow : ""} /> : null}
      <TournamentLeaders leaders={leaders} />
    </div>
  );
}
