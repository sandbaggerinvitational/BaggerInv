import { oddsWorkbookValue } from "./odds-workbook-persistence.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { ODDS_PHASES } from "./tournament-odds.js";

export const PUBLISHED_ODDS_WORKBOOK_TABS = Object.freeze(["Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results"]);
const clean = (value) => String(value ?? "").trim();
const number = (value) => value === null || value === undefined || clean(value) === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const records = (sheet) => (sheet?.records || []).map(({ record }) => record);

function exactNumber(left, right) {
  return number(left) !== null && number(left) === number(right);
}

function parsePublishedSnapshot(row = {}) {
  let payload;
  try { payload = JSON.parse(clean(row["Snapshot JSON"])); }
  catch { throw Object.assign(new Error("Odds Snapshots contains invalid published JSON."), { code: "INVALID_PUBLISHED_ODDS_JSON" }); }
  const year = number(row.Year);
  const phase = clean(row.Phase);
  const publishedAt = clean(row["Published At"]);
  if (!Number.isInteger(year) || !ODDS_PHASES.includes(phase) || number(payload.year) !== year || clean(payload.phase) !== phase || clean(payload.publishedAt) !== publishedAt) {
    throw Object.assign(new Error(`Published Odds snapshot identity does not match its ${phase || "unknown"} reporting row.`), { code: "PUBLISHED_ODDS_IDENTITY_MISMATCH" });
  }
  if (!Array.isArray(payload.teams) || !payload.teams.length || !Array.isArray(payload.players) || !payload.players.length) {
    throw Object.assign(new Error(`Published Odds snapshot ${phase} is incomplete.`), { code: "INCOMPLETE_PUBLISHED_ODDS_SNAPSHOT" });
  }
  return payload;
}

function teamDivergences(snapshot, rows) {
  const expected = snapshot.teams || [];
  const found = rows.filter((row) => number(row.Year) === number(snapshot.year) && clean(row.Phase) === clean(snapshot.phase));
  const divergences = [];
  if (found.length !== expected.length) divergences.push({ scope: "TEAM", phase: snapshot.phase, code: "ROW_COUNT", expected: expected.length, actual: found.length });
  for (const item of expected) {
    const row = found.find((candidate) => clean(candidate.Team) === clean(item.name));
    const workbookOdds = oddsWorkbookValue(item, { worksheet: "Odds Team Results", identity: { team: item.name, phase: snapshot.phase } });
    if (!row || !exactNumber(row["Win Probability"], item.probability) || clean(row["American Odds"]) !== clean(workbookOdds) || !exactNumber(row["Expected Points"], item.expectedPoints)) {
      divergences.push({ scope: "TEAM", phase: snapshot.phase, identity: clean(item.name), code: "VALUE_DIVERGENCE" });
    }
  }
  return divergences;
}

function playerDivergences(snapshot, rows) {
  const expected = snapshot.players || [];
  const found = rows.filter((row) => number(row.Year) === number(snapshot.year) && clean(row.Phase) === clean(snapshot.phase));
  const divergences = [];
  if (found.length !== expected.length) divergences.push({ scope: "PLAYER", phase: snapshot.phase, code: "ROW_COUNT", expected: expected.length, actual: found.length });
  for (const item of expected) {
    const row = found.find((candidate) => clean(candidate["Player ID"]) === clean(item.id));
    const workbookOdds = oddsWorkbookValue(item, { worksheet: "Odds Player Results", identity: { playerId: item.id, phase: snapshot.phase } });
    if (!row || clean(row.Player) !== clean(item.name) || !exactNumber(row["Top Player Probability"], item.probability)
        || clean(row["American Odds"]) !== clean(workbookOdds) || !exactNumber(row["Expected Points"], item.expectedPoints)
        || clean(row["Expected Record"]) !== clean(item.expectedRecord) || !exactNumber(row["Average Finish"], item.averageFinish)) {
      divergences.push({ scope: "PLAYER", phase: snapshot.phase, identity: clean(item.id), code: "VALUE_DIVERGENCE" });
    }
  }
  return divergences;
}

