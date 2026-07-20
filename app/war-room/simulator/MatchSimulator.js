"use client";

import { useMemo, useState } from "react";
import styles from "../war-room.module.css";
import {
  allocateStrokes,
  courseHandicap,
  formatCode,
  pick,
  playingHandicaps,
  predict,
  settingsMap,
} from "../../../lib/prediction-engine";
import {
  currentTournamentYear,
  getCourseOptions,
  getFormatCourse,
  getFormatPointsAvailable,
  getTeamContext,
  holesForTee,
  scorecardForTee,
} from "../../../lib/tournament-context";
import { simulateMatch } from "../../../lib/match-simulator";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number.parseFloat(clean(value).replace(/[−–—]/g, "-").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

function ProbabilityRows({ probabilities, teamNames }) {
  const rows = [
    [teamNames[0], probabilities.teamA, "A"],
    ["Halved", probabilities.halve, "H"],
    [teamNames[1], probabilities.teamB, "B"],
  ];
  return <div className={styles.simProbabilityRows}>{rows.map(([label, value, side]) => <div key={side} data-side={side}>
    <span>{label}</span><div><i style={{ width: `${value}%` }} /></div><strong>{value.toFixed(1)}%</strong>
  </div>)}</div>;
}

export default function MatchSimulator({ initialData, loadError, initialSelection = {} }) {
  const sheets = initialData?.sheets || {};
  const initialFormat = ["BB", "SC", "SI"].includes(initialSelection.format) ? initialSelection.format : "BB";
  const [format, setFormat] = useState(initialFormat);
  const [selected, setSelected] = useState(initialSelection.players || []);
  const [teeOverride, setTeeOverride] = useState(initialSelection.tee || "");
  const [hasRun, setHasRun] = useState(false);

  const year = useMemo(() => currentTournamentYear(sheets), [sheets]);
  const teams = useMemo(() => getTeamContext(sheets, year), [sheets, year]);
  const course = useMemo(() => getFormatCourse(sheets, year, format), [sheets, year, format]);
  const scorecards = useMemo(() => getCourseOptions(sheets, course), [sheets, course]);
  const tees = scorecards.map((row) => clean(pick(row, "Tee", "Tee Name"))).filter(Boolean);
  const assignedTee = clean(pick(course, "Tee", "Tee Name"));
  const tee = tees.includes(teeOverride) ? teeOverride : tees.includes(assignedTee) ? assignedTee : tees[0] || assignedTee;
  const scorecard = scorecardForTee(scorecards, tee);
  const scorecardValues = {
    rating: pick(scorecard, "Course Rating", "Rating"),
    slope: pick(scorecard, "Slope Rating", "Slope"),
    par: pick(scorecard, "Par"),
  };
  const holes = holesForTee(sheets, course, tee);
  const code = formatCode(format);
  const pointsAvailable = getFormatPointsAvailable(sheets, year, code);
  const required = code === "SI" ? 2 : 4;
  const slotsPerTeam = code === "SI" ? 1 : 2;
  const chosen = Array.from({ length: required }, (_, index) => selected[index] || "");
  const details = chosen.map((id, index) => {
    const team = index < slotsPerTeam ? teams.team1 : teams.team2;
    const player = team.players.find((item) => item.id === id) || { id, name: "Select player", tournamentHandicap: null };
    const tournamentHandicap = number(player.tournamentHandicap, NaN);
    return {
      ...player,
      tournamentHandicap,
      courseHandicap: Number.isFinite(tournamentHandicap)
        ? courseHandicap(tournamentHandicap, scorecardValues.rating, scorecardValues.slope, scorecardValues.par)
        : null,
    };
  });
  const scorecardComplete = tee && clean(scorecardValues.rating) && clean(scorecardValues.slope) && clean(scorecardValues.par);
  const ready = details.length === required && details.every((player) => player.id && Number.isFinite(player.courseHandicap)) && scorecardComplete && holes.length === 18;
  const play = ready ? playingHandicaps(format, details.map((player) => player.courseHandicap)) : null;
  const prediction = ready ? predict({
    format,
    players: details,
    historical: initialData?.historical || {},
    partnership: initialData?.partnerships || {},
    headToHead: initialData?.headToHead || {},
    handicap: play,
    settings: settingsMap(sheets.settings || []),
    teamNames: [teams.team1.name, teams.team2.name],
    pointsAvailable,
  }) : null;
  const playerStrokeMaps = ready && code !== "SC" ? play.playerStrokes.map((strokes) => allocateStrokes(strokes, holes)) : null;
  const strokeMaps = ready ? code === "SC"
    ? { teamA: allocateStrokes(play.strokesA, holes), teamB: allocateStrokes(play.strokesB, holes) }
    : {
        teamA: holes.map((_, index) => Math.max(...playerStrokeMaps.slice(0, slotsPerTeam).map((map) => map[index] || 0))),
        teamB: holes.map((_, index) => Math.max(...playerStrokeMaps.slice(slotsPerTeam).map((map) => map[index] || 0))),
      } : null;
  const seed = `${year}|${pick(course, "Course ID")}|${tee}|${code}|${chosen.join("|")}|v1`;
  const simulation = useMemo(() => hasRun && ready ? simulateMatch({
    format: code,
    prediction,
    strokeMaps,
    teamNames: [teams.team1.name, teams.team2.name],
    iterations: 10_000,
    seed,
  }) : null, [hasRun, ready, code, prediction, strokeMaps, teams.team1.name, teams.team2.name, pointsAvailable, seed]);

  function resetSimulation() { setHasRun(false); }
  function updatePlayer(index, value) {
    const next = [...chosen]; next[index] = value; setSelected(next); resetSimulation();
  }

  if (!initialData) return <section className={styles.shell}><div className={styles.error}><h1>Match Simulator</h1><p>{loadError || "Simulation data is unavailable."}</p></div></section>;

  return <>
    <section className={styles.hero}><p>War Room Analytics</p><h1>Match Simulator</h1><span>Run 10,000 possible matches. Understand the range of outcomes.</span></section>
    <section className={styles.shell}>
      {loadError ? <div className={styles.notice}>{loadError}</div> : null}
      <div className={styles.setupCard}>
        <div className={styles.sectionTitle}><span>01</span><div><p>Simulation Setup</p><h2>Build the matchup</h2></div></div>
        <div className={styles.controlsThree}>
          <label>Format<select value={format} onChange={(event) => { setFormat(event.target.value); setSelected([]); setTeeOverride(""); resetSimulation(); }}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label>
          <label>Course<div className={styles.readOnly}>{pick(course, "Course Name", "Course") || "No course assigned"}</div></label>
          <label>Tee<select value={tee} onChange={(event) => { setTeeOverride(event.target.value); resetSimulation(); }} disabled={!tees.length}>{tees.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
        <div className={styles.matchupGrid}>{[teams.team1, teams.team2].map((team, side) => <div className={styles.teamPanel} key={team.side}>
          <div><span>{team.name}</span><strong>{code === "SI" ? "Singles Player" : "Pairing"}</strong></div>
          {Array.from({ length: slotsPerTeam }, (_, slot) => { const index = side * slotsPerTeam + slot; return <label key={index}>Player {slot + 1}<select value={chosen[index]} onChange={(event) => updatePlayer(index, event.target.value)}><option value="">Select player</option>{team.players.filter((player) => !chosen.includes(player.id) || chosen[index] === player.id).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>; })}
        </div>)}</div>
        <div className={styles.simRun}><button type="button" disabled={!ready} onClick={() => setHasRun(true)}>Run 10,000 simulations</button><small>{ready ? "Results remain stable until the matchup data changes." : holes.length !== 18 ? "A complete 18-hole scorecard is required." : "Select every player to continue."}</small></div>
      </div>

      {simulation ? <div className={styles.simResults}>
        <div className={styles.dashboardHeader}><span>02</span><div><p>SBI Match Simulation</p><h2>10,000 possible outcomes</h2></div><small>Seeded · Model v1</small></div>
        {code !== "SI" ? <div className={styles.simSegments}>{[["Front 9", "front"], ["Back 9", "back"], ["Overall — 18 Holes", "overall"]].map(([label, key]) => <section key={key}><h3>{label}</h3><ProbabilityRows probabilities={simulation.segmentProbabilities[key]} teamNames={[teams.team1.name, teams.team2.name]} /></section>)}</div> : <section className={styles.simOverall}><h3>Overall — 18 Holes</h3><ProbabilityRows probabilities={simulation.winProbability} teamNames={[teams.team1.name, teams.team2.name]} /></section>}

        <div className={styles.simSummaryGrid}>
          <section className={styles.simExpected}><span>Expected Points</span><h3>Out of {simulation.maximumPoints.toFixed(2)}</h3><div><b>{teams.team1.name}</b><strong>{simulation.expectedPoints.teamA.toFixed(2)}</strong></div><div><b>{teams.team2.name}</b><strong>{simulation.expectedPoints.teamB.toFixed(2)}</strong></div></section>
          <section className={styles.simLikely}><span>{code === "SI" ? "Most Likely Results" : "Most Likely Points Results"}</span><h3>Outcome distribution</h3>{simulation.likelyResults.map((row) => <div key={row.key}><b>{row.label}</b><i><em style={{ width: `${row.probability}%` }} /></i><strong>{row.probability.toFixed(1)}%</strong></div>)}</section>
        </div>
        <section className={styles.simVolatility}><span>How the overall match finishes</span><div><p><strong>{simulation.volatility.on18.toFixed(1)}%</strong><small>Decided on 18</small></p><p><strong>{simulation.volatility.before17.toFixed(1)}%</strong><small>Closed on 16 or 17</small></p><p><strong>{simulation.volatility.early.toFixed(1)}%</strong><small>Closed by 15</small></p><p><strong>{simulation.volatility.halved.toFixed(1)}%</strong><small>Halved</small></p></div></section>
      </div> : null}
    </section>
  </>;
}
