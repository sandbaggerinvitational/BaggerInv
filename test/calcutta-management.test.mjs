import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  auctionEntry,
  canonicalEqual,
  configurationDraft,
  configurationPayload,
  decimal,
  entryPayload,
  fraction,
  half,
  mergeEntry,
  multiply,
  ownershipState,
  percent,
  predecessor,
  sum,
} from "../lib/calcutta-management-model.js";

export function fixture(year = "2026", count = 24) {
  const players = Array.from({ length: count }, (_, i) => ({
    player_id: `P${i + 1}`,
    display_name: `Player ${i + 1}`,
  }));
  const point_structure = players.map((_, i) => ({
    place: i + 1,
    round_1_award: String((count - i) * 4),
    round_2_award: String(i < count / 2 ? (count / 2 - i) * 12 - 3 : 0),
    round_3_award: String((count - i) * 5),
  }));
  const payout_structure = players.map((_, i) => ({
    place: i + 1,
    round_1_fraction: ["0.0125", "0.01", "0.0075"][i] || "0",
    round_2_fraction: ["0.025", "0.015"][i] || "0",
    round_3_fraction: ["0.0125", "0.01", "0.0075"][i] || "0",
    overall_fraction:
      i === count - 1
        ? "0.05"
        : ["0.225", "0.2", "0.15", "0.12", "0.09", "0.065"][i] || "0",
  }));
  return {
    tournament_id: year,
    configuration_revision: 2,
    configuration_fingerprint: "a".repeat(64),
    auction_revision: 0,
    auction_fingerprint: null,
    publication_revision: 1,
    publication_state: "UNPUBLISHED",
    state: "CONFIGURED",
    players,
    point_structure,
    payout_structure,
    purchases: [],
    ownership: [],
    predecessor_auction_fingerprint: null,
    predecessor_purchases: [],
    predecessor_ownership: [],
  };
}
test("revision 2 exact points/payouts round-trip; 24th 5% is valid", () => {
  const m = fixture(),
    rows = configurationDraft(m),
    p = configurationPayload(rows, 24);
  assert.ok(canonicalEqual(p.pointStructure, m.point_structure));
  assert.ok(canonicalEqual(p.payoutStructure, m.payout_structure));
  assert.deepEqual(
    [0, 1, 2].map((n) => sum(rows.map((r) => r.points[n]))),
    ["1200", "900", "1500"],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((n) => sum(rows.map((r) => r.percentages[n]))),
    ["3", "4", "3", "90"],
  );
  assert.equal(rows[23].percentages[3], "5");
  assert.equal(half(rows[0].points[1]), "70.5");
  assert.equal(half(rows[0].percentages[1]), "1.25");
});
test("configuration edits, exact total, missing/duplicate places, invalid points fail closed", () => {
  const rows = configurationDraft(fixture());
  rows[0].points[0] = "95.5";
  assert.equal(
    configurationPayload(rows, 24).pointStructure[0].round_1_award,
    "95.5",
  );
  rows[0].percentages[3] = "22.49";
  assert.throws(() => configurationPayload(rows, 24), /100%/);
  rows[0].percentages[3] = "22.5";
  assert.throws(() => configurationPayload(rows.slice(1), 24));
  rows[1].place = 1;
  assert.throws(() => configurationPayload(rows, 24));
  rows[1].place = 2;
  for (const v of ["", "-1", "NaN", "Infinity", "1e2", "25%"]) {
    rows[0].points[0] = v;
    assert.throws(() => configurationPayload(rows, 24));
  }
});
test("future tournament sizes and exact decimal presentation", () => {
  const m = fixture("2032", 20);
  assert.equal(configurationDraft(m).length, 20);
  assert.equal(
    configurationPayload(configurationDraft(m), 20).payoutStructure.length,
    20,
  );
  assert.equal(predecessor(m).expectedTournamentId, "2032");
  assert.equal(
    percent("0.333333333333333333333333333333"),
    "33.3333333333333333333333333333",
  );
  assert.equal(fraction("33.34"), "0.3334");
  assert.equal(multiply("2000", "0.25"), "500");
  assert.equal(decimal("0.000"), "0");
});
for (const shares of [
  ["100"],
  ["50", "50"],
  ["75", "25"],
  ["25", "25", "50"],
  ["33.33", "33.33", "33.34"],
])
  test(`self/multiple ownership ${shares.join("/")}`, () => {
    const m = fixture(),
      entry = {
        playerId: "P1",
        purchasePrice: "2000.01",
        owners: shares.map((percentage, i) => ({
          buyerId: `P${i + 1}`,
          percentage,
        })),
      };
    const p = entryPayload(entry, m.players);
    assert.equal(sum(p.owners.map((o) => o.ownershipFraction)), "1");
    assert.equal(p.owners[0].buyerId, "P1");
  });
