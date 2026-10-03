import { PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF } from "./completed-history-read-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";
import { certificationRequested, certificationResourceEnvironment } from "./canonical-resource-registration.js";

const clean = (value) => String(value ?? "").trim();

/**
 * Step 7C is a Preview-only, server-side capability. It is deliberately not a
 * consumer source selector: no calculation surface is wired to this gate yet.
 */
export function predictionInputBundleEnvironment(env = process.env) {
  if (certificationRequested(env)) {
    const resource = certificationResourceEnvironment(env);
    const selected = clean(env.SECONDARY_HISTORY_READ_SOURCE || "supabase") === "supabase";
    return {contract:"prediction-input-bundle-preview-gate-v1", available:resource.eligible && selected,
      preview:clean(env.VERCEL_ENV) === "preview", productionHardBlock:clean(env.VERCEL_ENV) === "production",
      projectApproved:resource.eligible, credentialsConfigured:resource.credentialsConfigured,
      secondaryHistorySelected:selected,
      certificationResource:resource.eligible, productionShadowCandidate:false,
      projectRef:resource.projectRef, fallbackUsed:false, reason:!resource.eligible ? resource.reason : selected ? resource.reason : "secondary-history-supabase-required"};
  }
  const candidate = productionShadowCandidateReadEnvironment(env);
  // An explicitly requested diagnostic lane cannot borrow another admission.
  if (candidate.requested) {
    return {
      contract: "prediction-input-bundle-preview-gate-v1",
      available: candidate.eligible,
      preview: clean(env.VERCEL_ENV).toLowerCase() === "preview",
      productionHardBlock: clean(env.VERCEL_ENV).toLowerCase() === "production",
      projectApproved: candidate.eligible,
      credentialsConfigured: candidate.exactSecret,
      secondaryHistorySelected: clean(env.SECONDARY_HISTORY_READ_SOURCE).toLowerCase() === "supabase",
      productionShadowCandidate: candidate.eligible,
      projectRef: candidate.projectRef,
      fallbackUsed: false,
      reason: candidate.eligible
        ? "production-shadow-supabase-prediction-input-bundle" : candidate.reason,
    };
  }
  const cutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "WAR_ROOM_INPUT_SOURCE",
    configuredValue: env.WAR_ROOM_INPUT_SOURCE,
    requiredPhase: "ODDS_WAR_ROOM",
  });
  if (cutover.handled) {
    return {
      contract: "prediction-input-bundle-production-cutover-gate-v1",
      available: !cutover.blocked && cutover.resolved === "supabase",
      preview: false,
      productionHardBlock: cutover.blocked || cutover.resolved !== "supabase",
      projectApproved: cutover.activation.projectRefApproved,
      credentialsConfigured: cutover.activation.serviceCredentialConfigured,
      secondaryHistorySelected: clean(env.SECONDARY_HISTORY_READ_SOURCE).toLowerCase() === "supabase",
      productionShadowCandidate: false,
      productionCutover: cutover,
      projectRef: cutover.activation.resources.projectRef,
      fallbackUsed: false,
      reason: cutover.blocked ? cutover.reason
        : cutover.resolved !== "supabase" ? "production-war-room-supabase-not-selected"
        : "production-cutover-supabase-prediction-input-bundle",
    };
  }
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const projectUrl = clean(env.SUPABASE_SCORING_MIRROR_URL);
  const projectApproved = candidate.eligible || projectUrl.includes(PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF);
  const credentialsConfigured = Boolean(projectUrl && clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const preview = deployment === "preview";
  const secondaryHistorySelected = clean(env.SECONDARY_HISTORY_READ_SOURCE).toLowerCase() === "supabase";
  const available = candidate.eligible || (preview && projectApproved && credentialsConfigured && secondaryHistorySelected);

  return {
    contract: "prediction-input-bundle-preview-gate-v1",
    available,
    preview,
    productionHardBlock: deployment === "production",
    projectApproved,
    credentialsConfigured,
    secondaryHistorySelected,
    productionShadowCandidate: candidate.eligible,
    projectRef: candidate.eligible ? candidate.projectRef
      : projectApproved ? PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF : "",
    reason: candidate.eligible
      ? "production-shadow-supabase-prediction-input-bundle"
      : !preview
      ? "preview-environment-required"
      : !projectApproved
        ? "preview-project-required"
        : !credentialsConfigured
          ? "credentials-missing"
          : !secondaryHistorySelected
            ? "secondary-history-supabase-required"
            : "preview-supabase-prediction-input-bundle",
  };
}

export function requirePredictionInputBundleEnvironment(env = process.env) {
  const state = predictionInputBundleEnvironment(env);
  if (!state.available) {
    const error = new Error(`Canonical Prediction inputs are unavailable (${state.reason}).`);
    error.code = state.productionHardBlock
      ? "PREDICTION_INPUT_BUNDLE_PRODUCTION_BLOCKED"
      : "PREDICTION_INPUT_BUNDLE_PREVIEW_CONFIGURATION_REQUIRED";
    error.status = 503;
    error.diagnostics = state;
    throw error;
  }
  return state;
}
