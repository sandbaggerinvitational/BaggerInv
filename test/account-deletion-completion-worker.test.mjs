import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeAccountDeletion } from '../lib/account-deletion-completion-worker.js';

const requestId = '22222222-2222-4222-8222-222222222222';
const authUserId = '11111111-1111-4111-8111-111111111111';
const otherId = '33333333-3333-4333-8333-333333333333';
const unavailable = error => error.code === 'ACCOUNT_DELETION_COMPLETION_UNAVAILABLE';
function fixture(options = {}) {
  const calls = [];
  let state = options.status || 'READY';
  let committed = state === 'COMPLETED';
  const data = () => ({ requestId, authUserId: committed ? null : authUserId, status: state, completed: committed });
  const adminClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'read_account_deletion_work_item_v1') {
        return options.workOverride || { data: data() };
      }
      assert.equal(name, 'read_account_deletion_receipt_v1');
      return options.receiptOverride || { data: data() };
    },
    auth: { admin: { deleteUser: async (id, soft) => {
      calls.push({ name: 'deleteUser', id, soft });
      if (options.afterDelete) state = options.afterDelete;
      else if (!options.noCommit) { state = 'COMPLETED'; committed = true; }
      if (options.providerThrows) throw new Error('private provider diagnostic');
      return { error: options.providerError || null };
    } } },
  };
  return { calls, adminClient, setStatus(value) { state = value; committed = value === 'COMPLETED'; } };
}
const run = f => resumeAccountDeletion({ requestId }, { adminClient: f.adminClient });

test('trusted continuation resumes original request, hard-deletes canonical Auth identity and requires receipt', async () => {
  const f = fixture();
  assert.deepEqual(await run(f), { requestId, status: 'COMPLETED', completed: true });
  assert.deepEqual(f.calls.map(c => c.name), ['read_account_deletion_work_item_v1', 'deleteUser', 'read_account_deletion_receipt_v1']);
  assert.deepEqual(f.calls[1], { name: 'deleteUser', id: authUserId, soft: false });
  assert.ok(f.calls.filter(c => c.args).every(c => c.args.operation_id === requestId));
});

for (const status of ['PENDING_ADMINISTRATIVE_HANDOFF', 'PENDING_REVIEW_ACCESS_HANDOFF']) {
  test(`${status} remains safe and can finish after protection clears without a new user request`, async () => {
    const f = fixture({ status });
    assert.deepEqual(await run(f), { requestId, status, completed: false });
    assert.equal(f.calls.length, 1);
    f.setStatus('READY');
    assert.equal((await run(f)).completed, true);
    assert.equal(f.calls.filter(c => c.name === 'deleteUser').length, 1);
  });
}

test('completed retries validate the original receipt and never delete again', async () => {
  const f = fixture();
  const first = await run(f);
  assert.deepEqual(await run(f), first);
  assert.equal(f.calls.filter(c => c.name === 'deleteUser').length, 1);
});

test('provider success without committed receipt remains retryable, never completed', async () => {
  const f = fixture({ noCommit: true });
  assert.deepEqual(await run(f), { requestId, status: 'RETRY_REQUIRED', completed: false });
  assert.equal(f.calls.filter(c => c.name === 'deleteUser').length, 1);
});

test('uncertain provider response can recover only from canonical committed receipt', async () => {
  for (const options of [{ providerThrows: true }, { providerError: { message: 'sensitive' } }]) {
    const f = fixture(options);
    assert.deepEqual(await run(f), { requestId, status: 'COMPLETED', completed: true });
  }
});

test('provider failure cannot fabricate success and respects a late protection change', async () => {
  const f = fixture({ noCommit: true, providerThrows: true, afterDelete: 'PENDING_REVIEW_ACCESS_HANDOFF' });
  assert.deepEqual(await run(f), { requestId, status: 'PENDING_REVIEW_ACCESS_HANDOFF', completed: false });
  assert.equal(f.calls.filter(c => c.name === 'deleteUser').length, 1);
});

test('malformed, conflicting, absent or unauthorized work item never reaches provider deletion', async () => {
  for (const workOverride of [
    { error: { message: 'service scope required' } }, { data: null },
    { data: { requestId: otherId, authUserId, status: 'READY', completed: false } },
    { data: { requestId, authUserId: null, status: 'READY', completed: false } },
    { data: { requestId, authUserId, status: 'COMPLETED', completed: false } },
    { data: { requestId, authUserId, status: 'UNKNOWN', completed: false } },
  ]) {
    const f = fixture({ workOverride });
    await assert.rejects(run(f), unavailable);
    assert.equal(f.calls.filter(c => c.name === 'deleteUser').length, 0);
  }
});

test('wrong-request, malformed and inaccessible receipt never reports success', async () => {
  for (const receiptOverride of [
    { error: { message: 'private diagnostic' } }, { data: null },
    { data: { requestId: otherId, status: 'COMPLETED', completed: true } },
    { data: { requestId, status: 'COMPLETED', completed: false } },
  ]) {
    const f = fixture({ receiptOverride });
    await assert.rejects(run(f), unavailable);
  }
  const f = fixture({ status: 'COMPLETED', receiptOverride: { data: { requestId, status: 'READY', completed: false } } });
  await assert.rejects(run(f), unavailable);
  assert.equal(f.calls.filter(c => c.name === 'deleteUser').length, 0);
});

test('caller cannot select an actor, bypass protections, or supply confirmation in lieu of canonical request', async () => {
  for (const input of [null, {}, { requestId: 'bad' }, { requestId, authUserId }, { requestId, bypassProtection: true }]) {
    const f = fixture();
    await assert.rejects(resumeAccountDeletion(input, { adminClient: f.adminClient }), error => error.code === 'INVALID_ACCOUNT_DELETION_WORK_ITEM');
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(resumeAccountDeletion({ requestId }), error => error.code === 'INVALID_ACCOUNT_DELETION_WORK_ITEM');
});

test('work-item read transport errors stay bounded and do not leak diagnostics', async () => {
  const f = fixture();
  f.adminClient.rpc = async () => { throw new Error('email@example.test secret'); };
  await assert.rejects(run(f), error => unavailable(error) && !error.message.includes('email'));
});
