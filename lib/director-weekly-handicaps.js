const clean = (value) => String(value ?? "").trim();
const SIGNED_DECIMAL = /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function weeklyHandicapNumber(value) {
  const decimal = weeklyHandicapDecimal(value);
  if (decimal === null) return null;
  const number = Number(decimal);
  return Number.isFinite(number) ? number : null;
}

export function weeklyHandicapDecimal(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const source = clean(value);
  if (source.length > 120 || !SIGNED_DECIMAL.test(source)) return null;
  const negative = source.startsWith("-");
  const unsigned = source.replace(/^[+-]/, "");
  let [whole, fraction = ""] = unsigned.split(".");
  whole = whole.replace(/^0+(?=\d)/, "") || "0";
  fraction = fraction.replace(/0+$/, "");
  const zero = whole === "0" && !fraction;
  return `${negative && !zero ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function weeklyHandicapInputError(value) {
  if (clean(value) === "") return "Enter a proposed handicap.";
  return weeklyHandicapDecimal(value) === null || weeklyHandicapNumber(value) === null
    ? "Enter a valid signed decimal handicap."
    : "";
}

export function weeklyHandicapDecimalDifference(nextValue, priorValue) {
  const next = weeklyHandicapDecimal(nextValue);
  const prior = weeklyHandicapDecimal(priorValue);
  if (next === null || prior === null) return null;
  const scale = Math.max(next.split(".")[1]?.length || 0, prior.split(".")[1]?.length || 0);
  const units = (value) => {
    const negative = value.startsWith("-");
    const unsigned = value.replace(/^-/, "");
    const [whole, fraction = ""] = unsigned.split(".");
    const amount = BigInt(whole) * (10n ** BigInt(scale)) +
      BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
    return negative ? -amount : amount;
  };
  const difference = units(next) - units(prior);
  const negative = difference < 0n;
  const absolute = negative ? -difference : difference;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = scale
    ? String(absolute % divisor).padStart(scale, "0").replace(/0+$/, "")
    : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function normalizeAffectedMatch(match = {}) {
  const status = clean(firstDefined(match.status, match.matchStatus, match.match_status)).toUpperCase() || "SCHEDULED";
  const snapshotAction = clean(firstDefined(match.snapshotAction, match.snapshot_action)).toUpperCase();
  const started = firstDefined(match.started, match.hasStarted, match.has_started) === true ||
    snapshotAction === "PRESERVE_FROZEN";
  const frozen = firstDefined(match.frozen, match.snapshotFrozen, match.snapshot_frozen) === true
    || snapshotAction === "PRESERVE_FROZEN" || started || ["LIVE", "FINAL", "REOPENED"].includes(status);
  const safeToRefreshValue = firstDefined(match.safeToRefresh, match.safe_to_refresh);
  return {
    matchId: clean(firstDefined(match.matchId, match.match_id, match.id)),
    roundNumber: Number(firstDefined(match.roundNumber, match.round_number, match.round)) || null,
    matchNumber: Number(firstDefined(match.matchNumber, match.match_number, match.match)) || null,
    status,
    started,
    frozen,
    safeToRefresh: safeToRefreshValue === undefined || safeToRefreshValue === null
      ? snapshotAction === "REFRESH_IF_CHANGED" || !frozen
      : safeToRefreshValue === true,
    affectedPlayerIds: (firstDefined(match.affectedPlayerIds, match.affected_player_ids) || [])
      .map((playerId) => clean(playerId))
      .filter(Boolean),
  };
}

function normalizeValidatedPlayer(player = {}) {
  const playerId = clean(firstDefined(player.playerId, player.player_id));
  return {
    playerId,
    displayName: clean(firstDefined(player.displayName, player.display_name)) || playerId,
    currentHandicapDecimal: weeklyHandicapDecimal(firstDefined(
      player.currentHandicapDecimal,
      player.current_handicap_decimal,
      player.oldHandicap,
      player.old_handicap,
    )),
    proposedDecimal: weeklyHandicapDecimal(firstDefined(
      player.proposedDecimal,
      player.proposed_decimal,
      player.newHandicap,
      player.new_handicap,
    )),
    change: weeklyHandicapDecimal(firstDefined(player.change, player.delta)),
  };
}

function normalizeValidationPlan(validation = {}) {
  const unstartedMatches = (firstDefined(
    validation.unstartedMatches,
    validation.unstarted_matches,
  ) || []).map((match) => normalizeAffectedMatch({
    ...match,
    safe_to_refresh: true,
    snapshot_action: "REFRESH_IF_CHANGED",
  })).filter((match) => match.matchId);
  const startedFrozenMatches = (firstDefined(
    validation.startedFrozenMatches,
    validation.started_frozen_matches,
  ) || []).map((match) => normalizeAffectedMatch({
    ...match,
    started: true,
    frozen: true,
    safe_to_refresh: false,
    snapshot_action: "PRESERVE_FROZEN",
  })).filter((match) => match.matchId);
  const summary = firstDefined(validation.summary, {}) || {};
  const changedPlayerCount = Number(firstDefined(
    summary.changedPlayerCount,
    summary.changed_player_count,
  ));
  const refreshableMatchCount = Number(firstDefined(
    summary.refreshableMatchCount,
    summary.unstartedRefreshCount,
    summary.unstarted_refresh_count,
  ));
  const frozenMatchCount = Number(firstDefined(
    summary.frozenMatchCount,
    summary.startedPreservedCount,
    summary.started_preserved_count,
  ));
  return {
    changedPlayers: (firstDefined(validation.changedPlayers, validation.changed_players) || [])
      .map(normalizeValidatedPlayer)
      .filter((player) => player.playerId),
    unstartedMatches,
    startedFrozenMatches,
    summary: {
      changedPlayerCount: Number.isSafeInteger(changedPlayerCount) ? changedPlayerCount : null,
      refreshableMatchCount: Number.isSafeInteger(refreshableMatchCount) ? refreshableMatchCount : null,
      frozenMatchCount: Number.isSafeInteger(frozenMatchCount) ? frozenMatchCount : null,
      affectedMatchCount: Number.isSafeInteger(refreshableMatchCount) && Number.isSafeInteger(frozenMatchCount)
        ? refreshableMatchCount + frozenMatchCount
        : null,
    },
  };
}

export function normalizeWeeklyHandicapPlayer(player = {}) {
  const playerId = clean(firstDefined(player.playerId, player.player_id, player.id));
  const currentHandicapValue = firstDefined(
    player.currentHandicapDecimal,
    player.current_handicap_decimal,
    player.tournamentHandicapDecimal,
    player.tournament_handicap_decimal,
    player.currentHandicap,
    player.current_handicap,
    player.tournamentHandicap,
    player.tournament_handicap,
  );
  const currentHandicapDecimal = weeklyHandicapDecimal(currentHandicapValue);
  const currentHandicap = weeklyHandicapNumber(currentHandicapValue);
  const sourceIndexDecimal = weeklyHandicapDecimal(firstDefined(
    player.sourceIndexDecimal,
    player.source_index_decimal,
    player.sourceIndex,
    player.source_index,
  ));
  const lowIndexDecimal = weeklyHandicapDecimal(firstDefined(
    player.lowIndexDecimal,
    player.low_index_decimal,
    player.lowIndex,
    player.low_index,
  ));
  return {
    playerId,
    displayName: clean(firstDefined(player.displayName, player.display_name, player.name)) || playerId,
    teamName: clean(firstDefined(player.teamName, player.team_name, player.teamId, player.team_id)),
    currentHandicap,
    currentHandicapDecimal,
    sourceIndexDecimal,
    lowIndexDecimal,
    affectedMatches: (firstDefined(player.affectedMatches, player.affected_matches) || [])
      .map(normalizeAffectedMatch)
      .filter((match) => match.matchId),
  };
}

function normalizeHistoryEntry(entry = {}) {
  const receipts = Array.isArray(entry.receipts) ? entry.receipts : [];
  const receipt = firstDefined(
    entry.receipt,
    entry.auditReceipt,
    entry.audit_receipt,
    receipts.find((item) => clean(item.operation).toUpperCase() === "APPROVE"),
    receipts.at(-1),
  ) || {};
  return {
    revisionId: clean(firstDefined(entry.revisionId, entry.revision_id, entry.id)),
    revision: Number(firstDefined(entry.revision, entry.revisionNumber, entry.revision_number)) || null,
    status: clean(entry.status).toUpperCase() || "UNKNOWN",
    effectiveDate: clean(firstDefined(entry.effectiveDate, entry.effective_date)),
    changedPlayerCount: Number(firstDefined(entry.changedPlayerCount, entry.changed_player_count)) || 0,
    affectedMatchCount: Number(firstDefined(entry.affectedMatchCount, entry.affected_match_count)) || 0,
    stagedAt: clean(firstDefined(entry.stagedAt, entry.staged_at, entry.createdAt, entry.created_at)),
    approvedAt: clean(firstDefined(entry.approvedAt, entry.approved_at)),
    actorDisplay: clean(firstDefined(entry.actorDisplay, entry.actor_display, entry.approvedBy, entry.approved_by, entry.stagedBy, entry.staged_by)),
    receipt: {
      receiptId: clean(firstDefined(receipt.receiptId, receipt.receipt_id, receipt.requestId, receipt.request_id)),
      payloadHash: clean(firstDefined(receipt.payloadHash, receipt.payload_hash)),
    },
  };
}

export function normalizeWeeklyHandicapPayload(payload = {}) {
  const value = payload.data || payload.result || payload;
  const current = value.current || value.currentRevision || value.current_revision || {};
  const revisionValue = firstDefined(
    value.currentRevisionNumber,
    value.current_revision_number,
    typeof value.current_revision === "number" ? value.current_revision : undefined,
    typeof value.revision === "number" ? value.revision : undefined,
    current.revision,
    current.revisionNumber,
    current.revision_number,
  );
  const sourceValue = firstDefined(value.sourceEvidence, value.source_evidence, {}) || {};
  const sourcePlayers = (firstDefined(sourceValue.players, []) || []).map((player) => ({
    playerId: clean(firstDefined(player.playerId, player.player_id)),
    displayName: clean(firstDefined(player.displayName, player.display_name)),
    identityId: clean(firstDefined(player.identityId, player.identity_id)),
    maskedGhinNumber: clean(firstDefined(player.maskedGhinNumber, player.masked_ghin_number)),
    identityStatus: clean(firstDefined(player.identityStatus, player.identity_status)).toUpperCase(),
    pointerRevision: Number(firstDefined(player.pointerRevision, player.pointer_revision)) || 0,
    observationId: clean(firstDefined(player.observationId, player.observation_id)),
    currentIndexDecimal: weeklyHandicapDecimal(firstDefined(player.currentIndex, player.current_index)),
    lowIndexDecimal: weeklyHandicapDecimal(firstDefined(player.lowIndex, player.low_index)),
    lowIndexDate: clean(firstDefined(player.lowIndexDate, player.low_index_date)),
    hybridDecimal: weeklyHandicapDecimal(firstDefined(player.hybrid, player.hybrid_handicap)),
    provenance: clean(player.provenance).toUpperCase(),
    observedAt: clean(firstDefined(player.observedAt, player.observed_at)),
    sourceState: clean(firstDefined(player.sourceState, player.source_state)).toUpperCase() || "MISSING_MAPPING",
    stale: firstDefined(player.stale, player.is_stale) === true,
    observationCount: Number(firstDefined(player.observationCount, player.observation_count)) || 0,
  })).filter((player) => player.playerId);
  return {
    tournamentId: clean(firstDefined(value.tournamentId, value.tournament_id)),
    tournamentYear: Number(firstDefined(value.tournamentYear, value.tournament_year)) || null,
    revision: Number(revisionValue) || 0,
    suggestedEffectiveDate: clean(firstDefined(value.suggestedEffectiveDate, value.suggested_effective_date)),
    players: (value.players || []).map(normalizeWeeklyHandicapPlayer).filter((player) => player.playerId),
    history: (value.history || []).map(normalizeHistoryEntry),
    sourceEvidence: {
      contractVersion: clean(firstDefined(sourceValue.contractVersion, sourceValue.contract_version)),
      sourceFingerprint: clean(firstDefined(sourceValue.sourceFingerprint, sourceValue.source_fingerprint)),
      coverageCount: Number(firstDefined(sourceValue.coverageCount, sourceValue.coverage_count)) || 0,
      rosterCount: Number(firstDefined(sourceValue.rosterCount, sourceValue.roster_count)) || 0,
      complete: firstDefined(sourceValue.complete, sourceValue.coverage_complete) === true,
      autoRefresh: "DISABLED_AWAITING_PROVIDER_AUTHORIZATION",
      players: sourcePlayers,
    },
  };
}

export function weeklyHandicapDraftRows(players = [], proposals = {}) {
  return players.map((player) => {
    const currentHandicapDecimal = player.currentHandicapDecimal ??
      weeklyHandicapDecimal(player.currentHandicap);
    const proposedInput = Object.hasOwn(proposals, player.playerId)
      ? clean(proposals[player.playerId])
      : currentHandicapDecimal ?? (player.currentHandicap === null ? "" : String(player.currentHandicap));
    const proposedDecimal = weeklyHandicapDecimal(proposedInput);
    const proposedHandicap = weeklyHandicapNumber(proposedInput);
    const error = weeklyHandicapInputError(proposedInput);
    const changed = !error && (
      currentHandicapDecimal === null || proposedDecimal !== currentHandicapDecimal
    );
    return {
      ...player,
      currentHandicapDecimal,
      proposedInput,
      proposedDecimal,
      proposedHandicap,
      error,
      changed,
      change: changed && currentHandicapDecimal !== null
        ? weeklyHandicapDecimalDifference(proposedDecimal, currentHandicapDecimal)
        : null,
    };
  });
}

export function weeklyHandicapDraftSummary(rows = []) {
  const changedRows = rows.filter((row) => row.changed);
  const invalidPlayerCount = rows.filter((row) => Boolean(row.error)).length;
  const affectedMatchIds = new Set(changedRows.flatMap((row) => row.affectedMatches.map((match) => match.matchId)));
  const frozenMatchIds = new Set(changedRows.flatMap((row) => row.affectedMatches
    .filter((match) => match.frozen || match.started || !match.safeToRefresh)
    .map((match) => match.matchId)));
  const refreshableMatchIds = new Set(changedRows.flatMap((row) => row.affectedMatches
    .filter((match) => match.safeToRefresh && !match.frozen && !match.started)
    .map((match) => match.matchId)));
  return {
    playerCount: rows.length,
    changedPlayerCount: changedRows.length,
    unchangedPlayerCount: rows.length - changedRows.length - invalidPlayerCount,
    invalidPlayerCount,
    affectedMatchCount: affectedMatchIds.size,
    refreshableMatchCount: refreshableMatchIds.size,
    frozenMatchCount: frozenMatchIds.size,
  };
}

function bulkParts(line) {
  if (line.includes("\t")) return line.split("\t").map(clean);
  if (line.includes(",")) return line.split(",").map(clean);
  return line.split(/\s+/).map(clean);
}

export function parseWeeklyHandicapBulkPaste(value, players = []) {
  const playerIds = new Set(players.map((player) => player.playerId));
  const updates = {};
  const errors = [];
  const seen = new Set();
  const lines = String(value ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = clean(lines[index]);
    if (!line) continue;
    const parts = bulkParts(line);
    if (index === 0 && /^player(?:\s*id)?$/i.test(parts[0]) && /handicap/i.test(parts[1] || "")) continue;
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errors.push(`Line ${index + 1}: use Player ID and handicap.`);
      continue;
    }
    const playerId = parts[0].toUpperCase();
    if (!playerIds.has(playerId)) {
      errors.push(`Line ${index + 1}: ${playerId} is not on this roster.`);
      continue;
    }
    if (seen.has(playerId)) {
      errors.push(`Line ${index + 1}: ${playerId} appears more than once.`);
      continue;
    }
    const error = weeklyHandicapInputError(parts[1]);
    if (error) {
      errors.push(`Line ${index + 1}: ${playerId} needs a numeric handicap.`);
      continue;
    }
    seen.add(playerId);
    updates[playerId] = parts[1];
  }
  return { updates, errors };
}

export function weeklyHandicapRevisionFromResponse(payload = {}) {
  const value = payload.data || payload.result || payload;
  const nestedRevision = value.stagedRevision || value.validatedRevision;
  const revision = nestedRevision && typeof nestedRevision === "object" ? nestedRevision : value;
  const validation = firstDefined(revision.validation, value.validation) || {};
  return {
    revisionId: clean(firstDefined(revision.revisionId, revision.revision_id, revision.id)),
    revision: Number(firstDefined(
      revision.revision,
      revision.revisionNumber,
      revision.revision_number,
      value.revision,
    )) || null,
    valid: firstDefined(validation.valid, revision.valid, value.valid) !== false,
    issues: firstDefined(
      validation.issues,
      revision.issues,
      revision.validationIssues,
      revision.validation_issues,
      value.issues,
      value.validationIssues,
    ) || [],
    validation: normalizeValidationPlan(validation),
    receipt: firstDefined(value.receipt, revision.receipt) || null,
  };
}
