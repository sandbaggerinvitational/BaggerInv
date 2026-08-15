import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateNetSkins, netSkinsResultRecords, normalizeNetSkinsEntries } from "../lib/net-skins.js";
import { netSkinsCountLabel, netSkinsRankAccessibleLabel, netSkinsResultPresentation } from "../lib/net-skins-presentation.js";

const card = (values, match = "1") => values.map((net, index) => ({ hole: index + 1, net, match }));

test("Best Ball and Singles calculate independent $25 entries and unique low-net skins", () => {
  const entries = ["p1", "p2", "p3"].map((id) => ({ Year: 2026, Round: 1, Format: "Best Ball", Match: 1, "Player ID 1": id, Eligible: "TRUE", "Buy-In": 25 }));
  const scores = [
    { id: "p1", round: 1, match: "1", entityType: "PLAYER", name: "Clay", scorecard: card([3, 4, 4]) },
    { id: "p2", round: 1, match: "1", entityType: "PLAYER", name: "Miles", scorecard: card([4, 4, 3]) },
    { id: "p3", round: 1, match: "1", entityType: "PLAYER", name: "Taylor", scorecard: card([5, 4, 5]) },
  ];
  const round = calculateNetSkins({ entries, scoreRows: scores, activeYear: 2026 }).rounds[0];
  assert.equal(round.pot, 75);
  assert.equal(round.skinsAwarded, 2);
  assert.equal(round.skinValue, 37.5);
  assert.deepEqual(round.skins.map((skin) => [skin.hole, skin.winner, skin.winningNetScore]), [[1, "Clay", 3], [3, "Miles", 3]]);
  assert.equal(round.skins.some((skin) => skin.hole === 2), false);
});

test("Scramble compares one eligible pairing per team at $50 without individual duplication", () => {
  const entries = [
    { Year: 2026, Round: 2, Format: "Scramble", Match: 1, "Player ID 1": "p1", "Player ID 2": "p2", "Team Handicap": 6, Eligible: true },
    { Year: 2026, Round: 2, Format: "SC", Match: 2, "Player ID 1": "p3", "Player ID 2": "p4", "Team Handicap": -1.5, Eligible: true },
  ];
  const scores = [
    { id: "m1:team-1", round: 2, match: "1", entityType: "PAIRING", playerIds: ["p1", "p2"], name: "Clay / Miles", scorecard: card([3, 4], "1") },
    { id: "m2:team-1", round: 2, match: "2", entityType: "PAIRING", playerIds: ["p3", "p4"], name: "Taylor / Jason", scorecard: card([4, 3], "2") },
  ];
  const round = calculateNetSkins({ entries, scoreRows: scores, activeYear: 2026 }).rounds[0];
  assert.equal(round.eligibleCount, 2);
  assert.equal(round.pot, 100);
  assert.deepEqual(round.skins.map((skin) => skin.winner), ["Clay / Miles", "Taylor / Jason"]);
  assert.equal(round.leaderboard.length, 2);
  assert.deepEqual(round.leaderboard[0].holeResults.map(({ hole, wonSkin, tiedLow }) => ({ hole, wonSkin, tiedLow })), [
    { hole: 1, wonSkin: true, tiedLow: false },
    { hole: 2, wonSkin: false, tiedLow: false },
  ]);
});

test("Scramble Team Handicap determines net comparison from official gross and stroke index", () => {
  const entries = [
    { Year: 2026, Round: 2, Format: "SC", Match: 1, "Player ID 1": "p1", "Player ID 2": "p2", "Team Handicap": 1, Eligible: true },
    { Year: 2026, Round: 2, Format: "SC", Match: 2, "Player ID 1": "p3", "Player ID 2": "p4", "Team Handicap": 0, Eligible: true },
  ];
  const scoreRows = [
    { id: "m1:team-1", round: 2, match: "1", entityType: "PAIRING", playerIds: ["p1", "p2"], name: "Clay / Miles", scorecard: [{ hole: 1, match: "1", gross: 4, net: 4, strokeIndex: 1 }] },
    { id: "m2:team-1", round: 2, match: "2", entityType: "PAIRING", playerIds: ["p3", "p4"], name: "Taylor / Jason", scorecard: [{ hole: 1, match: "2", gross: 4, net: 4, strokeIndex: 1 }] },
  ];
  const round = calculateNetSkins({ entries, scoreRows, activeYear: 2026 }).rounds[0];
  assert.equal(round.skins[0].winner, "Clay / Miles");
  assert.equal(round.skins[0].winningNetScore, 3);
});

