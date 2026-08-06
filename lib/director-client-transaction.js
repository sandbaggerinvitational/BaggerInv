"use client";

import { useSyncExternalStore } from "react";

let queue = Promise.resolve();
let phase = "idle";
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => phase;
const setPhase = (next) => { phase = next; notify(); };
const RETRY_DELAYS = [350, 800, 1600];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function runDirectorTransaction(operation) {
  const execute = async () => {
    setPhase("verifying");
    try {
      const result = await operation(setPhase);
      setPhase("updated");
      await new Promise((resolve) => setTimeout(resolve, 450));
      return result;
    } finally {
      setPhase("idle");
    }
  };
  const transaction = queue.then(execute, execute);
  queue = transaction.catch(() => undefined);
  return transaction;
}

export function directorFetch(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  if (method === "GET") return fetch(input, init);
  return runDirectorTransaction(async (report) => {
    let response;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      report(attempt ? "reconnecting" : "verifying");
      response = await fetch(input, init);
      const retryableIdentityFailure = response.status === 503 && response.headers.get("x-director-retryable") === "identity";
      if (!retryableIdentityFailure || attempt === RETRY_DELAYS.length) break;
      await wait(RETRY_DELAYS[attempt]);
    }
    report("updating");
    if (response?.ok) report("verifyingChanges");
    return response;
  });
}

export function useDirectorTransactionPhase() {
  return useSyncExternalStore(subscribe, snapshot, () => "idle");
}
