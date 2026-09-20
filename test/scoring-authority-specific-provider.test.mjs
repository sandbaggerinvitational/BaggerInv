import {assertScoringMutationAuthorityContract} from "../lib/scoring-mutation-authority-contract.js";
import {requireMobileNativeConfiguration} from "../lib/mobile-native-admission.js";
import {environment as nativeEnvironment} from "./fixtures/pn2-native.mjs";
import assert from "node:assert/strict";
import {inspectProductionScoringMutationAuthority} from "../lib/production-cutover-scoring-ingress.js";
import {PRODUCTION_VERCEL_PROJECT_ID} from "../lib/production-cutover-activation-contract.js";
import {PRODUCTION_GOOGLE_WORKBOOK_ID,PRODUCTION_SUPABASE_PROJECT_REF,PRODUCTION_SUPABASE_URL} from "../lib/production-foundation-resource-contract.js";
import {productionGoogleDrivePrincipalFingerprint} from "../lib/google-service-account-credential-context.js";
    process.env.NODE_TEST_CONTEXT = "child-v8";
    const authorityGeneration = "11111111-1111-4111-8111-111111111111";
    const admissionGeneration = "22222222-2222-4222-8222-222222222222";
    const deploymentId = "dpl_12345678Test";
    const commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const env = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_NAME: "bagger-inv",
      VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      VERCEL_GIT_COMMIT_SHA: commit,
      VERCEL_DEPLOYMENT_ID: deploymentId,
      PRODUCTION_FOUNDATION_ENABLED: "true",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
      PRODUCTION_CUTOVER_PHASE: "STATIC_BACKEND",
      PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commit,
      PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
      PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
      PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF,
      PRODUCTION_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
      GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
      SCORING_AUTHORITY: "google",
      PARTICIPANT_IDENTITY_AUTHORITY: "passport",
      PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
      PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: authorityGeneration,
      PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: admissionGeneration,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy-writer@example.invalid",
    };
    const request = {
      method: "POST",
      url: "https://baggerinv.com/api/scoring/current",
      headers: new Headers({
        host: "baggerinv.com",
        origin: "https://baggerinv.com",
        "x-forwarded-host": "baggerinv.com",
        "x-forwarded-proto": "https",
      }),
    };

env.SCORING_AUTHORITY="supabase";
const base={ok:true,activation_revision:213,admission_revision:121,authority_generation_id:authorityGeneration,admission_generation_id:admissionGeneration,deployment_id:deploymentId,authority:"SUPABASE",admission_state:"CLOSED",execution_gate:"OPEN",scoring_ingress_enabled:true,maintenance_state:"NORMAL",boundary_mode:"MAINTENANCE_WINDOW_V1",contract_version:"ADMISSION_V3",provider_credential_class:null,provider_principal_fingerprint:null};
const results=[];
async function inspect(payload,expectedAuthority="SUPABASE"){return inspectProductionScoringMutationAuthority({expectedAuthority,request},{env,fetchImpl:async()=>Response.json(payload)});}
async function check(name,payload,authority,allowed){if(allowed) assert.equal((await inspect(payload,authority)).scoringAuthority,authority);else await assert.rejects(()=>inspect(payload,authority));results.push({name,result:"PASS"});}
await check("Supabase null Google fields",base,"SUPABASE",true);
for(const [name,delta] of [["wrong generation",{authority_generation_id:"33333333-3333-4333-8333-333333333333"}],["wrong admission generation",{admission_generation_id:"bad"}],["wrong deployment",{deployment_id:"dpl_wrong"}],["wrong RPC contract",{contract_version:"old"}],["missing revision",{activation_revision:-1}],["closed execution",{execution_gate:"CLOSED"}],["disabled ingress",{scoring_ingress_enabled:false}],["maintenance",{maintenance_state:"SCORING_MAINTENANCE"}],["canonical Google",{authority:"GOOGLE"}],["unknown canonical authority",{authority:"UNKNOWN"}],["ambiguous canonical authority",{authority:"SUPABASE,GOOGLE"}],["negative RPC",{ok:false}]]) await check(name,{...base,...delta},"SUPABASE",false);
await check("unknown requested authority",base,"UNKNOWN",false);
await check("ambiguous requested authority",base,"SUPABASE,GOOGLE",false);
const google={...base,authority:"GOOGLE",admission_state:"OPEN",provider_credential_class:"LEGACY_PROVIDER_FENCEABLE",provider_principal_fingerprint:productionGoogleDrivePrincipalFingerprint(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)};
await check("valid Google",google,"GOOGLE",true);
await check("missing Google class",{...google,provider_credential_class:null},"GOOGLE",false);
await check("wrong Google principal",{...google,provider_principal_fingerprint:"wrong"},"GOOGLE",false);
await check("closed Google admission",{...google,admission_state:"CLOSED"},"GOOGLE",false);
await check("obsolete Google under Supabase",{...google,authority:"SUPABASE"},"GOOGLE",false);
const nativeEnv=nativeEnvironment(["reads","auth","certification"]);
assert.throws(()=>requireMobileNativeConfiguration("scoring",{env:nativeEnv}), {code:"NATIVE_SCORING_DISABLED"});
await check("valid Director contract while native Scoring remains disabled",base,"SUPABASE",true);
assert.throws(()=>requireMobileNativeConfiguration("scoring",{env:nativeEnv}), {code:"NATIVE_SCORING_DISABLED"});
const current={version:"scoring-mutation-authority-v1",scoringAuthority:"supabase",authorityGeneration,admissionGeneration,activationRevision:213,admissionRevision:121,deploymentId,deploymentCommit:commit};
assert.throws(()=>assertScoringMutationAuthorityContract({...current,admissionRevision:120},current,{production:true}),{code:"SCORING_AUTHORITY_CONTRACT_STALE"});
results.push({name:"stale client contract rejected",result:"PASS"});
const priorTournament=env.PRODUCTION_CUTOVER_TOURNAMENT_ID;
env.PRODUCTION_CUTOVER_TOURNAMENT_ID="2025";
await check("wrong tournament",base,"SUPABASE",false);
env.PRODUCTION_CUTOVER_TOURNAMENT_ID=priorTournament;
const priorCommit=env.PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA;
env.PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA="b".repeat(40);
await check("mismatched application SHA",base,"SUPABASE",false);
env.PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA=priorCommit;
console.log(JSON.stringify({checks:results.length,results},null,2));
