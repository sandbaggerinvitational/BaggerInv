export const FIXTURE_VERSION = "bagger-r139-synthetic-history-v1";
export const FIXTURE_SEED = "2026-never-again-139";

// Make missing measurements explicit. Never turn a rejected operation into a
// successful benchmark or infer server CPU/I/O from its elapsed time.
export function attachBenchmarkEvidence(results) {
  results.fixtureVersion = FIXTURE_VERSION;
  results.fixtureSeed = FIXTURE_SEED;
  results.samplePolicy = "p50 from successful samples; p95 at >=20; p99 at >=100. Thirty samples are a coarse local baseline, not a tail SLO.";
  const normalize = (operation, scale, suffix = "") => {
    const values = operation.measurements;
    operation.evidence = {
      benchmarkId: `BENCH-${operation.id}${suffix}`,
      operation: operation.label,
      fixtureVersion: FIXTURE_VERSION,
      fixtureSeed: FIXTURE_SEED,
      fixtureVariant: operation.fixtureVariant ?? "R139_SYNTHETIC_CURRENT_HISTORY",
      historyScale: scale,
      environment: results.environment,
      databaseVersion: results.environmentDetails?.databaseVersion ?? null,
      computeResourceProfile: results.environmentDetails ?? null,
      sampleCount: values?.samples ?? 0,
      successCount: operation.successCount ?? 0,
      failureCount: operation.failureCount ?? 0,
      semanticValidation: operation.semanticValidation ?? { preflight: "UNVERIFIED", samples: "UNVERIFIED", validatedSamples: 0 },
      p50Ms: values?.medianMs ?? null,
      p95Ms: values?.p95Ms ?? null,
      p95Status: values?.p95Status ?? "INSUFFICIENT_SAMPLE",
      p99Ms: values?.p99Ms ?? null,
      p99Status: values?.p99Status ?? "INSUFFICIENT_SAMPLE",
      maxMs: values?.maxMs ?? null,
      databaseTime: { scope: "LOCAL_PSQL_STATEMENT_ELAPSED_INCLUDING_SOCKET_AND_RESULT_TRANSFER",
        p50Ms: values?.medianMs ?? null, serverOnlyMs: null },
      queryCount: null,
      topLevelTimedStatementsPerSample: 1,
      rowsExamined: null,
      result: values && operation.failureCount === 0 ? "MEASURED" : "NOT_MEASURED_FAILED_PREFLIGHT",
      notes: [operation.coverage,
        operation.limitation || "Preflight and every timed result satisfy the operation result contract; validation runs after timing and each sample starts from the same rolled-back fixture state.",
        "Nested query count and rows examined are not sampled in latency runs. See separate query-plan evidence.",
        "No durable COMMIT, deployed API, client rendering, concurrency, provider resource or physical-device proof."],
    };
  };
  for (const entry of results.scales) {
    for (const operation of entry.operations) normalize(operation, entry.scale);
    for (const [comparison, operation] of Object.entries(entry.comparison || {})) normalize(operation, entry.scale, `-${comparison}`);
  }
  return results;
}
