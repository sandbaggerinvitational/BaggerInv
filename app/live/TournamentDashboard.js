"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetImage from "../AssetImage";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import { courseLogo, playerPhoto, teamLogo, tournamentLogo } from "../../lib/asset-paths";
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
  if (match.liveStatusText) return match.liveStatusText.toUpperCase();
  if ([match.overallWinner, match.matchupWinner].includes("Halved") || Number(match.team1Points) === Number(match.team2Points)) return "HALVED";
  const winner = Number(match.team1Points) > Number(match.team2Points) ? tournament.teamOne.name : tournament.teamTwo.name;
  return `${winner} WON`;
}

function finalResultParts(match, tournament) {
  const result = matchResult(match, tournament);
  if (matchState(match) !== "final" || !result || result === "HALVED") return { team: "", result };
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
  const href = `/live?view=matchups&round=${round.number}#match-${match.id}`;
  return <Link className={styles.matchCard} href={href} aria-label={`Round ${round.number}, Match ${match.match}, ${match.formatName || round.format}, ${status}${result ? `, ${result}` : ""}`}>
    <div className={styles.matchHead}>
      <span><small>Round {round.number}{match.match ? ` • Match ${match.match}` : ""}</small><strong>{match.formatName || round.format || "Format TBA"}</strong></span>
      <span className={styles.matchState}><em data-state={state}>{status}</em>{state === "final" && result ? <b className={styles.finalResult}>{finalResult.team ? <small>{finalResult.team}</small> : null}<strong>{finalResult.result}</strong></b> : result ? <b>{result}</b> : null}{state === "live" && match.currentHole ? <small>Through {match.currentHole}</small> : null}</span>
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
    : state.totalPoints ? `${leading[0].name} need ${formatPoints(leading[1].pointsToClinch)} more points` : "Clinching target unavailable";
  const momentumText = momentum
    ? (momentum.teamOne.includes("last") ? `${tournament.teamOne.name}: ${momentum.teamOne}` : `${tournament.teamTwo.name}: ${momentum.teamTwo}`)
    : "No decided-point momentum yet";
  return <section className={styles.snapshot} aria-label="Tournament snapshot">
    <div className={styles.score} aria-label={`${tournament.teamOne.name} ${formatPoints(tournament.teamOne.score)}, ${tournament.teamTwo.name} ${formatPoints(tournament.teamTwo.score)}`}>
      <div className={styles.scoreTeam}><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="score" /><strong>{tournament.teamOne.name}</strong></div>
      <b className={styles.scoreValue}>{formatPoints(tournament.teamOne.score)} <i aria-hidden="true">–</i> {formatPoints(tournament.teamTwo.score)}</b>
      <div className={styles.scoreTeam}><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="score" /><strong>{tournament.teamTwo.name}</strong></div>
    </div>
    <div className={styles.snapshotMeta}>
      <span><small aria-label="Live matches">LIVE</small><strong>{state.liveMatches}</strong></span>
      <span><small aria-label="Matches remaining">REMAINING</small><strong>{state.remainingMatches}</strong></span>
      <span><small aria-label="Final matches">FINAL</small><strong>{state.totalMatches - state.remainingMatches}</strong></span>
    </div>
    <div className={styles.progress}>
      <span><strong>{round?.label || "Overall"} • {progress.completedMatches} of {progress.totalMatches} matches complete</strong><small>{progress.liveMatches} live • {progress.scheduledMatches} upcoming</small></span>
      <i><b style={{ width: `${Math.min(100, progress.percent || 0)}%` }} /></i>
    </div>
    <div className={styles.insights}><span><small>Points to Clinch</small><strong>{clinchText}</strong></span><span><small>Momentum</small><strong>{momentumText}</strong></span></div>
    <p>{updatedLabel}</p>
  </section>;
}

function ScoreLeaderboard({ rows = [], round, format }) {
  const [sort, setSort] = useState({ key: "netToPar", direction: "asc" });
  const eligible = useMemo(() => rows.filter((row) => row.holes && (!round || Number(row.round) === Number(round))), [rows, round]);
  const sorted = useMemo(() => [...eligible].sort((a, b) => {
    const factor = sort.direction === "asc" ? 1 : -1;
    return (Number(a[sort.key]) - Number(b[sort.key])) * factor || a.name.localeCompare(b.name);
  }), [eligible, sort]);
  const select = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"]];
  const pairing = format === "Scramble" || format === "SC";
  const ranks = useMemo(() => {
    const map = new Map();
    sorted.forEach((row, index) => {
      const previous = sorted[index - 1];
      const tied = previous && Number(previous[sort.key]) === Number(row[sort.key]);
      map.set(row.id, tied ? map.get(previous.id) : index + 1);
    });
    return map;
  }, [sort.key, sorted]);
  return <section className={styles.leaderboard}>
    <header><span><small>Round Leaderboard</small><h2>{pairing ? "Scramble Pairing Leaderboard" : "Individual Gross & Net"}</h2></span>{eligible.length ? <em>Live</em> : null}</header>
    {!eligible.length ? <div className={styles.empty}><strong>Standings will appear after the first recorded score.</strong><span>Partial standings publish as valid holes are confirmed.</span></div> : <div className={styles.leaderTable}>
      <div className={styles.leaderRow} data-header="true"><span className={styles.leaderHeading}>Rank</span><span className={styles.leaderHeading}>{pairing ? "Pairing" : "Player"}</span>{columns.map(([key,label]) => <button className={styles.leaderHeading} type="button" key={key} onClick={() => select(key)} aria-label={key === "netToPar" ? "Net score relative to par" : label} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>{label}{sort.key === key ? <i aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</i> : null}</button>)}</div>
      {sorted.slice(0, 10).map((row) => <div className={styles.leaderRow} key={`${row.round}-${row.id}`} aria-label={pairing ? `Scramble pairing ${row.name}` : undefined}><i>{ranks.get(row.id)}</i><strong>{row.name}</strong><span>{row.holes >= 18 ? "F" : row.holes}</span><span>{row.gross}</span><span>{row.net}</span><span>{toPar(row.netToPar)}</span></div>)}
    </div>}
  </section>;
}

