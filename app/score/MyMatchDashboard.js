"use client";

import Link from "next/link";
import AssetImage from "../AssetImage";
import { courseLogo, teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { appMatchStatus } from "../../lib/mobile-tournament-app";
import { normalizedMatchStatus, selectRelevantPlayerMatches } from "../../lib/player-home";
import styles from "./my-match-dashboard.module.css";

const initials = (value) => String(value || "SBI")
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .slice(0, 3)
  .join("")
  .toUpperCase();

function formatTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return raw;
  let hour = Number(match[1]);
  const suffix = match[3]?.toUpperCase();
  if (suffix) return `${hour}:${match[2]} ${suffix}`;
  if (hour > 12) return `${hour - 12}:${match[2]} PM`;
  if (hour === 12) return `12:${match[2]} PM`;
  if (hour === 0) return `12:${match[2]} AM`;
  return `${hour}:${match[2]} AM`;
}

function formatTee(value) {
  const tee = String(value || "").trim();
  if (!tee) return "";
  return /\btees?$/i.test(tee) ? tee : `${tee} Tees`;
}

function Logo({ filename, name, type, tournamentLogoFilename }) {
  const source = type === "course"
    ? courseLogo(filename)
    : type === "tournament" ? tournamentLogo(filename) : teamLogo(filename);
  return <span className={styles.logoPlate} data-type={type}>
    <AssetImage
      src={source}
      alt={`${name} logo`}
      fallback={initials(name)}
      fallbackSrc={type === "tournament" ? undefined : tournamentLogo(tournamentLogoFilename)}
      className={styles.logoImage}
      fallbackClassName={styles.logoFallback}
      inferFallback={false}
    />
  </span>;
}

function MatchHeading({ match }) {
  const roundMatch = match.match
    ? `Round ${match.round} • Match ${match.match}`
    : `Round ${match.round}`;
  return <div className={styles.matchHeading}>
    <span>{roundMatch}</span>
    <strong>{match.format || "Format TBA"}</strong>
  </div>;
}

function TeamBlock({ team, players, tournamentLogoFilename }) {
  return <div className={styles.teamBlock}>
    <Logo filename={team?.logo} name={team?.name || "Team"} type="team" tournamentLogoFilename={tournamentLogoFilename} />
    <strong>{team?.name || "Team TBA"}</strong>
    <div>{players?.length
      ? players.map((name) => <span key={name}>{name}</span>)
      : <span className={styles.muted}>Players TBA</span>}
    </div>
  </div>;
}

function participantResult(match) {
  if (!match.result) return "";
  if (match.result.winner === "Halved") return "HALVED";
  const won = match.result.winner === match.team?.name;
  const official = String(match.result.statusText || "").trim();
  const margin = official.match(/\bwins?\s+(.+)$/i)?.[1];
  if (margin) return `${won ? "WON" : "LOST"} ${margin.toUpperCase()}`;
  const difference = Math.abs(Number(match.result.teamOneHoles || 0) - Number(match.result.teamTwoHoles || 0));
  return `${won ? "WON" : "LOST"}${difference ? ` ${difference} ${won ? "UP" : "DOWN"}` : ""}`;
}

function statusSupport(match, status) {
  if (status === "Live") return match.currentHole ? `Through Hole ${match.currentHole}` : "Scoring is open";
  if (status === "Scoring Opens Soon") return match.teeTime
    ? `Scoring opens before the ${formatTime(match.teeTime)} tee time`
    : "Round scoring opens soon";
  if (status === "Locked") return "Locked by Tournament Director";
  if (status === "Upcoming") return match.teeTime
    ? `Scoring opens before ${formatTime(match.teeTime)}`
    : "Round has not opened yet";
  return "";
}

