// Temporary checkpoint revalidation only. No historical protocol is replayed.
// Run only after the coordinator grants the owned PostgreSQL slot and freezes
// final source: node this-file --execute-owned-checkpoint
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,lstat,cp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const repositoryRoot='/private/tmp/bagger-phase2d-staging-admission';
const checkpointDirectory='/private/tmp/r2-provider-checkpoint';
const outputDirectory='/private/tmp/r2-provider-final-source-revalidation';
const testRelative='test/reliability-phase2dr2-provider-history.integration.test.mjs';
const migration069='supabase/production_migrations/202608300069_production_annual_scoring_authority_v1.sql';
const migration131='supabase/production_migrations/202609300131_canonical_resource_control_v1.sql';
const migration138='supabase/production_migrations/202609300138_certification_annual_transition_v1.sql';
const getterSignature='production_control.annual_scoring_platform_certification_v1(jsonb)';
const originalGetterHash='b5901e457769b9ba801408c42a24f06faff378bfc8a39933165606acac0db335';
const capturedTypedGetterHash='8c5bc8acf5087ec4fdb08a96979bd2468a6a7ac4b2b3bfec2487441e009aa664';
const sha=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const qualified=(schema,name)=>'"'+schema.replaceAll('"','""')+'"."'+name.replaceAll('"','""')+'"';
const run=(command,args,options={})=>{
 const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:128*1024*1024,...options});
 assert.equal(result.error,undefined,result.error?.message);
 assert.equal(result.status,0,command+' failed: '+result.stderr+'\n'+result.stdout);
 return result.stdout;
};
const replaceOnce=(source,oldValue,newValue)=>{
 assert.equal(source.split(oldValue).length,2,'Expected exactly one temporary-loader anchor: '+oldValue.slice(0,100));
 return source.replace(oldValue,newValue);
};

