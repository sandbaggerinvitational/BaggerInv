import test from 'node:test';
import assert from 'node:assert/strict';
import { handleScheduledAccountDeletion, drainAccountDeletions } from '../lib/account-deletion-scheduled-worker.js';

const requestId = '81000000-0000-4000-8000-000000000001';
const leaseToken = '82000000-0000-4000-8000-000000000001';
const authUserId = '83000000-0000-4000-8000-000000000001';
const env = { CRON_SECRET: 'synthetic-worker-secret-never-used-in-production' };
const req = (token = env.CRON_SECRET, suffix = '') => new Request(`https://example.invalid/api/cron/account-deletion${suffix}`, { headers: { authorization: `Bearer ${token}` } });

function client(initial = 'READY', fail = false) {
  let completed = false, deleted = 0;
  const calls = [];
  return {
    calls, get deleted() { return deleted; },
    auth: { admin: { async deleteUser(id, soft) { assert.equal(id, authUserId); assert.equal(soft, false); deleted++; if (fail) throw Error('private provider text'); completed = true; return {}; } } },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'claim_account_deletion_batch_v1') return { data: { items: [{ requestId, leaseToken }] } };
      if (name === 'finish_account_deletion_attempt_v1') {
        assert.deepEqual(args, { operation_id: requestId, attempt_token: leaseToken });
        return { data: { completed } };
      }
      assert.deepEqual(args, { operation_id: requestId });
      return { data: { requestId, authUserId: completed ? null : authUserId, status: completed ? 'COMPLETED' : initial, completed } };
    },
  };
}

test('scheduler cannot acquire an admin client with missing/incorrect/short secret', async () => {
  for (const [request, configuration] of [[req('incorrect'), env], [req(), {}], [req('short'), { CRON_SECRET: 'short' }]]) {
    const r = await handleScheduledAccountDeletion(request, { env: configuration, createAdminClient: () => assert.fail('unauthorized admin access') });
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
  }
});
test('scheduler rejects caller-supplied account/request selection', async () => {
  const r = await handleScheduledAccountDeletion(req(undefined, '?authUserId=other'), { env, createAdminClient: () => assert.fail('caller selection accepted') });
  assert.equal(r.status, 400);
});
test('scheduler uses only canonical original work items, returns aggregate nonpersonal results', async () => {
  const c = client();
  const r = await handleScheduledAccountDeletion(req(), { env, createAdminClient: () => c });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, processed: 1, completed: 1, pending: 0, retry: 0 });
  assert.equal(c.deleted, 1);
});
test('protected request remains pending; later automatic poll completes without user initiation', async () => {
  const pending = client('PENDING_REVIEW_ACCESS_HANDOFF');
  assert.equal((await drainAccountDeletions(pending)).pending, 1);
  assert.equal(pending.deleted, 0);
  const ready = client();
  assert.equal((await drainAccountDeletions(ready)).completed, 1);
  assert.equal(ready.calls.some(([name]) => name === 'initiate_account_deletion_v1'), false);
  assert.deepEqual(ready.calls.find(([n]) => n === 'read_account_deletion_work_item_v1')[1], { operation_id: requestId });
});
test('provider failure remains retryable and never exposes provider error', async () => {
  const c = client('READY', true);
  const r = await handleScheduledAccountDeletion(req(), { env, createAdminClient: () => c });
  assert.deepEqual(await r.json(), { ok: true, processed: 1, completed: 0, pending: 0, retry: 1 });
  assert.equal(c.deleted, 1);
});
test('invalid, duplicate and oversized batches fail before any delete', async () => {
  for (const items of [[{}], Array(2).fill({ requestId, leaseToken }), Array(6).fill({ requestId, leaseToken })]) {
    const c = { rpc: async () => ({ data: { items } }), auth: { admin: { deleteUser: () => assert.fail('invalid batch deletion') } } };
    await assert.rejects(drainAccountDeletions(c), /BATCH_UNAVAILABLE/);
  }
});
test('failed receipt finalization returns bounded failure, not false success', async () => {
  const c = client();
  const rpc = c.rpc.bind(c);
  c.rpc = (name, args) => name === 'finish_account_deletion_attempt_v1' ? { error: true } : rpc(name, args);
  const r = await handleScheduledAccountDeletion(req(), { env, createAdminClient: () => c });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false, code: 'ACCOUNT_DELETION_BATCH_UNAVAILABLE' });
});
