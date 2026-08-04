"use client";

import { useState } from "react";
import { ODDS_PHASES } from "../../../lib/tournament-odds";
import styles from "../odds.module.css";
import { directorFetch } from "../../../lib/director-client-transaction";
import { projectionPresentationLabel } from "../../../lib/projection-phases";

const COUNTS = [10_000, 25_000, 50_000, 100_000];
const display = (value) => value === undefined || value === null || value === "" ? "—" : Array.isArray(value) ? value.join(", ") : String(value);

function DiagnosticsPanel({ diagnostics }) {
  if (!diagnostics) return null;
  const trace = diagnostics.trace || diagnostics;
  const stages = trace.stages || [];
  return <details className={styles.publishDiagnostics} open>
    <summary>{diagnostics.rootCause ? "Publication Failed" : "Publication Trace"}</summary>
    <div className={styles.traceStages}>{stages.map((stage) => <article key={stage.name} data-status={stage.status}>
      <span>{stage.name}</span><strong>{stage.status}</strong><time>{stage.elapsedMs === null ? "—" : `${stage.elapsedMs} ms`}</time>
      {stage.reason ? <p>{stage.reason}</p> : null}
    </article>)}</div>
    {diagnostics.rootCause ? <dl className={styles.traceFailure}>
      <div><dt>Stage</dt><dd>{display(diagnostics.stepReached)}</dd></div>
      <div><dt>Reason</dt><dd>{display(diagnostics.rootCause)}</dd></div>
      <div><dt>Worksheet</dt><dd>{display(diagnostics.worksheet)}</dd></div>
      <div><dt>Workbook operation</dt><dd>{display(diagnostics.workbookOperation)}</dd></div>
      <div><dt>Function</dt><dd>{display(diagnostics.function)}</dd></div>
      <div><dt>Exception</dt><dd>{display(diagnostics.exception)}</dd></div>
      <div><dt>Stack trace</dt><dd><pre>{display(diagnostics.stack)}</pre></dd></div>
    </dl> : null}
  </details>;
}

export default function OddsAdmin({ embedded = false, sharedSecret = "" }) {
  const [phase, setPhase] = useState(ODDS_PHASES[0]);
  const [iterations, setIterations] = useState(10_000);
  const [secret, setSecret] = useState(sharedSecret);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true); setPreview(null); setDiagnostics(null); setStatus(`Running ${iterations.toLocaleString()} tournament simulations…`);
    try {
      const response = await directorFetch("/api/odds/publish", { method: "POST", headers: { "content-type": "application/json", "x-odds-admin-secret": secret }, body: JSON.stringify({ phase, iterations }) });
      const body = await response.text();
      let data;
      try { data = JSON.parse(body); }
      catch {
        const error = new Error(`Publication endpoint returned an unreadable ${response.status} response.`);
        error.diagnostics = { stepReached: "Director response", rootCause: body || "Empty response body", worksheet: "None", workbookOperation: "Read publication response", function: "OddsAdmin.publish", exception: "ResponseParseError", stack: "Client response parsing failed.", trace: { stages: [] } };
        throw error;
      }
      if (!response.ok) {
        const error = new Error(data.error || "Publishing failed.");
        error.diagnostics = data.diagnostics || null;
        throw error;
      }
      setDiagnostics(data.diagnostics || null);
      setPreview(data.snapshot); setStatus(`${projectionPresentationLabel(phase)} published successfully. Website, PWA, Tournament Intelligence, Storylines, and Projection History now share this official snapshot.`);
    } catch (error) {
      setDiagnostics(error.diagnostics || { stepReached: "Director request", rootCause: error.message, worksheet: "None", workbookOperation: "Request publication", function: "OddsAdmin.publish", exception: error.name || "Error", stack: error.stack || "Unavailable", trace: { stages: [] } });
      setStatus("Championship projections could not be published. Please try again.");
    } finally { setBusy(false); }
  }

  return <section className={styles.admin}><p>Official Tournament Intelligence</p><h1>Championship Projections</h1><label>Official milestone<select value={phase} onChange={(event) => setPhase(event.target.value)}>{ODDS_PHASES.map((item) => <option value={item} key={item}>{projectionPresentationLabel(item)}</option>)}</select></label><label>Simulation count<select value={iterations} onChange={(event) => setIterations(Number(event.target.value))}>{COUNTS.map((count) => <option value={count} key={count}>{count.toLocaleString()}</option>)}</select></label>{!embedded ? <label>Publishing password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label> : null}<button disabled={!secret || busy} onClick={publish}>{busy ? "Generating official projection…" : "Generate & Publish Official Projection"}</button>{status ? <div>{status}</div> : null}<DiagnosticsPanel diagnostics={diagnostics} />{preview ? <div><span>Published Official Snapshot</span><strong>{projectionPresentationLabel(preview.phase)}</strong><br /><strong>{preview.teams?.[0]?.name}: {preview.teams?.[0]?.probability}%</strong><br /><strong>{preview.teams?.[1]?.name}: {preview.teams?.[1]?.probability}%</strong><br /><span>{preview.totalPointsAvailable} total tournament points modeled</span></div> : null}<small>The opening projection may be updated until a later official milestone is published. Every participant experience reads the same authoritative snapshot.</small></section>;
}
