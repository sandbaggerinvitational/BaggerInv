"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetImage from "../AssetImage";
import { courseLogo, teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { formatHandicap, formatPoints } from "../../lib/formatters";
import { filterEmptyMessage, filterMatches, matchState, relativeUpdatedLabel } from "../../lib/live-match-ux";
import styles from "./tournament-dashboard.module.css";

const FILTERS = [["all", "All"], ["live", "Live"], ["upcoming", "Upcoming"], ["final", "Final"]];
const initials = (name) => String(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const hasValue = (value) => value !== null && value !== undefined && value !== "";
const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);

function Logo({ filename, name, type = "team", size = "medium" }) {
  const src = type === "tournament" ? tournamentLogo(filename) : type === "course" ? courseLogo(filename) : teamLogo(filename);
  return <span className={styles.logo} data-size={size} data-type={type}>
    <AssetImage src={src} alt={`${name} logo`} className={styles.logoImage} fallbackClassName={styles.logoFallback} fallback={initials(name)} inferFallback={false} />
  </span>;
}

function statusLabel(match) {
  const state = matchState(match);
  if (state === "live") return "Live";
  if (state === "final") return "Final";
  const source = String(match.status || "").toLowerCase();
  if (source.includes("lock")) return "Locked";
  if (source.includes("open")) return "Scoring Opens Soon";
  return "Upcoming";
}

function matchResult(match, tournament) {
  const state = matchState(match);
  if (state === "live") {
    if (match.liveStatusText) return match.liveStatusText;
    const difference = Math.abs(Number(match.team1HolesWon || 0) - Number(match.team2HolesWon || 0));
    if (!difference) return "All Square";
    return `${Number(match.team1HolesWon) > Number(match.team2HolesWon) ? tournament.teamOne.name : tournament.teamTwo.name} ${difference} Up`;
  }
  if (state !== "final") return "";
  if ([match.overallWinner, match.matchupWinner].includes("Halved") || Number(match.team1Points) === Number(match.team2Points)) return "HALVED";
  const winner = Number(match.team1Points) > Number(match.team2Points) ? tournament.teamOne.name : tournament.teamTwo.name;
  return match.liveStatusText || `${winner} WON`;
}

function playerMeta(player) {
  if (!player) return "";
  const values = [];
  if (hasValue(player.playingHcp)) values.push(`HCP ${formatHandicap(player.playingHcp)}`);
  if (hasValue(player.stroke)) values.push(Number(player.stroke) === 0 ? "No strokes" : `+${player.stroke} stroke${Number(player.stroke) === 1 ? "" : "s"}`);
  return values.join(" • ");
}

function Team({ team, players = [] }) {
  return <div className={styles.matchTeam}>
    <Logo filename={team.logo} name={team.name} size="team" />
    <strong>{team.name}</strong>
    <div>{players.map((player, index) => <span key={player?.id || player?.name || index}><b>{player?.name || "Player TBA"}</b>{playerMeta(player) ? <small>{playerMeta(player)}</small> : null}</span>)}</div>
  </div>;
}

function TournamentMatchCard({ match, round, tournament }) {
  const state = matchState(match);
  const status = statusLabel(match);
  const result = matchResult(match, tournament);
  const tee = match.course?.tee ? `${match.course.tee} Tees` : "";
  const href = `/live?view=matchups&round=${round.number}#match-${match.id}`;
  return <Link className={styles.matchCard} href={href} aria-label={`Round ${round.number}, Match ${match.match}, ${match.formatName || round.format}, ${status}${result ? `, ${result}` : ""}`}>
    <div className={styles.matchHead}>
      <span><small>Round {round.number}{match.match ? ` • Match ${match.match}` : ""}</small><strong>{match.formatName || round.format || "Format TBA"}</strong></span>
      <span className={styles.matchState}><em data-state={state}>{status}</em>{result ? <b>{result}</b> : null}{state === "live" && match.currentHole ? <small>Through {match.currentHole}</small> : null}</span>
    </div>
    <div className={styles.course}>
      <Logo filename={match.course?.logo} name={match.course?.name || "Course"} type="course" size="course" />
      <span><strong>{match.course?.name || "Course TBA"}</strong><small>{[tee, match.teeTime].filter(Boolean).join(" • ") || "Details to be announced"}</small></span>
    </div>
    <div className={styles.versus}>
      <Team team={tournament.teamOne} players={match.team1Players} />
      <b aria-label="versus">VS</b>
      <Team team={tournament.teamTwo} players={match.team2Players} />
    </div>
    <span className={styles.viewMatch}>View Match <i aria-hidden="true">→</i></span>
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
    : state.totalPoints ? `${leading[0].name} need ${formatPoints(leading[1].pointsToClinch)} more points` : "Clinching target unavailable";
  const momentumText = momentum
    ? (momentum.teamOne.includes("last") ? `${tournament.teamOne.name}: ${momentum.teamOne}` : `${tournament.teamTwo.name}: ${momentum.teamTwo}`)
    : "No decided-point momentum yet";
  return <section className={styles.snapshot} aria-label="Tournament snapshot">
    <div className={styles.score}>
      <div><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="score" /><strong>{tournament.teamOne.name}</strong><b>{formatPoints(tournament.teamOne.score)}</b></div>
      <em aria-hidden="true">–</em>
      <div><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="score" /><strong>{tournament.teamTwo.name}</strong><b>{formatPoints(tournament.teamTwo.score)}</b></div>
    </div>
    <div className={styles.snapshotMeta}>
      <span><small>Current Round</small><strong>{round?.label || "Overall"}</strong></span>
      <span><small>Live</small><strong>{state.liveMatches} matches</strong></span>
      <span><small>Still On Course</small><strong>{state.remainingMatches}</strong></span>
      <span><small>Points Remaining</small><strong>{formatPoints(state.remainingPoints)}</strong></span>
    </div>
    <div className={styles.progress}>
      <span><strong>{progress.completedMatches} of {progress.totalMatches} matches complete</strong><small>{progress.liveMatches} live • {progress.scheduledMatches} upcoming</small></span>
      <i><b style={{ width: `${Math.min(100, progress.percent || 0)}%` }} /></i>
    </div>
    <div className={styles.insights}><span><small>Points to Clinch</small><strong>{clinchText}</strong></span><span><small>Momentum</small><strong>{momentumText}</strong></span></div>
    <p>{updatedLabel}</p>
  </section>;
}

function ScoreLeaderboard({ rows = [], round }) {
  const [sort, setSort] = useState({ key: "netToPar", direction: "asc" });
  const eligible = useMemo(() => rows.filter((row) => row.holes && (!round || Number(row.round) === Number(round))), [rows, round]);
  const sorted = useMemo(() => [...eligible].sort((a, b) => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return (Number(a[sort.key]) - Number(b[sort.key])) * factor || a.name.localeCompare(b.name);
  }), [eligible, sort]);
  const select = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"]];
  return <section className={styles.leaderboard}>
    <header><span><small>Round Leaderboard</small><h2>Individual Gross &amp; Net</h2></span>{eligible.length ? <em>Live</em> : null}</header>
    {!eligible.length ? <div className={styles.empty}><strong>Standings will appear after the first recorded score.</strong><span>Partial standings publish as valid holes are confirmed.</span></div> : <div className={styles.leaderTable}>
      <div className={styles.leaderRow} data-header="true"><button type="button" onClick={() => select("name")} aria-sort={sort.key === "name" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>Player</button>{columns.map(([key,label]) => <button type="button" key={key} onClick={() => select(key)} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>{label}{sort.key === key ? <i aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</i> : null}</button>)}</div>
      {sorted.slice(0, 10).map((row, index) => <div className={styles.leaderRow} key={`${row.round}-${row.id}`}><strong><i>{index + 1}</i>{row.name}</strong><span>{row.holes >= 18 ? "F" : row.holes}</span><span>{row.gross}</span><span>{row.net}</span><span>{toPar(row.netToPar)}</span></div>)}
    </div>}
  </section>;
}

export default function TournamentDashboard({ initialData, loadError }) {
  const [data, setData] = useState(initialData);
  const [selectedRound, setSelectedRound] = useState(() => initialData?.tournament?.currentRound || initialData?.rounds?.[0]?.number || "overall");
  const [filter, setFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [refreshState, setRefreshState] = useState("current");
  const pending = useRef(null);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setRefreshState("refreshing");
    pending.current = fetch("/api/live", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to refresh tournament data.");
      setData(payload.data); setLastRefresh(Date.now()); setRefreshState("current");
    }).catch(() => setRefreshState("error")).finally(() => { pending.current = null; });
    return pending.current;
  }, []);
  useEffect(() => {
    refresh();
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
  const selectedRounds = selectedRound === "overall" ? rounds : activeRound ? [activeRound] : [];
  const updated = refreshState === "error" ? "Unable to refresh • showing last confirmed data" : refreshState === "refreshing" ? "Updating tournament data…" : relativeUpdatedLabel(lastRefresh, clock);
  if (!tournament) return <section className={styles.page}><div className={styles.empty}><strong>Tournament data is unavailable.</strong><span>{loadError || "Please try again shortly."}</span></div></section>;
  return <section className={styles.page}>
    <header className={styles.pageHeader}><Logo filename={tournament.logo || `sandbagger-${tournament.year}`} name={`${tournament.year} Sandbagger Invitational`} type="tournament" size="header" /><span><small>{tournament.year} Tournament</small><h1>Tournament</h1><p>{tournament.location || "Sandbagger Invitational"}</p></span><em data-state={String(tournament.status).toLowerCase()}>{tournament.status}</em></header>
    <Snapshot tournament={tournament} activeRound={activeRound} momentum={data?.momentum} updatedLabel={updated} />
    <nav className={styles.rounds} aria-label="Select tournament round">{[["overall","Overall"], ...rounds.map((round) => [round.number, round.label])].map(([value,label]) => <button type="button" aria-pressed={String(selectedRound) === String(value)} onClick={() => setSelectedRound(value)} key={value}>{label}</button>)}</nav>
    <div className={styles.filters} role="group" aria-label="Filter tournament matches">{FILTERS.map(([value,label]) => { const count = selectedRounds.flatMap((round) => round.matches || []).filter((match) => value === "all" || matchState(match) === value).length; return <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}<span>{count}</span></button>; })}</div>
    <div className={styles.roundGroups}>{selectedRounds.map((round) => {
      const matches = filterMatches(round.matches || [], filter);
      const complete = round.status === "Complete";
      return <details className={styles.roundGroup} open={!complete || selectedRound !== "overall"} key={round.number}>
        <summary><span><small>{round.label}</small><strong>{round.format}</strong><em>{round.course?.name || "Course TBA"}</em></span><span><b>{round.progress.completedMatches}/{round.progress.totalMatches} final</b><i aria-hidden="true">⌄</i></span></summary>
        <div>{matches.length ? matches.map((match) => <TournamentMatchCard match={match} round={round} tournament={tournament} key={match.id} />) : <div className={styles.empty}><strong>{filterEmptyMessage(filter, round)}</strong><span>Choose another filter or check back after the next update.</span></div>}</div>
      </details>;
    })}</div>
    <ScoreLeaderboard rows={data?.scoreLeaderboard || []} round={activeRound?.number} />
    {loadError ? <p className={styles.note}>{loadError}</p> : null}
  </section>;
}
