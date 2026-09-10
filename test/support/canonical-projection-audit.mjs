// Local/test infrastructure only. Never import this module from app/ or lib/.
// No environment loading, credential argument, authentication, or remote route.
import { PRODUCTION_SUPABASE_URL } from '../../lib/production-foundation-resource-contract.js';

const READ_RPCS = new Set([
  'read_production_current_tournament_runtime_v1',
  'read_production_cutover_current_view',
  'read_production_cutover_completed_history',
  'read_production_guide_projection',
  'read_production_player_editorial',
  'read_production_draft_view_v1',
  'read_production_net_skins_v1',
  'read_production_calcutta_v1',
  'read_production_cutover_scoring_authority',
  'read_production_cutover_scoring_participant_context',
  'authorize_production_current_match_access_v1',
]);
const CURRENT_SURFACES = new Set([
  'TOURNAMENT_LIVE', 'LEADERBOARDS', 'HISTORY_2026', 'PARTICIPANT_HOME',
  'MY_MATCH', 'GAME_CENTER', 'PARTICIPANT_IDENTITY', 'PUBLISHED_ODDS',
  'GUIDE_COURSE_CONTEXT',
]);
const unavailable = code => Object.assign(new Error(code), { code });

/** Existing services construct authorization headers; this guard never reads them. */
export function readOnlyFetch(transport, { maximumRequests = 128 } = {}) {
  let requests = 0;
  return async (input, init = {}) => {
    // Existing application transport uses URL strings, not opaque Request bodies.
    if (typeof input !== 'string' && !(input instanceof URL)) throw unavailable('AUDIT_REQUEST_DENIED');
    const url = new URL(input);
    const rpc = url.pathname.split('/').at(-1);
    if (url.origin !== PRODUCTION_SUPABASE_URL || url.username || url.password ||
        url.search || url.hash || url.pathname !== `/rest/v1/rpc/${rpc}` ||
        init.method !== 'POST' || !READ_RPCS.has(rpc)) throw unavailable('AUDIT_REQUEST_DENIED');
    let body;
    try { body = JSON.parse(init.body); } catch { throw unavailable('AUDIT_BODY_DENIED'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw unavailable('AUDIT_BODY_DENIED');
    if (rpc === 'read_production_cutover_current_view' &&
        !CURRENT_SURFACES.has(body.input?.surface)) throw unavailable('AUDIT_SURFACE_DENIED');
    if (rpc === 'authorize_production_current_match_access_v1' &&
        // Both return decisions only. The SQL reader takes a shared advisory
        // transaction lock; it does not create a lease or write scoring facts.
        !['VIEW_MATCH', 'VIEW_GAME_CENTER', 'START_SCORING'].includes(body.input?.requested_action)) throw unavailable('AUDIT_ACTION_DENIED');
    if (++requests > maximumRequests) throw unavailable('AUDIT_REQUEST_BUDGET_EXCEEDED');
    return transport(input, { ...init, redirect: 'error' });
  };
}

export const SURFACES = Object.freeze([
  ['session', 'mobile-api-v1', 'mobileSessionResult'],
  ...['today', 'matches', 'leaders', 'schedule'].map(name =>
    [name, 'mobile-v1-tournament-reads', `mobile${name[0].toUpperCase()}${name.slice(1)}Result`]),
  ...['guide', 'passport', 'history', 'records', 'odds', 'net-skins', 'calcutta'].map(name =>
    [name, `mobile-v1-${name}`, `mobile${name.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join('')}Result`]),
  ['scoring-current', 'mobile-v1-scoring', 'mobileScoringCurrentResult'],
  ['match-detail', 'mobile-v1-match-detail', 'mobileMatchDetailResult'],
]);

// Fixed registry; mutation-capable siblings are never selected.
const INPUTS = [
  ['passport', 'secondary-history-service', 'loadSecondaryHistoryModel'],
  ['history', 'completed-history-service', 'loadCompletedHistoryYears'],
  ['records', 'secondary-history-service', 'loadSecondaryHistoryModel'],
  ['odds', 'published-odds-supabase', 'readPublishedOddsView'],
  ['net-skins', 'production-net-skins-v1', 'readProductionNetSkinsV1'],
  ['calcutta', 'production-calcutta-v1', 'readProductionCalcuttaV1'],
  ['guide', 'guide-supabase', 'readGuideProjection'],
];
const load = name => import(`../../lib/${name}.js`);
let running = false;

/** Run in a dedicated process. Restores the process fetch even after failure. */
async function guarded(work, transport) {
  if (running) throw unavailable('AUDIT_ALREADY_RUNNING');
  running = true;
  const previous = globalThis.fetch;
  globalThis.fetch = readOnlyFetch(transport || (() => { throw unavailable('AUDIT_NETWORK_DISABLED'); }));
  try { return await work(); } finally { globalThis.fetch = previous; running = false; }
}

/** Availability diagnostics only: no raw canonical data or error text is emitted. */
export async function probeCanonicalInputs({ transport } = {}) {
  return guarded(async () => {
    const results = [];
    for (const [surface, module, name] of INPUTS) {
      try {
        const value = await (await load(module))[name]({});
        const present = !value?.skipped && (value?.source === 'supabase' || value?.payload?.ok === true);
        results.push({ surface, function: name, state: present ? 'INPUT_PRESENT_NOT_CERTIFIED' : 'CONTEXT_UNAVAILABLE' });
      } catch {
        results.push({ surface, function: name, state: 'CONTEXT_UNAVAILABLE' });
      }
    }
    return results;
  }, transport);
}

/**
 * identity is supplied by an existing authorized caller; this helper neither
 * constructs identity nor authenticates it. Fixture dependencies are explicitly
 * labeled and never certified as current Production. Only schema-accepted,
 * size-bounded participant DTOs reach the supplied local consumer.
 */
export async function auditParticipantProjections({ identity, dependencies, validate,
  consume = async () => {}, now = new Date(), transport } = {}) {
  if (typeof validate !== 'function') throw unavailable('AUDIT_SCHEMA_VALIDATOR_REQUIRED');
  return guarded(async () => {
    const results = [];
    let assigned = [];
    for (const [surface, module, name] of SURFACES) {
      const matchIds = surface === 'match-detail' ? assigned : [null];
      if (surface === 'match-detail' && !matchIds.length) {
        results.push({ surface, state: 'NO_AUTHORIZED_MATCH_INPUT' });
        continue;
      }
      for (const [index, matchId] of matchIds.entries()) {
        try {
          if (!identity?.context?.membership?.active || !identity?.playerId || !identity?.tournamentId)
            throw unavailable('AUDIT_EXISTING_IDENTITY_REQUIRED');
          if (!dependencies && process.env.VERCEL_ENV !== 'production')
            throw unavailable('AUDIT_EXISTING_PRODUCTION_CONTEXT_REQUIRED');
          const options = { now, ...(dependencies ? { dependencies, env: { VERCEL_ENV: 'production' } } : {}) };
          const fn = (await load(module))[name];
          const result = surface === 'match-detail'
            ? await fn(identity, matchId, options) : await fn(identity, options);
          if (result.status !== 200 || Buffer.byteLength(JSON.stringify(result.body)) > 2_097_152 ||
              !validate(surface, result.body)) throw unavailable('AUDIT_DTO_REJECTED');
          if (surface === 'matches') assigned = result.body.data.matches
            .filter(match => match.authenticatedPlayer?.involved).map(match => match.matchId).slice(0, 24);
          await consume(surface, result.body, index);
          results.push({ surface, index, state: 'DTO_SCHEMA_PASS',
            evidence: dependencies ? 'FIXTURE_DEPENDENCIES' : 'EXISTING_SERVER_CONTEXT' });
        } catch {
          results.push({ surface, index, state: 'UNAVAILABLE_OR_INVALID' });
        }
      }
    }
    return results;
  }, transport);
}
