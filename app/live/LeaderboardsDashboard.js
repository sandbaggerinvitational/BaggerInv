"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AssetImage from "../AssetImage";
import StatusBadge from "../StatusBadge";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import { playerPhoto, teamLogo } from "../../lib/asset-paths";
import { formatPlayerPoints, formatTeamPoints } from "../../lib/formatters";
import { publishedOddsInsights } from "../../lib/championship-odds-insights";
import { playerProjectionSummary, projectionHistoryHighlights, publishedPlayerHistory, tournamentProjectionStory } from "../../lib/projection-editorial";
import {
  PLAYER_METRICS,
  playerPerformanceRows,
  rankPlayerRows,
  roundScoreRows,
  searchPlayerRows,
  teamStandings,
} from "../../lib/mobile-leaderboards";
import styles from "./leaderboards-dashboard.module.css";
import insightStyles from "./leaderboards-insights.module.css";
import skinsStyles from "./net-skins.module.css";

const clean = (value) => String(value ?? "").trim();
const initials = (name) => clean(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);
const average = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
const currency = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number(value) % 1 ? 2 : 0 }).format(Number(value) || 0);
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

const PREVIEW_ODDS_SCENARIOS = [
  { label: "Pre-Tournament", phases: ["Pre-Tournament"] },
  { label: "Round 2 Pairings", phases: ["Round 2 Pairings", "After Round 1"] },
  { label: "Round 3 Pairings", phases: ["Round 3 Pairings", "Round 3 Pairings Announced", "After Round 2"] },
];

