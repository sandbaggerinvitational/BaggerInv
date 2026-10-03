// Existing application read/authorization adapters against actual successor SQL.
// The copied application uses a synthetic private registration file. Admission,
// scope and entitlement are not mocked; only transport/Auth claims are supplied.
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,writeFile,symlink,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {certificationReadAliasRpc} from '../../../lib/certification-read-adapters.js';
import {certificationWorkerTransport} from './certification-worker-proof.mjs';
import {jsonLiteral,repositoryRoot} from './postgres17.mjs';

const withoutTiming=value=>Array.isArray(value)?value.map(withoutTiming):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='query_ms').map(([key,value])=>[key,withoutTiming(value)])):value;

export async function proveCertificationSuccessorReads(fixture,runtime,{predecessor}){
 const target=runtime.current().tournament_id,transport=certificationWorkerTransport(fixture);
 const options={env:transport.env,certificationDependencies:transport.dependencies};
 const player=fixture.envelope.authorization.player_id;
 const match=fixture.q(`select match_id from scoring_authority.matches where tournament_id=${jsonLiteral(target)}#>>'{}'order by match_id limit 1`);
 const cases=[
  ['TOURNAMENT_LIVE','read_tournament_live_view',{target_tournament_id:target},`public.read_leaderboards_core_view('${target}')`],
  ['PARTICIPANT_HOME','read_participant_home_view',{target_tournament_id:target,target_player_id:player},`public.read_participant_home_view('${target}','${player}')`],
  ['MY_MATCH','read_my_match_view',{target_tournament_id:target,target_player_id:player},`public.read_my_match_view('${target}','${player}')`],
  ['GAME_CENTER','read_game_center_view',{target_match_id:match},`public.read_game_center_view('${match}')`],
 ];
 const results=[];
 for(const [surface,alias,body,canonical]of cases){
  const started=performance.now();
  const response=await certificationReadAliasRpc(alias,body,options);
  const elapsedMs=performance.now()-started;
  const expected=JSON.parse(fixture.q('select '+canonical));
  assert.equal(response.payload.ok,expected.ok,surface);
  assert.deepEqual(withoutTiming(response.payload.data),withoutTiming(expected.data),surface+' canonical DTO');
  assert.equal(response.payload.fallback_used,false);
  results.push({surface,alias,status:'PASS',canonicalDtoEquivalent:true,elapsedMs,
   measurement:'Single local JS adapter, context and SQL transport observation',samples:1});
 }
 await assert.rejects(()=>certificationReadAliasRpc('read_tournament_live_view',
  {target_tournament_id:predecessor},options),{code:'CERTIFICATION_READ_CONTEXT_DENIED',status:403,databaseSqlstate:'42501'});
 await assert.rejects(()=>certificationReadAliasRpc('read_participant_home_view',
  {target_tournament_id:target,target_player_id:'ABSENT-SYNTHETIC-PLAYER'},options),{code:'CERTIFICATION_READ_PLAYER_DENIED',status:403,databaseSqlstate:'42501'});
 const wrongMatch=await certificationReadAliasRpc('read_game_center_view',
  {target_match_id:predecessor+'-R1-1'},options);
 assert.equal(wrongMatch.payload.ok,false);assert.equal(wrongMatch.payload.code,'PRODUCTION_MATCH_NOT_FOUND');
 assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...fixture.envelope,
  phase:'READS',operation:'READS.CURRENT_VIEW',expected_context_token:'0'.repeat(64),
  payload:{surface:'TOURNAMENT_LIVE',target_tournament_id:target}}),/CONTEXT_STALE/);
 assert.equal(fixture.q(`select count(*)from pg_proc where oid='production_control.certification_successor_current_read_v1(jsonb,jsonb)'::regprocedure
  and(has_function_privilege('anon',oid,'EXECUTE')or has_function_privilege('authenticated',oid,'EXECUTE')
   or has_function_privilege('service_role',oid,'EXECUTE'))`),'0');
 const directory=await mkdtemp('/private/tmp/bagger-successor-read-');
 let director;
 try{
  await cp(path.join(repositoryRoot,'lib'),path.join(directory,'lib'),{recursive:true});
  await mkdir(path.join(directory,'config'));
  await writeFile(path.join(directory,'config/certification-resource-registration.json'),JSON.stringify(fixture.transportFixture.registrationManifest));
  await writeFile(path.join(directory,'package.json'),' {"type":"module"}\n');
  await symlink(path.join(repositoryRoot,'node_modules'),path.join(directory,'node_modules'),'dir');
  const source=await readFile(path.join(repositoryRoot,'lib/preview-director-authorization.js'));
  const copied=await readFile(path.join(directory,'lib/preview-director-authorization.js'));
  assert.deepEqual(copied,source,'Shipping authorization source is unchanged');
  const {authorizePreviewDirector}=await import(pathToFileURL(path.join(directory,'lib/preview-director-authorization.js')).href);
  const authorize=claims=>authorizePreviewDirector({env:transport.env,cookieStore:{get:()=>undefined},allowBootstrap:false,
   dependencies:{verifyClaims:async()=>claims,rpcOptions:{certificationDependencies:transport.dependencies}}});
  const actual=await authorize({status:'active',claims:{sub:fixture.envelope.authorization.auth_user_id}});
  assert.equal(actual.status,'active',JSON.stringify(actual));assert.equal(actual.source,'entitlement');
  assert.equal(actual.identity.tournamentId,target);assert.equal(actual.identity.actor.id,player);
  const absent=await authorize({status:'inactive'});assert.notEqual(absent.status,'active');
  const foreign=await authorize({status:'active',claims:{sub:'b3000000-0000-4000-8000-999999999999'}});
  assert.notEqual(foreign.status,'active');
  director={status:'PASS',currentTournament:actual.identity.tournamentId,source:actual.source,
   actualServerAuthorization:true,actualSqlEntitlement:true,syntheticClaimsTransport:true,
   signedOutDenied:true,unlinkedIdentityDenied:true,
   copiedSourceSha256:createHash('sha256').update(source).digest('hex')};
 }finally{await rm(directory,{recursive:true,force:true});}
 return{results,director,wrongTargetDenied:true,wrongPlayerDenied:true,wrongMatchDenied:true,
  staleContextDenied:true,privateRuntimeExecute:0,googleCalls:0,network:'OWNED_SQL_TRANSPORT_ONLY'};
}
