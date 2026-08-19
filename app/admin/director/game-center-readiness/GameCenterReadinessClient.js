"use client";

import { useState } from "react";
import { directorFetch } from "../../../../lib/director-client-transaction.js";

export default function GameCenterReadinessClient() {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function run(action, input = {}) {
    setBusy(action); setResult(null); setError("");
    try {
      const response = await directorFetch("/api/director/scoring-authority", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...input }),
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

  async function guideOperation(action) {
    setBusy(action); setResult(null); setError("");
    try {
      const response = action === "guide-sync-status"
        ? await fetch("/api/director/guide-content", { cache: "no-store", credentials: "same-origin" })
        : await directorFetch("/api/director/guide-content", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "refresh" }),
        });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.result?.message || `Request failed (${response.status}).`);
      setResult({ action, requestMs: 0, result: payload });
    } catch (caught) { setError(caught?.message || "Guide synchronization operation failed."); }
    finally { setBusy(""); }
  }

  return <section style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem", display: "grid", gap: "1rem" }}>
    <div><p>Preview only · Director authorized</p><h1>Live Read Readiness</h1><p>This surface is isolated from the Google-backed Director dashboard. Refresh imports presentation or competition configuration explicitly; parity verifies canonical participant views without changing scoring.</p></div>
    <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-game-center-presentations")}>Refresh Game Center Presentation</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("game-center-parity")}>Verify Game Center Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("scoring-read-parity", { samples: 3 })}>Verify Scoring Read Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("my-match-parity")}>Verify My Match Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-home-presentation")}>Refresh Home Presentation</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("home-parity")}>Verify Home Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-tournament-presentation", { samples: 25 })}>Refresh Tournament Projection</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("tournament-parity", { samples: 25 })}>Verify Tournament Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("leaderboards-core-parity", { samples: 25 })}>Verify Leaderboards Core Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-net-skins-configuration", { samples: 25 })}>Refresh Net Skins Configuration</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("net-skins-parity", { samples: 25 })}>Verify Net Skins Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-calcutta-configuration", { samples: 25 })}>Refresh Calcutta Configuration</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("calcutta-parity", { samples: 25 })}>Verify Calcutta Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-published-odds-snapshots", { samples: 25 })}>Refresh Published Odds Snapshots</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("published-odds-parity", { samples: 25 })}>Verify Published Odds Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-competition-derived-state", { samples: 25 })}>Refresh Momentum + Storylines</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("competition-derived-parity", { samples: 25 })}>Verify Momentum + Storylines Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("refresh-intelligence-derived-state")}>Refresh Tournament Intelligence</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("intelligence-derived-readiness")}>Verify Tournament Intelligence</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("match-authorization-parity")}>Verify Match Authorization Parity</button>
      <button type="button" disabled={Boolean(busy)} onClick={inspectShadow}>Inspect Auth Shadow</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => guideOperation("refresh-guide-content")}>Refresh Participant Guide</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => guideOperation("guide-sync-status")}>Guide Sync Status</button>
    </div>
    {busy ? <p role="status">Running {busy}…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {result ? <div role="status"><strong>{result.action}</strong><p>{result.requestMs} ms</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result.result, null, 2)}</pre></div> : null}
  </section>;
}
