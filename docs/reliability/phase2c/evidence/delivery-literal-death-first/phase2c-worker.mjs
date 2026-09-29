// Isolated local child-process proof adapter. No URL, host or credential accepted.
import assert from 'node:assert/strict';
import os from 'node:os';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sql, jsonLiteral } from './postgres17.mjs';
import { runtimeScope } from './synthetic-tournament.mjs';
import { leaderboardsCoreDataFromSupabaseView } from '../../../lib/leaderboards-core-supabase.js';
import { netSkinsDataFromResultView } from '../../../lib/net-skins-supabase.js';
import { calculateCompetitionDerivedFromData } from '../../../lib/competition-derived-supabase.js';
import { calculateIntelligenceDerivedFromData, loadIntelligenceCanonicalInputs } from '../../../lib/intelligence-derived-supabase.js';
import { seedCalcuttaProcessorConfiguration } from './phase2-eligible-history.mjs';

export function prepareLocalScoreDerivedWorkerFixture(cluster, database) {
  seedCalcuttaProcessorConfiguration(cluster, database);
  sql(cluster, database, "update production_control.resource_scope set workers_enabled=true where scope_key='BAGGER_INV_PRODUCTION'", { role: '' });
  return { syntheticFinancialRules: true, workerEnabled: true, providers: false };
}
export async function startLocalScoreDerivedWorker({ cluster, database, intervalMs = 100,
  workerId = 'phase2c-local-worker', fault = null } = {}) {
  // The shared helper verifies the unforgeable in-process owned-cluster marker.
  assert.equal(sql(cluster, database, 'select 1'), '1');
  assert.ok(Number.isInteger(intervalMs) && intervalMs >= 10 && intervalMs <= 60000);
  const child = fork(fileURLToPath(new URL('./phase2c-worker-child.mjs', import.meta.url)), [], {
    execArgv: ['--conditions=react-server', '--require', fileURLToPath(new URL('../../../tools/reliability/phase2-network-deny.cjs', import.meta.url)),
      ...(fault?.action === 'hold-during-calculation' ? ['--import', fileURLToPath(new URL('./phase2c-calculation-crash-hook.mjs', import.meta.url))] : [])], env: { PATH: process.env.PATH || '', TMPDIR: os.tmpdir(),
      ...(process.env.BAGGER_RELIABILITY_PG_BIN ? { BAGGER_RELIABILITY_PG_BIN: process.env.BAGGER_RELIABILITY_PG_BIN } : {}) },
    stdio: ['ignore','pipe','pipe','ipc'],
  });
  const events = []; let errors = '', code = null;
  child.stderr.setEncoding('utf8'); child.stderr.on('data', value => { errors = (errors + value).slice(-8000); });
  child.stdout.on('data', value => { errors = (errors + value).slice(-8000); });
  child.on('message', event => { if (event && typeof event === 'object') events.push(event); });
  const exit = new Promise(resolve => child.once('exit', (value, signal) => { code = value; resolve({ code: value, signal, errors }); }));
  child.send({ type: 'start', directory: cluster.directory, socket: cluster.socket,
    data: cluster.data, port: cluster.port, database, intervalMs, workerId, fault });
  const waitFor = async (predicate, { timeoutMs = 30000, fromIndex = 0 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = events.slice(fromIndex).find(predicate); if (found) return found;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Local derived child exited: ${JSON.stringify({code,errors,events:events.slice(-8)})}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Local derived child wait exceeded ${timeoutMs}ms: ${JSON.stringify(events.slice(-12))}`);
  };
  try { await waitFor(event => event.type === 'started'); }
  catch (error) { child.kill('SIGTERM'); await exit; throw error; }
  return { child, events, exit, waitFor, async stop() {
    if (child.exitCode === null && child.signalCode === null) child.send({ type: 'stop' });
    const force = setTimeout(() => child.kill('SIGKILL'), 8000);
    try { return await exit; } finally { clearTimeout(force); }
  } };
}

/** Re-read canonical inputs under the worker timeout and independently calculate
 * source fingerprints with the unchanged production calculators. Call only after
 * the worker has reached a fresh idle event and scoring has stopped. */
export async function assertLocalDerivedCurrent(cluster, database) {
  const read = name => async () => {
    const workbook = name === 'read_published_odds_view' ? ',' + jsonLiteral(runtimeScope().source_workbook_id) + "#>>'{}'" : '';
    const payload = JSON.parse(sql(cluster, database, `set statement_timeout='5000ms';select public.${name}('2026'${workbook})`));
    assert.equal(payload.ok, true, name);
    return { payload, durationMs: 0 };
  };
  const core = leaderboardsCoreDataFromSupabaseView((await read('read_leaderboards_core_view')()).payload.data);
  const netSkins = netSkinsDataFromResultView((await read('read_net_skins_result_view')()).payload.data).netSkins;
  const competition = calculateCompetitionDerivedFromData({ ...core, netSkins });
  const intelligence = calculateIntelligenceDerivedFromData(await loadIntelligenceCanonicalInputs('2026', {
    readLeaderboardsCoreView: read('read_leaderboards_core_view'), readPublishedOddsView: read('read_published_odds_view'),
  }));
  const expected = { TEAM_MOMENTUM: competition.momentum.sourceFingerprint,
    TOURNAMENT_STORYLINES: competition.storylines.sourceFingerprint,
    TOURNAMENT_INTELLIGENCE: intelligence.sourceFingerprint, PROJECTION_EDITORIAL: intelligence.sourceFingerprint,
    ...(intelligence.recap.gate.eligible ? { TOURNAMENT_FINAL_RECAP: intelligence.sourceFingerprint } : {}) };
  const rows = JSON.parse(sql(cluster, database, `select coalesce(jsonb_agg(jsonb_build_object('engine',s.engine_key,
    'source',s.source_fingerprint,'status',j.status,'current',s.is_current)), '[]')
    from scoring_authority.competition_derived_snapshots s join scoring_authority.competition_recalculation_jobs j
      using(tournament_id,round_number,engine_key)
    where s.tournament_id='2026' and s.round_number=0 and s.is_current`));
  for (const [engine, fingerprint] of Object.entries(expected)) {
    const matching = rows.filter(row => row.engine === engine); assert.equal(matching.length, 1, engine + ' unique current snapshot');
    assert.equal(matching[0].status, 'SUCCEEDED', engine + ' completed job');
    assert.equal(matching[0].source, fingerprint, engine + ' current canonical source');
  }
  const financial = JSON.parse(sql(cluster, database, `set statement_timeout='5000ms';select jsonb_build_object(
    'currentCount',(select count(*) from scoring_authority.calcutta_v1_result_revisions where tournament_id='2026' and is_current),
    'exact',(select r.source_fingerprint=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))
      and j.status='SUCCEEDED' and r.source_fingerprint=j.source_fingerprint
      and r.configuration_revision=c.configuration_revision and r.auction_revision=c.auction_revision
      from scoring_authority.calcutta_v1_result_revisions r
      join scoring_authority.calcutta_v1_recalculation_jobs j on j.job_id=r.job_id
      join scoring_authority.calcutta_v1_current c on c.tournament_id=r.tournament_id
      where r.tournament_id='2026' and r.is_current))`));
  assert.equal(financial.currentCount, 1, 'one current Calcutta result');
  assert.equal(financial.exact, true, 'Calcutta current canonical source/configuration/auction and successful job');
  return { exactCanonicalSource: true, engines: Object.keys(expected), calcutta: financial,
    finalRecap: intelligence.recap.gate.eligible ? 'CURRENT' : 'WAITING_PUBLISHED_FINAL_GATE',
    netSkins: 'WAITING_OWNER', proof: 'ACTUAL_SQL_READS_AND_UNCHANGED_CALCULATORS' };
}
