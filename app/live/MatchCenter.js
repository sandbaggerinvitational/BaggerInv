"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetImage from "../AssetImage";
import PublicMatchCard from "../PublicMatchCard";
import { addTournamentRanks } from "../../lib/rankings";
import { courseLogo, teamLogo } from "../../lib/asset-paths";
import { formatPoints } from "../../lib/formatters";
import { clinchingScenariosEligible } from "../../lib/live-tournament";
import { MATCH_FILTERS, defaultMatchFilter, filterEmptyMessage, filterMatches, relativeUpdatedLabel } from "../../lib/live-match-ux";
import TournamentLeaderboard from "../TournamentLeaderboard";
import styles from "./live.module.css";

const hasValue = (value) => value !== null && value !== undefined && value !== "";
const initials = (name) => String(name ?? "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const pointsText = (value) => `${formatPoints(value)} point${Number(value) === 1 ? "" : "s"}`;

function Logo({ filename, name, type = "team", size = "medium" }) {
  const src = type === "course" ? courseLogo(filename) : teamLogo(filename);
  return <span className={styles.logoPlate} data-size={size}>
    <AssetImage src={src} alt={`${name} logo`} className={styles.logoImage} fallbackClassName={styles.logoFallback} fallback={initials(name)} inferFallback={false} />
  </span>;
}

function TeamIdentity({ team, side, score, compact = false }) {
  return <div className={styles.bannerTeam} data-side={side} data-compact={compact ? "true" : "false"}>
    <Logo filename={team.logo} name={team.name} size={compact ? "small" : "large"} />
    <div><strong>{team.name}</strong>{hasValue(score) ? <b>{formatPoints(score)}</b> : null}</div>
  </div>;
}

function ChampionshipBanner({ tournament }) {
  const state = tournament.state;
  const winner = state.championSide === 2 ? tournament.teamTwo : tournament.teamOne;
  const loser = state.championSide === 2 ? tournament.teamOne : tournament.teamTwo;
  return <section className={styles.championBanner}>
    <p>🏆 {tournament.year} Sandbagger Champions</p>
    <Logo filename={winner.logo} name={winner.name} size="champion" />
    <h2>{winner.name}</h2>
    <strong>Final Score · {formatPoints(tournament.teamOne.score)}–{formatPoints(tournament.teamTwo.score)}</strong>
    <span>over {loser.name}</span>
    <Link href={`/champions/${tournament.year}`}>View Final Results →</Link>
  </section>;
}

function LiveBanner({ tournament }) {
  const state = tournament.state;
  return <section className={styles.scoreboard}>
    <TeamIdentity team={tournament.teamOne} side="one" score={tournament.teamOne.score} />
    <div className={styles.scoreCenter}>
      <span>{tournament.status}</span>
      <strong>Tournament Score</strong>
      <b>Round {tournament.currentRound}</b>
    </div>
    <TeamIdentity team={tournament.teamTwo} side="two" score={tournament.teamTwo.score} />
    <div className={styles.statusRibbon}>
      <span>{state.liveMatches} live</span><i>•</i><span>{state.remainingMatches} matches remaining</span><i>•</i><span>{formatPoints(state.remainingPoints)} points remaining</span>
    </div>
  </section>;
}

function RoundNavigation({ rounds, activeRound, onSelect }) {
  return <div className={styles.roundNavigation} role="tablist" aria-label="Tournament rounds">
    {rounds.map((round) => <button type="button" role="tab" aria-selected={round.number === activeRound} className={round.number === activeRound ? styles.activeRound : ""} onClick={() => onSelect(round.number)} key={round.number}>
      <Logo filename={round.course.logo} name={round.course.name || round.label} type="course" size="round" />
      <span><b>{round.label}</b><strong>{round.format}</strong><small>{round.course.name || "Course to be announced"}</small><em data-status={round.status}>{round.status}</em></span>
    </button>)}
  </div>;
}

function RoundProgress({ round }) {
  const progress = round.progress;
  return <section className={styles.roundProgress}>
    <div><p>Round {round.number} Progress</p><h2>{progress.completedMatches} of {progress.totalMatches} matches complete</h2><span>{formatPoints(progress.decidedPoints)} of {formatPoints(progress.totalPoints)} points decided</span></div>
    <div className={styles.progressMeta}><strong>{progress.liveMatches} Live · {progress.completedMatches} Complete · {progress.scheduledMatches} Scheduled</strong><span>{round.status === "Complete" ? "Round Complete" : `${formatPoints(progress.remainingPoints)} round points remaining`}</span></div>
    <div className={styles.progressTrack}><i style={{ width: `${Math.min(100, progress.percent)}%` }} /></div>
  </section>;
}

function TournamentStats({ tournament, rounds, remainingByRound, momentum }) {
  const state = tournament.state;
  const scenariosEligible = clinchingScenariosEligible(rounds);
  const champion = state.championSide === 2 ? tournament.teamTwo : tournament.teamOne;
  return <>
    <div className={styles.statModules}>
      <section className={styles.statCard}>
        <p>{state.clinched ? "Tournament Clinched" : "Points to Clinch"}</p>
        {state.clinched ? <div className={styles.clinchedMini}><Logo filename={champion.logo} name={champion.name} size="small" /><strong>{champion.name}</strong><span>has secured the {tournament.year} Sandbagger Invitational.</span></div> : <div className={styles.clinchRows}>
          {[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; return <div key={team.name}><Logo filename={team.logo} name={team.name} size="small" /><span><strong>{team.name}</strong><small>Need {pointsText(side.pointsToClinch)} to clinch{side.pointsToTie > 0 ? ` · ${pointsText(side.pointsToTie)} guarantees a tie` : ""}</small></span></div>; })}
        </div>}
      </section>
      <section className={styles.statCard}>
        <p>Still on the course</p>
        <div className={styles.bigStats}><div><strong>{state.remainingMatches}</strong><span>Remaining Matches</span></div><div><strong>{formatPoints(state.remainingPoints)}</strong><span>Remaining Points</span></div></div>
        <div className={styles.roundBreakdown}>{remainingByRound.map((round) => <span key={round.number}>{round.label}: {round.matches} match{round.matches === 1 ? "" : "es"} · {formatPoints(round.points)} pts</span>)}</div>
      </section>
      {momentum ? <section className={styles.statCard}><p>Team Momentum</p><div className={styles.momentumRows}><div><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="small" /><span><strong>{tournament.teamOne.name}</strong><small>{momentum.teamOne}</small></span></div><div><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="small" /><span><strong>{tournament.teamTwo.name}</strong><small>{momentum.teamTwo}</small></span></div></div></section> : null}
    </div>
    {scenariosEligible ? <section className={styles.scenarios}>
      <p>{state.clinched ? "Tournament Clinched" : "Clinching Scenarios"}</p>
      {state.clinched ? <h2>{champion.name} have secured the {tournament.year} Sandbagger Invitational.</h2> : <div className={styles.scenarioGrid}>
        {[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; const opponent = index ? tournament.teamOne : tournament.teamTwo; return <div key={team.name}><strong>{team.name} clinch with:</strong><ul><li>{pointsText(side.pointsToClinch)} in Singles</li><li>Any combination of wins and halves totaling {formatPoints(side.pointsToClinch)} points</li><li>Hold {opponent.name} below {formatPoints(state.remainingPoints - side.pointsToClinch + 0.5)} additional points</li></ul></div>; })}
      </div>}
    </section> : null}
  </>;
}