test("zero skins produces no payout and no carryover", () => {
  const entries = ["p1", "p2"].map((id) => ({ Year: 2026, Round: 3, Format: "Singles", Match: 1, "Player ID 1": id, Eligible: true }));
  const scores = entries.map((entry) => ({ id: entry["Player ID 1"], round: 3, entityType: "PLAYER", scorecard: card(Array(18).fill(4)) }));
  const round = calculateNetSkins({ entries, scoreRows: scores, activeYear: 2026 }).rounds[0];
  assert.equal(round.pot, 50);
  assert.equal(round.skinsAwarded, 0);
  assert.equal(round.skinValue, 0);
  assert.deepEqual(round.skins, []);
});

test("ineligible and prior-year rows never enter the pot or comparison field", () => {
  const normalized = normalizeNetSkinsEntries([
    { Year: 2026, Round: 1, Format: "BB", "Player ID 1": "active", Eligible: "Yes" },
    { Year: 2026, Round: 1, Format: "BB", "Player ID 1": "declined", Eligible: "No" },
    { Year: 2025, Round: 1, Format: "BB", "Player ID 1": "historical", Eligible: "Yes" },
  ], 2026);
  assert.deepEqual(normalized.map((row) => row.playerId1), ["active"]);
});

test("a corrected official net score recalculates winner and payout deterministically", () => {
  const entries = ["p1", "p2"].map((id) => ({ Year: 2026, Round: 1, Format: "BB", Match: 1, "Player ID 1": id, Eligible: true }));
  const calculate = (secondNet) => calculateNetSkins({ entries, activeYear: 2026, scoreRows: [
    { id: "p1", round: 1, entityType: "PLAYER", name: "Clay", scorecard: card([3]) },
    { id: "p2", round: 1, entityType: "PLAYER", name: "Miles", scorecard: card([secondNet]) },
  ] }).rounds[0];
  assert.equal(calculate(4).skins[0].winner, "Clay");
  assert.equal(calculate(2).skins[0].winner, "Miles");
  assert.equal(calculate(3).skinsAwarded, 0);
});

test("result records preserve official payout fields and numeric values", () => {
  const records = netSkinsResultRecords({ results: [{ year: 2026, round: 1, hole: 2, winner: "Clay", winnerPlayerId: "p1", winnerPlayerId2: "", skinValue: 150, roundPot: 600, winningNetScore: 3, format: "BB", match: "5" }] });
  assert.deepEqual(records[0], { Year: 2026, Round: 1, Hole: 2, Winner: "Clay", "Winner Player ID": "p1", "Winner Player ID 2": "", "Skin Value": 150, "Round Pot": 600, "Winning Net Score": 3, Format: "BB", Match: "5" });
});

test("normalized tournament payload reads both dedicated sheets without changing scoring tabs", async () => {
  const source = await readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8");
  assert.match(source, /"Net Skins", "Net Skins Result"/);
  assert.match(source, /calculateNetSkins/);
});

