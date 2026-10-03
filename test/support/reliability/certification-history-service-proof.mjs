// Declared initial canonical input plus actual shipping History service proof.
// Never inserts a publication/import receipt, Final, closure or transition.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {cp,mkdtemp,mkdir,writeFile,symlink,rm,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {syntheticAnnualContent} from './certification-future-authoring-proof.mjs';
import {certificationWorkerTransport} from './certification-worker-proof.mjs';
import {jsonLiteral,repositoryRoot} from './postgres17.mjs';

const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='diagnostics'&&key!=='query_ms').map(([key,v])=>[key,stable(v)])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function provisionInitialSyntheticHistoryGuide(fixture){
 const q=fixture.q,row=statement=>JSON.parse(q(statement));
 assert.equal(q("select tournament_id from production_control.current_tournament_pointer_v1"),'2026');
 assert.equal(q('select count(*)from scoring_authority.hole_scores'),'0','Initial Guide input must precede scoring');
 assert.equal(q("select count(*)from production_control.projection_revisions where domain='GUIDE'and tournament_id='2026'"),'0');
 const facts=row("select jsonb_build_object('rounds',production_control.guide_canonical_rounds_v1('2026'),"+
  "'courseContext',production_control.guide_canonical_course_context_v1('2026'),'teams',(select jsonb_agg(to_jsonb(t)order by team_side)from scoring_authority.teams t where tournament_id='2026'),"+
  "'rosterCount',(select count(*)from scoring_authority.tournament_players where tournament_id='2026'))");
 const {guide}=syntheticAnnualContent({target:'2026',...facts});
 const validation=row(`select production_control.validate_guide_authoring_v1('2026',2026,
  ${jsonLiteral(guide.authoringContent)},${jsonLiteral(guide.projectionPayload)},'${guide.authoringContentFingerprint}',
  '${guide.contentFingerprint}','${guide.projectionPayloadHash}')`);
 assert.equal(validation.pass,true,JSON.stringify(validation));
 const source={authorityKind:'INITIAL_SYNTHETIC_FIXTURE',normalizer:'normalizeProductionGuideAuthoring',
  tournamentId:'2026',realPublicationClaim:false,realGoogleAccess:false};
 q(`begin;
  insert into production_control.projection_revisions(domain,tournament_id,tournament_year,revision_number,
   project_ref,project_url,source_workbook_id,source_tabs,contract_version,source_fingerprint,payload_fingerprint,
   source_payload,projection_payload,validation_status,validation_diagnostics,imported_by)
  select 'GUIDE','2026',2026,1,r.project_ref,r.project_url,r.provenance_id,
   production_control.guide_authoring_source_tabs_v1(),'guide-projection-v1',
   production_control.guide_authoring_hash_v1(${jsonLiteral(source)}),'${guide.projectionPayloadHash}',
   ${jsonLiteral(source)},${jsonLiteral(guide.projectionPayload)},'VALID',
   ${jsonLiteral({initialFixture:true,validatedBy:'validate_guide_authoring_v1',publicationReceiptInvented:false})},'SYNTHETIC_INITIAL_GUIDE_FIXTURE'
  from production_control.canonical_resource_v1 r where r.singleton and r.resource_class='CERTIFICATION';
  insert into production_control.projection_current(domain,tournament_id,revision_id,advanced_by)
   select domain,tournament_id,revision_id,'SYNTHETIC_INITIAL_GUIDE_FIXTURE'from production_control.projection_revisions
   where domain='GUIDE'and tournament_id='2026';commit;`);
 assert.equal(q("select count(*)from production_control.guide_authoring_operation_receipts_v1"),'0');
 assert.equal(q("select count(*)from production_control.import_runs where domain='GUIDE'"),'0');
 return{authorityKind:'DECLARED_INITIAL_SYNTHETIC_GUIDE_INPUT',actualShippingNormalizer:true,actualSqlValidation:true,
  publicationReceiptInvented:false,importReceiptInvented:false,googleAccess:false,projectionHash:guide.projectionPayloadHash,
  initialPointer:row("select to_jsonb(p)from production_control.projection_current p where domain='GUIDE'and tournament_id='2026'")};
}

