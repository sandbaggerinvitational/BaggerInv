import { randomUUID } from 'node:crypto';

export const AUTOMATIC_DERIVED_FAMILIES = Object.freeze(['CALCUTTA', 'COMPETITION', 'INTELLIGENCE']);
const SQLSTATE = /^[A-Z0-9]{5}$/;
const CONNECTION_CODES = new Set(['ECONNRESET','ECONNREFUSED','ECONNABORTED','EHOSTUNREACH','ENETUNREACH',
  'ENOTFOUND','EAI_AGAIN','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
export function classifyDerivedFailure(error) {
  const candidates = [error?.sqlstate, error?.diagnostics?.code, error?.cause?.code, error?.code]
    .map(value => String(value || '').toUpperCase());
  const state = candidates.find(value => SQLSTATE.test(value) && !CONNECTION_CODES.has(value)) || null;
  const rawCode = String(error?.code || error?.name || 'DERIVED_WORKER_FAILED').toUpperCase();
  const retryableState = state && (['40001', '40P01', '57014', '55P03'].includes(state) || /^08[A-Z0-9]{3}$/.test(state));
  // Explicit database failures take priority over their HTTP envelope. Only known
  // transport failures are transient; an arbitrary TypeError is deterministic.
  const transport = !state && (candidates.some(value => CONNECTION_CODES.has(value))
    || [408,429,502,503,504].includes(Number(error?.status || error?.diagnostics?.status)));
  const retryable = Boolean(retryableState || transport || (!state
    && /(?:TIMEOUT|CONNECTION|TRANSPORT|FETCH_FAILED|LEASE_EXPIRED|ABORTERROR|TIMEOUTERROR)/.test(rawCode)));
  const code = transport ? 'CONNECTION_FAILED' : rawCode;
  return Object.freeze({ classification: retryable ? 'RETRYABLE' : 'TERMINAL', sqlstate: state,
    code: /^[A-Z0-9_]{1,120}$/.test(code) ? code : 'DERIVED_WORKER_FAILED' });
}
export function derivedFailureCode(error) {
  const failure = classifyDerivedFailure(error);
  return failure.sqlstate || failure.code;
}
function abortableDelay(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/** Supported process-lifetime polling loop. Transport and processors retain their
 * existing runtime authorization. This function never publishes or configures a
 * financial product; Net Skins remains an explicit owner-controlled operation. */
export async function runScoreDerivedWorker({ signal, intervalMs = 250, tick,
  processors, emit = () => {}, workerId = `score-derived-${randomUUID()}`,
  maximumCycles = Infinity } = {}) {
  if (typeof tick !== 'function' || !processors || typeof processors !== 'object'
      || !Number.isInteger(intervalMs) || intervalMs < 10 || intervalMs > 60_000
      || (maximumCycles !== Infinity && (!Number.isSafeInteger(maximumCycles) || maximumCycles < 1))
      || !/^[A-Za-z0-9_.:-]{1,160}$/.test(workerId)) throw new TypeError('DERIVED_WORKER_OPTIONS_INVALID');
  for (const family of AUTOMATIC_DERIVED_FAMILIES) {
    if (typeof processors[family] !== 'function') throw new TypeError(`DERIVED_PROCESSOR_REQUIRED_${family}`);
  }
  let cycles = 0, tickFailures = 0;
  const report = event => {
    try {
      const pending = emit(Object.freeze({ observedAt: Date.now(), ...event }));
      // Optional exporters cannot delay a claim or turn a rejected Promise into
      // an unhandled process failure. Invocation remains fire-and-forget.
      if (pending && typeof pending.then === 'function') Promise.resolve(pending).catch(() => {});
    } catch { /* Optional telemetry cannot break delivery. */ }
  };
  report({ type: 'started', workerId });
  while (!signal?.aborted && cycles < maximumCycles) {
    const operationId = randomUUID();
    try {
      const tickStartedAt = Date.now();
      const tickResult = await tick({ workerId, operationId, signal });
      if (tickResult?.ok !== true || !tickResult.ready || typeof tickResult.ready !== 'object') {
        const error = new Error('DERIVED_TICK_RESPONSE_INVALID'); error.code = 'DERIVED_TICK_RESPONSE_INVALID'; throw error;
      }
      tickFailures = 0;
      report({ type: 'tick', cycle: cycles, tickStartedAt, materialized: Number(tickResult.materialized || 0),
        terminal: Number(tickResult.terminal || 0), cancelled: tickResult.cancelled === true, statusIncomplete: tickResult.statusIncomplete === true, blockedAutomatic: Number(tickResult.blockedAutomatic || 0), pendingAutomatic: Number(tickResult.pendingAutomatic || 0), activeLeases: Number(tickResult.activeLeases || 0), ready: Object.fromEntries(AUTOMATIC_DERIVED_FAMILIES.map(family => [family,tickResult.ready[family] === true])), waitingOwner: Number(tickResult.waitingOwner?.NET_SKINS || 0), waitingPublication: Number(tickResult.waitingPublication?.FINAL_RECAP || 0) });
      for (let offset = 0; offset < AUTOMATIC_DERIVED_FAMILIES.length && !signal?.aborted; offset++) {
        const family = AUTOMATIC_DERIVED_FAMILIES[(cycles + offset) % AUTOMATIC_DERIVED_FAMILIES.length];
        if (tickResult.ready[family] !== true) continue;
        try {
          const result = await processors[family]({ workerId, operationId: randomUUID(), tickResult, signal });
          if (result?.ok !== true && result?.skipped !== true) {
            const error = new Error('DERIVED_PROCESSOR_RESPONSE_INVALID'); error.code = 'DERIVED_PROCESSOR_RESPONSE_INVALID'; throw error;
          }
          report({ type: 'processed', family, empty: result.empty === true || result.skipped === true });
        } catch (error) {
          if (signal?.aborted) break;
          report({ type: 'failed', family, ...classifyDerivedFailure(error) });
          if (error.deliveryFailureUnrecorded) {
            report({ type: 'halted', family, reason: 'FAILURE_ACKNOWLEDGEMENT_UNAVAILABLE' });
            return { ok: false, halted: true, cycles, family, code: 'FAILURE_ACKNOWLEDGEMENT_UNAVAILABLE' };
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) break;
      const failure = classifyDerivedFailure(error); tickFailures++;
      report({ type: 'tick-failed', attempt: tickFailures, ...failure });
      if (failure.classification === 'TERMINAL' || tickFailures >= 5) {
        report({ type: 'halted', reason: failure.classification === 'TERMINAL' ? 'TERMINAL_TICK_FAILURE' : 'TICK_RETRY_EXHAUSTED', attempts: tickFailures });
        return { ok: false, halted: true, cycles, attempts: tickFailures, ...failure };
      }
    }
    cycles++;
    if (!signal?.aborted && cycles < maximumCycles) await abortableDelay(tickFailures ? Math.min(300_000, 1000 * 2 ** tickFailures) : intervalMs, signal);
  }
  report({ type: 'stopped', cycles });
  return { ok: true, cycles };
}
