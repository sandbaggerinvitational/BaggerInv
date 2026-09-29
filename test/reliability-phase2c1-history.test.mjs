// Proof layer: UNIT / INTEGRATION with injected canonical RPC responses.
// No PostgreSQL, hosted, real historical-data parity, or Production proof.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { completedHistoryReadEnvironment, isSupabaseCompletedHistoryYear } from "../lib/completed-history-read-source.js";
import { secondaryHistoryReadEnvironment } from "../lib/secondary-history-read-source.js";
import { historicalCourseReadEnvironment } from "../lib/historical-course-read-source.js";
import { history2026ReadEnvironment, isSupabaseHistory2026 } from "../lib/history-2026-read-source.js";

const env = Object.freeze({
  VERCEL_ENV: "preview",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-canonical-read-only",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
});
const selectors = [
  ["COMPLETED_HISTORY_READ_SOURCE", completedHistoryReadEnvironment],
  ["SECONDARY_HISTORY_READ_SOURCE", secondaryHistoryReadEnvironment],
  ["HISTORICAL_COURSE_READ_SOURCE", historicalCourseReadEnvironment],
  ["HISTORY_2026_READ_SOURCE", history2026ReadEnvironment],
];

for (const [variable, selector] of selectors) {
  test(`UNIT ${variable} requires canonical database authority and no Google configuration`, () => {
    assert.equal(selector(env).resolved, "supabase");
    assert.equal(selector(env).blocked, false);
    assert.equal(selector({ ...env, [variable]: "google" }).blocked, true);
    assert.notEqual(selector({ ...env, [variable]: "google" }).resolved, "google");
    for (const url of ["https://unapproved.supabase.co", "https://idgigvjjqkfbqjeredpb.supabase.co.evil.invalid", "https://user:secret@idgigvjjqkfbqjeredpb.supabase.co", "https://idgigvjjqkfbqjeredpb.supabase.co/path"]) {
      assert.equal(selector({ ...env, SUPABASE_SCORING_MIRROR_URL: url }).blocked, true);
    }
    assert.equal(selector({ ...env, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).blocked, true);
    assert.equal(selector({ ...env, VERCEL_ENV: "production" }).blocked, true);
  });
}

test("UNIT missing runtime configuration never selects Google for a supported History year", () => {
  for (let year = 2017; year <= 2025; year++) assert.equal(isSupabaseCompletedHistoryYear(year, {}), true);
  assert.equal(isSupabaseCompletedHistoryYear(2026, {}), false);
  assert.equal(isSupabaseHistory2026(2026, {}), true);
  assert.equal(isSupabaseHistory2026(2025, {}), false);
  assert.equal(history2026ReadEnvironment({ ...env, HISTORY_2026_TOURNAMENT_ID: "2099" }).blocked, true);
  assert.equal(history2026ReadEnvironment({ ...env, SCORING_AUTHORITY: "google" }).blocked, true);
  assert.equal(history2026ReadEnvironment({ ...env, SUPABASE_SCORING_MIRROR_ENABLED: "false" }).blocked, true);
});

function isolatedServiceProof(body) {
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|TOKEN|SECRET|SUPABASE|VERCEL|SCORING/i.test(key)));
  const source = `
    import assert from 'node:assert/strict';
    import { loadCompletedHistoryYears, loadCompletedHistoryView } from './lib/completed-history-service.js';
    import { loadHistory2026View } from './lib/history-2026-service.js';
    import { loadSecondaryHistoryModel } from './lib/secondary-history-service.js';
    import { buildCompletedHistoryPresentation } from './lib/completed-history-presentation-adapter.js';
    import { completedYearFixture } from './test/support/reliability/phase2c1-history-fixture.mjs';
    import { makeHistory2026Aggregate, makeGuideProjection } from './test/fixtures/history-2026.mjs';
    const env = ${JSON.stringify(env)};
    let networkAttempts = 0;
    globalThis.fetch = async () => { networkAttempts++; throw new Error('ZERO_NETWORK_GUARD'); };
    const payloads = Array.from({ length: 9 }, (_, i) => completedYearFixture({year: 2017+i,
      scoreAvailable: i >= 2, score: i >= 2 ? [3,0] : [null,null],
      cards: i >= 6 ? [
        {playerId:'P1',coverage:'COMPLETE',holes:Array(18).fill(4)},
        {playerId:'P2',coverage:'COMPLETE',holes:Array(18).fill(5)}
      ] : []}));
    const rpcCalls = [];
    const reader = async request => { rpcCalls.push(request); return {payload:{ok:true,data:request.mode==='YEARS'
      ? payloads.map(p=>p.revision) : payloads.find(p=>p.revision.tournament_year===request.year)}}; };
    ${body}
    assert.equal(networkAttempts,0);
    console.log(JSON.stringify({networkAttempts, googleConfigurationKeys: Object.keys(env).filter(k=>/GOOGLE|SHEETS|DRIVE|WORKBOOK/.test(k)), rpcRequests:rpcCalls.length}));
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", source], {
    cwd: new URL("../", import.meta.url), env: childEnv, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const proof = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(proof.networkAttempts, 0);
  assert.deepEqual(proof.googleConfigurationKeys, []);
  return proof;
}

test("INTEGRATION injected canonical YEAR reads render every2017–2025 year without Google", () => {
  const proof = isolatedServiceProof(`
    const completed = await loadCompletedHistoryYears({env,dependencies:{readCompletedHistory:reader}});
    assert.deepEqual(completed.views.map(v=>v.year),[2017,2018,2019,2020,2021,2022,2023,2024,2025]);
    assert.equal(completed.views.length,9);
    assert.equal(completed.views.every(v=>v.source==='supabase' && v.tournament.championTeam.id==='SIDE1'),true);
    assert.equal(completed.views[0].tournament['Final Score'],'');
    assert.equal(completed.views[1].tournament['Final Score'],'');
    assert.equal(completed.views.slice(0,6).every(v=>v.analytics.scorecards.length===0),true);
    assert.equal(completed.views.slice(6).every(v=>v.analytics.scorecards.length===2),true);
  `);
  assert.equal(proof.rpcRequests, 10);
});

test("INTEGRATION missing year and changed revision fail closed without historical fallback", () => {
  isolatedServiceProof(`
    await assert.rejects(loadCompletedHistoryYears({env,dependencies:{readCompletedHistory:async()=>({payload:{ok:true,data:payloads.slice(1).map(p=>p.revision)}})}}),{code:'COMPLETED_HISTORY_CERTIFIED_SEQUENCE_REQUIRED'});
    await assert.rejects(loadCompletedHistoryView({year:2017,env,expectedRevision:{...payloads[0].revision,revision_id:'unexpected'},dependencies:{readCompletedHistory:reader}}),{code:'COMPLETED_HISTORY_REVISION_CHANGED'});
    await assert.rejects(loadCompletedHistoryView({year:2017,env,dependencies:{readCompletedHistory:async()=>{throw new Error('ISOLATED_DATABASE_UNAVAILABLE');}}}),/ISOLATED_DATABASE_UNAVAILABLE/);
  `);
});

test("INTEGRATION 2026 canonical current/finalized History and Records work with no Google or network", () => {
  isolatedServiceProof(`
    const completed = await loadCompletedHistoryYears({env,dependencies:{readCompletedHistory:reader}});
    const aggregate = makeHistory2026Aggregate();
    const currentView = await loadHistory2026View({env,dependencies:{
      readHistory2026SupabaseView:async()=>({payload:{ok:true,data:aggregate}}),
      readGuideProjection:async()=>({payload:{ok:true,data:makeGuideProjection()}}),
    }});
    assert.equal(currentView.source,'supabase');
    assert.equal(currentView.year,2026);
    assert.equal(currentView.matches.length,24);
    const names = new Map([['P1','Player One'],['P2','Player Two'],...currentView.players.map(p=>[p['Player ID'],p['Display Name']])]);
    const profiles = {players:[...names].map(([id,name])=>({player_id:id,canonical_display_name:name,public_profile:{'Player ID':id,'Display Name':name,Slug:id.toLowerCase(),Active:true}}))};
    const model = await loadSecondaryHistoryModel({env,dependencies:{
      loadCompletedHistoryYears:async()=>completed,
      loadHistory2026View:async()=>currentView,
      readPreviewSecondaryHistoryPlayers:async()=>({payload:{ok:true,data:profiles}}),
    }});
    const records=model.calculations.getRecords();
    assert.equal(model.source,'supabase');
    assert.equal(model.diagnostics.completedMatches,9);
    assert.ok(records.all.some(row=>row.player['Player ID']==='P1'));
    assert.equal(model.diagnostics.currentFinalMatches,currentView.matches.filter(m=>m.lifecycle==='FINAL').length);
    assert.equal(model.diagnostics.currentNonFinalMatches,currentView.matches.filter(m=>m.lifecycle!=='FINAL').length);
    assert.equal(model.diagnostics.noFallback,true);
  `);
});
