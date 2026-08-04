"use client";

import { useState } from "react";
import { ODDS_PHASES } from "../../../lib/tournament-odds";
import styles from "../odds.module.css";
import { directorFetch } from "../../../lib/director-client-transaction";
import { projectionPresentationLabel } from "../../../lib/projection-phases";

const COUNTS = [10_000, 25_000, 50_000, 100_000];

export default function OddsAdmin({ embedded = false, sharedSecret = "" }) {
  const [phase, setPhase] = useState(ODDS_PHASES[0]);
  const [iterations, setIterations] = useState(10_000);
  const [secret, setSecret] = useState(sharedSecret);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true); setPreview(null); setStatus(`Running ${iterations.toLocaleString()} tournament simulations…`);
    try {
      const response = await directorFetch("/api/odds/publish", { method: "POST", headers: { "content-type": "application/json", "x-odds-admin-secret": secret }, body: JSON.stringify({ phase, iterations }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Publishing failed.");
      setPreview(data.snapshot); setStatus(`${projectionPresentationLabel(phase)} published successfully. Website, PWA, Tournament Intelligence, Storylines, and Projection History now share this official snapshot.`);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  return <section className={styles.admin}><p>Official Tournament Intelligence</p><h1>Championship Projections</h1><label>Official milestone<select value={phase} onChange={(event) => setPhase(event.target.value)}>{ODDS_PHASES.map((item) => <option value={item} key={item}>{projectionPresentationLabel(item)}</option>)}</select></label><label>Simulation count<select value={iterations} onChange={(event) => setIterations(Number(event.target.value))}>{COUNTS.map((count) => <option value={count} key={count}>{count.toLocaleString()}</option>)}</select></label>{!embedded ? <label>Publishing password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label> : null}<button disabled={!secret || busy} onClick={publish}>{busy ? "Generating official projection…" : "Generate & Publish Official Projection"}</button>{status ? <div>{status}</div> : null}{preview ? <div><span>Published Official Snapshot</span><strong>{projectionPresentationLabel(preview.phase)}</strong><br /><strong>{preview.teams?.[0]?.name}: {preview.teams?.[0]?.probability}%</strong><br /><strong>{preview.teams?.[1]?.name}: {preview.teams?.[1]?.probability}%</strong><br /><span>{preview.totalPointsAvailable} total tournament points modeled</span></div> : null}<small>The opening projection may be updated until a later official milestone is published. Every participant experience reads the same authoritative snapshot.</small></section>;
}
