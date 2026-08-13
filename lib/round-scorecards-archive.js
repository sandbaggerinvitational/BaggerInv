import { createHash } from "node:crypto";
import { scoringAuthorityEnvironment } from "./scoring-authority.js";

const clean = (value) => String(value ?? "").trim();
const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;

export const ROUND_SCORECARDS_HEADERS = [
  "Match ID", "Year", "Round", "Match", "Format", "Course ID", "Player ID", "Team ID",
  ...Array.from({ length: 18 }, (_, index) => `Hole ${index + 1}`),
  "Score Type", "Source", "Notes", "Scorecard Status",
];

export const ROUND_SCORECARDS_ARCHIVE_SOURCE = "Supabase Finalization";
export const ROUND_SCORECARDS_COMPLETE_STATUS = "Complete";
export const ROUND_SCORECARDS_REOPENED_STATUS = "Missing";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function roundScorecardsArchiveHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function roundScorecardsArchiveEnvironment(env = process.env) {
  const requested = /^(1|true|yes|on)$/i.test(clean(env.ROUND_SCORECARDS_ARCHIVE_ENABLED));
  const authority = scoringAuthorityEnvironment(env);
  const enabled = requested && authority.previewDeployment && authority.resolved === "supabase";
  return {
    requested,
    enabled,
    previewDeployment: authority.previewDeployment,
    scoringAuthority: authority.resolved,
    productionBlocked: requested && !authority.previewDeployment,
    reason: enabled ? "preview-supabase-archive"
      : !requested ? "archive-disabled"
      : !authority.previewDeployment ? "production-hard-block"
      : authority.resolved !== "supabase" ? "supabase-scoring-authority-required"
      : "archive-disabled",
  };
}

export function roundScorecardFormula(rowNumber) {
  const row = integer(rowNumber);
  if (row < 2) throw new Error("A physical Round Scorecards data-row number is required.");
  return `=CONCATENATE(B${row},"-R",C${row},"-",D${row})`;
}

function normalizedFormat(value) {
  const format = clean(value).toUpperCase();
  if (!["BB", "SC", "SI"].includes(format)) throw new Error(`Unsupported finalized scorecard format: ${format || "blank"}.`);
  return format;
}

function snapshotPayload(snapshot = {}) {
  const payload = snapshot.payload || snapshot.snapshot_payload || snapshot;
  if (!payload || typeof payload !== "object") throw new Error("A finalized scorecard snapshot payload is required.");
  return payload;
}

function teamsBySide(payload) {
  return new Map((payload.teams || []).map((team) => [integer(team.team_side), clean(team.team_id)]));
}

function participants(payload) {
  return (payload.participants || []).map((player) => ({
    player_id: clean(player.player_id),
    team_side: integer(player.team_side),
    player_slot: integer(player.player_slot),
  })).sort((left, right) => left.team_side - right.team_side || left.player_slot - right.player_slot || left.player_id.localeCompare(right.player_id));
}

function holes(payload) {
  const result = (payload.holes || []).map((hole) => ({
    hole_number: integer(hole.hole_number),
    team_1_gross_scores: Array.isArray(hole.team_1_gross_scores) ? hole.team_1_gross_scores.map(Number) : [],
    team_2_gross_scores: Array.isArray(hole.team_2_gross_scores) ? hole.team_2_gross_scores.map(Number) : [],
  })).sort((left, right) => left.hole_number - right.hole_number);
  if (result.length !== 18 || result.some((hole, index) => hole.hole_number !== index + 1)) {
    throw new Error("A finalized archive requires exactly 18 unique ordered holes.");
  }
  return result;
}

export function roundScorecardLogicalIdentity(row = {}) {
  const matchId = clean(row["Match ID"] || row.match_id);
  const scoreType = clean(row["Score Type"] || row.score_type).toUpperCase();
  const identity = scoreType === "TEAM"
    ? clean(row["Team ID"] || row.team_id)
    : clean(row["Player ID"] || row.player_id);
  if (!matchId || !identity) throw new Error("A Round Scorecards logical identity requires Match ID and Player/Team ID.");
  return `${matchId}:${scoreType === "TEAM" ? "TEAM" : "PLAYER"}:${identity}`;
}

