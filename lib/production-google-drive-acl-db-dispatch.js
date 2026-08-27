import "server-only";

const MAX_DATABASE_DISPATCH_WINDOW_MS = 15_000;

function monotonicNow() {
  const observed = globalThis.performance?.now?.();
  if (!Number.isFinite(observed)) {
    throw new Error("A monotonic clock was required for the Drive ACL dispatch.");
  }
  return observed;
}

/**
 * Creates one isolated capability channel. The Production receipt server owns
 * the only channel whose receipts the ACL mutation module consumes. Creating a
 * second channel cannot mint a receipt recognized by that official consumer.
 *
 * The issuer deliberately remains a closure method: no module-level export
 * accepts a caller-supplied database response and turns it into an official
 * provider-mutation capability.
 */
export function createProductionGoogleDriveAclDbDispatchChannel() {
  const claims = new WeakMap();
  const receipts = new WeakMap();
  const recoveryReceipts = new WeakMap();

  function beginClaim() {
    const claim = Object.freeze(Object.create(null));
    claims.set(claim, {
      consumed: false,
      startedAtMonotonicMs: monotonicNow(),
    });
    return claim;
  }

  function issueReceipt(claim, durableDispatch, recordOutcome) {
    const claimState = claims.get(claim);
    const now = monotonicNow();
    const elapsedMs = claimState
      ? now - claimState.startedAtMonotonicMs
      : Number.NaN;
    if (!claimState || claimState.consumed || elapsedMs < 0 ||
        elapsedMs >= MAX_DATABASE_DISPATCH_WINDOW_MS ||
        !durableDispatch || typeof durableDispatch !== "object" ||
        Array.isArray(durableDispatch) || typeof recordOutcome !== "function") {
      throw new Error("The Drive ACL database dispatch claim was invalid.");
    }
    claimState.consumed = true;
    claims.delete(claim);
    const capability = Object.freeze(Object.create(null));
    receipts.set(capability, {
      claimStartedMonotonicMs: claimState.startedAtMonotonicMs,
      consumed: false,
      durableDispatch: Object.freeze({ ...durableDispatch }),
      recordOutcome,
    });
    return capability;
  }

  function consumeReceipt(capability) {
    const receipt = receipts.get(capability);
    if (!receipt || receipt.consumed) {
      throw new Error("The Drive ACL database dispatch receipt was invalid.");
    }
    receipt.consumed = true;
    receipts.delete(capability);
    return Object.freeze({
      claimStartedMonotonicMs: receipt.claimStartedMonotonicMs,
      durableDispatch: receipt.durableDispatch,
      recordOutcome: receipt.recordOutcome,
    });
  }

  function issueRecoveryReceipt(durableDispatch, recordOutcome) {
    if (!durableDispatch || typeof durableDispatch !== "object" ||
        Array.isArray(durableDispatch) || typeof recordOutcome !== "function") {
      throw new Error("The Drive ACL database recovery receipt was invalid.");
    }
    const capability = Object.freeze(Object.create(null));
    recoveryReceipts.set(capability, {
      consumed: false,
      durableDispatch: Object.freeze({ ...durableDispatch }),
      recordOutcome,
    });
    return capability;
  }

  function consumeRecoveryReceipt(capability) {
    const receipt = recoveryReceipts.get(capability);
    if (!receipt || receipt.consumed) {
      throw new Error("The Drive ACL database recovery receipt was invalid.");
    }
    receipt.consumed = true;
    recoveryReceipts.delete(capability);
    return Object.freeze({
      durableDispatch: receipt.durableDispatch,
      recordOutcome: receipt.recordOutcome,
    });
  }

  return Object.freeze({
    beginClaim,
    consumeReceipt,
    consumeRecoveryReceipt,
    issueReceipt,
    issueRecoveryReceipt,
  });
}
