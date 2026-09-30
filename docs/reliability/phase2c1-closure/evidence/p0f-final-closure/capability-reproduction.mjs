import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const root='/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv';
const output='/private/tmp/bagger-p0f-routing-7b6ca995-20260930T015537Z';
const load=f=>import(pathToFileURL(root+'/'+f));
const actual=await load('lib/canonical-director-overview.js');
const {mutateCanonicalMatchControl}=await load('lib/scoring-authority-supabase.js');
const {PRODUCTION_TOURNAMENT_SETUP_ACTIONS}=await load('lib/production-tournament-setup-contract.js');
Object.assign(process.env,{VERCEL_ENV:'preview',SCORING_AUTHORITY:'supabase',SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-not-a-real-credential'});
let fetchCalls=0,authorityCalls=0,canonicalCalls=0;
globalThis.fetch=async()=>{fetchCalls++;throw new Error('P0F_CHARACTERIZATION_NO_TRANSPORT');};
const authorization={status:'active',source:'entitlement',identity:{authUserId:'00000000-0000-4000-8000-000000000001',actor:{id:'D1',role:'DIRECTOR'},tournamentId:'2098'}};
const actualFiles=new Set();
async function route(file){
 actualFiles.add(file);
 const key='p0f-readonly-'+randomUUID();
 const deps={NextResponse:Response,withOperationalRoute:(_,fn)=>fn,recordOperationalError:()=>{},PRODUCTION_TOURNAMENT_SETUP_ACTIONS,
 authorizePreviewDirector:async()=>{authorityCalls++;return authorization;},
 mutateIsolatedCanonicalDirectorMatch:actual.mutateIsolatedCanonicalDirectorMatch,
 readIsolatedCanonicalDirectorOverview:actual.readIsolatedCanonicalDirectorOverview};
 const source=await readFile(root+'/'+file,'utf8');
 const transformed=source.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,bindings)=>{
  for(const name of bindings.split(',').map(v=>v.trim()).filter(Boolean)){
   const imported=name.split(/\s+as\s+/)[0];
   if(!(imported in deps))deps[imported]=()=>{canonicalCalls++;throw new Error('UNEXPECTED_DOWNSTREAM_'+imported);};
  }
  return `const {${bindings.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`;
 });
 assert.doesNotMatch(transformed,/^import /m);
 globalThis[key]=deps;
 try{return await import('data:text/javascript;base64,'+Buffer.from(transformed).toString('base64')+'#'+key);}finally{delete globalThis[key];}
}
const rows=[
 {id:'BROAD-NEW-007',file:'app/api/director/tournament-setup/route.js',route:'/api/director/tournament-setup',method:'POST',input:{action:'upsert-course'},expectedStatus:404,expectedCode:null,capability:'Course/tee + handicap readback'},
 {id:'BROAD-NEW-008',file:'app/api/director/tournament-setup/route.js',route:'/api/director/tournament-setup',method:'GET',expectedStatus:404,expectedCode:null,capability:'Verified full setup operation pipeline'},
 {id:'BROAD-NEW-009',file:'app/api/director/tournament-setup/route.js',route:'/api/director/tournament-setup',method:'POST',input:{action:'replace-round-pairings'},expectedStatus:404,expectedCode:null,capability:'Atomic round pairings'},
 {id:'BROAD-NEW-010',file:'app/api/director/net-skins-entries/route.js',route:'/api/director/net-skins-entries',method:'POST',input:{roundId:'R1',operationRequestId:'synthetic-entry'},expectedStatus:404,expectedCode:null,capability:'Net Skins entry authority'},
 {id:'BROAD-NEW-011',file:'app/api/admin/production-calcutta-v1/route.js',route:'/api/admin/production-calcutta-v1',method:'POST',input:{action:'management-entry'},expectedStatus:404,expectedCode:null,capability:'Calcutta purchase/ownership'},
 {id:'BROAD-NEW-012',file:'app/api/director/canonical-overview/route.js',route:'/api/director/canonical-overview',method:'POST',input:{action:'scoring-lock',matchId:'M1',operationRequestId:'synthetic-lock',expectedMatchRevision:1,expectedPermissionRevision:1},expectedStatus:400,expectedCode:'DIRECTOR_CANONICAL_INPUT_INVALID',capability:'Contextual Lock/Resume controls'},
 {id:'BROAD-NEW-174',file:'app/api/director/canonical-overview/route.js',route:'/api/director/canonical-overview',method:'POST',input:{action:'mark-live',matchId:'M1',operationRequestId:'synthetic-open',expectedMatchRevision:1,expectedPermissionRevision:1},expectedStatus:400,expectedCode:'DIRECTOR_CANONICAL_INPUT_INVALID',capability:'Mark Live / scoring lock / access'}
];
for(const row of rows){
 const handler=await route(row.file),before={authorityCalls,canonicalCalls,fetchCalls};
 const response=await handler[row.method](new Request('http://localhost'+row.route,{method:row.method,headers:{origin:'http://localhost','content-type':'application/json'},...(row.input?{body:JSON.stringify(row.input)}:{})}));
 row.observed={status:response.status,body:await response.json(),authorizationStubCalls:authorityCalls-before.authorityCalls,downstreamStubCalls:canonicalCalls-before.canonicalCalls,fetchCalls:fetchCalls-before.fetchCalls};
 assert.equal(row.observed.status,row.expectedStatus,row.id);assert.equal(row.observed.body.code||null,row.expectedCode,row.id);
 assert.equal(row.observed.downstreamStubCalls,0);assert.equal(row.observed.fetchCalls,0);
 row.result='MISSING_CAPABILITY_REPRODUCED';row.capabilityVerdict='PARTIAL';
}
const controls=[];
for(const operation of ['MARK_LIVE','SCORING_LOCK','SCORING_UNLOCK','ACCESS_ACTIVATE','ACCESS_REVOKE']){
 try{await mutateCanonicalMatchControl({operation,match_id:'M1',mutation_key:'synthetic-control'},{env:process.env});assert.fail('Unexpected supported Preview control');}
 catch(error){assert.equal(error.code,'OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY');assert.equal(error.status,409);controls.push({operation,status:error.status,code:error.code,result:'UNSUPPORTED_REPRODUCED'});}
}
assert.equal(fetchCalls,0);assert.equal(canonicalCalls,0);
const hashes=await Promise.all([...actualFiles,'lib/canonical-director-overview.js','lib/scoring-authority-supabase.js','lib/production-tournament-setup-contract.js'].map(async file=>({file,sha256:createHash('sha256').update(await readFile(root+'/'+file)).digest('hex')})));
const result={schema:'p0f-readonly-capability-reproduction-v1',executionHead:'7b6ca99510dc2f44cc411bfe7769e7f0c05ed962',environment:'LOCAL_NON_PRODUCTION',proofLayer:'API_HANDLER_AND_ACTUAL_SELECTOR_CHARACTERIZATION',result:'7_REQUIRED_GAPS_REPRODUCED',counts:{gapIdentities:7,missingCapabilityResponses:7,unsupportedControlOperations:5,fetchCalls,downstreamCalls:canonicalCalls,authorizationStubCalls:authorityCalls},rows,controls,sourceHashes:hashes,limitations:['Shipping route function bodies executed through the prior closure route-loader pattern; named imports are replaced with explicit stubs.','Production-only route guards execute before authorization and request validation; these five requests intentionally characterize admission, not full valid client payloads.','Canonical overview executes actual isolated mutation helper, with synthetic active entitlement; unsupported action returns before database I/O.','Authorization provider is stubbed: not a security PASS. No SQL, hosted environment, rendering, or successful capability chain is proven.','No requested or rejected source change was applied; no test expectations were changed.']};
await writeFile(output+'/capability-reproduction.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({result:result.result,counts:result.counts,rows:rows.map(r=>({id:r.id,...r.observed})),controls},null,2));
