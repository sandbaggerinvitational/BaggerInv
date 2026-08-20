import { randomUUID } from "node:crypto";
import { calculateLiveHole, calculateLiveMatchStatus, calculateMatchPoints, isScorecardComplete } from "./live-hole-scoring.js";
import { grossScoresFromCell } from "./live-score-values.js";
import { buildScoringAuthorityDryRunFixture, resolveScoringAuthorityCourseSnapshot } from "./scoring-authority-dry-run.js";
import { historicalScoringSnapshotForMatch } from "./scoring-shadow-reconciliation.js";
import { canonicalJson, scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import {
  classifyScoringLifecycleConflict,
  SCORING_LIFECYCLE_CLASSIFICATIONS,
} from "./scoring-lifecycle-contract.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => ["true", "yes", "1", "active", "open", "enabled"].includes(clean(value).toLowerCase());
const records = (sheet) => (sheet?.records || []).map(({ record }) => record);
const formatCode = (value) => ({ "BEST BALL": "BB", SCRAMBLE: "SC", SINGLES: "SI" })[clean(value).toUpperCase()] || clean(value).toUpperCase();
const roundNumber = (value) => number(clean(value).replace(/\D/g, ""));
const statusCode = (value) => /final/i.test(clean(value)) ? "FINAL" : /live|reopen/i.test(clean(value)) ? "LIVE" : "UPCOMING";
const iso = (value, fallback = new Date().toISOString()) => Number.isFinite(Date.parse(clean(value))) ? new Date(clean(value)).toISOString() : fallback;

function sheetById(rows, key) {
  return new Map(rows.map((row) => [clean(row[key]), row]).filter(([id]) => id));
}

function scorePlayers(snapshot, side) {
  return (snapshot?.participants?.[`team_${side}`] || []).map((player) => ({
    id: player.id,
    strokes: number(player.final_strokes),
    playingHcp: number(player.playing_handicap),
  }));
}

function canonicalMatchState(match, holeRows, fixture) {
  const results = holeRows.map((hole) => ({ holeNumber: number(hole["Hole Number"]), winner: clean(hole["Hole Winner"]) }));
  const live = calculateLiveMatchStatus(results, fixture.format);
  const points = calculateMatchPoints(fixture.format, results);
  const complete = isScorecardComplete(results);
  const final = statusCode(match["Match Status"]) === "FINAL";
  return {
    scored_holes: new Set(results.map((item) => item.holeNumber)).size,
    current_hole: live.currentHole,
    holes_remaining: live.holesRemaining,
    team_1_holes_won: live.team1HolesWon,
    team_2_holes_won: live.team2HolesWon,
    running_result: clean(live.statusText || match["Match Status Text"] || "Scheduled"),
    result_winner: clean(match["Matchup Winner"] || match["18-Hole Winner"] || live.winner || (complete ? points.overallWinner : "")),
    clinched: fixture.format === "SI" && Boolean(live.complete),
    scorecard_complete: complete,
    status: final ? "FINAL" : statusCode(match["Match Status"]),
    finalized_at: final ? iso(match["Finalized At"] || match["Updated At"]) : "",
  };
}

function calculateImportedHole(fixture, row) {
  const holeNumber = number(row["Hole Number"]);
  const definition = fixture.scoring_snapshot.holes.find((hole) => hole.hole_number === holeNumber);
  return calculateLiveHole({
    format: fixture.format,
    holeNumber,
    strokeIndex: number(row["Stroke Index"] || definition?.stroke_index),
    team1Players: scorePlayers(fixture.scoring_snapshot, 1),
    team2Players: scorePlayers(fixture.scoring_snapshot, 2),
    team1GrossScores: grossScoresFromCell(row["Team 1 Gross Scores"]),
    team2GrossScores: grossScoresFromCell(row["Team 2 Gross Scores"]),
    team1Strokes: number(fixture.scoring_snapshot.teams?.team_1_strokes),
    team2Strokes: number(fixture.scoring_snapshot.teams?.team_2_strokes),
  });
}

export function canonicalAuthorityFingerprint(value) {
  return scoringShadowPayloadHash(value);
}

export function scoringSnapshotParityPayload(row = {}) {
  return {
    snapshot_id: clean(row.snapshot_id),
    tournament_id: clean(row.tournament_id),
    match_id: clean(row.match_id),
    snapshot_revision: number(row.snapshot_revision),
    scoring_rules_version: clean(row.scoring_rules_version),
    format: clean(row.format),
    handicap_allowance: row.handicap_allowance == null ? "" : clean(row.handicap_allowance),
    course_id: clean(row.course_id),
    tee: clean(row.tee),
    rating: number(row.rating),
    slope: number(row.slope),
    par: number(row.par),
    match_netting_baseline: clean(row.match_netting_baseline),
    hole_definitions: row.hole_definitions || [],
    participant_configuration: row.participant_configuration || {},
    team_configuration: row.team_configuration || {},
  };
}

export function buildCanonicalScoringAuthorityImport({ sheets = {}, sourceWorkbookId, requestedBy = "Phase 2 import" } = {}) {
  const liveMatches = records(sheets["Live Matches"]);
  const archivedMatches = sheetById(records(sheets.Matches), "Match ID");
  const matchUpdateLog = records(sheets["Match Update Log"]);
  const adminAuditLog = records(sheets["Admin Audit Log"]);
  const liveHoles = records(sheets["Live Hole Scores"]);
  const courses = records(sheets.Courses);
  const courseHoles = records(sheets["Course Holes"]);
  const rounds = records(sheets.Rounds);
  const players = records(sheets.Players);
  const handicaps = records(sheets.Handicaps);
  const teamRows = records(sheets["Team Names"] || sheets.Teams);
  if (!liveMatches.length) throw new Error("The Preview workbook has no authoritative Live Matches to import.");
  const year = number(liveMatches[0].Year);
  const tournamentId = clean(liveMatches[0]["Tournament ID"] || year);
  const tournamentRows = records(sheets.Tournaments);
  const tournamentRow = tournamentRows.find((row) => number(row.Year) === year || clean(row["Tournament ID"]) === tournamentId) || {};
  const playerById = sheetById(players, "Player ID");
  const rosterRows = handicaps.filter((row) => number(row.Year) === year && clean(row["Player ID"]) && /^Team [12]$/i.test(clean(row["Team Side"])));
  const rosterIds = new Set(rosterRows.map((row) => clean(row["Player ID"])));
  const activeTeams = [1, 2].map((side) => {
    const row = teamRows.find((item) => number(item.Year) === year && number(clean(item["Team Side"]).replace(/\D/g, "")) === side) || {};
    const captainPlayerId = clean(row.Captain);
    const sourcePayload = {
      Year: year,
      "Team Side": `Team ${side}`,
      "Team ID": clean(row["Team ID"]),
      "Team Names": clean(row["Team Names"] || row["Team Name"]),
      ...(captainPlayerId ? { Captain: captainPlayerId } : {}),
    };
    return {
      tournament_id: tournamentId,
      team_id: clean(row["Team ID"] || `TEAM-${side}`),
      team_side: side,
      name: clean(row["Team Names"] || row["Team Name"] || `Team ${side}`),
      source_payload: sourcePayload,
    };
  });
  const teamBySide = new Map(activeTeams.map((team) => [team.team_side, team]));
  for (const team of activeTeams) {
    const captainPlayerId = clean(team.source_payload.Captain);
    if (!captainPlayerId) continue;
    const captainRosterRow = rosterRows.find((row) => {
      const side = number(clean(row["Team Side"]).replace(/\D/g, ""));
      const teamId = clean(row["Team ID"] || teamBySide.get(side)?.team_id);
      return clean(row["Player ID"]) === captainPlayerId && side === team.team_side && teamId === team.team_id;
    });
    if (!captainRosterRow) {
      throw new Error(`Canonical captain ${captainPlayerId} is not on the ${year} ${team.team_id} roster.`);
    }
  }
  const importedPlayers = players.filter((row) => clean(row["Player ID"])).map((row) => ({
    player_id: clean(row["Player ID"]),
    display_name: clean(row["Display Name"] || row.Name || `${row.First || ""} ${row.Last || ""}` || row["Player ID"]),
    source_payload: { Slug: clean(row.Slug), Active: clean(row.Active) },
  }));
  for (const id of rosterIds) if (!playerById.has(id)) throw new Error(`Active tournament player ${id} is missing from Players.`);
  const tournamentPlayers = rosterRows.map((row) => {
    const side = number(clean(row["Team Side"]).replace(/\D/g, ""));
    return {
      tournament_id: tournamentId,
      player_id: clean(row["Player ID"]),
      team_id: clean(row["Team ID"] || teamBySide.get(side)?.team_id),
      team_side: side,
      participation_status: "ACTIVE",
      source_roster_key: `${year}:${clean(row["Player ID"])}`,
      source_payload: { Year: year, "Player ID": clean(row["Player ID"]), "Team Side": `Team ${side}`, "Team ID": clean(row["Team ID"]), "Tournament Handicap": row["Tournament Handicap"] },
    };
  });
  if (new Set(tournamentPlayers.map((row) => row.player_id)).size !== tournamentPlayers.length) throw new Error("The authoritative tournament roster contains duplicate Player IDs.");

  const importedRounds = [1, 2, 3].map((round) => {
    const row = rounds.find((item) => number(item.Year) === year && roundNumber(item.Round) === round) || {};
    const match = liveMatches.find((item) => number(item.Round) === round) || {};
    return {
      tournament_id: tournamentId,
      round_number: round,
      format: formatCode(row.Format || row["Round Format"] || match.Format),
      name: clean(row["Round Name"] || `Round ${round}`),
      handicap_allowance: row["Handicap Allowance"] ?? "",
      status: clean(row.Status || "UPCOMING").toUpperCase(),
      source_payload: { Year: year, Round: round, Format: formatCode(row.Format || match.Format) },
    };
  });

  const holesByMatch = new Map();
  for (const hole of liveHoles) {
    const id = clean(hole["Match ID"]);
    if (!holesByMatch.has(id)) holesByMatch.set(id, []);
    holesByMatch.get(id).push(hole);
  }
  const snapshots = [];
  const matches = [];
  const matchParticipants = [];
  const permissions = [];
  const matchHoleDefinitions = [];
  const holeScores = [];
  const checkpoints = [];
  const lifecycle = liveMatches.map((current) => classifyScoringLifecycleConflict({
    current,
    archived: archivedMatches.get(clean(current["Match ID"])) || null,
    matchUpdateLog,
    adminAuditLog,
  }));
  const ambiguous = lifecycle.filter((item) => item.classification === SCORING_LIFECYCLE_CLASSIFICATIONS.AMBIGUOUS_CONFLICT);
  if (ambiguous.length) {
    const error = new Error(`Scoring import stopped: ${ambiguous.length} lifecycle conflict${ambiguous.length === 1 ? "" : "s"} lack ordered Finalize/Reopen provenance.`);
    error.code = "AMBIGUOUS_LIFECYCLE_CONFLICT";
    error.shadowDiagnostics = {
      code: error.code,
      message: error.message,
      details: JSON.stringify(ambiguous.map(({ matchId, currentStatus, archiveStatus, currentAt, finalizedAt }) => ({
        matchId, currentStatus, archiveStatus, currentAt, finalizedAt,
      }))),
    };
    throw error;
  }
  const lifecycleByMatch = new Map(lifecycle.map((item) => [item.matchId, item]));

  for (const current of liveMatches) {
    const matchId = clean(current["Match ID"]);
    const archived = archivedMatches.get(matchId) || null;
    const resolution = lifecycleByMatch.get(matchId);
    const historical = historicalScoringSnapshotForMatch(current, archived) || current;
    const resolved = resolveScoringAuthorityCourseSnapshot({ historicalMatch: historical, currentMatch: current, courses, courseHoles });
    const round = importedRounds.find((item) => item.round_number === number(current.Round)) || {};
    const fixture = buildScoringAuthorityDryRunFixture({ match: resolved.match, course: resolved.course, courseHoles: resolved.courseHoles, round, forceWritable: false });
    const snapshotRevision = Math.max(1, number(fixture.scoring_snapshot.snapshot_revision, 1));
    const snapshotId = `${matchId}:S${snapshotRevision}`;
    const snapshotCanonical = {
      tournament_id: tournamentId,
      tournament_year: year,
      round_number: fixture.round_number,
      match_id: matchId,
      format: fixture.format,
      scoring_rules_version: fixture.scoring_rules_version,
      handicap_allowance: fixture.scoring_snapshot.handicap_allowance,
      course: fixture.scoring_snapshot.course,
      holes: fixture.scoring_snapshot.holes,
      participants: fixture.scoring_snapshot.participants,
      teams: fixture.scoring_snapshot.teams,
      match_netting_baseline: fixture.scoring_snapshot.match_netting_baseline,
      snapshot_revision: snapshotRevision,
      effective_at: fixture.scoring_snapshot.effective_at,
    };
    snapshots.push({
      snapshot_id: snapshotId, tournament_id: tournamentId, match_id: matchId, snapshot_revision: snapshotRevision,
      scoring_rules_version: fixture.scoring_rules_version, format: fixture.format,
      handicap_allowance: fixture.scoring_snapshot.handicap_allowance ?? "",
      course_id: fixture.scoring_snapshot.course.course_id, tee: fixture.scoring_snapshot.course.tee,
      rating: fixture.scoring_snapshot.course.rating, slope: fixture.scoring_snapshot.course.slope,
      par: fixture.scoring_snapshot.course.par, match_netting_baseline: fixture.scoring_snapshot.match_netting_baseline,
      hole_definitions: fixture.scoring_snapshot.holes,
      participant_configuration: fixture.scoring_snapshot.participants,
      team_configuration: fixture.scoring_snapshot.teams,
      effective_at: fixture.scoring_snapshot.effective_at || fixture.scoring_snapshot.captured_at,
      canonical_hash: canonicalAuthorityFingerprint(snapshotCanonical),
    });
    const matchHoles = holesByMatch.get(matchId) || [];
    // The permanent row can preserve immutable scoring configuration. Current
    // lifecycle is selected only by the shared provenance classifier.
    const lifecycleMatch = resolution.lifecycleSource === "archive" ? archived : current;
    const state = canonicalMatchState(lifecycleMatch, matchHoles, fixture);
    const finalized = state.status === "FINAL";
    const importedMatchRevision = number(current.Revision);
    matches.push({
      match_id: matchId, tournament_id: tournamentId, round_number: fixture.round_number, format: fixture.format,
      scoring_snapshot_id: snapshotId, status: state.status, scoring_locked: finalized || truthy(current["Scoring Locked"]),
      permission_revision: Math.max(1, number(current["Access Version"], 1)), match_revision: importedMatchRevision,
      source_google_revision: number(current.Revision), ...state,
      source_google_updated_at: iso(current["Updated At"]), authority_updated_at: iso(current["Updated At"]),
    });
    for (const side of [1, 2]) for (const player of fixture.scoring_snapshot.participants[`team_${side}`]) {
      if (!rosterIds.has(player.id)) throw new Error(`Match ${matchId} includes non-roster player ${player.id}.`);
      matchParticipants.push({ match_id: matchId, player_id: player.id, team_side: side, player_slot: player.slot,
        handicap_index: player.handicap_index ?? "", course_handicap: player.course_handicap ?? "",
        playing_handicap: player.playing_handicap, final_strokes: player.final_strokes });
      permissions.push({ match_id: matchId, player_id: player.id, can_score: !finalized && truthy(current["Access Active"]),
        permission_revision: Math.max(1, number(current["Access Version"], 1)), revoked_at: "" });
    }
    for (const definition of fixture.scoring_snapshot.holes) matchHoleDefinitions.push({
      match_id: matchId, hole_number: definition.hole_number, snapshot_id: snapshotId,
      stroke_index: definition.stroke_index, par: definition.par, yardage: definition.yardage || "",
    });
    const googleHoleRevisions = {};
    for (const hole of matchHoles) {
      const calculated = calculateImportedHole(fixture, hole);
      const holeNumber = number(hole["Hole Number"]);
      const revision = number(hole.Revision);
      googleHoleRevisions[String(holeNumber)] = revision;
      holeScores.push({
        match_id: matchId, hole_number: holeNumber, hole_revision: revision,
        team_1_gross_scores: calculated.team1.grossScores.map((item) => item.grossScore),
        team_2_gross_scores: calculated.team2.grossScores.map((item) => item.grossScore),
        team_1_strokes: calculated.team1.grossScores.map((item) => item.strokes),
        team_2_strokes: calculated.team2.grossScores.map((item) => item.strokes),
        team_1_net_score: calculated.team1.netScore, team_2_net_score: calculated.team2.netScore,
        hole_winner: calculated.winner, source_google_revision: revision,
        source_google_updated_at: iso(hole["Updated At"]), mutation_key: `import:${matchId}:H${holeNumber}:R${revision}`,
        actor_id: clean(hole["Updated By"] || "Google import"),
      });
    }
    const checkpointPayload = { match_id: matchId, match_revision: importedMatchRevision,
      google_match_revision: number(current.Revision), google_match_updated_at: iso(current["Updated At"]), google_hole_revisions: googleHoleRevisions };
    checkpoints.push({ match_id: matchId, last_supabase_match_revision: importedMatchRevision,
      google_match_updated_at: checkpointPayload.google_match_updated_at, google_match_revision: checkpointPayload.google_match_revision,
      google_hole_revisions: googleHoleRevisions, verified_fingerprint: canonicalAuthorityFingerprint(checkpointPayload) });
  }

  const payload = {
    environment: "PREVIEW", source_workbook_id: clean(sourceWorkbookId), requested_by: clean(requestedBy),
    tournament: { tournament_id: tournamentId, tournament_year: year, name: clean(tournamentRow["Tournament Name"] || "Sandbagger Invitational") },
    players: importedPlayers, teams: activeTeams, tournament_players: tournamentPlayers, rounds: importedRounds,
    snapshots, matches, match_participants: matchParticipants, permissions, match_holes: matchHoleDefinitions,
    hole_scores: holeScores, checkpoints,
  };
  return { payload, fingerprint: canonicalAuthorityFingerprint(payload), lifecycle,
    counts: { players: importedPlayers.length, tournamentPlayers: tournamentPlayers.length, teams: activeTeams.length,
      rounds: importedRounds.length, matches: matches.length, snapshots: snapshots.length,
      matchParticipants: matchParticipants.length, permissions: permissions.length,
      matchHoles: matchHoleDefinitions.length, holeScores: holeScores.length } };
}

export function reconcileCanonicalScoringAuthority(expectedImport, currentState = {}) {
  const expected = expectedImport.payload || expectedImport;
  const matches = currentState.matches || [];
  const holes = currentState.holes || [];
  const expectedMatchMap = new Map(expected.matches.map((row) => [row.match_id, row]));
  const actualMatchMap = new Map(matches.map((row) => [row.match_id, row]));
  const expectedHoleMap = new Map(expected.hole_scores.map((row) => [`${row.match_id}:${row.hole_number}`, row]));
  const actualHoleMap = new Map(holes.map((row) => [`${row.match_id}:${row.hole_number}`, row]));
  const missingMatches = [...expectedMatchMap.keys()].filter((key) => !actualMatchMap.has(key));
  const orphanMatches = [...actualMatchMap.keys()].filter((key) => !expectedMatchMap.has(key));
  const missingHoles = [...expectedHoleMap.keys()].filter((key) => !actualHoleMap.has(key));
  const orphanHoles = [...actualHoleMap.keys()].filter((key) => !expectedHoleMap.has(key));
  const scoreDivergence = [];
  const revisionDivergence = [];
  for (const [key, wanted] of expectedHoleMap) {
    const current = actualHoleMap.get(key); if (!current) continue;
    const scoringFields = ["team_1_gross_scores", "team_2_gross_scores", "team_1_strokes", "team_2_strokes", "team_1_net_score", "team_2_net_score", "hole_winner"];
    if (scoringFields.some((field) => canonicalJson(current[field]) !== canonicalJson(wanted[field]))) scoreDivergence.push(key);
    if (number(current.hole_revision) !== number(wanted.hole_revision)) revisionDivergence.push(key);
  }
  const matchStateDivergence = [];
  for (const [key, wanted] of expectedMatchMap) {
    const current = actualMatchMap.get(key); if (!current) continue;
    const fields = ["round_number", "format", "status", "scoring_locked", "scored_holes", "current_hole", "holes_remaining", "team_1_holes_won", "team_2_holes_won", "running_result", "result_winner", "clinched", "scorecard_complete"];
    if (fields.some((field) => canonicalJson(current[field]) !== canonicalJson(wanted[field]))) matchStateDivergence.push(key);
  }
  const snapshotDivergence = expected.snapshots.filter((wanted) => !currentState.snapshots?.some((row) =>
    row.snapshot_id === wanted.snapshot_id &&
    canonicalAuthorityFingerprint(scoringSnapshotParityPayload(row)) === canonicalAuthorityFingerprint(scoringSnapshotParityPayload(wanted))
  )).map((row) => row.match_id);
  const permissionDivergence = expected.permissions.filter((wanted) => !currentState.permissions?.some((row) => row.match_id === wanted.match_id && row.player_id === wanted.player_id && Boolean(row.can_score) === Boolean(wanted.can_score) && number(row.permission_revision) === number(wanted.permission_revision))).map((row) => `${row.match_id}:${row.player_id}`);
  const rosterIds = new Set((currentState.players || []).map((row) => row.player_id));
  const rosterDivergence = expected.tournament_players.filter((row) => !rosterIds.has(row.player_id)).map((row) => row.player_id);
  const duplicateCurrent = (matches.length - actualMatchMap.size) + (holes.length - actualHoleMap.size);
  const report = { googleMatches: expected.matches.length, supabaseMatches: matches.length,
    googleHoles: expected.hole_scores.length, supabaseHoles: holes.length,
    missingMatches, orphanMatches, missingHoles, orphanHoles, duplicateCurrent,
    scoreDivergence, revisionDivergence, matchStateDivergence, snapshotDivergence,
    permissionDivergence, rosterDivergence };
  report.pass = !Object.entries(report).some(([key, value]) => Array.isArray(value) ? value.length : key === "duplicateCurrent" ? value : false);
  report.fingerprint = canonicalAuthorityFingerprint({
    matches: [...actualMatchMap.values()].sort((a, b) => a.match_id.localeCompare(b.match_id)),
    holes: [...actualHoleMap.values()].sort((a, b) => `${a.match_id}:${a.hole_number}`.localeCompare(`${b.match_id}:${b.hole_number}`)),
    snapshots: currentState.snapshots || [], players: currentState.players || [], permissions: currentState.permissions || [],
  });
  return report;
}

export async function replaceCanonicalScoringAuthorityImport(payload, options = {}) {
  return scoringShadowRpc("replace_preview_scoring_authority_import", { payload }, { ...options, timeoutMs: options.timeoutMs || 30_000 });
}

export async function readCanonicalScoringAuthority(input, options = {}) {
  return scoringShadowRpc("read_preview_scoring_authority", { input }, { ...options, timeoutMs: options.timeoutMs || 12_000 });
}

export async function recordPreviewScoringClientDiagnostic(input, options = {}) {
  return scoringShadowRpc("record_preview_scoring_client_diagnostic", { input }, options);
}

export async function readPreviewScoringParticipantContext(input, options = {}) {
  return scoringShadowRpc("read_preview_scoring_participant_context", { input }, { ...options, timeoutMs: options.timeoutMs || 12_000 });
}

export async function submitCanonicalHoleScore(input, options = {}) {
  return scoringShadowRpc("submit_hole_score_authoritative", { input }, options);
}

export async function finalizeCanonicalMatch(input, options = {}) {
  return scoringShadowRpc("finalize_match_authoritative", { input }, options);
}

export async function reopenCanonicalMatch(input, options = {}) {
  return scoringShadowRpc("reopen_match_authoritative", { input }, options);
}

export async function normalizeCanonicalLegacyReopen(input, options = {}) {
  return scoringShadowRpc("normalize_preview_legacy_reopen", { input }, options);
}

export async function repairCanonicalFinalizationParity(input, options = {}) {
  return scoringShadowRpc("repair_preview_finalization_parity", { input }, options);
}

export async function completeCanonicalFinalizationParityRepair(input, options = {}) {
  return scoringShadowRpc("complete_preview_finalization_parity_repair", { input }, options);
}

export async function backfillCanonicalFinalMatchLocks(input, options = {}) {
  return scoringShadowRpc("backfill_preview_final_match_locks", { input }, options);
}

export async function claimGoogleOutbox(workerId = randomUUID(), options = {}) {
  return scoringShadowRpc("claim_preview_google_outbox", { worker_id: workerId, lease_seconds: options.leaseSeconds || 30 }, options);
}

export async function completeGoogleOutbox(input, options = {}) {
  return scoringShadowRpc("complete_preview_google_outbox", { input }, options);
}

export async function failGoogleOutbox(input, options = {}) {
  return scoringShadowRpc("fail_preview_google_outbox", { input }, options);
}

export async function claimScorecardArchiveJob(workerId = randomUUID(), options = {}) {
  return scoringShadowRpc("claim_preview_scorecard_archive_job", {
    worker_id: workerId,
    lease_seconds: options.leaseSeconds || 60,
  }, options);
}

export async function completeScorecardArchiveJob(input, options = {}) {
  return scoringShadowRpc("complete_preview_scorecard_archive_job", { input }, options);
}

export async function failScorecardArchiveJob(input, options = {}) {
  return scoringShadowRpc("fail_preview_scorecard_archive_job", { input }, options);
}

export async function inspectScorecardArchiveState(input = {}, options = {}) {
  return scoringShadowRpc("inspect_preview_scorecard_archive_state", { input }, options);
}

export async function backfillFinalizedScorecardArchives(input, options = {}) {
  return scoringShadowRpc("backfill_preview_finalized_scorecard_archives", { input }, {
    ...options,
    timeoutMs: options.timeoutMs || 30_000,
  });
}

export async function configureScorecardArchiveWorker(input, options = {}) {
  return scoringShadowRpc("configure_preview_scorecard_archive_worker", { input }, options);
}

export async function prepareAuthorityEpoch(input, options = {}) {
  return scoringShadowRpc("prepare_preview_authority_epoch", { input }, options);
}

export async function beginScoringIngress(input, options = {}) {
  return scoringShadowRpc("begin_preview_scoring_ingress", { input }, options);
}

export async function completeScoringIngress(input, options = {}) {
  return scoringShadowRpc("complete_preview_scoring_ingress", { input }, options);
}

export async function abortAuthorityEpoch(input, options = {}) {
  return scoringShadowRpc("abort_preview_authority_epoch", { input }, options);
}

export async function commitAuthorityEpoch(input, options = {}) {
  return scoringShadowRpc("commit_preview_authority_epoch", { input }, options);
}

export async function inspectCanonicalAuthoritySecurity(options = {}) {
  return scoringShadowRpc("inspect_preview_scoring_authority_security", {}, options);
}
