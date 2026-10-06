// Actual shipping route and database. Only external Auth and provider transport
// are modeled; the registered synthetic resource is injected at module seams.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {scoringShadowRpc} from '../../../lib/scoring-shadow.js';
import {participantIdentityRpc} from '../../../lib/participant-identity-supabase.js';
import {participantIdentityPublicError} from '../../../lib/participant-identity-resolver.js';
import {certificationResourceEnvironment} from '../../../lib/canonical-resource-registration.js';
import {currentProductionNetSkinsV1,productionNetSkinsV1Data} from '../../../lib/production-net-skins-v1.js';
import {mobileNetSkinsDataFromProductionView} from '../../../lib/mobile-v1-net-skins.js';
import {fixtureIdentities} from '../../../tools/reliability/certification-part2a-fixture.mjs';
import {certificationParticipantNetSkinsData} from '../../../lib/certification-net-skins-participant.js';
export async function netSkinsParticipantRoute(f,{routeSource,legacySource,playerId='P12',signedOut=false}={}){
 const key='net-read-'+randomUUID(),errors=[],rpcCalls=[],afterCalls=[];
 const rpc=(name,body,options={})=>{rpcCalls.push({name,body});return scoringShadowRpc(name,body,{...options,env:f.env,certificationDependencies:f.dependencies});};
 globalThis[key]={scoringShadowRpc:rpc};
 let legacy=legacySource||await readFile(new URL('../../../lib/net-skins-supabase.js',import.meta.url),'utf8');
 legacy=legacy.replace(/from "\.\/(.*?)"/g,(_m,p)=>`from ${JSON.stringify(new URL('../../../lib/'+p,import.meta.url).href)}`)
 .replace(/import \{ scoringShadowPayloadHash, scoringShadowRpc \} from [^;]+;/,
 `import {scoringShadowPayloadHash} from ${JSON.stringify(new URL('../../../lib/scoring-shadow.js',import.meta.url).href)};const {scoringShadowRpc}=globalThis[${JSON.stringify(key)}];`);
 const lib=await import('data:text/javascript;base64,'+Buffer.from(legacy).toString('base64')+'#'+key);
 const read=async args=>rpc('read_production_net_skins_v1',{input:{player_id:args.playerId}});
 Object.assign(globalThis[key],{NextResponse:Response,withOperationalRoute:(_config,handler)=>handler,
 recordOperationalError:e=>errors.push({code:e.code,message:e.message}),cookies:async()=>({get:()=>null}),
 after:fn=>afterCalls.push(fn),applicationRequestEnvironment:()=>f.env,
 requireNetSkinsReadSource:()=>{const s=certificationResourceEnvironment(f.env,f.dependencies);if(!s.eligible)throw Error(s.reason);return {...s,resolved:'supabase'};},
 requireParticipantIdentityAuthority:()=>({resolved:'supabase'}),
 resolveSupabaseParticipantIdentity:async()=>{
  if(signedOut)throw Object.assign(Error('Sign in required'),{code:'AUTH_SESSION_REQUIRED',status:401});
  const auth=fixtureIdentities.find(id=>id.player_id===playerId)?.auth_user_id;
  const r=await participantIdentityRpc('read_participant_identity_context_for_auth',{target_auth_user_id:auth,target_tournament_id:null},{env:f.env,certificationDependencies:f.dependencies});
  if(!r.payload.ok)throw Error('IDENTITY_FAILED');return {playerId,tournamentId:'2026',displayName:playerId};
 },participantIdentityPublicError,currentNetSkinsOperationalResult:lib.currentNetSkinsOperationalResult,
 currentProductionNetSkinsV1:async args=>{const r=await read(args);return {...productionNetSkinsV1Data(r.payload.data,{expectedTournamentId:args.tournamentId}),recalculation:null};},
 readProductionNetSkinsV1:read,mobileNetSkinsDataFromProductionView,certificationParticipantNetSkinsData,
 recalculateCompetitionDerivedTournament:()=>{throw Error('READ_MUST_NOT_PROCESS');},
 recalculateIntelligenceDerivedTournament:()=>{throw Error('READ_MUST_NOT_PROCESS');}});
 const source=(routeSource||await readFile(new URL('../../../app/api/leaderboards/net-skins/route.js',import.meta.url),'utf8'))
 .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_m,n)=>`const {${n.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+key);delete globalThis[key];
 return {get:path=>route.GET(new Request('http://localhost'+(path||'/api/leaderboards/net-skins'))),errors,rpcCalls,afterCalls};
}
