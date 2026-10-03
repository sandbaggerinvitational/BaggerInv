"use client";
import { useRef, useState } from "react";
import { ODDS_PHASES } from "../../../lib/tournament-odds.js";
import { canonicalDirectorOddsRequest, canonicalDirectorOddsCommand } from "../../../lib/canonical-director-odds-client.js";
export default function CanonicalDirectorOdds() {
  const [phase, setPhase] = useState(ODDS_PHASES[0]);
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null);
  const [unresolved, setUnresolved] = useState(false);
  const pending = useRef(null);
  async function act(input, retry = false) {
    setBusy(true); setMessage("");
    try {
      const stateBefore = input && !current ? await canonicalDirectorOddsRequest() : current;
      const command = input ? retry ? pending.current : canonicalDirectorOddsCommand(input, stateBefore) : null;
      if (command?.operationRequestId) { pending.current = command; setUnresolved(true); }
      const result = await canonicalDirectorOddsRequest(command);
      pending.current = null; setUnresolved(false);
      if (result.publicationCreated) setMessage("Publication confirmed.");
      else if (result.accepted) setMessage("Calculation queued. Refresh to check progress and review before publishing.");
      const state = input ? await canonicalDirectorOddsRequest() : result;
      setCurrent(state);
      setJobs(state.jobs);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function recover() {
    if (!pending.current) return;
    setBusy(true);
    try {
      const command = pending.current;
      const status = await canonicalDirectorOddsRequest({action:"status", originalAction:command.action,
        operationRequestId:command.operationRequestId, operationTournamentId:command.operationTournamentId});
      if (status.state === "COMMITTED") {
        pending.current = null; setUnresolved(false); setMessage("Operation confirmed.");
        const state = await canonicalDirectorOddsRequest(); setCurrent(state); setJobs(state.jobs);
      } else setMessage("Outcome is still unknown. Retry the same operation; do not start another.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section><h2>Championship Odds</h2>
    <p>Calculate from current tournament authority, then review the completed result before publishing.</p>
    <label>Milestone <select value={phase} disabled={busy} onChange={event => setPhase(event.target.value)}>{ODDS_PHASES.map(value => <option key={value}>{value}</option>)}</select></label>{" "}
    <button disabled={busy || unresolved} onClick={() => act({ action: "calculate", phase, iterations: 10000 })}>Prepare calculation</button>{" "}
    <button disabled={busy || unresolved} onClick={() => act(null)}>Refresh calculations</button>
    {unresolved ? <><button disabled={busy} onClick={recover}>Check pending operation</button>{" "}
      <button disabled={busy} onClick={() => act(pending.current, true)}>Retry same operation</button></> : null}
    {message ? <p role="status">{message}</p> : null}
    <ul>{jobs.map(job => <li key={job.job_id}><strong>{job.phase}</strong>{" — "}{job.status}
      {job.status === "SUCCEEDED" ? <><p>{(job.result?.teams || []).map(team => `${team.name}: ${team.probability}%`).join(" · ")}</p>
      <button disabled={busy || unresolved} onClick={() => act({ action: "publish", jobId: job.job_id, confirmPublication: true })}>Publish reviewed result</button></> : null}
    </li>)}</ul>
  </section>;
}