function OverallLeaderboard({ rows = [] }) {
  const [direction, setDirection] = useState("desc");
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const factor = direction === "asc" ? 1 : -1;
    return (Number(a.points) - Number(b.points)) * factor ||
      (Number(a.wins) - Number(b.wins)) * factor ||
      a.player.localeCompare(b.player);
  }), [rows, direction]);
  const ranked = useMemo(() => {
    const officialOrder = [...rows].sort((a, b) =>
      Number(b.points) - Number(a.points) || Number(b.wins) - Number(a.wins) ||
      Number(a.losses) - Number(b.losses) || a.player.localeCompare(b.player)
    );
    const rankById = new Map();
    officialOrder.forEach((row, index) => {
      const previous = officialOrder[index - 1];
      const tied = previous && Number(previous.points) === Number(row.points);
      rankById.set(row.id, tied ? rankById.get(previous.id) : index + 1);
    });
    return rankById;
  }, [rows]);
  return <section className={styles.leaderboard}>
    <header><span><small>Overall Leaderboard</small><h2>Individual Points & Record</h2></span>{rows.length ? <em>Official</em> : null}</header>
    {!rows.length ? <div className={styles.empty}><strong>Standings will appear after the first official result.</strong><span>Points and records update as matches are finalized.</span></div> : <div className={styles.overallLeaderboard}>
      <div className={styles.overallRow} data-header="true"><span>Rank</span><span>Player</span><span>Record</span><button type="button" onClick={() => setDirection((current) => current === "desc" ? "asc" : "desc")} aria-sort={direction === "desc" ? "descending" : "ascending"}>Points <i aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</i></button></div>
      {sorted.slice(0, 10).map((row) => <div className={styles.overallRow} key={row.id}>
        <strong>{ranked.get(row.id)}</strong>
        <span className={styles.overallPlayer}><span className={styles.playerImage}><AssetImage src={playerPhoto(row.photo)} alt="" fallbackClassName={styles.playerFallback} fallback={initials(row.player)} inferFallback={false} /></span><span><b>{row.player}</b><small><Logo filename={row.teamLogo} name={row.team} size="mini" />{row.team}</small></span></span>
        <span>{row.wins}-{row.losses}-{row.halves}</span>
        <b>{formatPoints(row.points)}</b>
      </div>)}
    </div>}
  </section>;
}

export default function TournamentDashboard({ initialData, loadError }) {
  const [data, setData] = useState(initialData);
  const [selectedRound, setSelectedRound] = useState(() => initialData?.tournament?.currentRound || initialData?.rounds?.[0]?.number || "overall");
  const [filter, setFilter] = useState("all");
  const [openRounds, setOpenRounds] = useState(() => new Set());
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
    <TournamentIdentityHeader year={tournament.year} name={tournament.name || "Sandbagger Invitational"} location={tournament.location || "Location TBA"} logo={tournament.logo} status={tournament.status} />
    <Snapshot tournament={tournament} activeRound={activeRound} momentum={data?.momentum} updatedLabel={updated} />
    <nav className={styles.rounds} aria-label="Select tournament round">{[["overall","Overall"], ...rounds.map((round) => [round.number, round.label])].map(([value,label]) => <button type="button" aria-pressed={String(selectedRound) === String(value)} onClick={() => setSelectedRound(value)} key={value}>{label}</button>)}</nav>
    <div className={styles.filters} role="group" aria-label="Filter tournament matches">{FILTERS.map(([value,label]) => { const count = selectedRounds.flatMap((round) => round.matches || []).filter((match) => value === "all" || matchState(match) === value).length; return <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}<span>{count}</span></button>; })}</div>
    <div className={styles.roundGroups}>{selectedRounds.map((round) => {
      const matches = filterMatches(round.matches || [], filter);
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
        <summary><span><small>{round.label}</small><strong>{round.format} • {round.course?.name || "Course TBA"}</strong><em>{round.progress.completedMatches} of {round.progress.totalMatches} Final{liveCount ? ` • ${liveCount} Live` : ""}</em></span><div className={styles.roundSummaryResult}><span className={styles.roundScore} aria-label={`${tournament.teamOne.name} ${formatPoints(teamOneScore)}, ${tournament.teamTwo.name} ${formatPoints(teamTwoScore)}`}><span><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="summary" /><em>{tournament.teamOne.name}</em></span><b>{formatPoints(teamOneScore)} – {formatPoints(teamTwoScore)}</b><span><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="summary" /><em>{tournament.teamTwo.name}</em></span></span><i aria-hidden="true">{isOpen ? "⌃" : "⌄"}</i></div></summary>
        <div>{matches.length ? matches.map((match) => <TournamentMatchCard match={match} round={round} tournament={tournament} key={match.id} />) : <div className={styles.empty}><strong>{filterEmptyMessage(filter, round)}</strong><span>Choose another filter or check back after the next update.</span></div>}</div>
      </details>;
    })}</div>
    {selectedRound === "overall"
      ? <OverallLeaderboard rows={data?.leaderboard || []} />
      : <ScoreLeaderboard rows={data?.scoreLeaderboard || []} round={activeRound?.number} format={activeRound?.format} />}
    {loadError ? <p className={styles.note}>{loadError}</p> : null}
  </section>;
}
