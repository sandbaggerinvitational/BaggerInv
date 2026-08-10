const DB_NAME = "sbi-scoring-sync-v1";
const STORE_NAME = "mutations";
const DB_VERSION = 1;
const TERMINAL = new Set(["confirmed", "conflict", "action-required"]);

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const keyFor = (entry) => `${entry.tournamentId}:${entry.matchId}:H${entry.holeNumber}:V${entry.version}`;
const waitFor = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function createMemoryScoringStore(initial = []) {
  const records = new Map(initial.map((entry) => [entry.id, clone(entry)]));
  return {
    async list() { return [...records.values()].map(clone); },
    async put(entry) { records.set(entry.id, clone(entry)); return clone(entry); },
    async delete(id) { records.delete(id); },
    async clear() { records.clear(); },
  };
}

export function createIndexedDbScoringStore(indexedDb = globalThis.indexedDB) {
  let databasePromise;
  const database = () => {
    if (!indexedDb) throw new Error("Durable scoring storage is unavailable on this device.");
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("match", "matchId", { unique: false });
        }
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
    put: (entry) => store("readwrite", async (records) => { await waitFor(records.put(clone(entry))); return clone(entry); }),
    delete: (id) => store("readwrite", (records) => waitFor(records.delete(id))),
  };
}

export function sameGrossScores(entry, serverHole) {
  const parse = (value) => Array.isArray(value) ? value.map(Number) : value === "" || value == null ? [] : (() => {
    try { const parsed = JSON.parse(value); return (Array.isArray(parsed) ? parsed : [parsed]).map(Number); }
    catch { return [Number(value)]; }
  })();
  return JSON.stringify(entry.team1GrossScores.map(Number)) === JSON.stringify(parse(serverHole?.["Team 1 Gross Scores"])) &&
    JSON.stringify(entry.team2GrossScores.map(Number)) === JSON.stringify(parse(serverHole?.["Team 2 Gross Scores"]));
}

export function classifyScoringSyncFailure(error = {}) {
  const statusCode = Number(error?.status || 0);
  const message = String(error?.message || "");
  if (statusCode === 409 || /updated by someone else|server score differs|authoritative score changed/i.test(message)) {
    return { status: "conflict", kind: "conflict", message: "Server score differs from this device. Review before continuing." };
  }
  if (/final|finalized|reopen/i.test(message)) {
    return { status: "action-required", kind: "finalized", message: "This match was finalized before this score synced. Director review is required." };
  }
  if (/locked|scoring access|scoring has been locked/i.test(message)) {
    return { status: "action-required", kind: "locked", message: "Scoring has been locked by the Tournament Director." };
  }
  if ([401, 403].includes(statusCode) || /passport|authoriz|session|credential/i.test(message)) {
    return { status: "action-required", kind: "authorization", message: "Scoring authorization needs to be refreshed." };
  }
  return { status: "retryable", kind: "retryable", message: "Score saved on this device. Tap Retry Sync." };
}

