"use client";

import { useState } from "react";
import styles from "./draft.module.css";

export default function DraftAnalysisSummary({ analysis, year }) {
  const [summary, setSummary] = useState(analysis.summary);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/draft-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          year,
          state: analysis.state,
          projectionSource: analysis.source,
          projectedFavorite: {
            team: analysis.projectedFavorite.team.name,
            probability: analysis.projectedFavorite.probability,
          },
          leader: {
            team: analysis.leader.team.name,
            points: analysis.leader.points,
          },
          value: analysis.value,
          reach: analysis.reach,
          grades: analysis.grades.map((row) => ({
            captain: row.captain?.name || row.team.name,
            team: row.team.name,
            grade: row.grade,
            score: row.score,
            points: row.points,
            averageDvs: row.averageDvs,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to generate the draft review.");
      setSummary(payload.summary);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p>{summary}</p>
      <div className={styles.analystActions}>
        <button type="button" disabled={busy} onClick={generate}>
          {busy ? "Reviewing the draft…" : "Generate analyst review"}
        </button>
        <small>Official SBI analysis from the draft and tournament numbers above.</small>
      </div>
      {status ? <div className={styles.analystError}>{status}</div> : null}
    </>
  );
}
