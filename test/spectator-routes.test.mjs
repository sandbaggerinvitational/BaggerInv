import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {hasParticipantCookies} from '../lib/spectator-navigation.js';
function load(file,modules,env={SPECTATOR_PWA_ENABLED:'true'}){
  const code=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names)=>`const {${names}}=modules;`).replace(/export /g,'');
  return new Function('modules','process',code+';return {GET};')(modules,{env});
}
const NextResponse={json:(body,{status=200,headers={}}={})=>({body,status,headers})};
test('spectator API allowlist rejects arbitrary modules, IDs, query strings and disabled flag before reads',async()=>{
  let reads=0;const modules={NextResponse,readFollowingResource:async()=>{reads++;return{contract:'fixture'};}};
  const h=load('app/api/spectator/[resource]/route.js',modules);
  for(const resource of ['net-skins','calcutta','holdings','identity','director','round-scoring','account','../tournament'])assert.equal((await h.GET(new Request('https://fixture.invalid/api/spectator/'+resource),{params:Promise.resolve({resource})})).status,404);
  assert.equal((await h.GET(new Request('https://fixture.invalid/api/spectator/tournament?playerId=CB01'),{params:{resource:'tournament'}})).status,404);
  assert.equal(reads,0);
  const disabled=load('app/api/spectator/[resource]/route.js',modules,{});assert.equal((await disabled.GET(new Request('https://fixture.invalid/api/spectator/tournament'),{params:{resource:'tournament'}})).status,404);
  for(const resource of ['tournament','odds','history','records'])assert.equal((await h.GET(new Request('https://fixture.invalid/api/spectator/'+resource),{params:{resource}})).status,200);
  assert.equal(reads,4);
});
test('no-session entry performs zero auth/identity calls; failures retain recovery',async()=>{
  let items=[],calls=0,fail=false;const h=load('app/api/entry/route.js',{NextResponse,hasParticipantCookies,cookies:async()=>({getAll:()=>items}),resolveSupabaseParticipantIdentity:async()=>{calls++;if(fail)throw Error();}});
  const request=new Request('https://fixture.invalid/api/entry');assert.equal((await h.GET(request)).body.session,'none');assert.equal(calls,0);
  items=[{name:'sbi-player-passport'}];assert.equal((await h.GET(request)).body.session,'participant');fail=true;
  assert.equal((await h.GET(request)).body.session,'recovery');assert.equal(items.length,1);
});
for(const resource of ['net-skins','calcutta'])test('direct existing '+resource+' API denies unauthenticated before reading data',async()=>{
  let reads=0,auth=0;const source={resolved:'supabase',productionCutover:{handled:true}};
  const modules=new Proxy({NextResponse,cookies:async()=>({getAll:()=>[]}),applicationRequestEnvironment:()=>({VERCEL_ENV:'production'}),
    requireNetSkinsReadSource:()=>source,requireCalcuttaReadSource:()=>source,requireParticipantIdentityAuthority:()=>({resolved:'supabase'}),
    resolveSupabaseParticipantIdentity:async()=>{auth++;throw Object.assign(Error('Sign in required'),{status:401,code:'PARTICIPANT_AUTH_REQUIRED'});},
    participantIdentityPublicError:()=>({status:401,code:'PARTICIPANT_AUTH_REQUIRED',error:'Sign in required'})},
    {get:(o,k)=>k in o?o[k]:(()=>{reads++;throw Error('PRIVATE_READ_REACHED');})});
  const h=load('app/api/leaderboards/'+resource+'/route.js',modules,{VERCEL_ENV:'production'});
  const req=new Request('https://fixture.invalid/api/leaderboards/'+resource);req.nextUrl=new URL(req.url);
  const result=await h.GET(req);assert.equal(result.status,401);assert.equal(auth,1);assert.equal(reads,0);
});
test('public chooser/following never record or upload participant diagnostics; participant routes retain them',()=>{
 const source=fs.readFileSync(new URL('../app/ParticipantAuthDiagnostics.js',import.meta.url),'utf8')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,'').replace('export default function','function');
 for(const pathname of ['/enter','/follow','/follow/today','/follow/players/CB01','/participant-auth','/home']){
  const effects=[],calls=[];
  const deps={usePathname:()=>pathname,useEffect:fn=>effects.push(fn),participantAuthDiagnosticsEnabled:()=>true,
   finishParticipantAuthNavigation:()=>calls.push('finish'),flushParticipantAuthDiagnostics:async()=>calls.push('flush'),
   recordParticipantAuthDiagnostic:()=>calls.push('record'),rememberParticipantAuthNavigation:()=>{},
   performance:{getEntriesByType:()=>[]},location:{pathname,origin:'http://localhost'},document:{addEventListener:()=>calls.push('listen'),removeEventListener:()=>{}}};
  new Function(...Object.keys(deps),source+';ParticipantAuthDiagnostics();')(...Object.values(deps));effects.forEach(fn=>fn());
  if(pathname==='/home'||pathname==='/participant-auth'){assert(calls.includes('flush'));assert(calls.includes('record'));}
  else assert.deepEqual(calls,[],pathname);
 }
});
