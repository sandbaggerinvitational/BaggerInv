// Real shipping route and persistence adapter, with provider session and owned
// SQL transport boundaries supplied by the disposable certification fixture.
import {directorDerivedDeliveryPolicy} from '../../../lib/director-derived-delivery-policy.js';
import {recalculateCompetitionDerivedTournament} from '../../../lib/competition-derived-supabase.js';
import {recalculateCalcuttaAfterCanonicalMutation} from '../../../lib/calcutta-post-commit.js';
import {readFile} from 'node:fs/promises';
import {certificationResourceEnvironment,certificationRequested} from '../../../lib/canonical-resource-registration.js';
import {productionCutoverPhaseAtLeast} from '../../../lib/production-cutover-activation-contract.js';
import * as scoringContract from '../../../lib/scoring-mutation-authority-contract.js';
import {assertDirectorMutationAuthority} from '../../../lib/director-mutation-authority.js';
import {assertScoringMutationAuthorityContractBeforeDispatch} from '../../../lib/scoring-mutation-authority-server.js';
import {readCanonicalScoringAuthority,finalizeCanonicalMatch,reopenCanonicalMatch,mutateCanonicalMatchControl} from '../../../lib/scoring-authority-supabase.js';
const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const').replaceAll('export class','class');
export async function modelDLifecycleShippingProof(f,{postCommitDependencies={}}={}){
 const compile=async(path,deps,suffix)=>new Function(...Object.keys(deps),strip(await readFile(new URL(path,import.meta.url),'utf8'))+';'+suffix)(...Object.values(deps));
 const authority=await compile('../../../lib/scoring-authority.js',{isolatedCanonicalDatabaseEnvironment:env=>certificationResourceEnvironment(env,{registrationManifest:f.registrationManifest}),productionCutoverPhaseAtLeast,certificationRequested},'return {requireScoringAuthority,scoringAuthorityEnvironment};');
 const director=await compile('../../../lib/director-mutation-authority.js',{scoringAuthorityEnvironment:authority.scoringAuthorityEnvironment,productionCutoverPhaseAtLeast},'return {assertDirectorMutationAuthority};');
 const contract=await compile('../../../lib/scoring-mutation-authority-server.js',{...scoringContract,requireScoringAuthority:authority.requireScoringAuthority,observeOperationalAuthority:()=>{},inspectProductionScoringMutationAuthority:()=>{throw Error("PRODUCTION_CONTACT_DENIED");},productionGoogleIngressLeaseEnvironment:()=>{throw Error("GOOGLE_CONTACT_DENIED");}},'return {assertScoringMutationAuthorityContractBeforeDispatch};');
 const options={env:f.env,authorization:f.authorization,certificationDependencies:f.dependencies};
 const adapterDependencies={requireScoringAuthority:()=>authority.requireScoringAuthority(f.env),readCanonicalScoringAuthority:i=>readCanonicalScoringAuthority(i,options),finalizeCanonicalMatch:i=>finalizeCanonicalMatch(i,options),reopenCanonicalMatch:i=>reopenCanonicalMatch(i,options),mutateCanonicalMatchControl:i=>mutateCanonicalMatchControl(i,options)};
 const adapterSource=strip(await readFile(new URL('../../../lib/scoring-persistence-adapter.js',import.meta.url),'utf8'));
 const persistDirectorMatchLifecycle=new Function(...Object.keys(adapterDependencies),adapterSource+';return persistDirectorMatchLifecycle;')(...Object.values(adapterDependencies));
 const callbacks=[];
 const deps={directorDerivedDeliveryPolicy:()=>directorDerivedDeliveryPolicy(f.env,{registrationManifest:f.registrationManifest}),NextResponse:Response,authorizePreviewDirector:async()=>({status:'active',source:'entitlement',identity:{authUserId:f.authorization.auth_user_id,tournamentId:'2026',actor:{id:'P01',name:'Synthetic Director',role:'DIRECTOR'}}}),persistDirectorMatchLifecycle,
 assertDirectorMutationAuthority:i=>director.assertDirectorMutationAuthority({...i,env:f.env}),assertScoringMutationAuthorityContractBeforeDispatch:(c,o)=>contract.assertScoringMutationAuthorityContractBeforeDispatch(c,{...o,env:f.env}),directorTransactionError:e=>e.message,
 revalidatePath:()=>{},revalidateTag:()=>{},after:fn=>callbacks.push(fn),console:{info:()=>{},error:()=>{}},recalculateCompetitionDerivedTournament:(t,o)=>recalculateCompetitionDerivedTournament(t,{...o,env:f.env,certificationDependencies:f.dependencies}),recalculateCalcuttaAfterCanonicalMutation:(t,o)=>recalculateCalcuttaAfterCanonicalMutation(t,o,{env:f.env,dependencies:{certificationDependencies:f.dependencies}}),...postCommitDependencies};
 const routeSource=strip(await readFile(new URL('../../../app/api/director/route.js',import.meta.url),'utf8'));
 const post=new Function(...Object.keys(deps),routeSource+';return POST;')(...Object.values(deps));
 return {callbacks,request:input=>post(new Request('http://localhost/api/director',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}))};
}