test("incomplete/overallocated/duplicate/unknown buyer and price rejected without normalization", () => {
  const m = fixture(),
    entry = {
      playerId: "P1",
      purchasePrice: "1",
      owners: [{ buyerId: "P1", percentage: "99.99" }],
    };
  assert.equal(ownershipState(entry.owners).status, "INCOMPLETE");
  assert.throws(() => entryPayload(entry, m.players));
  entry.owners[0].percentage = "100.01";
  assert.equal(ownershipState(entry.owners).status, "INVALID");
  assert.throws(() => entryPayload(entry, m.players));
  entry.owners = [{ buyerId: "UNKNOWN", percentage: "100" }];
  assert.throws(() => entryPayload(entry, m.players));
  entry.owners = [
    { buyerId: "P1", percentage: "50" },
    { buyerId: "P1", percentage: "50" },
  ];
  assert.throws(() => entryPayload(entry, m.players));
  entry.owners = [{ buyerId: "P1", percentage: "100" }];
  entry.purchasePrice = "";
  assert.throws(() => entryPayload(entry, m.players));
});
test("selected-entry merge preserves other golfers; buyers may own multiple golfers", () => {
  const m = fixture(),
    a = entryPayload(
      {
        playerId: "P1",
        purchasePrice: "2000",
        owners: [{ buyerId: "P1", percentage: "100" }],
      },
      m.players,
    );
  const first = mergeEntry(m, a),
    second = mergeEntry(first, { ...a, playerId: "P2", purchasePrice: "1500" });
  assert.equal(second.purchases.length, 2);
  assert.deepEqual(second.purchases[0], first.purchases[0]);
  assert.equal(
    second.ownership.filter((o) => o.owner_player_id === "P1").length,
    2,
  );
  assert.deepEqual(auctionEntry({ ...m, ...second }, "P1"), {
    playerId: "P1",
    purchasePrice: "2000",
    owners: [{ buyerId: "P1", percentage: "100" }],
  });
});
test("Director-only read and editor remain separate from participant/publication paths", async () => {
  const [sql, route, ui] = await Promise.all(
    [
      "supabase/production_incremental/director-calcutta-management-read-v1.sql",
      "app/api/admin/production-calcutta-v1/route.js",
      "app/admin/director/CalcuttaManagementEditor.js",
    ].map((p) => readFile(new URL(`../${p}`, import.meta.url), "utf8")),
  );
  assert.match(sql, /assert_production_scoring_actor\(input, true\)/);
  assert.match(sql, /current_tournament_pointer_v1/);
  assert.match(sql, /assert_annual_calcutta_runtime_v1/);
  assert.match(sql, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(
    sql,
    /insert into scoring_authority|update scoring_authority|create table|alter table/i,
  );
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /requireOrigin: true/);
  assert.match(route, /management-read/);
  assert.match(ui, /useEffect\(\(\)\s*=>\s*\{\s*load\(\);\s*\},\s*\[\]\)/);
  assert.match(ui, /Save &amp; Next/);
  assert.match(ui, /readbackVerified/);
  assert.match(ui, /pending.current/);
  assert.doesNotMatch(ui, /request\(['"](?:publish|enqueue|replace-auction)/);
  assert.doesNotMatch(ui, /2026/);
});
