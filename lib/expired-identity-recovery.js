// Operator plan contract only. No transport, public endpoint, credential or OTP.
export const EXPIRED_IDENTITY_REASON = 'EXPIRED_PROVIDER_CONFIRMED_CERTIFICATION_PENDING';
export const EXPIRED_IDENTITY_COPY = Object.freeze({
  title: 'Identity setup incomplete',
  reason: 'Email was verified, but Bagger account linking did not complete.',
  action: 'Protected recovery required.',
  complete: 'Email identity linked',
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function reviewedExpiredIdentityPlan({ approvalId, playerId, authUserId, historicalRequestId,
  actorPlayerId, actorAuthUserId, expectedState, expiresAt }, now = Date.now()) {
  if (![approvalId,authUserId,historicalRequestId,actorAuthUserId].every(x=>typeof x==='string' && uuid.test(x)) ||
      !['HM01','NJ01'].includes(playerId) || !/^[A-Z0-9]{2,16}$/.test(actorPlayerId || '') ||
      expectedState?.class!==EXPIRED_IDENTITY_REASON || expectedState?.state!=='PENDING' ||
      expectedState?.authority?.playerId!==playerId || expectedState?.authority?.authUserId!==authUserId ||
      expectedState?.authority?.historicalRequestId!==historicalRequestId ||
      !/^[0-9a-f]{64}$/.test(expectedState?.authority?.emailHash || '') ||
      !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=now || Date.parse(expiresAt)>now+900000) {
    throw new Error('EXPIRED_IDENTITY_REVIEW_REQUIRED');
  }
  // Expected state must be the exact protected DB inspection. SQL revalidates
  // it at registration AND execution; client-side checking is not authority.
  return Object.freeze({contract:'expired-provider-confirmed-identity-recovery-v1',approvalId,playerId,
    authUserId,historicalRequestId,actorPlayerId,actorAuthUserId,
    reasonCode:'OWNER_REVIEWED_INCOMPLETE_EMAIL_CERTIFICATION',
    expectedState:structuredClone(expectedState),expiresAt:new Date(expiresAt).toISOString()});
}
