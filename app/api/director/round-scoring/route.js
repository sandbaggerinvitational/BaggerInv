import { NextResponse } from 'next/server';
import { authorizePreviewDirector } from '../../../../lib/preview-director-authorization.js';
import { assertProductionCutoverActivation, assertProductionCutoverRequest } from '../../../../lib/production-cutover-activation-contract.js';
import { productionScoringOperationsRpc } from '../../../../lib/production-scoring-operations-server.js';
import { roundScoringInput } from '../../../../lib/production-round-scoring-contract.js';
import { withDataAuthorityRequestScope, dataAuthorityResponseHeaders } from '../../../../lib/data-authority-request.js';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body, status = 200, extra = {}) => NextResponse.json(body, { status, headers: { ...headers, ...extra } });
async function handle(request, mutation) {
  if (process.env.VERCEL_ENV !== 'production') return reply({ error: 'Not found.' }, 404);
  try {
    assertProductionCutoverActivation({ requiredPhase: mutation ? 'SCORING_COMMIT' : 'CURRENT_READS' });
    if (mutation) assertProductionCutoverRequest(request, process.env, { requireOrigin: true });
  } catch { return reply({ error: 'Round scoring controls are unavailable.' }, 403); }
  const access = await authorizePreviewDirector({ request, env: process.env, allowBootstrap: false });
  if (access.status !== 'active' || access.source !== 'production-director-entitlement') return reply({ error: 'Active Tournament Director access is required.', code: 'DIRECTOR_AUTHORIZATION_REQUIRED' }, access.status === 'unavailable' ? 503 : 403);
  try {
    const raw = mutation ? await request.json() : { round: Number(new URL(request.url).searchParams.get('round')) };
    const input = roundScoringInput(raw, { authUserId: access.identity?.authUserId, playerId: access.identity?.actor?.id || access.identity?.player?.id }, mutation);
    const scoped = await withDataAuthorityRequestScope({ label: 'production-round-scoring', source: 'supabase-production-round-scoring-v1' },
      () => productionScoringOperationsRpc(mutation ? 'mutate_production_round_scoring_v1' : 'read_production_round_scoring_v1', input));
    const payload = scoped.result.payload;
    if (!payload || typeof payload.ok !== 'boolean') throw new Error('INVALID_RESPONSE');
    return reply(payload, payload.ok ? 200 : 409, dataAuthorityResponseHeaders(scoped.diagnostics));
  } catch (error) {
    if (error.code === 'ROUND_INPUT_INVALID') return reply({ error: error.message, code: error.code }, 400);
    // A timeout may follow commit. Never claim rollback without a database denial.
    return reply({ error: mutation ? 'The outcome is not confirmed. Refresh authoritative state before another action.' : 'Round state is temporarily unavailable.', code: mutation ? 'ROUND_OUTCOME_UNKNOWN' : 'ROUND_READ_UNAVAILABLE' }, 503);
  }
}
export const GET = request => handle(request, false);
export const POST = request => handle(request, true);
