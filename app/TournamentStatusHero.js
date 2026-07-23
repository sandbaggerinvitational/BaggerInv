"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AssetImage from "./AssetImage";
import { teamLogo } from "../lib/asset-paths";
import { countdownParts } from "../lib/tournament-countdown";
import { formatPoints } from "../lib/formatters";
import styles from "./tournament-status-hero.module.css";

const clean = (value) => String(value ?? "").trim();
const initials = (name) => clean(name).split(/\s+/).map((part) => part[0]).slice(0, 3).join("").toUpperCase() || "SBI";

function TeamMark({ team, champion = false }) {
  return <span className={styles.logoPlate} data-champion={champion ? "true" : "false"}>
    <AssetImage
      src={teamLogo(team?.logo)}
      alt={`${team?.name || "Team"} logo`}
      className={styles.logo}
      fallbackClassName={styles.logoFallback}
      fallback={initials(team?.name)}
      inferFallback={false}
    />
  </span>;
}

function Actions({ state, year, hasPairings, onNavigate }) {
  const actions = state === "FINAL"
    ? [
        { label: "View Final Results", href: `/history/${year}` },
        { label: "View Champions", href: "/champions" },
      ]
    : state === "LIVE"
      ? [{ label: "Open Match Center", href: "/live" }]
      : [
          { label: "View Tournament Guide", href: "/tournament-guide" },
          { label: "View Pairings", href: hasPairings ? "/live" : "/live" },
        ];
  return <div className={styles.actions}>
    {actions.map((action, index) => <Link
      href={action.href}
      className={index ? styles.secondaryAction : styles.primaryAction}
      onClick={(event) => event.stopPropagation()}
      key={action.href}
    >{action.label}</Link>)}
  </div>;
}

export default function TournamentStatusHero({
  tournament,
  startAt,
  initialNow,
  initialStatus,
  hasPairings,
}) {
  const router = useRouter();
  const [now, setNow] = useState(initialNow);
  const configured = clean(initialStatus).toUpperCase();
  const state = configured === "FINAL"
    ? "FINAL"
    : configured === "LIVE" || (startAt && now >= startAt)
      ? "LIVE"
      : "UPCOMING";
  const destination = state === "FINAL" ? `/history/${tournament.year}` : state === "LIVE" ? "/live" : "/tournament-guide";
  const remaining = useMemo(() => countdownParts(startAt, now), [startAt, now]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), state === "LIVE" ? 60_000 : 1_000);
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(() => {
    if (configured === "UPCOMING" && state === "LIVE") router.refresh();
  }, [configured, state, router]);

  const activate = (event) => {
    if (event.target.closest("a")) return;
    router.push(destination);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(destination);
    }
  };

  const champion = tournament.championSide === 2 ? tournament.teamTwo : tournament.teamOne;
  return <section
    className={styles.shell}
    data-state={state.toLowerCase()}
    onClick={activate}
    onKeyDown={onKeyDown}
    role="link"
    tabIndex={0}
    aria-label={`Open ${state === "LIVE" ? "Match Center" : state === "FINAL" ? "Final Results" : "Tournament Guide"}`}
  >
    <div className={styles.card} style={state === "FINAL" ? {
      "--status-team": champion?.primaryColor || "#0b3d30",
      "--status-team-accent": champion?.secondaryColor || "#d4b15f",
    } : undefined}>
      {state === "UPCOMING" ? <>
        <header>
          <span>Upcoming Tournament</span>
          <h2>{tournament.name}</h2>
          <p>{tournament.location}</p>
          <strong>{tournament.dates}</strong>
        </header>
        {startAt ? <div className={styles.countdown} data-final-day={remaining.days < 1 ? "true" : "false"}>
          <div><b>{remaining.days}</b><span>Days</span></div>
          {remaining.days <= 30 ? <div><b>{remaining.hours}</b><span>Hours</span></div> : null}
          {remaining.days <= 7 ? <div><b>{remaining.minutes}</b><span>Minutes</span></div> : null}
          {remaining.days < 1 ? <div><b>{remaining.seconds}</b><span>Seconds</span></div> : null}
          <small>until Tee Off</small>
        </div> : <div className={styles.comingSoon}><b>Tee-off countdown coming soon</b><span>Add the tournament Start Date to begin the clock.</span></div>}
      </> : state === "LIVE" ? <>
        <header className={styles.liveHeader}>
          <span><i /> Live</span>
          <h2>Round {tournament.currentRound}</h2>
        </header>
        <div className={styles.liveScore}>
          {[tournament.teamOne, tournament.teamTwo].map((team) => <div key={team.id || team.name}>
            <TeamMark team={team} />
            <span>{team.name}</span>
            <b>{formatPoints(team.score)}</b>
          </div>)}
        </div>
        <div className={styles.liveMeta}>
          <span>{tournament.liveMatches} {tournament.liveMatches === 1 ? "Match" : "Matches"} Live</span>
          <span>{formatPoints(tournament.remainingPoints)} Points Remaining</span>
        </div>
      </> : <>
        <header className={styles.championHeader}>
          <span>🏆</span>
          <p>{tournament.year} Sandbagger Champions</p>
          <TeamMark team={champion} champion />
          <h2>{champion?.name || "Champion"}</h2>
          <strong>Final Score</strong>
          <b>{formatPoints(tournament.teamOne.score)} – {formatPoints(tournament.teamTwo.score)}</b>
        </header>
      </>}
      <Actions state={state} year={tournament.year} hasPairings={hasPairings} />
    </div>
  </section>;
}
