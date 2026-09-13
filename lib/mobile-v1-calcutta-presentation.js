import { canonicalCalcuttaDecimal } from './production-calcutta-v1.js';

// Serialization of an already validated, published participant result only.
// No ranking, payout, pair-award reconstruction, private configuration or QA input.
export function productionCalcuttaPresentation(contract, rawResult, viewerPlayerId) {
  if (!['AUCTION_COMPLETE','IN_PROGRESS','OFFICIAL'].includes(contract.state) || !contract.published || contract.publicationState !== 'PUBLISHED' ||
      !contract.market || !contract.result || !rawResult) return null;
  if (rawResult.distributedPrizePool == null || rawResult.guaranteedDistributed == null) return null;
  const formats = { BB: 'Best Ball', SC: 'Scramble', SI: 'Singles' };
  const rounds = contract.result.completedRounds.map(round => {
    const rows = contract.result.golfers.flatMap(g => g.rounds.filter(r => r.roundNumber === round));
    const format = rows[0]?.format;
    if (!formats[format] || rows.length !== contract.result.golfers.length || rows.some(r => r.format !== format)) {
      throw new Error('Published Calcutta round binding is invalid.');
    }
    return { round, format, formatDisplayName: formats[format],
      scope: format === 'SC' ? 'TEAM' : 'PLAYER',
      scoringBasis: format === 'SC' ? 'TEAM_FULL_NET' : 'INDIVIDUAL_FULL_NET',
      readiness: 'CALCULATED', allMatchesOfficial: true };
  });
  return {
    contractVersion: 'production-calcutta-presentation-v1',
    calculationVersion: 'canonical-published-result',
    tournamentId: contract.tournamentId, viewerPlayerId,
    currencyCode: contract.currencyCode, publicationState: 'PUBLISHED', published: true,
    productionState: contract.state, purpose: 'CANONICAL_PUBLISHED_PARTICIPANT_RESULT',
    configurationRevision: contract.configurationRevision,
    configurationFingerprint: contract.configurationFingerprint,
    valueBasis: 'CANONICAL_PUBLISHED_RESULT',
    market: contract.market,
    financialSummary: {
      projectedPool: canonicalCalcuttaDecimal(rawResult.distributedPrizePool),
      guaranteedAllocation: canonicalCalcuttaDecimal(rawResult.guaranteedDistributed),
    },
    rounds, entries: [], result: contract.result,
  };
}
