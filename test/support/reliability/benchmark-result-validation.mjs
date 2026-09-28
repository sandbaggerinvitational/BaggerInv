// Result contracts for the checked-in benchmark operations. No database access.
const POLICY = "production-full-course-handicap-v1";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => Array.isArray(value) && value.length > 0;
const identifier = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,127}$/.test(value);
const safeCode = value => typeof value === "string" && /^[A-Z][A-Z0-9_]{0,127}$/.test(value) ? value : null;

export class BenchmarkResultError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BenchmarkResultError";
    this.code = code;
  }
}

function reject(code, message) {
  // Never include payload text or arbitrary database error messages.
  throw new BenchmarkResultError(code, message);
}

function validFullNet(value) {
  return object(value) && value.policy === POLICY && value.tournamentId === "2026" &&
    nonempty(value.matches) && value.matches.every(match =>
      object(match) && match.policy === POLICY && match.tournamentId === "2026" &&
      identifier(match.matchId) && [1, 2, 3].includes(match.roundNumber) &&
      ["BB", "SC", "SI"].includes(match.format) && typeof match.authorityAvailable === "boolean" &&
      nonempty(match.entries) && match.entries.every(entry => object(entry) &&
        identifier(entry.entityId) && [1, 2].includes(entry.teamSide) &&
        Array.isArray(entry.holes) && entry.holes.length === 18 &&
        entry.holes.every((hole, index) => object(hole) && hole.hole === index + 1)));
}

export function validateBenchmarkResult(operation, output) {
  if (typeof output !== "string" || !output.trim()) {
    reject("BENCHMARK_RESULT_MISSING", "Benchmark returned no result.");
  }
  const text = output.trim();
  if (["late-r3-compatibility-old", "late-r3-compatibility-fixed"].includes(operation?.id)) {
    if (text !== "t" && text !== "f") {
      reject("BENCHMARK_BOOLEAN_INVALID", "Compatibility result must be a PostgreSQL boolean.");
    }
    return { contract: "SQL_BOOLEAN", ok: null, code: null, booleanValue: text === "t" };
  }
  let value;
  try { value = JSON.parse(text); } catch {
    reject("BENCHMARK_JSON_INVALID", "Benchmark result must be one complete JSON value.");
  }
  if (operation?.coverage?.startsWith("ACTUAL_RPC") || operation?.id === "leaders") {
    if (!object(value) || value.ok !== true) {
      reject("BENCHMARK_RPC_NOT_SUCCESSFUL", "RPC result must explicitly acknowledge ok=true.");
    }
    if (operation.id === "score-write" && (value.code !== "ACCEPTED" ||
        value.idempotent === true || value.semantic_noop === true)) {
      reject("BENCHMARK_SCORE_NOT_WRITTEN", "Score benchmark must accept a new canonical mutation, not replay or no-op.");
    }
    if (value.failures !== undefined && value.failures !== null &&
        !(Array.isArray(value.failures) && value.failures.length === 0) && value.failures !== 0) {
      reject("BENCHMARK_RPC_PARTIAL_FAILURE", "RPC result contains failures.");
    }
    return { contract: "RPC_OK_TRUE", ok: true, code: safeCode(value.code), failures: 0 };
  }
  if (operation?.id === "net-skins-calculation") {
    if (!validFullNet(value)) {
      reject("BENCHMARK_FULL_NET_SHAPE_INVALID", "Full-net input result does not match the current tournament input contract.");
    }
    return { contract: "SQL_FULL_NET_INPUT", ok: null, code: null, matchCount: value.matches.length };
  }
  if (operation?.id === "calcutta-calculation") {
    if (!object(value) || value.tournament_id !== "2026" || value.calculation_policy !== POLICY ||
        !nonempty(value.rounds) || !value.rounds.every(round => object(round) &&
          [1, 2, 3].includes(round.round_number) && ["BB", "SC", "SI"].includes(round.format)) ||
        !nonempty(value.matches) || !value.matches.every(match => object(match) &&
          identifier(match.match_id) && [1, 2, 3].includes(match.round_number) && nonempty(match.participants)) ||
        !nonempty(value.holes) || !value.holes.every(hole => object(hole) &&
          identifier(hole.match_id) && Number.isInteger(hole.hole_number) &&
          hole.hole_number >= 1 && hole.hole_number <= 18) || !validFullNet(value.full_net_authority)) {
      reject("BENCHMARK_CALCUTTA_SHAPE_INVALID", "Calcutta source result does not match the current tournament revision contract.");
    }
    return { contract: "SQL_CALCUTTA_SOURCE", ok: null, code: null, matchCount: value.matches.length };
  }
  reject("BENCHMARK_RESULT_CONTRACT_MISSING", "Benchmark operation has no reviewed result contract.");
}

