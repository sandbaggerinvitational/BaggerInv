"use client";

import Link from "next/link";
import MatchStatusBlock from "../MatchStatusBlock";
import { useCallback, useEffect, useRef, useState } from "react";
import AssetImage from "../AssetImage";
import { courseLogo, teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { formatHandicap, formatStatusLabel } from "../../lib/formatters";
import { holeStory, liveProgressLabel, segmentMatchResult } from "../../lib/game-center-display";
import { runningMatchStatusAtHole } from "../../lib/scoring-experience";
import { grossScoresFromCell } from "../../lib/live-score-values";
import styles from "./game-center.module.css";

const clean = (value) => String(value ?? "").trim();
const hasValue = (value) => value !== null && value !== undefined && clean(value) !== "";
const initials = (value) => clean(value || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const jsonScores = grossScoresFromCell;

function Logo({ filename, name, type = "team", size = "medium", tournamentYear }) {
  const fallbackTournament = tournamentLogo(`sandbagger-${tournamentYear}`);
  const src = type === "course" ? courseLogo(filename) : teamLogo(filename);
  return <span className={styles.logo} data-size={size} data-type={type} aria-hidden={type === "team" ? "true" : undefined}>
    <AssetImage
      src={src || fallbackTournament}
      alt={type === "team" ? "" : `${name} logo`}
      className={styles.logoImage}
      fallbackClassName={styles.logoFallback}
      fallback={initials(name)}
      inferFallback={false}
    />
  </span>;
}

function playerMeta(player, format) {
  if (!player) return "";
  const values = [];
  if (hasValue(player.playingHcp)) values.push(`HCP ${formatHandicap(player.playingHcp)}`);
  if (format !== "SC" && hasValue(player.stroke)) {
    const strokes = Number(player.stroke);
    values.push(strokes === 0 ? "No strokes" : `+${strokes} stroke${strokes === 1 ? "" : "s"}`);
  }
  return values.join(" • ");
}

function TeamPanel({ team, players, format, playingHcp, stroke }) {
  const teamStroke = Number(stroke);
  return <section className={styles.teamPanel} aria-label={`${team.name} golfers`}>
    <div className={styles.players} role="list">
      {players.map((player, index) => <span role="listitem" key={player.id || player.name || index}>
        <strong>{player.name || "Player TBA"}</strong>
        {playerMeta(player, format) ? <small>{playerMeta(player, format)}</small> : null}
      </span>)}
    </div>
    {format === "SC" && hasValue(playingHcp) ? <div className={styles.teamHandicap}>
      <small>Team Playing Handicap: {formatHandicap(playingHcp)}</small>
      {Number.isFinite(teamStroke) && teamStroke > 0
        ? <strong>+{teamStroke} team stroke{teamStroke === 1 ? "" : "s"}</strong>
        : null}
    </div> : null}
  </section>;
}

function winnerName(winner, teamNames) {
  if (winner === "Team 1") return teamNames[1];
  if (winner === "Team 2") return teamNames[2];
  if (/halved/i.test(winner)) return "Halved";
  return "";
}

function MatchFlowIcon({ segment }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (segment === "front") return <svg {...common}><path d="M6 21V4"/><path d="M6 5h10l-2.5 3L16 11H6"/></svg>;
  if (segment === "back") return <svg {...common}><path d="M7 21V3"/><path d="M7 4h9l-2.2 3L16 10H7"/><path d="M3.5 21c0-1.7 3.8-3 8.5-3s8.5 1.3 8.5 3"/></svg>;
  return <svg {...common}><path d="M8 4h8v4.5a4 4 0 0 1-8 0Z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 12.5V17M8.5 21h7M9.5 17h5"/></svg>;
}

function teamMarker(name) {
  const words = clean(name).split(/\s+/).filter(Boolean);
  const meaningful = words.find((word) => !/^(the|a|an)$/i.test(word)) || words[0] || "T";
  return meaningful[0]?.toUpperCase() || "T";
}

function clinchingHole(data) {
  if (data.state !== "final") return 0;
  return Number(clean(data.finalSummary).match(/Hole\s+(\d+)/i)?.[1] || 0);
}

function initialSelectedHole(data) {
  return Math.max(1, clinchingHole(data) || Number(data.match.currentHole || data.stats.played || 1));
}

function ResultSegments({ data }) {
  const format = clean(data.match.format || data.match.Format).toUpperCase();
  const options = format === "SI"
    ? [["overall", "Overall"]]
    : [["front", "Front"], ["back", "Back"], ["overall", "Overall"]];
  const teamNames = data.display.teamNames;
  const ranges = { front: [1, 9], back: [10, 18], overall: [1, 18] };
  const segments = options.map(([key, label]) => {
    const [start, end] = ranges[key];
    return { key, label, ...segmentMatchResult(data.holes, start, end, teamNames, key === "overall" && data.state === "final" ? data.result : "") };
  });

  return <section className={styles.results} data-state={data.state} data-segments={options.length} aria-labelledby="match-flow-heading">
    <header className={styles.sectionHeading}><span>Match Flow</span><h2 id="match-flow-heading">{options.length === 1 ? "Overall Summary" : "Front • Back • Overall"}</h2></header>
    <div className={styles.segmentCards}>
      {segments.map((segment) => <article key={segment.key} aria-label={`${segment.label}: ${segment.team ? `${segment.team}, ` : ""}${segment.result}`}>
        <small><MatchFlowIcon segment={segment.key} />{segment.label}</small>
        <strong>{segment.team || (segment.result === "All Square" ? "Halved" : "—")}</strong>
        <b>{segment.result}</b>
      </article>)}
    </div>
    {data.state === "final" && data.finalSummary ? <p className={styles.finalSummary}>{data.finalSummary}</p> : null}
  </section>;
}

function compactTeam(value) {
  const name = clean(value).replace(/^the\s+/i, "");
  return name.split(/\s+and\s+/i)[0] || name;
}

function scoreValue(hole, side, type) {
  if (type === "net") return hole[`team${side}Net`] ?? "—";
  const values = jsonScores(hole[`team${side}Gross`]);
  return values.length ? values.join("/") : "—";
}

function GameCenterScorecard({ data }) {
  const teamNames = data.display.teamNames;
  return <details className={styles.officialScorecard}>
    <summary><span><small>Official Record</small><strong>Hole-by-Hole Scorecard</strong></span><b aria-hidden="true">⌄</b></summary>
    <div className={styles.scorecardBody}>
      {[data.holes.slice(0, 9), data.holes.slice(9)].map((nine, index) => <div className={styles.scorecardTable} role="table" aria-label={`${index ? "Back" : "Front"} nine scorecard`} key={index}>
        <div className={styles.scorecardRow} data-header="true" role="row"><strong role="columnheader">{index ? "Back" : "Front"}</strong>{nine.map((hole) => <b role="columnheader" key={hole.number}>{hole.number}</b>)}</div>
        {[1, 2].map((side) => <div className={styles.scorecardRow} role="row" key={`gross-${side}`}><strong role="rowheader">{compactTeam(teamNames[side])}<small>Gross</small></strong>{nine.map((hole) => <span key={hole.number}>{scoreValue(hole, side, "gross")}</span>)}</div>)}
        {[1, 2].map((side) => <div className={styles.scorecardRow} data-net="true" role="row" key={`net-${side}`}><strong role="rowheader">{compactTeam(teamNames[side])}<small>Net</small></strong>{nine.map((hole) => <span key={hole.number}>{scoreValue(hole, side, "net")}</span>)}</div>)}
        <div className={styles.scorecardRow} data-winner="true" role="row"><strong role="rowheader">Winner</strong>{nine.map((hole) => <span aria-label={`Hole ${hole.number}, ${winnerName(hole.winner, teamNames) || "not recorded"}`} key={hole.number}>{hole.winner === "Team 1" ? teamMarker(teamNames[1]) : hole.winner === "Team 2" ? teamMarker(teamNames[2]) : hole.winner === "Halved" ? "½" : "—"}</span>)}</div>
        <div className={styles.scorecardRow} data-running="true" role="row"><strong role="rowheader">Status</strong>{nine.map((hole) => { const status = hole.winner ? runningMatchStatusAtHole(data.holes.map((item) => ({ "Hole Number": item.number, "Hole Winner": item.winner })), hole.number, teamNames) : ""; return <span aria-label={`After hole ${hole.number}, ${status || "not recorded"}`} key={hole.number}>{status ? status.replace(`${teamNames[1]} `, "").replace(`${teamNames[2]} `, "") : "—"}</span>; })}</div>
      </div>)}
    </div>
  </details>;
}

function HoleTracker({ data, selected, onSelect, updatedHoles = [] }) {
  const current = Number(data.match.currentHole || data.match["Current Hole"] || data.stats.played || 1);
  const clinchHole = clinchingHole(data);
  const teamNames = data.display.teamNames;
  const railRef = useRef(null);
  useEffect(() => {
    const rail = railRef.current;
    const target = rail?.querySelector(`[data-hole="${selected}"]`);
    if (!rail || !target) return;
    const left = target.offsetLeft - ((rail.clientWidth - target.offsetWidth) / 2);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? "auto" : "smooth" });
  }, [selected]);
  return <section className={styles.tracker}>
    <header><h2>Hole Tracker</h2><small>{data.stats.played} of 18 recorded</small></header>
    <div className={styles.holeRailFrame}>
    <div className={styles.holeRail} ref={railRef}>
      {data.holes.map((hole) => {
        const state = hole.winner === "Team 1" ? "team-one" : hole.winner === "Team 2" ? "team-two" : hole.winner === "Halved" ? "halved" : "unplayed";
        const label = hole.winner === "Team 1" ? teamMarker(teamNames[1]) : hole.winner === "Team 2" ? teamMarker(teamNames[2]) : hole.winner === "Halved" ? "½" : "—";
        const outcome = hole.winner === "Team 1" || hole.winner === "Team 2"
          ? `won by ${winnerName(hole.winner, teamNames)}`
          : hole.winner === "Halved" ? "halved" : "not played";
        return <button
          type="button"
          key={hole.number}
          data-hole={hole.number}
          data-state={state}
          data-current={hole.number === current ? "true" : undefined}
          data-clinching={hole.number === clinchHole ? "true" : undefined}
          data-newly-updated={updatedHoles.includes(hole.number) ? "true" : undefined}
          data-selected={hole.number === selected ? "true" : undefined}
          onClick={() => onSelect(hole.number)}
          aria-label={`Hole ${hole.number}, ${outcome}${hole.number === clinchHole ? ", clinching hole" : ""}${hole.number === current ? ", current hole" : ""}`}
        ><small>{hole.number}</small><strong>{label}</strong></button>;
      })}
    </div>
    </div>
  </section>;
}

