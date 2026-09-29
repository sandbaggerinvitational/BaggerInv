// Proof layer: API / INTEGRATION. Boot a prebuilt local stack; no hosted traffic.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
test('ZERO_CREDENTIAL API: compiled application boots and health works without Google configuration',{timeout:60000},async()=>{
 for(const name of ['.env','.env.local','.env.production','.env.production.local'])assert.equal(existsSync(path.join(repositoryRoot,name)),false,'No hidden env-file credential source allowed');
 assert.ok(existsSync(path.join(repositoryRoot,'.next/BUILD_ID')),'Run local build first');
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const env={PATH:process.env.PATH,NODE_OPTIONS:`--require ${path.join(repositoryRoot,'tools/reliability/phase2c1-proof-isolation.cjs')}`,NEXT_TELEMETRY_DISABLED:'1',VERCEL_ENV:'preview',
 PARTICIPANT_IDENTITY_AUTHORITY:'supabase',SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-nonfunctional-secret',SUPABASE_SCORING_MIRROR_ENABLED:'true',NEXT_PUBLIC_SUPABASE_AUTH_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:'synthetic-nonfunctional-key',MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE:'supabase-turnstile',PARTICIPANT_AUTH_CAPTCHA_REQUIRED:'true',PARTICIPANT_AUTH_CAPTCHA_CONFIGURED:'true',NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY:'synthetic-nonfunctional-site-key',PARTICIPANT_AUTH_RATE_LIMIT_SECRET:'synthetic-rate-limit-secret-at-least32-chars',MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET:'synthetic-certification-secret-at-least32-chars',MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED:'true',MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED:'true'};
 for(const name of ['HOME_READ_SOURCE','TOURNAMENT_READ_SOURCE','LEADERBOARDS_CORE_READ_SOURCE','GUIDE_READ_SOURCE','COURSE_PRESENTATION_READ_SOURCE','SCORING_READ_SOURCE','MATCH_AUTHORIZATION_SOURCE','SCORING_AUTHORITY'])env[name]='supabase';
 assert.deepEqual(Object.keys(env).filter(k=>/GOOGLE|SHEET|DRIVE|WORKBOOK/.test(k)),[]);
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:repositoryRoot,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);let health;
 try{
  const until=Date.now()+30000;
  while(Date.now()<until){assert.equal(child.exitCode,null,output);try{health=await fetch(`http://127.0.0.1:${port}/api/mobile/v1/health`);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(health,'Local app became available');assert.equal(health.status,200);const body=await health.json();assert.equal(body.ok,true);assert.equal(body.apiVersion,'v1');
  const retired=[];for(const route of ['scoring-google-outbox','round-scorecards-archive','future-match-google-compatibility','guide-sync']){
   const r=await fetch(`http://127.0.0.1:${port}/api/cron/${route}`,{method:'POST'});assert.equal(r.status,410,route);retired.push({route,status:r.status});
  }
  await writeFile(path.join(repositoryRoot,'docs/reliability/phase2c1/evidence/zero-credential-boot.json'),JSON.stringify({schemaVersion:1,result:'PASS',environment:'LOCAL_COMPILED_NEXT_HTTP',production:false,googleConfiguration:[],network:'REMOTE_DENIED',health:{status:200,body},retired,limitations:['Boot and transport-free health only; this does not establish authenticated Director controls, database connectivity, or hosted readiness.','Synthetic Supabase config values are nonfunctional; no real provider request permitted.']},null,2)+'\n');
 }finally{child.kill('SIGTERM');await once(child,'exit');}
});
