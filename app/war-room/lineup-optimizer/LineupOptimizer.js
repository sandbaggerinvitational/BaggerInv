"use client";
import { useMemo, useState } from "react";
import styles from "../war-room.module.css";
import { formatCode, pick, settingsMap } from "../../../lib/prediction-engine";
import { currentTournamentYear, getCourseOptions, getFormatCourse, getTeamContext, scorecardForTee } from "../../../lib/tournament-context";
import { optimizeLineups } from "../../../lib/lineup-optimizer";

const clean = (value) => String(value ?? "").trim();

export default function LineupOptimizer({ initialData, loadError }) {
  const sheets = initialData?.sheets || {};
  const [format, setFormat] = useState("BB");
  const [teeOverride, setTeeOverride] = useState("");
  const [view, setView] = useState("team1");
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
  const complete = tee && clean(scorecardValues.rating) && clean(scorecardValues.slope) && clean(scorecardValues.par);
  const optimizer = useMemo(() => {
    if (!hasRun || !complete) return null;
    return optimizeLineups({
      format,
      team1: teams.team1,
      team2: teams.team2,
      scorecard: scorecardValues,
      historical: initialData?.historical || {},
      partnerships: initialData?.partnerships || {},
      headToHead: initialData?.headToHead || {},
      settings: settingsMap(sheets.settings || []),
      limit: 10,
    });
  }, [hasRun, complete, format, teams, scorecardValues.rating, scorecardValues.slope, scorecardValues.par, initialData, sheets.settings]);

  const rows = view === "team1" ? optimizer?.team1Best : view === "team2" ? optimizer?.team2Best : optimizer?.closest;
  const formatLabel = formatCode(format) === "BB" ? "Best Ball" : formatCode(format) === "SC" ? "Scramble" : "Singles";

  if (!initialData) return <section className={styles.shell}><div className={styles.error}><h1>Lineup Optimizer</h1><p>{loadError || "Lineup data is unavailable."}</p></div></section>;

  return <>
    <section className={styles.hero}><p>War Room Strategy</p><h1>Lineup Optimizer</h1><span>Test every legal matchup before you make the call.</span></section>
    <section className={styles.shell}>
      <div className={styles.setupCard}>
        <div className={styles.sectionTitle}><span>01</span><div><p>Optimizer Setup</p><h2>Choose the format and tee</h2></div></div>
        <div className={styles.controlsThree}>
          <label>Format<select value={format} onChange={(event) => { setFormat(event.target.value); setTeeOverride(""); setHasRun(false); }}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label>
          <label>Course<div className={styles.readOnly}>{pick(course, "Course Name", "Course") || "No course assigned"}</div></label>
          <label>Tee<select value={tee} onChange={(event) => { setTeeOverride(event.target.value); setHasRun(false); }} disabled={!tees.length}>{tees.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
      </div>

      <div className={styles.optimizerCard}>
        <div className={styles.sectionTitle}><span>02</span><div><p>Lineup Optimizer</p><h2>Every legal {formatLabel.toLowerCase()} matchup</h2></div></div>
        {!hasRun ? <div className={styles.optimizerIntro}><p>Analyze every legal combination across the current {year} rosters using the same course handicaps and SBI prediction engine.</p><button type="button" disabled={!complete} onClick={() => setHasRun(true)}>Run lineup optimizer</button></div> : !optimizer ? <p>Calculating lineup combinations…</p> : <>
          <div className={styles.optimizerMeta}>{optimizer.matchupCount.toLocaleString()} legal matchups analyzed</div>
          <div className={styles.optimizerTabs}>
            <button data-active={view === "team1"} onClick={() => setView("team1")}>Best for {teams.team1.name}</button>
            <button data-active={view === "team2"} onClick={() => setView("team2")}>Best for {teams.team2.name}</button>
            <button data-active={view === "closest"} onClick={() => setView("closest")}>Closest battles</button>
          </div>
          <div className={styles.optimizerList}>{(rows || []).map((row, index) => <div key={row.id} className={styles.optimizerRow}>
            <b>#{index + 1}</b>
            <div className={styles.optimizerTeam}><span>{teams.team1.name}</span><strong>{row.team1Label}</strong></div>
            <div className={styles.vs}>vs</div>
            <div className={styles.optimizerTeam}><span>{teams.team2.name}</span><strong>{row.team2Label}</strong></div>
            <div className={styles.optimizerOdds}><strong><i>{row.prediction.teamA}%</i><em>{row.prediction.teamB}%</em></strong><span>{row.prediction.tie}% halve</span></div>
          </div>)}</div>
        </>}
      </div>
    </section>
  </>;
}
