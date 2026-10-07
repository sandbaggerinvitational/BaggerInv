import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {modelDCatalogDiagnostics,modelDCatalogVerificationSql} from './model-d-catalog-verifier.mjs';
import {readModelDImage} from './model-d-bootstrap.mjs';
import {renderModelDInstallation} from './certification-model-d-installation.mjs';
import {canonicalCatalog,assertCatalogConvergence,serialize} from './canonical-bootstrap-artifacts.mjs';
import {createIsolatedCluster,destroyIsolatedCluster,createDatabase,sql,sqlResult,repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
import {installLocalCanonicalPlatform} from '../../test/support/reliability/phase2d-resource-bootstrap.mjs';
import {enableOwnedSafeupdate} from '../../test/support/reliability/pg-safeupdate.mjs';
const image=await readModelDImage(),expected=image.catalog;
const clone=()=>structuredClone(expected);
const mutations=[
 ['missing function',c=>c.functions.pop()],['extra function',c=>c.functions.push({...c.functions[0],identity:'public.unexpected_privileged()'})],
 ['body',c=>c.functions[0].definitionSha256='0'.repeat(64)],['owner',c=>c.functions[0].owner='service_role'],
 ['PUBLIC ACL',c=>c.functions[0].acl.push('=X/postgres')],['anon ACL',c=>c.functions[0].anonExecute=!c.functions[0].anonExecute],
 ['authenticated ACL',c=>c.functions[0].authenticatedExecute=!c.functions[0].authenticatedExecute],['service_role ACL',c=>c.functions[0].serviceExecute=!c.functions[0].serviceExecute],
 ['role expansion ACL',c=>c.functions[0].acl.push('unexpected_client=X/postgres')],
 ['security mode',c=>c.functions[0].definer=!c.functions[0].definer],['search_path',c=>c.functions[0].searchPath=['search_path=public']],
 ['RLS removal',c=>c.relations.find(r=>r.rls).rls=false],['policy',c=>c.policies=[{relation:'production_control.certification_model_d_profile_v1',name:'unexpected',roles:['PUBLIC'],using:'true'}]],
 ['private exposure',c=>c.schemas[0].acl.push('anon=UC/postgres')],['dependency missing',c=>c.dependencies.pop()],
 ['dependency duplicate',c=>c.dependencies.push({...c.dependencies[0]})],['dependency extra field',c=>c.dependencies[0].unexpected='unsafe'],
 ['extension owner',c=>c.extensions[0].owner='anon'],['extension version',c=>c.extensions[0].version='2.0'],
 ['unsafe provider public function',c=>c.functions.push({identity:'public.provider_escape()',owner:'supabase_admin',acl:['=X/supabase_admin'],definer:true})]
];
for(const [label,mutate]of mutations)test('exact verifier detects '+label,()=>{const c=clone();mutate(c);const d=modelDCatalogDiagnostics(c,expected);assert.equal(d.equal,false);assert.ok(d.sections.length);assert.ok(d.sections.every(s=>s.rows.length<=10));});
test('only complete dependency ordering and existing pgcrypto owner variability are normalized',()=>{const c=clone();c.dependencies.reverse();c.extensions[0].owner='supabase_admin';assert.equal(modelDCatalogDiagnostics(c,expected).equal,true);});
test('diagnostics emit identities/digests, never body or arbitrary metadata values',()=>{const c=clone();c.functions[0].definition='SECRET_SENTINEL';c.functions[0].searchPath=['SECRET_SENTINEL'];const d=JSON.stringify(modelDCatalogDiagnostics(c,expected));assert.ok(!d.includes('SECRET_SENTINEL'));assert.ok(d.includes('expectedDigest')&&d.includes('actualDigest'));});

test('PG17 C/hosted ICU predecessor repro, exact corrected install/replay, security failures and atomic rollback',async()=>{
 const cluster=await createIsolatedCluster(),evidence={hostedMutation:false,cases:[],counts:{functions:expected.functions.length,rlsTables:expected.relations.filter(r=>r.rls).length}};
 try{
  const old=JSON.parse(await readFile(repositoryRoot+'/config/certification-resource-registration.json'));
  const registrationManifest={contract:old.contract,enabled:true,purpose:'PART2C_DRESS_REHEARSAL',registration:{...old.registration,installation_id:'d3000000-0000-4000-8000-000000000001',resource_id:'CERTIFICATION:d3000000-0000-4000-8000-000000000001',project_ref:'abcdefghijklmnopqrst',project_url:'https://abcdefghijklmnopqrst.supabase.co',git_branch:'codex/certification-model-d',schema_digest:image.manifest.artifacts.schema,server_key_sha256:'1'.repeat(64),public_key_sha256:'2'.repeat(64)}};
  const packageSql=(await renderModelDInstallation({registrationManifest})).replace(/^\\\\/gm,'\\');
  for(const name of ['reference','provider','rollback']){
   if(name==='reference')createDatabase(cluster,name);else sql(cluster,'postgres',`create database ${name} template template0 locale_provider icu icu_locale 'en-US' lc_collate 'en_US.UTF-8' lc_ctype 'en_US.UTF-8'`,{role:''});
   installLocalCanonicalPlatform(cluster,name);
   if(name!=='reference')sql(cluster,name,'alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role',{role:''});
   await enableOwnedSafeupdate({cluster,database:name,q:s=>sql(cluster,name,s,{role:''})});
   if(name==='rollback'){
    const bad=packageSql.replace('do $verify$',"grant execute on function production_control.model_d_context_v1(jsonb)to anon;\ndo $verify$");
    const r=sqlResult(cluster,name,bad,{role:''});assert.notEqual(r.status,0);assert.match(r.stderr,/MODEL_D_CATALOG_MISMATCH/);assert.match(r.stderr,/expectedDigest/);assert.match(r.stderr,/actualNormalizedDigest/);assert.match(r.stderr,/A\/B\/E\/G\/H/);
    assert.equal(sql(cluster,name,"select count(*)from pg_namespace where nspname in('production_control','participant_identity','production_rehearsal','scoring_authority')",{role:''}),'0');evidence.cases.push('fresh failure rolls back all application schema and receipt');continue;
   }
   sql(cluster,name,packageSql,{role:''});const actual=await canonicalCatalog(cluster,name);
   if(name==='reference')assert.doesNotThrow(()=>assertCatalogConvergence(actual,expected));else{
    assert.throws(()=>assertCatalogConvergence(actual,expected),/Catalog divergence/);
    assert.equal(modelDCatalogDiagnostics(actual,expected).equal,true);
    const sections=Object.keys(actual).filter(k=>serialize(actual[k])!==serialize(expected[k]));assert.deepEqual(sections,['dependencies']);
    evidence.predecessor={sameReason:true,sections,dependencyCount:actual.dependencies.length,changedPositions:actual.dependencies.filter((r,i)=>serialize(r)!==serialize(expected.dependencies[i])).length};
   }
   const receipt=sql(cluster,name,'select to_jsonb(r)from production_control.canonical_bootstrap_installation_v1 r',{role:''});sql(cluster,name,packageSql,{role:''});assert.equal(sql(cluster,name,'select to_jsonb(r)from production_control.canonical_bootstrap_installation_v1 r',{role:''}),receipt);evidence.cases.push(name+' exact install/replay');
   if(name==='provider'){
    const verify=modelDCatalogVerificationSql(await readFile(repositoryRoot+'/supabase/canonical_bootstrap/catalog.sql','utf8'),"'"+JSON.stringify(expected).replaceAll("'","''")+"'::jsonb");
    for(const [label,mutation]of [
     ['missing function','drop function production_control.model_d_context_v1(jsonb)'],
     ['extra function',"create function public.unexpected_privileged()returns void language plpgsql security definer as $$begin end$$"],
     ['public relation exposure',"create table public.unexpected_exposed(id integer);grant select on public.unexpected_exposed to anon"],
     ['body',"create or replace function production_control.model_d_context_v1(context jsonb)returns boolean language sql as $$select false$$"],
     ['owner','alter function production_control.model_d_context_v1(jsonb)owner to anon'],
     ['unsafe extension owner',"update pg_extension set extowner=(select oid from pg_roles where rolname='anon')where extname='pgcrypto'"],
     ['ACL','grant execute on function production_control.model_d_context_v1(jsonb)to service_role'],
     ['security','alter function production_control.model_d_context_v1(jsonb)security invoker'],
     ['search_path',"alter function production_control.model_d_context_v1(jsonb)set search_path=public"],
     ['RLS','alter table production_control.certification_model_d_profile_v1 disable row level security'],
     ['policy',"create policy unexpected on production_control.certification_model_d_profile_v1 using(true)"]
    ]){
     const r=sqlResult(cluster,name,'begin;'+mutation+';'+verify+'commit;',{role:''});assert.notEqual(r.status,0,label);assert.match(r.stderr,/MODEL_D_CATALOG_MISMATCH/,label);evidence.cases.push('SQL '+label+' detected/rolled back');
    }
    assert.equal(modelDCatalogDiagnostics(await canonicalCatalog(cluster,name),expected).equal,true);
   }
  }
 }finally{await destroyIsolatedCluster(cluster);await mkdir(repositoryRoot+'/docs/reliability/phase2d-model-d-catalog/evidence',{recursive:true});await writeFile(repositoryRoot+'/docs/reliability/phase2d-model-d-catalog/evidence/focused.json',JSON.stringify(evidence,null,2)+'\n');}
});
