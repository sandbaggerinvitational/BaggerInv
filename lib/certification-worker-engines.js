// Closed server registry. Queue payloads never choose engines; BEGIN returns
// the scope committed by owner START and bound into the reservation digest.
export const CALCUTTA_SCOPE_CONTRACT = 'certification-queue-calcutta-scope-v1';
export const CERTIFICATION_WORKER_ENGINES = Object.freeze([
  'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
  'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL', 'CALCUTTA',
]);
export function certificationCalcuttaAdmitted(admission) {
  if (admission.engine_scope_contract === undefined) return false;
  if (admission.engine_scope_contract !== CALCUTTA_SCOPE_CONTRACT
      || !Array.isArray(admission.engines)
      || admission.engines.length !== CERTIFICATION_WORKER_ENGINES.length
      || admission.engines.some((engine, index) => engine !== CERTIFICATION_WORKER_ENGINES[index])) {
    throw Object.assign(new Error('SUPERVISOR_ENGINE_SCOPE_DENIED'),
      {code:'SUPERVISOR_ENGINE_SCOPE_DENIED',status:403});
  }
  return true;
}
