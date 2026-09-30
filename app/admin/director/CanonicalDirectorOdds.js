"use client";
import { useState } from "react";
import { ODDS_PHASES } from "../../../lib/tournament-odds.js";
import { canonicalDirectorOddsRequest } from "../../../lib/canonical-director-odds-client.js";
export default function CanonicalDirectorOdds() {
  const [phase, setPhase] = useState(ODDS_PHASES[0]);
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(input) {
    setBusy(true); setMessage("");
    try {
      const result = await canonicalDirectorOddsRequest(input);
      if (result.publicationCreated) setMessage("Publication confirmed.");
      else if (result.accepted) setMessage("Calculation queued. Refresh to check progress and review before publishing.");
      const state = input ? await canonicalDirectorOddsRequest() : result;
      setJobs(state.jobs);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section><h2>Championship Odds</h2>
    <p>Calculate from current tournament authority, then review the completed result before publishing.</p>
    <label>Milestone <select value={phase} disabled={busy} onChange={event => setPhase(event.target.value)}>{ODDS_PHASES.map(value => <option key={value}>{value}</option>)}</select></label>{" "}
    <button disabled={busy} onClick={() => act({ action: "calculate", phase, iterations: 10000 })}>Prepare calculation</button>{" "}
    <button disabled={busy} onClick={() => act(null)}>Refresh calculations</button>
    {message ? <p role="status">{message}</p> : null}
    <ul>{jobs.map(job => <li key={job.job_id}><strong>{job.phase}</strong>{" — "}{job.status}
      {job.status === "SUCCEEDED" ? <><p>{(job.result?.teams || []).map(team => `${team.name}: ${team.probability}%`).join(" · ")}</p>
      <button disabled={busy} onClick={() => act({ action: "publish", jobId: job.job_id, confirmPublication: true })}>Publish reviewed result</button></> : null}
    </li>)}</ul>
  </section>;
}
