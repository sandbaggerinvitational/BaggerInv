// Isolated process-restart proof; only parent-owned Unix sockets and synthetic identity.
// Actual PWA adapter / status handler / SQL; no hosted HTTP or Supabase Auth claim.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { binaries, jsonLiteral } from './postgres17.mjs';
import { runtimeScope } from './synthetic-tournament.mjs';
import { persistParticipantScore } from '../../../lib/scoring-persistence-adapter.js';
import { createScoreMutationRecoveryHandler } from '../../../lib/scoring-mutation-recovery-route.js';
assert.equal(process.argv.length,2);assert.equal(typeof process.send,'function');
process.once('message',async message=>{
 try{
  assert.equal(message.type,'start');assert.ok(['commit-lose-response','recover'].includes(message.mode));
  assert.equal(path.dirname(path.resolve(message.directory)),path.resolve(os.tmpdir()));
  assert.match(path.basename(message.directory),/^bagger-reliability-pg17-/);
  assert.equal(path.resolve(message.socket),path.join(path.resolve(message.directory),'socket'));
  assert.match(message.database,/^[a-z][a-z0-9_]{0,62}$/);
  assert.ok(Number.isInteger(message.port)&&message.port>1024&&message.port<65536);
  const i=message.input;assert.match(i.match_id,/^2026-R[123]-(?:[1-9]|1[0-2])$/);
  assert.equal(i.authorization.tournament_id,'2026');assert.equal(i.authorization.match_id,i.match_id);
  assert.equal(i.authorization.role,'PLAYER');assert.match(i.authorization.player_id,/^P(?:0[1-9]|1[0-9]|2[0-4])$/);
  assert.equal(i.authorization.auth_user_id,`10000000-0000-4000-8000-${String(Number(i.authorization.player_id.slice(1))).padStart(12,'0')}`);
  const environment={PATH:process.env.PATH||'',PGHOST:message.socket,PGPORT:String(message.port),PGUSER:'postgres',
   PGOPTIONS:'-c statement_timeout=1000 -c request.jwt.claim.role=service_role',PGAPPNAME:'phase2c-recovery-restart-child'};
  const query=statement=>{
   const result=spawnSync(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h',message.socket,'-p',String(message.port),'-U','postgres','-d',message.database],
    {env:environment,input:statement,encoding:'utf8',maxBuffer:1024*1024,timeout:4000});
   if(result.status!==0)throw Object.assign(new Error('LOCAL_RECOVERY_SQL_FAILED'),
    {code:result.stderr?.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]||'CONNECTION_FAILED'});
   return result.stdout.trim();
  };
  assert.equal(realpathSync(query('show data_directory')),realpathSync(path.join(message.directory,'data')));
  assert.equal(query('show timezone'),'UTC');
  const rpc=(name,input)=>{
   assert.ok(['submit_production_hole_score','read_production_score_mutation_status_v1'].includes(name));
   return JSON.parse(query(`select public.${name}(${jsonLiteral(runtimeScope(input))})`));
  };
  const identity={authUserId:i.authorization.auth_user_id,playerId:i.authorization.player_id,tournamentId:'2026'};
  if(message.mode==='commit-lose-response'){
   await persistParticipantScore({matchId:i.match_id,current:{scope:'match',tournamentId:'2026',playerId:identity.playerId,
    authUserId:identity.authUserId,matchId:i.match_id,accessVersion:i.authorization.permission_revision,identityAuthority:'supabase'},
    input:{holeNumber:i.hole_number,team1GrossScores:i.team_1_gross_scores,team2GrossScores:i.team_2_gross_scores,
     clientMutationId:i.mutation_key,expectedMatchRevision:i.expected_match_revision,expectedRevision:i.expected_hole_revision},
    canonicalContext:{tournamentId:'2026',matchRevision:i.expected_match_revision,permissionRevision:i.authorization.permission_revision},
    authorizationContext:{identity},includeCanonicalAcknowledgement:true,env:{},dependencies:{
     requireScoringAuthority:()=>({resolved:'supabase',productionDeployment:false,previewDeployment:false}),
     submitCanonicalHoleScore:async input=>{
      const payload=rpc('submit_production_hole_score',input);assert.equal(payload.code,'ACCEPTED');
      // Real SQL COMMIT has returned; terminate the API process before any caller acknowledgement.
      process.exit(77);
     }
    }});
   throw new Error('UNEXPECTED_ADAPTER_RESPONSE');
  }
  const handler=createScoreMutationRecoveryHandler({env:{},resolveIdentity:async()=>identity,rateLimit:()=>({allowed:true}),
   readStatus:async input=>({payload:rpc('read_production_score_mutation_status_v1',input)})});
  const response=await handler(new Request('https://isolated.invalid/api/scoring/mutation-status',
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({matchId:i.match_id,mutationId:i.mutation_key})}));
  const event={type:'response',pid:process.pid,status:response.status,body:await response.json()};
  await new Promise(resolve=>process.send(event,resolve));
 }catch(error){
  process.exitCode=1;if(process.connected)await new Promise(resolve=>process.send({type:'failed',code:error.code||error.name||'LOCAL_PROOF_FAILED'},resolve));
 }finally{if(process.connected)process.disconnect();}
});
