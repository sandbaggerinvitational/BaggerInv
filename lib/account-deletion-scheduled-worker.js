import { timingSafeEqual } from 'node:crypto';
import { resumeAccountDeletion } from './account-deletion-completion-worker.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store' };

export function authorizedDeletionWorker(request, env) {
  const expected = env.CRON_SECRET;
  const supplied = request.headers.get('authorization') || '';
  if (typeof expected !== 'string' || expected.length < 32) return false;
  const a = Buffer.from(supplied), b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// One bounded batch. Requests/subjects come exclusively from private authority;
// callers cannot supply Auth UUIDs or create deletion requests through this path.
export async function drainAccountDeletions(adminClient) {
  const batch = await adminClient.rpc('claim_account_deletion_batch_v1');
  const items = batch?.data?.items;
  if (batch?.error || !Array.isArray(items) || items.length > 5 ||
      items.some(x => !UUID.test(x?.requestId || '') || !UUID.test(x?.leaseToken || '')) ||
      new Set(items.map(x => x.requestId)).size !== items.length) {
    throw new Error('ACCOUNT_DELETION_BATCH_UNAVAILABLE');
  }
  let completed = 0, pending = 0, retry = 0;
  for (const item of items) {
    let result;
    try {
      result = await resumeAccountDeletion({ requestId: item.requestId }, { adminClient });
    } catch {
      // No raw provider error, account identity, or contact data in output/logs.
      result = { completed: false, status: 'RETRY_REQUIRED' };
    }
    const finished = await adminClient.rpc('finish_account_deletion_attempt_v1', {
      operation_id: item.requestId, attempt_token: item.leaseToken,
    });
    if (finished?.error || typeof finished?.data?.completed !== 'boolean') {
      // Lease expiry permits recovery; never falsely report completion.
      throw new Error('ACCOUNT_DELETION_BATCH_UNAVAILABLE');
    }
    if (finished.data.completed) completed++;
    else if (result.status?.startsWith('PENDING_')) pending++;
    else retry++;
  }
  return { ok: true, processed: items.length, completed, pending, retry };
}

export async function handleScheduledAccountDeletion(request, { env = process.env, createAdminClient } = {}) {
  if (!authorizedDeletionWorker(request, env)) {
    return Response.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401, headers });
  }
  try {
    if (request.method !== 'GET' || new URL(request.url).search !== '') {
      return Response.json({ ok: false, code: 'INVALID_WORKER_REQUEST' }, { status: 400, headers });
    }
    const client = await createAdminClient();
    return Response.json(await drainAccountDeletions(client), { headers });
  } catch {
    return Response.json({ ok: false, code: 'ACCOUNT_DELETION_BATCH_UNAVAILABLE' }, { status: 503, headers });
  }
}
