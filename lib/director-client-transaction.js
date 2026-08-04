"use client";

import { useSyncExternalStore } from "react";

let queue = Promise.resolve();
let phase = "idle";
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => phase;

export function runDirectorTransaction(operation) {
  const execute = async () => {
    phase = "updating";
    notify();
    try {
      const result = await operation();
      phase = "updated";
      notify();
      await new Promise((resolve) => setTimeout(resolve, 450));
      return result;
    } finally {
      phase = "idle";
      notify();
    }
  };
  const transaction = queue.then(execute, execute);
  queue = transaction.catch(() => undefined);
  return transaction;
}

export function directorFetch(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  return method === "GET" ? fetch(input, init) : runDirectorTransaction(() => fetch(input, init));
}

export function useDirectorTransactionPhase() {
  return useSyncExternalStore(subscribe, snapshot, () => "idle");
}
