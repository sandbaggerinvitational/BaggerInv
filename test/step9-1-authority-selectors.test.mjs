import assert from "node:assert/strict";
import test from "node:test";

import {
  oddsCalculationEnvironment,
  requireOddsCalculationInputSource,
  requireOddsPublicationAuthority,
} from "../lib/odds-calculation-source.js";
import {
  requireParticipantIdentityAuthority,
  participantIdentityAuthorityEnvironment,
} from "../lib/participant-identity-authority.js";
import {
  requireScoringAuthority,
  scoringAuthority,
  scoringAuthorityEnvironment,
} from "../lib/scoring-authority.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const eligiblePreview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  GOOGLE_SHEETS_SPREADSHEET_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "publishable-key",
};

function assertUnavailable(operation, code) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.status, 503);
    assert.ok(error.authority && typeof error.authority === "object");
    return true;
  });
}

test("Canonical Preview defaults require no Google and reject legacy authority", async () => {
const {canonicalReadFixture:env}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
const odds=oddsCalculationEnvironment(env);assert.equal(odds.inputSource,'supabase');assert.equal(odds.publicationBlocked,true,'publication requires explicit authority');
assert.equal(requireScoringAuthority(env).resolved,'supabase');assert.equal(requireParticipantIdentityAuthority(env).resolved,'supabase');
for(const retired of ['google','passport']){assertUnavailable(()=>requireScoringAuthority({...env,SCORING_AUTHORITY:retired}),'SCORING_AUTHORITY_UNAVAILABLE');assertUnavailable(()=>requireParticipantIdentityAuthority({...env,PARTICIPANT_IDENTITY_AUTHORITY:retired}),'IDENTITY_AUTHORITY_UNAVAILABLE');}
});

test("eligible Preview selectors resolve Supabase without blocking", () => {
  const odds = oddsCalculationEnvironment({
    ...eligiblePreview,
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
    ODDS_PUBLICATION_AUTHORITY: "supabase",
  });
  assert.deepEqual({
    inputs: odds.inputSource,
    publication: odds.publicationAuthority,
    inputBlocked: odds.inputBlocked,
    publicationBlocked: odds.publicationBlocked,
  }, { inputs: "supabase", publication: "supabase", inputBlocked: false, publicationBlocked: false });

  const scoring = scoringAuthorityEnvironment({ ...eligiblePreview, SCORING_AUTHORITY: "supabase" });
  assert.deepEqual({ requested: scoring.requested, resolved: scoring.resolved, eligible: scoring.eligible, blocked: scoring.blocked },
    { requested: "supabase", resolved: "supabase", eligible: true, blocked: false });
  assert.equal(scoringAuthority({ ...eligiblePreview, SCORING_AUTHORITY: "supabase" }), "supabase");

  const identity = participantIdentityAuthorityEnvironment({ ...eligiblePreview, PARTICIPANT_IDENTITY_AUTHORITY: "supabase" });
  assert.deepEqual({ requested: identity.requested, resolved: identity.resolved, eligible: identity.eligible, blocked: identity.blocked },
    { requested: "supabase", resolved: "supabase", eligible: true, blocked: false });
  assert.equal(identity.participantAuthEnabled, true);
});

test("Scoring isolation uses canonical database identity and ignores retired workbook metadata", async () => {
const {canonicalReadFixture:env}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
assert.equal(requireScoringAuthority(env).resolved,'supabase');
assert.equal(scoringAuthorityEnvironment({...env,GOOGLE_SHEETS_ID:PRODUCTION_SPREADSHEET_ID}).resolved,'supabase','legacy provider metadata cannot change canonical authority');
assertUnavailable(()=>requireScoringAuthority({...env,SUPABASE_SCORING_MIRROR_URL:'https://wrong.supabase.co'}),'SCORING_AUTHORITY_UNAVAILABLE');
});

test("invalid Preview authority tokens fail closed instead of selecting a legacy authority", async () => {
const {canonicalReadFixture:env}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
for(const token of ['typo','google','passport']){
assertUnavailable(()=>requireOddsCalculationInputSource({...env,ODDS_CALCULATION_INPUT_SOURCE:token}),'ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireOddsPublicationAuthority({...env,ODDS_PUBLICATION_AUTHORITY:token}),'ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireScoringAuthority({...env,SCORING_AUTHORITY:token}),'SCORING_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireParticipantIdentityAuthority({...env,PARTICIPANT_IDENTITY_AUTHORITY:token}),'IDENTITY_AUTHORITY_UNAVAILABLE');
assert.equal(participantIdentityAuthorityEnvironment({...env,PARTICIPANT_IDENTITY_AUTHORITY:token,SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED:'true'}).participantAuthEnabled,false);
}
});

test("ineligible Preview Supabase requests fail closed with prerequisite diagnostics", async () => {
const {canonicalReadFixture:env}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
const missing={...env,SUPABASE_SCORING_MIRROR_SECRET_KEY:'',ODDS_PUBLICATION_AUTHORITY:'supabase'};
assertUnavailable(()=>requireOddsCalculationInputSource(missing),'ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireOddsPublicationAuthority(missing),'ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireScoringAuthority(missing),'SCORING_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireParticipantIdentityAuthority({...env,NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:''}),'IDENTITY_AUTHORITY_UNAVAILABLE');
assert.equal(scoringAuthorityEnvironment(missing).reason,'credentials-missing');
});

test("Unadmitted Production cannot select canonical or retired authority", async () => {
for(const token of [undefined,'google','passport','supabase','typo']){
const env={...eligiblePreview,VERCEL_ENV:'production',ODDS_CALCULATION_INPUT_SOURCE:token,ODDS_PUBLICATION_AUTHORITY:token,SCORING_AUTHORITY:token,PARTICIPANT_IDENTITY_AUTHORITY:token};
assertUnavailable(()=>requireOddsCalculationInputSource(env),'ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireOddsPublicationAuthority(env),'ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireScoringAuthority(env),'SCORING_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireParticipantIdentityAuthority(env),'IDENTITY_AUTHORITY_UNAVAILABLE');
}
});

test("Odds calculation and publication selectors remain independently enforceable", async () => {
const {canonicalReadFixture:env}=await import('./support/reliability/canonical-read-retirement-contract.mjs');
assert.equal(requireOddsCalculationInputSource(env).inputSource,'supabase');
assertUnavailable(()=>requireOddsPublicationAuthority(env),'ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE');
assert.equal(requireOddsPublicationAuthority({...env,ODDS_PUBLICATION_AUTHORITY:'supabase'}).publicationAuthority,'supabase');
for(const token of ['google','typo']){
assertUnavailable(()=>requireOddsPublicationAuthority({...env,ODDS_PUBLICATION_AUTHORITY:token}),'ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE');
assertUnavailable(()=>requireOddsPublicationAuthority({...env,ODDS_PUBLICATION_AUTHORITY:'supabase',ODDS_CALCULATION_INPUT_SOURCE:token}),'ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE');
}
});
