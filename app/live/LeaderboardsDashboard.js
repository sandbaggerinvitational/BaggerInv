"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AssetImage from "../AssetImage";
import StatusBadge from "../StatusBadge";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import { playerPhoto, teamLogo } from "../../lib/asset-paths";
import { formatPlayerPoints, formatTeamPoints } from "../../lib/formatters";
import { tournamentStorylines } from "../../lib/tournament-storylines";
import {
  PLAYER_METRICS,
  playerPerformanceRows,
  rankPlayerRows,
  roundScoreRows,
  searchPlayerRows,
  teamStandings,
  tournamentInsights,
} from "../../lib/mobile-leaderboards";
import styles from "./leaderboards-dashboard.module.css";
import insightStyles from "./leaderboards-insights.module.css";

const clean = (value) => String(value ?? "").trim();
const initials = (name) => clean(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);
const average = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
const metricValue = (row, metric) => {
  if (metric === "points") return `${formatPlayerPoints(row.points)} pts`;
  if (metric === "wins") return String(row.wins ?? "—");
  if (metric === "winPct") return row.winPct === null ? "—" : `${row.winPct.toFixed(0)}%`;
  return average(row[metric]);
};

function TeamMark({ filename, name, size = "small" }) {
  return <span className={styles.teamMark} data-size={size}>
    <AssetImage src={teamLogo(filename)} alt={`${name} logo`} className={styles.teamLogo} fallbackClassName={styles.teamFallback} fallback={initials(name)} inferFallback={false} />
  </span>;
}

function Controls({ rounds, selectedRound, onRound }) {
  return <nav className={styles.roundSelector} aria-label="Leaderboard round">
    {[["overall", "Overall"], ...rounds.map((round) => [String(round.number), round.label])].map(([value, label]) =>
      <button type="button" aria-pressed={selectedRound === value} onClick={() => onRound(value)} key={value}>{label}</button>
    )}
  </nav>;
}

function PlayerDetails({ row, roundLeaderboards = {} }) {
  const roundResults = Object.entries(roundLeaderboards)
    .map(([round, rows]) => ({ round, result: rows.find((item) => item.id === row.id) }))
    .filter((item) => item.result);
  return <div className={styles.playerDetails}>
    <div><span>Team</span><strong>{row.team}</strong></div>
    <div><span>Overall Record</span><strong>{row.record}</strong></div>
    <div><span>Points</span><strong>{formatPlayerPoints(row.points)}</strong></div>
    {row.grossAvg !== null ? <div><span>Gross Average</span><strong>{average(row.grossAvg)}</strong></div> : null}
    {row.netAvg !== null ? <div><span>Net Average</span><strong>{average(row.netAvg)}</strong></div> : null}
    {roundResults.length ? <p>{roundResults.map(({ round, result }) => `Round ${round}: ${result.wins}-${result.losses}-${result.halves}, ${formatPlayerPoints(result.points)} pts`).join(" • ")}</p> : null}
  </div>;
}

function OverallPlayers({ data, currentPlayer, metric, setMetric }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const [direction, setDirection] = useState("");
  const performance = useMemo(() => playerPerformanceRows(data.leaderboard || [], data.scoreLeaderboard || []), [data]);
  const availableMetrics = useMemo(() => PLAYER_METRICS.filter(([key]) =>
    ["points", "wins", "winPct"].includes(key) || performance.some((row) => row[key] !== null)
  ), [performance]);
  const ranked = useMemo(() => searchPlayerRows(rankPlayerRows(performance, metric, direction || undefined), query), [direction, metric, performance, query]);
  const changeSort = () => setDirection((current) => current === "asc" ? "desc" : "asc");
  return <>
    <div className={styles.playerTools}>
      <label><span>Search players</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear player search">×</button> : null}</label>
      <div className={styles.metricSelector} role="group" aria-label="Performance metric">
        {availableMetrics.map(([value, label]) => <button type="button" aria-pressed={metric === value} onClick={() => { setMetric(value); setDirection(""); }} key={value}>{label}</button>)}
      </div>
      {metric !== "points" ? <p>Performance view · switch to Points for official tournament standings.</p> : null}
    </div>
    {!ranked.length ? <div className={styles.empty}><strong>No players match this search.</strong><span>Clear the search to see the tournament standings.</span></div> :
      <section className={styles.playerTable} aria-label={metric === "points" ? "Official player standings" : `${availableMetrics.find(([key]) => key === metric)?.[1]} performance standings`}>
        <div className={styles.overallRow} data-header="true"><span>Rank</span><span>Player</span><span>Record</span><button type="button" onClick={changeSort} aria-sort={direction === "asc" ? "ascending" : "descending"}>{availableMetrics.find(([key]) => key === metric)?.[1]} <i aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</i></button></div>
        {ranked.map((row) => {
          const isCurrent = currentPlayer?.id === row.id;
          const isOpen = expanded === row.id;
          return <div className={styles.playerEntry} data-current={isCurrent || undefined} key={row.id}>
            <button className={styles.overallRow} type="button" aria-expanded={isOpen} aria-label={`${row.player}, rank ${row.displayRank || "unranked"}, record ${row.record}, ${metricValue(row, metric)}${isCurrent ? ", your position" : ""}`} onClick={() => setExpanded((current) => current === row.id ? "" : row.id)}>
              <strong>{row.displayRank || "—"}</strong>
              <span className={styles.playerIdentity}><span className={styles.playerPhoto}><AssetImage src={playerPhoto(row.photo)} alt="" fallbackClassName={styles.playerFallback} fallback={initials(row.player)} inferFallback={false} /></span><span><b>{row.player}{isCurrent ? <em>YOU</em> : null}</b><small><TeamMark filename={row.teamLogo} name={row.team} />{row.team}</small></span></span>
              <span>{row.record}</span><b>{metricValue(row, metric)}</b>
            </button>
            {isOpen ? <PlayerDetails row={row} roundLeaderboards={data.roundLeaderboards || {}} /> : null}
          </div>;
        })}
      </section>}
  </>;
}

