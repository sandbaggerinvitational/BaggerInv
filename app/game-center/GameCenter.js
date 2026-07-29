"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AssetImage from "../AssetImage";
import { courseLogo, teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { formatHandicap, formatPoints } from "../../lib/formatters";
import { liveProgressLabel } from "../../lib/game-center-display";
import styles from "./game-center.module.css";

const clean = (value) => String(value ?? "").trim();
const hasValue = (value) => value !== null && value !== undefined && clean(value) !== "";
const initials = (value) => clean(value || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const jsonScores = (value) => {
  try {
    const scores = JSON.parse(value || "[]");
    return Array.isArray(scores) ? scores : [];
  } catch {
    return [];
  }
};

function Logo({ filename, name, type = "team", size = "medium", tournamentYear }) {
  const fallbackTournament = tournamentLogo(`sandbagger-${tournamentYear}`);
  const src = type === "course" ? courseLogo(filename) : teamLogo(filename);
  return <span className={styles.logo} data-size={size} data-type={type}>
    <AssetImage
      src={src || fallbackTournament}
      alt={`${name} logo`}
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

function TeamPanel({ team, players, format, playingHcp, stroke, tournamentYear }) {
  const teamStroke = Number(stroke);
  return <section className={styles.teamPanel}>
    <Logo filename={team.logo} name={team.name} size="team" tournamentYear={tournamentYear} />
    <h3>{team.name}</h3>
    <div className={styles.players}>
      {players.map((player, index) => <span key={player.id || player.name || index}>
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

function teamMarker(name) {
  const words = clean(name).split(/\s+/).filter(Boolean);
  const meaningful = words.find((word) => !/^(the|a|an)$/i.test(word)) || words[0] || "T";
  return meaningful[0]?.toUpperCase() || "T";
}

function ResultSegments({ data }) {
  const format = clean(data.match.format || data.match.Format).toUpperCase();
  const options = format === "SI"
    ? [["overall", "Overall"]]
    : [["front", "Front"], ["back", "Back"], ["overall", "Overall"]];
  const [selected, setSelected] = useState(options[0][0]);
  const winners = {
    front: data.points.frontWinner,
    back: data.points.backWinner,
    overall: data.points.overallWinner,
  };
  const winner = winners[selected];
  const teamNames = data.display.teamNames;
  const totalPoints = hasValue(data.points.team1Points) && hasValue(data.points.team2Points)
    ? Number(data.points.team1Points) + Number(data.points.team2Points)
    : null;
  const pointValue = Number.isFinite(totalPoints)
    ? format === "SI" ? totalPoints : totalPoints / 3
    : null;

  return <section className={styles.results}>
    <div className={styles.segmented} role="tablist" aria-label="Match result segment">
      {options.map(([key, label]) => <button
        type="button"
        role="tab"
        aria-selected={selected === key}
        data-active={selected === key}
        onClick={() => setSelected(key)}
        key={key}
      >{label}</button>)}
    </div>
    <div className={styles.segmentResult} role="tabpanel">
      {winner ? <>
        <strong>{/halved/i.test(winner) ? "Halved" : winnerName(winner, teamNames)}</strong>
        {pointValue !== null ? <small>{/halved/i.test(winner)
          ? `${formatPoints(pointValue / 2)} Point${pointValue / 2 === 1 ? "" : "s"} Each`
          : `${formatPoints(pointValue)} Point${pointValue === 1 ? "" : "s"}`}</small> : null}
      </> : <strong>Result pending</strong>}
    </div>
    {data.points.team1Points !== null && data.points.team2Points !== null ? <div className={styles.matchPoints}>
      <h3>Match Total</h3>
      <div>
        <span><small>{teamNames[1]}</small><strong>{formatPoints(data.points.team1Points)}</strong></span>
        <span><small>{teamNames[2]}</small><strong>{formatPoints(data.points.team2Points)}</strong></span>
      </div>
    </div> : null}
  </section>;
}

function HoleTracker({ data, selected, onSelect, updatedHoles = [] }) {
  const current = Number(data.match.currentHole || data.match["Current Hole"] || data.stats.played || 1);
  const teamNames = data.display.teamNames;
  return <section className={styles.tracker}>
    <header><h2>Hole Tracker</h2><small>{data.stats.played} of 18 recorded</small></header>
    <div className={styles.holeGrid}>
      {data.holes.map((hole) => {
        const state = hole.winner === "Team 1" ? "team-one" : hole.winner === "Team 2" ? "team-two" : hole.winner === "Halved" ? "halved" : "unplayed";
        const label = hole.winner === "Team 1" ? teamMarker(teamNames[1]) : hole.winner === "Team 2" ? teamMarker(teamNames[2]) : hole.winner === "Halved" ? "½" : "—";
        const outcome = hole.winner === "Team 1" || hole.winner === "Team 2"
          ? `won by ${winnerName(hole.winner, teamNames)}`
          : hole.winner === "Halved" ? "halved" : "not played";
        return <button
          type="button"
          key={hole.number}
          data-state={state}
          data-current={hole.number === current ? "true" : undefined}
          data-newly-updated={updatedHoles.includes(hole.number) ? "true" : undefined}
          data-selected={hole.number === selected ? "true" : undefined}
          onClick={() => onSelect(hole.number)}
          aria-label={`Hole ${hole.number}, ${outcome}${hole.number === current ? ", current hole" : ""}`}
        ><small>{hole.number}</small><strong>{label}</strong></button>;
      })}
    </div>
  </section>;
}

function HoleDetails({ data, selected }) {
  const hole = data.holes.find((item) => item.number === selected);
  if (!hole) return null;
  const teamNames = data.display.teamNames;
  const team1Gross = jsonScores(hole.team1Gross);
  const team2Gross = jsonScores(hole.team2Gross);
  return <section className={styles.holeDetails} aria-label={`Hole ${selected} details`}>
    <header><span><small>Selected Hole</small><h2>Hole {selected}</h2></span><strong>{hole.par ? `Par ${hole.par}` : "Par TBA"}</strong></header>
    <div className={styles.holeMeta}>
      {hole.yardage ? <span><small>Yardage</small><strong>{hole.yardage}</strong></span> : null}
      {hole.strokeIndex ? <span><small>Stroke Index</small><strong>{hole.strokeIndex}</strong></span> : null}
      <span><small>Hole Result</small><strong>{winnerName(hole.winner, teamNames) || "Not played"}</strong></span>
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
  return <section className={styles.stats}>
    <header><span>Confirmed Scores</span><h2>Match Stats</h2></header>
    <div>
      <span><small>{teamNames[1]} holes won</small><strong>{data.stats.team1}</strong></span>
      <span><small>Halved</small><strong>{data.stats.halved}</strong></span>
      <span><small>{teamNames[2]} holes won</small><strong>{data.stats.team2}</strong></span>
      <span><small>Biggest lead</small><strong>{data.stats.biggestLead}</strong></span>
      <span><small>Lead changes</small><strong>{data.stats.leadChanges}</strong></span>
      <span><small>Remaining</small><strong>{data.stats.remaining}</strong></span>
    </div>
  </section>;
}

export default function GameCenter({ initialData, matchId, backTo }) {
  const [data, setData] = useState(initialData);
  const [selectedHole, setSelectedHole] = useState(Math.max(1, Number(initialData.match.currentHole || initialData.stats.played || 1)));
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
  const stateLabel = data.state === "final" ? "Final" : data.state === "live" ? "Live" : "Locked";
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
        body: JSON.stringify({ matchId }),
      });
      window.location.assign(response.ok ? "/score" : `/score?match=${encodeURIComponent(matchId)}`);
    } finally {
      setOpening(false);
    }
  };

  const finalResult = data.state === "final" ? data.result.toUpperCase() : "";
  const finalWinner = [teamNames[1], teamNames[2]].find((name) => finalResult.startsWith(clean(name).toUpperCase()));
  const finalText = finalWinner ? finalResult.slice(finalWinner.length).trim() : finalResult;
  const backHref = backTo === "my-match" ? "/score" : "/live";
  const backLabel = backTo === "my-match" ? "Back to My Match" : "Back to Tournament";
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
  const matchContext = roundPosition?.total
    ? `Round ${roundPosition.round} • Match ${roundPosition.index} of ${roundPosition.total}`
    : `Round ${data.match.round || data.match.Round}${matchNumber ? ` • Match ${matchNumber}` : ""}`;

  return <article className={styles.gameCenter}>
    <nav className={styles.matchNavigation} aria-label="Game Center match navigation">
      <Link className={styles.backLink} href={backHref}>‹ {backLabel}</Link>
      <span>
        {data.navigation?.previous ? <Link
          href={matchHref(data.navigation.previous)}
          aria-label={`Previous match: ${data.navigation.previous.label}`}
          aria-disabled={navigating}
          onClick={beginMatchNavigation}
        >‹ Previous Match</Link> : null}
        {data.navigation?.next ? <Link
          href={matchHref(data.navigation.next)}
          aria-label={`Next match: ${data.navigation.next.label}`}
          aria-disabled={navigating}
          onClick={beginMatchNavigation}
        >Next Match ›</Link> : null}
      </span>
    </nav>

    <section className={styles.matchIdentity}>
      <div><small aria-label={matchContext.replace(" • ", ", ")}>{matchContext}</small><h1>{data.match.formatName || data.display.formatName || format}</h1></div>
      <span data-state={data.state}>{stateLabel}</span>
      <div className={styles.identityCourse}>
        <Logo filename={course.logo || data.match.course?.logo} name={course.name} type="course" size="identity" tournamentYear={data.tournament.year} />
        <p><strong>{course.name}</strong>{courseLine ? <small>{courseLine}</small> : null}</p>
      </div>
    </section>

    <section className={styles.scoreboard} aria-label={`${teamNames[1]} versus ${teamNames[2]}. ${data.result}${data.state !== "final" && through ? ` through ${through}` : ""}`}>
      <div data-your-team={data.userTeamSide === 1 ? "true" : undefined}><Logo filename={data.display.teams[1].logo || data.tournament.teamOne.logo} name={teamNames[1]} size="score" tournamentYear={data.tournament.year} /><strong>{teamNames[1]}</strong>{data.userTeamSide === 1 ? <small className={styles.yourTeam} aria-label={`${teamNames[1]} is your team`}>Your Team</small> : null}</div>
      <span>
        {data.state === "final" && finalWinner ? <small>{finalWinner}</small> : null}
        <b>{data.state === "final" ? finalText || "FINAL" : data.result}</b>
        <em>{data.state === "final" ? "FINAL" : data.state === "live" ? progressLabel : "MATCH NOT STARTED"}</em>
      </span>
      <div data-your-team={data.userTeamSide === 2 ? "true" : undefined}><Logo filename={data.display.teams[2].logo || data.tournament.teamTwo.logo} name={teamNames[2]} size="score" tournamentYear={data.tournament.year} /><strong>{teamNames[2]}</strong>{data.userTeamSide === 2 ? <small className={styles.yourTeam} aria-label={`${teamNames[2]} is your team`}>Your Team</small> : null}</div>
    </section>

    <div className={styles.teamGrid}>
      <TeamPanel team={{ ...data.display.teams[1], logo: data.display.teams[1].logo || data.tournament.teamOne.logo }} players={data.match.team1Players || []} format={format} playingHcp={data.match.team1PlayingHcp} stroke={data.match.team1Stroke} tournamentYear={data.tournament.year} />
      <b aria-label="versus">VS</b>
      <TeamPanel team={{ ...data.display.teams[2], logo: data.display.teams[2].logo || data.tournament.teamTwo.logo }} players={data.match.team2Players || []} format={format} playingHcp={data.match.team2PlayingHcp} stroke={data.match.team2Stroke} tournamentYear={data.tournament.year} />
    </div>

    <section className={styles.actionPanel}>
      {data.state === "pre" ? <p><span aria-hidden="true">🔒</span> Scoring opens before {teeTime || "the scheduled tee time"}.</p> : null}
      {data.state === "live" ? <button type="button" disabled={opening} onClick={openScoring}>{opening ? "Opening…" : data.stats.played ? "Continue Scoring" : "Start Scoring"}</button> : null}
      {data.state === "final" ? <a href="#scorecard">View Final Scorecard</a> : null}
      <small>{updatedLabel}</small>
      {error ? <span className={styles.refreshError} role="status">{error} <button type="button" onClick={refresh}>Retry</button></span> : null}
    </section>

    <div id="scorecard" className={styles.scorecardSections}>
      <HoleTracker data={data} selected={selectedHole} onSelect={setSelectedHole} updatedHoles={updatedHoles} />
      <HoleDetails data={data} selected={selectedHole} />
    </div>
    <ResultSegments data={data} />
    <MatchStats data={data} />
    <CourseInformation data={data} />
    {data.state === "pre" && !data.stats.played ? <p className={styles.preMatchNote}>Hole results and match statistics will appear when scoring begins.</p> : null}
    {data.state === "final" ? <p className={styles.confirmed}>Scorecard confirmed{confirmedLabel ? ` • ${confirmedLabel}` : ""}{data.match.updatedBy || data.match["Updated By"] ? ` by ${data.match.updatedBy || data.match["Updated By"]}` : ""}.</p> : null}
  </article>;
}
