// Test-only plan proof. No network client or PostgreSQL launch; use owned fixture callbacks.
// Invoke with the existing owned disposable query callback after the protected
// annual-history fixture has finished its scale's samples, before its cluster closes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const q = value => `'${String(value).replaceAll("'", "''")}'`;
const flatten = plan => [plan, ...(plan.Plans ?? []).flatMap(flatten)];
const digest = value => createHash('md5').update(value).digest('hex');
const uuid = value => {const h=digest(value); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};

export function captureAnnualAuditIndexPlans({query, database, scale, allowIsolatedFixture = false}) {
  assert.equal(allowIsolatedFixture, true, 'Explicit disposable-fixture assertion required');
  assert.ok([1,10].includes(scale), 'Only the requested 1x/10x counterfactuals are permitted');
  assert.equal(database, `phase2c_annual_history_${scale}`);
  const run = sql => query(database, sql, {role:''});
  const identity = JSON.parse(run(`select jsonb_build_object('database',current_database(),
    'socketOnly',inet_server_addr() is null,'version',current_setting('server_version'),
    'retainedAttempts',(select count(*) from production_control.score_derived_delivery_attempts_v1 where tournament_id between '2050' and '2089'),
    'retainedIntents',(select count(*) from scoring_authority.score_derived_intents_v1 where tournament_id between '2050' and '2089'))`));
  assert.equal(identity.database,database); assert.equal(identity.socketOnly,true);
  assert.equal(identity.retainedAttempts,4*scale*432*3); assert.equal(identity.retainedIntents,identity.retainedAttempts);

  const exactWork=uuid('annual-history:2050:1:CALCUTTA');
  // This is an exact-work forensic query for section264, not a claimed shipped RPC.
  // The finite cycle and row limit bound one work item's audit trail.
  const families=[{
    id:'ATTEMPT_EXACT_WORK_AUDIT', index:'production_control.score_derived_delivery_attempts_work_v1',
    purpose:'Proposed owner/internal forensic lookup. Shipped requeue currently uses its separate recovery_request_id unique index.',
    sql:`select event_id,cycle,attempt,transition,safe_code,recorded_at
      from production_control.score_derived_delivery_attempts_v1
      where tournament_id='2050' and family='INTENT' and work_identity=${q(exactWork)} and cycle=1
      order by event_id desc limit 16`, expectedRows:1,
  },{
    id:'CURRENT_TERMINAL_INTENT_STATUS', index:'scoring_authority.score_derived_intents_terminal_v1',
    purpose:'Exact terminal-intent subquery used by score_derived_delivery_tick_v1; current2099 state with unrelated retained history.',
    sql:`select 1 from scoring_authority.score_derived_intents_v1
      where tournament_id='2099' and status='DEAD_LETTER' limit 101`, expectedRows:null,
  }];
  const results=[];
  for(const spec of families){
    // Names above are constants. Do not accept arbitrary index or relation inputs.
    const indexDefinition=run(`select pg_get_indexdef(${q(spec.index)}::regclass)`);
    assert.ok(indexDefinition.startsWith('CREATE INDEX '));
    const values = () => JSON.parse(run(`select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from (${spec.sql}) v`));
    const beforeRows=values(); if(spec.expectedRows!==null) assert.equal(beforeRows.length,spec.expectedRows);
    const planSql=`explain(analyze,buffers,settings,format json) ${spec.sql}`;
    const withIndex=JSON.parse(run(`begin;set local statement_timeout='5s';set local lock_timeout='1s';${planSql};rollback;`))[0];
    // DROP and EXPLAIN share one transaction/connection; rollback restores the
    // exact candidate index. No source migration, schema version or data persists.
    const withoutIndex=JSON.parse(run(`begin;set local statement_timeout='5s';set local lock_timeout='1s';drop index ${spec.index};${planSql};rollback;`))[0];
    assert.equal(run(`select pg_get_indexdef(${q(spec.index)}::regclass)`),indexDefinition);
    assert.deepEqual(values(),beforeRows);
    const summarize=plan=>({executionTimeMs:plan['Execution Time'],planningTimeMs:plan['Planning Time'],
      nodeTypes:flatten(plan.Plan).map(x=>x['Node Type']),indexes:flatten(plan.Plan).map(x=>x['Index Name']).filter(Boolean),
      rowsRemovedByFilter:flatten(plan.Plan).reduce((n,x)=>n+(x['Rows Removed by Filter']??0)*(x['Actual Loops']??1),0),
      rootSharedHitBlocks:plan.Plan['Shared Hit Blocks'],rootSharedReadBlocks:plan.Plan['Shared Read Blocks'],
      actualOutputRows:plan.Plan['Actual Rows']});
    results.push({...spec,indexDefinition,resultRows:beforeRows.length,withIndex,withoutIndex,
      summary:{withIndex:summarize(withIndex),withoutIndex:summarize(withoutIndex)},
      rollbackVerified:true,dataUnchanged:true});
  }
  return{schemaVersion:1,environment:'ISOLATED_LOCAL_POSTGRESQL17',fixtureVersion:'protected2099-retained-worker-history-v1',
    scale,identity,proofLayer:'POSTGRESQL_QUERY_PLAN',results,
    limitations:['Single warm plan execution per query/variant; not p50/p95/p99 or a capacity benchmark.',
      'The audit work-key query is a proposed internal forensic read, not a currently shipped RPC.',
      'If an alternative existing index serves the counterfactual, report that; do not manufacture necessity.',
      'Write amplification, storage growth, hosted provider performance and Production capacity are NOT MEASURED.',
      'The current terminal selector tests the fixture current state; it does not represent every terminal-backlog density.']};
}