function HoleDetails({ data, selected }) {
  const hole = data.holes.find((item) => item.number === selected);
  if (!hole) return null;
  const teamNames = data.display.teamNames;
  const team1Gross = jsonScores(hole.team1Gross);
  const team2Gross = jsonScores(hole.team2Gross);
  const clinchHole = clinchingHole(data);
  const story = data.state === "final" && clinchHole && selected >= clinchHole
    ? selected === clinchHole ? data.finalSummary : `The match was already decided on Hole ${clinchHole}.`
    : holeStory(data.holes, selected, teamNames);
  return <section className={styles.holeDetails} aria-label={`Hole ${selected} details`}>
    <header><span><small>Selected Hole</small><h2>Hole {selected}</h2></span><strong>{hole.par ? `Par ${hole.par}` : "Par TBA"}</strong></header>
    <p className={styles.holeStory}>{story}</p>
    <div className={styles.holeFacts}>
      <span>{[hole.yardage ? `${hole.yardage} yards` : "", hole.strokeIndex ? `Stroke Index ${hole.strokeIndex}` : ""].filter(Boolean).join(" · ")}</span>
      <strong><small>Hole Result</small>{winnerName(hole.winner, teamNames) || "Not played"}</strong>
    </div>
    {hole.winner ? <div className={styles.holeScores}>
      <span><strong>{teamNames[1]}</strong><small>Gross {team1Gross.join(" / ") || "—"} • Net {hole.team1Net ?? "—"}</small></span>
      <span><strong>{teamNames[2]}</strong><small>Gross {team2Gross.join(" / ") || "—"} • Net {hole.team2Net ?? "—"}</small></span>
    </div> : <p>Scores will appear after this hole is confirmed.</p>}
  </section>;
}

