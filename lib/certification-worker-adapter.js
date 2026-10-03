import { randomUUID } from "node:crypto";
import { certificationOperationRpc, resolveCertificationRuntimeContext, assertCertificationRuntimeContext } from "./certification-runtime-server.js";

const OPERATIONS = Object.freeze({score_derived_delivery_tick_v1:"WORKERS.DELIVERY_TICK",fail_score_derived_preclaim_v1:"WORKERS.FAIL_PRECLAIM",
  claim_competition_derived_jobs:"WORKERS.COMPETITION_CLAIM",write_competition_derived_snapshot:"WORKERS.COMPETITION_WRITE",mark_competition_derived_job_failed:"WORKERS.COMPETITION_FAIL",
  claim_intelligence_derived_bundle:"WORKERS.INTELLIGENCE_CLAIM",write_intelligence_derived_bundle:"WORKERS.INTELLIGENCE_WRITE",fail_intelligence_derived_bundle_v1:"WORKERS.INTELLIGENCE_FAIL",
  claim_production_calcutta_v1_recalculation:"WORKERS.CALCUTTA_CLAIM",complete_production_calcutta_v1_recalculation:"WORKERS.CALCUTTA_COMPLETE",fail_production_calcutta_v1_recalculation:"WORKERS.CALCUTTA_FAIL"});
export async function certificationWorkerContext(options = {}) {
  const env = options.env || process.env, dependencies = options.certificationDependencies;
  return options.scoringDispatchContext ? assertCertificationRuntimeContext(options.scoringDispatchContext, {env,phase:"WORKERS"}, dependencies)
    : resolveCertificationRuntimeContext({env,phase:"WORKERS"}, dependencies);
}
export async function certificationWorkerRpc(name, input = {}, options = {}) {
  const operation = Object.hasOwn(OPERATIONS, name) ? OPERATIONS[name] : null;
  if (!operation) throw Object.assign(new Error("Certification worker operation is not admitted."), {code:"CERTIFICATION_OPERATION_FORBIDDEN",status:403});
  const {environment, operation_id: operationId, ...payload} = input;
  // Existing neutral calculation builders still tag their legacy DTO PREVIEW.
  // It is discarded only at this explicit adapter; it never supplies authority.
  if (environment !== undefined && environment !== "PREVIEW") throw Object.assign(new Error("Certification worker payload contains authority."), {code:"CERTIFICATION_INPUT_INVALID",status:400});
  const context = await certificationWorkerContext(options);
  return certificationOperationRpc(operation, payload, {env: options.env, context,
    operationRequestId: operationId || options.operationRequestId || randomUUID()},
    {...options.certificationDependencies, ...(options.fetchImpl ? {fetchImpl:options.fetchImpl} : {}), ...(options.timeoutMs ? {timeoutMs:options.timeoutMs} : {})});
}