function MatchCard({ match, emphasized, busy, onOpen, tournamentLogoFilename }) {
  const status = appMatchStatus(match);
  const result = participantResult(match);
  const courseMeta = [formatTee(match.tee), formatTime(match.teeTime)].filter(Boolean).join(" • ");
  const support = statusSupport(match, status);
  const detailsHref = `/live?view=matchups&round=${match.round}#match-${match.matchId}`;
  const action = status === "Live"
    ? match.holesRecorded ? "Continue Scoring" : "Start Scoring"
    : status === "Final" ? "View Final" : "View Match";
  const accessible = [
    `Round ${match.round}`,
    match.match ? `Match ${match.match}` : "",
    match.format,
    `against ${match.opponentTeam?.name || "opponent"}`,
    match.course,
    formatTime(match.teeTime),
    status,
    result,
  ].filter(Boolean).join(", ");

  const contents = <>
    <div className={styles.cardTop}>
      <MatchHeading match={match} />
      <div className={styles.cardState}>
        {emphasized ? <small>{status === "Live" ? "Current Match" : "Next Match"}</small> : null}
        <span data-status={status.toUpperCase().replaceAll(" ", "-")}>{status}</span>
        {result ? <strong aria-label={`Final result: ${result}`}>{result}</strong> : null}
      </div>
    </div>
    <div className={styles.courseLine}>
      <Logo filename={match.courseLogo} name={match.course || "Course"} type="course" tournamentLogoFilename={tournamentLogoFilename} />
      <div><strong>{match.course || "Course TBA"}</strong>{courseMeta ? <span>{courseMeta}</span> : null}</div>
    </div>
    <div className={styles.matchup}>
      <TeamBlock team={match.team} players={match.participantNames} tournamentLogoFilename={tournamentLogoFilename} />
      <b aria-label="versus">VS</b>
      <TeamBlock team={match.opponentTeam} players={match.opponentNames} tournamentLogoFilename={tournamentLogoFilename} />
    </div>
    <div className={styles.actionRow}>
      <span className={styles.supportText}>
        {status === "Locked" ? <i aria-hidden="true">🔒</i> : null}
        {support}
      </span>
      <strong className={styles.cardAction}>{action}<i aria-hidden="true">→</i></strong>
    </div>
  </>;

  if (status === "Live") {
    return <button
      type="button"
      className={styles.matchCard}
      data-emphasized={emphasized ? "true" : undefined}
      disabled={busy}
      aria-label={accessible}
      onClick={() => onOpen(match)}
    >{contents}</button>;
  }
  return <Link
    href={detailsHref}
    className={styles.matchCard}
    data-emphasized={emphasized ? "true" : undefined}
    aria-label={accessible}
  >{contents}</Link>;
}

export default function MyMatchDashboard({ player, tournament, matches, busy, onOpen, message }) {
  const ordered = [...matches].sort((left, right) =>
    Number(left.round || 0) - Number(right.round || 0) ||
    Number(left.match || 0) - Number(right.match || 0)
  );
  const selection = selectRelevantPlayerMatches(matches, tournament?.currentRound);
  const allFinal = matches.length && matches.every((match) => normalizedMatchStatus(match) === "FINAL");
  const relevant = allFinal
    ? [...matches].sort((left, right) =>
      Number(right.round || 0) - Number(left.round || 0) ||
      Number(right.match || 0) - Number(left.match || 0)
    )[0]
    : selection.primary || selection.choices[0] || selection.ordered[0];

  return <section className={styles.page}>
    <header className={styles.pageHeader}>
      <Logo filename={tournament?.logo} name={`${tournament?.year || ""} ${tournament?.name || "Tournament"}`} type="tournament" />
      <div>
        <span>{tournament?.year ? `${tournament.year} Tournament` : "Tournament Matches"}</span>
        <h1>My Match</h1>
        <p>{player?.name ? `${player.name} · ` : ""}{tournament?.name || "Sandbagger Invitational"}</p>
      </div>
    </header>
    {message ? <p className={styles.message} role="status">{message}</p> : null}
    {ordered.length ? <div className={styles.matchList} aria-label="Your tournament matches">
      {ordered.map((match) => <MatchCard
        key={match.matchId}
        match={match}
        emphasized={match.matchId === relevant?.matchId}
        busy={busy}
        onOpen={onOpen}
        tournamentLogoFilename={tournament?.logo}
      />)}
    </div> : <div className={styles.empty}>
      <strong>No tournament matches are assigned yet.</strong>
      <span>Your matches will appear here when tournament pairings are published.</span>
    </div>}
  </section>;
}