test("finalization and reopening automatically synchronize only the Net Skins Result sheet", async () => {
  const source = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  assert.match(source, /synchronizeNetSkinsAfterMatch\(nextLive, \{ tournamentModel \}\)/g);
  assert.match(source, /requireTabHeaders\("Net Skins Result", NET_SKINS_RESULT_HEADERS\)/);
  assert.match(source, /replaceRuntimeRecords\("Net Skins Result"/);
  assert.match(source, /calculated\?\.finalized[\s\S]*netSkinsResultRecords/);
  assert.doesNotMatch(source, /replaceRuntimeRecords\("(?:Live Matches|Live Hole Scores|Matches)"/);
});

test("Leaderboards exposes the Scramble Net Skins live experience and lazy team sheet", async () => {
  const source = await readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/live/net-skins.module.css", import.meta.url), "utf8");
  assert.match(source, /LEADERBOARD_MODULES\.map/);
  assert.match(source, /Round Pot/);
  assert.match(source, /Skins Awarded/);
  assert.match(source, /Current Skin Value/);
  assert.match(source, /Final Skin Value/);
  assert.match(source, /Competition Status/);
  assert.match(source, /Largest Current Skin/);
  assert.match(source, /Remaining Eligible Holes/);
  assert.match(source, /Current Skin Leaders/);
  assert.match(source, /isScramble \? "teams" : "golfers"/);
  assert.match(source, /Net Skins Storylines/);
  assert.match(source, /selectedTeam \?/);
  assert.match(source, /netSkinsResultPresentation\(result\)/);
  assert.match(source, /presentation\.accessibleLabel/);
  assert.match(source, /Current competition summary/);
  assert.match(source, /Hole-by-Hole Net Skins Results/);
  assert.match(source, /Current Winnings/);
  assert.match(source, /\.join\(" & "\)/);
  assert.doesNotMatch(source, /complete eligible field/);
  assert.match(source, /Winning|Winnings/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:scroll|auto)/);
});

test("Net Skins polish exposes official summary terminology and participant highlighting", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/net-skins.module.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Net Skins Competition", "Round Pot", "Entrants", "Eligible Holes", "Competition Status", "Current Skin Value", "Skins Awarded", "Remaining Eligible Holes", "Final Skin Value", "Holding Skins"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /Independent Competition|Value Per Skin/);
  assert.match(source, /row\.playerIds\?\.includes\(currentPlayer\.id\)/);
  assert.match(source, /skinCoin/);
  const netSkinsSource = source.slice(source.indexOf("function NetSkins"), source.indexOf("export default function"));
  assert.match(netSkinsSource, /aria-label="Current player">YOU/);
  assert.match(netSkinsSource, /aria-label="Pairing containing current player">YOU/);
  assert.doesNotMatch(netSkinsSource, /💰 Hole/);
  assert.match(css, /\.entry\[data-current="true"\]/);
  assert.match(css, /background:#fff8e9/);
  assert.match(css, /inset 4px 0 #b98920/);
  assert.match(source, /No Skins Yet/);
  assert.match(source, /waitingField[\s\S]*localeCompare/);
  assert.match(source, /skinHolders\.map\(\(row\) => renderEntry\(row, true\)\)/);
  assert.match(source, /const displayRank = ranked \? rankLabel\(row\) : ""/);
  assert.match(source, /aria-expanded=\{waitingExpanded\}/);
  assert.match(css, /\.noSkinsToggle/);
  assert.match(css, /\.sheetMetrics\[data-winning="true"\]/);
  assert.match(css, /\.resultBadge\[data-result="won"\]/);
  assert.match(css, /\.holeResults article\[data-result="won"\]/);
});

test("participant Net Skins labels distinguish a tied low from an ordinary non-winning hole", () => {
  assert.deepEqual(netSkinsResultPresentation({ wonSkin: true, tiedLow: false }), { state: "won", label: "Won Skin", accessibleLabel: "Won skin" });
  assert.deepEqual(netSkinsResultPresentation({ wonSkin: false, tiedLow: true }), { state: "tie", label: "Tied — No Skin", accessibleLabel: "Tied. No skin awarded" });
  assert.deepEqual(netSkinsResultPresentation({ wonSkin: false, tiedLow: false }), { state: "none", label: "No Skin", accessibleLabel: "No skin" });
  assert.equal(netSkinsCountLabel(1), "1 skin");
  assert.equal(netSkinsCountLabel(3), "3 skins");
  assert.equal(netSkinsRankAccessibleLabel("T-1"), "tied for 1st");
  assert.equal(netSkinsRankAccessibleLabel("T-2"), "tied for 2nd");
});

test("the tied-low engine state remains no-award and no-carryover while only participant copy changes", () => {
  const entries = ["p1", "p2", "p3"].map((id) => ({ Year: 2026, Round: 1, Format: "BB", Match: 1, "Player ID 1": id, Eligible: true }));
  const round = calculateNetSkins({ entries, activeYear: 2026, scoreRows: [
    { id: "p1", round: 1, entityType: "PLAYER", name: "Clay", scorecard: card([3, 3]) },
    { id: "p2", round: 1, entityType: "PLAYER", name: "Miles", scorecard: card([3, 4]) },
    { id: "p3", round: 1, entityType: "PLAYER", name: "Taylor", scorecard: card([4, 5]) },
  ] }).rounds[0];
  assert.equal(round.skinsAwarded, 1);
  assert.deepEqual(round.skins.map(({ hole, winner }) => [hole, winner]), [[2, "Clay"]]);
  const clayHole1 = round.leaderboard.find((row) => row.playerIds.includes("p1")).holeResults[0];
  assert.deepEqual({ wonSkin: clayHole1.wonSkin, tiedLow: clayHole1.tiedLow }, { wonSkin: false, tiedLow: true });
  assert.equal(netSkinsResultPresentation(clayHole1).label, "Tied — No Skin");
});

test("Home Net Skins summary is participant-only and links to official standings", async () => {
  const [home, command] = await Promise.all([
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /if \(!playerId \|\| !entries\.length\) return null/);
  assert.match(home, /\{skins\} skin/);
  assert.match(home, /\{skinsCurrency\(winnings\)\} winnings/);
  assert.match(home, /Your Competitions/);
  assert.match(home, />View <i aria-hidden="true">→<\/i>/);
  assert.match(home, /\/live\?view=leaderboards&tab=skins/);
  assert.match(command, /netSkins=\{liveData\?\.netSkins\}/);
});
