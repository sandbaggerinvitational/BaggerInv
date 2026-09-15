import React from "react";
import { createRoot } from "react-dom/client";
import { NetSkinsCard } from "../../app/admin/director/ProductionDirectorOperations.js";
window.fixtureMode = "unavailable";
window.fixtureCalls = [];
window.fixtureRefreshes = 0;
const round = { roundNumber: 1, format: "BB", scope: "PLAYER", revision: 2,
  configured: true, state: "ENTRIES_SAVED", enteredCount: 1, staleEntries: [], fieldFingerprint: "a".repeat(64),
  entrants: [{ key: "P1", bindingFingerprint: "b".repeat(64), entered: true, playerIds: ["P1"],
    players: [{ id: "P1", name: "Synthetic Golfer" }], teamName: "Synthetic Team", matchNumber: 1 }] };
window.fetch = async (url, options = {}) => {
  window.fixtureCalls.push({ url, method: options.method || "GET", body: options.body });
  if (url === "/api/director/net-skins-entries" && (!options.method || options.method === "GET")) {
    if (window.fixtureMode === "unavailable") return Response.json({ error: "Synthetic entry outage" }, { status: 503 });
    const value = { ...round, ...(window.fixtureMode === "stale" ? { state: "REVIEW_REQUIRED", enteredCount: 0 } : {}) };
    return Response.json({ data: { rounds: [value] } });
  }
  if (url === "/api/admin/production-net-skins-v1" && options.method === "POST") return Response.json({ ok: true });
  throw new Error("Unexpected fixture operation");
};
createRoot(document.getElementById("root")).render(<main style={{ maxWidth: 1100, margin: "auto", padding: 12 }}>
  <h1>Isolated Net Skins readiness fixture</h1>
  <NetSkinsCard data={{ publications: { netSkins: { state: "NOT_CONFIGURED", configurationRevision: 0 } }, privateOperations: { netSkins: {} } }}
    refresh={async () => { window.fixtureRefreshes++; }} />
</main>);
