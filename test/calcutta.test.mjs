import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCalcuttaModel, calcuttaPublicationReadiness, calcuttaPublicationRecords, calcuttaRoundResultsFromTournamentModel, deriveCalcuttaRoundResults, rankWithTieAverages } from "../lib/calcutta.js";

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
  assert.ok(Math.abs(clay.rounds[1].configuredPayoutPercent - 0.075) < 1e-12);
  assert.ok(Math.abs(clay.rounds[1].payoutPercent - 0.075) < 1e-12);
  assert.ok(Math.abs(clay.overallPayoutPercent - 0.15) < 1e-12);
  assert.ok(Math.abs(clay.currentPayoutValue - (350 * 0.225)) < 1e-12);
  assert.equal(clay.owners.reduce((sum, owner) => sum + owner.ownership, 0), 1);
  const taylor = model.portfolios.find((row) => row.ownerId === "O1");
  assert.equal(taylor.purchaseCost, 250);
  assert.ok(Math.abs(taylor.currentPayoutValue - 118.125) < 1e-12);
  assert.equal(taylor.investments[0].ownership + taylor.investments[1].ownership, 1.5);
  assert.match(model.storylines.find((story) => story.title === "Highest ROI").detail, /leads at .* since the opening auction/);
  assert.match(model.storylines.find((story) => story.title === "Largest Guaranteed Winner").detail, /has already secured/);
  assert.match(model.storylines.find((story) => story.title === "Highest Remaining Upside").detail, /left to play for/);
  assert.match(model.storylines.find((story) => story.title === "Most Valuable Portfolio").detail, /portfolio leads at/);
  assert.match(model.storylines.find((story) => story.title === "Most Expensive Purchase").detail, /opening auction's top price/);
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

test("Calcutta payout percentage points apply directly to the total pot", () => {
  const model = buildCalcuttaModel({
    year: 2026,
    players,
    purchases: [
      { Year: 2026, "Golfer Player ID": "A", "Purchase Price": 400 },
      { Year: 2026, "Golfer Player ID": "B", "Purchase Price": 350 },
      { Year: 2026, "Golfer Player ID": "C", "Purchase Price": 250 },
    ],
    pointStructure: [96, 92, 88].map((award, index) => ({ Year: 2026, Place: index + 1, "Round 1 Award": award })),
    payoutStructure: [1.25, 1, 0.75].map((award, index) => ({ Year: 2026, Place: index + 1, "Round 1 Award %": award })),
    roundResults: [
      { Year: 2026, Round: 1, Format: "Best Ball", "Player ID": "A", "Gross Score": 70, "Net Score": 60 },
      { Year: 2026, Round: 1, Format: "Best Ball", "Player ID": "B", "Gross Score": 71, "Net Score": 61 },
      { Year: 2026, Round: 1, Format: "Best Ball", "Player ID": "C", "Gross Score": 72, "Net Score": 62 },
    ],
  });
  assert.equal(model.pot, 1000);
  assert.equal(model.golfers[0].rounds[1].payoutPercent, 0.0125);
  assert.equal(model.golfers[0].rounds[1].guaranteedWinnings, 12.5);
  assert.equal(model.golfers[1].rounds[1].guaranteedWinnings, 10);
  assert.equal(model.golfers[2].rounds[1].guaranteedWinnings, 7.5);
  assert.equal(model.guaranteedDistributed, 30);
});

test("Calcutta publication consumes completed results from the authoritative tournament model", () => {
  const results = calcuttaRoundResultsFromTournamentModel({
    year: 2026,
    rounds: [
      { number: 1, status: "FINAL", matches: [{ status: "final" }] },
      { number: 2, status: "LIVE", matches: [{ status: "live" }] },
    ],
    scoreLeaderboard: [
      { round: 1, format: "Best Ball", playerIds: ["A"], gross: 75, net: 70 },
      { round: 1, format: "Scramble", playerIds: ["B", "C"], gross: 72, net: 67 },
      { round: 2, format: "Scramble", playerIds: ["A", "B"], gross: 35, net: 32 },
    ],
  });
  assert.deepEqual(results, [
    { Year: 2026, Round: 1, Format: "Best Ball", "Player IDs": "A", "Gross Score": 75, "Net Score": 70, "Full Course Handicap": 5 },
    { Year: 2026, Round: 1, Format: "Scramble", "Player IDs": "B,C", "Gross Score": 72, "Net Score": 67, "Full Course Handicap": 5 },
  ]);
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

test("Calcutta publication readiness identifies the exact players blocking a completed round", () => {
  const readiness = calcuttaPublicationReadiness({
    year: 2026,
    purchases: ["A", "B", "C"].map((id) => ({ Year: 2026, "Golfer Player ID": id })),
    roundResults: [
      { Year: 2026, Round: 1, Format: "Singles", "Player ID": "A", "Gross Score": 75 },
      { Year: 2026, Round: 1, Format: "Singles", "Player ID": "B", "Gross Score": 76 },
    ],
  });
  assert.equal(readiness.rounds[0].qualifies, false);
  assert.deepEqual(readiness.rounds[0].missingPlayers, ["C"]);
  assert.equal(readiness.rounds[0].availablePlayers.length, 2);
});

test("Preview finalization exposes generated rows and workbook read-back diagnostics", async () => {
  const [route, control] = await Promise.all([
    readFile(new URL("../app/api/live-matches/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/live-matches/LiveMatchControl.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /includeCalcuttaPublicationTrace: process\.env\.VERCEL_ENV === "preview"/);
  assert.match(route, /calcuttaPublication/);
  assert.match(control, /Preview Calcutta Publication Diagnostics/);
  assert.match(control, /JSON\.stringify\(calcuttaTrace\.trace \|\| calcuttaTrace/);
});

test("published results remain authoritative while payouts are derived exclusively from Calcutta Payout", () => {
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
  publishedStandings[0]["Current Payout Value"] = 999999;
  publishedStandings[0]["Round 1 Payout %"] = 9.99;
  publishedStandings[0]["Total Payout %"] = 9.99;
  const official = buildCalcuttaModel({
    year: 2026, players,
    purchases: [{ Year: 2026, "Golfer Player ID": "A", "Purchase Price": 100 }, { Year: 2026, "Golfer Player ID": "B", "Purchase Price": 200 }, { Year: 2026, "Golfer Player ID": "C", "Purchase Price": 50 }],
    ownership: [], pointStructure: [{ Year: 2026, Place: 1, "Round 1 Award": 999 }],
    payoutStructure: [
      { Year: 2026, Place: 1, "Round 1 Award %": "10%", "Overall Award %": "20%" },
      { Year: 2026, Place: 2, "Round 1 Award %": "5%", "Overall Award %": "10%" },
      { Year: 2026, Place: 3, "Round 1 Award %": "3%", "Overall Award %": "5%" },
    ],
    roundResults: publishedRoundResults, standings: publishedStandings,
  });
  assert.equal(official.source.mode, "official");
  const publishedLeader = official.golfers.find((row) => row.playerId === publishedStandings[0]["Player ID"]);
  assert.notEqual(publishedLeader.currentPayoutValue, 999999);
  assert.ok(publishedLeader.currentPayoutValue <= official.pot);
  assert.equal(official.golfers.reduce((sum, golfer) => sum + golfer.currentPayoutValue, 0), official.distributedPrizePool);
});

test("golfer and fully allocated owner payouts conserve the distributed prize pool", () => {
  const model = buildCalcuttaModel({
    year: 2026,
    players,
    purchases: ["A", "B", "C"].map((id) => ({ Year: 2026, "Golfer Player ID": id, "Purchase Price": 100 })),
    ownership: ["A", "B", "C"].map((id) => ({ Year: 2026, "Golfer Player ID": id, "Owner Player ID": "O1", "Ownership %": "100%" })),
    pointStructure: [1000, 500, 250].map((points, index) => ({ Year: 2026, Place: index + 1, "Round 1 Award": points })),
    payoutStructure: [
      { Year: 2026, Place: 1, "Round 1 Award %": "20%", "Overall Award %": "30%" },
      { Year: 2026, Place: 2, "Round 1 Award %": "10%", "Overall Award %": "20%" },
      { Year: 2026, Place: 3, "Round 1 Award %": "5%", "Overall Award %": "15%" },
    ],
    roundResults: [
      { Year: 2026, Round: 1, Format: "BB", "Player ID": "A", "Gross Score": 70, "Net Score": 65 },
      { Year: 2026, Round: 1, Format: "BB", "Player ID": "B", "Gross Score": 72, "Net Score": 67 },
      { Year: 2026, Round: 1, Format: "BB", "Player ID": "C", "Gross Score": 74, "Net Score": 69 },
    ],
  });
  const golferTotal = model.golfers.reduce((sum, golfer) => sum + golfer.currentPayoutValue, 0);
  const ownerTotal = model.portfolios.reduce((sum, owner) => sum + owner.currentPayoutValue, 0);
  assert.equal(golferTotal, model.pot);
  assert.equal(ownerTotal, model.pot);
  assert.equal(model.distributedPrizePool, model.pot);
  assert.equal(model.golfers[0].rounds[1].payoutPercent, 0.2);
  assert.equal(model.golfers[0].rounds[1].configuredPayoutPercent, 0.2);
  assert.equal(model.golfers[0].rounds[1].guaranteedWinnings, model.pot * model.golfers[0].rounds[1].payoutPercent);
  assert.equal(model.completedRounds.join(","), "1");
  assert.equal(model.tournamentComplete, false);
  assert.equal(model.golfers.reduce((sum, golfer) => sum + golfer.guaranteedWinnings, 0), model.guaranteedDistributed);
  assert.equal(model.remainingPrizePool, model.pot - model.guaranteedDistributed);
  assert.equal(model.portfolios.reduce((sum, owner) => sum + owner.guaranteedWinnings, 0), model.guaranteedDistributed);
  for (const golfer of model.golfers) {
    assert.equal(golfer.currentPayoutValue, golfer.guaranteedWinnings + golfer.remainingUpside);
    for (const round of Object.values(golfer.rounds)) {
      assert.equal(round.guaranteedWinnings, model.pot * round.payoutPercent);
      assert.ok(round.configuredPayoutPercent >= 0);
    }
  }
});

test("Round 3 completion transitions projected Calcutta wording to final winnings", () => {
  const componentPromise = readFile(new URL("../app/live/CalcuttaExperience.js", import.meta.url), "utf8");
  return componentPromise.then((component) => {
    assert.match(component, /Guaranteed Winnings/);
    assert.match(component, /<small>Guaranteed<\/small>/);
    assert.match(component, /Calcutta Points/);
    assert.doesNotMatch(component, /Total Points/);
    assert.match(component, /If the tournament ended today\./);
    assert.match(component, /<small>Finish<\/small>/);
    assert.match(component, /Round not yet completed\./);
    assert.match(component, /Results will appear once official\./);
    assert.match(component, /Current Rank/);
    assert.doesNotMatch(component, /<small>Round Payout<\/small>/);
    assert.match(component, /Projected Tournament Value/);
    assert.match(component, /Final Tournament Winnings/);
    assert.match(component, /Final Calcutta/);
    assert.match(component, /Final Winnings Distributed/);
    assert.match(component, /If the tournament ended today\./);
    assert.match(component, /ordinalPlace/);
    assert.doesNotMatch(component, /golfer\.owners\.length > 1 \? "— " : ""/);
    assert.match(component, /<b>\{payoutPercent\(owner\.ownership\)\}<\/b>/);
    assert.doesNotMatch(component, /\{payoutPercent\(owner\.ownership\)\} Ownership/);
    assert.match(component, /tournamentComplete \? "Final ROI" : "Projected ROI"/);
    assert.match(component, /tournamentComplete \? null : "If the tournament ended today\."/);
    assert.match(component, /Golfers Owned/);
    assert.match(component, /Portfolio Performance/);
    assert.match(component, /Portfolio Summary/);
    assert.match(component, /Since Opening Auction/);
    assert.match(component, /Investment Breakdown/);
    assert.match(component, /projectedTotal > 0 \? Number\(investment\.currentPayoutValue \|\| 0\) \/ projectedTotal : equalContribution/);
    assert.match(component, /role="progressbar"/);
    assert.match(component, /aria-valuenow=\{contributionPercent\}/);
    assert.ok(component.indexOf('aria-label="Portfolio Summary"') < component.indexOf('aria-label="Portfolio Performance"'));
    assert.ok(component.indexOf('aria-label="Portfolio Performance"') < component.indexOf('className={styles.investments}'));
    assert.ok(component.indexOf('className={styles.investments}') < component.indexOf('aria-label="Investment Breakdown"'));
    assert.match(component, /Updates after official round results\./);
    assert.match(component, /Updates as official results are published\./);
    assert.match(component, /data-zero=\{!investment\.currentPayoutValue/);
  });
});

test("Calcutta financial presentation progresses cleanly from opening through final", () => {
  const purchases = [
    { Year: 2026, "Golfer Player ID": "A", "Purchase Price": 400 },
    { Year: 2026, "Golfer Player ID": "B", "Purchase Price": 350 },
    { Year: 2026, "Golfer Player ID": "C", "Purchase Price": 250 },
  ];
  const pointStructure = [30, 20, 10].map((award, index) => ({ Year: 2026, Place: index + 1, "Round 1 Award": award, "Round 2 Award": award, "Round 3 Award": award }));
  const payoutStructure = [
    { Year: 2026, Place: 1, "Round 1 Award %": 5, "Round 2 Award %": 5, "Round 3 Award %": 5, "Overall Award %": 50 },
    { Year: 2026, Place: 2, "Round 1 Award %": 3, "Round 2 Award %": 3, "Round 3 Award %": 3, "Overall Award %": 15 },
    { Year: 2026, Place: 3, "Round 1 Award %": 2, "Round 2 Award %": 2, "Round 3 Award %": 2, "Overall Award %": 5 },
  ];
  const roundRows = (round, order) => order.map((playerId, index) => ({ Year: 2026, Round: round, Format: round === 3 ? "Singles" : round === 2 ? "Scramble" : "Best Ball", "Player ID": playerId, "Gross Score": 70 + index, "Net Score": 60 + index }));
  const build = (roundResults) => buildCalcuttaModel({ year: 2026, players, purchases, pointStructure, payoutStructure, roundResults });
  const opening = build([]);
  const afterRound1 = build(roundRows(1, ["A", "B", "C"]));
  const afterRound2 = build([...roundRows(1, ["A", "B", "C"]), ...roundRows(2, ["B", "A", "C"])]);
  const final = build([...roundRows(1, ["A", "B", "C"]), ...roundRows(2, ["B", "A", "C"]), ...roundRows(3, ["A", "B", "C"])]);
  assert.deepEqual(opening.completedRounds, []);
  assert.equal(opening.guaranteedDistributed, 0);
  assert.deepEqual(afterRound1.completedRounds, [1]);
  assert.equal(afterRound1.guaranteedDistributed, 100);
  assert.deepEqual(afterRound2.completedRounds, [1, 2]);
  assert.equal(afterRound2.guaranteedDistributed, 200);
  assert.equal(final.tournamentComplete, true);
  assert.deepEqual(final.completedRounds, [1, 2, 3]);
  assert.equal(final.distributedPrizePool, 1000);
  assert.equal(final.guaranteedDistributed, 1000);
  assert.equal(final.remainingPrizePool, 0);
});

test("Calcutta is integrated into Tournament with one mobile-safe bottom-sheet scroller", async () => {
  const [dashboard, dashboardCss, component, css, loader, protection, writer] = await Promise.all([
    readFile(new URL("../app/live/TournamentDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/tournament-dashboard.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/live/CalcuttaExperience.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/calcutta.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/workbook-protection.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /aria-label="Select tournament destination"/);
  assert.match(dashboard, />Tournament<\/button>/);
  assert.match(dashboard, />Calcutta<\/button>/);
  assert.match(dashboard, /selectedRound === "calcutta" \? <CalcuttaExperience/);
  assert.match(dashboard, /aria-label="Select tournament round"/);
  assert.match(dashboard, /aria-label="Filter tournament matches"/);
  assert.match(dashboardCss, /\.destinations\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(dashboardCss, /\.rounds\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(dashboardCss, /\.filters\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(dashboardCss, /\.destinations,.rounds,.filters\{[^}]*overflow:visible/);
  assert.match(component, /Current Pot/);
  assert.match(component, /Golfers/);
  assert.match(component, /Portfolios/);
  assert.ok(component.indexOf('className={styles.tabs}') < component.indexOf('<Hero model={model} />'));
  assert.match(component, /Calcutta Storylines/);
  assert.match(component, /BB: "Best Ball", SC: "Scramble", SI: "Singles"/);
  assert.match(css, /\.sheet\{[^}]*overflow-y:auto/);
  assert.match(css, /\.sheet\{align-content:start;grid-auto-rows:max-content\}/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.investments article>span:first-child\{grid-column:1\/-1\}/);
  assert.match(css, /\.investmentBreakdown article>i\{[^}]*height:7px/);
  assert.match(css, /\.portfolioPerformance>div\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.investmentBreakdown article\[data-zero=true\]\{opacity:\.58\}/);
  assert.match(css, /\.hero>div p:last-child:nth-child\(odd\)\{grid-column:1\/-1/);
  assert.match(loader, /buildCalcuttaModel/);
  assert.doesNotMatch(loader, /fetchOptionalSheet\("Round Results"\)/);
  assert.match(loader, /roundResults: calcuttaRoundResults/);
  assert.match(writer, /export async function publishOfficialCalcutta/);
  assert.match(writer, /getTournamentData\(\)/);
  assert.match(writer, /calcuttaRoundResultsFromTournamentModel/);
  assert.doesNotMatch(writer, /rows\("Round Results"\)/);
  assert.match(writer, /trace\.workbookSchemas/);
  assert.match(writer, /expected, actual, missing/);
  const standingsHeaderDeclaration = writer.match(/const CALCUTTA_STANDINGS_HEADERS = \[([^;]+)\];/)?.[1] || "";
  assert.doesNotMatch(standingsHeaderDeclaration, /Overall Payout %/);
  assert.match(standingsHeaderDeclaration, /Total Payout %/);
  assert.match(writer, /replaceScopedRuntimeRecordSets/);
  assert.match(writer, /withWorkbookWriteDiagnostics\("calcutta-publication"/);
  assert.match(writer, /await synchronizeCalcuttaAfterOfficialUpdate\(nextLive, \{ tournamentModel \}\)/);
  assert.match(writer, /await synchronizeCalcuttaAfterOfficialUpdate\(next\)/);
  assert.match(writer, /const retryable = result\.reason === "no-completed-rounds"/);
  assert.match(writer, /Calcutta publication trace/);
  assert.match(writer, /generatedRoundResultRows/);
  assert.match(writer, /firstFiveGeneratedRows/);
  assert.match(writer, /readBackVerified/);
  assert.match(writer, /rowsPresentAfterWrite/);
  assert.match(writer, /isTransientGoogleError/);
  assert.match(writer, /result\.trace\?\.exception\?\.transient/);
  assert.match(writer, /readCalcuttaPublicationSheets/);
  assert.match(writer, /Calcutta input worksheet '\$\{tab\}' could not be read/);
  for (const sheet of ["Calcutta Purchases", "Calcutta Ownership", "Calcutta Point Structure", "Calcutta Payout", "Calcutta Round Results", "Calcutta Standings", "Calcutta Owner Leaderboard"]) {
    assert.match(loader, new RegExp(`fetchOptionalSheet\\(\\"${sheet}\\"\\)|\\"${sheet}\\"`));
    assert.match(protection, new RegExp(`\\"${sheet}\\"`));
  }
});
