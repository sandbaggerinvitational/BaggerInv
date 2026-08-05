const aggregates = new Map();
const MAX_SAMPLES = 100;

function round(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function createRuntimeProfile(operation) {
  const startedAt = performance.now();
  const stages = {};
  return {
    async measure(name, work) {
      const stageStartedAt = performance.now();
      try {
        return await work();
      } finally {
        stages[name] = round(performance.now() - stageStartedAt);
      }
    },
    mark(name, durationMs) {
      stages[name] = round(durationMs);
    },
    finish(extra = {}) {
      const result = { operation, ...stages, totalMs: round(performance.now() - startedAt), ...extra };
      const samples = aggregates.get(operation) || [];
      samples.push(result);
      if (samples.length > MAX_SAMPLES) samples.shift();
      aggregates.set(operation, samples);
      console.info("Runtime performance", result);
      return result;
    },
  };
}

export function attachRuntimeTiming(response, timing = {}) {
  const entries = Object.entries(timing)
    .filter(([key, value]) => key.endsWith("Ms") && Number.isFinite(value))
    .map(([key, value]) => `${key.replace(/Ms$/, "")};dur=${round(value)}`);
  if (entries.length) response.headers.set("Server-Timing", entries.join(", "));
  if (timing.cache) response.headers.set("X-Runtime-Cache", timing.cache);
  return response;
}

export function runtimePerformanceReport() {
  return [...aggregates.entries()].map(([operation, samples]) => {
    const totals = samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
    return {
      operation,
      samples: samples.length,
      averageMs: round(totals.reduce((sum, value) => sum + value, 0) / totals.length),
      p95Ms: totals[Math.min(totals.length - 1, Math.floor(totals.length * 0.95))],
      last: samples.at(-1),
    };
  }).sort((left, right) => right.averageMs - left.averageMs);
}
