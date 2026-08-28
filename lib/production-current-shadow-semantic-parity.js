import { canonicalAuthorityFingerprint } from "./scoring-authority-supabase.js";
import { canonicalJson } from "./scoring-shadow.js";

export const PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT =
  "production-current-shadow-semantic-parity-v1";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const rows = (value, key) => Array.isArray(value?.[key]) ? value[key] : [];
const parityError = (message) => {
  const error = new Error(message);
  error.code = "PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_INVALID";
  return error;
};
const requiredText = (value, label) => {
  const token = clean(value);
  if (!token) throw parityError(`Missing required semantic ${label}.`);
  return token;
};
const canonicalValue = (value, fallback) => value == null
  ? fallback
  : JSON.parse(canonicalJson(value));
const nullableNumber = (value) => {
  if (value == null || clean(value) === "") return null;
  if (!Number.isFinite(Number(value))) {
    throw parityError(`Invalid nullable semantic number: ${clean(value)}`);
  }
  return Number(value);
};
const requiredNumber = (value) => {
  if (value == null || clean(value) === "" || !Number.isFinite(Number(value))) {
    throw parityError(`Invalid required semantic number: ${clean(value) || "<blank>"}`);
  }
  return Number(value);
};
const semanticBoolean = (value) => {
  if (value === true || value === false) return value;
  if (/^(?:true|1|yes|on)$/i.test(clean(value))) return true;
  if (/^(?:false|0|no|off)$/i.test(clean(value))) return false;
  throw parityError(`Invalid required semantic boolean: ${clean(value) || "<blank>"}`);
};
const semanticInstant = (value) => {
  const token = clean(value);
  if (!token) return null;
  const timestamp = Date.parse(token);
  if (!Number.isFinite(timestamp)) {
    throw parityError(`Invalid semantic timestamp: ${token}`);
  }
  return new Date(timestamp).toISOString();
};
const sortTuple = (value) => Array.isArray(value) ? value : [value];
const compareSortValues = (left, right) => {
  const leftTuple = sortTuple(left);
  const rightTuple = sortTuple(right);
  const length = Math.max(leftTuple.length, rightTuple.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftTuple[index];
    const rightValue = rightTuple[index];
    if (leftValue === rightValue) continue;
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return leftValue < rightValue ? -1 : 1;
    }
    const leftToken = clean(leftValue);
    const rightToken = clean(rightValue);
    if (leftToken !== rightToken) return leftToken < rightToken ? -1 : 1;
  }
  return 0;
};
const sorted = (values, key) => [...values].sort((left, right) =>
  compareSortValues(key(left), key(right))
);
const sortedUnique = (
  values,
  sortKey,
  group,
  uniqueKeys = [{ key: (row) => canonicalJson(sortTuple(sortKey(row))), group }],
) => {
  const result = sorted(values, sortKey);
  const seenByKey = uniqueKeys.map(({ key, group: keyGroup }) => ({
    key,
    group: keyGroup,
    seen: new Set(),
  }));
  for (const row of result) {
    for (const definition of seenByKey) {
      const rowKey = definition.key(row);
      if (!clean(rowKey) || definition.seen.has(rowKey)) {
        throw parityError(
          `Invalid or duplicate ${definition.group} semantic key: ${clean(rowKey) || "<blank>"}`,
        );
      }
      definition.seen.add(rowKey);
    }
  }
  return result;
};
const numericArray = (value) => {
  if (!Array.isArray(value)) {
    throw parityError("A semantic scoring array is required.");
  }
  return value.map((item) => requiredNumber(item));
};

function semanticIdentityReconciliation(value = {}) {
  return {
    current_only_player_ids: sortedUnique(
      Array.isArray(value.current_only_player_ids) ? value.current_only_player_ids : [],
      (row) => clean(row?.player_id),
      "identity-player",
    ).map((row) => ({
      player_id: clean(row.player_id),
      player_source_present: semanticBoolean(row.player_source_present),
      roster_source_present: semanticBoolean(row.roster_source_present),
    })),
    historical_appearances_inferred: semanticBoolean(value.historical_appearances_inferred),
    join_key: clean(value.join_key),
    missing_player_source_ids: [...new Set(
      Array.isArray(value.missing_player_source_ids)
        ? value.missing_player_source_ids.map(clean).filter(Boolean)
        : [],
    )].sort(),
    unresolved_current_only_ids: [...new Set(
      Array.isArray(value.unresolved_current_only_ids)
        ? value.unresolved_current_only_ids.map(clean).filter(Boolean)
        : [],
    )].sort(),
  };
}

/**
 * Builds the versioned factual parity surface shared by fresh Google payloads
 * and the Production Supabase readback. Only explicitly listed fields enter
 * the fingerprint. Generated capture/import/checkpoint timestamps, derived
 * hashes that contain those timestamps, and ingress/control-plane state are
 * deliberately outside this tournament-fact contract.
 */