export async function createCertificationHistoryServiceProof(fixture){
 const calls=[],transport=certificationWorkerTransport(fixture,{onRequest:call=>calls.push(call)});
 let missingGuide=false;
 const fetchImpl=async(url,init)=>{
  if(missingGuide){
   const target=new URL(url),input=JSON.parse(init.body).input;
   assert.equal(target.origin,fixture.resource.project_url);
   if(target.pathname==='/rest/v1/rpc/read_certification_projection_v1'&&input.operation==='READS.CLOSED_HISTORY_2026'){
    calls.push({name:'read_certification_projection_v1',input});
    const value=JSON.parse(fixture.q(`begin;delete from production_control.projection_current where domain='GUIDE'and tournament_id='2026';set role service_role;select public.read_certification_projection_v1(${jsonLiteral(input)});rollback;`,'service_role'));
    return Response.json(value);
   }
  }
  return transport.dependencies.fetchImpl(url,init);
 };
 const directory=await mkdtemp('/private/tmp/bagger-closed-history-');
 try{
  await cp(path.join(repositoryRoot,'lib'),path.join(directory,'lib'),{recursive:true});
  await mkdir(path.join(directory,'config'));
  await writeFile(path.join(directory,'config/certification-resource-registration.json'),JSON.stringify(fixture.transportFixture.registrationManifest));
  await writeFile(path.join(directory,'package.json'),'{"type":"module"}\n');
  await symlink(path.join(repositoryRoot,'node_modules'),path.join(directory,'node_modules'),'dir');
  const shipping=path.join(repositoryRoot,'lib/history-2026-service.js');
  assert.deepEqual(await readFile(path.join(directory,'lib/history-2026-service.js')),await readFile(shipping));
  const {loadHistory2026View}=await import(pathToFileURL(path.join(directory,'lib/history-2026-service.js')).href);
  const read=options=>loadHistory2026View({env:transport.env,dependencies:{},fetchImpl,
   certificationDependencies:transport.dependencies,...options});
  const capture=async()=>{
   const before=calls.length,overview=await read(),team=await read({includeTournamentPlayerMetadata:true});
   return{overview:stable(overview),team:stable(team),operations:calls.slice(before).map(c=>c.input.operation).filter(Boolean),
    guide:JSON.parse(fixture.q("select jsonb_build_object('pointer',to_jsonb(p),'revision',to_jsonb(r))from production_control.projection_current p join production_control.projection_revisions r using(revision_id)where p.domain='GUIDE'and p.tournament_id='2026'"))};
  };
  const verifyAfter=async before=>{
   assert.notEqual(fixture.q('select tournament_id from production_control.current_tournament_pointer_v1'),'2026');
   const after=await capture();
   assert.deepEqual(after.overview,before.overview,'Actual shipping History domain DTO survives annual activation');
   assert.deepEqual(after.team,before.team,'Actual shipping Team History metadata survives annual activation');
   assert.deepEqual(after.guide,before.guide,'Retained Guide pointer/payload unchanged; not claimed closure-pinned');
   assert.deepEqual(after.operations,['READS.CLOSED_HISTORY_2026','READS.CLOSED_HISTORY_2026']);
   const encoded=JSON.stringify(after.overview)+JSON.stringify(after.team);
   for(const forbidden of ['CERTIFICATION:','installation_id','source_workbook_id','auth_user_id','service_role','governance_tournament_id'])
    assert.equal(encoded.includes(forbidden),false,'Public History must not expose '+forbidden);
   const envelope={...fixture.envelope,phase:'READS',expected_context_token:fixture.context('READS').context_token,
    operation:'READS.CLOSED_HISTORY_2026',payload:{target_tournament_id:'2026'}};
   for(const payload of [{target_tournament_id:'2097'},{target_tournament_id:'2026',resource_id:'other'},
    {target_tournament_id:'2026',include_tournament_player_metadata:'true'}]){
    assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...envelope,payload}),/HISTORY_INPUT_INVALID/);
   }
   assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...envelope,expected_context_token:'0'.repeat(64)}),/CONTEXT_STALE/);
   assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...envelope,
    resource:{...envelope.resource,resource_id:'CERTIFICATION:00000000-0000-4000-8000-000000000000'}}),/RESOURCE|BINDING/);
   assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...envelope,operation:'READS.HISTORY_2026'}),/TARGET_DENIED|CONTEXT_DENIED/);
   for(const role of ['anon','authenticated'])assert.throws(()=>fixture.rpc('read_certification_projection_v1',envelope,role),/permission denied/);
   for(const role of ['anon','authenticated','service_role'])assert.throws(()=>fixture.q(`set role ${role};select production_control.certification_closed_history_2026_read_v1('{}','{}')`,role),/permission denied/);
   const catalog=JSON.parse(fixture.q("select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'searchPath',p.proconfig,'acl',p.proacl,"+
    "'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('type',d.deptype,'reference',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid))order by d.deptype,d.refclassid,d.refobjid),'[]')from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid))"+
    "from pg_proc p where p.oid='production_control.certification_closed_history_2026_read_v1(jsonb,jsonb)'::regprocedure"));
   assert.equal(catalog.owner,'postgres');assert.equal(catalog.securityDefiner,true);assert.deepEqual(catalog.searchPath,['search_path=pg_catalog']);
   assert.equal(fixture.q("select count(*)from pg_proc p where p.oid='production_control.certification_closed_history_2026_read_v1(jsonb,jsonb)'::regprocedure and exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')"),'0');
   const target=fixture.q('select tournament_id from production_control.current_tournament_pointer_v1');
   const authorization={...fixture.envelope.authorization,tournament_id:target};
   const annualContext=fixture.context('ANNUAL',{authorization});
   const closedWrites=[
    {operation:'ANNUAL.GUIDE_CREATE',payload:{target_tournament_id:'2026',target_tournament_year:2026}},
    {operation:'ANNUAL.GUIDE_PUBLISH',payload:{target_tournament_id:'2026',target_tournament_year:2026}},
    {operation:'ANNUAL.RUNTIME',payload:{target_tournament_id:'2026',target_tournament_year:2026,
      action:'CONFIGURE_MATCH',match_id:'closed-predecessor-target'}},
   ];
   for(const item of closedWrites)assert.throws(()=>fixture.rpc('mutate_certification_future_authoring_v1',{
    ...fixture.envelope,authorization,phase:'ANNUAL',operation_id:item.operation,operation_request_id:randomUUID(),
    expected_context_token:annualContext.context_token,payload:item.payload}),/CERTIFICATION_FUTURE_TARGET_REQUIRED/,
    'Current admitted Director cannot mutate closed predecessor through '+item.operation);
   const retainedAuthorityAcl=JSON.parse(fixture.q("select jsonb_build_object('importExecute',(select jsonb_agg(jsonb_build_object('role',role_name,'function',function_name,'allowed',has_function_privilege(role_name,function_name,'EXECUTE')))from unnest(array['anon','authenticated','service_role'])role_name cross join unnest(array['public.import_production_guide_projection(jsonb)','public.import_production_guide_projection_dormant_internal(jsonb)'])function_name),"+
    "'projectionWrite',(select jsonb_agg(jsonb_build_object('role',role_name,'table',table_name,'privilege',privilege_name,'allowed',has_table_privilege(role_name,table_name,privilege_name)))from unnest(array['anon','authenticated','service_role'])role_name cross join unnest(array['production_control.projection_current','production_control.projection_revisions'])table_name cross join unnest(array['INSERT','UPDATE','DELETE'])privilege_name))"));
   assert.ok(retainedAuthorityAcl.importExecute.every(row=>row.allowed===false),'Retired import writers remain inaccessible');
   assert.ok(retainedAuthorityAcl.projectionWrite.every(row=>row.allowed===false),'Runtime roles cannot rewrite retained projection authority directly');
   const pointerPlan=JSON.parse(fixture.q("explain(analyze,buffers,format json)select r.revision_id,r.payload_fingerprint from production_control.projection_current p join production_control.projection_revisions r on r.revision_id=p.revision_id where p.domain='GUIDE'and p.tournament_id='2026'"));
   assert.equal(pointerPlan[0].Plan['Actual Rows'],1,'Exact published pointer resolves one retained revision');
   const missing=JSON.parse(fixture.q(`begin;delete from production_control.projection_current where domain='GUIDE'and tournament_id='2026';set role service_role;select public.read_certification_projection_v1(${jsonLiteral(envelope)});rollback;`,'service_role'));
   assert.equal(missing.ok,false);assert.equal(missing.code,'GUIDE_PROJECTION_UNAVAILABLE');
   const failureOffset=calls.length;
   missingGuide=true;
   try{await assert.rejects(read(),error=>error.code==='GUIDE_PROJECTION_UNAVAILABLE'&&error.status===503);}
   finally{missingGuide=false;}
   assert.deepEqual(calls.slice(failureOffset).map(c=>c.input.operation).filter(Boolean),['READS.CLOSED_HISTORY_2026'],
    'Actual shipping service must never retry a denied Guide through current/Google/other authority');
   assert.throws(()=>fixture.q(`begin;update production_control.projection_current set advanced_at=clock_timestamp()where domain='GUIDE'and tournament_id='2026';set role service_role;select public.read_certification_projection_v1(${jsonLiteral(envelope)});rollback;`,'service_role'),/HISTORY_GUIDE_PROVENANCE_UNAVAILABLE/);
   assert.deepEqual(JSON.parse(fixture.q("select to_jsonb(p)from production_control.projection_current p where domain='GUIDE'and tournament_id='2026'")),before.guide.pointer);
   return{status:'PASS',actualShippingService:true,overview:true,teamMetadata:true,unchangedPublicDto:true,
    retainedGuideHash:digest(after.guide),closurePinnedGuide:false,googleCalls:0,network:'OWNED_LOCAL_RPC_ONLY',
    staleCurrentReadDenied:true,wrongTargetDenied:true,wrongResourceDenied:true,staleContextDenied:true,
    privateCoreDenied:true,missingGuideUnavailable:true,actualShippingFailureLocality:true,postCloseGuideAdvanceDenied:true,
    closedAuthoringDenied:closedWrites.map(row=>row.operation),retainedAuthorityAcl,catalog,
    exactPointerPlan:{environment:'OWNED LOCAL POSTGRESQL',samples:1,plan:pointerPlan,
     limitation:'Tiny synthetic fixture; plan documents the exact-key lookup, not hosted capacity or history-scale performance.'},
    pgDependLimitation:'PL/pgSQL dynamic body references are not all stored dependencies; actual gateway/nested runtime proof is separate.'};
  };
  return{read,capture,verifyAfter,calls,destroy:()=>rm(directory,{recursive:true,force:true})};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
