const clean = (value) => String(value ?? "").trim();
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value === undefined ? null : value;
}

export function clientMutationIntentKey(intent = {}) {
  return JSON.stringify(stable(intent));
}

/**
 * Keeps the UUID for an exact browser mutation intent until authoritative
 * success. An uncertain/lost response therefore retries the same v2 admission;
 * payload or authority-contract changes receive a different UUID.
 */
export function createClientMutationOperationIdentityRegistry({
  randomUUID = () => globalThis.crypto?.randomUUID?.(),
} = {}) {
  const records = new Map();
  return Object.freeze({
    acquire(intent) {
      const intentKey = clientMutationIntentKey(intent);
      const existing = records.get(intentKey);
      if (existing) return Object.freeze({ intentKey, operationRequestId: existing });
      const operationRequestId = clean(randomUUID());
      if (!uuid(operationRequestId)) {
        throw new Error("Secure mutation identity is unavailable. Refresh before trying again.");
      }
      records.set(intentKey, operationRequestId);
      return Object.freeze({ intentKey, operationRequestId });
    },
    confirm(receipt = {}) {
      const intentKey = clean(receipt.intentKey);
      const operationRequestId = clean(receipt.operationRequestId);
      if (records.get(intentKey) !== operationRequestId) return false;
      records.delete(intentKey);
      return true;
    },
    size() { return records.size; },
  });
}
