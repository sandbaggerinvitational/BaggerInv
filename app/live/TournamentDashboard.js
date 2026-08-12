"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetImage from "../AssetImage";
import MatchStatusBlock from "../MatchStatusBlock";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import MatchFilterEmptyState from "./MatchFilterEmptyState";
import { courseLogo, teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { formatHandicap, formatStatusLabel, formatTeamPoints } from "../../lib/formatters";
import { formatStoredMatchResult } from "../../lib/match-result";
import { filterMatches, matchState, relativeUpdatedLabel, resolveMatchFilterEmptyState } from "../../lib/live-match-ux";
import { fetchWithTransientRetry } from "../../lib/transient-fetch";
import styles from "./tournament-dashboard.module.css";
import scoreStyles from "../score-typography.module.css";

const CalcuttaExperience = dynamic(() => import("./CalcuttaExperience"), {
  loading: () => <div className={styles.empty} role="status"><strong>Loading Calcutta…</strong><span>Preparing official purchases, ownership, and results.</span></div>,
});

const FILTERS = [["all", "All"], ["live", "Live"], ["upcoming", "Upcoming"], ["final", "Final"]];
const initials = (name) => String(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const hasValue = (value) => value !== null && value !== undefined && value !== "";

function Logo({ filename, name, type = "team", size = "medium" }) {
  const src = type === "tournament" ? tournamentLogo(filename) : type === "course" ? courseLogo(filename) : teamLogo(filename);
  return <span className={styles.logo} data-size={size} data-type={type}>
    <AssetImage src={src} alt={`${name} logo`} className={styles.logoImage} fallbackClassName={styles.logoFallback} fallback={initials(name)} inferFallback={false} />
  </span>;
}

function statusLabel(match) {
  const state = matchState(match);
  const source = String(match.status || "").toLowerCase();
  return formatStatusLabel(source.includes("lock") ? "Locked" : state);
}

function matchResult(match, tournament) {
  return formatStoredMatchResult(match, {
    1: tournament.teamOne.name,
    2: tournament.teamTwo.name,
  });
}

function finalResultParts(match, tournament) {
  const result = matchResult(match, tournament);
  if (matchState(match) !== "final" || !result || /^halved$/i.test(result)) return { team: "", result };
  const winner = [tournament.teamOne.name, tournament.teamTwo.name]
    .find((name) => result.toUpperCase().startsWith(String(name).toUpperCase()));
  return winner
    ? { team: winner, result: result.slice(winner.length).trim() }
    : { team: "", result };
}

function playerMeta(player, format) {
  if (!player) return "";
  const values = [];
  if (hasValue(player.playingHcp)) values.push(`HCP ${formatHandicap(player.playingHcp)}`);
  if (format !== "SC" && hasValue(player.stroke)) values.push(Number(player.stroke) === 0 ? "No strokes" : `+${player.stroke} stroke${Number(player.stroke) === 1 ? "" : "s"}`);
  return values.join(" • ");
}

function Team({ team, players = [], format, playingHcp, stroke }) {
  const teamStroke = Number(stroke);
  return <div className={styles.matchTeam}>
    <Logo filename={team.logo} name={team.name} size="team" />
    <strong>{team.name}</strong>
    <div>{players.map((player, index) => <span key={player?.id || player?.name || index}><b>{player?.name || "Player TBA"}</b>{playerMeta(player, format) ? <small>{playerMeta(player, format)}</small> : null}</span>)}</div>
    {format === "SC" && hasValue(playingHcp) ? <span className={styles.teamHandicap}>
      <small>Team Playing Handicap: {formatHandicap(playingHcp)}</small>
      {Number.isFinite(teamStroke) && teamStroke > 0 ? <b aria-label={`${teamStroke} team stroke${teamStroke === 1 ? "" : "s"}`}>+{teamStroke} team stroke{teamStroke === 1 ? "" : "s"}</b> : null}
    </span> : null}
  </div>;
}

function TournamentMatchCard({ match, round, tournament }) {
  const state = matchState(match);
  const status = statusLabel(match);
  const result = matchResult(match, tournament);
  const finalResult = finalResultParts(match, tournament);
  const tee = match.course?.tee ? `${match.course.tee} Tees` : "";
  const href = `/game-center/${encodeURIComponent(match.id)}?from=tournament`;
  return <Link className={styles.matchCard} data-state={state} href={href} aria-label={`Round ${round.number}, Match ${match.match}, ${match.formatName || round.format}, ${status}${result ? `, ${result}` : ""}`}>
    <div className={styles.matchHead}>
      <span><small>Round {round.number}{match.match ? ` • Match ${match.match}` : ""}</small><strong>{match.formatName || round.format || "Format TBA"}</strong></span>
      <span className={styles.matchState}>
        <MatchStatusBlock
          status={status}
          detail={state === "final" ? finalResult.team : ""}
          result={state === "final" ? finalResult.result : result}
          meta={state === "live" && match.currentHole ? `Through ${match.currentHole}` : ""}
        />
      </span>
    </div>
    <div className={styles.course}>
      <Logo filename={match.course?.logo} name={match.course?.name || "Course"} type="course" size="course" />
      <span><strong>{match.course?.name || "Course TBA"}</strong><small>{[tee, match.teeTime].filter(Boolean).join(" • ") || "Details to be announced"}</small></span>
    </div>
    <div className={styles.versus}>
      <Team team={tournament.teamOne} players={match.team1Players} format={match.format} playingHcp={match.team1PlayingHcp} stroke={match.team1Stroke} />
      <b aria-label="versus">VS</b>
      <Team team={tournament.teamTwo} players={match.team2Players} format={match.format} playingHcp={match.team2PlayingHcp} stroke={match.team2Stroke} />
    </div>
    <span className={styles.viewMatch}>View Match <i aria-hidden="true">›</i></span>
  </Link>;
}

function Snapshot({ tournament, activeRound, momentum, updatedLabel }) {
  const state = tournament.state;
  const round = activeRound;
  const progress = round?.progress || { completedMatches: 0, totalMatches: 0, liveMatches: 0, scheduledMatches: 0, percent: 0 };
  const leading = state.teamOne.pointsToClinch <= state.teamTwo.pointsToClinch
    ? [tournament.teamOne, state.teamOne] : [tournament.teamTwo, state.teamTwo];
  const clinchText = state.clinched
    ? `${state.championSide === 2 ? tournament.teamTwo.name : tournament.teamOne.name} have clinched`
    : state.totalPoints ? `${leading[0].name} need ${formatTeamPoints(leading[1].pointsToClinch)} more points` : "Clinching target unavailable";
  const momentumText = momentum
    ? (momentum.teamOne.includes("last") ? `${tournament.teamOne.name}: ${momentum.teamOne}` : `${tournament.teamTwo.name}: ${momentum.teamTwo}`)
    : "No decided-point momentum yet";
  return <section className={styles.snapshot} aria-label="Tournament snapshot">
    <div className={styles.score} aria-label={`${tournament.teamOne.name} ${formatTeamPoints(tournament.teamOne.score)}, ${tournament.teamTwo.name} ${formatTeamPoints(tournament.teamTwo.score)}`}>
      <div className={styles.scoreTeam}><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="score" /><strong>{tournament.teamOne.name}</strong></div>
      <b className={`${styles.scoreValue} ${scoreStyles.score}`}>{formatTeamPoints(tournament.teamOne.score)}<i className={scoreStyles.separator} aria-hidden="true">–</i>{formatTeamPoints(tournament.teamTwo.score)}</b>
      <div className={styles.scoreTeam}><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="score" /><strong>{tournament.teamTwo.name}</strong></div>
    </div>
    <div className={styles.snapshotMeta}>
      <span><small aria-label="Live matches">LIVE</small><strong>{progress.liveMatches}</strong></span>
      <span><small aria-label="Matches remaining">REMAINING</small><strong>{progress.scheduledMatches}</strong></span>
      <span><small aria-label="Final matches">FINAL</small><strong>{progress.completedMatches}</strong></span>
    </div>
    <div className={styles.progress}>
      <span><strong>{round?.label || "Overall"} • {progress.completedMatches} of {progress.totalMatches} matches complete</strong><small>{progress.liveMatches} live • {progress.scheduledMatches} upcoming</small></span>
      <i><b style={{ width: `${Math.min(100, progress.percent || 0)}%` }} /></i>
    </div>
    <div className={styles.insights}><span><small>Points to Clinch</small><strong>{clinchText}</strong></span><span><small>Momentum</small><strong>{momentumText}</strong></span></div>
    <p>{updatedLabel}</p>
  </section>;
}

export default function TournamentDashboard({ initialData, loadError, readUrl = "/api/live", secondaryReadUrl = "", onConfirmedData }) {
  const [data, setData] = useState(initialData);
  const [selectedRound, setSelectedRound] = useState(() => initialData?.tournament?.currentRound || initialData?.rounds?.[0]?.number || "overall");
  const [filter, setFilter] = useState("all");
  const [openRounds, setOpenRounds] = useState(() => new Set());
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [refreshState, setRefreshState] = useState(initialData ? "current" : "refreshing");
  const [secondaryState, setSecondaryState] = useState(initialData?.calcutta ? "ready" : "idle");
  const pending = useRef(null);
  useEffect(() => {
    if (initialData?.tournament) setData(initialData);
  }, [initialData]);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setRefreshState("refreshing");
    pending.current = fetchWithTransientRetry(readUrl, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to refresh tournament data.");
      setData(payload.data); onConfirmedData?.(payload.data); setLastRefresh(Date.now()); setRefreshState("current");
    }).catch(() => setRefreshState("error")).finally(() => { pending.current = null; });
    return pending.current;
  }, [onConfirmedData, readUrl]);
  const openCalcutta = useCallback(() => {
    setSelectedRound("calcutta");
    if (data?.calcutta || !secondaryReadUrl || secondaryState === "loading") return;
    setSecondaryState("loading");
    fetch(secondaryReadUrl + "?module=calcutta", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || "Calcutta is unavailable.");
      setData((current) => ({ ...current, calcutta: payload.data }));
      setSecondaryState("ready");
    }).catch(() => setSecondaryState("error"));
  }, [data?.calcutta, secondaryReadUrl, secondaryState]);
  useEffect(() => {
    if (!initialData) refresh();
    const poll = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(poll, 45_000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 10_000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); window.clearInterval(clockTimer); window.removeEventListener("focus", poll); document.removeEventListener("visibilitychange", poll); };
  }, [refresh]);
  const tournament = data?.tournament;
  const rounds = data?.rounds || [];
  const activeRound = rounds.find((round) => Number(round.number) === Number(selectedRound)) || rounds.find((round) => Number(round.number) === Number(tournament?.currentRound)) || rounds[0];
  const selectedRounds = selectedRound === "overall" ? rounds : selectedRound === "calcutta" ? [] : activeRound ? [activeRound] : [];
  const activeFilter = selectedRound === "overall" ? "all" : filter;
  const filteredRounds = selectedRounds.map((round) => ({ round, matches: filterMatches(round.matches || [], activeFilter) }));
  const visibleRounds = selectedRound === "overall" && activeFilter !== "all"
    ? filteredRounds.filter(({ matches }) => matches.length)
    : filteredRounds;
  const overallEmptyState = resolveMatchFilterEmptyState(activeFilter, {
    label: "Tournament",
    status: tournament?.status,
    matches: selectedRounds.flatMap((round) => round.matches || []),
  });
  const updated = refreshState === "error" ? "Unable to refresh • showing last confirmed data" : refreshState === "refreshing" ? "Updating tournament data…" : relativeUpdatedLabel(lastRefresh, clock);
  if (!tournament) return <section className={styles.page}><div className={styles.empty} role="status">
    <strong>{refreshState === "refreshing" ? "Preparing Tournament…" : "Tournament data is temporarily unavailable."}</strong>
    <span>{refreshState === "refreshing" ? "Please wait while tournament data is refreshed." : "Automatic recovery could not be completed."}</span>
    {refreshState !== "refreshing" ? <button type="button" onClick={refresh}>Retry</button> : null}
  </div></section>;
  return <section className={styles.page}>
    <TournamentIdentityHeader variant="hero" year={tournament.year} name={tournament.name || "Sandbagger Invitational"} location={tournament.location || "Location TBA"} logo={tournament.logo} status={tournament.status} />
    <nav className={styles.destinations} aria-label="Select tournament destination">
      <button type="button" aria-pressed={selectedRound !== "calcutta"} onClick={() => setSelectedRound(activeRound?.number || tournament.currentRound || rounds[0]?.number)}>Tournament</button>
      <button type="button" aria-pressed={selectedRound === "calcutta"} onClick={openCalcutta}>Calcutta</button>
    </nav>
    {selectedRound === "calcutta" ? data?.calcutta ? <CalcuttaExperience model={data.calcutta} /> : <div className={styles.empty} role="status"><strong>{secondaryState === "error" ? "Calcutta is temporarily unavailable." : "Loading Calcutta…"}</strong><span>{secondaryState === "error" ? "The live Tournament remains available. This projected section can be retried independently." : "Loading the latest imported Director-published results."}</span>{secondaryState === "error" ? <button type="button" onClick={() => { setSecondaryState("idle"); openCalcutta(); }}>Try again</button> : null}</div> : <>
    <nav className={styles.rounds} aria-label="Select tournament round">{rounds.map((round) => <button type="button" aria-pressed={String(selectedRound) === String(round.number)} onClick={() => setSelectedRound(round.number)} key={round.number}>{round.label}</button>)}</nav>
    <div className={styles.filters} role="group" aria-label="Filter tournament matches">{FILTERS.map(([value,label]) => { const count = selectedRounds.flatMap((round) => round.matches || []).filter((match) => value === "all" || matchState(match) === value).length; return <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}<span>{count}</span></button>; })}</div>
    <Snapshot tournament={tournament} activeRound={activeRound} momentum={data?.momentum} updatedLabel={updated} />
    <div className={styles.roundGroups}>{visibleRounds.map(({ round, matches }) => {
      const isOverall = selectedRound === "overall";
      const isOpen = !isOverall || openRounds.has(round.number);
      const liveCount = (round.matches || []).filter((match) => matchState(match) === "live").length;
      const teamOneScore = (round.matches || []).reduce((sum, match) => sum + (Number(match.team1Points) || 0), 0);
      const teamTwoScore = (round.matches || []).reduce((sum, match) => sum + (Number(match.team2Points) || 0), 0);
      return <details className={styles.roundGroup} open={isOpen} onToggle={(event) => {
        if (!isOverall) return;
        const expanded = event.currentTarget.open;
        setOpenRounds((current) => {
          const next = new Set(current);
          if (expanded) next.add(round.number); else next.delete(round.number);
          return next;
        });
      }} key={round.number}>
        <summary><span><small>{round.label}</small><strong>{round.format} • {round.course?.name || "Course TBA"}</strong><em>{round.progress.completedMatches} of {round.progress.totalMatches} Final{liveCount ? ` • ${liveCount} Live` : ""}</em></span><div className={styles.roundSummaryResult}><span className={styles.roundScore} aria-label={`${tournament.teamOne.name} ${formatTeamPoints(teamOneScore)}, ${tournament.teamTwo.name} ${formatTeamPoints(teamTwoScore)}`}><span><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="summary" /><em>{tournament.teamOne.name}</em></span><b className={scoreStyles.score}>{formatTeamPoints(teamOneScore)}<i className={scoreStyles.separator} aria-hidden="true">–</i>{formatTeamPoints(teamTwoScore)}</b><span><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="summary" /><em>{tournament.teamTwo.name}</em></span></span><i aria-hidden="true">{isOpen ? "⌃" : "⌄"}</i></div></summary>
        <div>{matches.length ? matches.map((match) => <TournamentMatchCard match={match} round={round} tournament={tournament} key={match.id} />) : <MatchFilterEmptyState filter={activeFilter} round={round} className={styles.empty} />}</div>
      </details>;
    })}{!visibleRounds.length ? <div className={styles.empty} data-empty-reason={overallEmptyState.reason} role="status"><strong>{overallEmptyState.title}</strong><span>{overallEmptyState.detail}</span></div> : null}</div>
    <Link className={styles.leaderboardsCta} href="/live?view=leaderboards">View Leaderboards <span aria-hidden="true">→</span></Link>
    </>}
  </section>;
}
