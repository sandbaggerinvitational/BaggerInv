import { MobileApiError } from './mobile-api-v1.js';
import { requireMobileProductionReadContext } from './mobile-v1-production-read-context.js';

const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const revision = value => Number.isSafeInteger(value) && value >= 0;

export function validatePortraitPolicy(value) {
  if (!exactKeys(value, ['contractVersion','revision','players']) ||
      value.contractVersion !== 'player-portrait-policy-v1' || !revision(value.revision) ||
      !Array.isArray(value.players) || value.players.length > 4096 ||
      new Set(value.players.map(p => p?.playerId)).size !== value.players.length ||
      value.players.some(p => !exactKeys(p,['playerId','policy','revision']) ||
        typeof p.playerId !== 'string' || !id.test(p.playerId) || !revision(p.revision) ||
        p.revision > value.revision || !['ACTIVE','SUPPRESSED'].includes(p.policy) ||
        (p.policy === 'ACTIVE' ? p.revision !== 0 : p.revision === 0))) {
    throw new MobileApiError('MOBILE_API_UNAVAILABLE');
  }
  return value;
}

export async function mobilePortraitPolicyResult(identity, {env=process.env,dependencies={}}={}) {
  if (env.VERCEL_ENV !== 'production') throw new MobileApiError('MOBILE_API_UNAVAILABLE');
  const runtime = await requireMobileProductionReadContext(identity,{env,dependencies});
  const client = dependencies.client ||
    (await import('./production-participant-auth-enrollment.js')).createProductionParticipantAuthAdminClient(env);
  const {data,error} = await client.rpc('read_player_portrait_policy_v1');
  if (error) throw new MobileApiError('MOBILE_API_UNAVAILABLE');
  const policy = validatePortraitPolicy(data);
  await requireMobileProductionReadContext(identity,{env,dependencies,expectedRuntime:runtime});
  return {status:200,body:policy};
}
