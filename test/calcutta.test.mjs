import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCalcuttaModel, calcuttaPublicationRecords, deriveCalcuttaRoundResults, rankWithTieAverages } from "../lib/calcutta.js";

const players = {
  A: { name: "Clay Beltran" }, B: { name: "Patrick Noonan" }, C: { name: "David Tatum" },
  O1: { name: "Taylor Lippincott" }, O2: { name: "Michael Hunnicutt" },
};

function fixture() {
  return buildCalcuttaModel({
    year: 2026,
    players,
    purchases: [
      { Year: 2026, "Golfer Player ID": "A", "Purchase Price": "$100" },
      { Year: 2026, "Golfer Player ID": "B", "Purchase Price": "$200" },
      { Year: 2026, "Golfer Player ID": "C", "Purchase Price": "$50" },
    ],
    ownership: [
      { Year: 2026, "Golfer Player ID": "A", "Owner Player ID": "O1", "Ownership %": "50%" },
      { Year: 2026, "Golfer Player ID": "A", "Owner Player ID": "O2", "Ownership %": "50%" },
      { Year: 2026, "Golfer Player ID": "B", "Owner Player ID": "O1", "Ownership %": "100%" },
    ],
    pointStructure: [10, 6, 4, 2].map((award, index) => ({ Year: 2026, Place: index + 1, "Round 1 Award": award })),
    payoutStructure: [
      { Year: 2026, Place: 1, "Round 1 Award %": "10%", "Overall Award %": "20%" },
      { Year: 2026, Place: 2, "Round 1 Award %": "5%", "Overall Award %": "10%" },
      { Year: 2026, Place: 3, "Round 1 Award %": "3%", "Overall Award %": "5%" },
      { Year: 2026, Place: 4, "Round 1 Award %": "1%", "Overall Award %": "0%" },
    ],
    roundResults: [
      { Year: 2026, Round: 1, Format: "Best Ball", "Player ID": "A", "Gross Score": 75, "Net Score": 70, "Full Course Handicap": 5 },
      { Year: 2026, Round: 1, Format: "Best Ball", "Player ID": "B", "Gross Score": 76, "Net Score": 70, "Full Course Handicap": 6 },
      { Year: 2026, Round: 1, Format: "Best Ball", "Player ID": "C", "Gross Score": 80, "Net Score": 72, "Full Course Handicap": 8 },
    ],
  });
}

test("Calcutta ties average every occupied finishing-place award", () => {
  const ranked = rankWithTieAverages([{ playerId: "A", score: 70 }, { playerId: "B", score: 70 }, { playerId: "C", score: 72 }], (row) => row.score, "asc", (place, count) => {
    const awards = [10, 6, 4];
    return awards.slice(place - 1, place - 1 + count).reduce((sum, value) => sum + value, 0) / count;
  });
  assert.deepEqual(ranked.map(({ playerId, place, tieSize, award }) => ({ playerId, place, tieSize, award })), [
    { playerId: "A", place: 1, tieSize: 2, award: 8 },
    { playerId: "B", place: 1, tieSize: 2, award: 8 },
    { playerId: "C", place: 3, tieSize: 1, award: 4 },
  ]);
});

test("Calcutta derives its pot, standings, payouts, and post-payout ownership", () => {
  const model = fixture();
  assert.equal(model.pot, 350);
  const clay = model.golfers.find((row) => row.playerId === "A");
  assert.equal(clay.rounds[1].points, 8);
  assert.ok(Math.abs(clay.rounds[1].payoutPercent - 0.075) < 1e-12);
  assert.ok(Math.abs(clay.overallPayoutPercent - 0.15) < 1e-12);
  assert.ok(Math.abs(clay.currentPayoutValue - 78.75) < 1e-12);
  assert.equal(clay.owners.reduce((sum, owner) => sum + owner.ownership, 0), 1);
  const taylor = model.portfolios.find((row) => row.ownerId === "O1");
  assert.equal(taylor.purchaseCost, 250);
  assert.ok(Math.abs(taylor.currentPayoutValue - 118.125) < 1e-12);
  assert.equal(taylor.investments[0].ownership + taylor.investments[1].ownership, 1.5);
});

test("Calcutta derives future Scramble net scores with the existing 35/15 team course handicap", () => {
  const results = deriveCalcuttaRoundResults({
    year: 2026,
    roundResults: [{ Year: 2026, Round: 2, Format: "Scramble", "Player IDs": "A / B", "Gross Score": 72 }],
    liveRoundHandicaps: [
      { Year: 2026, Round: 2, "Player ID": "A", "Course Handicap": 8 },
      { Year: 2026, Round: 2, "Player ID": "B", "Course Handicap": 16 },
    ],
  });
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((row) => row["Full Course Handicap"]), [5, 5]);
  assert.deepEqual(results.map((row) => row["Net Score"]), [67, 67]);
});

test("Calcutta stays unpublished when official purchases or award structures are incomplete", () => {
  const model = buildCalcuttaModel({ year: 2026, players, roundResults: [{ Year: 2026, Round: 1, "Player ID": "A", "Net Score": 70 }] });
  assert.equal(model.available, false);
});

