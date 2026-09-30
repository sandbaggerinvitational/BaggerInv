"use client";

import { useCallback, useEffect, useState } from "react";
import { productionMatchControlActions } from "../../../lib/match-control-actions.js";
import styles from "./production-director.module.css";

const ACTIONS = Object.freeze({
  "mark-live": ["Mark Live", "The match becomes Live. Scoring lock and participant access remain unchanged."],
  "scoring-lock": ["Lock Scoring", "Scoring is locked and participant scoring access is revoked."],
  "scoring-unlock": ["Unlock Scoring", "Scoring is unlocked and participant scoring access is activated."],
  "access-activate": ["Activate Access", "Existing participant scoring permissions become active. The scoring lock does not change."],
  "access-revoke": ["Revoke Access", "Participant scoring access is revoked. The scoring lock does not change."],
});

export default function CanonicalDirectorMatchControls({ transport }) {
  const [matches, setMatches] = useState([]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await transport.controlRead();
      if (!Array.isArray(data?.matches)) throw new Error("The current match state did not verify.");
      setMatches(data.matches); setReady(true);
    } catch (error) { setReady(false); setMessage(error.message || "Match controls are temporarily unavailable."); }
  }, [transport]);
  useEffect(() => { load(); }, [load]);
  const review = (action, match) => {
    setPending({ action, match, operationRequestId: globalThis.crypto.randomUUID() });
    setUncertain(false); setMessage("");
  };
  const commit = async () => {
    if (!pending || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await transport.controlRequest(pending.action, {
        match_id: pending.match.matchId,
        expected_match_revision: pending.match.matchRevision,
        expected_permission_revision: pending.match.permissionRevision,
        operationRequestId: pending.operationRequestId,
      });
      if (result?.receipt?.ok !== true) throw new Error("The canonical operation is not confirmed. Retry the same review.");
      setPending(null); setUncertain(false);
      setMessage(`${ACTIONS[pending.action][0]} confirmed at match revision ${result.receipt.match_revision}.`);
      await load();
    } catch (error) {
      const knownRejection = error.outcome === "NOT_COMMITTED";
      setUncertain(!knownRejection);
      setMessage(error.message || "The operation could not be confirmed. Retry this same review.");
      if (knownRejection) { setPending(null); await load(); }
    } finally { setBusy(false); }
  };
  return <section className={styles.panel}>
    <header><h2>Match Controls</h2><p>Review each change against the current match and scoring permissions.</p></header>
    {!ready ? <button type="button" disabled={busy} onClick={load}>Refresh Current State</button> : null}
    {message ? <p role="status">{message}</p> : null}
    {matches.map(match => <article className={styles.matchCard} key={match.matchId}>
      <h3>Round {match.roundNumber} · Match {match.matchNumber || match.matchId}</h3>
      <p>{match.status} · Scoring {match.scoringLocked ? "locked" : "unlocked"} · Access {match.accessState}</p>
      <div>{productionMatchControlActions(match).filter(action => ACTIONS[action]).map(action =>
        <button type="button" key={action} disabled={!ready || busy || Boolean(pending)} onClick={() => review(action, match)}>{ACTIONS[action][0]}</button>)}</div>
      {match.status === "UPCOMING" && !match.scoringReady ? <p>Complete setup and prepare the current scoring context before marking this match Live.</p> : null}
    </article>)}
    {pending ? <section className={styles.confirmation} aria-labelledby="canonical-match-confirm">
      <h3 id="canonical-match-confirm">{ACTIONS[pending.action][0]} · {pending.match.matchId}</h3>
      <p>{ACTIONS[pending.action][1]}</p>
      <p>Expected match revision {pending.match.matchRevision}; permission revision {pending.match.permissionRevision}.</p>
      {uncertain ? <p>The outcome is not yet confirmed. This review retains the original operation identity for a safe retry.</p> : null}
      <button type="button" disabled={busy || uncertain} onClick={() => setPending(null)}>Cancel</button>
      <button type="button" disabled={busy} onClick={commit}>{busy ? "Confirming…" : uncertain ? "Retry Same Operation" : `Confirm ${ACTIONS[pending.action][0]}`}</button>
    </section> : null}
  </section>;
}