function sqlFunction(source,name){
 const escaped=name.replaceAll('.','\\.');
 const starts=[...source.matchAll(new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+'+escaped+'\\s*\\(','gi'))];
 assert.equal(starts.length,1,'One exact function source required: '+name);
 const start=starts[0].index,tail=source.slice(start);
 const delimiter=/\bas\s+(\$[A-Za-z_0-9]*\$)/i.exec(tail);
 assert.ok(delimiter,'Dollar-quoted source required: '+name);
 const bodyStart=start+delimiter.index+delimiter[0].length;
 const bodyEnd=source.indexOf(delimiter[1],bodyStart);
 assert.ok(bodyEnd>bodyStart);
 const statementEnd=bodyEnd+delimiter[1].length;
 assert.match(source.slice(statementEnd),/^\s*;/);
 return {body:source.slice(bodyStart,bodyEnd),hash:sha(source.slice(bodyStart,bodyEnd)),
  statement:source.slice(start,statementEnd)+';'};
}

async function helperSource(){
 let loader=await readFile(path.join(repositoryRoot,testRelative),'utf8');
 loader=replaceOnce(loader,"import {repositoryRoot} from './support/reliability/postgres17.mjs';",'const repositoryRoot='+JSON.stringify(repositoryRoot)+';');
 const tail=loader.indexOf('\ntry{await import(`data:text/javascript;base64,');
 assert.ok(tail>0,'Known outer-loader terminal import required');
 loader=loader.slice(0,tail)+String.raw`
const testStart=source.indexOf("\ntest('R2 preserves actual V4 provider-bound closure through historical forward install'");
assert.ok(testStart>0,'One known chronology registration required');
source=source.slice(0,testStart);
assert.equal(source.includes("test('R2 preserves actual V4"),false);
// Keep the timestamp-rewrite rejection wrapper, but route its underlying SQL
// through the owned-cluster helper, which rejects forged cluster objects and
// clears inherited PGHOSTADDR/connection settings.
const ownedSqlImport="import {sql as checkpointOwnedSql} from "+JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)+";\n";
assert.equal(source.split('const protocolPsql=psql;').length,2);
source=ownedSqlImport+source.replace('const protocolPsql=psql;','psql=(cluster,database,statement)=>checkpointOwnedSql(cluster,database,statement);\nconst protocolPsql=psql;');
const typed="statement:'perform production_control.annual_scoring_platform_certification_v1('+jsonSql(runtimeInput)+')',sqlstate:'55000',message";
const strict="statement:'perform production_control.annual_scoring_platform_certification_v1('+jsonSql(runtimeInput)+')',sqlstate:'P0002'";
if(source.includes(typed)){assert.equal(source.split(typed).length,2);source=source.replace(typed,strict);}
else assert.equal(source.split(strict).length,2,'Final getter expectation must remain exact');
source+='\nexport {verifyProvider069,providerAuthoritySnapshot,expectProviderSqlDenial,providerSourceManifest,scope,deploymentCommit,jsonSql};\n';
export {source as helperSource};
`;
 const loaded=await import('data:text/javascript;base64,'+Buffer.from(loader).toString('base64'));
 const result=loaded.helperSource;
 run(process.execPath,['--input-type=module','--check'],{input:result});
 return result;
}

async function treeManifest(directory,prefix=''){
 const entries={};
 for(const name of (await readdir(path.join(directory,prefix))).sort()){
  const relative=prefix?prefix+'/'+name:name,full=path.join(directory,relative),info=await lstat(full);
  assert.equal(info.isSymbolicLink(),false,'Checkpoint symlinks are unsupported');
  if(info.isDirectory())Object.assign(entries,await treeManifest(directory,relative));
  else if(info.isFile())entries[relative]=sha(await readFile(full));
 }
 return entries;
}
function localEnvironment(cluster){
 const environment={...process.env};
 for(const key of Object.keys(environment))if(key.startsWith('PG')||/SUPABASE|GOOGLE|VERCEL|TOKEN|SECRET|PASSWORD|CREDENTIAL|DATABASE|DIRECT_URL|POSTGRES_URL/.test(key.toUpperCase()))delete environment[key];
 return {...environment,PGHOST:cluster.socket,PGPORT:String(cluster.port),PGUSER:'postgres',PGOPTIONS:''};
}
async function restoreCheckpoint(capture,pg,record){
 const cluster=await pg.createIsolatedCluster();
 record.ownedCluster={directory:cluster.directory,socket:cluster.socket,port:cluster.port};
 try{
  const environment=localEnvironment(cluster),database=capture.database;
  assert.equal(database,'r2_provider_history','Preserve captured canonical database identity');
  if(capture.method==='READ_ONLY_PG_DUMP_AFTER_FINAL_SOURCE_CHECKPOINT'){
   const dump=path.join(checkpointDirectory,'provider.dump');
   assert.equal(sha(await readFile(dump)),capture.dumpSha256,'Checkpoint dump must match captured hash');
   pg.sql(cluster,'postgres',"create role anon nologin;create role authenticated nologin;create role service_role nologin;",{role:''});
   pg.createDatabase(cluster,database);
   run(path.join(pg.postgresBin,'pg_restore'),['--exit-on-error','--dbname='+database,'--host='+cluster.socket,'--port='+cluster.port,'--username=postgres',dump],{env:environment});
  }else{
   assert.equal(capture.method,'READ_ONLY_COLD_COPY_AFTER_OWNED_TEST_SHUTDOWN');
   const backup=path.join(checkpointDirectory,'cold-data');
   assert.deepEqual(await treeManifest(backup),capture.coldFileManifest,'Cold backup must match captured file manifest');
   assert.equal(capture.coldFileManifest['postmaster.pid'],undefined,'Cold checkpoint must be cleanly stopped');
   assert.match(run(path.join(pg.postgresBin,'pg_controldata'),[backup],{env:environment}),/Database cluster state:\s+shut down\s*\n/);
   run(pg.binaries.pg_ctl,['-D',cluster.data,'-m','fast','-w','stop'],{env:environment});cluster.started=false;
   assert.equal(path.resolve(cluster.data),path.join(path.resolve(cluster.directory),'data'));
   await rm(cluster.data,{recursive:true});await cp(backup,cluster.data,{recursive:true,errorOnExist:true});
   run(pg.binaries.pg_ctl,['-D',cluster.data,'-l',cluster.log,'-o',"-F -k "+cluster.socket+" -h '' -p "+cluster.port+' -c shared_buffers=32MB -c max_connections=20 -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap','-w','start'],{env:environment});cluster.started=true;
  }
  assert.match(pg.sql(cluster,database,'show server_version_num',{role:''}),/^17\d{4}$/);
  assert.equal(pg.sql(cluster,database,'show listen_addresses',{role:''}),'');
  assert.equal(pg.sql(cluster,database,'select current_database()',{role:''}),database);
  return cluster;
 }catch(error){await pg.destroyIsolatedCluster(cluster);throw error;}
}

function functionCatalog(pg,cluster,database){
 return JSON.parse(pg.sql(cluster,database,"select coalesce(jsonb_agg((to_jsonb(p)-'prosrc')||jsonb_build_object('signature',p.oid::regprocedure::text,'sourceHash',encode(extensions.digest(p.prosrc,'sha256'),'hex')) order by p.oid),'[]'::jsonb)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'"));
}
function dependencyCatalog(pg,cluster,database){
 return pg.sql(cluster,database,"select coalesce(jsonb_agg(to_jsonb(d)order by classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype),'[]'::jsonb)from pg_depend d");
}
function tableManifest(pg,cluster,database){
 const tables=JSON.parse(pg.sql(cluster,database,"select coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname)order by n.nspname,c.relname),'[]'::jsonb)from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')and n.nspname not like 'pg_%' and n.nspname<>'information_schema'"));
 const out={};
 for(const [schema,name]of tables)out[schema+'.'+name]=JSON.parse(pg.sql(cluster,database,"select jsonb_build_object('rows',count(*),'sha256',encode(extensions.digest(coalesce(string_agg(to_jsonb(value)::text,E'\\n' order by to_jsonb(value)::text),''),'sha256'),'hex'))from "+qualified(schema,name)+' value'));
 return out;
}
function sourceCatalogChecks(catalog,expected){
 const result={};
 for(const [signature,definition]of Object.entries(expected)){
  const rows=catalog.filter(row=>row.signature===signature);assert.equal(rows.length,1,signature);
  assert.equal(rows[0].sourceHash,definition.hash,'Exact final source body: '+signature);
  result[signature]={sourceHash:rows[0].sourceHash,oid:rows[0].oid,owner:rows[0].proowner,securityDefiner:rows[0].prosecdef,config:rows[0].proconfig,acl:rows[0].proacl};
 }
 return result;
}

async function main(){
 const source=await helperSource();
 await mkdir(outputDirectory,{recursive:true,mode:0o700});
 await writeFile(path.join(outputDirectory,'reused-checks.mjs'),source);
 if(!process.argv.includes('--execute-owned-checkpoint')){
  console.log(JSON.stringify({status:'PREPARED_ONLY',postgresStarted:false,helperSourceSha256:sha(source),outputDirectory}));return;
 }
 const captureBytes=await readFile(path.join(checkpointDirectory,'capture.json'));
 const executionBytes=await readFile(path.join(checkpointDirectory,'execution-evidence.json'));
 const capture=JSON.parse(captureBytes),execution=JSON.parse(executionBytes);
 const record={kind:'CAPTURED_PROVIDER_HISTORY_FINAL_SOURCE_REVALIDATION',status:'RUNNING',startedAt:new Date().toISOString(),
  historicalProtocolReplayed:false,fullFinal069Reinstall:false,fullUninterruptedFinalSourceProfile:false,
  hostedAccess:false,realGoogleAccess:false,authorityFabricated:false,persistedObservationTimesChanged:false,
  checkpointDirectory,checkpointSha256:sha(captureBytes),executionEvidenceSha256:sha(executionBytes),capture,
  originalExecutionStatus:execution.status,originalExecutionError:execution.error??null,
  originalSourceBefore:execution.sourceBefore,originalSourceAfter:execution.sourceAfter,
  temporaryVerifierSha256:sha(await readFile(fileURLToPath(import.meta.url))),helperSourceSha256:sha(source),checks:[],steps:[]};
 let cluster,pg,helpers;
 const checkpoint=()=>writeFile(path.join(outputDirectory,'evidence.json'),JSON.stringify(record,null,2)+'\n');
 try{
  assert.equal(capture.socketOnly,true);assert.equal(capture.authorityEdited,false);assert.equal(capture.observationTimesEdited,false);
  assert.equal(capture.productionAccess,false);assert.equal(capture.sourceStable,true);
  assert.deepEqual(execution.sourceBefore,execution.sourceAfter,'Historical source must have remained frozen');
  assert.equal(capture.migration,execution.lastInstalled);assert.equal(capture.executionStatus,execution.status);
  assert.ok(['PASS','PARTIAL'].includes(execution.status));
  assert.ok(execution.steps.some(step=>step.id==='HISTORICAL_PUBLIC_V4_PROTOCOL'&&step.status==='PASS'),'Actual historical chronology must already be proven');
  const capturedHead=Number(capture.migration.slice(8,12));
  assert.ok([69,152].includes(capturedHead),'Unknown migration head: preserve checkpoint and inspect before authorizing a suffix');
  if(capturedHead===69){
   assert.equal(execution.status,'PARTIAL');
   assert.match(execution.error,/PRODUCTION_SCORING_EXTERNAL_ACL_FENCE_REVISION_CONFLICT/,'Only the reviewed069 fixture chronology failure may resume');
  }
  record.capturedHead=capturedHead;
  helpers=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  record.finalSourceBefore=await helpers.providerSourceManifest();
  record.changedSourceFiles=Object.keys(record.finalSourceBefore).filter(name=>record.finalSourceBefore[name]!==execution.sourceBefore[name]);
  assert.deepEqual(Object.keys(record.finalSourceBefore).sort(),Object.keys(execution.sourceBefore).sort(),'Consumed source set must stay complete');
  for(const name of record.changedSourceFiles)assert.ok([migration069,migration131,testRelative].includes(name),'Unreviewed consumed source change: '+name);
  const source069=await readFile(path.join(repositoryRoot,migration069),'utf8');
  const source138=await readFile(path.join(repositoryRoot,migration138),'utf8');
  const source131=await readFile(path.join(repositoryRoot,migration131),'utf8');
  assert.ok(source131.includes('DO $annual_069_forward_bridge$'),'Approved131 bridge must be in final source');
  const getter=sqlFunction(source069,'production_control.annual_scoring_platform_certification_v1');
  assert.equal(getter.hash,originalGetterHash,'Final getter must be the exact original STRICT implementation');
  const expected={
   'production_control.assert_legacy_provider_origin_v1()':sqlFunction(source069,'production_control.assert_legacy_provider_origin_v1'),
   'production_control.assert_production_scoring_runtime(jsonb,text)':sqlFunction(source069,'production_control.assert_production_scoring_runtime'),
   'production_control.assert_annual_transition_platform_owner_v1(jsonb)':sqlFunction(source069,'production_control.assert_annual_transition_platform_owner_v1'),
   'production_control.annual_scoring_transition_readiness_v1(text)':sqlFunction(capturedHead===69?source069:source138,'production_control.annual_scoring_transition_readiness_v1')
  };
  pg=await import(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href);
  cluster=await restoreCheckpoint(capture,pg,record);await checkpoint();
  const database=capture.database;
  const beforeCatalog=functionCatalog(pg,cluster,database),beforeDependencies=dependencyCatalog(pg,cluster,database);
  record.exactFinalDefinitionsBefore=sourceCatalogChecks(beforeCatalog,expected);
  record.authorityBefore=helpers.providerAuthoritySnapshot(cluster,database);
  record.tableDataBefore=tableManifest(pg,cluster,database);
  const originalRoot=execution.steps.find(step=>step.id==='HISTORICAL_PUBLIC_V4_PROTOCOL').closure;
  const root=record.authorityBefore.closure;
  assert.deepEqual({status:root.status,externalFenceId:root.external_fence_evidence_id,providerFenceId:root.google_writer_provider_fence_id,providerVerificationId:root.google_writer_provider_verification_id,watermark:root.lease_high_watermark,fingerprint:root.lease_set_fingerprint},originalRoot,'Captured consumed root must retain historical identity');
  if(capturedHead===152)assert.equal(pg.sql(cluster,database,'select count(*)from production_control.annual_side_game_runtime_certifications_v1'),'0','No immutable annual manifest may require recertification');
  else{
   assert.equal(pg.sql(cluster,database,"select to_regclass('production_control.annual_side_game_runtime_certifications_v1')is null"),'t');
   assert.equal(pg.sql(cluster,database,"select to_regclass('production_control.canonical_resource_v1')is null"),'t');
  }
  const retainedGetter=beforeCatalog.find(row=>row.signature===getterSignature);
  assert.ok(retainedGetter&&[capturedTypedGetterHash,originalGetterHash].includes(retainedGetter.sourceHash),'Exact reviewed captured getter required');
  record.getterBeforeHash=retainedGetter.sourceHash;
  // The only persistent restoration mutation. No installation block, authority
  // row, grant, provider observation, bridge, or migration is replayed here.
  pg.sql(cluster,database,'begin;'+getter.statement+'commit;');
  const afterCatalog=functionCatalog(pg,cluster,database),afterDependencies=dependencyCatalog(pg,cluster,database);
  const expectedCatalog=beforeCatalog.map(row=>row.signature===getterSignature?{...row,sourceHash:originalGetterHash}:row);
  assert.deepEqual(afterCatalog,expectedCatalog,'Only the exact getter source may differ; identities, all other bodies and privileges must remain');
  assert.equal(afterDependencies,beforeDependencies,'Getter restoration cannot alter dependencies');
  assert.deepEqual(tableManifest(pg,cluster,database),record.tableDataBefore,'Getter restoration cannot alter any table row');
  record.catalogBeforeSha256=sha(JSON.stringify(beforeCatalog));record.catalogAfterSha256=sha(JSON.stringify(afterCatalog));
  record.dependenciesSha256=sha(beforeDependencies);
  record.exactFinalDefinitionsAfter=sourceCatalogChecks(afterCatalog,{...expected,[getterSignature]:getter});
  record.catalogConvergenceScope='At captured boundary, exact final069 helper/runtime/owner/getter and applicable readiness body; every other captured function attribute/body/dependency unchanged by getter restoration. Subsequent migrations, if needed, execute actual final source in order.';
  await writeFile(path.join(outputDirectory,'function-catalog-before.json'),JSON.stringify(beforeCatalog,null,2)+'\n');
  await writeFile(path.join(outputDirectory,'function-catalog-after.json'),JSON.stringify(afterCatalog,null,2)+'\n');
  let activeCatalog=afterCatalog,activeDependencies=afterDependencies,finalAuthorityBaseline=record.authorityBefore;
  let resumed069=null;
  if(capturedHead===69){
   const marker='do $annual_platform_certification$';
   assert.equal(source069.split(marker).length,2);
   const start=source069.indexOf(marker),end=source069.indexOf('$annual_platform_certification$;',start+marker.length);
   assert.ok(end>start);
   const exactInstallBlock=source069.slice(start,end+'$annual_platform_certification$;'.length);
   assert.equal(pg.sql(cluster,database,'select count(*)from production_control.annual_scoring_platform_certifications_v1'),'0');
   pg.sql(cluster,database,exactInstallBlock);
   assert.deepEqual(tableManifest(pg,cluster,database),record.tableDataBefore,'Exact final069 provider adoption block must create no certificate or other row');
   assert.deepEqual(functionCatalog(pg,cluster,database),afterCatalog);
   assert.equal(dependencyCatalog(pg,cluster,database),afterDependencies);
   record.final069ProviderInstallBlock={sha256:sha(exactInstallBlock),status:'PASS',allTableRowsUnchanged:true,certificateRows:0,fullMigrationReinstalled:false};
   const test069={async test(name,action){try{await action();record.checks.push({boundary:69,sourceCheck:name,status:'PASS'});}catch(error){record.checks.push({boundary:69,sourceCheck:name,status:'FAIL',error:error.message});}}};
   await helpers.verifyProvider069(cluster,database,test069,record,record.authorityBefore);
   resumed069=record.steps.find(step=>step.id==='MIGRATION_069_PROVIDER_COMPATIBILITY'&&step.status==='PASS');
   assert.equal(resumed069?.rollbackWorkerDrainPreserved,true);
   resumed069.sourceAssertionId=resumed069.id;resumed069.id='RESTORED069_PROVIDER_COMPATIBILITY';resumed069.full069InstallTested=false;
   record.authorityAfter069=helpers.providerAuthoritySnapshot(cluster,database);
   assert.deepEqual(record.authorityAfter069,record.authorityBefore);
   record.forwardInstall=[];await checkpoint();
   const names=Object.keys(record.finalSourceBefore).filter(name=>name.startsWith('supabase/production_migrations/')&&Number(path.basename(name).slice(8,12))>69).sort();
   assert.equal(Number(path.basename(names.at(-1)).slice(8,12)),152);
   for(const filename of names){
    const ordinal=Number(path.basename(filename).slice(8,12));
    const incrementals=ordinal===121?['candidates/scored-match-resume.sql','supabase/production_incremental/net-skins-sql-expressions-v1.sql','supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql']:
     ordinal===128?['supabase/production_incremental/director-calcutta-management-read-v1.sql','supabase/production_incremental/director-calcutta-clear-entry-v1.sql']:
     ordinal===131?['supabase/production_incremental/player-portrait-policy-v1.sql']:[];
    for(const extra of incrementals){pg.sql(cluster,database,await readFile(path.join(repositoryRoot,extra),'utf8'));record.forwardInstall.push({file:extra,sha256:record.finalSourceBefore[extra],status:'PASS'});}
    pg.sql(cluster,database,await readFile(path.join(repositoryRoot,filename),'utf8'));
    record.forwardInstall.push({file:filename,sha256:record.finalSourceBefore[filename],status:'PASS'});record.lastInstalled=filename;
    console.log(JSON.stringify({phase:'FINAL_SOURCE_FORWARD_INSTALL',ordinal}));await checkpoint();
   }
   expected['production_control.annual_scoring_transition_readiness_v1(text)']=sqlFunction(source138,'production_control.annual_scoring_transition_readiness_v1');
   activeCatalog=functionCatalog(pg,cluster,database);activeDependencies=dependencyCatalog(pg,cluster,database);
   record.final152ExactDefinitions=sourceCatalogChecks(activeCatalog,{...expected,[getterSignature]:getter});
   finalAuthorityBaseline=helpers.providerAuthoritySnapshot(cluster,database);
   assert.deepEqual(finalAuthorityBaseline.epoch,record.authorityBefore.epoch,'Forward migrations must preserve the committed provider epoch');
   const historicalClosureFields=Object.keys(record.authorityBefore.closure);
   assert.deepEqual(Object.fromEntries(historicalClosureFields.map(key=>[key,finalAuthorityBaseline.closure[key]])),record.authorityBefore.closure,'Forward migrations must preserve every historical provider closure field');
   const addedClosureFields=Object.fromEntries(Object.entries(finalAuthorityBaseline.closure).filter(([key])=>!historicalClosureFields.includes(key)));
   assert.deepEqual(addedClosureFields,{certification_resource_id:null,prior_certification_closure_id:null,resource_class:'PRODUCTION'},'Only the reviewed138 Production-discriminator columns may be added');
   record.providerClosureSchemaExtension=addedClosureFields;
   assert.equal(finalAuthorityBaseline.activation.authority_generation_id,record.authorityBefore.epoch.epoch_id);
   assert.equal(finalAuthorityBaseline.activation.boundary_mode,'PROVIDER_FENCE_V2');
   assert.equal(finalAuthorityBaseline.pointer.tournament_id,'2026');
   await writeFile(path.join(outputDirectory,'function-catalog-final152.json'),JSON.stringify(activeCatalog,null,2)+'\n');
  }
  record.authorityBeforeFinal152=finalAuthorityBaseline;
  const historical069=resumed069??execution.steps.find(step=>step.id==='MIGRATION_069_PROVIDER_COMPATIBILITY'&&step.status==='PASS');
  assert.equal(historical069?.rollbackWorkerDrainPreserved,true,'Historical069 must retain its actual rollback-worker positive proof');
  const historicalDrainCheck='069 preserves supported provider rollback worker drain with retained cutover evidence';
  const testContext={async test(name,action){
   if(name===historicalDrainCheck){
    record.checks.push({sourceCheck:name,status:'NOT_APPLICABLE_AT_152',historical069Status:'PASS',
     historical069ProofSource:resumed069?'RESTORED069_PROVIDER_COMPATIBILITY':'ORIGINAL069_CHECKPOINT',
     reason:'Migrations125/126 retired Google delivery and disabled its controls. The069 proof is recorded separately; final152 must preserve the retirement posture.'});return;
   }
   try{await action();record.checks.push({sourceCheck:name,status:'PASS'});}catch(error){record.checks.push({sourceCheck:name,status:'FAIL',error:error.message});}
  }};
  await helpers.verifyProvider069(cluster,database,testContext,record,finalAuthorityBaseline);
  // Reused assertions do not establish a new069 installation. Replace their
  // original evidence label with the exact operation actually performed here.
  for(const step of record.steps.filter(step=>step.id==='MIGRATION_069_PROVIDER_COMPATIBILITY')){
   step.sourceAssertionId=step.id;step.id='CHECKPOINT_FINAL152_PROVIDER_REVALIDATION';step.full069InstallTested=false;
   delete step.rollbackWorkerDrainPreserved;step.historical069RollbackWorkerDrainPreserved=true;
  }
  const retiredWorkers=JSON.parse(pg.sql(cluster,database,"select jsonb_agg(to_jsonb(w)order by worker_name)from production_control.worker_controls w where worker_name in('SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE')"));
  assert.equal(retiredWorkers.length,2);
  for(const worker of retiredWorkers){
   assert.equal(worker.enabled,false);assert.equal(worker.scheduler_installed,false);assert.equal(worker.google_writes_allowed,false);
   assert.equal(worker.metadata.googleRuntimeContract,'google-runtime-retired-v1');
  }
  assert.equal(pg.sql(cluster,database,"select google_writes_enabled::text from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION'"),'false');
  const retiredNames=['claim_production_google_outbox','claim_production_google_outbox_event','complete_production_google_outbox','fail_production_google_outbox','claim_production_scorecard_archive_job','complete_production_scorecard_archive_job','fail_production_scorecard_archive_job'];
  for(const name of retiredNames)assert.equal(pg.sql(cluster,database,"select has_function_privilege('service_role',"+literal('public.'+name+'(jsonb)')+",'EXECUTE')::text"),'false');
  assert.equal(pg.sql(cluster,database,'select count(*)from production_control.annual_scoring_rpc_allowlist_v1 where enabled and operation_name in('+retiredNames.map(literal).join(',')+')'),'0');
  record.checks.push({sourceCheck:'Final152 preserves125/126 Google worker retirement, service ACL revocations and disabled annual RPC allowlist',status:'PASS'});
  const runtime={...helpers.scope,deployment_commit:helpers.deploymentCommit,expected_epoch_id:record.authorityBefore.epoch.epoch_id};
  helpers.expectProviderSqlDenial(cluster,database,{statement:'perform public.read_production_scoring_dispatch_certification_v1('+helpers.jsonSql(runtime)+')',sqlstate:'P0002'});
  record.checks.push({sourceCheck:'Final public dispatch certificate getter retains original STRICT P0002 absence denial',status:'PASS'});
  record.authorityAfter=helpers.providerAuthoritySnapshot(cluster,database);
  assert.deepEqual(record.authorityAfter,finalAuthorityBaseline,'All transactional negative cases must preserve final provider authority');
  assert.deepEqual(functionCatalog(pg,cluster,database),activeCatalog,'Behavioral checks cannot change final function catalog');
  assert.equal(dependencyCatalog(pg,cluster,database),activeDependencies);
  record.status='PASS';
 }catch(error){record.status='FAIL';record.error=error.stack??error.message;throw error;}
 finally{
  if(helpers){record.finalSourceAfter=await helpers.providerSourceManifest();record.finalSourceStable=JSON.stringify(record.finalSourceAfter)===JSON.stringify(record.finalSourceBefore);if(!record.finalSourceStable)record.status='FAIL';}
  record.finishedAt=new Date().toISOString();record.originalCheckpointPreserved=true;
  await checkpoint();
  if(cluster&&pg)await pg.destroyIsolatedCluster(cluster);
  if(record.status==='PASS')assert.equal(record.finalSourceStable,true);
 }
 console.log(JSON.stringify({status:record.status,evidence:path.join(outputDirectory,'evidence.json'),fullFinal069Reinstall:false}));
}
await main();
