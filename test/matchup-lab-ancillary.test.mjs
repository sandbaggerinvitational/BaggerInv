import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { courseFitPresentation } from "../lib/scorecard-intelligence-presentation.js";
import { buildMatchupScorecardIntelligence } from "../lib/scorecard-intelligence.js";
import { completeAdvisoryHoles, buildAdvisoryCourseProjections, selectAdvisoryHoles, advisoryStrokeMaps, simulateAdvisoryMatch } from "../lib/advisory-match-simulation.js";
import { playingHandicaps } from "../lib/prediction-engine.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "next/dist/build/swc/index.js";
import { certifyUniverse } from "./helpers/advisory-symmetry-certification.mjs";

const holes = Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 4, stroke_index: 18 - i, yardage: 400 + i }));
const context = { year: 2026, course: { "Course ID": "TPGC01", Round: "Round 1" }, tee: "Gold",
  scorecard: { "Course Rating": 71.9, "Slope Rating": 136, Par: 72 } };
const record = (rows = holes, overrides = {}) => ({ match: { tournament_id: "2026", round_number: 1, status: "UPCOMING",
  scored_holes: 0, unresolved_mutations: 0, scoring_locked: false, ...overrides },
  snapshot: { course_id: "TPGC01", tee: "Gold", rating: 71.9, slope: 136, par: 72 }, holes: rows, scores: [] });
const state = matches => ({ tournament: { tournament_id: "2026", tournament_year: 2026 }, matches });

test("course-fit finite better/worse/zero differ from absent or partial evidence", () => {
  for (const [value, expected] of [[-1.25, "1.25 better"], [1.25, "1.25 worse"], [0, "0.00 even"], [-0, "0.00 even"]]) {
    assert.equal(courseFitPresentation({ versusRecordedField: value }).comparison, expected);
  }
  for (const fit of [null, undefined, {}, { reasons: [] }, ...[null, undefined, NaN, Infinity, "0"].map(versusRecordedField => ({ versusRecordedField }))]) {
    const view = courseFitPresentation(fit);
    assert.equal(view.comparison, null);
    assert.equal(view.rounds, null);
    assert.equal(view.signal, "Insufficient Data");
    assert.deepEqual(view.reasons, []);
    assert.doesNotMatch([view.signal, view.confidence, view.comparison ?? "Unavailable"].join(" "), /NaN|undefined|null/);
  }
  assert.equal(courseFitPresentation({ courseTeeRounds: 0 }).rounds, 0);
});

test("unavailable course-fit model explicitly carries null comparisons", () => {
  const model = buildMatchupScorecardIntelligence({ scorecards: [], playerIds: ["A", "B"], sideSize: 1, format: "SI", selectedHoles: [], courseId: "TPGC01", tee: "Gold" });
  for (const profile of model.profiles) {
    assert.equal(profile.courseFit.versusRecordedField, null);
    assert.equal(courseFitPresentation(profile.courseFit).comparison, null);
    assert.doesNotMatch(profile.courseFit.reasons.join(" "), /NaN|undefined|null/);
  }
});

