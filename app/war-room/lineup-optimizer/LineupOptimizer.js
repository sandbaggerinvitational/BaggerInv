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
  const [sortMode, setSortMode] = useState("overall");
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
    });
  }, [hasRun, complete, format, teams, scorecardValues.rating, scorecardValues.slope, scorecardValues.par, initialData, sheets.settings]);

  const rows = useMemo(() => {
    const source = view === "team1" ? optimizer?.team1Pairings : optimizer?.team2Pairings;
    const sorted = [...(source || [])];
    if (sortMode === "safe") sorted.sort((a,b) => b.worstCaseExpectedPoints-a.worstCaseExpectedPoints || b.worstCaseWinProbability-a.worstCaseWinProbability);
    else if (sortMode === "upside") sorted.sort((a,b) => b.bestCaseWinProbability-a.bestCaseWinProbability || b.averageExpectedPoints-a.averageExpectedPoints);
    else if (sortMode === "volatile") sorted.sort((a,b) => b.volatility-a.volatility || b.bestCaseWinProbability-a.bestCaseWinProbability);
    else sorted.sort((a,b) => b.averageExpectedPoints-a.averageExpectedPoints || b.averageWinProbability-a.averageWinProbability);
    return sorted;
  }, [optimizer, view, sortMode]);
  const formatLabel = formatCode(format) === "BB" ? "Best Ball" : formatCode(format) === "SC" ? "Scramble" : "Singles";

  if (!initialData) return <section className={styles.shell}><div className={styles.error}><h1>Lineup Optimizer</h1><p>{loadError || "Lineup data is unavailable."}</p></div></section>;

  return <>
    <section className={styles.hero}><p>War Room Strategy</p><h1>Lineup Optimizer</h1><span>Find the pairing that holds up no matter who the opponent sends out.</span></section>
    <section className={styles.shell}>
      <div className={styles.setupCard}>
        <div className={styles.sectionTitle}><span>01</span><div><p>Optimizer Setup</p><h2>Choose the format and tee</h2></div></div>
        <div className={styles.controlsThree}>
          <label>Format<select value={format} onChange={(event) => { setFormat(event.target.value); setTeeOverride(""); setHasRun(false); }}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label>
          <label>Course<input value={pick(course, "Course Name", "Course") || "No course assigned"} readOnly /></label>
          <label>Tee<select value={tee} onChange={(event) => { setTeeOverride(event.target.value); setHasRun(false); }} disabled={!tees.length}>{tees.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
      </div>

      <div className={styles.optimizerCard}>
        <div className={styles.sectionTitle}><span>02</span><div><p>Lineup Optimizer</p><h2>Best Pairings to Send Out</h2><small>Ranked against every possible opponent combination.</small></div></div>
        {!hasRun ? <div className={styles.optimizerIntro}><p>Analyze every legal combination across the current {year} rosters using the same course handicaps and SBI prediction engine.</p><button type="button" disabled={!complete} onClick={() => setHasRun(true)}>Run lineup optimizer</button></div> : !optimizer ? <p>Calculating lineup combinations…</p> : <>
          <div className={styles.optimizerMeta}>{optimizer.matchupCount.toLocaleString()} head-to-head outcomes analyzed across {optimizer.pairingCount} legal {formatLabel.toLowerCase()} options</div>
          <div className={styles.optimizerTabs}>
            <button data-active={view === "team1"} onClick={() => setView("team1")}>{teams.team1.name}</button>
            <button data-active={view === "team2"} onClick={() => setView("team2")}>{teams.team2.name}</button>
          </div>
          <div className={styles.optimizerSort}><span>Rank by</span>{[["overall","Best Overall"],["safe","Safest / Most Counter-Proof"],["upside","Highest Upside"],["volatile","Most Volatile"]].map(([key,label])=><button key={key} data-active={sortMode===key} onClick={()=>setSortMode(key)}>{label}</button>)}</div>
          <div className={styles.pairingList}>{rows.map((row, index) => <details key={row.id} className={styles.pairingRow}>
            <summary>
              <b>#{index + 1}</b><div className={styles.pairingName}><span>{view === "team1" ? teams.team1.name : teams.team2.name}</span><strong>{row.label}</strong><small>{row.favorableMatchups} of {row.opponentCount} favorable · {row.dangerousMatchups} dangerous counters</small></div>
              <div className={styles.pairingMetric}><span>Avg. Expected</span><strong>{row.averageExpectedPoints.toFixed(2)}</strong><small>of 3 points</small></div>
              <div className={styles.pairingMetric}><span>Avg. W / H / L</span><strong>{row.averageWinProbability}%</strong><small>{row.averageHalveProbability}% / {row.averageLossProbability}%</small></div>
              <div className={styles.pairingMetric}><span>Worst Case</span><strong>{row.worstCaseWinProbability}%</strong><small>{row.worstCaseExpectedPoints.toFixed(2)} expected</small></div>
              <div className={styles.pairingMetric}><span>Upside</span><strong>{row.bestCaseWinProbability}%</strong><small>{row.volatility} volatility</small></div><i>⌄</i>
            </summary>
            <div className={styles.pairingBreakdown}>
              <div className={styles.counterCards}><article><span>Best Matchup</span><strong>{row.bestMatchup.opponentLabel}</strong><b>{row.bestMatchup.winProbability}% win · {row.bestMatchup.expectedPoints.toFixed(2)} pts</b></article><article><span>Toughest Matchup</span><strong>{row.toughestMatchup.opponentLabel}</strong><b>{row.toughestMatchup.winProbability}% win · {row.toughestMatchup.expectedPoints.toFixed(2)} pts</b></article><article><span>Counter-Proof Rating</span><strong>{row.favorablePercentage}% favorable</strong><b>{row.dangerousMatchups} dangerous matchups</b></article></div>
              <div className={styles.opponentTable}><div><b>Possible opponent</b><b>Win</b><b>Halve</b><b>Loss</b><b>Expected</b></div>{row.matchups.map(match=><div key={match.id}><strong>{match.opponentLabel}</strong><span>{match.winProbability}%</span><span>{match.halveProbability}%</span><span>{match.lossProbability}%</span><b>{match.expectedPoints.toFixed(2)}</b></div>)}</div>
            </div>
          </details>)}</div>
        </>}
      </div>
    </section>
  </>;
}