test("official Calcutta publication writes only fully completed rounds and tie-averaged outputs", () => {
  const base = {
    year: 2026,
    purchases: ["A", "B", "C"].map((id, index) => ({ Year: 2026, "Golfer Player ID": id, "Purchase Price": (index + 1) * 100 })),
    ownership: [],
    pointStructure: [10, 6, 4].map((award, index) => ({ Year: 2026, Place: index + 1, "Round 1 Award": award, "Round 2 Award": award })),
    payoutStructure: [
      { Year: 2026, Place: 1, "Round 1 Award %": "10%", "Round 2 Award %": "10%", "Overall Award %": "20%" },
      { Year: 2026, Place: 2, "Round 1 Award %": "5%", "Round 2 Award %": "5%", "Overall Award %": "10%" },
      { Year: 2026, Place: 3, "Round 1 Award %": "2%", "Round 2 Award %": "2%", "Overall Award %": "5%" },
    ],
    roundResults: [
      { Year: 2026, Round: 1, Format: "Singles", "Player ID": "A", "Gross Score": 75, "Net Score": 70 },
      { Year: 2026, Round: 1, Format: "Singles", "Player ID": "B", "Gross Score": 76, "Net Score": 70 },
      { Year: 2026, Round: 1, Format: "Singles", "Player ID": "C", "Gross Score": 80, "Net Score": 72 },
      { Year: 2026, Round: 2, Format: "Singles", "Player ID": "A", "Gross Score": 74, "Net Score": 69 },
    ],
  };
  const output = calcuttaPublicationRecords(base);
  assert.equal(output.roundResults.length, 3);
  assert.ok(output.roundResults.every((row) => row.Round === 1));
  assert.deepEqual(output.roundResults.filter((row) => ["A", "B"].includes(row["Player ID"])).map((row) => row["Calcutta Points"]), [8, 8]);
  assert.equal(output.standings.length, 3);
  assert.ok(output.standings.every((row) => row["Updated At"]));
});

test("published Calcutta sheets are authoritative on the application read path", () => {
  const calculated = fixture();
  const publishedRoundResults = calculated.golfers.flatMap((golfer) => Object.values(golfer.rounds).map((round) => ({
    Year: 2026, Round: round.round, Format: round.format, "Player ID": golfer.playerId,
    "Gross Score": round.gross, "Net Score": round.net, "Full Course Handicap": round.fullCourseHandicap,
    Place: round.place, "Calcutta Points": round.points,
  })));
  const publishedStandings = calculated.golfers.map((golfer) => ({
    Year: 2026, Rank: golfer.rank, "Player ID": golfer.playerId, "Purchase Price": golfer.purchasePrice,
    "Round 1 Points": golfer.rounds[1]?.points || 0, "Total Points": golfer.totalPoints,
    "Round 1 Payout %": golfer.rounds[1]?.payoutPercent || 0, "Overall Payout %": golfer.overallPayoutPercent,
    "Total Payout %": golfer.totalPayoutPercent, "Current Payout Value": golfer.currentPayoutValue, ROI: golfer.roi,
  }));
  publishedStandings[0]["Current Payout Value"] = 123.45;
  const official = buildCalcuttaModel({
    year: 2026, players,
    purchases: [{ Year: 2026, "Golfer Player ID": "A", "Purchase Price": 100 }, { Year: 2026, "Golfer Player ID": "B", "Purchase Price": 200 }, { Year: 2026, "Golfer Player ID": "C", "Purchase Price": 50 }],
    ownership: [], pointStructure: [{ Year: 2026, Place: 1, "Round 1 Award": 999 }],
    payoutStructure: [{ Year: 2026, Place: 1, "Round 1 Award %": "99%", "Overall Award %": "99%" }],
    roundResults: publishedRoundResults, standings: publishedStandings,
  });
  assert.equal(official.source.mode, "official");
  assert.equal(official.golfers.find((row) => row.playerId === publishedStandings[0]["Player ID"]).currentPayoutValue, 123.45);
});

test("Calcutta is integrated into Tournament with one mobile-safe bottom-sheet scroller", async () => {
  const [dashboard, component, css, loader, protection, writer] = await Promise.all([
    readFile(new URL("../app/live/TournamentDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/CalcuttaExperience.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/calcutta.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/workbook-protection.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /\["calcutta", "Calcutta"\]/);
  assert.match(dashboard, /selectedRound === "calcutta" \? <CalcuttaExperience/);
  assert.match(dashboard, /selectedRound !== "overall" \? <div className=\{styles\.filters\}/);
  assert.match(component, /Current Pot/);
  assert.match(component, /Golfers/);
  assert.match(component, /Portfolios/);
  assert.match(component, /Calcutta Storylines/);
  assert.match(css, /\.sheet\{[^}]*overflow-y:auto/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(loader, /buildCalcuttaModel/);
  assert.match(loader, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(writer, /export async function publishOfficialCalcutta/);
  assert.match(writer, /replaceScopedRuntimeRecords/);
  assert.match(writer, /await synchronizeCalcuttaAfterOfficialUpdate\(nextLive\)/);
  assert.match(writer, /await synchronizeCalcuttaAfterOfficialUpdate\(next\)/);
  for (const sheet of ["Calcutta Purchases", "Calcutta Ownership", "Calcutta Point Structure", "Calcutta Payout", "Calcutta Round Results", "Calcutta Standings", "Calcutta Owner Leaderboard"]) {
    assert.match(loader, new RegExp(`fetchOptionalSheet\\(\\"${sheet}\\"\\)|\\"${sheet}\\"`));
    assert.match(protection, new RegExp(`\\"${sheet}\\"`));
  }
});
