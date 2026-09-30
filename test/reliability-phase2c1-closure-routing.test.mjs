// Proof layers: UNIT / API ADAPTER (mock transport); never a Production query.
import assert from "node:assert/strict";
import test from "node:test";
import { closureReadCandidate as env } from "./support/reliability/closure-routing-fixture.mjs";
import { productionShadowCandidateReadEnvironment, productionShadowCandidateScoringMutationDecision } from "../lib/production-shadow-candidate.js";
import { canonicalReadEnvironment } from "../lib/canonical-runtime-source.js";
import { oddsCalculationEnvironment } from "../lib/odds-calculation-source.js";
import { scoringShadowRpc } from "../lib/scoring-shadow.js";

test("NA-CANONICAL-ROUTING-01: exact diagnostic read authority needs no Google configuration", () => {
 assert.equal(Object.keys(env).some(k=>/GOOGLE|SHEETS|DRIVE/.test(k)),false);
 assert.equal(productionShadowCandidateReadEnvironment(env).eligible,true);
 assert.equal(canonicalReadEnvironment(env,"HOME_READ_SOURCE").resolved,"supabase");
});

test("NA-CANONICAL-ROUTING-02: readable candidate never acquires publication or scoring writes", async () => {
 assert.equal(oddsCalculationEnvironment(env).inputSource,"supabase");
 assert.equal(oddsCalculationEnvironment(env).publicationBlocked,true);
 const request = new Request("https://closure-read.vercel.app/api/scoring/current", {method:"POST", headers:{host:"closure-read.vercel.app",origin:"https://closure-read.vercel.app"}});
 assert.equal(productionShadowCandidateScoringMutationDecision(request,env).code,"PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY");
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error("No transport permitted");};
 try { for(const fn of ["submit_production_hole_score","finalize_production_match","reopen_production_match","mutate_production_match_control","claim_production_score_derived_intents_v1","publish_production_odds_calculation","replace_preview_scoring_authority_import"])
  await assert.rejects(scoringShadowRpc(fn,{input:{}},{env}), e=>e.code==="PRODUCTION_SHADOW_CANDIDATE_RPC_FORBIDDEN",fn);
 } finally {globalThis.fetch=old;}
 assert.equal(calls,0);
});

test("canonical candidate retains exact security admission and cannot fallback to Preview", () => {
 const invalid = {
 VERCEL_ENV:"production", VERCEL_BRANCH_URL:"wrong.vercel.app", VERCEL_URL:"baggerinv.com",
 VERCEL_GIT_COMMIT_SHA:"b".repeat(40), VERCEL_PROJECT_ID:"wrong", VERCEL_PROJECT_NAME:"wrong",
 PRODUCTION_FOUNDATION_ENABLED:"false", PRODUCTION_SUPABASE_PROJECT_REF:"wrong", PRODUCTION_SUPABASE_URL:"https://wrong.invalid",
 PRODUCTION_SUPABASE_SECRET_KEY:"short", NEXT_PUBLIC_SUPABASE_AUTH_URL:"https://wrong.invalid", NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:"short",
 PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED:"false", PARTICIPANT_IDENTITY_AUTHORITY:"passport",
 PARTICIPANT_AUTH_CAPTCHA_REQUIRED:"false", PARTICIPANT_AUTH_CAPTCHA_CONFIGURED:"false", NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY:"short",
 PARTICIPANT_AUTH_RATE_LIMIT_SECRET:"short", PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED:"true",
 PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED:"true", PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED:"true",
 SUPABASE_SCORING_MIRROR_ENABLED:"true", PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED:"false",
 SUPABASE_SCORING_MIRROR_URL:"https://idgigvjjqkfbqjeredpb.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY:"wrong"
 };
 for(const [key,value] of Object.entries(invalid)) {
  const bad={...env,[key]:value};assert.equal(productionShadowCandidateReadEnvironment(bad).eligible,false,key);
  assert.equal(canonicalReadEnvironment(bad,"HOME_READ_SOURCE").blocked,true,key);
 }
});