function Insights({ data, previewMode = false }) {
  const [snapshots, setSnapshots] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [previewPhase, setPreviewPhase] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/leaderboards/insights?year=${encodeURIComponent(data.tournament?.year || "")}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Odds unavailable")))
      .then((payload) => setSnapshots(Array.isArray(payload.snapshots) ? payload.snapshots : []))
      .catch((error) => { if (error.name !== "AbortError") setSnapshots([]); });
    return () => controller.abort();
  }, [data.tournament?.year]);
  const previewScenarios = useMemo(() => previewMode ? PREVIEW_ODDS_SCENARIOS.map((scenario) => ({
    ...scenario,
    snapshot: scenario.phases.map((phase) => (snapshots || []).find((item) => item.phase === phase)).find(Boolean),
  })).filter((scenario) => scenario.snapshot) : [], [previewMode, snapshots]);
  const effectivePreviewPhase = previewMode ? (previewPhase || previewScenarios.at(-1)?.snapshot.phase || "") : "";
  const selectedScenarioIndex = effectivePreviewPhase ? (snapshots || []).findIndex((snapshot) => snapshot.phase === effectivePreviewPhase) : -1;
  const presentedSnapshots = selectedScenarioIndex >= 0 ? snapshots.slice(0, selectedScenarioIndex + 1) : (snapshots || []);
  const insights = useMemo(() => publishedOddsInsights(presentedSnapshots), [presentedSnapshots]);
  const playerPhotos = useMemo(() => new Map((data.leaderboard || []).map((player) => [String(player.id), player.photo])), [data.leaderboard]);
  const playerTeams = useMemo(() => new Map((data.leaderboard || []).map((player) => [String(player.id), player.team])), [data.leaderboard]);
  const percent = (value) => `${Number(value || 0).toFixed(1).replace(/\.0$/, "")}%`;
  const publicationTime = insights.current?.publishedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(insights.current.publishedAt)) : "—";
  const trend = (player) => player?.change === null || player?.change === undefined
    ? <span className={insightStyles.initial}>First Projection</span>
    : <span className={player.change > 0 ? insightStyles.up : player.change < 0 ? insightStyles.down : insightStyles.neutral}>{player.change > 0 ? "▲ +" : player.change < 0 ? "▼ " : "— "}{player.change ? `${player.change.toFixed(1)}%` : "Even"}</span>;
  const portrait = (player, className = "") => <span className={`${insightStyles.portrait} ${className}`.trim()}><AssetImage src={playerPhoto(playerPhotos.get(String(player.id)))} alt="" fallbackClassName={insightStyles.portraitFallback} fallback={initials(player.name)} inferFallback={false} /></span>;
  const rankMark = (rank) => ["🥇", "🥈", "🥉"][rank - 1] || `#${rank}`;
  const selectedPlayer = insights.players.find((player) => String(player.id) === selectedPlayerId) || null;
  const selectedHistory = selectedPlayer ? projectionHistoryHighlights(publishedPlayerHistory(presentedSnapshots, selectedPlayerId)) : [];
  const storyline = tournamentProjectionStory({ current: insights.current, previous: insights.previous, playerTeams });
  useEffect(() => {
    if (!selectedPlayer) return undefined;
    const close = (event) => { if (event.key === "Escape") setSelectedPlayerId(""); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedPlayer]);

  if (snapshots === null) return <section className={insightStyles.experience} aria-busy="true"><div className={styles.empty}><strong>Loading Championship Odds…</strong><span>Retrieving the latest published tournament projection.</span></div></section>;
  if (!insights.current) return <section className={insightStyles.experience}><div className={styles.empty}><strong>Championship Odds</strong><span>Tournament projections will publish after official pairings are finalized.</span></div></section>;

  return <section className={insightStyles.experience} aria-label="Championship Odds">
    {previewMode && previewScenarios.length ? <section className={insightStyles.scenarioSelector} aria-label="Preview Odds Scenarios"><label><span>Preview Odds Scenario</span><select value={insights.current.phase} onChange={(event) => { setPreviewPhase(event.target.value); setSelectedPlayerId(""); }}>{previewScenarios.map((scenario) => <option value={scenario.snapshot.phase} key={scenario.label}>{scenario.label}</option>)}</select></label><p>Preview only · official published snapshots</p></section> : null}
    <header className={insightStyles.hero}>
      <span>Published Tournament Projection</span><h2>🏆 Championship Odds</h2>
      <div><p><small>Round Phase</small><strong>{insights.current.phase}</strong></p><p><small>Published</small><strong>{publicationTime}</strong></p></div>
    </header>
    {storyline ? <section className={insightStyles.storyline} aria-label="Projection Story"><span>Projection Story</span><p>{storyline}</p></section> : null}
    <section className={insightStyles.favorite} aria-label="Tournament Favorite">
      <span>🏆 Current Projection Favorite</span>{portrait(insights.favorite, insightStyles.favoritePortrait)}<h3>{insights.favorite.name}</h3>
      <p className={insightStyles.favoriteStory}>Projected Tournament Champion</p>
      <div><p className={insightStyles.favoriteProbability}><small>Probability</small><strong>{percent(insights.favorite.probability)}</strong></p><p><small>American Odds</small><strong>{insights.favorite.americanOdds}</strong></p></div>
    </section>
    {insights.movers && (insights.movers.riser || insights.movers.faller) ? <section className={insightStyles.movers} aria-label="Biggest Movers">
      <header><span>Biggest Movers</span><h3>Since the previous published projection</h3></header><div>
        {[['Largest Positive Movement', insights.movers.riser], ['Largest Negative Movement', insights.movers.faller]].map(([label, player]) => player ? <article key={label}><span>{label}</span><strong>{player.name}</strong><dl><div><dt>Rank</dt><dd>{player.previous ? `${insights.previous.players.findIndex((entry) => String(entry.id) === String(player.id)) + 1} → ${player.rank}` : `#${player.rank}`}</dd></div><div><dt>Probability</dt><dd>{percent(player.previous?.probability)} → {percent(player.probability)}</dd></div><div><dt>Odds</dt><dd>{player.previous?.americanOdds} → {player.americanOdds}</dd></div></dl>{trend(player)}</article> : null)}
      </div></section> : <section className={`${insightStyles.movers} ${insightStyles.moversEmpty}`} aria-label="Biggest Movers"><span>Biggest Movers</span><p>Movement tracking begins after the next published Championship Projection.</p></section>}
    <section className={insightStyles.board} aria-label="Full Odds Board">
      <header><span>Championship Odds Board</span><h3>Published player projections</h3></header>
      <div className={insightStyles.topPlayers}>{insights.players.slice(0, 10).map((player) => <button type="button" className={insightStyles.topPlayer} data-podium={player.rank <= 3 ? player.rank : undefined} onClick={() => setSelectedPlayerId(String(player.id))} aria-label={`Open projection history for ${player.name}`} key={player.id}>
        <strong className={insightStyles.rank} data-medal={player.rank <= 3 || undefined}>{rankMark(player.rank)}</strong>{portrait(player)}<b>{player.name}</b>
        <div><p className={insightStyles.cardProbability}><small>Probability</small><strong>{percent(player.probability)}</strong></p><p><small>American Odds</small><strong>{player.americanOdds}</strong></p></div>
        <p className={insightStyles.cardTrend}><small>Trend</small>{trend(player)}</p>
      </button>)}</div>
      {insights.players.length > 10 ? <div className={insightStyles.remaining}><div className={insightStyles.remainingTitle}>Remaining Field</div><div className={insightStyles.row} data-header="true"><span>Rank</span><span>Player</span><span>Probability</span><span>Odds</span><span>Trend</span></div>
        {insights.players.slice(10).map((player) => <button type="button" className={insightStyles.row} onClick={() => setSelectedPlayerId(String(player.id))} aria-label={`Open projection history for ${player.name}`} key={player.id}><strong>{player.rank}</strong><b>{player.name}</b><span>{percent(player.probability)}</span><span>{player.americanOdds}</span>{trend(player)}</button>)}</div> : null}
    </section>
    <footer className={insightStyles.publication}><span>Publication Information</span><strong>Published: {insights.current.phase}</strong><small>{publicationTime}</small><p>Official Sandbagger Odds Engine projection. Not live odds.</p></footer>
    {selectedPlayer ? <div className={insightStyles.sheetLayer} role="presentation"><button type="button" className={insightStyles.sheetBackdrop} onClick={() => setSelectedPlayerId("")} aria-label="Close player projection details" /><section className={insightStyles.sheet} role="dialog" aria-modal="true" aria-labelledby="projection-player-name">
      <header><span>Player Projection</span><button type="button" onClick={() => setSelectedPlayerId("")} aria-label="Close player projection details">×</button></header>
      <div className={insightStyles.sheetIdentity}>{portrait(selectedPlayer, insightStyles.sheetPortrait)}<div><h3 id="projection-player-name">{selectedPlayer.name}</h3><p>Current Championship Projection</p></div></div>
      <div className={insightStyles.sheetSummary}><p><small>Rank</small><strong>#{selectedPlayer.rank}</strong></p><p><small>Probability</small><strong>{percent(selectedPlayer.probability)}</strong></p><p><small>American Odds</small><strong>{selectedPlayer.americanOdds}</strong></p><p><small>Trend</small>{trend(selectedPlayer)}</p></div>
      <p className={insightStyles.playerSummary}>{playerProjectionSummary(selectedPlayer.name, selectedHistory)}</p>
      <section className={insightStyles.history}><header><span>Projection History</span><p>Official published snapshots</p></header>
        {selectedHistory.length > 1 ? <ol>{selectedHistory.map(({ phase, publishedAt, americanOdds, probability: projectedProbability, highlights }) => <li key={`${phase}-${publishedAt}`}><div><strong>{phase}</strong><small>{publishedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(publishedAt)) : "Published"}</small>{highlights.length ? <em>{highlights.join(" · ")}</em> : null}</div><span><b>{americanOdds}</b><strong>{percent(projectedProbability)}</strong></span></li>)}</ol> : <p className={insightStyles.firstHistory}>This is the first published Championship Projection.</p>}
      </section>
    </section></div> : null}
  </section>;
}

