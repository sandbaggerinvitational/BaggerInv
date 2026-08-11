const BURST_MUTATION_PREFIX = "benchmark:burst:";

export function selectBurstBaselineObservation(history = []) {
  return history.find((item) => !String(item?.mutation_key || "").startsWith(BURST_MUTATION_PREFIX)) || null;
}
