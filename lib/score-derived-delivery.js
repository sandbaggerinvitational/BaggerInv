import { createHash, randomUUID } from 'node:crypto';
import { classifyDerivedFailure } from './score-derived-worker.js';
import { recalculateCompetitionDerivedTournament } from './competition-derived-supabase.js';
import { recalculateIntelligenceDerivedTournament } from './intelligence-derived-supabase.js';

/** Same worker orchestration for the supported runner and isolated SQL proofs.
 * Dependency seams replace transport only; authorization and calculations remain
 * in the existing processor functions. No financial approval operation is exposed. */
export function createScoreDerivedDeliveryAdapter({ rpc, env = process.env,
  resolveContext, financialOptions = {}, reads = {} } = {}) {
  if (typeof rpc !== 'function' || typeof resolveContext !== 'function') throw new TypeError('DERIVED_DELIVERY_ADAPTER_REQUIRED');
  const contexts = new WeakMap();
  const tick = async ({ workerId, operationId }) => {
    const context = await resolveContext();
    let result; let materialized = 0;
    // Each RPC commits its own family locks before the next family starts.
    // Maximum SQL budget is three sequential 5s calls, never a score transaction.
    for (const family of ['CALCUTTA', 'NET_SKINS', 'COMPETITION']) {
      const response = await rpc('score_derived_delivery_tick_v1', {
        contract_version: 'score-derived-delivery-v1', worker_id: workerId,
        operation_id: randomUUID(), cycle_operation_id: operationId, materialization_family: family,
      }, { env, scoringDispatchContext: context, timeoutMs: 5000 });
      result = response?.payload || response;
      if (result?.ok !== true) throw Object.assign(new Error('DERIVED_TICK_FAILED'), { code: result?.code || 'DERIVED_TICK_FAILED' });
      materialized += result.materialized || 0;
      if (result.cancelled || result.statusIncomplete) break;
    }
    result = { ...result, materialized };
    contexts.set(result, context);
    return result;
  };
  const common = (workerId, tickResult) => ({ env, workerId, scoringDispatchContext: contexts.get(tickResult),
    productionScoringOperationsRpc: rpc, debounceMs: 0, ...reads });
  const processors = {
    CALCUTTA: async ({ workerId, operationId, tickResult }) => {
      const current = tickResult.calcutta;
      if (!(current?.configurationRevision > 0 && current.auctionRevision > 0)) return { ok: true, skipped: true };
      const { processProductionCalcuttaV1Job } = await import('./production-calcutta-server.js');
      return processProductionCalcuttaV1Job({
        expectedConfigurationRevision: current.configurationRevision,
        expectedConfigurationFingerprint: current.configurationFingerprint,
        expectedAuctionRevision: current.auctionRevision,
        expectedAuctionFingerprint: current.auctionFingerprint,
        workerId, requestFingerprint: createHash('sha256').update(operationId).digest('hex'),
      }, { ...financialOptions, env, scoringDispatchContext: contexts.get(tickResult) });
    },
    COMPETITION: async ({ workerId, tickResult }) => {
      const result = await recalculateCompetitionDerivedTournament(tickResult.scope.tournamentId, common(workerId, tickResult));
      return { ok: true, skipped: result.skipped === true };
    },
    INTELLIGENCE: async ({ workerId, tickResult }) => {
      const result = await recalculateIntelligenceDerivedTournament(tickResult.scope.tournamentId, common(workerId, tickResult));
      return { ok: true, skipped: result.skipped === true };
    },
  };
  for (const [family, process] of Object.entries(processors)) {
    processors[family] = async args => {
      try { return await process(args); } catch (error) {
        if (!args.signal?.aborted) {
          const failure = classifyDerivedFailure(error);
          try { const acknowledgement = await rpc('fail_score_derived_preclaim_v1', {
            contract_version: 'score-derived-delivery-v1', worker_id: args.workerId, family,
            work: (args.tickResult.work || []).filter(item => item.family === family),
            error_code: failure.sqlstate || failure.code,
          }, { env, scoringDispatchContext: contexts.get(args.tickResult), timeoutMs: 5000 });
            if ((acknowledgement?.payload || acknowledgement)?.ok !== true) {
              throw Object.assign(new Error('DERIVED_FAILURE_ACK_INVALID'), { code: 'DERIVED_FAILURE_ACK_INVALID' });
            }
          } catch (acknowledgementError) {
            error.deliveryFailureUnrecorded = true;
            error.deliveryAcknowledgementFailure = classifyDerivedFailure(acknowledgementError);
          }
        }
        throw error;
      }
    };
  }
  return { tick, processors };
}

export async function createCurrentScoreDerivedDeliveryAdapter(options = {}) {
  const { productionScoringOperationsRpc, resolveProductionScoringDispatchContext } =
    await import('./production-scoring-operations-server.js');
  const env = options.env || process.env;
  return createScoreDerivedDeliveryAdapter({ env, rpc: productionScoringOperationsRpc,
    resolveContext: () => resolveProductionScoringDispatchContext({ env, requiredPhase: 'WORKERS' }) });
}
