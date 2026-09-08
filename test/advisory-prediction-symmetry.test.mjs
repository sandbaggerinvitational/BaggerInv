import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ADVISORY_PREDICTION_ENGINE_VERSION, predict, playingHandicaps } from "../lib/prediction-engine.js";
import { WAR_ROOM_CALCULATION_ENGINE_VERSIONS, calculationInvocationFingerprint } from "../lib/war-room-calculation-parity.js";
import { buildTeamIntelligenceLineupRuntime } from "../lib/team-intelligence-lineup-runtime.js";
import { optimizeLineups } from "../lib/lineup-optimizer.js";
import { fixture, evaluate, assertSwap, certifyUniverse } from "./helpers/advisory-symmetry-certification.mjs";

const ids = ["a", "b", "c", "d"];
function neutral(format, overrides = {}) {
  const players = ids.slice(0, format === "SI" ? 2 : 4).map(id => ({ id }));
  return predict({ format, players, historical: {}, partnership: {}, headToHead: {}, settings: {},
    handicap: playingHandicaps(format, players.map(() => 0)), ...overrides });
}
for (const format of ["BB", "SC", "SI"]) {
  test(`${format}: neutral has no artificial Team-A advantage`, () => {
    const p = neutral(format);
    assert.deepEqual([p.teamA, p.tie, p.teamB], [43, 14, 43]);
    assertSwap(p, p);
  });
  test(`${format}: complete captured roster universe is deterministic and side-invariant`, () => {
    const report = certifyUniverse(format);
    assert.equal(report.matchups, format === "SI" ? 144 : 4356);
    assert.equal(report.pairsPerTeam, format === "SI" ? 12 : 66);
    assert.equal(report.swapMismatches, 0);
  });
}
test("partnerships retain relative signal, including opponent-only changes and equal strong pairs", () => {
  const history = wins => ({ record: { matches: 10, wins, halves: 0 }, byFormat: {} });
  for (const format of ["BB", "SC"]) {
    const p = neutral(format, { partnership: { "a|b": history(10), "c|d": history(0) } });
    const r = neutral(format, { players: ["c", "d", "a", "b"].map(id => ({ id })), partnership: { "a|b": history(10), "c|d": history(0) } });
    assertSwap(p, r);
    assert.ok(p.teamA > p.teamB);
    assert.deepEqual(p.components.team, [100, 0]);
    assert.equal(p.teamVibes.teamA.score, 100, "retain raw partnership evidence");
    const opponentStrong = neutral(format, { partnership: { "c|d": history(10) } });
    const opponentWeak = neutral(format, { partnership: { "c|d": history(0) } });
    assert.ok(opponentStrong.teamA < opponentWeak.teamA);
    const equal = neutral(format, { partnership: { "a|b": history(10), "c|d": history(10) } });
    assert.equal(equal.teamA, equal.teamB);
  }
});
test("unequal strength, plus handicaps, caps and within-team order stay symmetric", () => {
  const players = [...fixture.teams.team1.players, ...fixture.teams.team2.players];
  for (const format of ["BB", "SC", "SI"]) {
    const selected = (format === "SI" ? ["MB01", "CS01"] : ["MB01", "HM01", "CS01", "TL01"]).map(id => players.find(p => p.id === id));
    const split = selected.length / 2, swapped = [...selected.slice(split), ...selected.slice(0, split)];
    for (const bounds of [[10, 90], [20, 65], [0, 100]]) {
      const settings = { ...fixture.settings, "Minimum Win Probability": bounds[0], "Maximum Win Probability": bounds[1],
        "Underlying Skill Points Per Handicap": 100, "Maximum Underlying Skill Adjustment": 100 };
      const p = evaluate(format, selected, { settings }), r = evaluate(format, swapped, { settings });
      assertSwap(p, r);
      assert.ok(p.teamA >= bounds[0] && p.teamB >= bounds[0]);
      assert.ok(p.teamA <= bounds[1] && p.teamB <= bounds[1]);
      if (split === 2) assert.deepEqual(
        [p.teamA, p.tie, p.teamB],
        (() => { const x = evaluate(format, [selected[1], selected[0], selected[3], selected[2]], { settings }); return [x.teamA, x.tie, x.teamB]; })());
    }
  }
});
test("audited Caleb/Holman versus Jupjee/Max fixture reconciles", () => {
  const roster = [...fixture.teams.team1.players, ...fixture.teams.team2.players];
  const selected = ["CL01", "HM01", "JK01", "MM01"].map(id => roster.find(p => p.id === id));
  const p = evaluate("BB", selected), r = evaluate("BB", [...selected.slice(2), ...selected.slice(0, 2)]);
  assertSwap(p, r);
  assert.deepEqual([p.teamA, p.tie, p.teamB], [50, 11, 39]);
});
test("half-percentage boundaries round each perspective consistently", () => {
  const a = neutral("SI", { handicap: { raw: [0, 1], strokesA: 0, strokesB: 0 } });
  const b = neutral("SI", { handicap: { raw: [1, 0], strokesA: 0, strokesB: 0 } });
  assert.equal(a.calibration.finalCappedProbability, 43.5);
  assert.deepEqual([a.teamA, a.tie, a.teamB], [44, 13, 43]);
  assertSwap(a, b);
});
test("engine provenance changes only affected advisory invocation fingerprints", () => {
  for (const operation of ["matchup", "optimizer", "simulation", "calibration"]) {
    assert.ok(WAR_ROOM_CALCULATION_ENGINE_VERSIONS[operation].includes(ADVISORY_PREDICTION_ENGINE_VERSION));
  }
  assert.equal(neutral("BB").engineVersion, ADVISORY_PREDICTION_ENGINE_VERSION);
  assert.notEqual(
    calculationInvocationFingerprint({ engineVersion: "prediction-engine.js:sbi-postgres-handicap-parity-v2", bundleFingerprint: "same-input" }),
    calculationInvocationFingerprint({ engineVersion: ADVISORY_PREDICTION_ENGINE_VERSION, bundleFingerprint: "same-input" }));
  assert.equal(fixture.provenance.approvedHandicapRevision, 7);
  assert.equal(fixture.provenance.predictionSettingsRevision, 2);
});
test("Team Intelligence consumes the full corrected roster matrix once per format", () => {
  const courses = ["BB", "SC"].map(format => ({ Year: 2026, Format: format, "Course ID": "TPGC01", Course: "Turtle Point", Tee: "Gold" }));
  const sheets = { courses, scorecards: [{ "Course ID": "TPGC01", Course: "Turtle Point", Tee: "Gold",
    "Course Rating": fixture.scorecard.rating, "Slope Rating": fixture.scorecard.slope, Par: fixture.scorecard.par }],
    settings: Object.entries(fixture.settings).map(([Setting, Value]) => ({ Setting, Value })) };
  let calls = 0;
  const runtime = buildTeamIntelligenceLineupRuntime({ year: 2026, sheets, teams: fixture.teams, historical: fixture.historical,
    partnershipPredictionMap: fixture.partnerships, headToHead: fixture.headToHead,
    optimizer(options) { calls += 1; return optimizeLineups(options); } });
  assert.equal(calls, 2);
  for (const format of ["BB", "SC"]) {
    const actual = runtime.optimizerFor(format);
    const expected = optimizeLineups({ format, ...fixture.teams, scorecard: fixture.scorecard, historical: fixture.historical,
      partnerships: fixture.partnerships, headToHead: fixture.headToHead, settings: fixture.settings });
    assert.deepEqual(actual, expected);
    assert.equal(actual.matchupCount, 4356);
    assert.equal(runtime.optimizerFor(format), actual);
  }
  assert.equal(calls, 2, "format selection retains existing memoization");
});
test("critical consumers share the engine; Championship Odds only imports unchanged utilities", () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const path of ["app/war-room/WarRoom.js", "lib/lineup-optimizer.js", "lib/scorecard-calibration-report.js", "lib/war-room-calculation-parity.js"]) {
    assert.match(source(path), /predict\(\{/);
  }
  assert.match(source("lib/team-intelligence-lineup-runtime.js"), /optimizer = optimizeLineups/);
  assert.match(source("app/war-room/WarRoom.js"), /Match Intelligence/);
  assert.match(source("lib/tournament-odds.js"), /import \{ formatCode, pick \} from "\.\/prediction-engine.js"/);
  assert.doesNotMatch(source("lib/tournament-odds.js"), /\bpredict\(/);
  assert.match(source("lib/lineup-optimizer.js"), /result\.winProbability < 40 \|\| result\.lossProbability - result\.winProbability >= 10/);
});