export function productionCurrentShadowSemanticProjection(value = {}) {
  const tournament = value.tournament || {};
  const pairingState = value.pairing_state ?? value.pairing_contract?.state;
  const identity = value.identity_reconciliation || {};

  return {
    contract_version: PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
    tournament: {
      tournament_id: requiredText(tournament.tournament_id, "tournament ID"),
      tournament_year: requiredNumber(tournament.tournament_year),
      name: clean(tournament.name),
      source_workbook_id: clean(tournament.source_workbook_id || value.source_workbook_id),
      scoring_authority: upper(requiredText(
        tournament.scoring_authority,
        "scoring authority",
      )),
      lifecycle: upper(tournament.lifecycle),
      current_round: requiredNumber(tournament.current_round),
      team_1_score: requiredNumber(tournament.team_1_score),
      team_2_score: requiredNumber(tournament.team_2_score),
      live_message: clean(tournament.live_message),
    },
    players: sortedUnique(
      rows(value, "players"),
      (row) => [clean(row.player_id)],
      "player",
    ).map((row) => ({
      player_id: clean(row.player_id),
      display_name: clean(row.display_name),
      slug: clean(row.slug ?? row.source_payload?.Slug),
      active: clean(row.active ?? row.source_payload?.Active),
    })),
    teams: sortedUnique(
      rows(value, "teams"),
      (row) => [requiredNumber(row.team_side), clean(row.team_id)],
      "team",
      [
        {
          key: (row) => `${clean(row.tournament_id)}:${clean(row.team_id)}`,
          group: "team ID",
        },
        {
          key: (row) => `${clean(row.tournament_id)}:${requiredNumber(row.team_side)}`,
          group: "team side",
        },
      ],
    ).map((row) => ({
      tournament_id: clean(row.tournament_id),
      team_id: clean(row.team_id),
      team_side: requiredNumber(row.team_side),
      name: clean(row.name),
      captain_player_id: clean(row.captain_player_id ?? row.source_payload?.Captain),
    })),
    tournament_players: sortedUnique(
      rows(value, "tournament_players"),
      (row) => [requiredNumber(row.team_side), clean(row.player_id)],
      "tournament-player",
      [{
        key: (row) => `${clean(row.tournament_id)}:${clean(row.player_id)}`,
        group: "tournament-player ID",
      }],
    ).map((row) => ({
      tournament_id: clean(row.tournament_id),
      player_id: clean(row.player_id),
      team_id: clean(row.team_id),
      team_side: requiredNumber(row.team_side),
      participation_status: upper(row.participation_status),
      source_roster_key: clean(row.source_roster_key),
      tournament_handicap: nullableNumber(
        row.tournament_handicap ?? row.source_payload?.["Tournament Handicap"],
      ),
    })),
    rounds: sortedUnique(
      rows(value, "rounds"),
      (row) => [requiredNumber(row.round_number)],
      "round",
    ).map((row) => ({
      tournament_id: clean(row.tournament_id),
      round_number: requiredNumber(row.round_number),
      format: upper(row.format),
      name: clean(row.name),
      handicap_allowance: nullableNumber(row.handicap_allowance),
      status: upper(row.status),
    })),
    rules: sortedUnique(
      rows(value, "rules"),
      (row) => [requiredNumber(row.round_number)],
      "rule",
    ).map((row) => ({
      tournament_id: clean(row.tournament_id),
      round_number: requiredNumber(row.round_number),
      format: upper(row.format),
      points_available: requiredNumber(row.points_available),
    })),
    pairing_state: upper(pairingState),
    identity_reconciliation: semanticIdentityReconciliation(identity),
    snapshots: sortedUnique(
      rows(value, "snapshots"),
      (row) => [clean(row.snapshot_id)],
      "snapshot",
    ).map((row) => ({
      snapshot_id: clean(row.snapshot_id),
      tournament_id: clean(row.tournament_id),
      match_id: clean(row.match_id),
      snapshot_revision: requiredNumber(row.snapshot_revision),
      scoring_rules_version: clean(row.scoring_rules_version),
      format: upper(row.format),
      handicap_allowance: nullableNumber(row.handicap_allowance),
      course_id: clean(row.course_id),
      tee: clean(row.tee),
      rating: nullableNumber(row.rating),
      slope: nullableNumber(row.slope),
      par: requiredNumber(row.par),
      match_netting_baseline: clean(row.match_netting_baseline),
      hole_definitions: canonicalValue(row.hole_definitions, []),
      participant_configuration: canonicalValue(row.participant_configuration, {}),
      team_configuration: canonicalValue(row.team_configuration, {}),
    })),
    matches: sortedUnique(
      rows(value, "matches"),
      (row) => [clean(row.match_id)],
      "match",
    ).map((row) => ({
      match_id: clean(row.match_id),
      tournament_id: clean(row.tournament_id),
      round_number: requiredNumber(row.round_number),
      format: upper(row.format),
      scoring_snapshot_id: clean(row.scoring_snapshot_id),
      status: upper(row.status),
      scoring_locked: semanticBoolean(row.scoring_locked),
      permission_revision: requiredNumber(row.permission_revision),
      match_revision: requiredNumber(row.match_revision),
      source_google_revision: requiredNumber(row.source_google_revision),
      scored_holes: requiredNumber(row.scored_holes),
      current_hole: requiredNumber(row.current_hole),
      holes_remaining: requiredNumber(row.holes_remaining),
      team_1_holes_won: requiredNumber(row.team_1_holes_won),
      team_2_holes_won: requiredNumber(row.team_2_holes_won),
      running_result: clean(row.running_result),
      result_winner: clean(row.result_winner),
      clinched: semanticBoolean(row.clinched),
      scorecard_complete: semanticBoolean(row.scorecard_complete),
      unresolved_mutations: requiredNumber(row.unresolved_mutations),
      finalized_at: semanticInstant(row.finalized_at),
    })),
    match_participants: sortedUnique(
      rows(value, "match_participants"),
      (row) => [
        clean(row.match_id),
        requiredNumber(row.team_side),
        requiredNumber(row.player_slot),
        clean(row.player_id),
      ],
      "match-participant",
      [
        {
          key: (row) => `${clean(row.match_id)}:${requiredNumber(row.team_side)}:${requiredNumber(row.player_slot)}`,
          group: "match-participant slot",
        },
        {
          key: (row) => `${clean(row.match_id)}:${clean(row.player_id)}`,
          group: "match-participant player",
        },
      ],
    ).map((row) => ({
      match_id: clean(row.match_id),
      player_id: clean(row.player_id),
      team_side: requiredNumber(row.team_side),
      player_slot: requiredNumber(row.player_slot),
      handicap_index: nullableNumber(row.handicap_index),
      course_handicap: nullableNumber(row.course_handicap),
      playing_handicap: requiredNumber(row.playing_handicap),
      final_strokes: requiredNumber(row.final_strokes),
    })),
    permissions: sortedUnique(
      rows(value, "permissions"),
      (row) => [clean(row.match_id), clean(row.player_id)],
      "permission",
    ).map((row) => ({
      match_id: clean(row.match_id),
      player_id: clean(row.player_id),
      can_score: semanticBoolean(row.can_score),
      permission_revision: requiredNumber(row.permission_revision),
      revoked_at: semanticInstant(row.revoked_at),
    })),
    match_holes: sortedUnique(
      rows(value, "match_holes"),
      (row) => [clean(row.match_id), requiredNumber(row.hole_number)],
      "match-hole",
    ).map((row) => ({
      match_id: clean(row.match_id),
      hole_number: requiredNumber(row.hole_number),
      snapshot_id: clean(row.snapshot_id),
      stroke_index: requiredNumber(row.stroke_index),
      par: requiredNumber(row.par),
      yardage: nullableNumber(row.yardage),
    })),
    hole_scores: sortedUnique(
      rows(value, "hole_scores"),
      (row) => [clean(row.match_id), requiredNumber(row.hole_number)],
      "hole-score",
    ).map((row) => ({
      match_id: clean(row.match_id),
      hole_number: requiredNumber(row.hole_number),
      hole_revision: requiredNumber(row.hole_revision),
      team_1_gross_scores: numericArray(row.team_1_gross_scores),
      team_2_gross_scores: numericArray(row.team_2_gross_scores),
      team_1_strokes: numericArray(row.team_1_strokes),
      team_2_strokes: numericArray(row.team_2_strokes),
      team_1_net_score: requiredNumber(row.team_1_net_score),
      team_2_net_score: requiredNumber(row.team_2_net_score),
      hole_winner: clean(row.hole_winner),
      source_google_revision: requiredNumber(row.source_google_revision),
      mutation_key: clean(row.mutation_key),
      actor_id: clean(row.actor_id),
    })),
    checkpoints: sortedUnique(
      rows(value, "checkpoints"),
      (row) => [clean(row.match_id)],
      "checkpoint",
    ).map((row) => ({
      match_id: clean(row.match_id),
      last_supabase_match_revision: requiredNumber(row.last_supabase_match_revision),
      google_match_revision: requiredNumber(row.google_match_revision),
      google_hole_revisions: canonicalValue(row.google_hole_revisions, {}),
    })),
  };
}

export function productionCurrentShadowSemanticFingerprint(value = {}) {
  return canonicalAuthorityFingerprint(productionCurrentShadowSemanticProjection(value));
}

export function compareProductionCurrentShadowSemanticParity(
  googlePayload = {},
  supabaseSemanticData = {},
) {
  const googleFingerprint = productionCurrentShadowSemanticFingerprint(googlePayload);
  const supabaseFingerprint = productionCurrentShadowSemanticFingerprint(supabaseSemanticData);
  return {
    contractVersion: PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
    googleFingerprint,
    supabaseFingerprint,
    parity: googleFingerprint === supabaseFingerprint,
  };
}
