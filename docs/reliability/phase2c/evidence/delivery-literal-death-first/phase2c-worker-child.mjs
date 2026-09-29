// Only an IPC handoff from the owned-cluster proof helper can start this process.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { binaries, jsonLiteral } from './postgres17.mjs';
import { runtimeScope, syntheticDirector } from './synthetic-tournament.mjs';
import { runScoreDerivedWorker } from '../../../lib/score-derived-worker.js';
import { createScoreDerivedDeliveryAdapter } from '../../../lib/score-derived-delivery.js';
assert.equal(process.argv.length, 2); assert.equal(typeof process.send, 'function');
const controller = new AbortController();
let releaseHeldWrite = () => {};
process.on('SIGTERM', () => controller.abort());
process.on('disconnect', () => controller.abort());
let started = false;
process.on('message', async message => {
  if (message?.type === 'stop') { controller.abort(); releaseHeldWrite(); return; }
  if (message?.type === 'release-held-write') { releaseHeldWrite(); return; }
  if (message?.type !== 'start' || started) return;
  started = true;
  try {
    assert.equal(path.dirname(path.resolve(message.directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(message.directory), /^bagger-reliability-pg17-/);
    assert.equal(path.resolve(message.socket), path.join(path.resolve(message.directory), 'socket'));
    assert.match(message.database, /^[a-z][a-z0-9_]{0,62}$/);
    assert.ok(Number.isInteger(message.port) && message.port > 1024 && message.port < 65536);
    const environment = { PATH: process.env.PATH || '', PGHOST: message.socket, PGPORT: String(message.port), PGUSER: 'postgres',
      PGOPTIONS: '-c statement_timeout=5000 -c timezone=UTC -c request.jwt.claim.role=service_role', PGAPPNAME: 'phase2c-owned-delivery-child' };
    const query = statement => {
      const result = spawnSync(binaries.psql, ['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
        '-h',message.socket,'-p',String(message.port),'-U','postgres','-d',message.database],
      { env: environment, input: statement, encoding: 'utf8', maxBuffer: 16*1024*1024, timeout: 7000 });
      if (result.status !== 0) {
        const sqlstate = result.stderr?.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];
        const error = new Error('LOCAL_DERIVED_SQL_FAILED');
        error.code = sqlstate || (result.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'CONNECTION_FAILED');
        error.sqlstate = sqlstate; throw error;
      }
      return result.stdout.trim();
    };
    assert.equal(realpathSync(query('show data_directory')), realpathSync(path.join(message.directory, 'data')));
    assert.equal(query('show statement_timeout'), '5s');
    assert.equal(query('show timezone'), 'UTC');
    const allowed = new Set(['score_derived_delivery_tick_v1','fail_score_derived_preclaim_v1','inspect_production_cutover_authority',
      'claim_production_calcutta_v1_recalculation','complete_production_calcutta_v1_recalculation','fail_production_calcutta_v1_recalculation',
      'claim_competition_derived_jobs','write_competition_derived_snapshot','mark_competition_derived_job_failed',
      'claim_intelligence_derived_bundle','write_intelligence_derived_bundle','fail_intelligence_derived_bundle_v1']);
    const scope = runtimeScope({ player_id: syntheticDirector.playerId });
    let faultUsed = false; let heldWriteBarrier = null;
    const committedClaims = new Set();
    if (message.fault?.action === 'hold-during-calculation') {
      assert.ok(['CALCUTTA','COMPETITION','INTELLIGENCE'].includes(message.fault.family));
      globalThis[Symbol.for('phase2c.calculationDeathBarrier')] = metadata => {
        if (faultUsed || metadata.family !== message.fault.family || !committedClaims.has(metadata.family)) return;
        faultUsed = true;
        const instrumentedSourceSha256 = globalThis[Symbol.for('phase2c.calculationInstrumentedHashes')]?.get(metadata.family);
        assert.match(instrumentedSourceSha256, /^[a-f0-9]{64}$/);
        process.send({type:'held-during-calculation', ...metadata, instrumentedSourceSha256,
          claimCommitted:true, barrierTimeoutMs:10000});
        // The real calculator is still on this process's synchronous call stack.
        // Parent must SIGKILL here; a missed kill fails closed after a bounded wait.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
        throw Object.assign(new Error('CALCULATION_CRASH_BARRIER_NOT_KILLED'), {code:'CALCULATION_CRASH_BARRIER_NOT_KILLED'});
      };
    }
    const rpc = async (name, input) => {
      assert.ok(allowed.has(name), 'local RPC allowlist');
      const body = { ...scope, ...input };
      const injectScore = () => {
        assert.ok(message.fault.scoreInput && typeof message.fault.scoreInput === 'object');
        const accepted = JSON.parse(query(`select public.submit_production_hole_score(${jsonLiteral(message.fault.scoreInput)})`));
        assert.equal(accepted.ok, true); assert.equal(accepted.code, 'ACCEPTED');
        const pending = Number(query("select count(*) from scoring_authority.score_derived_intents_v1 where family='COMPETITION' and status<>'SUCCEEDED'"));
        process.send({ type: 'injected-score', operation: name, position: message.fault.action, pendingCompetitionIntents: pending });
      };
      if (message.fault && !faultUsed && name === message.fault.operation && message.fault.action === 'score-before') {
        faultUsed = true; injectScore();
      }
      if (message.fault && (!faultUsed || (message.fault.allMatching && heldWriteBarrier)) && name === message.fault.operation && message.fault.action === 'hold-before-write') {
        faultUsed = true;
        // Competition writes its two claimed engines in parallel. The explicit
        // proof option holds that entire first batch behind one release signal.
        if (!heldWriteBarrier) heldWriteBarrier = new Promise(resolve => {
          releaseHeldWrite = () => { heldWriteBarrier = null; resolve(); };
        });
        process.send({type:'held-before-write',operation:name,engine:body.engine_key || null});
        await heldWriteBarrier;
        if (controller.signal.aborted) throw Object.assign(new Error('Worker stopped'), {name:'AbortError'});
      }
      const result = JSON.parse(query(`select public.${name}(${jsonLiteral(body)})`));
      if (name === 'claim_production_calcutta_v1_recalculation' && result.ok === true && result.job) committedClaims.add('CALCUTTA');
      if (name === 'claim_competition_derived_jobs' && result.ok === true && result.claims?.length > 0) committedClaims.add('COMPETITION');
      if (name === 'claim_intelligence_derived_bundle' && result.ok === true && result.empty !== true && result.claim_token) committedClaims.add('INTELLIGENCE');
      if (message.fault && !faultUsed && name === message.fault.operation && message.fault.action === 'score-after') {
        faultUsed = true; injectScore();
      }
      if (message.fault && !faultUsed && name === message.fault.operation) {
        faultUsed = true;
        if (message.fault.action === 'crash') {
          process.send({ type: 'injected-crash', operation: name }, () => process.exit(77));
          await new Promise(() => {});
        }
        if (message.fault.action === 'unknown-ack') { process.send({type:'injected-ack-loss',operation:name}); throw Object.assign(new Error('TRANSPORT_ACK_LOST'), { code: 'CONNECTION_FAILED' }); }
      }
      return { ok: true, payload: result, durationMs: 0 };
    };
    const read = name => async () => ({ payload: JSON.parse(query(`select public.${name}('2026'${name === 'read_published_odds_view' ? ',' + jsonLiteral(scope.source_workbook_id) + "#>>'{}'" : ''})`)), durationMs: 0 });
    const context = { runtime: { tournamentId: '2026', runtimeGenerationId: null } };
    const adapter = createScoreDerivedDeliveryAdapter({ rpc, env: { VERCEL_ENV: 'production' }, resolveContext: async () => context,
      financialOptions: { dependencies: { rpc, getActivation: () => ({}) } },
      reads: { readLeaderboardsCoreView: read('read_leaderboards_core_view'),
        readNetSkinsResultView: read('read_net_skins_result_view'), readPublishedOddsView: read('read_published_odds_view') } });
    const result = await runScoreDerivedWorker({ ...adapter, signal: controller.signal, intervalMs: message.intervalMs,
      workerId: message.workerId, emit: event => { if (process.connected) process.send(event); } });
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    if (process.connected) process.send({ type: 'startup-failed', code: error.code || error.name || 'LOCAL_WORKER_FAILED' });
    process.exitCode = 1;
  } finally { if (process.connected) process.disconnect(); }
});
