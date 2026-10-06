// Server-only, fixed Certification Director adapter. Calculation/claims and
// publication stay in the shipping processor and its existing canonical cores.
import "server-only";
import {createHash} from "node:crypto";
import {certificationOperationRpc} from "./certification-runtime-server.js";
import {processProductionNetSkinsV1Job} from "./production-net-skins-server.js";

const FAMILY = "NET_SKINS_CALCULATION";
const CONTRACT = "isolated-director-operations-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const error = (code, status = 409, extra = {}) => Object.assign(new Error("Net Skins calculation could not be confirmed."), {code, status, ...extra});
const digest = text => createHash("sha256").update(text).digest("hex");
const phaseId = (id, phase) => {
  const h = digest(`${id}\n${phase}`).slice(0,32).split(""); h[12]="4"; h[16]="8";
  const s=h.join(""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
};
function command(input) {
  if (!object(input) || Object.keys(input).some(k => !["mode","family","action","payload","operationRequestId","expectedContextToken"].includes(k))
    || input.family !== FAMILY || input.action !== "calculate" || !UUID.test(input.operationRequestId || "")
    || !HASH.test(input.expectedContextToken || "") || !object(input.payload)
    || Object.keys(input.payload).some(k => !["expectedConfigurationRevision","entryRevisions","sourceFingerprints"].includes(k))) {
    throw error("DIRECTOR_OPERATIONS_INPUT_INVALID",400);
  }
  const p=input.payload;
  if (!Number.isSafeInteger(p.expectedConfigurationRevision) || p.expectedConfigurationRevision < 1
    || !object(p.entryRevisions) || !object(p.sourceFingerprints)
    || !Object.keys(p.entryRevisions).length || Object.keys(p.entryRevisions).length > 3
    || Object.keys(p.sourceFingerprints).length !== Object.keys(p.entryRevisions).length
    || Object.entries(p.entryRevisions).some(([k,v]) => !/^[123]$/.test(k) || !Number.isSafeInteger(v) || v < 1 || !HASH.test(p.sourceFingerprints[k] || ""))) {
    throw error("DIRECTOR_OPERATIONS_INPUT_INVALID",400);
  }
  return {expected_configuration_revision:p.expectedConfigurationRevision,entry_revisions:p.entryRevisions,source_fingerprints:p.sourceFingerprints};
}
function neutralContext(bound) {
  const c=bound.certificationContext;
  return {contract:CONTRACT,bindingId:c.binding_id,contextToken:c.context_token,tournamentId:c.tournament_id,
    governanceTournamentId:c.governance_tournament_id,activationRevision:c.activation_revision,
    admissionRevision:c.admission_revision,authorityEpochId:c.authority_epoch_id,releaseCommit:c.release_commit};
}
function base(bound) {
  return {ok:true,contract:CONTRACT,authority:"supabase",fallbackUsed:false,googleRequests:0,family:FAMILY,context:neutralContext(bound)};
}
function options(bound,env,operationRequestId,expectedContextToken) {
  return {env,context:bound.certificationContext,authorization:bound.authorization,operationRequestId,expectedContextToken};
}
async function callCanonicalOperation(name,payload,opts,dependencies) {
  try { return await certificationOperationRpc(name,payload,opts,dependencies.certificationDependencies); }
  catch (failure) {
    if (/^DIRECTOR_OPERATIONS_/.test(failure.code || "")) throw failure;
    const code=failure.domainCode ? "DIRECTOR_OPERATIONS_DOMAIN_REJECTED"
      : failure.status === 403 ? "DIRECTOR_OPERATIONS_CONTEXT_REQUIRED"
      : failure.status === 409 ? "DIRECTOR_OPERATIONS_CONTEXT_STALE" : "DIRECTOR_OPERATIONS_UNAVAILABLE";
    throw error(code,failure.status || 503,{domainCode:failure.domainCode,
      databaseSqlstate:failure.databaseSqlstate,diagnostics:failure.diagnostics});
  }
}
function validModel(value, bound) {
  if (value?.ok !== true || !object(value.data) || value.data.tournament_id !== bound.authorization.tournament_id
    || !Number.isSafeInteger(value.data.configuration_revision) || !Array.isArray(value.data.rounds)) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID",503);
  return value.data;
}
export async function readCertificationNetSkinsCalculation({bound,env,dependencies}) {
  const r=await callCanonicalOperation("DIRECTOR.READ_NET_SKINS_CALCULATION",{},options(bound,env),dependencies);
  return {...base(bound),data:validModel(r.payload,bound)};
}
export async function resolveCertificationNetSkinsCalculation({bound,input,env,dependencies}) {
  const payload=command(input);
  const r=await callCanonicalOperation("DIRECTOR.NET_SKINS_CALCULATION_STATUS",payload,
    options(bound,env,input.operationRequestId),dependencies);
  const s=r.payload;
  if (s?.ok !== true || !["COMMITTED","NOT_COMMITTED","UNKNOWN"].includes(s.outcome)
    || (s.outcome === "COMMITTED" ? s.receipt?.ok !== true : s.receipt !== null)) throw error("DIRECTOR_OPERATIONS_RESPONSE_INVALID",503);
  const current=await readCertificationNetSkinsCalculation({bound,env,dependencies});
  return {...base(bound),mode:"status",action:"calculate",operationRequestId:input.operationRequestId,
    outcome:s.outcome,committed:s.outcome === "COMMITTED",receipt:s.receipt,data:current.data,
    readbackVerified:s.outcome === "COMMITTED",calculationState:s.state,
    recovery:s.outcome === "COMMITTED" ? "REFRESH_CURRENT_AUTHORITY" : s.outcome === "NOT_COMMITTED" ? "REVIEW_CURRENT_WORK" : "CHECK_STATUS_RETRY_SAME_OPERATION"};
}
export async function calculateCertificationNetSkins({bound,input,env,dependencies}) {
  const payload=command(input);
  if (input.mode !== undefined || input.expectedContextToken !== bound.certificationContext.context_token) throw error("DIRECTOR_OPERATIONS_CONTEXT_STALE",409);
  const id=input.operationRequestId;
  // The domain request identity is fixed by the owner-visible review ID. It
  // does not change with payload or restart; the canonical receipt rejects a
  // conflicting reuse. Transport stages get deterministic distinct IDs.
  const fingerprint=digest(`certification-net-skins-calculation-v1\n${id.toLowerCase()}`);
  const rpc=async(name,body) => {
    if (name === "inspect_production_cutover_authority") return {payload:{ok:true,authority:"SUPABASE",activation_revision:bound.certificationContext.activation_revision}};
    const stage={claim_production_net_skins_v1_recalculation:"CLAIM",complete_production_net_skins_v1_recalculation:"COMPLETE",fail_production_net_skins_v1_recalculation:"FAIL"}[name];
    if (!stage) throw error("DIRECTOR_OPERATIONS_INPUT_INVALID",403);
    const operation=stage === "CLAIM" ? "DIRECTOR.CALCULATE_NET_SKINS" : `DIRECTOR.NET_SKINS_${stage}`;
    const stagePayload=stage === "CLAIM" ? payload : {...body}; delete stagePayload.expected_activation_revision;
    const r=await callCanonicalOperation(operation,stagePayload,
      options(bound,env,stage === "CLAIM" ? id : phaseId(id,stage),input.expectedContextToken),dependencies);
    // Receipt replay must not reuse a returned live claim token to run the
    // calculator twice. Status resolves an already-completed operation; an
    // incomplete admitted claim remains UNKNOWN until its own lease resolves.
    if (stage === "CLAIM" && r.payload?.idempotent === true) throw error("DIRECTOR_OPERATIONS_RECONCILIATION_REQUIRED",409);
    return r;
  };
  try {
    await processProductionNetSkinsV1Job({expectedConfigurationRevision:payload.expected_configuration_revision,
      workerId:"certification-net-skins-director-v1",requestFingerprint:fingerprint},{env,dependencies:{
      resolveScoringDispatchContext:async()=>({runtime:{tournamentId:bound.authorization.tournament_id}}),getActivation:()=>bound.certificationContext,rpc}});
  } catch (failure) {
    // Completion may have committed before the transport failed. Only the
    // existing domain receipts can decide that; never infer rollback from HTTP.
    const status=await resolveCertificationNetSkinsCalculation({bound,input:{...input,mode:"status"},env,dependencies});
    if (status.outcome === "COMMITTED") return {...status,mode:undefined};
    throw error(/^DIRECTOR_OPERATIONS_[A-Z_]+$/.test(failure.code || "") ? failure.code : "DIRECTOR_OPERATIONS_DOMAIN_REJECTED",
      failure.status || 503,{domainCode:failure.domainCode,outcome:status.outcome,committed:false,
        operationRequestId:id,recovery:status.recovery});
  }
  const status=await resolveCertificationNetSkinsCalculation({bound,input:{...input,mode:"status"},env,dependencies});
  if (status.outcome !== "COMMITTED") throw error("DIRECTOR_OPERATIONS_RECONCILIATION_REQUIRED",503,{outcome:status.outcome,operationRequestId:id});
  return {...status,mode:undefined};
}