function MobileInsight({ title, preview, children, highlighted = false }) {
  return <details className={styles.mobileInsight} data-highlighted={highlighted ? "true" : "false"}>
    <summary><span><strong>{title}</strong><small>{preview}</small></span><i aria-hidden="true">⌄</i></summary>
    <div>{children}</div>
  </details>;
}

function MobileTournamentInsights({ tournament, round, rounds, remainingByRound, momentum }) {
  if (!round) return null;
  const state = tournament.state;
  const scenariosEligible = clinchingScenariosEligible(rounds);
  const leaderSide = state.clinched
    ? (state.championSide === 2 ? state.teamTwo : state.teamOne)
    : (state.teamOne.pointsToClinch <= state.teamTwo.pointsToClinch ? state.teamOne : state.teamTwo);
  const leaderTeam = leaderSide === state.teamOne ? tournament.teamOne : tournament.teamTwo;
  return <div className={styles.mobileInsights}>
    <MobileInsight title="Round Progress" preview={`${round.progress.completedMatches} / ${round.progress.totalMatches} matches complete`}>
      <RoundProgress round={round} />
    </MobileInsight>
    <MobileInsight title={state.clinched ? "Tournament Clinched" : "Points to Clinch"} preview={state.clinched ? `${leaderTeam.name} have secured the Cup` : `${leaderTeam.name} need ${pointsText(leaderSide.pointsToClinch)} more`}>
      <div className={styles.clinchRows}>{[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; return <div key={team.name}><Logo filename={team.logo} name={team.name} size="small" /><span><strong>{team.name}</strong><small>{side.pointsToClinch > 0 ? `Need ${pointsText(side.pointsToClinch)} to clinch` : "At the clinching target"}</small></span></div>; })}</div>
    </MobileInsight>
    <MobileInsight title="Still On Course" preview={`${state.remainingMatches} match${state.remainingMatches === 1 ? "" : "es"} remain`}>
      <div className={styles.bigStats}><div><strong>{state.remainingMatches}</strong><span>Remaining Matches</span></div><div><strong>{formatPoints(state.remainingPoints)}</strong><span>Remaining Points</span></div></div>
      <div className={styles.roundBreakdown}>{remainingByRound.map((item) => <span key={item.number}>{item.label}: {item.matches} match{item.matches === 1 ? "" : "es"} · {formatPoints(item.points)} pts</span>)}</div>
    </MobileInsight>
    {momentum ? <MobileInsight title="Team Momentum" preview={momentum.teamOne}>
      <div className={styles.momentumRows}><div><Logo filename={tournament.teamOne.logo} name={tournament.teamOne.name} size="small" /><span><strong>{tournament.teamOne.name}</strong><small>{momentum.teamOne}</small></span></div><div><Logo filename={tournament.teamTwo.logo} name={tournament.teamTwo.name} size="small" /><span><strong>{tournament.teamTwo.name}</strong><small>{momentum.teamTwo}</small></span></div></div>
    </MobileInsight> : null}
    {scenariosEligible ? <MobileInsight title="Clinching Scenarios" preview={`${formatPoints(state.remainingPoints)} points remain`} highlighted>
      <div className={styles.scenarioGrid}>{[tournament.teamOne, tournament.teamTwo].map((team, index) => { const side = index ? state.teamTwo : state.teamOne; return <div key={team.name}><strong>{team.name} clinch with:</strong><ul><li>{pointsText(side.pointsToClinch)} in Singles</li><li>Any combination totaling {formatPoints(side.pointsToClinch)} points</li></ul></div>; })}</div>
    </MobileInsight> : null}
  </div>;
}

