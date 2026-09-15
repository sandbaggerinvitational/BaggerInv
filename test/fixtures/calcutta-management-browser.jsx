import React from "react";
import { createRoot } from "react-dom/client";
import Editor from "../../app/admin/director/CalcuttaManagementEditor.js";
const players = Array.from({ length: 24 }, (_, i) => ({
  player_id: `P${i + 1}`,
  display_name: `Synthetic Golfer ${i + 1}`,
}));
let model = {
  tournament_id: "2032",
  currency_code: "USD",
  state: "CONFIGURED",
  publication_state: "UNPUBLISHED",
  configuration_revision: 2,
  configuration_fingerprint: "a".repeat(64),
  auction_revision: 0,
  auction_fingerprint: null,
  publication_revision: 1,
  players,
  purchases: [],
  ownership: [],
  point_structure: players.map((_, i) => ({
    place: i + 1,
    round_1_award: String((24 - i) * 4),
    round_2_award: String(i < 12 ? (12 - i) * 12 - 3 : 0),
    round_3_award: String((24 - i) * 5),
  })),
  payout_structure: players.map((_, i) => ({
    place: i + 1,
    round_1_fraction: ["0.0125", "0.01", "0.0075"][i] || "0",
    round_2_fraction: ["0.025", "0.015"][i] || "0",
    round_3_fraction: ["0.0125", "0.01", "0.0075"][i] || "0",
    overall_fraction:
      i === 23
        ? "0.05"
        : ["0.225", "0.2", "0.15", "0.12", "0.09", "0.065"][i] || "0",
  })),
};
window.fixtureCalls = [];
window.fetch = async (url, options) => {
  const input = JSON.parse(options.body);
  window.fixtureCalls.push(input);
  if (input.action === "management-entry") {
    const e = input.entry;
    model = {
      ...model,
      auction_revision: model.auction_revision + 1,
      auction_fingerprint: "b".repeat(64),
      publication_revision: model.publication_revision + 1,
      purchases: [
        ...model.purchases.filter((p) => p.player_id !== e.playerId),
        { player_id: e.playerId, purchase_price: e.purchasePrice },
      ],
      ownership: [
        ...model.ownership.filter((p) => p.player_id !== e.playerId),
        ...e.owners.map((o) => ({
          player_id: e.playerId,
          owner_player_id: o.buyerId,
          ownership_fraction: String(Number(o.percentage) / 100),
        })),
      ],
    };
  }
  return {
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        ok: true,
        data: structuredClone(model),
        receipt: { ok: true },
        readbackVerified: true,
      },
    }),
  };
};
createRoot(document.getElementById("root")).render(
  <main style={{ maxWidth: 1100, margin: "auto", padding: 12 }}>
    <h1>Director fixture · no Production connection</h1>
    <Editor />
  </main>,
);
