import "server-only";
import { inspectProductionCutoverReadState } from "./production-cutover-read-control.js";
import { readProductionCurrentTournamentRuntime } from "./production-current-tournament-runtime.js";
import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL, PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

// Existing read-only inspector (migration 042, extended by 044). No native
// state table, admission lease, receipt, or mutation RPC is created/called.
async function inspectAdmission({ env, fetchImpl = fetch }) {
  const secret = String(env.PRODUCTION_SUPABASE_SECRET_KEY || "").trim();
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  recordDataAuthorityTransport("supabase", { adapter: "production-native-authority-inspection" });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/inspect_production_scoring_admission`, {
    method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ input: { environment: "PRODUCTION", project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
      project_url: PRODUCTION_SUPABASE_URL, source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
      tournament_id: PRODUCTION_TOURNAMENT_ID, deployment_commit: env.VERCEL_GIT_COMMIT_SHA, deployment_id: env.VERCEL_DEPLOYMENT_ID } }),
  });
  if (!response.ok) throw new Error("native authority unavailable");
  return response.json();
}

export async function readProductionNativeAuthority({ env = process.env, dependencies = {} } = {}) {
  const [read, admission, runtime] = await Promise.all([
    (dependencies.inspectRead || inspectProductionCutoverReadState)({ env }),
    (dependencies.inspectAdmission || inspectAdmission)({ env }),
    (dependencies.readRuntime || readProductionCurrentTournamentRuntime)({}, { env }),
  ]);
  const compatible = read?.ok === true && admission?.ok === true &&
    read.contract_version === "production-cutover-activation-v1" &&
    read.project_ref === PRODUCTION_SUPABASE_PROJECT_REF && read.source_workbook_id === PRODUCTION_GOOGLE_WORKBOOK_ID &&
    read.deployment_commit === env.VERCEL_GIT_COMMIT_SHA &&
    read.activation_state === "SCORING_COMMITTED" && read.read_cutover_phase === "OBSERVATION" &&
    read.participant_identity_authority === "SUPABASE" && read.current_tournament_read_authority === "SUPABASE" &&
    read.public_supabase_reads_enabled === true &&
    admission.activation_revision === read.activation_revision &&
    Number.isSafeInteger(read.activation_revision) && read.activation_revision > 0 &&
    admission.activation_state === "SCORING_COMMITTED" && admission.contract_version === "ADMISSION_V3" &&
    admission.database_admission_contract_version === "production-scoring-admission-v2" &&
    admission.admission_protocol_enforced === true && admission.admission_state === "CLOSED" &&
    admission.new_legacy_admission_allowed === false && admission.deployment_id === env.VERCEL_DEPLOYMENT_ID &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH || "") &&
    admission.authority_generation_id === env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION || "") &&
    admission.admission_generation_id === env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION &&
    ["NORMAL", "SCORING_MAINTENANCE"].includes(admission.maintenance_state) &&
    runtime?.contractVersion === "production-current-tournament-runtime-v1" && runtime.lifecycle === "ACTIVE" &&
    /^\d{4}$/.test(runtime.tournamentId) && runtime.tournamentYear === Number(runtime.tournamentId) &&
    Number.isSafeInteger(runtime.pointerRevision) && runtime.pointerRevision > 0 &&
    Number.isSafeInteger(runtime.lifecycleRevision) && runtime.lifecycleRevision > 0;
  const scoringCompatible = compatible && env.SCORING_AUTHORITY === "supabase" &&
    env.SCORING_READ_SOURCE === "supabase" && env.MATCH_AUTHORIZATION_SOURCE === "supabase" &&
    read.scoring_authority === "SUPABASE" && admission.authority === "SUPABASE" &&
    read.scoring_ingress_enabled === true && admission.scoring_ingress_enabled === true &&
    admission.execution_gate === "OPEN" && admission.maintenance_state === "NORMAL" &&
    env.PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED === "true";
  return { compatible, scoringCompatible, maintenance: admission?.maintenance_state !== "NORMAL", runtime: Object.freeze({ ...runtime }) };
}