const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);

function IndividualScoreLeaderboard({ rows = [], round }) {
  const [sortBy, setSortBy] = useState("netToPar");
  const [expandedPlayer, setExpandedPlayer] = useState("");
  if (!rows.some((row) => row.holes)) return null;
  const filtered = rows
    .filter((row) => !round || Number(row.round) === Number(round))
    .sort((a, b) => Number(a[sortBy]) - Number(b[sortBy]) || a.name.localeCompare(b.name));
  const sortOptions = [
    ["netToPar", "Low net +/-"],
    ["grossToPar", "Low gross +/-"],
    ["net", "Low net"],
    ["gross", "Low gross"],
  ];
  return <section className={styles.liveScoreLeaderboard} id="individual-score-leaderboard">
    <div className={styles.leaderboardHeader}><div><span>Round {round} Live Scoring</span><h2>Individual Gross &amp; Net <em data-mode="live">Live</em></h2></div></div>
    <div className={styles.scoreSorts} aria-label="Sort leaderboard">
      {sortOptions.map(([key, label]) => <button type="button" data-active={sortBy === key ? "true" : undefined} onClick={() => setSortBy(key)} key={key}>{label}</button>)}
    </div>
    <div className={styles.liveScoreTable}>
      <div className={styles.liveScoreRow} data-header="true"><span>Rank</span><span>Player</span><span>Thru</span><span>Gross</span><span>Gross +/-</span><span>Net</span><span>Net +/-</span></div>
      {filtered.map((row, index) => <div className={styles.liveScoreRow} data-leader={index === 0 ? "true" : undefined} key={`${row.round}-${row.id}`}>
        <b className={styles.liveRank}>{index + 1}</b>
        <button className={styles.scorePlayerButton} type="button" aria-expanded={expandedPlayer === row.id} onClick={() => setExpandedPlayer((current) => current === row.id ? "" : row.id)}>
          <strong>{row.name}</strong><small>{row.holes} holes · {expandedPlayer === row.id ? "Hide card" : "View card"}</small>
        </button>
        <b className={styles.thru}>{row.holes >= 18 ? "F" : row.holes}</b><b>{row.gross}</b><b>{toPar(row.grossToPar)}</b><b>{row.net}</b><b>{toPar(row.netToPar)}</b>
        {expandedPlayer === row.id ? <PlayerLiveScorecard row={row} /> : null}
      </div>)}
    </div>
    <p>Scramble scores are credited to both golfers on the team. Totals include recorded holes in this round only.</p>
  </section>;
}

