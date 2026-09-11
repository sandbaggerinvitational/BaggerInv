import {championshipOddsResilienceFixture} from './championship-odds-resilience.mjs';
import {buildOddsCalculationInvocation} from '../../lib/championship-odds-resilience.js';
import {productionOddsCalculationRequestInput} from '../../lib/production-odds-calculation-contract.js';
import {logicalOddsResult} from '../../lib/championship-odds-supabase.js';
import {scoringShadowPayloadHash} from '../../lib/scoring-shadow.js';
import {PRODUCTION_GOOGLE_WORKBOOK_ID,PRODUCTION_SUPABASE_PROJECT_REF,PRODUCTION_SUPABASE_URL} from '../../lib/production-foundation-resource-contract.js';
import {snapshot} from './odds-review.mjs';
export function gateFixture(){
 const sha='a'.repeat(40),project='prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU';
 const env={VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:sha,VERCEL_PROJECT_ID:project,VERCEL_PROJECT_NAME:'bagger-inv',PRODUCTION_FOUNDATION_ENABLED:'true',PRODUCTION_CUTOVER_ACTIVATION_ENABLED:'true',PRODUCTION_CUTOVER_PHASE:'ODDS_WAR_ROOM',PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA:sha,PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:project,PRODUCTION_CANONICAL_DOMAIN:'https://baggerinv.com',PRODUCTION_CUTOVER_TOURNAMENT_ID:'2026',PRODUCTION_CUTOVER_TOURNAMENT_YEAR:'2026',PRODUCTION_SUPABASE_PROJECT_REF,PRODUCTION_SUPABASE_URL,PRODUCTION_SUPABASE_SECRET_KEY:'sb_secret_'+'x'.repeat(32),GOOGLE_SHEETS_ID:PRODUCTION_GOOGLE_WORKBOOK_ID,PARTICIPANT_IDENTITY_AUTHORITY:'supabase',PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED:'true',PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED:'true',SCORING_AUTHORITY:'supabase',ODDS_PUBLICATION_AUTHORITY:'google',PRODUCTION_SUPABASE_WORKERS_ENABLED:'true',PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED:'true',PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED:'false',PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED:'false'};
 const configuration={id:'00000000-0000-4000-8000-000000000023',configuration_revision:2,...Object.fromEntries(['source_fingerprint','bundle_fingerprint','settings_fingerprint','effective_settings_fingerprint','ratings_fingerprint','pairing_fingerprint'].map((k,i)=>[k,String(i+1).repeat(64)]))};
 const inputs={...championshipOddsResilienceFixture(),configuration,metadata:{settingsFingerprint:configuration.settings_fingerprint,configurationRevision:2,sourceFingerprint:configuration.source_fingerprint,sourceRevision:{matches:[]}}};
 const runtimeContext={frozen2026:true,runtime:{tournamentId:'2026',tournamentYear:2026}};
 const invocation=buildOddsCalculationInvocation({inputs,phase:'Pre-Tournament',iterations:25000,requestedBy:'CB01',outputTimestamp:snapshot.publishedAt});
 const request=productionOddsCalculationRequestInput({invocation,configuration,env,runtimeContext});
 const job={...request,input_snapshot:invocation.input_snapshot,source_revision:request.source_revision,production_operation_mode:request.operation_mode,production_deployment_commit:request.deployment_commit,production_candidate_hostname:null,status:'SUCCEEDED',publication_status:'READY',result_payload:snapshot,result_fingerprint:scoringShadowPayloadHash(logicalOddsResult(snapshot)),output_timestamp:snapshot.publishedAt,requested_by:'CB01'};
 return {env,runtimeContext,inputs,job};
}
