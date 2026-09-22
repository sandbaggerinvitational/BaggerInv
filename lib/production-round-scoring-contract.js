const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const ROUND_OPERATIONS = Object.freeze(['OPEN', 'LOCK', 'RESUME']);
export function roundScoringInput(input, identity, mutation = false) {
  const keys = mutation ? ['round', 'operation', 'operationId', 'expectedFingerprint'] : ['round'];
  const invalid = () => { throw Object.assign(new Error('Refresh the round and review this action again.'), { code: 'ROUND_INPUT_INVALID', status: 400 }); };
  if (!input || Object.keys(input).some(key => !keys.includes(key)) || !Number.isInteger(input.round) || input.round < 1 || input.round > 3) invalid();
  if (!identity?.authUserId || !identity?.playerId) invalid();
  if (mutation && (!ROUND_OPERATIONS.includes(input.operation) || !UUID.test(input.operationId || '') || !/^[a-f0-9]{64}$/.test(input.expectedFingerprint || ''))) invalid();
  return { tournament_id: '2026', round: input.round,
    authorization: { tournament_id: '2026', auth_user_id: identity.authUserId, player_id: identity.playerId, role: 'DIRECTOR' },
    ...(mutation ? { operation: input.operation, operation_id: input.operationId, expected_fingerprint: input.expectedFingerprint } : {}) };
}