export function actionableScoringEntries(entries = []) {
  return entries
    .filter((entry) => ["retryable", "conflict", "action-required"].includes(entry.status))
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

export function participantScoringSyncIssue(entry = {}) {
  return entry.participantMessage || classifyScoringSyncFailure({
    status: entry.failureStatus,
    message: entry.lastError,
  }).message;
}

export function scoringSyncIssueKind(entry = {}) {
  const message = `${entry.participantMessage || ""} ${entry.lastError || ""}`;
  const hasDifferentAuthoritativeValue = Boolean(entry.optimisticHole && entry.authoritativeHole) &&
    !sameGrossScores(entry, entry.authoritativeHole);
  if (entry.status === "conflict" || entry.failureKind === "conflict" ||
      /server score differs|authoritative score changed|score conflict/i.test(message) || hasDifferentAuthoritativeValue) return "conflict";
  if (entry.status === "retryable" || entry.failureKind === "retryable") return "retryable";
  return entry.failureKind || "action-required";
}

export function scoringSyncSummary(entries = [], online = true) {
  const attention = actionableScoringEntries(entries);
  const active = entries.filter((entry) => !TERMINAL.has(entry.status));
  if (attention.length) {
    const holes = [...new Set(attention.map((entry) => Number(entry.holeNumber)).filter(Number.isInteger))];
    const text = attention.length === 1 && holes.length
      ? `HOLE ${holes[0]} NEEDS ATTENTION · TAP TO REVIEW`
      : attention.length <= 3 && holes.length
        ? `${attention.length} SCORES NEED ATTENTION · HOLES ${holes.slice(0, 3).join(", ")}`
        : `${attention.length} SCORES NEED ATTENTION · TAP TO REVIEW`;
    return { state: "attention", text, actionable: true, holes };
  }
  if (!active.length) return { state: "synced", text: "All scores synced" };
  if (!online) return { state: "offline", text: `Offline · ${active.length} hole${active.length === 1 ? "" : "s"} saved on this device` };
  return { state: "syncing", text: `Syncing ${active.length} hole${active.length === 1 ? "" : "s"}…` };
}

export function scoringFinalizationReview(entries = []) {
  const attention = actionableScoringEntries(entries);
  const holes = [...new Set(attention.map((entry) => Number(entry.holeNumber)).filter(Number.isInteger))];
  if (!attention.length) return { count: 0, holes: [], reviewText: "", buttonText: "" };
  const holeLabel = `${holes.length === 1 ? "Hole" : "Holes"} ${holes.join(", ")}`;
  return {
    count: attention.length,
    holes,
    reviewText: `${attention.length} score${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} review before Final submission · ${holeLabel}`,
    buttonText: `Resolve ${attention.length} score issue${attention.length === 1 ? "" : "s"} before submitting Final.`,
  };
}

export function createScoringSyncQueue({
  store,
  send,
  readAuthoritative,
  now = () => Date.now(),
  online = () => typeof navigator === "undefined" || navigator.onLine !== false,
  schedule = (callback, delay) => setTimeout(callback, delay),
  locks = typeof navigator !== "undefined" ? navigator.locks : null,
} = {}) {
  if (!store || !send) throw new Error("Scoring sync requires durable storage and a sender.");
  const listeners = new Set();
  let running = false;
  let stopped = false;
  let retryTimer = null;
  const emit = async (event, detail = {}) => {
    const entries = await store.list();
    for (const listener of listeners) listener({ event, entries, summary: scoringSyncSummary(entries, online()), ...detail });
  };
  const activeForMatch = async (matchId) => (await store.list())
    .filter((entry) => entry.matchId === matchId && entry.status !== "confirmed")
    .sort((a, b) => a.sequence - b.sequence);
  const pending = async (matchId) => (await store.list())
    .filter((entry) => entry.matchId === matchId && !TERMINAL.has(entry.status))
    .sort((a, b) => a.sequence - b.sequence);
  const scheduleRetry = (entry) => {
    const delay = Math.min(30_000, 750 * (2 ** Math.min(entry.attempts, 5)));
    retryTimer = schedule(() => { retryTimer = null; process().catch(() => {}); }, delay);
  };
  const runMutation = async (entry) => {
    const syncing = { ...entry, status: "syncing", attempts: entry.attempts + 1, lastAttemptAt: now() };
    await store.put(syncing);
    await emit("syncing", { entry: syncing });
    try {
      const result = await send(syncing);
      const remaining = await pending(syncing.matchId);
      const newer = remaining.some((candidate) => candidate.holeNumber === syncing.holeNumber && candidate.sequence > syncing.sequence);
      await store.delete(syncing.id);
      for (const candidate of await pending(syncing.matchId)) {
        await store.put({
          ...candidate,
          expectedUpdatedAt: result?.updatedAt || candidate.expectedUpdatedAt,
          expectedRevision: candidate.holeNumber === syncing.holeNumber
            ? Number(result?.hole?.Revision ?? candidate.expectedRevision)
            : candidate.expectedRevision,
        });
      }
      await emit("confirmed", { entry: syncing, result, stale: newer, resolution: syncing.resolutionChoice || null });
      return true;
    } catch (error) {
      const failure = classifyScoringSyncFailure(error);
      let authoritativeHole = null;
      let authoritativeMatchUpdatedAt = null;
      let authoritativeCanConfirm = false;
      if (failure.kind === "conflict" && readAuthoritative) {
        try {
          const authoritative = await readAuthoritative(syncing);
          authoritativeHole = authoritative?.holeScores?.find((hole) => Number(hole["Hole Number"]) === syncing.holeNumber) || null;
          authoritativeMatchUpdatedAt = authoritative?.match?.["Updated At"] || null;
          authoritativeCanConfirm = Boolean(authoritative?.canConfirm);
        } catch {}
      }
      const next = {
        ...syncing,
        status: failure.status,
        failureKind: failure.kind,
        failureStatus: Number(error?.status || 0),
        participantMessage: failure.message,
        authoritativeHole,
        authoritativeMatchUpdatedAt,
        authoritativeCanConfirm,
        lastError: String(error?.message || "Synchronization failed."),
        nextRetryAt: failure.status === "retryable" ? now() + Math.min(30_000, 750 * (2 ** Math.min(syncing.attempts, 5))) : null,
      };
      await store.put(next);
      await emit(next.status, { entry: next, error });
      if (next.status === "retryable" && online()) scheduleRetry(next);
      return false;
    }
  };
  const drain = async () => {
    if (!online()) { await emit("offline"); return; }
    while (!stopped) {
      const entries = (await store.list())
        .filter((entry) => ["queued", "retryable", "syncing"].includes(entry.status))
        .sort((a, b) => a.sequence - b.sequence);
      const entry = entries[0];
      if (!entry) break;
      if (entry.status === "retryable" && entry.nextRetryAt > now()) { scheduleRetry(entry); break; }
      const continued = await runMutation(entry);
      if (!continued) break;
    }
  };
  const process = async () => {
    if (running || stopped) return;
    running = true;
    try {
      if (locks?.request) await locks.request("sbi-scoring-sync", { mode: "exclusive" }, drain);
      else await drain();
    } finally { running = false; }
  };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async hydrate(matchId) { const entries = await activeForMatch(matchId); await emit("hydrated"); return entries; },
    async entries(matchId) { return activeForMatch(matchId); },
    async enqueue(input) {
      const all = await store.list();
      const matching = all.filter((entry) => entry.matchId === input.matchId && entry.holeNumber === input.holeNumber);
      const replaceable = matching.find((entry) => ["queued", "retryable"].includes(entry.status));
      const version = Math.max(0, ...matching.map((entry) => entry.version || 0)) + 1;
      const sequence = Math.max(0, ...all.map((entry) => entry.sequence || 0)) + 1;
      if (replaceable) await store.delete(replaceable.id);
      const entry = {
        ...clone(input),
        id: "",
        version,
        sequence,
        clientMutationId: input.clientMutationId || globalThis.crypto?.randomUUID?.() || `${now()}-${Math.random().toString(36).slice(2)}`,
        status: "queued",
        attempts: 0,
        createdAt: input.createdAt || now(),
        nextRetryAt: 0,
      };
      entry.id = keyFor(entry);
      await store.put(entry);
      await emit("queued", { entry });
      process().catch(() => {});
      return entry;
    },
    async reconcile(matchId, serverHoles = [], serverMatch = {}) {
      for (const entry of await activeForMatch(matchId)) {
        if (scoringSyncIssueKind(entry) !== "conflict") continue;
        const serverHole = serverHoles.find((hole) => Number(hole["Hole Number"]) === entry.holeNumber) || entry.authoritativeHole || null;
        const normalized = {
          ...entry,
          status: "conflict",
          failureKind: "conflict",
          participantMessage: "Server score differs from this device. Review before continuing.",
          authoritativeHole: serverHole,
          authoritativeMatchUpdatedAt: serverMatch.updatedAt ?? serverMatch["Updated At"] ?? entry.authoritativeMatchUpdatedAt,
          authoritativeCanConfirm: Boolean(serverMatch.canConfirm ?? entry.authoritativeCanConfirm),
        };
        await store.put(normalized);
        await emit("conflict", { entry: normalized, repaired: true });
      }
      const entries = await pending(matchId);
      for (const entry of entries) {
        const serverHole = serverHoles.find((hole) => Number(hole["Hole Number"]) === entry.holeNumber);
        if (serverHole && sameGrossScores(entry, serverHole)) {
          await store.delete(entry.id);
          await emit("confirmed", { entry, result: { hole: serverHole }, reconciled: true });
        } else if (serverHole && Number(serverHole.Revision || 0) > Number(entry.expectedRevision || 0)) {
          await store.put({
            ...entry,
            status: "conflict",
            failureKind: "conflict",
            participantMessage: "Server score differs from this device. Review before continuing.",
            authoritativeHole: serverHole,
            lastError: "The authoritative score changed on another device.",
          });
          await emit("conflict", { entry });
        } else {
          await store.put({
            ...entry,
            status: entry.status === "syncing" ? "queued" : entry.status,
            expectedUpdatedAt: serverMatch.updatedAt ?? serverMatch["Updated At"] ?? entry.expectedUpdatedAt,
            expectedRevision: serverHole ? Number(serverHole.Revision || 0) : entry.expectedRevision,
          });
        }
      }
      process().catch(() => {});
      return activeForMatch(matchId);
    },
    retry() {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      return store.list().then(async (entries) => {
        for (const entry of entries.filter((item) => item.status === "retryable")) await store.put({ ...entry, status: "queued", nextRetryAt: 0 });
        return process();
      });
    },
    retryEntry(id) {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      return store.list().then(async (entries) => {
        const entry = entries.find((item) => item.id === id);
        if (entry && ["retryable", "action-required"].includes(entry.status)) {
          await store.put({
            ...entry,
            status: "queued",
            failureKind: null,
            participantMessage: "",
            nextRetryAt: 0,
          });
          await emit("queued", { entry });
        }
        return process();
      });
    },
    async resolveConflict(id, resolution) {
      const entries = await store.list();
      const entry = entries.find((item) => item.id === id && scoringSyncIssueKind(item) === "conflict");
      if (!entry) return false;
      if (resolution === "server") {
        await store.delete(entry.id);
        await emit("confirmed", { entry, result: { hole: entry.authoritativeHole, updatedAt: entry.authoritativeMatchUpdatedAt, matchComplete: entry.authoritativeCanConfirm }, reconciled: true, resolution: "server" });
        process().catch(() => {});
        return true;
      }
      if (resolution === "device") {
        await store.put({
          ...entry,
          status: "queued",
          failureKind: null,
          participantMessage: "",
          resolutionChoice: "device",
          expectedRevision: Number(entry.authoritativeHole?.Revision || entry.expectedRevision || 0),
          expectedUpdatedAt: entry.authoritativeMatchUpdatedAt || entry.expectedUpdatedAt,
          authoritativeHole: null,
          authoritativeMatchUpdatedAt: null,
          nextRetryAt: 0,
        });
        await emit("queued", { entry });
        process().catch(() => {});
        return true;
      }
      return false;
    },
    process,
    stop() { stopped = true; if (retryTimer) clearTimeout(retryTimer); },
  };
}