function NetSkinsBoard({ data, currentPlayer }) {
  const rounds = data.netSkins?.rounds || [];
  const [selectedRound, setSelectedRound] = useState(String(rounds[0]?.round || ""));
  const [expanded, setExpanded] = useState("");
  useEffect(() => {
    if (!rounds.some((round) => String(round.round) === selectedRound)) setSelectedRound(String(rounds[0]?.round || ""));
  }, [rounds, selectedRound]);
  const round = rounds.find((item) => String(item.round) === selectedRound);
  if (!rounds.length) return <section className={skinsStyles.board}><div className={styles.empty}><strong>Net Skins will appear when participation is configured.</strong><span>Eligibility is managed from the official Net Skins worksheet.</span></div></section>;
  return <section className={skinsStyles.experience} aria-label="Net Skins standings">
    <nav className={styles.roundSelector} aria-label="Net Skins round">
      {rounds.map((item) => <button type="button" aria-pressed={String(item.round) === selectedRound} onClick={() => { setSelectedRound(String(item.round)); setExpanded(""); }} key={item.round}>Round {item.round}</button>)}
    </nav>
    <section className={skinsStyles.board}>
      <header><span><small>Net Skins Competition</small><h2>Round {round.round} Net Skins</h2></span><b>{round.format === "SC" ? "Scramble Teams" : "Individual Golfers"}</b></header>
      <div className={skinsStyles.summary}>
        <div><span>Round Pot</span><strong>{currency(round.pot)}</strong></div>
        <div><span>Entrants</span><strong>{round.eligibleCount} {round.format === "SC" ? (round.eligibleCount === 1 ? "Team" : "Teams") : (round.eligibleCount === 1 ? "Golfer" : "Golfers")}</strong></div>
        <div><span>Skins Awarded</span><strong>{round.skinsAwarded}</strong></div>
        <div><span>Value Per Skin</span><strong>{round.skinsAwarded ? currency(round.skinValue) : "—"}</strong></div>
      </div>
      {!round.leaderboard.length ? <div className={styles.empty}><strong>No eligible participants yet.</strong><span>The leaderboard will calculate automatically from official net scores.</span></div> : <div>
        <div className={skinsStyles.row} data-header="true"><span>Rank</span><span>{round.format === "SC" ? "Team" : "Player"}</span><span>Skins</span><span>Winnings</span></div>
        {round.leaderboard.map((row) => { const isCurrent = Boolean(currentPlayer?.id && row.playerIds?.includes(currentPlayer.id)); return <div className={skinsStyles.entry} data-current={isCurrent || undefined} key={row.id}>
          <button type="button" className={skinsStyles.row} aria-expanded={expanded === row.id} aria-label={`${row.name}, ${row.skinsWon} skins, ${currency(row.totalWinnings)} winnings${isCurrent ? ", your entry" : ""}`} onClick={() => setExpanded((current) => current === row.id ? "" : row.id)}>
            <strong>{row.displayRank}</strong><b>{row.name}</b><span>{row.skinsWon}</span><strong>{currency(row.totalWinnings)}</strong>
          </button>
          {expanded === row.id ? <div className={skinsStyles.details}>{row.winningHoles.length ? row.winningHoles.map((skin) => <div key={skin.hole}><span><i className={skinsStyles.skinCoin} aria-hidden="true">S</i>Hole {skin.hole}</span><small>{round.format === "SC" ? "Scramble" : round.format === "SI" ? "Singles" : "Best Ball"}<br />Net {skin.winningNetScore}</small><strong>+{currency(skin.skinValue)}</strong></div>) : <p>No skins won in this round.</p>}</div> : null}
        </div>; })}
      </div>}
      {!round.complete ? <p className={skinsStyles.note}>{round.completedHoles} of 18 holes have a complete eligible field. Values recalculate as official scores arrive.</p> : null}
      {round.complete && !round.skinsAwarded ? <p className={skinsStyles.note}>No skins awarded. Tied low-net scores do not carry over.</p> : null}
    </section>
  </section>;
}

