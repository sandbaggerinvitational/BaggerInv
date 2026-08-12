import Link from "next/link";
import PersonalizedPlayerHome from "./PersonalizedPlayerHome";
import MobileIdentityImage from "./MobileIdentityImage";
import TournamentIdentityHeader from "./TournamentIdentityHeader";
import TournamentMoments from "./TournamentMoments";
import DeferredHomeContent from "./DeferredHomeContent";
import TournamentSchedule from "./TournamentSchedule";
import { teamLogo } from "../lib/asset-paths";
import {
  tournamentDayLabel,
  tournamentStatusLabel,
} from "../lib/home-dashboard";
import { formatTeamPoints } from "../lib/formatters";
import { tournamentProgressModel } from "../lib/live-command-center";
import { tournamentMoments } from "../lib/tournament-storylines";
import styles from "./tournament-command-center.module.css";
import scoreStyles from "./score-typography.module.css";

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
          <strong className={scoreStyles.centeredScore}>{formatTeamPoints(tournament.teamOne?.score)}</strong>
        </div>
        <b className={scoreStyles.separator}>–</b>
        <div>
          <MobileIdentityImage
            sources={[assetSource(tournament.teamTwo?.logo, teamLogo)]}
            name={tournament.teamTwo?.name}
            alt=""
            className={styles.scoreLogo}
            fallbackClassName={styles.scoreLogoFallback}
          />
          <span>{tournament.teamTwo?.name}</span>
          <strong className={scoreStyles.centeredScore}>{formatTeamPoints(tournament.teamTwo?.score)}</strong>
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
      <Link className={styles.leaderboardsCta} href="/live?view=leaderboards">View Leaderboards <span aria-hidden="true">→</span></Link>
    </section>
  );
}

export default function TournamentCommandCenter({ tournament, liveData, initialParticipantData = null }) {
  const rounds = liveData?.rounds || [];
  const liveTournament = liveData?.tournament || tournament;
  const progress = tournamentProgressModel({ tournament: liveTournament, rounds });
  const timelineAvailable = Boolean(liveData?.timeline?.available);
  const scheduleEvents = (liveData?.timeline?.events || []).filter((event) => event.displayOnHome);
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

      {pulse}
      <DeferredHomeContent><TournamentMoments moments={moments} /></DeferredHomeContent>
      {timelineAvailable ? <TournamentSchedule events={scheduleEvents} timeZone={liveTournament.timeZone} initialNow={liveData.timeline.previewDateActive ? liveData.timeline.effectiveNow : ""} /> : null}
      <PersonalizedPlayerHome netSkins={liveData?.netSkins} initialData={initialParticipantData} managed={Boolean(initialParticipantData)} />
    </div>
  );
}
