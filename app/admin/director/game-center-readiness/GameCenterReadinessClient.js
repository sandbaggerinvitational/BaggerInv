"use client";

import { useState } from "react";
import { directorFetch } from "../../../../lib/director-client-transaction.js";

export default function GameCenterReadinessClient() {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function run(action) {
    setBusy(action); setResult(null); setError("");
    try {
      const response = await directorFetch("/api/director/scoring-authority", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
      setResult(payload);
    } catch (caught) {
      setError(caught?.message || "Game Center readiness operation failed.");
    } finally { setBusy(""); }
  }

  async function inspectShadow() {
    setBusy("identity-shadow-diagnostics"); setResult(null); setError("");
    try {
      const response = await fetch("/api/director/identity-shadow-diagnostics?tournamentId=2026", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
      setResult({ action: "identity-shadow-diagnostics", requestMs: 0, result: payload });
    } catch (caught) { setError(caught?.message || "Identity shadow diagnostics failed."); }
    finally { setBusy(""); }
  }

  return <section style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem", display: "grid", gap: "1rem" }}>
    <div><p>Preview only · Director authorized</p><h1>Live Read Readiness</h1><p>This surface is isolated from the Google-backed Director dashboard. Refresh imports presentation configuration once; parity verifies canonical Game Center matches and participant-scoped My Match views.</p></div>
    <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-game-center-presentations")}>Refresh Game Center Presentation</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("game-center-parity")}>Verify Game Center Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("my-match-parity")}>Verify My Match Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={inspectShadow}>Inspect Auth Shadow</button>
    </div>
    {busy ? <p role="status">Running {busy}…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {result ? <div role="status"><strong>{result.action}</strong><p>{result.requestMs} ms</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result.result, null, 2)}</pre></div> : null}
  </section>;
}