function baseRow(payload, format, status) {
  const match = payload.match || {};
  const tournament = payload.tournament || {};
  const round = payload.round || {};
  const course = payload.course || {};
  return {
    "Match ID": clean(match.match_id || payload.match_id),
    Year: integer(tournament.year || tournament.tournament_year || payload.tournament_year),
    Round: integer(round.number || round.round_number || payload.round_number),
    Match: integer(match.display_number || match.match_number),
    Format: format,
    "Course ID": clean(course.course_id || payload.course_id),
    Source: ROUND_SCORECARDS_ARCHIVE_SOURCE,
    Notes: "",
    "Scorecard Status": status,
  };
}

function finalizedRow(base, identity, grossValues, scoreType) {
  if (grossValues.length !== 18 || grossValues.some((value) => !Number.isInteger(value) || value < 1 || value > 20)) {
    throw new Error(`Archive identity ${identity.player_id || identity.team_id} does not contain 18 valid native gross scores.`);
  }
  return {
    ...base,
    "Player ID": identity.player_id || "",
    "Team ID": identity.team_id,
    ...Object.fromEntries(grossValues.map((value, index) => [`Hole ${index + 1}`, value])),
    "Score Type": scoreType,
  };
}

export function buildRoundScorecardsArchiveRows(snapshot, { status = ROUND_SCORECARDS_COMPLETE_STATUS } = {}) {
  const payload = snapshotPayload(snapshot);
  const format = normalizedFormat(payload.match?.format || payload.round?.format || payload.format);
  if (![ROUND_SCORECARDS_COMPLETE_STATUS, ROUND_SCORECARDS_REOPENED_STATUS].includes(status)) {
    throw new Error(`Unsupported Round Scorecards archive status: ${status}.`);
  }
  const base = baseRow(payload, format, status);
  if (!base["Match ID"] || !base.Year || !base.Round || !base.Match || !base["Course ID"]) {
    throw new Error("The finalized snapshot is missing required Round Scorecards identity/configuration fields.");
  }
  const teamIds = teamsBySide(payload);
  if (!teamIds.get(1) || !teamIds.get(2)) throw new Error("The finalized snapshot requires both canonical Team IDs.");
  const playerRows = participants(payload);
  const scoreHoles = holes(payload);
  let rows;
  if (format === "SC") {
    if (playerRows.length !== 4 || playerRows.filter((player) => player.team_side === 1).length !== 2 || playerRows.filter((player) => player.team_side === 2).length !== 2) {
      throw new Error("Scramble archive identity requires two canonical participants per team.");
    }
    rows = [1, 2].map((side) => finalizedRow(base, { player_id: "", team_id: teamIds.get(side) }, scoreHoles.map((hole) => {
      const values = hole[`team_${side}_gross_scores`];
      if (values.length !== 1) throw new Error("Scramble holes require one authoritative team gross value per side.");
      return values[0];
    }), "Team"));
  } else {
    const expected = format === "BB" ? 4 : 2;
    if (playerRows.length !== expected) throw new Error(`${format} archive requires ${expected} canonical participants.`);
    rows = playerRows.map((player) => finalizedRow(base, {
      player_id: player.player_id,
      team_id: teamIds.get(player.team_side),
    }, scoreHoles.map((hole) => {
      const values = hole[`team_${player.team_side}_gross_scores`];
      const value = values[player.player_slot - 1];
      if (!Number.isInteger(value)) throw new Error(`Missing authoritative gross score for ${player.player_id}.`);
      return value;
    }), "Individual"));
  }
  const identities = rows.map(roundScorecardLogicalIdentity);
  if (new Set(identities).size !== identities.length) throw new Error("The finalized archive payload contains duplicate logical identities.");
  return rows.sort((left, right) => roundScorecardLogicalIdentity(left).localeCompare(roundScorecardLogicalIdentity(right)));
}

