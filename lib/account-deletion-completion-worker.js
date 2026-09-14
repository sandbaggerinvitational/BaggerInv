// Inert, server-side orchestration for an already-authorized deletion request.
// This is not an HTTP handler or scheduler. Its caller supplies a trusted admin
// client; the work-item RPC must enforce service scope, recover the canonical
// original actor and re-evaluate administrative/reviewer protection. The Auth
// deletion trigger must recheck that protection transactionally.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUUID = value => typeof value === 'string' && UUID.test(value);
const PENDING = new Set(['PENDING_ADMINISTRATIVE_HANDOFF', 'PENDING_REVIEW_ACCESS_HANDOFF']);
const STATES = new Set(['READY', 'COMPLETED', ...PENDING]);

export class AccountDeletionCompletionError extends Error {
  constructor(code = 'ACCOUNT_DELETION_COMPLETION_UNAVAILABLE') {
    super(code);
    this.name = 'AccountDeletionCompletionError';
    this.code = code;
  }
}

function validate(data, requestId, workItem = false) {
  if (!data || data.requestId !== requestId || !STATES.has(data.status) ||
      data.completed !== (data.status === 'COMPLETED') ||
      (workItem && data.status !== 'COMPLETED' && !isUUID(data.authUserId))) {
    throw new AccountDeletionCompletionError();
  }
  return data;
}

function result(data) {
  // No Auth UUID, email, provider error or arbitrary metadata crosses this API.
  return {
    requestId: data.requestId,
    status: data.status === 'READY' ? 'RETRY_REQUIRED' : data.status,
    completed: data.completed,
  };
}

export async function resumeAccountDeletion(input, { adminClient } = {}) {
  if (typeof window !== 'undefined' || !input || Object.keys(input).length !== 1 ||
      !isUUID(input.requestId) || typeof adminClient?.rpc !== 'function' ||
      typeof adminClient?.auth?.admin?.deleteUser !== 'function') {
    throw new AccountDeletionCompletionError('INVALID_ACCOUNT_DELETION_WORK_ITEM');
  }
  const requestId = input.requestId.toLowerCase();
  const read = async (name, workItem = false) => {
    let response;
    try {
      response = await adminClient.rpc(name, { operation_id: requestId });
    } catch {
      throw new AccountDeletionCompletionError();
    }
    if (response?.error) throw new AccountDeletionCompletionError();
    return validate(response?.data, requestId, workItem);
  };
  const work = await read('read_account_deletion_work_item_v1', true);
  if (PENDING.has(work.status)) return result(work);
  if (work.status === 'COMPLETED') {
    const receipt = await read('read_account_deletion_receipt_v1');
    if (!receipt.completed) throw new AccountDeletionCompletionError();
    return result(receipt);
  }

  // Do not accept caller-supplied identity or create/re-initiate a request.
  // Transport uncertainty may follow a committed Auth delete. In either case,
  // only the original canonical completion receipt can establish success.
  try {
    await adminClient.auth.admin.deleteUser(work.authUserId, false);
  } catch {
    // Intentionally discard provider error text and inspect durable authority.
  }
  const receipt = await read('read_account_deletion_receipt_v1');
  if (receipt.completed) return result(receipt);

  // No second delete in this invocation. Re-evaluate a late protection change
  // and leave an incomplete request retryable by the trusted completion worker.
  const current = await read('read_account_deletion_work_item_v1', true);
  if (current.status === 'COMPLETED') {
    const committed = await read('read_account_deletion_receipt_v1');
    if (!committed.completed) throw new AccountDeletionCompletionError();
    return result(committed);
  }
  return result(current);
}
