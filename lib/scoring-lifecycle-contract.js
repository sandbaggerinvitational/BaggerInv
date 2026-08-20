const clean = (value) => String(value ?? "").trim();

export const SCORING_LIFECYCLE_CLASSIFICATIONS = Object.freeze({
  CONSISTENT_FINAL: "CONSISTENT_FINAL",
  CONSISTENT_LIVE: "CONSISTENT_LIVE",
  PROVEN_REOPEN: "PROVEN_REOPEN",
  STALE_MUTABLE: "STALE_MUTABLE",
  AMBIGUOUS_CONFLICT: "AMBIGUOUS_CONFLICT",
});

const finalStatus = (value) => /^(final|finalized)$/i.test(clean(value));
const liveStatus = (value) => /^(scheduled|upcoming|live|reopened)$/i.test(clean(value));

function timestamp(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePayload(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(clean(value)); }
  catch { return {}; }
}

function eventForMatch(row = {}, matchId) {
  return clean(row["Match ID"] || row["Record ID"] || row.match_id) === matchId;
}

function reopenEvidence(rows = [], matchId, finalizedAt) {
  return rows
    .filter((row) => eventForMatch(row, matchId))
    .map((row) => {
      const action = clean(row.Action || row.action);
      const at = timestamp(row["Updated At"] || row.created_at || row.updated_at);
      const next = parsePayload(row["New Value"] || row.next || row.after_state);
      const explicit = /(^|\b)(reopen(ed)?|legacy reopen normalized)(\b|$)/i.test(action)
        || /^(reopened|live)$/i.test(clean(next["Match Status"] || next.status || next.live?.["Match Status"]));
      return { action, at, explicit };
    })
    .filter((row) => row.explicit && row.at !== null && (finalizedAt === null || row.at > finalizedAt))
    .sort((left, right) => right.at - left.at)[0] || null;
}

/**
 * Resolve lifecycle conflicts without guessing. The permanent Matches row may
 * supply immutable scoring configuration, but it only supplies current
 * lifecycle when ordering evidence proves the mutable row is stale.
 */
export function classifyScoringLifecycleConflict({
  current = {},
  archived = null,
  matchUpdateLog = [],
  adminAuditLog = [],
} = {}) {
  const matchId = clean(current["Match ID"] || current.match_id || archived?.["Match ID"] || archived?.match_id);
  const currentStatus = clean(current["Match Status"] || current.status);
  const archiveStatus = clean(archived?.["Match Status"] || archived?.status);
  const currentFinal = finalStatus(currentStatus);
  const archiveFinal = finalStatus(archiveStatus);
  const currentAt = timestamp(current["Updated At"] || current.updated_at || current.authority_updated_at);
  const finalizedAt = timestamp(
    archived?.["Finalized At"] || archived?.["Completed At"] || archived?.finalized_at || archived?.updated_at,
  );
  const evidence = reopenEvidence([...matchUpdateLog, ...adminAuditLog], matchId, finalizedAt);

  if (currentFinal && archiveFinal) {
    return { classification: SCORING_LIFECYCLE_CLASSIFICATIONS.CONSISTENT_FINAL, matchId,
      lifecycleSource: "archive", currentStatus, archiveStatus, currentAt, finalizedAt, evidence };
  }
  if (!currentFinal && liveStatus(currentStatus) && !archiveFinal) {
    return { classification: SCORING_LIFECYCLE_CLASSIFICATIONS.CONSISTENT_LIVE, matchId,
      lifecycleSource: "mutable", currentStatus, archiveStatus, currentAt, finalizedAt, evidence };
  }
  if (!currentFinal && liveStatus(currentStatus) && archiveFinal && evidence) {
    return { classification: SCORING_LIFECYCLE_CLASSIFICATIONS.PROVEN_REOPEN, matchId,
      lifecycleSource: "mutable", currentStatus, archiveStatus, currentAt, finalizedAt, evidence };
  }
  if (!currentFinal && liveStatus(currentStatus) && archiveFinal
      && currentAt !== null && finalizedAt !== null && currentAt <= finalizedAt) {
    return { classification: SCORING_LIFECYCLE_CLASSIFICATIONS.STALE_MUTABLE, matchId,
      lifecycleSource: "archive", currentStatus, archiveStatus, currentAt, finalizedAt, evidence: null };
  }
  return { classification: SCORING_LIFECYCLE_CLASSIFICATIONS.AMBIGUOUS_CONFLICT, matchId,
    lifecycleSource: null, currentStatus, archiveStatus, currentAt, finalizedAt, evidence };
}

export function assertGenericMatchUpdateHasNoLifecycle(updates = {}) {
  if (Object.hasOwn(updates || {}, "Match Status") || Object.hasOwn(updates || {}, "status")) {
    const error = new Error("Match lifecycle changes must use the dedicated Mark Live, Finalize Match, or Reopen Match action.");
    error.code = "DEDICATED_LIFECYCLE_ACTION_REQUIRED";
    throw error;
  }
}
