import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import manifest from '../lib/web-app-manifest.js';
import {participantAuthReturnPath} from '../lib/participant-auth-return-path.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const routes=['/home','/my-match','/app/tournament','/game-center/R1-1','/score','/app/leaderboards','/me','/app/players/clay-beltran','/app/guide/schedule','/app/history/2025/round/2','/app/odds','/records','/participant-auth','/activate','/privacy','/support'];
test('one stable standalone manifest covers participant routes and shortcuts on the installing origin',()=>{
 const m=manifest();assert.equal(m.id,'/');assert.equal(m.start_url,'/home');assert.equal(m.scope,'/');assert.equal(m.display,'standalone');
 for(const origin of ['https://baggerinv.com','https://preview.example','http://localhost:3107']) for(const path of [...routes,...m.shortcuts.map(x=>x.url)]){
  const url=new URL(path,origin),scope=new URL(m.scope,origin);assert.equal(url.origin,scope.origin);assert.ok(url.pathname.startsWith(scope.pathname));
 }
});
test('Production manifest discovery is independent of optional install marketing',async()=>{
 const layout=await read('app/layout.js');assert.match(layout,/<head>[\s\S]*?<link rel="manifest" href="\/manifest.webmanifest" \/>/);assert.doesNotMatch(layout,/installabilityEnabled \? \{ manifest:/);
 const nav=await read('app/ParticipantIdentity.js');assert.doesNotMatch(nav,/window\.open|target=["']_blank|https?:\/\//);for(const p of ['/home','/my-match','/app/tournament','/app/leaderboards','/me'])assert.ok(nav.includes(`href: "${p}"`));
});
test('email sign-in and session restore preserve internal deep return destinations',()=>{
 for(const p of ['/home','/my-match','/score?match=R1-3','/game-center/R2-3','/live?view=leaderboards','/me','/app/tournament?round=2','/app/leaderboards?tab=players','/app/players/clay-beltran','/app/guide/schedule#morning','/app/history/2025/round/1','/app/courses/ocean','/app/odds','/records/individual'])assert.equal(participantAuthReturnPath(p),p);
});
test('return navigation rejects external, admin, malformed and normalized escape destinations',()=>{
 for(const p of ['https://evil.example','//evil.example','/\\evil.example','/app/../admin','/app/%2e%2e/admin','/app/players/%2fadmin','/app/players/%5cevil','/me\n//evil','/admin/director','/api/scoring','/participant-auth','/app/admin','/homeish','javascript:alert(1)',''])assert.equal(participantAuthReturnPath(p),'/home',p);
});
async function worker(){const handlers={},calls={fetch:[],put:[],deleted:[],claim:0,skip:0};const cache={addAll:async()=>{},put:async(...args)=>calls.put.push(args)};
 const context={URL,self:{location:{origin:'https://baggerinv.com'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting:()=>calls.skip++,clients:{claim:()=>calls.claim++}},caches:{open:async()=>cache,match:async()=>({offline:true}),keys:async()=>['sbi-shell-v4','sbi-shell-v5','sbi-shell-v6','another-app'],delete:async k=>calls.deleted.push(k)},fetch:async r=>{calls.fetch.push(r.url);return {ok:true,clone:()=>({})}}};
 vm.runInNewContext(await read('public/sw.js'),context);return{handlers,calls,context};}
test('documents stay network-first; refresh gets current shell; only offline navigation uses fallback',async()=>{
 const w=await worker();let response;const request={url:'https://baggerinv.com/app/leaderboards',method:'GET',mode:'navigate'};
 w.handlers.fetch({request,respondWith:p=>response=p});await response;assert.deepEqual(w.calls.fetch,[request.url]);assert.equal(w.calls.put.length,0);
 w.context.fetch=async()=>{throw Error('offline')};w.handlers.fetch({request,respondWith:p=>response=p});assert.equal((await response).offline,true);
});
test('worker never intercepts auth, writes, scoring, Next runtime or external requests',async()=>{
 const w=await worker();for(const [path,method] of [['/api/participant/auth/email','POST'],['/api/player-passport','GET'],['/participant-auth','GET'],['/score','GET'],['/_next/static/chunk.js','GET'],['https://maps.apple.com','GET']]){
 let intercepted=false;w.handlers.fetch({request:{url:new URL(path,'https://baggerinv.com').href,method,mode:'navigate'},respondWith:()=>intercepted=true});assert.equal(intercepted,false,path);
 }
});
test('worker replaces old shell caches and claims clients; registration checks for updates',async()=>{
 const w=await worker();let pending;w.handlers.install({waitUntil:p=>pending=p});await pending;assert.equal(w.calls.skip,1);
 w.handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(w.calls.deleted,['sbi-shell-v4','sbi-shell-v5']);assert.equal(w.calls.claim,1);
 const source=await read('app/PwaFoundation.js');assert.match(source,/register\("\/sw.js", \{ updateViaCache: "none" \}\)/);assert.match(source,/registration.update\(\)/);assert.match(source,/controllerReloadStarted/);
});