function PlayerLiveScorecard({ row }) {
  const byHole = new Map((row.scorecard || []).map((score) => [Number(score.hole), score]));
  return <div className={styles.playerLiveCard}>
    {[Array.from({ length: 9 }, (_, index) => index + 1), Array.from({ length: 9 }, (_, index) => index + 10)].map((holes, index) => <div className={styles.playerLiveNine} key={index}>
      <div><strong>{index ? "Back" : "Front"}</strong>{holes.map((hole) => <b key={hole}>{hole}</b>)}</div>
      <div><strong>Gross</strong>{holes.map((hole) => <span key={hole}>{byHole.get(hole)?.strokes ? <i>•</i> : null}{byHole.get(hole)?.gross ?? "—"}</span>)}</div>
      <div><strong>Net</strong>{holes.map((hole) => <span key={hole}>{byHole.get(hole)?.net ?? "—"}</span>)}</div>
      <div><strong>+/-</strong>{holes.map((hole) => <span key={hole}>{byHole.has(hole) ? toPar(byHole.get(hole).net - byHole.get(hole).par) : "—"}</span>)}</div>
    </div>)}
  </div>;
}

export default function MatchCenter({ initialData, loadError }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const tournament = data?.tournament;
  const rounds = data?.rounds || [];
  const [activeRound, setActiveRound] = useState(
    Number.isFinite(Number(tournament?.currentRound)) ? Number(tournament.currentRound) : rounds.at(-1)?.number || rounds[0]?.number
  );
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const [refreshState, setRefreshState] = useState("current");
  const refreshPromise = useRef(null);
  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    setRefreshState("refreshing");
    refreshPromise.current = fetch("/api/live", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to refresh live scores.");
        setData(payload.data);
        setLastRefresh(Date.now());
        setRefreshState("current");
      })
      .catch(() => setRefreshState("error"))
      .finally(() => { refreshPromise.current = null; });
    return refreshPromise.current;
  }, []);
  useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(poll, 30_000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);
  const active = rounds.find((round) => round.number === activeRound) || rounds[0];
  const [matchFilter, setMatchFilter] = useState(() => defaultMatchFilter(active?.matches || []));
  useEffect(() => { setMatchFilter(defaultMatchFilter(active?.matches || [])); }, [active?.number]);
  const visibleMatches = useMemo(() => filterMatches(active?.matches || [], matchFilter), [active, matchFilter]);
  const rankedLeaderboard = useMemo(() => addTournamentRanks(data?.leaderboard || [], "points"), [data]);
  const leaderboard = showLeaderboard ? rankedLeaderboard : rankedLeaderboard.slice(0, 5);
  const roundTotals = useMemo(() => (active?.matches || []).reduce((totals, match) => ({ teamOne: totals.teamOne + (match.team1Points || 0), teamTwo: totals.teamTwo + (match.team2Points || 0) }), { teamOne: 0, teamTwo: 0 }), [active]);

  if (!tournament) return <section className={styles.content}><div className={styles.errorBox}><h1>Live Match Center</h1><p>{loadError || "Live data is not available yet."}</p></div></section>;
  const championshipMode = tournament.state.complete && tournament.state.championSide;
  const isLive = ["live", "in progress", "in-progress"].includes(String(tournament.status).toLowerCase());
  const leaderboardTitle = championshipMode ? "Final Player Leaderboard" : isLive ? "Live Player Leaderboard" : "Player Standings";
  const focusedView = searchParams.get("view");
  const focusedRound = Number(searchParams.get("round")) || active?.number || 1;
  const focusedRoundData = rounds.find((round) => round.number === focusedRound) || active;
  const focusedPoints = addTournamentRanks(data?.roundLeaderboards?.[focusedRound] || [], "points");

  if (focusedView === "matchups") return <section className={styles.focusedLiveView}>
    <div className={styles.focusedHeader}><Link href="/score">← Back to scoring</Link><span>Round {focusedRound}</span><h1>Live Matchups</h1><p>The leading side is highlighted as scores are entered.</p></div>
    <div className={styles.focusedTournamentScore}>
      <span>Tournament score</span>
      <div><strong>{tournament.teamOne.name}</strong><b>{formatPoints(tournament.teamOne.score)}</b></div>
      <em>—</em>
      <div><b>{formatPoints(tournament.teamTwo.score)}</b><strong>{tournament.teamTwo.name}</strong></div>
    </div>
    {focusedRoundData ? <div className={styles.matchGrid}>{focusedRoundData.matches.map((match) => <PublicMatchCard match={match} round={focusedRoundData} tournament={tournament} key={match.id} />)}</div> : null}
  </section>;
  if (focusedView === "scores") return <section className={styles.focusedLiveView}>
    <div className={styles.focusedHeader}><Link href="/score">← Back to scoring</Link><span>Round {focusedRound}</span><h1>Gross &amp; Net Leaderboard</h1></div>
    <IndividualScoreLeaderboard rows={data?.scoreLeaderboard || []} round={focusedRound} />
  </section>;
  if (focusedView === "points") return <section className={styles.focusedLiveView}>
    <div className={styles.focusedHeader}><Link href="/score">← Back to scoring</Link><span>Round {focusedRound}</span><h1>Individual Points &amp; Records</h1></div>
    <TournamentLeaderboard rows={focusedPoints} emptyMessage="No points have been decided in this round yet." />
  </section>;

  return <>
    <section className={styles.hero}><div><p className={styles.eyebrow}>{tournament.status}</p><h1>Match Center</h1><p>{tournament.year} Sandbagger Invitational{tournament.location ? ` · ${tournament.location}` : ""}</p>{tournament.liveMessage ? <div className={styles.liveMessage}>{tournament.liveMessage}</div> : null}</div></section>
    {championshipMode ? <ChampionshipBanner tournament={tournament} /> : <LiveBanner tournament={tournament} />}
    <section className={styles.content}>
      <div className={styles.liveControls}>
        <div className={styles.freshness} data-state={refreshState} role="status" aria-live="polite">
          <span aria-hidden="true" />
          <strong>{refreshState === "refreshing" ? "Refreshing" : refreshState === "error" ? "Unable to refresh" : "Up to date"}</strong>
          <small>{relativeUpdatedLabel(lastRefresh, clock)}</small>
        </div>
        <button type="button" className={styles.refreshButton} onClick={refresh} disabled={refreshState === "refreshing"} aria-label="Refresh live scores">
          {refreshState === "refreshing" ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {active ? <section id="live-matchups">
        <div className={styles.matchFilters} role="tablist" aria-label="Filter matches by status">
          {MATCH_FILTERS.map(([value, label]) => <button type="button" role="tab" aria-selected={matchFilter === value} onClick={() => setMatchFilter(value)} key={value}>{label}<span>{value === "all" ? active.matches.length : filterMatches(active.matches, value).length}</span></button>)}
        </div>
        <div className={styles.roundHeader}><div><span>{active.format}</span><h2>{active.label}</h2><p>{active.course.name}{active.course.tee ? ` · ${active.course.tee} tees` : ""}</p></div><div className={styles.roundTotals}><span>Round Points</span><strong>{formatPoints(roundTotals.teamOne)} – {formatPoints(roundTotals.teamTwo)}</strong></div></div>
        {visibleMatches.length ? <div className={styles.matchGrid}>{visibleMatches.map((match) => <PublicMatchCard match={match} round={active} tournament={tournament} key={match.id} />)}</div> : <div className={styles.emptyState}><strong>{filterEmptyMessage(matchFilter, active)}</strong><span>Choose another filter or check back after the next official update.</span></div>}
      </section> : null}
      {rounds.length ? <div className={styles.roundSelectorSection}><span>Browse rounds</span><RoundNavigation rounds={rounds} activeRound={active?.number} onSelect={setActiveRound} /></div> : null}
      <div className={styles.desktopInsights}>{active ? <RoundProgress round={active} /> : null}<TournamentStats tournament={tournament} rounds={rounds} remainingByRound={data?.remainingByRound || []} momentum={data?.momentum} /></div>
      <MobileTournamentInsights tournament={tournament} round={active} rounds={rounds} remainingByRound={data?.remainingByRound || []} momentum={data?.momentum} />
      <IndividualScoreLeaderboard rows={data?.scoreLeaderboard || []} round={active?.number} />
      {rankedLeaderboard.length ? <section id="individual-points-leaderboard"><div className={styles.leaderboardHeader}><div><span>Individual Leaders</span><h2>{leaderboardTitle} {isLive || championshipMode ? <em data-mode={championshipMode ? "final" : "live"}>{championshipMode ? "Final" : "Live"}</em> : null}</h2></div></div>
        <TournamentLeaderboard rows={leaderboard} />
        {rankedLeaderboard.length > 5 ? <button className={styles.leaderboardToggle} type="button" onClick={() => setShowLeaderboard((value) => !value)}>{showLeaderboard ? "Show Top Five" : "View Full Leaderboard →"}</button> : null}</section> : null}
      {loadError ? <p className={styles.testNote}>{loadError}</p> : null}
    </section>
  </>;
}
