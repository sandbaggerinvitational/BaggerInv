const DB_NAME = "sbi-scoring-diagnostics-v1";
const STORE_NAME = "samples";
const DB_VERSION = 1;

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const waitFor = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function scoringDiagnosticId(sample = {}) {
  return `${String(sample.matchId || "")}:${String(sample.clientMutationId || "")}`;
}

export function mergeScoringDiagnosticSample(current = {}, update = {}) {
  const merged = { ...clone(current), ...clone(update) };
  merged.id = update.id || current.id || scoringDiagnosticId(merged);
  merged.updatedAt = update.updatedAt || new Date().toISOString();
  return merged;
}

export function createMemoryScoringDiagnosticsStore(initial = []) {
  const records = new Map(initial.map((sample) => [sample.id || scoringDiagnosticId(sample), clone(sample)]));
  return {
    async list() { return [...records.values()].map(clone); },
    async upsert(update) {
      const id = update.id || scoringDiagnosticId(update);
      const merged = mergeScoringDiagnosticSample(records.get(id), { ...update, id });
      records.set(id, clone(merged));
      return clone(merged);
    },
  };
}

export function createIndexedDbScoringDiagnosticsStore(indexedDb = globalThis.indexedDB) {
  let databasePromise;
  const database = () => {
    if (!indexedDb) throw new Error("Durable scoring diagnostics are unavailable on this device.");
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return databasePromise;
  };
  const store = async (mode, operation) => {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, mode);
    const result = await operation(transaction.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  };
  return {
    list: () => store("readonly", (records) => waitFor(records.getAll())),
    async upsert(update) {
      const id = update.id || scoringDiagnosticId(update);
      return store("readwrite", async (records) => {
        const current = await waitFor(records.get(id));
        const merged = mergeScoringDiagnosticSample(current, { ...update, id });
        await waitFor(records.put(clone(merged)));
        return clone(merged);
      });
    },
  };
}