function RoundPlayers({ data, selectedRound }) {
  const round = data.rounds.find((item) => String(item.number) === selectedRound);
  const [sort, setSort] = useState({ key: "netToPar", direction: "asc" });
  const rows = useMemo(() => roundScoreRows(data.scoreLeaderboard || [], round?.number, round?.format, sort), [data.scoreLeaderboard, round, sort]);
  const pairing = ["SC", "SCRAMBLE"].includes(clean(round?.format).toUpperCase());
  const select = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"]];
  return <section className={styles.roundBoard} aria-label={pairing ? "Scramble pairing leaderboard" : `${round?.label || "Round"} player leaderboard`}>
    <header><span><small>{round?.label}</small><h2>{pairing ? "Scramble Pairing Leaderboard" : "Individual Gross & Net"}</h2></span>{rows.length ? <StatusBadge status="Live" /> : null}</header>
    {!rows.length ? <div className={styles.empty}><strong>Standings will appear after the first recorded score.</strong><span>Partial standings publish as valid holes are confirmed.</span></div> : <div>
      <div className={styles.roundRow} data-header="true"><span>Rank</span><span>{pairing ? "Pairing" : "Player"}</span>{columns.map(([key, label]) => <button type="button" onClick={() => select(key)} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} aria-label={key === "netToPar" ? "Net score relative to par" : label} key={key}>{label}{sort.key === key ? <i aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</i> : null}</button>)}</div>
      {rows.map((row) => <div className={styles.roundRow} key={`${row.round}-${row.id}`}><strong>{row.displayRank}</strong><b>{row.name}</b><span>{Number(row.holes) >= 18 ? "F" : row.holes}</span><span>{row.gross}</span><span>{row.net}</span><span>{toPar(row.netToPar)}</span></div>)}
    </div>}
  </section>;
}

function Teams({ data, selectedRound, currentPlayer }) {
  const standings = useMemo(() => teamStandings(data.rounds || [], data.tournament || {}, selectedRound), [data, selectedRound]);
  const currentTeamSide = (data.leaderboard || []).find((row) => row.id === currentPlayer?.id)?.teamSide;
  return <section className={styles.teams} aria-label="Team standings">
    <div className={styles.teamHeader}><span>Rank</span><span>Team</span><span>Record</span><span>Points</span></div>
    {standings.map((team) => {
      const currentTeam = Number(currentTeamSide) === Number(team.side);
      return <article data-current={currentTeam || undefined} key={team.side}>
        <strong>{team.rank}</strong>
        <span><TeamMark filename={team.logo} name={team.name} size="large" /><span><b>{team.name}{currentTeam ? <em>YOUR TEAM</em> : null}</b><small>{team.remaining} match{team.remaining === 1 ? "" : "es"} remaining</small></span></span>
        <span>{team.record}</span><b>{formatTeamPoints(team.points)}</b>
      </article>;
    })}
  </section>;
}

