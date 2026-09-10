import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnlyFetch, SURFACES, probeCanonicalInputs, auditParticipantProjections } from './support/canonical-projection-audit.mjs';
import { PRODUCTION_SUPABASE_URL } from '../lib/production-foundation-resource-contract.js';

const url = rpc => `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${rpc}`;
const post = input => ({ method: 'POST', body: JSON.stringify({ input }) });

test('read guard permits canonical read, forces redirect denial and enforces budget', async () => {
  let count = 0;
  const fetch = readOnlyFetch(async (_url, init) => { count++; assert.equal(init.redirect, 'error'); return 'safe'; }, { maximumRequests: 1 });
  assert.equal(await fetch(url('read_production_cutover_current_view'), post({ surface: 'PUBLISHED_ODDS' })), 'safe');
  await assert.rejects(fetch(url('read_production_guide_projection'), post({})), { code: 'AUDIT_REQUEST_BUDGET_EXCEEDED' });
  assert.equal(count, 1);
});

test('writes, arbitrary RPCs, alternate origins and redirects cannot reach transport', async () => {
  let count = 0;
  const fetch = readOnlyFetch(async () => { count++; });
  const cases = [
    [url('submit_score'), post({})],
    [url('publish_production_guide_draft_v1'), post({})],
    [url('read_production_guide_projection'), { method: 'DELETE' }],
    [url('read_production_guide_projection') + '?redirect=other', post({})],
    ['https://example.invalid/rest/v1/rpc/read_production_guide_projection', post({})],
    [PRODUCTION_SUPABASE_URL + '/auth/v1/otp', post({})],
    [PRODUCTION_SUPABASE_URL + '/rest/v1/scoring_matches', post({})],
    [url('read_production_cutover_current_view'), post({ surface: 'UNKNOWN' })],
    [url('authorize_production_current_match_access_v1'), post({ requested_action: 'FINALIZE' })],
    [url('read_production_guide_projection'), { method: 'POST', body: 'not-json' }],
  ];
  for (const args of cases) await assert.rejects(fetch(...args));
  assert.equal(count, 0);
});

test('the exact existing Match Detail authorization decision remains a permitted read', async () => {
  let calls = 0;
  const fetch = readOnlyFetch(async () => { calls++; });
  await fetch(url('authorize_production_current_match_access_v1'), post({ requested_action: 'VIEW_GAME_CENTER' }));
  assert.equal(calls, 1);
});

test('all six input probes plus Guide complete without configured authority or network', async () => {
  const previous = globalThis.fetch;
  const results = await probeCanonicalInputs();
  assert.deepEqual(results.map(x => x.surface), ['passport', 'history', 'records', 'odds', 'net-skins', 'calcutta', 'guide']);
  assert.equal(results.length, 7);
  assert.ok(results.every(x => x.state === 'CONTEXT_UNAVAILABLE'));
  assert.equal(globalThis.fetch, previous);
});

test('matrix continues across all fourteen missing inputs without fabricating identity', async () => {
  let exports = 0;
  const results = await auditParticipantProjections({ validate: () => true, consume: () => { exports++; } });
  assert.equal(new Set(SURFACES.map(x => x[0])).size, 14);
  assert.equal(results.length, 14);
  assert.equal(exports, 0);
  assert.ok(results.every(x => x.state !== 'DTO_SCHEMA_PASS'));
});

test('fixture rejection cannot export invalid data or leak thrown error contents', async () => {
  let exports = 0;
  const results = await auditParticipantProjections({
    identity: { playerId: 'SYNTHETIC', tournamentId: '2026', context: { membership: { active: true } } },
    dependencies: { readGuideProjection: () => { throw Error('synthetic-sensitive-error-must-not-escape'); } },
    validate: () => false, consume: () => { exports++; },
  });
  assert.equal(results.length, 14);
  assert.equal(exports, 0);
  assert.equal(JSON.stringify(results).includes('synthetic-sensitive-error'), false);
});
