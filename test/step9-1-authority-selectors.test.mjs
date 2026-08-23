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
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
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

test("missing and explicit legacy Preview selectors preserve their approved authorities", () => {
  const oddsDefault = oddsCalculationEnvironment(eligiblePreview);
  assert.deepEqual({
    inputs: oddsDefault.inputSource,
    publication: oddsDefault.publicationAuthority,
    inputBlocked: oddsDefault.inputBlocked,
    publicationBlocked: oddsDefault.publicationBlocked,
  }, { inputs: "google", publication: "google", inputBlocked: false, publicationBlocked: false });
  assert.equal(requireOddsCalculationInputSource(eligiblePreview).inputSource, "google");
  assert.equal(requireOddsPublicationAuthority(eligiblePreview).publicationAuthority, "google");

  const scoringDefault = scoringAuthorityEnvironment(eligiblePreview);
  assert.deepEqual({ requested: scoringDefault.requested, resolved: scoringDefault.resolved, blocked: scoringDefault.blocked },
    { requested: "google", resolved: "google", blocked: false });
  assert.equal(requireScoringAuthority(eligiblePreview).resolved, "google");
  assert.equal(scoringAuthority(eligiblePreview), "google");

  const identityDefault = participantIdentityAuthorityEnvironment(eligiblePreview);
  assert.deepEqual({ requested: identityDefault.requested, resolved: identityDefault.resolved, blocked: identityDefault.blocked },
    { requested: "passport", resolved: "passport", blocked: false });
  assert.equal(requireParticipantIdentityAuthority(eligiblePreview).resolved, "passport");
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

test("Scoring accepts an isolated Preview workbook when the optional exact workbook selector is absent", () => {
  const isolated = {
    ...eligiblePreview,
    PREVIEW_SCORING_SHEET_ID: "",
    SCORING_AUTHORITY: "supabase",
  };
  assert.deepEqual(((state) => ({ resolved: state.resolved, eligible: state.eligible,
    blocked: state.blocked, previewWorkbook: state.previewWorkbook, productionIsolated: state.productionIsolated }))(
    scoringAuthorityEnvironment(isolated)),
  { resolved: "supabase", eligible: true, blocked: false, previewWorkbook: true, productionIsolated: true });

  const productionWorkbook = {
    ...isolated,
    GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID: PRODUCTION_SPREADSHEET_ID,
  };
  assert.deepEqual(((state) => ({ resolved: state.resolved, eligible: state.eligible,
    blocked: state.blocked, reason: state.reason, productionIsolated: state.productionIsolated }))(
    scoringAuthorityEnvironment(productionWorkbook)),
  { resolved: "unavailable", eligible: false, blocked: true,
    reason: "preview-workbook-required", productionIsolated: false });
});

test("invalid Preview authority tokens fail closed instead of selecting a legacy authority", () => {
  const oddsInputEnv = { ...eligiblePreview, ODDS_CALCULATION_INPUT_SOURCE: "typo" };
  const oddsInput = oddsCalculationEnvironment(oddsInputEnv);
  assert.deepEqual({ requested: oddsInput.requestedInputs, resolved: oddsInput.inputSource, blocked: oddsInput.inputBlocked, reason: oddsInput.inputReason },
    { requested: "invalid", resolved: "unavailable", blocked: true, reason: "invalid-source" });
  assertUnavailable(
    () => requireOddsCalculationInputSource(oddsInputEnv),
    "ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE",
  );

  const oddsPublicationEnv = { ...eligiblePreview, ODDS_PUBLICATION_AUTHORITY: "typo" };
  const oddsPublication = oddsCalculationEnvironment(oddsPublicationEnv);
  assert.deepEqual({ requested: oddsPublication.requestedPublication, resolved: oddsPublication.publicationAuthority,
    blocked: oddsPublication.publicationBlocked, reason: oddsPublication.publicationReason },
  { requested: "invalid", resolved: "unavailable", blocked: true, reason: "invalid-source" });
  assertUnavailable(
    () => requireOddsPublicationAuthority(oddsPublicationEnv),
    "ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE",
  );

  const scoringEnv = { ...eligiblePreview, SCORING_AUTHORITY: "typo" };
  assert.deepEqual(((state) => ({ requested: state.requested, resolved: state.resolved, blocked: state.blocked, reason: state.reason }))(
    scoringAuthorityEnvironment(scoringEnv)),
  { requested: "invalid", resolved: "unavailable", blocked: true, reason: "invalid-authority" });
  assertUnavailable(() => requireScoringAuthority(scoringEnv), "SCORING_AUTHORITY_UNAVAILABLE");

  const identityEnv = {
    ...eligiblePreview,
    PARTICIPANT_IDENTITY_AUTHORITY: "typo",
    SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED: "true",
  };
  const identity = participantIdentityAuthorityEnvironment(identityEnv);
  assert.deepEqual({ requested: identity.requested, resolved: identity.resolved, blocked: identity.blocked,
    reason: identity.reason, participantAuthEnabled: identity.participantAuthEnabled, authRehearsalEnabled: identity.authRehearsalEnabled },
  { requested: "invalid", resolved: "unavailable", blocked: true, reason: "invalid-authority",
    participantAuthEnabled: false, authRehearsalEnabled: false });
  assertUnavailable(() => requireParticipantIdentityAuthority(identityEnv), "IDENTITY_AUTHORITY_UNAVAILABLE");
});

test("ineligible Preview Supabase requests fail closed with prerequisite diagnostics", () => {
  const oddsEnv = {
    ...eligiblePreview,
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
    SUPABASE_SCORING_MIRROR_SECRET_KEY: "",
  };
  const odds = oddsCalculationEnvironment(oddsEnv);
  assert.deepEqual({ resolved: odds.inputSource, blocked: odds.inputBlocked, reason: odds.inputReason },
    { resolved: "unavailable", blocked: true, reason: "preview-prerequisites-missing" });
  assertUnavailable(() => requireOddsCalculationInputSource(oddsEnv), "ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE");

  const oddsPublicationEnv = {
    ...eligiblePreview,
    ODDS_CALCULATION_INPUT_SOURCE: "google",
    ODDS_PUBLICATION_AUTHORITY: "supabase",
    SUPABASE_SCORING_MIRROR_SECRET_KEY: "",
  };
  const oddsPublication = oddsCalculationEnvironment(oddsPublicationEnv);
  assert.deepEqual({ inputSource: oddsPublication.inputSource, inputBlocked: oddsPublication.inputBlocked,
    publicationAuthority: oddsPublication.publicationAuthority, publicationBlocked: oddsPublication.publicationBlocked },
  { inputSource: "google", inputBlocked: false, publicationAuthority: "unavailable", publicationBlocked: true });
  assertUnavailable(() => requireOddsPublicationAuthority(oddsPublicationEnv), "ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE");

  const scoringEnv = { ...eligiblePreview, SCORING_AUTHORITY: "supabase", SUPABASE_SCORING_MIRROR_SECRET_KEY: "" };
  const scoring = scoringAuthorityEnvironment(scoringEnv);
  assert.deepEqual({ resolved: scoring.resolved, blocked: scoring.blocked, reason: scoring.reason },
    { resolved: "unavailable", blocked: true, reason: "credentials-missing" });
  assertUnavailable(() => requireScoringAuthority(scoringEnv), "SCORING_AUTHORITY_UNAVAILABLE");

  const identityEnv = {
    ...eligiblePreview,
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
    NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "",
  };
  const identity = participantIdentityAuthorityEnvironment(identityEnv);
  assert.deepEqual({ resolved: identity.resolved, blocked: identity.blocked, reason: identity.reason, participantAuthEnabled: identity.participantAuthEnabled },
    { resolved: "unavailable", blocked: true, reason: "auth-public-config-missing", participantAuthEnabled: false });
  assertUnavailable(() => requireParticipantIdentityAuthority(identityEnv), "IDENTITY_AUTHORITY_UNAVAILABLE");
});

test("Production hard-resolves authority requests to Google or Passport without throwing", () => {
  const production = {
    ...eligiblePreview,
    VERCEL_ENV: "production",
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
    ODDS_PUBLICATION_AUTHORITY: "supabase",
    SCORING_AUTHORITY: "supabase",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  };
  const odds = oddsCalculationEnvironment(production);
  assert.deepEqual({ inputs: odds.inputSource, publication: odds.publicationAuthority,
    inputBlocked: odds.inputBlocked, publicationBlocked: odds.publicationBlocked, productionHardBlock: odds.productionHardBlock },
  { inputs: "google", publication: "google", inputBlocked: false, publicationBlocked: false, productionHardBlock: true });
  assert.equal(requireOddsCalculationInputSource(production).inputSource, "google");
  assert.equal(requireOddsPublicationAuthority(production).publicationAuthority, "google");

  const scoring = requireScoringAuthority(production);
  assert.deepEqual({ resolved: scoring.resolved, blocked: scoring.blocked, productionBlocked: scoring.productionBlocked, reason: scoring.reason },
    { resolved: "google", blocked: false, productionBlocked: true, reason: "production-hard-block" });

  const identity = requireParticipantIdentityAuthority(production);
  assert.deepEqual({ resolved: identity.resolved, blocked: identity.blocked, productionBlocked: identity.productionBlocked, reason: identity.reason },
    { resolved: "passport", blocked: false, productionBlocked: true, reason: "production-hard-block" });

  const invalidProduction = {
    ...production,
    ODDS_CALCULATION_INPUT_SOURCE: "typo",
    ODDS_PUBLICATION_AUTHORITY: "typo",
    SCORING_AUTHORITY: "typo",
    PARTICIPANT_IDENTITY_AUTHORITY: "typo",
  };
  assert.deepEqual(((state) => ({ inputs: state.inputSource, publication: state.publicationAuthority,
    inputBlocked: state.inputBlocked, publicationBlocked: state.publicationBlocked }))(oddsCalculationEnvironment(invalidProduction)),
  { inputs: "google", publication: "google", inputBlocked: false, publicationBlocked: false });
  assert.equal(requireScoringAuthority(invalidProduction).resolved, "google");
  assert.equal(requireParticipantIdentityAuthority(invalidProduction).resolved, "passport");
});

test("Odds calculation and publication selectors remain independently enforceable", () => {
  const supabaseInput = {
    ...eligiblePreview,
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
    ODDS_PUBLICATION_AUTHORITY: "google",
  };
  assert.deepEqual(((state) => ({ inputs: state.inputSource, publication: state.publicationAuthority,
    inputBlocked: state.inputBlocked, publicationBlocked: state.publicationBlocked }))(oddsCalculationEnvironment(supabaseInput)),
  { inputs: "supabase", publication: "google", inputBlocked: false, publicationBlocked: false });

  const supabasePublication = {
    ...eligiblePreview,
    ODDS_CALCULATION_INPUT_SOURCE: "google",
    ODDS_PUBLICATION_AUTHORITY: "supabase",
  };
  assert.deepEqual(((state) => ({ inputs: state.inputSource, publication: state.publicationAuthority,
    inputBlocked: state.inputBlocked, publicationBlocked: state.publicationBlocked }))(oddsCalculationEnvironment(supabasePublication)),
  { inputs: "google", publication: "supabase", inputBlocked: false, publicationBlocked: false });

  const invalidInput = { ...eligiblePreview, ODDS_CALCULATION_INPUT_SOURCE: "typo", ODDS_PUBLICATION_AUTHORITY: "google" };
  assert.throws(() => requireOddsCalculationInputSource(invalidInput), { code: "ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE" });
  assert.equal(requireOddsPublicationAuthority(invalidInput).publicationAuthority, "google");

  const invalidPublication = { ...eligiblePreview, ODDS_CALCULATION_INPUT_SOURCE: "google", ODDS_PUBLICATION_AUTHORITY: "typo" };
  assert.equal(requireOddsCalculationInputSource(invalidPublication).inputSource, "google");
  assert.throws(() => requireOddsPublicationAuthority(invalidPublication), { code: "ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE" });
});
