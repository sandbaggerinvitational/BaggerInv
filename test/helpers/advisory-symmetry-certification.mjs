import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { courseHandicap, playingHandicaps, predict } from "../../lib/prediction-engine.js";
import { optimizeLineups } from "../../lib/lineup-optimizer.js";

export const fixture = JSON.parse(readFileSync(new URL("../fixtures/advisory-symmetry-2026.json", import.meta.url)));
export const FLOAT_TOLERANCE = 1e-9; // percentage points, unrounded diagnostic values only
const key = players => players.map(p => p.id).sort().join("|");
const pairs = players => players.flatMap((p, i) => players.slice(i + 1).map(q => [p, q]));
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
const round = (n, digits = 1) => Number(n.toFixed(digits));

export function evaluate(format, players, overrides = {}) {
  const enriched = players.map(p => ({ ...p, courseHandicap: courseHandicap(p.tournamentHandicap, fixture.scorecard.rating, fixture.scorecard.slope, fixture.scorecard.par) }));
  return predict({ format, players: enriched, historical: fixture.historical, partnership: fixture.partnerships,
    headToHead: fixture.headToHead, settings: fixture.settings,
    handicap: playingHandicaps(format, enriched.map(p => p.courseHandicap)), ...overrides });
}

export function assertSwap(a, b) {
  assert.equal(a.teamA, b.teamB);
  assert.equal(a.teamB, b.teamA);
  assert.equal(a.tie, b.tie);
  assert.equal(a.teamA + a.teamB + a.tie, 100);
  assert.ok([a.teamA, a.teamB, a.tie].every(p => Number.isFinite(p) && p >= 0 && p <= 100));
  assert.ok(Math.abs(a.rawScoreA + b.rawScoreA - 100) <= FLOAT_TOLERANCE);
  const unroundedTie = Math.max(6, Math.min(18, 14 - Math.abs(a.rawScoreA - 50) * .35));
  assert.ok(Math.abs(a.calibration.finalCappedProbability + b.calibration.finalCappedProbability + unroundedTie - 100) <= FLOAT_TOLERANCE);
  for (let i = 0; i < a.contributions.length; i += 1) {
    assert.ok(Math.abs(a.contributions[i].impact + b.contributions[i].impact) <= FLOAT_TOLERANCE);
  }
  const ep = p => 3 * (p.teamA + p.tie / 2) / 100;
  assert.ok(Math.abs(ep(a) + ep(b) - 3) <= FLOAT_TOLERANCE);
}

export function certifyUniverse(format = "BB") {
  const lineups = team => format === "SI" ? team.players.map(p => [p]) : pairs(team.players);
  const aPairs = lineups(fixture.teams.team1), bPairs = lineups(fixture.teams.team2);
  const matchups = [];
  for (const a of aPairs) for (const b of bPairs) {
    const prediction = evaluate(format, [...a, ...b]);
    const reversed = evaluate(format, [...b, ...a]);
    assertSwap(prediction, reversed);
    assert.deepEqual(evaluate(format, [...a, ...b]), prediction);
    matchups.push({ a: key(a), b: key(b), aLabel: a.map(p => p.name).join(" + "), bLabel: b.map(p => p.name).join(" + "),
      win: prediction.teamA, halve: prediction.tie, loss: prediction.teamB });
  }
  // Independent aggregation, checked against both optimizer team-input orders.
  const summaries = (lineupSet, side) => lineupSet.map(pair => {
    const rows = matchups.filter(m => m[side] === key(pair)).map(m => {
      const win = side === "a" ? m.win : m.loss, loss = side === "a" ? m.loss : m.win;
      return { opponent: side === "a" ? m.b : m.a, label: side === "a" ? m.bLabel : m.aLabel,
        win, halve: m.halve, loss, expected: 3 * (win + m.halve / 2) / 100 };
    });
    const wins = rows.map(m => m.win), avg = mean(wins);
    assert.equal(new Set(rows.map(m => m.opponent)).size, rows.length);
    return { id: key(pair), label: pair.map(p => p.name).join(" + "), counters: rows.length,
      favorable: rows.filter(m => m.win > m.loss).length,
      dangerous: rows.filter(m => m.win < 40 || m.loss - m.win >= 10).length,
      averageExpected: round(mean(rows.map(m => m.expected)), 2),
      averageW: round(avg), averageH: round(mean(rows.map(m => m.halve))), averageL: round(mean(rows.map(m => m.loss))),
      worstWin: Math.min(...wins), worstExpected: round(Math.min(...rows.map(m => m.expected)), 2),
      upside: Math.max(...wins), volatility: round(Math.sqrt(mean(wins.map(w => (w - avg) ** 2)))),
      worstFive: rows.sort((a, b) => a.expected - b.expected || a.win - b.win || a.opponent.localeCompare(b.opponent)).slice(0, 5) };
  });
  const teamA = summaries(aPairs, "a"), teamB = summaries(bPairs, "b");
  const options = { format, ...fixture.teams, scorecard: fixture.scorecard, historical: fixture.historical,
    partnerships: fixture.partnerships, headToHead: fixture.headToHead, settings: fixture.settings };
  const normal = optimizeLineups(options);
  const reversed = optimizeLineups({ ...options, team1: options.team2, team2: options.team1 });
  for (const [expected, actual] of [[teamA, normal.team1Pairings], [teamB, normal.team2Pairings], [teamA, reversed.team2Pairings], [teamB, reversed.team1Pairings]]) {
    for (const row of expected) {
      const actualRow = actual.find(r => key(r.players) === row.id);
      for (const [audit, runtime] of Object.entries({ counters: "opponentCount", favorable: "favorableMatchups", dangerous: "dangerousMatchups",
        averageExpected: "averageExpectedPoints", averageW: "averageWinProbability", averageH: "averageHalveProbability", averageL: "averageLossProbability",
        worstWin: "worstCaseWinProbability", worstExpected: "worstCaseExpectedPoints", upside: "bestCaseWinProbability", volatility: "volatility" })) {
        assert.equal(row[audit], actualRow[runtime], `${format} ${row.id} ${runtime}`);
      }
    }
  }
  const rank = rows => rows.sort((a, b) => b.averageExpected - a.averageExpected || b.averageW - a.averageW);
  return { format, matchups: matchups.length, pairsPerTeam: aPairs.length, swapMismatches: 0,
    floatingTolerance: FLOAT_TOLERANCE, publishedPercentageTolerance: 0, topPickles: rank(teamA).slice(0, 10), topLippit: rank(teamB).slice(0, 10) };
}
