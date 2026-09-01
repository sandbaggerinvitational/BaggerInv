"use client";
import { useEffect, useMemo, useState } from "react";
import { formatCode, pick } from "../../../lib/prediction-engine";
import { currentTournamentYear, getTeamContext } from "../../../lib/tournament-context";
import { buildTeamIntelligenceLineupRuntime } from "../../../lib/team-intelligence-lineup-runtime";
import {
  chemistryGrade,
  buildLineupPlans,
  comparisonEdge,
  deterministicTeamSummary,
  pairingScore,
  rankPairings,
} from "../../../lib/team-intelligence-utils";
import styles from "./team-intelligence.module.css";

const clean = (value) => String(value ?? "").trim();
const fmt = (value, suffix = "") => value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}${suffix}`;
const record = (row) => row ? `${row.wins || 0}-${row.losses || 0}-${row.halves || 0}` : "—";
const pairKey = (players) => players.map((player) => player.id).sort().join("|");
const formatName = (format) => formatCode(format) === "BB" ? "Best Ball" : formatCode(format) === "SC" ? "Scramble" : "Singles";
const edgeLabel = (edge, a, b) => edge === "TEAM_A" ? a : edge === "TEAM_B" ? b : edge === "TIE" ? "Even" : "Unavailable";

function Metric({ label, value, detail }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function ConfidenceBadge({ value }) {
  const label = clean(value).toUpperCase() || "LOW";
  return <span className={styles.confidenceBadge} data-level={label.toLowerCase()}>{label}</span>;
}

function PlayerSelect({ players, value, onChange, exclude = "" }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select a Sandbagger</option>
    {players.filter((player) => player.id !== exclude).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
  </select>;
}

function PartnershipAnalyzer({ data }) {
  const [one, setOne] = useState(data.players[0]?.id || "");
  const [two, setTwo] = useState(data.players[1]?.id || "");
  const partnership = data.partnerships.find((row) => row.key === [one, two].sort().join("|"));
  const players = [data.players.find((row) => row.id === one), data.players.find((row) => row.id === two)].filter(Boolean);
  return <section className={styles.tool}>
    <header><p>Tool 02</p><h2>Partnership Analyzer</h2><span>Analyze two golfers only in matches where they played as teammates.</span></header>
    <div className={styles.selectGrid}><label>Player One<PlayerSelect players={data.players} value={one} exclude={two} onChange={setOne} /></label><label>Player Two<PlayerSelect players={data.players} value={two} exclude={one} onChange={setTwo} /></label></div>
    <div className={styles.identity}>{players.map((player) => <article key={player.id}><h3>{player.name}</h3><p>HCP {fmt(player.handicap)} · Rating {fmt(player.rating)}</p></article>)}</div>
    {!partnership ? <div className={styles.empty}>No eligible partnership history is recorded for this pairing.</div> : <>
      <div className={styles.metrics}>
        <Metric label="Overall Record" value={record(partnership.record)} detail={`${fmt(partnership.winPercentage, "%")} official win rate`} />
        <Metric label="Points Together" value={fmt(partnership.record.points)} />
        <Metric label="Years Together" value={partnership.yearsPlayedTogether} />
        <Metric label="Recorded Team Rounds" value={partnership.recordedTeamRounds || "—"} />
        <Metric label="Hole Differential" value={partnership.holeDifferential === null ? "—" : `${partnership.holeDifferential > 0 ? "+" : ""}${partnership.holeDifferential}`} />
        <Metric label="Birdies Together" value={fmt(partnership.birdies)} />
        <Metric label="Average Team Gross" value={fmt(partnership.averageTeamGross)} />
        <Metric label="Average Team Net" value={fmt(partnership.averageTeamNet)} />
        <Metric label="Front Nine Record" value={partnership.frontNineRecord ? record({ wins: partnership.frontNineRecord.won, losses: partnership.frontNineRecord.lost, halves: partnership.frontNineRecord.halved }) : "—"} />
        <Metric label="Back Nine Record" value={partnership.backNineRecord ? record({ wins: partnership.backNineRecord.won, losses: partnership.backNineRecord.lost, halves: partnership.backNineRecord.halved }) : "—"} />
        <Metric label="Closing Differential" value={partnership.closingDifferential === null ? "—" : `${partnership.closingDifferential > 0 ? "+" : ""}${partnership.closingDifferential}`} />
        <Metric label="Largest Lead" value={fmt(partnership.largestLead)} />
        <Metric label="Largest Comeback" value={fmt(partnership.largestComeback)} detail={`${partnership.confidence} confidence`} />
      </div>
      <div className={styles.formatGrid}>{partnership.formats.map((item) => <article key={item.format}><p>{formatName(item.format)}</p><h3>{record(item.record)}</h3><span>{fmt(item.winPercentage, "%")} win rate · {fmt(item.record.points)} points</span></article>)}</div>
      {(partnership.strengths.length > 0 || partnership.tendencies.length > 0) && <div className={styles.tags}>{[...partnership.strengths, ...partnership.tendencies].map((label) => <span key={label}>{label}</span>)}</div>}
      {!!partnership.timeline.length && <details className={styles.details}><summary>Partnership Timeline <b>⌄</b></summary><div>{partnership.timeline.map((item) => <article key={item.year}><strong>{item.year}</strong><span>{item.team?.name || "Historical team unavailable"}</span><small>{item.formats.map(formatName).join(" · ") || "Format unavailable"}</small></article>)}</div></details>}
      <div className={styles.analysis}><p>Official SBI Partnership Analysis</p><strong>{partnership.summary}</strong></div>
    </>}
  </section>;
}

const teamMetrics = [
  ["Average Handicap", "averageHandicap", "lower"],
  ["Average Rating", "averageRating", "higher"],
  ["Career Points", "careerPoints", "higher"],
  ["Championships", "championships", "higher"],
  ["Tournament Appearances", "appearances", "higher"],
  ["Official Win %", "winPercentage", "higher"],
  ["Hole Differential", "holeDifferential", "higher"],
  ["Birdies", "birdies", "higher"],
  ["Average Gross", "averageGross", "lower"],
  ["Average Net", "averageNet", "lower"],
  ["Closing Holes Won", "closingWon", "higher"],
];

function TeamComparison({ data }) {
  const [year, setYear] = useState(data.seasons[0]?.year || "");
  const season = data.seasons.find((row) => String(row.year) === String(year)) || data.seasons[0];
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const teamA = season?.teams.find((team) => team.id === teamAId) || season?.teams[0];
  const teamB = season?.teams.find((team) => team.id === teamBId && team.id !== teamA?.id) || season?.teams.find((team) => team.id !== teamA?.id);
  const edges = {
    scoring: comparisonEdge(teamA?.averageNet, teamB?.averageNet, "lower"),
    matchPlay: comparisonEdge(teamA?.holeDifferential, teamB?.holeDifferential),
    chemistry: comparisonEdge(teamA?.winPercentage, teamB?.winPercentage),
    closing: comparisonEdge(teamA?.closingWon, teamB?.closingWon),
  };
  const coverage = [teamA, teamB].some((team) => team && team.scoringCoverage < team.rosterSize)
    ? "Scorecard aggregates represent only eligible players with COMPLETE or VERIFIED rounds."
    : "";
  return <section className={styles.tool}>
    <header><p>Tool 03</p><h2>Team Comparison</h2><span>Compare historical rosters from the same tournament year.</span></header>
    <div className={styles.selectGrid}><label>Tournament Year<select value={year} onChange={(event) => { setYear(event.target.value); setTeamAId(""); setTeamBId(""); }}>{data.seasons.map((row) => <option key={row.year}>{row.year}</option>)}</select></label><label>Team A<select value={teamA?.id || ""} onChange={(event) => setTeamAId(event.target.value)}>{season?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Team B<select value={teamB?.id || ""} onChange={(event) => setTeamBId(event.target.value)}>{season?.teams.filter((team) => team.id !== teamA?.id).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
    {teamA && teamB && <>
      <div className={styles.versus}><h3>{teamA.name}</h3><b>VS</b><h3>{teamB.name}</h3></div>
      <div className={styles.compareRows}>{teamMetrics.map(([label, key, direction]) => {
        const edge = comparisonEdge(teamA[key], teamB[key], direction);
        return <div key={key}><span data-leads={edge === "TEAM_A"}>{fmt(teamA[key], key === "winPercentage" ? "%" : "")}</span><b>{label}<small>{edgeLabel(edge, teamA.name, teamB.name)}</small></b><span data-leads={edge === "TEAM_B"}>{fmt(teamB[key], key === "winPercentage" ? "%" : "")}</span></div>;
      })}</div>
      <div className={styles.edges}>{Object.entries(edges).map(([key, edge]) => <article key={key}><span>{key === "matchPlay" ? "Match Play" : key[0].toUpperCase() + key.slice(1)} Edge</span><strong>{edgeLabel(edge, teamA.name, teamB.name)}</strong></article>)}</div>
      {coverage && <p className={styles.note}>{coverage}</p>}
      <div className={styles.analysis}><p>Official SBI Team Analysis</p><strong>{deterministicTeamSummary(edges, teamA.name, teamB.name, coverage)}</strong></div>
    </>}
  </section>;
}

function annotatePairings(rows, partnershipMap) {
  return rows.map((row) => {
    const partnership = partnershipMap[pairKey(row.players)];
    const chemistryScore = partnership?.winPercentage ?? 50;
    const closingScore = partnership?.closingDifferential === null || partnership?.closingDifferential === undefined ? 50 : Math.max(0, Math.min(100, 50 + partnership.closingDifferential * 5));
    const confidence = partnership?.confidence || "LOW";
    const score = pairingScore({
      chemistry: chemistryScore,
      scoring: row.averageWinProbability,
      matchPlay: row.favorablePercentage,
      closing: closingScore,
      volatility: row.volatility,
      confidence,
    });
    return { ...row, chemistryScore, closingScore, confidence, confidenceScore: confidence === "HIGH" ? 100 : confidence === "MODERATE" ? 70 : 40, pairingScore: score };
  });
}

function LineupLab({ data }) {
  const sheets = data.sheets;
  const availableYears = useMemo(() => [...new Set((sheets.handicaps || []).map((row) => Number(pick(row, "Year"))).filter(Number.isFinite))].sort((a, b) => b - a), [sheets]);
  const [year, setYear] = useState(() => currentTournamentYear(sheets));
  const teams = useMemo(() => getTeamContext(sheets, year), [sheets, year]);
  const [format, setFormat] = useState("BB");
  const [side, setSide] = useState("team1");
  const [mode, setMode] = useState("best");
  const [locked, setLocked] = useState("");
  const [excluded, setExcluded] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const lineupRuntime = useMemo(() => buildTeamIntelligenceLineupRuntime({
    sheets,
    year,
    teams,
    historical: data.historical,
    partnershipPredictionMap: data.partnershipPredictionMap,
    headToHead: data.headToHead,
  }), [sheets, year, teams, data]);
  const optimizersByFormat = lineupRuntime.optimizersByFormat;
  const complete = lineupRuntime.isReady(format);
  const optimizer = lineupRuntime.optimizerFor(format);
  const partnershipMap = useMemo(() => Object.fromEntries(data.partnerships.map((row) => [row.key, row])), [data.partnerships]);
  const source = side === "team1" ? optimizer?.team1Pairings || [] : optimizer?.team2Pairings || [];
  const rows = useMemo(() => rankPairings(annotatePairings(source, partnershipMap).filter((row) =>
    (!locked || row.players.some((player) => player.id === locked)) &&
    (!excluded || row.players.every((player) => player.id !== excluded))
  ), mode), [source, partnershipMap, locked, excluded, mode]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const activeTeam = side === "team1" ? teams.team1 : teams.team2;
  const reasons = selected ? [
    selected.chemistryScore >= 60 && "Proven partnership chemistry",
    selected.favorablePercentage >= 60 && `Favorable against ${selected.favorablePercentage}% of opposing combinations`,
    selected.closingScore > 50 && "Positive closing-hole profile",
    `${selected.averageExpectedPoints.toFixed(2)} average expected points`,
  ].filter(Boolean).slice(0, 3) : [];
  const opponent = selected?.matchups.find((match) => match.id === opponentId) || selected?.toughestMatchup;
  const lineupPlans = useMemo(() => {
    const rowsFor = (code, rankingMode) => {
      const engine = optimizersByFormat[code];
      const candidates = side === "team1" ? engine?.team1Pairings || [] : engine?.team2Pairings || [];
      return rankPairings(annotatePairings(candidates, partnershipMap), rankingMode);
    };
    return buildLineupPlans({
      bestBall: rowsFor("BB", "best"),
      scramble: rowsFor("SC", "best"),
    });
  }, [optimizersByFormat, partnershipMap, side]);
  return <section className={styles.tool}>
    <header><p>Tool 01</p><h2>Lineup Lab</h2><span>Swap, lock, and compare pairings using the existing SBI prediction engine.</span></header>
    <div className={styles.selectGrid}>
      <label>Tournament Year<select value={year} onChange={(event) => { setYear(Number(event.target.value)); setLocked(""); setExcluded(""); }}>{availableYears.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Format<select value={format} onChange={(event) => { setFormat(event.target.value); setLocked(""); setExcluded(""); setSelectedId(""); }}><option value="BB">Best Ball</option><option value="SC">Scramble</option></select></label>
      <label>Team<select value={side} onChange={(event) => { setSide(event.target.value); setLocked(""); setExcluded(""); setSelectedId(""); }}><option value="team1">{teams.team1.name}</option><option value="team2">{teams.team2.name}</option></select></label>
      <label>Recommendation<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="best">Best Available</option><option value="safe">Safest Pair</option><option value="upside">Highest Upside</option><option value="chemistry">Strongest Chemistry</option><option value="closing">Best Closing Pair</option><option value="sleeper">Sleeper Pair</option></select></label>
      <label>Lock Player<select value={locked} onChange={(event) => setLocked(event.target.value)}><option value="">No player locked</option>{activeTeam.players.filter((player) => player.id !== excluded).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      <label>Exclude Player<select value={excluded} onChange={(event) => setExcluded(event.target.value)}><option value="">No player excluded</option>{activeTeam.players.filter((player) => player.id !== locked).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
    </div>
    {!complete ? <div className={styles.empty}>The assigned course, tee, rating, slope, and par must be available before Lineup Lab can calculate projections.</div> : !selected ? <div className={styles.empty}>No eligible lineup is available for these settings.</div> : <>
      <div className={styles.recommendation}>
        <p>Recommended {formatName(format)} Pair</p>
        <h3>{selected.label}</h3>
        <div><Metric label="Average Win" value={`${selected.averageWinProbability}%`} /><Metric label="Expected Points" value={selected.averageExpectedPoints.toFixed(2)} /><Metric label="Pairing Score" value={selected.pairingScore.overall} detail={chemistryGrade(selected.chemistryScore).grade} /><div className={`${styles.metric} ${styles.confidenceMetric}`}><span>Confidence</span><ConfidenceBadge value={selected.confidence} /></div></div>
      </div>
      {opponent && <div className={styles.opponentPick}><label>Opponent Pairing<select value={opponent.id} onChange={(event) => setOpponentId(event.target.value)}>{selected.matchups.map((match) => <option key={match.id} value={match.id}>{match.opponentLabel}</option>)}</select></label><div><Metric label="Projected Win" value={`${opponent.winProbability}%`} /><Metric label="Halve" value={`${opponent.halveProbability}%`} /><Metric label="Projected Loss" value={`${opponent.lossProbability}%`} /><Metric label="Expected Points" value={opponent.expectedPoints.toFixed(2)} /></div></div>}
      <div className={styles.why}><strong>Recommended because</strong>{reasons.map((reason) => <span key={reason}>• {reason}</span>)}<small>Watch: {selected.dangerousMatchups} dangerous counter-matchup{selected.dangerousMatchups === 1 ? "" : "s"}.</small></div>
      <div className={styles.partnerList}>{rows.slice(0, 8).map((row, index) => <button key={row.id} data-active={row.id === selected.id} onClick={() => setSelectedId(row.id)}><b>#{index + 1}</b><span><strong>{row.label}</strong><small>{row.favorableMatchups}/{row.opponentCount} favorable · {row.confidence} confidence</small></span><em>{row.averageWinProbability}%</em></button>)}</div>
      <details className={styles.details}><summary>Opponent-aware breakdown <b>⌄</b></summary><div className={styles.matchups}>{selected.matchups.map((match) => <article key={match.id}><strong title={match.opponentLabel}>{match.opponentLabel}</strong><span>{match.winProbability}% Win</span><span>{match.expectedPoints.toFixed(2)} Expected Points</span><ConfidenceBadge value={selected.confidence} /><small>{match.winProbability > match.lossProbability ? "Favorable edge" : match.winProbability < match.lossProbability ? "Opponent edge" : "Even matchup"}</small></article>)}</div></details>
      {!!lineupPlans.length && <details className={styles.details}><summary>Optimize Entire Team <b>⌄</b></summary><div className={styles.plans}>{lineupPlans.map((plan) => <article key={plan.id}><h4>{plan.label}</h4>{plan.slots.map((slot) => <div className={styles.planPair} key={slot.id}><span>Recommended {formatName(slot.format)} Pair</span><strong>{slot.label}</strong><small>Why: {slot.format === "BB" ? "Best available chemistry and matchup projection" : "Strongest team scoring and closing profile"}</small></div>)}<footer>{plan.projectedPoints.toFixed(2)} combined expected points <ConfidenceBadge value={plan.confidence} /></footer></article>)}</div></details>}
      <div className={styles.advisory}>Advisory only. Lineup Lab never writes recommendations to official Matches or lineup data.</div>
    </>}
  </section>;
}

function Rankings({ data }) {
  const eligible = data.partnerships.filter((row) => row.record.matches >= 2);
  const boards = [
    ["Best Historical Best Ball Pair", (row) => row.formats.find((item) => item.format === "BB")?.winPercentage],
    ["Best Historical Scramble Pair", (row) => row.formats.find((item) => item.format === "SC")?.winPercentage],
    ["Most Partnership Wins", (row) => row.record.wins],
    ["Best Team Hole Differential", (row) => row.holeDifferential],
    ["Best Closing Pair", (row) => row.closingDifferential],
    ["Most Proven Partnership", (row) => row.record.matches],
  ];
  return <section className={styles.tool}><header><p>Tool 04</p><h2>Historical Team Rankings</h2><span>Competition-ranked partnership records with a minimum two-match sample for rate leaderboards.</span></header><div className={styles.boards}>{boards.map(([label, value]) => {
    const rows = eligible.map((row) => ({ row, value: value(row) })).filter((item) => item.value !== null && item.value !== undefined).sort((a, b) => b.value - a.value);
    return <details key={label} className={styles.board}><summary><span>{label}</span><strong>{rows[0] ? `${rows[0].row.playerOne.name} + ${rows[0].row.playerTwo.name}` : "Unavailable"}</strong><b>⌄</b></summary><div>{rows.map((item, index) => <article key={item.row.key}><b>{index + 1}</b><span>{item.row.playerOne.name} + {item.row.playerTwo.name}<small>{item.row.record.matches} matches</small></span><strong>{fmt(item.value, label.includes("Historical") ? "%" : "")}</strong></article>)}</div></details>;
  })}</div></section>;
}

export default function TeamIntelligence({ initialData, loadError, initialTool = "lineup-lab" }) {
  const [tab, setTab] = useState(initialTool);
  useEffect(() => {
    const handlePopState = () => {
      const requested = new URLSearchParams(window.location.search).get("tool");
      if (["lineup-lab", "partnership-analyzer", "team-comparison", "historical-rankings"].includes(requested)) setTab(requested);
      else setTab("lineup-lab");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const selectTab = (key) => {
    setTab(key);
    const url = new URL(window.location.href);
    if (key === "lineup-lab") url.searchParams.delete("tool");
    else url.searchParams.set("tool", key);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  if (!initialData) return <section className={styles.shell}><div className={styles.empty}><h1>Team Intelligence unavailable</h1><p>{loadError}</p></div></section>;
  const tabs = [["lineup-lab", "Lineup Lab"], ["partnership-analyzer", "Partnership Analyzer"], ["team-comparison", "Team Comparison"], ["historical-rankings", "Historical Rankings"]];
  return <><section className={styles.hero}><p>War Room</p><h1>Team Intelligence</h1><span>Partnerships, team edges, and lineup decisions—built from the same SBI analytics behind Matchup Lab.</span></section><section className={styles.shell}><nav className={styles.tabs} aria-label="Team Intelligence tools">{tabs.map(([key, label]) => <button key={key} data-active={tab === key} onClick={() => selectTab(key)}>{label}</button>)}</nav>{tab === "lineup-lab" && <LineupLab data={initialData} />}{tab === "partnership-analyzer" && <PartnershipAnalyzer data={initialData} />}{tab === "team-comparison" && <TeamComparison data={initialData} />}{tab === "historical-rankings" && <Rankings data={initialData} />}</section></>;
}
