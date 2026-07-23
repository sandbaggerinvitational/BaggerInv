"use client";

import { useState } from "react";

export default function DraftAnalyticsSummary({ analytics, styles }) {
  const [summary, setSummary] = useState(analytics.historicalSummary);
  const [status, setStatus] = useState("idle");

  async function generate() {
    setStatus("loading");
    try {
      const response = await fetch("/api/draft-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: analytics.summary,
          topClasses: analytics.classes.slice(0, 5),
          topSteals: analytics.steals.slice(0, 5),
          captains: analytics.captains.slice(0, 5),
          trends: analytics.trends,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Review unavailable.");
      setSummary(payload.summary);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return <>
    <p>{summary}</p>
    <div className={styles.analystActions}>
      <button type="button" onClick={generate} disabled={status === "loading"}>
        {status === "loading" ? "Reviewing draft history…" : "Generate historical review"}
      </button>
      {status === "error" ? <small>The official historical summary remains available above.</small> : null}
    </div>
  </>;
}
