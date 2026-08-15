"use client";

import Link from "next/link";
import MatchStatusBlock from "../MatchStatusBlock";
import AssetImage from "../AssetImage";
import { courseLogo, teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { appMatchStatus, formatMatchResult } from "../../lib/mobile-tournament-app";
import { formatStatusLabel } from "../../lib/formatters";
import { homeFormatLabel, normalizedMatchStatus, orderPlayerMatches, selectRelevantPlayerMatches } from "../../lib/player-home";
import styles from "./my-match-dashboard.module.css";
import headerStyles from "../tournament-identity-header.module.css";

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
    ? `Round ${match.round} · Match ${match.match}`
    : `Round ${match.round}`;
  return <div className={styles.matchHeading}>
    <span>{roundMatch}</span>
    <strong>{homeFormatLabel(match.format) || "Format TBA"}</strong>
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

function statusSupport(match, status) {
  if (status === "Live") {
    if (scorecardReadyForReview(match)) return "18 holes scored · Ready to review";
    return match.currentHole ? `Through ${match.currentHole}` : "Ready to score";
  }
  if (status === "Locked") return "Locked by Tournament Director";
  if (status === "Upcoming") return match.teeTime
    ? `Scoring opens before ${formatTime(match.teeTime)}`
    : "Round has not opened yet";
  return "";
}

function scorecardReadyForReview(match) {
  return Number(match.holesRecorded) >= 18 && Number(match.holesRemaining) === 0;
}

function matchProgressMeta(match, status) {
  if (status !== "Live") return "";
  if (scorecardReadyForReview(match)) return "18 holes scored · Ready to review";
  return match.currentHole ? `Through ${match.currentHole}` : "";
}

function playerList(players = []) {
  return players.length ? players.join(" + ") : "Players TBA";
}

function CompactMatchup({ match }) {
  return <div className={styles.compactMatchup}>
    <span><small>Your side</small><strong>{playerList(match.participantNames)}</strong></span>
    <i aria-label="versus">vs</i>
    <span><small>Opponents</small><strong>{playerList(match.opponentNames)}</strong></span>
  </div>;
}

function MatchActions({ match, status, busy, onOpen, detailsHref }) {
  const scorecardAction = status === "Live"
    ? scorecardReadyForReview(match) ? "Review & Finalize" : match.holesRecorded ? "Continue Scoring" : "Start Scoring"
    : status === "Final" ? "Final Scorecard" : "";
  if (!scorecardAction) return <div className={styles.actions}>
    <Link className={styles.primaryAction} href={detailsHref}>View Match <i aria-hidden="true">→</i></Link>
  </div>;
  return <div className={styles.actions}>
    <Link className={styles.secondaryAction} href={detailsHref}>Game Center <i aria-hidden="true">→</i></Link>
    <button className={styles.primaryAction} type="button" disabled={busy} onClick={() => onOpen(match)}>{scorecardAction}</button>
  </div>;
}

function MatchCard({ match, tier = "compact", availableChoice = false, busy, onOpen, tournamentLogoFilename }) {
  const status = appMatchStatus(match);
  const result = formatMatchResult(match, match.team?.side);
  const primary = tier === "primary";
  const displayStatus = primary ? formatStatusLabel(status, {
    current: status === "Live" && !availableChoice,
    complete: status === "Final",
  }) : status;
  const courseMeta = [formatTee(match.tee), formatTime(match.teeTime)].filter(Boolean).join(" • ");
  const support = primary && status === "Live" ? "" : statusSupport(match, status);
  const detailsHref = `/game-center/${encodeURIComponent(match.matchId)}?from=my-match`;
  const accessible = [
    `Round ${match.round}`,
    match.match ? `Match ${match.match}` : "",
    homeFormatLabel(match.format),
    `against ${match.opponentTeam?.name || "opponent"}`,
    match.course,
    formatTime(match.teeTime),
    status,
    result,
  ].filter(Boolean).join(", ");

  return <article className={styles.matchCard} data-tier={tier} aria-label={accessible}>
    <div className={styles.cardTop}>
      <MatchHeading match={match} />
      <div className={styles.cardState}>
        <MatchStatusBlock status={displayStatus} result={result} meta={primary ? matchProgressMeta(match, status) : ""} />
      </div>
    </div>
    <div className={styles.courseLine}>
      <Logo filename={match.courseLogo} name={match.course || "Course"} type="course" tournamentLogoFilename={tournamentLogoFilename} />
      <div><strong>{match.course || "Course TBA"}</strong>{courseMeta ? <span>{courseMeta}</span> : null}</div>
    </div>
    {primary ? <div className={styles.matchup}>
      <TeamBlock team={match.team} players={match.participantNames} tournamentLogoFilename={tournamentLogoFilename} />
      <b aria-label="versus">VS</b>
      <TeamBlock team={match.opponentTeam} players={match.opponentNames} tournamentLogoFilename={tournamentLogoFilename} />
    </div> : <CompactMatchup match={match} />}
    <div className={styles.actionRow}>
      <span className={styles.supportText}>
        {status === "Locked" ? <i aria-hidden="true">🔒</i> : null}
        {support}
      </span>
      <MatchActions match={match} status={status} busy={busy} onOpen={onOpen} detailsHref={detailsHref} />
    </div>
  </article>;
}

export default function MyMatchDashboard({ player, tournament, matches, busy, onOpen, message }) {
  const ordered = orderPlayerMatches(matches, tournament?.currentRound);
  const selection = selectRelevantPlayerMatches(matches, tournament?.currentRound);
  const actionable = ordered.filter((match) => ["LIVE", "OPEN"].includes(normalizedMatchStatus(match)));
  const nonFinal = ordered.filter((match) => normalizedMatchStatus(match) !== "FINAL");
  const promoted = actionable.length
    ? actionable
    : selection.primary && normalizedMatchStatus(selection.primary) !== "FINAL"
      ? [selection.primary]
      : nonFinal.slice(0, 1);
  const promotedIds = new Set(promoted.map((match) => match.matchId));
  const upcoming = nonFinal.filter((match) => !promotedIds.has(match.matchId));
  const completed = ordered.filter((match) => normalizedMatchStatus(match) === "FINAL");
  const groups = [
    promoted.length ? {
      label: actionable.length > 1 ? "Available to Score" : actionable.length ? "Current Match" : "Next Match",
      description: actionable.length > 1 ? `${actionable.length} scorecards are available. Choose the match you intend to update.` : "",
      matches: promoted,
      tier: "primary",
      availableChoice: actionable.length > 1,
    } : null,
    upcoming.length ? { label: "Coming Up", matches: upcoming, tier: "upcoming" } : null,
    completed.length ? { label: "Completed", matches: completed, tier: "completed" } : null,
  ].filter(Boolean);

  return <section className={styles.page}>
    <header className={styles.pageHeader}>
      <Logo filename={tournament?.logo} name={`${tournament?.year || ""} ${tournament?.name || "Tournament"}`} type="tournament" />
      <div>
        <span>{tournament?.year ? `${tournament.year} Tournament` : "Tournament Matches"}</span>
        <h1 className={headerStyles.heroTitle}>My Matches</h1>
        <p>{player?.name ? `${player.name} · ` : ""}{tournament?.name || "Sandbagger Invitational"}</p>
      </div>
    </header>
    {message ? <p className={styles.message} role="status">{message}</p> : null}
    {ordered.length ? <div className={styles.matchGroups} aria-label="Your tournament matches">
      {groups.map((group) => <section className={styles.matchGroup} data-tier={group.tier} key={group.label}>
        <header><h2>{group.label}</h2>{group.description ? <p>{group.description}</p> : null}</header>
        <div className={styles.matchList}>{group.matches.map((match) => <MatchCard
        key={match.matchId}
        match={match}
        tier={group.tier}
        availableChoice={group.availableChoice}
        busy={busy}
        onOpen={onOpen}
        tournamentLogoFilename={tournament?.logo}
        />)}</div>
      </section>)}
    </div> : <div className={styles.empty}>
      <strong>No tournament matches are assigned yet.</strong>
      <span>Your matches will appear here when tournament pairings are published.</span>
    </div>}
  </section>;
}