export function planRoundScorecardsArchiveUpsert({ expectedRows = [], existingRows = [], availableRows = [] } = {}) {
  const expected = expectedRows.map((record) => ({ record, identity: roundScorecardLogicalIdentity(record) }));
  const byIdentity = new Map();
  const sameMatch = [];
  const matchId = clean(expected[0]?.record?.["Match ID"]);
  for (const item of existingRows) {
    const record = item.record || item;
    if (clean(record["Match ID"]) !== matchId) continue;
    const wrapped = { ...item, record };
    sameMatch.push(wrapped);
    try {
      const identity = roundScorecardLogicalIdentity(record);
      if (!byIdentity.has(identity)) byIdentity.set(identity, []);
      byIdentity.get(identity).push(wrapped);
    } catch {}
  }
  const used = new Set();
  const assignments = [];
  const reusable = [...sameMatch];
  for (const wanted of expected) {
    const exact = (byIdentity.get(wanted.identity) || []).find((item) => !used.has(item.rowNumber));
    let target = exact;
    if (!target) target = reusable.find((item) => !used.has(item.rowNumber));
    if (!target) target = availableRows.find((item) => !used.has(item.rowNumber));
    if (!target?.rowNumber) throw new Error(`No safe physical Round Scorecards row is available for ${wanted.identity}.`);
    used.add(target.rowNumber);
    assignments.push({ identity: wanted.identity, rowNumber: target.rowNumber, record: wanted.record, provisionFormula: clean(target.formula) === "" });
  }
  const clearRows = sameMatch.filter((item) => !used.has(item.rowNumber)).map((item) => item.rowNumber);
  return { matchId, assignments, clearRows, expectedIdentities: expected.map((item) => item.identity).sort() };
}

export function verifyRoundScorecardsArchiveReadback({ expectedRows = [], actualRows = [], expectedFormulas = {} } = {}) {
  const expectedMap = new Map(expectedRows.map((row) => [roundScorecardLogicalIdentity(row), row]));
  const actualMap = new Map();
  const duplicates = [];
  const unexpected = [];
  const invalid = [];
  for (const item of actualRows) {
    const record = item.record || item;
    let identity;
    try { identity = roundScorecardLogicalIdentity(record); } catch {
      invalid.push({ rowNumber: item.rowNumber, matchId: clean(record["Match ID"]) });
      continue;
    }
    if (!expectedMap.has(identity)) {
      unexpected.push(identity);
      continue;
    }
    if (actualMap.has(identity)) duplicates.push(identity);
    else actualMap.set(identity, item);
  }
  const missing = [...expectedMap.keys()].filter((identity) => !actualMap.has(identity));
  const mismatches = [];
  for (const [identity, expected] of expectedMap) {
    const item = actualMap.get(identity);
    if (!item) continue;
    const actual = item.record || item;
    for (const header of ROUND_SCORECARDS_HEADERS) {
      const left = header.startsWith("Hole ") || ["Year", "Round", "Match"].includes(header)
        ? Number(expected[header]) : clean(expected[header]);
      const right = header.startsWith("Hole ") || ["Year", "Round", "Match"].includes(header)
        ? Number(actual[header]) : clean(actual[header]);
      if (left !== right) mismatches.push({ identity, field: header, expected: left, actual: right });
    }
    const wantedFormula = expectedFormulas[item.rowNumber];
    if (wantedFormula && clean(item.formula) !== wantedFormula) mismatches.push({ identity, field: "Match ID formula", expected: wantedFormula, actual: clean(item.formula) });
  }
  const canonicalRows = [...actualMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, item]) => ({
    identity,
    rowNumber: item.rowNumber,
    formula: clean(item.formula),
    record: Object.fromEntries(ROUND_SCORECARDS_HEADERS.map((header) => [header, (item.record || item)[header] ?? ""])),
  }));
  return {
    pass: !missing.length && !duplicates.length && !unexpected.length && !invalid.length && !mismatches.length && actualMap.size === expectedMap.size,
    expectedRowCount: expectedMap.size,
    actualRowCount: actualMap.size,
    missing,
    duplicates,
    unexpected,
    invalid,
    mismatches,
    expectedIdentities: [...expectedMap.keys()].sort(),
    readbackHash: roundScorecardsArchiveHash(canonicalRows),
    rows: canonicalRows,
  };
}