const TIMING = /^Time:\s+([0-9]+(?:\.[0-9]+)?)\s+ms(?:\s+\([^\r\n]*\))?\s*$/;

export function collectTimedSqlSamples(result, { count, marker, validateResult }) {
  if (typeof validateResult !== "function") {
    reject("BENCHMARK_VALIDATOR_REQUIRED", "Each timed SQL result requires a validator.");
  }
  if (result.error || result.status !== 0) {
    reject("BENCHMARK_SQL_PROCESS_FAILED", "Timed SQL process did not complete successfully; result payloads withheld.");
  }
  if (!Number.isInteger(count) || count < 1 || typeof marker !== "string" || !/^[A-Z0-9_]+$/.test(marker)) {
    reject("BENCHMARK_SAMPLE_OPTIONS_INVALID", "Timed SQL sample framing options are invalid.");
  }
  const lines = String(result.stdout || "").split(/\r?\n/);
  const stderrTimings = String(result.stderr || "").split(/\r?\n/)
    .map(line => line.match(TIMING)).filter(Boolean).map(match => Number(match[1]));
  const values = [];
  let cursor = 0;
  for (let index = 0; index < count; index++) {
    const begin = `${marker}_${index + 1}_BEGIN`;
    const end = `${marker}_${index + 1}_END`;
    while (cursor < lines.length && !lines[cursor].trim()) cursor++;
    if (lines[cursor++] !== begin) reject("BENCHMARK_SAMPLE_FRAME_INVALID", "Timed SQL sample start marker is missing or out of order.");
    const payload = [], timings = [];
    while (cursor < lines.length && lines[cursor] !== end) {
      const line = lines[cursor++];
      const timing = line.match(TIMING);
      if (timing) timings.push(Number(timing[1]));
      else payload.push(line);
    }
    if (lines[cursor++] !== end) reject("BENCHMARK_SAMPLE_FRAME_INVALID", "Timed SQL sample end marker is missing.");
    if (timings.length > 1 || (timings.length && stderrTimings.length)) {
      reject("BENCHMARK_SAMPLE_TIMING_INVALID", "Timed SQL sample has duplicate or ambiguous timings.");
    }
    const elapsed = timings[0] ?? stderrTimings[index];
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      reject("BENCHMARK_SAMPLE_TIMING_INVALID", "Timed SQL sample does not have one valid timing.");
    }
    try {
      const validated = validateResult(payload.join("\n").trim(), index);
      if (validated === false || validated?.then) {
        reject("BENCHMARK_SAMPLE_REJECTED", "Timed SQL validation must succeed synchronously.");
      }
    } catch (error) {
      const code = error instanceof BenchmarkResultError ? error.code : "BENCHMARK_SAMPLE_REJECTED";
      reject(code, `Timed SQL sample ${index + 1} failed semantic validation; result payload withheld.`);
    }
    values.push(elapsed);
  }
  if (lines.slice(cursor).some(line => line.trim()) ||
      (stderrTimings.length && stderrTimings.length !== count)) {
    reject("BENCHMARK_SAMPLE_COUNT_INVALID", "Timed SQL result or timing count differs from the requested sample count.");
  }
  return values;
}
