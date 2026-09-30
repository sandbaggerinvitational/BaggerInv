
import {closureReadCandidate as env} from './test/support/reliability/closure-routing-fixture.mjs';
import {productionShadowCandidateReadEnvironment} from './lib/production-shadow-candidate.js';
import {canonicalReadEnvironment} from './lib/canonical-runtime-source.js';
import {oddsCalculationEnvironment} from './lib/odds-calculation-source.js';
let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('NO_TRANSPORT_ALLOWED')};
const result=[];
for(const [label,e] of [['zero-google-declared-diagnostic',env],['invalid-diagnostic-resource-with-otherwise-valid-preview-url',{...env,SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'}]]){
const lane=productionShadowCandidateReadEnvironment(e),read=canonicalReadEnvironment(e,'HOME_READ_SOURCE'),odds=oddsCalculationEnvironment(e);
result.push({label,diagnostic:{requested:lane.requested,eligible:lane.eligible,reason:lane.reason},canonical:{resolved:read.resolved,blocked:read.blocked,productionShadowCandidate:read.productionShadowCandidate,reason:read.reason},odds:{inputSource:odds.inputSource,publicationAuthority:odds.publicationAuthority,publicationBlocked:odds.publicationBlocked}});
}
console.log(JSON.stringify({environment:'LOCAL_SELECTOR_ONLY_NO_TRANSPORT',rows:result,fetchCalls:calls,limitation:'Selector admission only. Does not prove any write passed route authorization or SQL; no write attempted.'},null,2));
