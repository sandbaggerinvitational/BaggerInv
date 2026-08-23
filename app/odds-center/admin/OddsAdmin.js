"use client";

import { useEffect, useState } from "react";
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
      <div><dt>Request</dt><dd><pre>{display(diagnostics.requestPayload)}</pre></dd></div>
      <div><dt>HTTP status</dt><dd>{display(diagnostics.httpStatus)}</dd></div>
      <div><dt>Response body</dt><dd><pre>{display(diagnostics.responseBody)}</pre></dd></div>
      <div><dt>Stack trace</dt><dd><pre>{display(diagnostics.stack)}</pre></dd></div>
    </dl> : null}
  </details>;
}

export default function OddsAdmin({ embedded = false, sharedSecret = "", directorAuthorized = false, initialPhase = "", publicationReady = true, regenerationPhases = [], previewMode = false, onPublished }) {
  const [phase, setPhase] = useState(ODDS_PHASES.includes(initialPhase) ? initialPhase : ODDS_PHASES[0]);
  const [iterations, setIterations] = useState(10_000);
  const [secret, setSecret] = useState(sharedSecret);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [calculationJob, setCalculationJob] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ODDS_PHASES.includes(initialPhase)) setPhase(initialPhase); }, [initialPhase]);
  const selectablePhases = ODDS_PHASES.filter((item) => item === initialPhase || regenerationPhases.includes(item));
  const regeneration = regenerationPhases.includes(phase);

  async function waitForCalculation(jobId) {
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      const response = await directorFetch(`/api/odds/calculations?job=${encodeURIComponent(jobId)}`, { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Calculation status could not be read.");
      const job = data.jobs?.[0];
      if (!job) throw new Error("The durable calculation job is unavailable.");
      const completed = Number(job.completed_iterations || 0).toLocaleString();
      const total = Number(job.total_iterations || 0).toLocaleString();
      setStatus(`${job.status === "RETRYABLE" ? "Resuming" : "Calculating"} ${completed} of ${total} iterations · ${Number(job.checkpoint_count || 0)} verified checkpoints. You may close this page.`);
      if (job.status === "SUCCEEDED") { setCalculationJob(job); setStatus(`${total} deterministic iterations complete · ready for Director publication.`); return job; }
      if (["FAILED", "SUPERSEDED"].includes(job.status)) throw new Error(job.last_error_safe || `Calculation ${job.status.toLowerCase()}.`);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("The calculation is still running. Reopen this tool to continue monitoring it.");
  }

  async function prepareCalculation() {
    setBusy(true); setPreview(null); setDiagnostics(null); setCalculationJob(null);
    setStatus(`Requesting a durable ${iterations.toLocaleString()}-iteration calculation…`);
    try {
      const response = await directorFetch("/api/odds/calculations", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request", phase, iterations }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Calculation could not be requested.");
      await waitForCalculation(data.jobId);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  async function refreshSupabaseInputs() {
    setBusy(true); setStatus("Versioning Championship Odds inputs…"); setDiagnostics(null);
    try {
      const response = await directorFetch("/api/odds/inputs", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Odds inputs could not be refreshed.");
      const verificationResponse = await directorFetch("/api/odds/inputs", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify-current", phase: "Round 3 Pairings Announced", iterations: 10_000 }) });
      const verification = await verificationResponse.json();
      if (!verificationResponse.ok) throw new Error(verification.error || "Odds input parity could not be verified.");
      setStatus(verification.parity?.pass
        ? `${data.projection?.changed ? "Championship Odds inputs versioned" : "Championship Odds inputs unchanged"} · current milestone exact parity verified.`
        : "Championship Odds inputs were versioned, but current milestone parity requires review.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setPreview(null); setDiagnostics(null); setStatus(`Running ${iterations.toLocaleString()} tournament simulations…`);
    const endpoint = previewMode ? "/api/odds/publish-preview" : "/api/odds/publish";
    const requestPayload = { phase, iterations, ...(previewMode ? { jobId: calculationJob?.job_id } : {}) };
    const requestBody = JSON.stringify(requestPayload);
    const requestStack = new Error("Championship Projection request initiated").stack;
    try {
      if (!ODDS_PHASES.includes(phase)) throw new TypeError(`Unsupported Championship Projection milestone: ${phase}`);
      console.info("Championship Projection request", { endpoint, method: "POST", payload: requestPayload });
      const headers = { "content-type": "application/json" };
      if (secret) headers["x-odds-admin-secret"] = secret;
      const response = await directorFetch(endpoint, { method: "POST", credentials: "same-origin", headers, body: requestBody });
      const body = await response.text();
      console.info("Championship Projection response", { endpoint, status: response.status, body });
      let data;
      try { data = JSON.parse(body); }
      catch {
        const error = new Error(`Publication endpoint returned an unreadable ${response.status} response.`);
        error.diagnostics = { stepReached: "Director response", rootCause: body || "Empty response body", worksheet: "None", workbookOperation: "Read publication response", function: "OddsAdmin.publish", exception: "ResponseParseError", requestPayload: requestBody, httpStatus: response.status, responseBody: body || "Empty response body", stack: error.stack || requestStack, trace: { stages: [] } };
        throw error;
      }
      if (!response.ok) {
        const error = new Error(data.error || "Publishing failed.");
        error.diagnostics = { ...(data.diagnostics || {}), stepReached: data.diagnostics?.stepReached || "Director response", rootCause: data.diagnostics?.rootCause || data.error || "Publishing failed.", function: data.diagnostics?.function || "OddsAdmin.publish", exception: data.diagnostics?.exception || error.name, requestPayload: requestBody, httpStatus: response.status, responseBody: body, stack: data.diagnostics?.stack || error.stack || requestStack, trace: data.diagnostics?.trace || { stages: [] } };
        throw error;
      }
      setDiagnostics(data.diagnostics || null);
      setPreview(data.snapshot); setCalculationJob(null); setStatus(`${projectionPresentationLabel(phase)} published successfully. Website, PWA, Tournament Intelligence, Storylines, and Projection History now share this official snapshot.`); onPublished?.(data.snapshot);
    } catch (error) {
      const clientDiagnostics = error.diagnostics || { stepReached: "Director request", rootCause: error.message, worksheet: "None", workbookOperation: "Request publication", function: "OddsAdmin.publish", exception: error.name || "Error", requestPayload: requestBody, httpStatus: "No response received", responseBody: "No response body received", stack: error.stack || requestStack, trace: { stages: [] } };
      console.error("Championship Projection client failure", clientDiagnostics);
      setDiagnostics(clientDiagnostics);
      setStatus("Championship projections could not be published. Please try again.");
    } finally { setBusy(false); }
  }

  const resetCalculation = () => setCalculationJob(null);
  const action = previewMode && !calculationJob ? prepareCalculation : publish;
  const actionLabel = busy ? (previewMode ? "Calculation continues safely in the background…" : "Generating official projection…")
    : calculationJob ? (regeneration ? "Publish Completed Regeneration" : "Publish Completed Official Projection")
      : previewMode ? "Prepare Official Projection" : regeneration ? "Regenerate Official Projection" : "Generate & Publish Official Projection";
  return <section className={styles.admin}><p>Official Tournament Intelligence</p><h1>Championship Projections</h1>{previewMode ? <button type="button" disabled={busy} onClick={refreshSupabaseInputs}>Verify Supabase Odds Inputs</button> : null}{regenerationPhases.length ? <div><strong>Preview Regeneration</strong><br /><span>Choose a published milestone to replace it using the current engine.</span></div> : null}<label>Official milestone{directorAuthorized && selectablePhases.length <= 1 ? <strong>{projectionPresentationLabel(phase)}</strong> : <select value={phase} onChange={(event) => { setPhase(event.target.value); resetCalculation(); }}>{(directorAuthorized ? selectablePhases : ODDS_PHASES).map((item) => <option value={item} key={item}>{projectionPresentationLabel(item)}{regenerationPhases.includes(item) ? " · Regenerate" : ""}</option>)}</select>}</label><label>Simulation count<select value={iterations} onChange={(event) => { setIterations(Number(event.target.value)); resetCalculation(); }}>{COUNTS.map((count) => <option value={count} key={count}>{count.toLocaleString()}</option>)}</select></label>{!embedded ? <label>Publishing password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label> : null}<button disabled={(!publicationReady && !regeneration) || (!secret && !directorAuthorized) || busy} onClick={action}>{actionLabel}</button>{status ? <div>{status}</div> : null}<DiagnosticsPanel diagnostics={diagnostics} />{preview ? <div><span>Published Official Snapshot</span><strong>{projectionPresentationLabel(preview.phase)}</strong><br /><strong>{preview.teams?.[0]?.name}: {preview.teams?.[0]?.probability}%</strong><br /><strong>{preview.teams?.[1]?.name}: {preview.teams?.[1]?.probability}%</strong><br /><span>{preview.totalPointsAvailable} total tournament points modeled</span></div> : null}<small>Long calculations continue on a durable server job after this page closes. A completed result remains separate from publication until the Director explicitly publishes it.</small></section>;
}
