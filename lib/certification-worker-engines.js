// Closed server registry. Queue payloads never choose engines; BEGIN returns
// the scope committed by owner START and bound into the reservation digest.
export const CALCUTTA_SCOPE_CONTRACT = 'certification-queue-calcutta-scope-v1';
export const CERTIFICATION_WORKER_ENGINES = Object.freeze([
  'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
  'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL', 'CALCUTTA',
]);
export const MODEL_D_SCOPE_CONTRACT = 'certification-model-d-execution-v1';
export const MODEL_D_WORKER_ENGINES = Object.freeze([...CERTIFICATION_WORKER_ENGINES, 'TOURNAMENT_FINAL_RECAP']);
export function certificationFinalRecapAdmitted(admission) {
  return admission.engine_scope_contract === MODEL_D_SCOPE_CONTRACT;
}
export function certificationCalcuttaAdmitted(admission) {
  if (admission.engine_scope_contract === undefined) return false;
  const expected = admission.engine_scope_contract === MODEL_D_SCOPE_CONTRACT ? MODEL_D_WORKER_ENGINES : CERTIFICATION_WORKER_ENGINES;
  if (![CALCUTTA_SCOPE_CONTRACT, MODEL_D_SCOPE_CONTRACT].includes(admission.engine_scope_contract)
      || !Array.isArray(admission.engines)
      || admission.engines.length !== expected.length
      || admission.engines.some((engine, index) => engine !== expected[index])) {
    throw Object.assign(new Error('SUPERVISOR_ENGINE_SCOPE_DENIED'),
      {code:'SUPERVISOR_ENGINE_SCOPE_DENIED',status:403});
  }
  return true;
}
