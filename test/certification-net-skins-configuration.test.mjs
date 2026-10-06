import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mutateIsolatedDirectorOperations} from '../lib/isolated-director-operations.js';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
const root=new URL('../',import.meta.url);
const artifact=await readFile(new URL('supabase/production_incremental/certification-net-skins-configuration-v1.sql',root),'utf8');
test('extracted shared core keeps every original Production statement in its null-context arm',()=>{
 const patches=JSON.parse(artifact.split('$manifest$')[1]);
 const original=patches.find(p=>p.signature==='public.configure_production_net_skins_v1(jsonb)').old;
 const body=artifact.split('execute $core$')[1].split('AS $function$')[1].split('$function$')[0];
 // Select the literal Production branches, retaining nested Production guards.
 let depth=0,keep=true;const selected=[];
 for(const line of body.split('\n')){
  if(!depth&&line.trim()==='if canonical_context is null then'){depth=1;keep=true;continue;}
  if(depth){
   if(/^\s*if\s/.test(line))depth++;
   if(/^\s*end if;/.test(line)){depth--;if(!depth){keep=true;continue;}}
   if(depth===1&&line.trim()==='else'){keep=false;continue;}
  }
  if(keep)selected.push(line);
 }
 const production=selected.join('\n').replace('  affected_rows bigint;','')
 .replace(/  get diagnostics affected_rows = row_count;\n  if canonical_context is not null and affected_rows <> 1 then\n[\s\S]*?\n  end if;/,'')
 .replace("case when canonical_context is null then 'PRODUCTION' else 'CERTIFICATION' end","'PRODUCTION'")
 .replace("case when canonical_context is null then 'production' else 'preview' end","'production'");
 const normalized=value=>value.split('\n').map(line=>line.trim()).filter(Boolean).join('\n');
 assert.equal(normalized(production),normalized(original));
});
test('forward SQL extends fixed Director operation and ingress authority; Production null branch keeps original guards',()=>{
 assert.match(artifact,/assert_production_net_skins_v1_runtime\(input\)/);
 assert.match(artifact,/canonical_configure_net_skins_v1\(input,null\)/);
 assert.match(artifact,/DIRECTOR.CONFIGURE_NET_SKINS/);assert.match(artifact,/CERTIFICATION_NET_SKINS_PREDECESSOR_MISMATCH/);
 assert.match(artifact,/CERTIFICATION_NET_SKINS_METADATA_DRIFT/);assert.doesNotMatch(artifact,/where\s+true|safeupdate\.enabled\s*=\s*off/i);
 assert.doesNotMatch(artifact,/grant execute|create policy|alter table .*disable row level security/i);
 assert.match(artifact,/OFFICIAL_ONLY/);assert.match(artifact,/full_net_skins_manifest_v2\('2026',selected_rounds,input->'entry_revisions'\)/);
});
test('Production route still returns Preview 404 before auth/core and has no Certification dispatch',async()=>{
 let calls=0;const key='net-skins-preview-denial';globalThis[key]={NextResponse:Response,after:()=>assert.fail(),
 withOperationalRoute:(_c,h)=>h,recordOperationalError:()=>{},authorizePreviewDirector:()=>{calls++;assert.fail();},
 assertProductionCutoverActivation:()=>assert.fail(),assertProductionCutoverRequest:()=>assert.fail(),
 configureProductionNetSkinsV1:()=>assert.fail(),enqueueProductionNetSkinsV1Recalculation:()=>assert.fail(),processProductionNetSkinsV1Job:()=>assert.fail(),
 dataAuthorityResponseHeaders:()=>{},withDataAuthorityRequestScope:()=>assert.fail(),recalculateCompetitionDerivedTournament:()=>assert.fail()};
 const source=(await readFile(new URL('app/api/admin/production-net-skins-v1/route.js',root),'utf8'))
 .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_m,n)=>`const {${n}}=globalThis[${JSON.stringify(key)}];\n`);
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const result=await route.POST(new Request('http://localhost/api/admin/production-net-skins-v1',{method:'POST',body:'{}'}));assert.equal(result.status,404);assert.equal(calls,0);}
 finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;delete globalThis[key];}
});
for(const changed of[{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'},
 {BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION:foreign'}])test('registration denies foreign runtime '+JSON.stringify(changed),async()=>{
 const f=certificationRuntimeFixture();await assert.rejects(mutateIsolatedDirectorOperations({authorization:f.authorization,
 input:{family:'NET_SKINS_CONFIGURATION',action:'configure',payload:{},operationRequestId:'66666666-6666-4666-8666-666666666666',expectedContextToken:'b'.repeat(64)},
 env:{...f.env,...changed}},{certificationDependencies:f.dependencies}));assert.equal(f.requests.length,0);
});
