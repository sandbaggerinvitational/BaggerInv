import { MobileApiError } from './mobile-api-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contexts = new WeakSet();
const GENERAL = new Set(['session','today','matches','leaders','odds','net-skins','calcutta','history','records','schedule','guide','portrait-policy']);

// A client role/flag cannot construct this authority. Only the server's canonical
// entitlement response enters this boundary, after Supabase getUser verification.
export function canonicalReviewerContext(value, { authUserId, tournamentId, now = Date.now() } = {}) {
  if (!value || value.kind !== 'observer' || !UUID.test(authUserId || '') ||
      value.authUserId !== authUserId || value.tournament?.id !== tournamentId ||
      value.active !== true || !Number.isSafeInteger(value.contextRevision) || value.contextRevision < 1 ||
      !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now ||
      value.playerId != null || value.team != null || value.membership != null || value.admin !== false || value.scoring !== false) {
    throw new MobileApiError('PARTICIPANT_NOT_FOUND');
  }
  const context = Object.freeze({kind:'observer',authUserId,tournament:Object.freeze({...value.tournament}),
    active:true,contextRevision:value.contextRevision,expiresAt:value.expiresAt,
    historicalFixture:reviewerHistoricalFixture(value.historicalFixture),admin:false,scoring:false});
  contexts.add(context);
  return context;
}

export function isCanonicalReviewer(context) { return contexts.has(context); }
export function reviewerRevision(context) {
  if (!isCanonicalReviewer(context)) throw new MobileApiError('AUTH_CERTIFICATION_FAILED');
  return JSON.stringify([context.authUserId,context.tournament.id,context.contextRevision,context.expiresAt]);
}
export function requireReviewerRead(context, { method = 'GET', surface, matchId = null, historicalFixture = null, now = Date.now() } = {}) {
  if (!isCanonicalReviewer(context) || Date.parse(context.expiresAt) <= now || method !== 'GET') {
    throw new MobileApiError('PARTICIPANT_NOT_FOUND');
  }
  if (GENERAL.has(surface) && matchId === null) return;
  if (['match-detail','scorecard'].includes(surface)) {
    if (sameReviewerHistoricalFixture(context.historicalFixture,historicalFixture) && matchId === context.historicalFixture.matchId) return;
    // Resource withdrawal does not revoke an otherwise valid reviewer session.
    throw new MobileApiError('MATCH_NOT_FOUND');
  }
  throw new MobileApiError('PARTICIPANT_NOT_FOUND');
}

export async function readCanonicalReviewer({ authUserId, tournamentId }, { env = process.env, client, now } = {}) {
  if (env.VERCEL_ENV !== 'production') return null;
  const admin = client || (await import('./production-participant-auth-enrollment.js')).createProductionParticipantAuthAdminClient(env);
  const {data,error} = await admin.rpc('read_native_review_context_v1',{target_auth_user_id:authUserId,target_tournament_id:tournamentId});
  if (error) throw new MobileApiError('MOBILE_API_UNAVAILABLE');
  if (data?.ok === false && data?.code === 'REVIEW_ACCESS_UNAVAILABLE') return null;
  // Fixture outages must not prevent identity admission. Each fixture read
  // independently revalidates this capability before returning protected data.
  let historicalFixture = null;
  try {
    const fixture = await admin.rpc('read_native_review_history_fixture_v1',{target_auth_user_id:authUserId,target_tournament_id:tournamentId});
    if (!fixture.error && fixture.data?.ok === true) historicalFixture = reviewerHistoricalFixture(fixture.data.data);
  } catch { /* Identity remains valid; the optional read capability is unavailable. */ }
  return canonicalReviewerContext({...data?.data,historicalFixture},{authUserId,tournamentId,now});
}

export async function reviewerOtp(operation, input, {env=process.env,client}={}) {
  if (env.VERCEL_ENV !== 'production') return {handled:false};
  const admin=client || (await import('./production-participant-auth-enrollment.js')).createProductionParticipantAuthAdminClient(env);
  const {data,error}=await admin.rpc('native_review_otp_v1',{operation,input});
  if(error || typeof data?.handled !== 'boolean') throw new MobileApiError('MOBILE_API_UNAVAILABLE');
  return data;
}

export function reviewerHistoricalFixture(value) {
  if (!value || typeof value.tournamentId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.tournamentId) ||
      !Number.isInteger(value.year) || value.year < 2017 || value.year > 2025 ||
      !UUID.test(value.revisionId || '') || typeof value.matchId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(value.matchId) ||
      !Number.isSafeInteger(value.bindingRevision) || value.bindingRevision < 1) return null;
  return Object.freeze({tournamentId:value.tournamentId,year:value.year,revisionId:value.revisionId,
    matchId:value.matchId,bindingRevision:value.bindingRevision});
}
export function sameReviewerHistoricalFixture(a,b) {
  const left=reviewerHistoricalFixture(a),right=reviewerHistoricalFixture(b);
  return left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right);
}