export default function LeaderboardsDashboard({ initialData, loadError, previewMode = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [refreshState, setRefreshState] = useState("current");
  const pending = useRef(null);
  const tab = ["players", "teams", "skins", "insights"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "players";
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
    <nav className={`${styles.tabs} ${skinsStyles.tabs}`} aria-label="Leaderboard category">{[["players", "Players"], ["teams", "Teams"], ["skins", "Net Skins"], ["insights", "Insights"]].map(([value, label]) => <button type="button" aria-pressed={tab === value} onClick={() => updateQuery({ tab: value })} key={value}>{label}</button>)}</nav>
    {!["insights", "skins"].includes(tab) ? <Controls rounds={data.rounds || []} selectedRound={selectedRound} onRound={(round) => updateQuery({ round })} /> : null}
    {tab === "players" && selectedRound === "overall" ? <OverallPlayers data={data} currentPlayer={currentPlayer} metric={metric} setMetric={(value) => updateQuery({ metric: value })} /> : null}
    {tab === "players" && selectedRound !== "overall" ? <RoundPlayers data={data} selectedRound={selectedRound} /> : null}
    {tab === "teams" ? <Teams data={data} selectedRound={selectedRound} currentPlayer={currentPlayer} /> : null}
    {tab === "skins" ? <NetSkinsBoard data={data} currentPlayer={currentPlayer} /> : null}
    {tab === "insights" ? <Insights data={data} previewMode={previewMode} /> : null}
    {loadError ? <p className={styles.loadNote}>{loadError}</p> : null}
  </section>;
}
