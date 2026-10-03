// Real Next production build/start against a freshly installed owned database.
// Auth signatures/JWKS and PostgREST HTTP are modeled locally; there is no
// hosted Auth, provider deployment, real account, message or outbound network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomBytes,randomUUID,createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {once} from 'node:events';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {destroyIsolatedCluster,binaries,repositoryRoot} from './support/reliability/postgres17.mjs';
import {readCanonicalArtifacts} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {syntheticActor,syntheticDirector} from './support/reliability/synthetic-tournament.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {provisionAnnualSyntheticAuthority} from './support/reliability/certification-annual-transition-fixture.mjs';
import {createCanonicalDirectorOperationsTransport} from '../lib/canonical-director-operations-client.js';
import {canonicalDirectorOddsRequest,canonicalDirectorOddsCommand} from '../lib/canonical-director-odds-client.js';
import {createScoringSession,SCORING_SESSION_COOKIE} from '../lib/scoring-access.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
// These retained, non-secret historical evidence artifacts are static imports
// of shipping modules. Copy them byte-for-byte, without enabling their routes.
const staticEvidenceImports=[
 'docs/evidence/step11-6-production-google-credential-confinement-v4.json',
 'docs/evidence/step11-6-historical-safe-method-google-writer-v2.json',
 'docs/evidence/step11-6-historical-production-google-writer-scope-v1.json',
 'docs/evidence/step11-6-production-origin-inventory-v4.json',
];
async function files(root,relative=''){
 const result=[];for(const item of await readdir(path.join(root,relative),{withFileTypes:true})){
  const file=path.join(relative,item.name);if(item.isDirectory())result.push(...await files(root,file));else if(item.isFile())result.push(file);
 }return result.sort();
}
async function manifest(root){
 const list=[];for(const directory of ['app','lib','contracts'])for(const file of await files(path.join(root,directory)))
  list.push([directory+'/'+file,hash(await readFile(path.join(root,directory,file)))]);
 for(const file of staticEvidenceImports)list.push([file,hash(await readFile(path.join(root,file)))]);
 return Object.fromEntries(list);
}
function cleanEnv(){
 const env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|DATABASE_URL|DIRECT_URL|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_|NODE_OPTIONS/i.test(key))delete env[key];
 return env;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function start(args,cwd,env){
 const child=spawn(process.execPath,args,{cwd,env,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
 return{child,output:()=>output};
}
async function port(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
function sessionCookie(auth,projectRef,keys){
 const now=Math.floor(Date.now()/1000),header={typ:'JWT',alg:'ES256',kid:keys.kid};
 const claims={iss:`https://${projectRef}.supabase.co/auth/v1`,aud:'authenticated',sub:auth.authUserId,role:'authenticated',
  email:auth.email,iat:now,exp:now+3600,aal:'aal1',session_id:'90000000-0000-4000-8000-000000000001'};
 const encoded=[header,claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const token=encoded+'.'+sign('sha256',Buffer.from(encoded),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const session={access_token:token,refresh_token:'synthetic-unused-refresh-token',token_type:'bearer',expires_in:3600,expires_at:now+3600,
  user:{id:auth.authUserId,email:auth.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}}};
 return `sb-${projectRef}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}
const provisional=process.env.BAGGER_R2_PROVISIONAL_BOOTSTRAP_PROOF==='1';
test(`${provisional?'provisional in-memory profile':'final canonical baseline'} boots the actual zero-Google application and enforces database-backed Director authority`,async t=>{
 const startedAt=new Date().toISOString(),evidence={environment:'OWNED_LOCAL_NEXT_PRODUCTION_BUILD_POSTGRESQL17',
  hosted:false,production:false,googleCalls:0,realMessages:0,proofLayer:'APPLICATION/API/POSTGRESQL/INTEGRATION',
  auth:'SYNTHETIC_ES256_SIGNATURE_AND_LOCAL_JWKS_NOT_HOSTED_AUTH',provisional,completeCandidateCertified:false,gates:[]};
 let fixture,directory,server,build;
 const check=async(name,body)=>{let failure;await t.test(name,async()=>{try{await body();evidence.gates.push(name);}catch(error){failure=error;throw error;}});if(failure)throw failure;};
 try{
  const recorded=provisional?null:await readCanonicalArtifacts();
  fixture=await createCertificationFixture({forwardMigrations:recorded?.manifest.forwardMigrations||certificationProvisionalProfile,registrationFactory:certificationTransportRegistration});
  // Declared initial synthetic identities and canonical input facts only. The
  // shared fixture creates no score, publication, completion or readiness.
  // Enrollment and hosted provider delivery are deliberately not claimed.
  evidence.initialIdentityFixture=provisionAnnualSyntheticAuthority(fixture);
  if(recorded)assert.equal(fixture.bundle.schema,recorded.schema,'Boot uses the emitted final schema');
  evidence.schemaSha256=hash(fixture.bundle.schema);
  evidence.bootstrapManifest=fixture.bundle.manifest;
  const before=await manifest(repositoryRoot);evidence.sourceManifest=before;
  directory=await mkdtemp(path.join(os.tmpdir(),'bagger-r2-application-'));
  for(const entry of ['app','lib','public','contracts','config','next.config.mjs','package.json','package-lock.json'])await cp(path.join(repositoryRoot,entry),path.join(directory,entry),{recursive:true});
  await mkdir(path.join(directory,'docs/evidence'),{recursive:true});
  for(const file of staticEvidenceImports)await cp(path.join(repositoryRoot,file),path.join(directory,file));
  await symlink(path.join(repositoryRoot,'node_modules'),path.join(directory,'node_modules'),'dir');
  await writeFile(path.join(directory,'config/certification-resource-registration.json'),JSON.stringify(fixture.transportFixture.registrationManifest)+'\n');
  assert.deepEqual(await manifest(directory),before,'Private fixture copy preserves every shipping application module');
  const keys={...generateKeyPairSync('ec',{namedCurve:'prime256v1'}),kid:'synthetic-local-es256'};
  const publicJwk={...keys.publicKey.export({format:'jwk'}),kid:keys.kid,alg:'ES256',use:'sig'};
  const observationFile=path.join(directory,'transport-observations.jsonl');await writeFile(observationFile,'');
  const transportFile=path.join(directory,'transport.json');
  await writeFile(transportFile,JSON.stringify({socket:fixture.cluster.socket,port:fixture.cluster.port,database:fixture.database,
   psql:binaries.psql,projectUrl:fixture.resource.project_url,serverKey:fixture.transportFixture.env.SUPABASE_SCORING_MIRROR_SECRET_KEY,
   publicJwk,observationFile}),{mode:0o600});
  const env={...cleanEnv(),...fixture.transportFixture.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
   SCORING_AUTHORITY:'supabase',PARTICIPANT_IDENTITY_AUTHORITY:'supabase',SUPABASE_SCORING_MIRROR_ENABLED:'true',
   SCORING_SESSION_SECRET:randomBytes(32).toString('hex'),PLAYER_PASSPORT_SECRET:randomBytes(32).toString('hex'),
   BAGGER_R2_LOCAL_TRANSPORT_FILE:transportFile,
   NODE_OPTIONS:`--require ${path.join(repositoryRoot,'test/support/reliability/certification-application-transport.cjs')}`};
  build=start(['node_modules/next/dist/bin/next','build'],directory,env);
  const [buildCode]=await once(build.child,'exit');evidence.buildExitCode=buildCode;
  assert.equal(buildCode,0,build.output().slice(-16000));
  // NextURL normalizes loopback IPs to localhost. Use that same local browser
  // origin rather than manufacturing a cross-origin request in this fixture.
  const listenPort=await port(),origin=`http://localhost:${listenPort}`;
  server=start(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(listenPort)],directory,env);
  for(let attempt=0;attempt<120;attempt++){
   if(server.child.exitCode!==null)throw Error(server.output().slice(-6000));
   try{await fetch(origin+'/favicon.ico');break;}catch{await wait(500);}
   if(attempt===119)throw Error('LOCAL_APPLICATION_BOOT_TIMEOUT');
  }
  const authRecord=actor=>({...actor,email:fixture.q(`select email from auth.users where id='${actor.authUserId}'`)});
  const directorCookie=sessionCookie(authRecord(syntheticDirector),fixture.resource.project_ref,keys),participantCookie=sessionCookie(authRecord(syntheticActor),fixture.resource.project_ref,keys);
  const get=async(route,cookie)=>{const response=await fetch(origin+route,{headers:cookie?{cookie}:{},redirect:'error'});return{status:response.status,body:await response.json()};};
  const browserFetch=cookie=>async(route,init={})=>{
   try{return await fetch(origin+route,{...init,redirect:'error',headers:{...init.headers,cookie,origin}});}
   catch(error){
    (evidence.httpTransportFailures??=[]).push({route,method:init.method||'GET',
     code:error.code||null,cause:error.cause?.code||null,message:error.cause?.message||error.message});
    throw error;
   }
  };
  const directorTransport=createCanonicalDirectorOperationsTransport({fetchImpl:browserFetch(directorCookie)});
  await check('actual application boot and public current authority succeed without Google configuration',async()=>{
   const live=await get('/api/tournament/live');assert.equal(live.status,200,JSON.stringify(live));
   assert.equal(live.body.data.tournament.id,'2026');assert.equal(live.body.readDiagnostics.googleRequests,0);
   const legacy=await get('/api/live');assert.equal(legacy.status,409);assert.equal(legacy.body.code,'LEGACY_GOOGLE_LIVE_READ_NOT_SELECTED');
  });
  await check('actual signed-out and participant sessions cannot obtain Director authority',async()=>{
   for(const cookie of [null,participantCookie]){
    const result=await get('/api/director/canonical-operations?family=MATCH_CONTROL',cookie);
    assert.equal(result.status,403,JSON.stringify(result));
   }
  });
  await check('real Auth signature validation and canonical entitlement produce the Director context',async()=>{
   const result=await get('/api/director/canonical-operations?family=MATCH_CONTROL',directorCookie);
   assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.ok,true);
   assert.equal(result.body.context.tournamentId,'2026');assert.equal(result.body.data.matches.length,24);
   assert.equal(result.body.googleRequests,0);assert.equal(result.body.fallbackUsed,false);
  });
  await check('actual participant current reads use the same installed resource and zero-Google authority',async()=>{
   const result=await get('/api/leaderboards/core',participantCookie);
   assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.player.id,syntheticActor.playerId);
   assert.equal(result.body.readDiagnostics.googleRequests,0);
  });
  await check('real Director Odds route begins truthfully unpublished and refuses cross-origin mutation',async()=>{
   const state=await get('/api/director/canonical-odds',directorCookie);
   assert.equal(state.status,200,JSON.stringify(state));assert.equal(state.body.publication.state,'NEVER_PUBLISHED');
   assert.equal(state.body.publication.revision,0);assert.deepEqual(state.body.jobs,[]);
   const response=await fetch(origin+'/api/director/canonical-odds',{method:'POST',headers:{cookie:directorCookie,origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}'});
   assert.equal(response.status,403);
  });
  await check('actual Director HTTP control, participant score and authenticated receipt recovery commit canonically',async()=>{
   const matchId='2026-R1-6',setup=await directorTransport.read('TOURNAMENT_SETUP'),id=randomUUID();
   await directorTransport.setupRequest({action:'prepare-scoring-context',
    expectedRevision:setup.data.revision,operationRequestId:id,matchId});
   const match=()=>JSON.parse(fixture.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
   for(const action of ['mark-live','access-activate']){
    const current=match();
    const result=await directorTransport.controlRequest(action,{matchId,expectedMatchRevision:current.match_revision,
     expectedPermissionRevision:current.permission_revision,operationRequestId:randomUUID()});
    assert.equal(result.committed,true);assert.equal(result.readbackVerified,true);
   }
   // Use the unchanged shipping signer for a synthetic pre-existing session.
   // Identity/link/permission are still revalidated by the real request path.
   const scoringCookie=SCORING_SESSION_COOKIE+'='+createScoringSession({scope:'match',matchId,tournamentId:'2026',
    playerId:syntheticActor.playerId,scorerName:'Synthetic boot participant',identityAuthority:'supabase',
    accessVersion:match().permission_revision},env.SCORING_SESSION_SECRET);
   const participantFetch=browserFetch(participantCookie+'; '+scoringCookie),mutationId=randomUUID();
   const response=await participantFetch('/api/scoring/current',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({holeNumber:1,expectedRevision:0,expectedMatchRevision:match().match_revision,
     team1GrossScores:[4,4],team2GrossScores:[5,5],clientMutationId:mutationId})});
   const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.ok(result.result.hole);
   const recover=await browserFetch(participantCookie)('/api/scoring/mutation-status',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({matchId,mutationId})});
   const recovered=await recover.json();assert.equal(recover.status,200,JSON.stringify(recovered));
   assert.equal(recovered.status,'COMMITTED');assert.equal(recovered.retry,'DO_NOT_RESUBMIT');
   assert.equal(fixture.q(`select count(*)from scoring_authority.hole_scores where match_id='${matchId}'and hole_number=1`),'1');
   evidence.httpScoreRecovery={matchId,mutationId,state:recovered.status,canonicalHoles:1};
  });
  await check('actual Director HTTP calculation worker and explicit publication preserve canonical public read',async()=>{
   const fetchImpl=browserFetch(directorCookie),client=(input=null,options={})=>canonicalDirectorOddsRequest(input,{...options,fetchImpl});
   const initial=await client();
   const calculation=canonicalDirectorOddsCommand({action:'calculate',phase:'Pre-Tournament',iterations:10000},initial,randomUUID());
   const requested=await client(calculation);assert.equal(requested.accepted,true);assert.equal(requested.publicationCreated,false);
   let reviewed;
   for(let attempt=0;attempt<120;attempt++){
    try{reviewed=await client(null,{jobId:requested.jobId});}
    catch(error){
     // The real local after-worker can outlive Next's HTTP keepalive window.
     // Reconnect only this read of the same job after observed ECONNRESET;
     // never retry calculation/publication writes or hide a domain response.
     const last=evidence.httpTransportFailures?.at(-1);
     if(error.code!=='DIRECTOR_ODDS_UNAVAILABLE'||last?.method!=='GET'||last?.cause!=='ECONNRESET')throw error;
     evidence.sameJobReadReconnects=(evidence.sameJobReadReconnects||0)+1;
     assert.ok(evidence.sameJobReadReconnects<=2,'Bounded same-job read reconnect');
     await wait(250);continue;
    }
    if(reviewed.jobs[0]?.status==='SUCCEEDED')break;
    assert.ok(['PENDING','RUNNING','RETRYABLE'].includes(reviewed.jobs[0]?.status),JSON.stringify(reviewed));
    await wait(250);
   }
   assert.equal(reviewed.jobs[0]?.status,'SUCCEEDED');assert.equal(reviewed.publication.state,'NEVER_PUBLISHED');
   const publication=canonicalDirectorOddsCommand({action:'publish',jobId:requested.jobId,confirmPublication:true},reviewed,randomUUID());
   const published=await client(publication);assert.equal(published.publicationCreated,true);
   const recovered=await client({action:'status',originalAction:'publish',operationRequestId:publication.operationRequestId});
   assert.equal(recovered.state,'COMMITTED');assert.equal(recovered.receipt.snapshotId,published.snapshotId);
   const current=await client();assert.equal(current.publication.state,'PUBLISHED');assert.equal(current.publication.revision,1);
   evidence.httpOdds={jobId:requested.jobId,actualAfterWorker:true,explicitPublication:true,receiptRecovery:true,snapshotId:published.snapshotId};
  });
  const observations=(await readFile(observationFile,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  evidence.transport={jwks:observations.filter(x=>x.kind==='SYNTHETIC_AUTH_JWKS').length,
   rpcCalls:observations.filter(x=>x.kind==='CANONICAL_RPC').length,deniedOutbound:observations.filter(x=>x.kind.startsWith('DENIED'))};
  evidence.postCommitCalcutta={canonicalDeliveryTicks:observations.filter(x=>x.kind==='CANONICAL_RPC'&&
   x.operation==='WORKERS.DELIVERY_TICK'&&x.sqlSucceeded).length,
   legacyMisrouteWarnings:(server.output().match(/Calcutta recalculation remains pending/g)||[]).length};
  assert.ok(evidence.postCommitCalcutta.canonicalDeliveryTicks>=3,'Actual hook uses required canonical delivery tick');
  assert.equal(evidence.postCommitCalcutta.legacyMisrouteWarnings,0,'No legacy Preview Calcutta fallback');
  assert.equal(evidence.transport.deniedOutbound.length,0,JSON.stringify(evidence.transport.deniedOutbound));
  assert.ok(evidence.transport.jwks>0);assert.ok(evidence.transport.rpcCalls>0);
  assert.deepEqual(await manifest(repositoryRoot),before,'Shipping source stable during boot proof');
  evidence.sourceStable=true;evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.failure={code:error.code||null,message:error.message};throw error;}
 finally{
  if(server?.child.exitCode===null){server.child.kill('SIGTERM');await once(server.child,'exit');}
  if(build?.child.exitCode===null){build.child.kill('SIGTERM');await once(build.child,'exit');}
  evidence.finishedAt=new Date().toISOString();evidence.startedAt=startedAt;
  const output=path.join(repositoryRoot,'docs/reliability/phase2d-resource-model/implementation-evidence');await mkdir(output,{recursive:true});
  const id='application-boot-'+startedAt.replaceAll(/[:.]/g,'-');
  await writeFile(path.join(output,id+'.json'),JSON.stringify(evidence,null,2)+'\n');
  await writeFile(path.join(output,id+'.log'),(build?.output()||'')+'\n'+(server?.output()||''));
  if(directory)await rm(directory,{recursive:true,force:true});
  if(fixture)await destroyIsolatedCluster(fixture.cluster);
 }
});
