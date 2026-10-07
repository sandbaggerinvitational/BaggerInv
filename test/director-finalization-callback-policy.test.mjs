import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../app/api/director/route.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\s*/gm,'').replaceAll('export async function','async function').replaceAll('export const','const');
function route(policy,status='active',action='finalize') {
 const calls=[],callbacks=[];
 const deps={NextResponse:Response,authorizePreviewDirector:async()=>({status,identity:{authUserId:'verified-subject',actor:{id:'P01',name:'Director'}}}),directorTransactionError:e=>e.message,
 persistDirectorMatchLifecycle:async()=>{calls.push('COMMIT');return{delegated:true,tournamentId:'2026',result:{ok:true,receipt:'truthful'}};},assertDirectorMutationAuthority:()=>({resolvedAuthority:'supabase',canonicalLifecycleAction:action}),assertScoringMutationAuthorityContractBeforeDispatch:async()=>{},directorDerivedDeliveryPolicy:()=>policy,
 revalidatePath:()=>calls.push('CACHE'),revalidateTag:()=>calls.push('CACHE'),after:fn=>callbacks.push(fn),recalculateCompetitionDerivedTournament:async()=>calls.push('COMPETITION'),recalculateCalcuttaAfterCanonicalMutation:async()=>calls.push('CALCUTTA'),console:{info:()=>{},error:()=>{}}};
 return{calls,callbacks,post:new Function(...Object.keys(deps),source+';return POST;')(...Object.values(deps))};
}
const request=()=>new Request('http://localhost/api/director',{method:'POST',body:JSON.stringify({action:'match-finalize',matchId:'synthetic',operationRequestId:'operation'})});
test('Model D commits receipt and refreshes caches without invoking derived processors',async()=>{const r=route('PRIVATE_QUEUE_ONLY'),response=await r.post(request());assert.equal(response.status,200);assert.equal((await response.json()).receipt.receipt,'truthful');for(const cb of r.callbacks)await cb();assert.equal(r.calls[0],'COMMIT');assert.ok(r.calls.includes('CACHE'));assert.equal(r.calls.includes('COMPETITION'),false);assert.equal(r.calls.includes('CALCUTTA'),false);});
for(const resource of ['Production','Original Certification'])test(resource+' retains actual callback body',async()=>{const r=route('POST_COMMIT_CALLBACK');assert.equal((await r.post(request())).status,200);assert.equal(r.callbacks.length,1);assert.deepEqual(r.calls.filter(c=>c==='COMPETITION'||c==='CALCUTTA'),[]);await r.callbacks[0]();assert.deepEqual(r.calls.filter(c=>c==='COMPETITION'||c==='CALCUTTA'),['COMPETITION','CALCUTTA']);});
test('Unauthorized finalization cannot commit or schedule processing',async()=>{const r=route('PRIVATE_QUEUE_ONLY','denied');assert.equal((await r.post(request())).status,403);assert.deepEqual(r.calls,[]);assert.deepEqual(r.callbacks,[]);});

test('Other Model D lifecycle post-commit responsibilities remain intact',async()=>{const r=route('PRIVATE_QUEUE_ONLY','active','reopen');assert.equal((await r.post(request())).status,200);assert.equal(r.callbacks.length,1);await r.callbacks[0]();assert.ok(r.calls.includes('COMPETITION'));assert.ok(r.calls.includes('CALCUTTA'));});
