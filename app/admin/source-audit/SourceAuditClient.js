"use client";

import { useEffect, useMemo, useState } from "react";

const SURFACES = [
  "root", "live", "players", "history", "courses", "draft", "odds-center", "war-room",
  "home", "me", "my-match", "game-center", "leaderboards", "guide", "authorities",
];

const clean = (value) => String(value ?? "").trim().toLowerCase();

async function readCertification(surface, outage, signal) {
  const query = new URLSearchParams({ surface, outage });
  const response = await fetch(`/api/admin/data-authority-certification?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  let payload;
  try { payload = await response.json(); }
  catch { payload = { ok: false, error: "Certification returned a non-JSON response." }; }
  return { surface, outage, status: response.status, payload };
}

export default function SourceAuditClient({ requestedSurface = "authorities", requestedOutage = "none" }) {
  const surface = clean(requestedSurface) || "authorities";
  const outage = clean(requestedOutage) || "none";
  const [result, setResult] = useState({ state: "loading" });
  const targets = useMemo(() => surface === "matrix" ? SURFACES : [surface], [surface]);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    Promise.all(targets.map((target) => readCertification(target, outage, controller.signal)))
      .then((entries) => setResult({ state: "complete", entries }))
      .catch((error) => {
        if (error?.name !== "AbortError") setResult({ state: "error", error: error?.message || "Certification failed." });
      });
    return () => controller.abort();
  }, [outage, targets]);

  return (
    <main style={{ margin: "0 auto", maxWidth: 1100, padding: 24 }}>
      <h1>Data Authority Source Audit</h1>
      <p>Protected Preview diagnostics for {surface} with {outage} outage injection.</p>
      <pre data-testid="source-audit-json" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </main>
  );
}
