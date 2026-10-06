import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{execFileSync}from'node:child_process';
import{repositoryRoot}from'./support/reliability/postgres17.mjs';import{certificationRuntimeFixture}from'./support/reliability/certification-runtime-fixture.mjs';
import{mutateIsolatedDirectorOperations}from'../lib/isolated-director-operations.js';import{CERTIFICATION_OPERATIONS,certificationOperationRpc}from'../lib/certification-runtime-server.js';
const base='a2f6c44cc7a1f85e70d64649b22821554f83b641';
for(const file of['app/api/director/prediction-settings/route.js','lib/production-prediction-settings-server.js','lib/production-prediction-settings-contract.js',
 'lib/prediction-settings-contract.js','lib/prediction-engine.js','lib/tournament-odds.js','lib/certification-odds-server.js',
 'app/api/director/canonical-odds/route.js','app/api/odds/prediction-settings/route.js','app/api/leaderboards/insights/route.js',
 'lib/certification-worker-engines.js','lib/production-net-skins-server.js','lib/certification-net-skins-calculation.js','lib/production-calcutta-server.js',
 'supabase/production_incremental/certification-queue-routing-closure-v7.sql','supabase/production_incremental/certification-derived-attempt-cycle-v1.sql',
 'supabase/production_incremental/certification-net-skins-result-read-v1.sql','supabase/production_incremental/certification-net-skins-calculation-v1.sql',
 'supabase/production_incremental/certification-queue-calcutta-scope-v1.sql','supabase/production_incremental/certification-calcutta-publication-v1.sql'])test('preserved certified core / transport: '+file,async()=>{
 assert.equal(await readFile(repositoryRoot+'/'+file,'utf8'),execFileSync('git',['show',`${base}:${file}`],{cwd:repositoryRoot,encoding:'utf8'}));
});
test('fixed closed Director operation registry, no Queue engine or generic settings proxy',()=>{
 assert.deepEqual(CERTIFICATION_OPERATIONS['DIRECTOR.CONFIGURE_ODDS_INPUTS'],{phase:'DIRECTOR',mutation:true});
 assert.deepEqual(CERTIFICATION_OPERATIONS['DIRECTOR.ODDS_INPUT_CONFIGURATION_STATUS'],{phase:'DIRECTOR',mutation:false});
 assert.equal(CERTIFICATION_OPERATIONS['DIRECTOR.CONFIGURE_ARBITRARY'],undefined);
});
test('publication follow-up admits existing Intelligence work only; Final Results and FinalRecap remain outside this scope',async()=>{
 const source=await readFile(repositoryRoot+'/supabase/production_incremental/certification-odds-input-configuration-v1.sql','utf8');
 const manifest=JSON.parse(source.split('$manifest$')[1]),scope=manifest.find(p=>p.signature==='production_control.worker_supervisor_scope_v1()');
 assert.equal(manifest.length,3);assert.match(scope.new,/derived_final_recap_ready_v1/);
 assert.match(scope.new,/where not publication_verified or milestone='Final Results'/);
 assert.match(scope.new,/engines=array\['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','CALCUTTA'\]/);
 assert.doesNotMatch(scope.new,/engines=array\[[^\]]*'ODDS'/);
});
for(const payload of[{settings:{}},{resource:'PRODUCTION'},{tournament:'2025'},{processor:'arbitrary'},{googleSource:'x'},{profile:'PRODUCTION_DEFAULTS'}])test('Director client cannot select values/source/target '+JSON.stringify(payload),async()=>{
 const f=certificationRuntimeFixture();await assert.rejects(mutateIsolatedDirectorOperations({authorization:f.authorization,env:f.env,
 input:{family:'ODDS_INPUT_CONFIGURATION',action:'configure',operationRequestId:'55555555-5555-4555-8555-555555555555',expectedContextToken:'b'.repeat(64),payload:{expectedConfigurationRevision:0,profile:'CERTIFICATION_DEFAULTS_V1',confirmation:'CONFIGURE SYNTHETIC ODDS INPUTS',reason:'Synthetic test',...payload}}},{certificationDependencies:f.dependencies}),e=>e.status===400);
 assert.equal(f.requests.filter(r=>r.url.endsWith('/execute_certification_operation_v1')).length,0);
});
for(const code of['PREDICTION_SETTINGS_PREDECESSOR_STALE','PREDICTION_SETTINGS_VALIDATION_FAILED','PRODUCTION_ANNUAL_ODDS_INPUT_CONFIGURATION_REQUIRED'])test('typed domain '+code+' is bounded rejection, never infrastructure success',async()=>{
 const f=certificationRuntimeFixture(),fetchImpl=f.dependencies.fetchImpl;f.dependencies.fetchImpl=async(u,i)=>u.endsWith('/execute_certification_operation_v1')?Response.json({code:'40001',message:code},{status:400}):fetchImpl(u,i);
 await assert.rejects(certificationOperationRpc('DIRECTOR.CONFIGURE_ODDS_INPUTS',{}, {env:f.env,operationRequestId:'55555555-5555-4555-8555-555555555555'},f.dependencies),e=>e.status===409&&e.domainCode===code);
});
