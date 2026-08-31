"use client";

import { useEffect, useState } from "react";
import CmsManager from "./CmsManager";
import styles from "./scorecard-calibration.module.css";

const percent = (value) => Number.isFinite(value) ? `${value.toFixed(1)}%` : "Not enough data";
const score = (value) => Number.isFinite(value) ? value.toFixed(4) : "Not enough data";

export default function ScorecardCalibration({ secret, tournamentId, year, updatedBy, previewMode = false }) {
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("Building shadow calibration report…");

  function load() {
    setStatus("Building shadow calibration report…");
    fetch(`/api/admin/scorecard-calibration?tournament=${encodeURIComponent(tournamentId)}`, {
      headers: { "x-admin-secret": secret },
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load calibration.");
        return payload.data;
      })
      .then((data) => { setReport(data); setStatus(""); })
      .catch((error) => setStatus(error.message));
  }

  useEffect(load, [secret, tournamentId]);

  return <div className={styles.stack}>
    <section className={styles.intro}>
      <div><p>Shadow model</p><h2>Scorecard Calibration</h2><span>Measure Course Fit without changing any public prediction or published odds.</span></div>
      <div className={styles.safety}><strong>Public influence: OFF</strong><span>Calibration remains Admin-only even when the setting is enabled.</span></div>
    </section>

    {previewMode ? <CmsManager
      resource="prediction-settings"
      secret={secret}
      tournamentId={tournamentId}
      year={year}
      updatedBy={updatedBy}
      title="Prediction Settings"
      description="Configure the shadow scorecard category, cap, confidence, and sample-size thresholds. Changes do not affect public predictions in this phase."
    /> : <section className={styles.notice}>
      Production Prediction Settings are managed in the Supabase-native Director Console.
    </section>}

    {status ? <div className={styles.notice}>{status}</div> : report ? <>
      <section className={styles.summary}>
        <article><span>Eligible backtest matches</span><strong>{report.backtest.matches}</strong><small>{report.coverage.eligibleMatches} of {report.coverage.completedMatches} completed matches</small></article>
        <article><span>Current model accuracy</span><strong>{percent(report.backtest.currentAccuracy)}</strong><small>Favorite matched the recorded result</small></article>
        <article><span>Adjusted model accuracy</span><strong>{percent(report.backtest.adjustedAccuracy)}</strong><small>{report.backtest.accuracyChange >= 0 ? "+" : ""}{percent(report.backtest.accuracyChange)} change</small></article>
        <article><span>Current Brier score</span><strong>{score(report.backtest.currentBrier)}</strong><small>Lower is better</small></article>
        <article><span>Adjusted Brier score</span><strong>{score(report.backtest.adjustedBrier)}</strong><small>{report.backtest.brierChange >= 0 ? "+" : ""}{score(report.backtest.brierChange)} change</small></article>
      </section>

      <section className={styles.report}>
        <header><div><p>Prediction audit</p><h3>Current vs. scorecard-adjusted</h3></div><button type="button" onClick={load}>Refresh report</button></header>
        <div className={styles.tableWrap}><table>
          <thead><tr><th>Match</th><th>Existing</th><th>Course Fit</th><th>Adjusted</th><th>Confidence</th><th>Contributing factors</th></tr></thead>
          <tbody>{report.rows.map((row) => <tr key={row.matchId || `${row.year}-${row.round}-${row.sideA}`}>
            <td><strong>{row.sideA}</strong><span>vs. {row.sideB}</span><small>{row.year} · Round {row.round} · {row.format}<br />{row.course}{row.tee ? ` · ${row.tee}` : ""}</small></td>
            <td><b>{row.teamNames[0]} {percent(row.existing.teamA)}</b><span>{row.teamNames[1]} {percent(row.existing.teamB)}</span><small>Halve {percent(row.existing.tie)}</small></td>
            <td><b className={row.calibration.adjustment > 0 ? styles.positive : row.calibration.adjustment < 0 ? styles.negative : ""}>{row.calibration.adjustment >= 0 ? "+" : ""}{row.calibration.adjustment.toFixed(2)} pts</b><span>{row.calibration.eligible ? "Eligible" : "Held at zero"}</span><small>A: {row.calibration.sideA.holes} holes / {row.calibration.sideA.rounds} rounds<br />B: {row.calibration.sideB.holes} holes / {row.calibration.sideB.rounds} rounds</small></td>
            <td><b>{row.teamNames[0]} {percent(row.adjusted.teamA)}</b><span>{row.teamNames[1]} {percent(row.adjusted.teamB)}</span><small>Shadow calculation only</small></td>
            <td><b>{row.calibration.confidence}</b><span>{row.outcome ? `Recorded: ${row.outcome === "A" ? row.teamNames[0] : row.outcome === "B" ? row.teamNames[1] : "Halved"}` : "Not completed"}</span></td>
            <td><ul>{(row.calibration.factors.length ? row.calibration.factors : row.calibration.reasons).slice(0, 4).map((factor, index) => <li key={index}>{typeof factor === "string" ? factor : `${factor.side}: ${factor.detail}`}</li>)}</ul></td>
          </tr>)}</tbody>
        </table></div>
        {!report.rows.length ? <div className={styles.notice}>No matches could be calibrated for this tournament.</div> : null}
      </section>
    </> : null}
  </div>;
}