function Insights({ data }) {
  const players = useMemo(() => playerPerformanceRows(data.leaderboard || [], data.scoreLeaderboard || []), [data]);
  const teams = useMemo(() => teamStandings(data.rounds || [], data.tournament || {}, "overall"), [data]);
  const insights = useMemo(() => tournamentInsights(players, teams, data.tournament || {}), [data.tournament, players, teams]);
  const storylines = useMemo(() => tournamentStorylines(data).filter((item) => !["team-race", "undefeated"].includes(item.id)), [data]);
  const undefeated = insights.undefeated;
  const hasTeamRace = Number(insights.teamLeader?.points) > 0;
  const compactUndefeated = undefeated.length > 3;
  return <section className={styles.insights}>
    <header><small>Tournament Storylines</small><h2>Why this tournament matters</h2><p>Stories drawn only from official current-tournament results.</p></header>
    {storylines.length || hasTeamRace || undefeated.length ? <div>
      {storylines.map((item) => <article key={item.id}><i className={insightStyles.storyIcon} aria-hidden="true">{item.icon}</i><span>{item.label}</span><strong>{item.headline}</strong><b>{item.detail}</b></article>)}
      {hasTeamRace ? <article aria-label={insights.teamLeader.accessibleLabel}>
        <span>{insights.teamLeader.label}</span>
        {insights.teamLeader.tied ? <em className={insightStyles.tieLabel}>Tied</em> : null}
        <strong>{insights.teamLeader.namesLabel}</strong>
        <b>{insights.teamLeader.tied ? `The tournament race is level at ${formatTeamPoints(insights.teamLeader.points)} points each.` : `${formatTeamPoints(insights.teamLeader.points)} points set the pace in the team race.`}</b>
      </article> : null}
      {undefeated.length ? <article className={insightStyles.undefeated}>
        <span>Undefeated</span>
        {compactUndefeated ? <details>
          <summary aria-label={`Show all ${undefeated.length} undefeated players`}>
            <strong>{undefeated.slice(0, 2).map((row) => row.player).join("\n")}</strong>
            <em>+{undefeated.length - 2} more</em>
          </summary>
          <ul>{undefeated.map((row) => <li key={row.id}>{row.player}</li>)}</ul>
        </details> : <strong>{undefeated.map((row) => row.player).join(", ")}</strong>}
        <b>{undefeated.length === 1 ? `${undefeated[0].player} has not lost a completed match.` : `${undefeated.length} players have not lost a completed match.`}</b>
      </article> : null}
    </div> : <div className={styles.empty}><strong>No storylines yet.</strong><span>Meaningful moments will appear as official results are finalized.</span></div>}
  </section>;
}

export default function LeaderboardsDashboard({ initialData, loadError }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [refreshState, setRefreshState] = useState("current");
  const pending = useRef(null);
  const tab = ["players", "teams", "insights"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "players";
  const roundValues = new Set((data?.rounds || []).map((round) => String(round.number)));
  const selectedRound = roundValues.has(searchParams.get("round")) ? searchParams.get("round") : "overall";
  const metric = PLAYER_METRICS.some(([key]) => key === searchParams.get("metric")) ? searchParams.get("metric") : "points";
  const updateQuery = useCallback((changes) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "leaderboards");
    Object.entries(changes).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setRefreshState("refreshing");
    pending.current = fetch("/api/live", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to refresh standings.");
      setData(payload.data); setRefreshState("current");
    }).catch(() => setRefreshState("error")).finally(() => { pending.current = null; });
    return pending.current;
  }, []);
  useEffect(() => {
    fetch("/api/player-passport/session", { cache: "no-store" }).then(async (response) => response.ok ? (await response.json()).player : null).then(setCurrentPlayer).catch(() => {});
    const poll = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(poll, 45_000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", poll); document.removeEventListener("visibilitychange", poll); };
  }, [refresh]);
  const tournament = data?.tournament;
  if (!tournament) return <section className={styles.page}><div className={styles.empty} role="status">
    <strong>{refreshState === "refreshing" ? "Loading leaderboards…" : "Tournament data is temporarily unavailable."}</strong>
    <span>{refreshState === "refreshing" ? "Retrying official standings." : loadError || "Please try again shortly."}</span>
    {refreshState !== "refreshing" ? <button type="button" onClick={refresh}>Retry</button> : null}
  </div></section>;
  return <section className={styles.page}>
    <TournamentIdentityHeader year={tournament.year} name={tournament.name || "Sandbagger Invitational"} location={tournament.location || "Location TBA"} logo={tournament.logo} status={tournament.status} />
    <header className={styles.pageTitle}><span>Leaderboards</span><h1>Standings</h1><p>Individual, team, and round standings</p><small role="status" aria-live="polite">{refreshState === "refreshing" ? "Updating standings…" : refreshState === "error" ? "Unable to refresh • showing last confirmed data" : "Official tournament data"}</small></header>
    <nav className={styles.tabs} aria-label="Leaderboard category">{[["players", "Players"], ["teams", "Teams"], ["insights", "Insights"]].map(([value, label]) => <button type="button" aria-pressed={tab === value} onClick={() => updateQuery({ tab: value })} key={value}>{label}</button>)}</nav>
    {tab !== "insights" ? <Controls rounds={data.rounds || []} selectedRound={selectedRound} onRound={(round) => updateQuery({ round })} /> : null}
    {tab === "players" && selectedRound === "overall" ? <OverallPlayers data={data} currentPlayer={currentPlayer} metric={metric} setMetric={(value) => updateQuery({ metric: value })} /> : null}
    {tab === "players" && selectedRound !== "overall" ? <RoundPlayers data={data} selectedRound={selectedRound} /> : null}
    {tab === "teams" ? <Teams data={data} selectedRound={selectedRound} currentPlayer={currentPlayer} /> : null}
    {tab === "insights" ? <Insights data={data} /> : null}
    {loadError ? <p className={styles.loadNote}>{loadError}</p> : null}
  </section>;
}
