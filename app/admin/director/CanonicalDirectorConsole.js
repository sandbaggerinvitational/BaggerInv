"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CanonicalDirectorOdds from "./CanonicalDirectorOdds.js";
import { loadCanonicalDirectorOverview, submitCanonicalDirectorOperation, canonicalDirectorFailureDisposition } from "../../../lib/canonical-director-client.js";

export default function CanonicalDirectorConsole({ directorName = "Tournament Director" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [operationBusy, setOperationBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const pendingOperation = useRef(null);
  async function operate(action, match) {
    if (!pendingOperation.current) pendingOperation.current = { action, matchId: match.id,
      operationRequestId: crypto.randomUUID(), expectedMatchRevision: match.matchRevision,
      expectedPermissionRevision: match.permissionRevision };
    setPending(pendingOperation.current); setOperationBusy(true); setError("");
    try {
      await submitCanonicalDirectorOperation(pendingOperation.current);
      pendingOperation.current = null; setPending(null); setRefresh((value) => value + 1);
    } catch (failure) {
      const disposition = canonicalDirectorFailureDisposition(failure);
      if (!disposition.retainOperation) { pendingOperation.current = null; setPending(null); }
      if (disposition.refreshAuthority) setRefresh((value) => value + 1);
      setError(failure.message);
    }
    finally { setOperationBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    loadCanonicalDirectorOverview({ signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [refresh]);
  return <section style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem" }}>
    <p>{directorName}</p><h1>Tournament Director</h1>
    <p>Current tournament authority and match results.</p>
    <button type="button" disabled={busy} onClick={() => { setError(""); setRefresh((value) => value + 1); }}>{busy ? "Refreshing…" : "Refresh"}</button>
    {error ? <p role="alert">{error}</p> : null}
    {data ? <>
      <h2>{data.tournament.name || `${data.tournament.year} Tournament`}</h2>
      <p>{data.tournament.teamOne.name}: {data.tournament.teamOne.score} · {data.tournament.teamTwo.name}: {data.tournament.teamTwo.score}</p>
      {data.rounds.map((round) => <section key={round.number}>
        <h3>{round.label}</h3><p>{round.status}</p>
        <ul>{round.matches.map((match) => <li key={match.id}>
          <Link href={`/live/${encodeURIComponent(match.id)}`}>{match.id}</Link>
          {" — "}{match.status}{" · "}{match.finalResult || match.liveStatusText}
          {data.capabilities.matchControls && !pending && match.status?.toUpperCase() === "FINAL" ? <button type="button" disabled={operationBusy} onClick={() => operate("reopen", match)}>Reopen Match</button> : null}
          {data.capabilities.matchControls && !pending && match.status?.toUpperCase() !== "FINAL" && match.scorecardComplete && !match.scoringLocked ? <button type="button" disabled={operationBusy} onClick={() => operate("finalize", match)}>Finalize Match</button> : null}
        </li>)}</ul>
      </section>)}
      <p>Finalize and Reopen confirm saved tournament state before reporting success. Other editing tools are unavailable in this isolated environment.</p>
    </> : !error && <p role="status">Loading current tournament…</p>}
    {pending ? <button type="button" disabled={operationBusy} onClick={() => operate(pending.action, { id: pending.matchId })}>Retry same {pending.action} operation</button> : null}
    <CanonicalDirectorOdds />
    <nav aria-label="Tournament reads"><Link href="/live">Matches</Link>{" · "}<Link href="/history">History</Link>{" · "}<Link href="/records">Records</Link></nav>
  </section>;
}
