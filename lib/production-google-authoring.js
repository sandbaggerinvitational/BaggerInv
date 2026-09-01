import "server-only";

import {
  assertProductionCutoverRequest,
  productionCutoverActivationEnvironment,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from "./google-service-account-credential-context.js";
import {
  GOOGLE_AUTHORING_OPERATIONS,
  GOOGLE_WORKBOOK_MUTATION_INTENTS,
  withGoogleWorkbookMutationIntent,
} from "./google-workbook-mutation-intent.js";
import { withProductionGoogleServiceAccountCredentials } from "./google-service-account-credential-context.js";

const clean = (value) => String(value ?? "").trim();
const RETIRED_PRODUCTION_GUIDE_OPERATIONS = new Set([
  GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_GUIDE,
  GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE,
]);

function productionAuthoringResources(activation) {
  return {
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
    vercelProjectId: activation.resources.vercelProjectId || PRODUCTION_VERCEL_PROJECT_ID,
    vercelProjectName: activation.resources.vercelProjectName,
    canonicalHostname: new URL(activation.resources.canonicalOrigin).hostname,
  };
}

/**
 * Distinct retained-Google-authoring boundary. It never acquires a canonical
 * scoring admission, and it always selects the separate Production credential
 * when it targets the Production workbook. Retained presentation/Odds
 * authoring cannot silently execute as mirror/archive or canonical scoring
 * work. Retired Draft, Prediction Settings, and Guide domains are not admitted
 * here. Preview keeps its separately bounded legacy Guide intent.
 */
export function withProductionGoogleAuthoringWrite({
  request,
  operation,
  env = process.env,
} = {}, callback) {
  if (typeof callback !== "function") throw new TypeError("A Google authoring callback is required.");
  const normalizedOperation = clean(operation).toUpperCase();
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const productionWorkbook = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID) ===
    PRODUCTION_GOOGLE_WORKBOOK_ID;
  const execute = () => withGoogleWorkbookMutationIntent({
    intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.AUTHORING,
    operation: normalizedOperation,
  }, callback);
  if (!production) return execute();
  if (RETIRED_PRODUCTION_GUIDE_OPERATIONS.has(normalizedOperation)) {
    const error = new Error("Production Tournament Guide content is managed in the Director Console.");
    error.code = "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED";
    error.status = 410;
    throw error;
  }
  if (!productionWorkbook) {
    const error = new Error("Production Google authoring requires the exact Production workbook.");
    error.code = "PRODUCTION_GOOGLE_AUTHORING_RESOURCE_MISMATCH";
    error.status = 503;
    throw error;
  }
  const requestState = assertProductionCutoverRequest(request, env);
  const activation = productionCutoverActivationEnvironment(env);
  return withProductionGoogleServiceAccountCredentials({
    env,
    operation: "GOOGLE_DIRECTOR_AUTHORING",
    resources: productionAuthoringResources(requestState.activation || activation),
  }, execute);
}
