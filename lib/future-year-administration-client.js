// The Director annual capability has one canonical endpoint and no provider fallback.
import {
  buildFutureRuntimeMutation,
  buildFutureYearAdministrationMutation,
  PRODUCTION_FUTURE_RUNTIME_ACTIONS,
} from './production-future-year-administration-contract.js';

export const FUTURE_YEAR_ADMINISTRATION_ENDPOINT = '/api/director/future-tournaments';

function failure(code, message, operationRequestId) {
  return Object.assign(new Error(message), {code, operationRequestId});
}

export async function submitFutureYearAdministration(review, {fetchImpl = fetch} = {}) {
  const {action, expectedRevision, operationRequestId, values = {}} = review || {};
  const runtimeAction = PRODUCTION_FUTURE_RUNTIME_ACTIONS.includes(action);
  const globalCourseAction = action === 'add-global-course' || action === 'configure-global-course-context';
  const builder = runtimeAction ? buildFutureRuntimeMutation : buildFutureYearAdministrationMutation;
  // Validate at the actual client boundary; the server independently rebuilds
  // scope and authority. Browser fields never establish Director entitlement.
  builder(action, {...values, expectedRevision, operationRequestId});
  let response;
  try {
    response = await fetchImpl(FUTURE_YEAR_ADMINISTRATION_ENDPOINT, {
      method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'},
      body: JSON.stringify({...values, action, expectedRevision, operationRequestId}),
    });
  } catch {
    throw failure('FUTURE_YEAR_OUTCOME_UNKNOWN',
      'The annual change may have committed. Retry the same reviewed operation to resolve its outcome.', operationRequestId);
  }
  const payload = await response.json().catch(() => ({}));
  if (response.ok && (payload.ok !== true || !payload.data)) {
    throw failure('FUTURE_YEAR_OUTCOME_UNKNOWN',
      'The annual change may have committed, but its response was incomplete. Retry the same reviewed operation to resolve its outcome.', operationRequestId);
  }
  if (!response.ok) {
    throw failure(payload.code || 'FUTURE_YEAR_OPERATION_FAILED',
      payload.error || 'The Future Tournament change did not complete.', operationRequestId);
  }
  const receipt = payload.data;
  const targetId = String(values.targetTournamentId || '');
  if ((!globalCourseAction && receipt.targetTournamentId !== targetId) ||
      (globalCourseAction && (!receipt.courseId || (action === 'configure-global-course-context' &&
        (receipt.courseId !== values.courseId || receipt.teeId !== values.teeId))))) {
    throw failure('FUTURE_YEAR_RESPONSE_INVALID', 'The annual receipt does not match the reviewed tournament.', operationRequestId);
  }
  // Receipt success alone cannot make the UI show completed initialization.
  // Keep the same operation ID on failure so a retry reconciles the commit.
  let readback;
  try {
    readback = await fetchImpl(`${FUTURE_YEAR_ADMINISTRATION_ENDPOINT}?targetTournamentId=${encodeURIComponent(targetId)}`, {
      cache: 'no-store', credentials: 'same-origin',
    });
  } catch {
    throw failure('FUTURE_YEAR_CANONICAL_READBACK_REQUIRED',
      'The annual change may have committed. Retry the same reviewed operation to confirm canonical state.', operationRequestId);
  }
  const current = await readback.json().catch(() => ({}));
  const selected = current.data?.selectedTournament;
  if (!readback.ok || current.ok !== true || selected?.tournamentId !== targetId ||
      selected.tournamentYear !== Number(targetId) || !Number.isSafeInteger(selected.revision) ||
      (!runtimeAction && selected.revision < receipt.revision)) {
    throw failure('FUTURE_YEAR_CANONICAL_READBACK_REQUIRED',
      'The change may have committed. Retry the same reviewed operation to confirm canonical annual state.', operationRequestId);
  }
  if (globalCourseAction) {
    const course = current.data.futureRuntime?.courseCatalog?.find(item => item.courseId === receipt.courseId);
    const context = course?.teeContexts?.find(item => item.teeId === receipt.teeId);
    if (!course || (action === 'configure-global-course-context' &&
        (!context || context.contextRevision < receipt.contextRevision || context.holeCount !== 18 || !context.scoringReady))) {
      throw failure('FUTURE_YEAR_CANONICAL_READBACK_REQUIRED',
        'The course change may have committed. Retry the same reviewed operation to confirm its canonical course context.', operationRequestId);
    }
  }
  return Object.freeze({receipt, data: current.data});
}
