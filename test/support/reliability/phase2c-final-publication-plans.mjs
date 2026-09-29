// Test-only plan proof. Never creates a connection; callbacks must use the already
// owned annual fixture. All synthetic setup and plans share a rollback transaction.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const nodes=plan=>[plan,...(plan.Plans||[]).flatMap(nodes)];
function objectAt(text,start){let depth=0,quoted=false,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return text.slice(start,i+1);}throw Error('Truncated nested plan');}
function plansFrom(stderr){const plans=[];for(const m of stderr.matchAll(/duration:\s+([0-9.]+)\s+ms\s+plan:\s*/g)){const start=m.index+m[0].length;assert.equal(stderr[start],'{');const value=JSON.parse(objectAt(stderr,start));plans.push({instrumentedDurationMs:Number(m[1]),querySha256:hash(value['Query Text']||''),plan:value.Plan});}return plans;}
export function captureFinalPublicationHistoryPlans({query,queryWithDiagnostics,database,scale,allowIsolatedFixture=false}){
 assert.equal(allowIsolatedFixture,true);assert.ok([1,10].includes(scale));assert.equal(database,`phase2c_annual_history_${scale}`);
 assert.equal(typeof queryWithDiagnostics,'function','Owned psql stdout/stderr callback required for actual nested function plans');
 const run=statement=>query(database,statement,{role:''});
 const identity=JSON.parse(run(`select jsonb_build_object('database',current_database(),'socketOnly',inet_server_addr() is null,'matchCount',(select count(*) from scoring_authority.matches where tournament_id='2099'),'version',current_setting('server_version'),'enableSeqscan',current_setting('enable_seqscan'))`));
 assert.equal(identity.database,database);assert.equal(identity.socketOnly,true);assert.equal(identity.matchCount,1,'Protected annual admission fixture deliberately starts with one match');assert.equal(identity.enableSeqscan,'on');
 const signature='production_control.derived_final_recap_ready_v1(text)';
 const definition=run(`select pg_get_functiondef('${signature}'::regprocedure)`);assert.match(definition,/odds_published_snapshots/);assert.match(definition,/is_current_for_milestone/);
 const indexDefinition=run("select pg_get_indexdef('scoring_authority.odds_published_current_milestone_idx'::regclass)");assert.match(indexDefinition,/UNIQUE/);assert.match(indexDefinition,/WHERE is_current_for_milestone/);
 const footprint=()=>run(`select md5(jsonb_build_object('matches',(select jsonb_agg(to_jsonb(m) order by match_id) from scoring_authority.matches m where tournament_id='2099'),'publications',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from scoring_authority.odds_published_snapshots p where tournament_id='2099'))::text)`);
 const before=footprint();const historyCount=scale*1000;const observations=[];
 for(const eligible of [true,false]){
  // CHECK and unique constraints remain active. Replication mode bypasses only
  // fixture triggers/FKs while directly constructing synthetic final/publication
  // state; it does not assert protected publication issuance or product eligibility.
  const setup=`begin;set local statement_timeout='5s';set local lock_timeout='1s';
   set local session_replication_role=replica;
   insert into scoring_authority.matches
    select populated.* from scoring_authority.matches source cross join generate_series(2,24)n
    cross join lateral jsonb_populate_record(null::scoring_authority.matches,
     to_jsonb(source)||jsonb_build_object('match_id','2099-final-plan-'||n,'status','FINAL','scorecard_complete',true))populated
    where source.tournament_id='2099';
   update scoring_authority.matches set status='FINAL',scorecard_complete=true where tournament_id='2099';
   do $matches$ begin if (select count(*)from scoring_authority.matches where tournament_id='2099')<>24 then raise exception 'FINAL_PLAN_MATCH_COUNT';end if;end $matches$;
   update scoring_authority.odds_published_snapshots set is_current_for_milestone=false,is_current_official=false where tournament_id='2099';
   insert into scoring_authority.odds_published_snapshots(id,tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,payload_hash,source_fingerprint,engine_version,engine_metadata,google_publication_fingerprint,google_publication_reference,is_current_for_milestone,is_current_official,publication_verified,imported_by)
   select md5('phase2c-final-plan:${scale}:'||n)::uuid,'2099','Final Results',4,n,
    timestamptz '2099-01-01 00:00:00+00'+n*interval '1 second',
    jsonb_build_object('phase',case when n=${historyCount+1} then '${eligible?'Final Results':'After Round 2'}' else 'Final Results' end,'synthetic',true),
    encode(extensions.digest('phase2c-final-payload:'||n,'sha256'),'hex'),
    encode(extensions.digest('phase2c-final-source:'||n,'sha256'),'hex'),'synthetic-plan-v1','{}'::jsonb,
    encode(extensions.digest('phase2c-final-google:'||n,'sha256'),'hex'),'{}'::jsonb,n=${historyCount+1},false,true,'isolated-final-plan'
   from generate_series(1,${historyCount+1}) n;
   set local session_replication_role=origin;
   do $count$ begin if (select count(*) from scoring_authority.odds_published_snapshots where tournament_id='2099' and imported_by='isolated-final-plan')<>${historyCount+1} then raise exception 'FINAL_PLAN_FIXTURE_ROW_COUNT';end if;end $count$;
   analyze scoring_authority.odds_published_snapshots;analyze scoring_authority.matches;
   load 'auto_explain';set local client_min_messages=log;set local auto_explain.log_min_duration=0;
   set local auto_explain.log_analyze=on;set local auto_explain.log_buffers=on;set local auto_explain.log_timing=off;
   set local auto_explain.log_nested_statements=on;set local auto_explain.log_format=json;`;
  const result=queryWithDiagnostics(database,setup+`select production_control.derived_final_recap_ready_v1('2099');set local auto_explain.log_min_duration=-1;rollback;`,{role:''});
  assert.equal(result.status,0,result.stderr?.slice(-1500));assert.equal(result.stdout.trim(),eligible?'t':'f');
  const plans=plansFrom(result.stderr||'');assert.ok(plans.length>=3);
  const relevant=plans.flatMap(p=>nodes(p.plan)).filter(n=>n['Relation Name']==='odds_published_snapshots');assert.ok(relevant.length>0);
  assert.ok(relevant.every(n=>n['Index Name']==='odds_published_current_milestone_idx'),'Default planner must select the existing current-milestone partial index at meaningful history size');
  assert.ok(relevant.every(n=>(n['Actual Rows']||0)+(n['Rows Removed by Filter']||0)<=1));
  observations.push({historyCount,eligible,returned:result.stdout.trim(),planner:'DEFAULT_NO_ENABLE_SEQSCAN_OVERRIDE',publicationNodes:relevant,plans,rollbackVerified:footprint()===before});
  assert.equal(footprint(),before);
 }
 return{schemaVersion:1,proof:'ACTUAL_PRIVATE_FUNCTION_NESTED_PLAN',environment:'OWNED_LOCAL_POSTGRESQL17',production:false,scale,identity,functionSourceSha256:hash(definition),indexDefinition,observations,
  limitations:['23 extra current matches and synthetic final/publication facts are constructed with trigger/FK omission in one rolled-back transaction; CHECK/uniqueness remain active','No protected Odds publication issuance or JavaScript final-gate authority is inferred','Two instrumented default-planner observations; not latency percentiles or write-amplification benchmark','Existing smaller7/70-row sequential plans remain retained; this tests1000/10000 noncurrent publications','Callback is provided only by the owned annual fixture; no URL, host, credential or new cluster input']};
}
