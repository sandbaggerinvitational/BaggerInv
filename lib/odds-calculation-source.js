import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();
const SOURCES = new Set(["google", "supabase"]);
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

function selectorState({ configuredValue, preview, eligible, kind, candidate = false }) {
  const configured = clean(configuredValue);
  const requested = clean(configured || "google").toLowerCase();
  const valid = SOURCES.has(requested);
  if (!preview) return {
    configuredValue: configured,
    requested,
    resolved: "google",
    valid,
    eligible: false,
    blocked: false,
    productionHardBlock: requested !== "google",
    reason: requested === "google" ? "production-google-authority" : "production-hard-block",
    failureCode: "",
  };
  const blocked = !valid || (requested === "supabase" && !eligible);
  const reason = !valid ? "invalid-source"
    : requested === "google" ? "preview-google-authority"
    : eligible ? (candidate ? "production-shadow-supabase-input" : "preview-supabase-authority")
    : "preview-prerequisites-missing";
  return {
    configuredValue: configured,
    requested: valid ? requested : "invalid",
    resolved: blocked ? "unavailable" : requested,
    valid,
    eligible,
    blocked,
    productionHardBlock: false,
    reason,
    failureCode: blocked ? `${kind}_AUTHORITY_UNAVAILABLE` : "",
  };
}

export function oddsCalculationEnvironment(env = process.env) {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const inputCutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "ODDS_CALCULATION_INPUT_SOURCE",
    configuredValue: env.ODDS_CALCULATION_INPUT_SOURCE,
    requiredPhase: "ODDS_WAR_ROOM",
  });
  if (inputCutover.handled) {
    const configuredInput = clean(env.ODDS_CALCULATION_INPUT_SOURCE);
    const input = {
      configuredValue: configuredInput,
      requested: inputCutover.requested,
      resolved: inputCutover.resolved,
      valid: inputCutover.requested !== "invalid",
      eligible: inputCutover.resolved === "supabase",
      blocked: inputCutover.blocked,
      productionHardBlock: inputCutover.blocked,
      reason: inputCutover.reason,
      failureCode: inputCutover.failureCode,
      productionCutover: inputCutover,
      fallbackUsed: false,
    };
    const configuredPublication = clean(env.ODDS_PUBLICATION_AUTHORITY);
    const requestedPublication = clean(configuredPublication || "google").toLowerCase();
    const publicationEnabled = truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED);
    const mirrorEnabled = truthy(env.PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED);
    const supabasePublication = requestedPublication === "supabase" && publicationEnabled && !mirrorEnabled;
    // Before the explicit Step 13C authority transition, an injected
    // `supabase` selector alone must not acquire publication authority. Once
    // the bounded Production publication flag is enabled, the exact
    // Supabase/true/false tuple becomes authoritative and Google is no longer
    // a fallback or mirror.
    const legacyGooglePublication = requestedPublication === "google" &&
      !publicationEnabled && !mirrorEnabled;
    const publicationBlocked = !supabasePublication && !legacyGooglePublication;
    const publication = {
      configuredValue: configuredPublication,
      requested: SOURCES.has(requestedPublication) ? requestedPublication : "invalid",
      resolved: publicationBlocked ? "unavailable" : supabasePublication ? "supabase" : "google",
      valid: SOURCES.has(requestedPublication),
      eligible: supabasePublication,
      blocked: publicationBlocked,
      productionHardBlock: publicationBlocked,
      reason: supabasePublication ? "production-supabase-publication-authority"
        : legacyGooglePublication ? "production-google-publication-authority"
        : !SOURCES.has(requestedPublication) ? "invalid-source"
        : mirrorEnabled ? "production-google-odds-mirror-forbidden"
        : "exact-production-publication-configuration-required",
      failureCode: publicationBlocked ? "ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE" : "",
    };
    return {
      requestedInputs: input.requested,
      requestedPublication: publication.requested,
      inputSource: input.resolved,
      publicationAuthority: publication.resolved,
      inputBlocked: input.blocked,
      inputReason: input.reason,
      inputFailureCode: input.failureCode,
      publicationBlocked: publication.blocked,
      publicationReason: publication.reason,
      publicationFailureCode: publication.failureCode,
      input,
      publication,
      eligible: input.eligible,
      productionShadowCandidate: false,
      productionCutover: inputCutover,
      publicationEligible: supabasePublication,
      preview: false,
      isolated: false,
      configured: inputCutover.activation.serviceCredentialConfigured,
      productionHardBlock: input.blocked || publication.productionHardBlock,
      fallbackUsed: false,
    };
  }
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const isolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID && (!previewWorkbookId || workbookId === previewWorkbookId);
  const configured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) && Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const previewEligible = preview && isolated && configured;
  const inputEligible = candidate.eligible || previewEligible;
  // A Production-shadow candidate may calculate against certified shadow
  // facts, but can never acquire Supabase publication authority.
  const publicationEligible = previewEligible && !candidate.eligible;
  const input = selectorState({ configuredValue: env.ODDS_CALCULATION_INPUT_SOURCE, preview, eligible: inputEligible, kind: "ODDS_CALCULATION_INPUT", candidate: candidate.eligible });
  const publication = selectorState({ configuredValue: env.ODDS_PUBLICATION_AUTHORITY, preview, eligible: publicationEligible, kind: "ODDS_PUBLICATION" });
  return {
    requestedInputs: input.requested,
    requestedPublication: publication.requested,
    inputSource: input.resolved,
    publicationAuthority: publication.resolved,
    inputBlocked: input.blocked,
    inputReason: input.reason,
    inputFailureCode: input.failureCode,
    publicationBlocked: publication.blocked,
    publicationReason: publication.reason,
    publicationFailureCode: publication.failureCode,
    input,
    publication,
    eligible: inputEligible,
    productionShadowCandidate: candidate.eligible,
    publicationEligible,
    preview,
    isolated,
    configured,
    productionHardBlock: input.productionHardBlock || publication.productionHardBlock,
  };
}

function authorityError(state, selector) {
  const detail = selector === "input" ? state.input : state.publication;
  const error = new Error(`${selector === "input" ? "Odds calculation input" : "Odds publication"} authority is unavailable in this runtime.`);
  error.code = detail.failureCode;
  error.status = 503;
  error.authority = state;
  return error;
}

export function requireOddsCalculationInputSource(env = process.env) {
  const state = oddsCalculationEnvironment(env);
  if (state.inputBlocked) throw authorityError(state, "input");
  return state;
}

export function requireOddsPublicationAuthority(env = process.env) {
  const state = oddsCalculationEnvironment(env);
  if (state.publicationBlocked) throw authorityError(state, "publication");
  return state;
}
