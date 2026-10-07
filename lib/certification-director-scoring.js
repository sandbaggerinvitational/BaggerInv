// Server-only Model D shipping adapter. No player impersonation or lifecycle authority.
import 'server-only';
import {normalizeLiveScoringRequest} from './live-score-values.js';
import {certificationOperationRpc, resolveCertificationRuntimeContext, readCertificationIngressStatus} from './certification-runtime-server.js';
import {requireCertificationResourceEnvironment, certificationResourcePurpose} from './canonical-resource-registration.js';
const fail=(code,status=403,extra={})=>Object.assign(new Error('Director canonical score could not be confirmed.'),{code,status,...extra});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fields=['matchId','holeNumber','team1GrossScores','team2GrossScores','expectedMatchRevision','expectedRevision','expectedPermissionRevision','expectedRound','expectedFormat'];
export async function submitModelDDirectorScore({bound,input,env,dependencies={}}){
 const dep=dependencies.certificationDependencies||{};
 const state=requireCertificationResourceEnvironment(env,dep);
 if(certificationResourcePurpose(state)!=='PART2C_DRESS_REHEARSAL'||bound.authorization.role!=='DIRECTOR')throw fail('DIRECTOR_OPERATIONS_CONTEXT_REQUIRED');
 if(!object(input)||Object.keys(input).some(k=>!['family','action','mode','payload','operationRequestId','expectedContextToken'].includes(k))||input.family!=='DIRECTOR_CANONICAL_SCORE'||input.action!=='submit-hole'||!UUID.test(input.operationRequestId||'')||!HASH.test(input.expectedContextToken||'')||!object(input.payload)||Object.keys(input.payload).some(k=>!fields.includes(k)))throw fail('DIRECTOR_OPERATIONS_INPUT_INVALID',400);
 const p=input.payload;
 if(!ID.test(p.matchId||'')||![1,2,3].includes(p.expectedRound)||!['BB','SC','SI'].includes(p.expectedFormat)||[['BB',1],['SC',2],['SI',3]].some(([f,r])=>p.expectedFormat===f&&p.expectedRound!==r)||['expectedMatchRevision','expectedRevision','expectedPermissionRevision'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0))throw fail('DIRECTOR_OPERATIONS_INPUT_INVALID',400);
 let normalized;try{normalized=normalizeLiveScoringRequest(p);}catch{throw fail('DIRECTOR_OPERATIONS_INPUT_INVALID',400);}
 const count=p.expectedFormat==='BB'?2:1;
 if(normalized.team1GrossScores.length!==count||normalized.team2GrossScores.length!==count)throw fail('DIRECTOR_OPERATIONS_INPUT_INVALID',400);
 const authorization={...bound.authorization,match_id:p.matchId,permission_revision:p.expectedPermissionRevision};
 const payload={director_score_contract:'model-d-director-score-v1',match_id:p.matchId,hole_number:normalized.holeNumber,
 team_1_gross_scores:normalized.team1GrossScores,team_2_gross_scores:normalized.team2GrossScores,
 expected_match_revision:p.expectedMatchRevision,expected_hole_revision:p.expectedRevision,mutation_key:input.operationRequestId,expected_round:p.expectedRound,expected_format:p.expectedFormat};
 if(input.mode==='status')return readCertificationIngressStatus('SCORING.SUBMIT_HOLE',{match_id:p.matchId},{env,authorization,operationRequestId:input.operationRequestId},dep);
 if(input.mode!==undefined)throw fail('DIRECTOR_OPERATIONS_INPUT_INVALID',400);
 const context=await resolveCertificationRuntimeContext({env,phase:'SCORING'},dep);
 if(context.context_token!==bound.certificationContext.context_token)throw fail('DIRECTOR_OPERATIONS_CONTEXT_STALE',409);
 try{
 const r=await certificationOperationRpc('SCORING.SUBMIT_HOLE',payload,{env,context,authorization,operationRequestId:input.operationRequestId,expectedContextToken:input.expectedContextToken},dep);
 if(r.payload?.ok!==true)throw fail('DIRECTOR_OPERATIONS_DOMAIN_REJECTED',409,{domainCode:r.payload?.code,committed:false});
 return {ok:true,family:input.family,action:input.action,operationRequestId:input.operationRequestId,actor:'DIRECTOR',
 receipt:Object.fromEntries(['ok','code','match_id','hole_number','hole_revision','match_revision','idempotent','semantic_noop','audit_created'].filter(k=>Object.hasOwn(r.payload,k)).map(k=>[k,r.payload[k]])),durationMs:r.durationMs};
 }catch(e){if(/^DIRECTOR_OPERATIONS_/.test(e.code||''))throw e;throw fail('DIRECTOR_OPERATIONS_DOMAIN_REJECTED',[400,403,409].includes(e.status)?e.status:503,{domainCode:e.domainCode||e.code,operationRequestId:input.operationRequestId,outcome:e.outcome||'UNKNOWN',committed:e.committed===true});}
}