function CourseInformation({ data }) {
  const course = data.display.course;
  const values = [
    ["Tees", course.tee ? `${course.tee} Tees` : ""],
    ["Yardage", course.yardage],
    ["Par", course.par],
    ["Rating", course.rating],
    ["Slope", course.slope],
  ].filter(([, value]) => hasValue(value));
  return <section className={styles.courseInfo}>
    <header>
      <Logo filename={course.logo || data.match.course?.logo} name={course.name} type="course" size="course" tournamentYear={data.tournament.year} />
      <span><small>Course Information</small><h2>{course.name}</h2></span>
    </header>
    {values.length ? <div>{values.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
      : <p>Detailed course statistics are not published yet.</p>}
  </section>;
}

function MatchStats({ data }) {
  if (!data.stats.played) return null;
  const teamNames = data.display.teamNames;
  const showRemaining = data.state !== "final" || Number(data.stats.remaining) > 0;
  return <section className={styles.stats} data-state={data.state}>
    <header><span>Confirmed Scores</span><h2>Match Stats</h2></header>
    <div className={styles.statsPrimary} aria-label="Hole results summary">
      <span><small>{teamNames[1]} holes won</small><strong>{data.stats.team1}</strong></span>
      <span><small>Halved</small><strong>{data.stats.halved}</strong></span>
      <span><small>{teamNames[2]} holes won</small><strong>{data.stats.team2}</strong></span>
    </div>
    <div className={styles.statsSecondary}>
      <span><small>Biggest lead</small><strong>{data.stats.biggestLead}</strong></span>
      <span><small>Lead changes</small><strong>{data.stats.leadChanges}</strong></span>
      {showRemaining ? <span><small>Remaining</small><strong>{data.stats.remaining}</strong></span> : null}
    </div>
  </section>;
}

export default function GameCenter({ initialData, matchId, backTo }) {
  const [data, setData] = useState(initialData);
  const [selectedHole, setSelectedHole] = useState(initialSelectedHole(initialData));
  const [updatedLabel, setUpdatedLabel] = useState("Updated just now");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [updatedHoles, setUpdatedHoles] = useState([]);
  const requestActive = useRef(false);
  const updateHighlightTimer = useRef();
  const dataRef = useRef(initialData);
  const teamNames = data.display.teamNames;
  const format = clean(data.match.format || data.match.Format).toUpperCase();
  const matchNumber = data.match.match || data.match.Match;
  const teeTime = data.match.teeTime || data.match["Tee Time"];
  const course = data.display.course;
  const stateLabel = formatStatusLabel(data.state === "pre" ? "Locked" : data.state);
  const through = Number(data.match.currentHole || data.match["Current Hole"] || data.stats.played || 0);
  const progressLabel = liveProgressLabel(data.state, through);

  const refresh = useCallback(async () => {
    if (requestActive.current || document.visibilityState === "hidden") return;
    requestActive.current = true;
    try {
      const response = await fetch(`/api/game-center/${encodeURIComponent(matchId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to refresh Game Center.");
      const newlyRecorded = payload.data.holes
        .filter((hole) => hole.winner && !dataRef.current.holes.find((prior) => prior.number === hole.number)?.winner)
        .map((hole) => hole.number);
      dataRef.current = payload.data;
      setData(payload.data);
      if (newlyRecorded.length) {
        setUpdatedHoles(newlyRecorded);
        clearTimeout(updateHighlightTimer.current);
        updateHighlightTimer.current = setTimeout(() => setUpdatedHoles([]), 550);
      }
      setUpdatedLabel("Updated just now");
      setError("");
    } catch (caught) {
      setError(caught.message);
    } finally {
      requestActive.current = false;
    }
  }, [matchId]);

  useEffect(() => {
    let timer;
    const start = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") {
        refresh();
        timer = setInterval(refresh, 45_000);
      }
    };
    const onFocus = () => refresh();
    start();
    document.addEventListener("visibilitychange", start);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setUpdatedLabel((label) => label === "Updated just now" ? "Updated less than a minute ago" : label), 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(updateHighlightTimer.current);
    };
  }, []);

  const openScoring = async () => {
    setOpening(true);
    try {
      const response = await fetch("/api/player-passport/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId, requestedAction: "START_SCORING" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "This scorecard is not available right now.");
      }
      window.location.assign("/score");
    } catch (caught) {
      setError(caught?.message || "This scorecard is not available right now.");
    } finally {
      setOpening(false);
    }
  };

  const displayResult = data.state === "pre" ? "" : clean(data.result).toUpperCase();
  const resultWinner = [teamNames[1], teamNames[2]].find((name) => displayResult.startsWith(clean(name).toUpperCase()));
  const resultText = resultWinner ? displayResult.slice(clean(resultWinner).length).trim() : displayResult;
  const leaderboardReturn = clean(backTo).startsWith("/live?view=leaderboards");
  const backHref = backTo === "home"
    ? "/home"
    : backTo === "tournament" ? "/live" : leaderboardReturn ? backTo : "/my-match";
  const backLabel = backTo === "home"
    ? "Back to Home"
    : backTo === "tournament" ? "Back to Tournament" : leaderboardReturn ? "Back to Leaderboards" : "Back to My Match";
  const courseLine = [course.tee ? `${course.tee} Tees` : "", teeTime].filter(Boolean).join(" • ");
  const confirmedAt = data.match.updatedAt || data.match["Updated At"];
  const confirmedLabel = confirmedAt ? new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: data.tournament.timeZone || "America/Chicago",
  }).format(new Date(confirmedAt)) : "";
  const matchHref = (destination) => destination
    ? `/game-center/${encodeURIComponent(destination.id)}?from=${encodeURIComponent(backTo)}`
    : "";
  const beginMatchNavigation = (event) => {
    if (navigating) {
      event.preventDefault();
      return;
    }
    setNavigating(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const roundPosition = data.navigation?.position;
  const roundNumber = data.match.round || data.match.Round || roundPosition?.round;
  const matchContext = `Round ${roundNumber}${matchNumber ? ` · Match ${matchNumber}` : ""}`;

  return <article className={styles.gameCenter}>
    <nav className={styles.matchNavigation} aria-label="Game Center match navigation">
      <Link className={styles.backLink} href={backHref}>‹ {backLabel}</Link>
      <span className={styles.matchNavigationGroup}>
        {data.navigation?.previous ? <Link
          href={matchHref(data.navigation.previous)}
          aria-label={`Previous match: ${data.navigation.previous.label}`}
          aria-disabled={navigating}
          onClick={beginMatchNavigation}
        >‹ <span className={styles.navigationFull}>Previous Match</span><span className={styles.navigationCompact}>Previous</span></Link> : null}
        {data.navigation?.next ? <Link
          href={matchHref(data.navigation.next)}
          aria-label={`Next match: ${data.navigation.next.label}`}
          aria-disabled={navigating}
          onClick={beginMatchNavigation}
        ><span className={styles.navigationFull}>Next Match</span><span className={styles.navigationCompact}>Next</span> ›</Link> : null}
      </span>
    </nav>

    <section className={styles.matchIdentity} aria-label={`${matchContext}, ${data.match.formatName || data.display.formatName || format}, ${course.name}`}>
      <Logo filename={course.logo || data.match.course?.logo} name={course.name} type="course" size="identity" tournamentYear={data.tournament.year} />
      <div><small>{matchContext}</small><h1>{data.match.formatName || data.display.formatName || format}</h1><p><strong>{course.name}</strong>{courseLine ? <span>{courseLine}</span> : null}</p></div>
    </section>

    <section className={styles.matchHero} data-state={data.state} aria-label="Match summary">
    <div className={styles.scoreboard} aria-label={`${teamNames[1]} versus ${teamNames[2]}. ${data.result}${data.state !== "final" && through ? ` through ${through}` : ""}`}>
      <div data-your-team={data.userTeamSide === 1 ? "true" : undefined}><Logo filename={data.display.teams[1].logo || data.tournament.teamOne.logo} name={teamNames[1]} size="score" tournamentYear={data.tournament.year} /><strong>{teamNames[1]}</strong>{data.userTeamSide === 1 ? <small className={styles.yourTeam} aria-label={`${teamNames[1]} is your team`}>Your Team</small> : null}</div>
      <MatchStatusBlock
        status={stateLabel}
        detail={resultWinner || ""}
        result={data.state === "pre" ? "" : resultText || (data.state === "final" ? "FINAL" : data.result)}
        meta={data.state === "live" ? progressLabel : ""}
        align="center"
        prominent
        tone="dark"
      />
      <div data-your-team={data.userTeamSide === 2 ? "true" : undefined}><Logo filename={data.display.teams[2].logo || data.tournament.teamTwo.logo} name={teamNames[2]} size="score" tournamentYear={data.tournament.year} /><strong>{teamNames[2]}</strong>{data.userTeamSide === 2 ? <small className={styles.yourTeam} aria-label={`${teamNames[2]} is your team`}>Your Team</small> : null}</div>
    </div>

    <div className={styles.teamGrid}>
      <TeamPanel team={data.display.teams[1]} players={data.match.team1Players || []} format={format} playingHcp={data.match.team1PlayingHcp} stroke={data.match.team1Stroke} />
      <b aria-label="versus">VS</b>
      <TeamPanel team={data.display.teams[2]} players={data.match.team2Players || []} format={format} playingHcp={data.match.team2PlayingHcp} stroke={data.match.team2Stroke} />
    </div>
    </section>

    <section className={styles.actionPanel}>
      {data.state === "pre" ? <p><span aria-hidden="true">🔒</span> Scoring opens before {teeTime || "the scheduled tee time"}.</p> : null}
      {data.state === "live" && data.userTeamSide ? <button type="button" disabled={opening} onClick={openScoring}>{opening ? "Opening…" : data.stats.played ? "Continue Scoring" : "Start Scoring"}</button> : null}
      {data.state === "live" && !data.userTeamSide ? <a href="#scorecard">View Scorecard</a> : null}
      {data.state === "final" ? <a href="#scorecard">Final Scorecard</a> : null}
      <small>{updatedLabel}</small>
      {error ? <span className={styles.refreshError} role="status">{error} <button type="button" onClick={refresh}>Retry</button></span> : null}
    </section>

    <div id="scorecard" className={styles.scorecardSections}>
      <HoleTracker data={data} selected={selectedHole} onSelect={setSelectedHole} updatedHoles={updatedHoles} />
      <HoleDetails data={data} selected={selectedHole} />
    </div>
    <ResultSegments data={data} />
    <GameCenterScorecard data={data} />
    <MatchStats data={data} />
    <CourseInformation data={data} />
    {data.state === "pre" && !data.stats.played ? <p className={styles.preMatchNote}>Hole results and match statistics will appear when scoring begins.</p> : null}
    {data.state === "final" ? <p className={styles.confirmed}>Scorecard confirmed{confirmedLabel ? ` • ${confirmedLabel}` : ""}{data.match.updatedBy || data.match["Updated By"] ? ` by ${data.match.updatedBy || data.match["Updated By"]}` : ""}.</p> : null}
  </article>;
}