export function buildPublishedOddsImport({ sheets = {}, tournamentId, tournamentYear, sourceWorkbookId, requestedBy } = {}) {
  const year = number(tournamentYear);
  const snapshotRows = records(sheets["Odds Snapshots"]).filter((row) => number(row.Year) === year);
  const controls = records(sheets["Odds Control"]).filter((row) => number(row.Year) === year);
  if (controls.length !== 1) throw Object.assign(new Error(`Expected one Odds Control row for ${year}; found ${controls.length}.`), { code: "PUBLISHED_ODDS_CONTROL_REQUIRED" });
  const currentPhase = clean(controls[0]["Current Official Phase"]);
  if (!ODDS_PHASES.includes(currentPhase)) throw Object.assign(new Error("Odds Control has no supported current official milestone."), { code: "PUBLISHED_ODDS_CONTROL_INVALID" });
  const parsed = snapshotRows.map((row) => ({ row, payload: parsePublishedSnapshot(row) }));
  if (new Set(parsed.map(({ payload }) => payload.phase)).size !== parsed.length) throw Object.assign(new Error("Odds Snapshots has duplicate logical milestones."), { code: "DUPLICATE_PUBLISHED_ODDS_MILESTONE" });
  if (!parsed.some(({ payload }) => payload.phase === currentPhase)) throw Object.assign(new Error("Odds Control selects an incomplete or missing published milestone."), { code: "CURRENT_PUBLISHED_ODDS_MILESTONE_INCOMPLETE" });
  const teamRows = records(sheets["Odds Team Results"]);
  const playerRows = records(sheets["Odds Player Results"]);
  const snapshots = parsed.sort((a, b) => ODDS_PHASES.indexOf(a.payload.phase) - ODDS_PHASES.indexOf(b.payload.phase)).map(({ row, payload }) => {
    const teamIssues = teamDivergences(payload, teamRows);
    const playerIssues = playerDivergences(payload, playerRows);
    if (teamIssues.length || playerIssues.length) throw Object.assign(new Error(`Published Odds reporting rows diverge at ${payload.phase}.`), {
      code: "PUBLISHED_ODDS_REPORTING_DIVERGENCE", divergences: [...teamIssues, ...playerIssues],
    });
    const phaseTeamRows = teamRows.filter((item) => number(item.Year) === year && clean(item.Phase) === payload.phase);
    const phasePlayerRows = playerRows.filter((item) => number(item.Year) === year && clean(item.Phase) === payload.phase);
    const payloadHash = scoringShadowPayloadHash(payload);
    return {
      milestone: payload.phase,
      phase_order: ODDS_PHASES.indexOf(payload.phase),
      published_at: payload.publishedAt,
      published_payload: payload,
      payload_hash: payloadHash,
      source_fingerprint: clean(payload.sourceFingerprint),
      engine_version: clean(payload.engineVersion),
      engine_metadata: { iterations: number(payload.iterations), totalPointsAvailable: number(payload.totalPointsAvailable), phaseOrder: number(payload.phaseOrder) },
      google_publication_fingerprint: scoringShadowPayloadHash({ snapshotRow: row, teamRows: phaseTeamRows, playerRows: phasePlayerRows }),
      google_publication_reference: { sheets: PUBLISHED_ODDS_WORKBOOK_TABS, year, phase: payload.phase },
      publication_verified: true,
    };
  });
  const canonical = { tournamentId: clean(tournamentId), year, currentPhase, snapshots };
  return { environment: "PREVIEW", tournament_id: clean(tournamentId), source_workbook_id: clean(sourceWorkbookId),
    requested_by: clean(requestedBy || "Published Odds refresh"), current_official_milestone: currentPhase,
    import_fingerprint: scoringShadowPayloadHash(canonical), snapshots };
}

export const replacePublishedOddsSnapshots = (input, options = {}) => scoringShadowRpc("replace_preview_published_odds_snapshots", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });

export const readPublishedOddsView = ({ tournamentId, sourceWorkbookId } = {}, options = {}) => scoringShadowRpc("read_published_odds_view", {
  target_tournament_id: clean(tournamentId) || null,
  target_source_workbook_id: clean(sourceWorkbookId) || null,
}, { ...options, timeoutMs: options.timeoutMs || 8_000 });

export function publishedOddsSnapshotsFromView(view = {}) {
  return (view.snapshots || []).map((item) => item.payload).sort((left, right) => number(left.phaseOrder) - number(right.phaseOrder));
}

export function comparePublishedOddsParity(expected = [], actual = []) {
  const normalize = (rows) => rows.map((snapshot) => ({ ...snapshot })).sort((left, right) => number(left.phaseOrder) - number(right.phaseOrder));
  const left = normalize(expected); const right = normalize(actual);
  const pass = JSON.stringify(left) === JSON.stringify(right);
  return { pass, ...(pass ? {} : { expected: left, actual: right }) };
}