test("actual course-fit JSX renders unavailable and partial evidence without invalid text", async () => {
  const source = readFileSync(new URL("../app/war-room/RecordedScoringIntelligence.js", import.meta.url), "utf8");
  const component = source.slice(source.indexOf("function CourseFitCard("), source.indexOf("function PartnershipCard("));
  const compiled = await transform(component, { jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  const Card = new Function("React", "courseFitPresentation", "styles", `${compiled.code}; return CourseFitCard;`)(React, courseFitPresentation, {});
  for (const fit of [undefined, null, {}, { reasons: [], confidence: "Limited" }, { versusRecordedField: NaN }, { versusRecordedField: null }]) {
    const html = renderToStaticMarkup(React.createElement(Card, { player: { name: "Caleb Lewis" }, fit }));
    assert.match(html, /Recorded profile unavailable/);
    assert.doesNotMatch(html, /NaN|undefined|null|Versus Recorded Field/);
  }
  for (const [value, text] of [[-1, "1.00 better"], [1, "1.00 worse"], [0, "0.00 even"]]) {
    const html = renderToStaticMarkup(React.createElement(Card, { player: { name: "Caleb Lewis" }, fit: { versusRecordedField: value } }));
    assert.ok(html.includes(text));
    assert.doesNotMatch(html, /NaN|undefined|null/);
  }
});

test("captured revision-7/settings-2 optimizer top ordering remains certified for both teams", () => {
  const report = certifyUniverse("BB");
  assert.deepEqual(report.topPickles.slice(0, 3).map(r => r.id), ["CB01|HM01", "CL01|HM01", "BA01|MB01"]);
  assert.deepEqual(report.topLippit.slice(0, 3).map(r => r.id), ["JK01|RM01", "MS01|TL01", "JK01|MM01"]);
});

test("18-hole validator fails closed for absent, partial, duplicate, malformed and wrong-par definitions", () => {
  const valid = completeAdvisoryHoles(holes, 72);
  assert.equal(valid.length, 18);
  assert.deepEqual(completeAdvisoryHoles([...holes].reverse(), 72), valid);
  for (const rows of [null, [], holes.slice(1), [...holes, holes[0]], holes.map((h, i) => i ? h : { ...h, stroke_index: 1 }),
    holes.map((h, i) => i ? h : { ...h, hole_number: 2 }), holes.map((h, i) => i ? h : { ...h, par: NaN })]) {
    assert.deepEqual(completeAdvisoryHoles(rows, 72), []);
  }
  assert.deepEqual(completeAdvisoryHoles(holes, 71), []);
  assert.deepEqual(completeAdvisoryHoles(holes, null), []);
});

test("unpaired first match cannot mask agreeing canonical holes; projection is ephemeral and order-independent", () => {
  const input = state([record([]), record(), record()]), before = JSON.stringify(input);
  const projections = buildAdvisoryCourseProjections(input);
  assert.equal(projections[0].state, "READY");
  assert.equal(selectAdvisoryHoles(projections, context).length, 18);
  assert.deepEqual(buildAdvisoryCourseProjections(state([...input.matches].reverse())), projections);
  assert.equal(JSON.stringify(input), before);
  assert.equal(input.matches.every(r => !r.participants && !r.prepared_scoring_context), true);
  assert.equal(buildAdvisoryCourseProjections(state([record(holes, { status: "LIVE", scored_holes: 2 })]))[0].state, "READY");
});

test("started empty, partial, conflicting complete definitions and metadata fail closed", () => {
  for (const evidence of [{ status: "LIVE" }, { scored_holes: 1 }, { scoring_locked: true }, { scorecard_complete: true },
    { finalized_at: "2026-09-08" }, { result_winner: "Team 1" }, { team_1_points: 1 }, { unresolved_mutations: 1 }, { clinched: true }]) {
    assert.equal(buildAdvisoryCourseProjections(state([record([], evidence), record()]))[0].state, "CONFLICT");
  }
  const scored = record([]); scored.scores = [{}];
  const metadataConflict = record(); metadataConflict.snapshot.rating = 72;
  const holeConflict = record(holes.map((h, i) => ({ ...h, yardage: h.yardage + (i === 0 ? 1 : 0) })));
  for (const bad of [record(holes.slice(1)), scored, metadataConflict, holeConflict]) {
    const projections = buildAdvisoryCourseProjections(state([record(), bad]));
    assert.equal(projections[0].state, "CONFLICT");
    assert.deepEqual(selectAdvisoryHoles(projections, context, holes), []);
  }
});

test("missing current context never falls back to historical holes; exact year/round/course/tee scope required", () => {
  assert.deepEqual(buildAdvisoryCourseProjections(null), []);
  assert.deepEqual(selectAdvisoryHoles([], context, holes), []);
  const unavailable = buildAdvisoryCourseProjections(state([record([])]));
  assert.equal(unavailable[0].state, "UNAVAILABLE");
  assert.deepEqual(selectAdvisoryHoles(unavailable, context, holes), []);
  assert.equal(selectAdvisoryHoles(undefined, context, holes).length, 18, "existing legacy adapter remains supported");
  assert.deepEqual(buildAdvisoryCourseProjections(state([record(holes, { tournament_id: "2025" })])), []);
  const projections = buildAdvisoryCourseProjections(state([record()]));
  for (const override of [{ year: 2025 }, { tee: "Black" }, { course: { ...context.course, Round: 2 } },
    { course: { ...context.course, "Course ID": "OTHER" } }, { scorecard: { ...context.scorecard, "Slope Rating": 137 } }]) {
    assert.deepEqual(selectAdvisoryHoles(projections, { ...context, ...override }), []);
  }
});

test("24-match source serializes only three bounded course projections, not match or private context", () => {
  const matches = [1, 2, 3].flatMap(round => Array.from({ length: round === 3 ? 12 : 6 }, (_, i) => {
    const entry = record(round === 1 && i === 0 ? [] : holes, { round_number: round });
    entry.snapshot.snapshot_id = "private-evidence-id";
    entry.participants = [{ player_id: "PRIVATE" }];
    return entry;
  }));
  const projection = buildAdvisoryCourseProjections(state(matches));
  assert.equal(projection.length, 3);
  assert.equal(projection.every(p => p.state === "READY"), true);
  assert.ok(Buffer.byteLength(JSON.stringify(projection)) < 5000);
  assert.doesNotMatch(JSON.stringify(projection), /private-evidence-id|PRIVATE|participants|snapshot_id/);
});

for (const format of ["BB", "SC", "SI"]) {
  test(`${format} advisory simulation is deterministic, finite and exactly team-symmetric without official context`, () => {
    const selected = format === "SI" ? ["A", "C"] : ["A", "B", "C", "D"], split = selected.length / 2;
    const handicaps = format === "SI" ? [-0.5, 20] : [-0.5, 10.5, 20, 5.5];
    const courseHoles = selectAdvisoryHoles(buildAdvisoryCourseProjections(state([record([]), record()])), context);
    const maps = advisoryStrokeMaps(format, playingHandicaps(format, handicaps), courseHoles);
    assert.equal(maps.teamA.length, 18);
    assert.equal(maps.teamB.every(Number.isFinite), true);
    const options = { format, playerIds: selected, prediction: { teamA: 50, tie: 11, teamB: 39 }, strokeMaps: maps,
      teamNames: ["Pickles", "Lipp"], iterations: 10000, pointsAvailable: 3, seed: "2026|TPGC01|Gold" };
    const p = simulateAdvisoryMatch(options), again = simulateAdvisoryMatch(options);
    const reverse = simulateAdvisoryMatch({ ...options, playerIds: [...selected.slice(split), ...selected.slice(0, split)],
      prediction: { teamA: 39, tie: 11, teamB: 50 }, teamNames: ["Lipp", "Pickles"], strokeMaps: { teamA: maps.teamB, teamB: maps.teamA } });
    assert.deepEqual(p, again);
    for (const key of ["front", "back", "overall"]) {
      assert.equal(p.segmentProbabilities[key].teamA, reverse.segmentProbabilities[key].teamB);
      assert.equal(p.segmentProbabilities[key].halve, reverse.segmentProbabilities[key].halve);
    }
    assert.equal(p.expectedPoints.teamA, reverse.expectedPoints.teamB);
    assert.equal(p.expectedPoints.teamB, reverse.expectedPoints.teamA);
    assert.deepEqual(p.volatility, reverse.volatility);
    assert.deepEqual(p.likelyResults.map(r => [r.label, r.probability]), reverse.likelyResults.map(r => [r.label, r.probability]));
    assert.doesNotMatch(JSON.stringify(p), /NaN|undefined|null/);
    assert.equal(advisoryStrokeMaps(format, null, courseHoles), null);
    assert.equal(advisoryStrokeMaps(format, playingHandicaps(format, handicaps), []), null);
  });
}

test("UI and Supabase adapter keep advisory projection separate from prediction and official writes", () => {
  const ui = readFileSync(new URL("../app/war-room/WarRoom.js", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../lib/war-room-input-supabase.js", import.meta.url), "utf8");
  const presentation = readFileSync(new URL("../app/war-room/RecordedScoringIntelligence.js", import.meta.url), "utf8");
  assert.match(ui, /advisoryStrokeMaps\(format, basePlay, simulationHoles\)/);
  assert.match(ui, /handicap: play, settings/);
  assert.match(ui, /disabled=\{!simulationStrokeMaps\}/);
  assert.match(ui, /Official pairings and scoring preparation are not required/);
  assert.match(presentation, /courseFitPresentation\(fit\)/);
  assert.match(adapter, /scope === "war-room".*consumerData.advisoryCourses/);
  assert.equal((adapter.match(/await readOddsInputBundle\(/g) || []).length, 1);
  assert.doesNotMatch(ui + adapter, /prepare_scoring|MARK_LIVE|INSERT INTO|\.from\([\s\S]*?\.insert\(/);
});
