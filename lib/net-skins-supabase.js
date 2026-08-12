import { calculateNetSkins, normalizeSkinsFormat } from "./net-skins.js";
import { getStrokesOnHole } from "./scorecard-net.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";

export const NET_SKINS_ENGINE_VERSION = "net-skins-js-v1";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nullableNumber = (value) => value === null || value === undefined || clean(value) === "" ? null : number(value, null);
const truthy = (value) => typeof value === "boolean" ? value : /^(true|yes|1|eligible|y)$/i.test(clean(value));

function rowRecords(sheet) {
  return (sheet?.records || []).map(({ record }) => record);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function canonicalEntry(row = {}, { year } = {}) {
  const rowYear = number(row.Year || year);
  const round = number(row.Round);
  const format = normalizeSkinsFormat(row.Format);
  const playerId1 = clean(row["Player ID 1"]);
  const playerId2 = format === "SC" ? clean(row["Player ID 2"]) : "";
  const match = clean(row.Match);
  const eligible = truthy(row.Eligible);
  const effectiveBuyIn = format === "SC" ? 50 : 25;
  const configuredBuyIn = nullableNumber(row["Buy-In"]);
  if (rowYear !== number(year)) return null;
  if (!round || !["BB", "SC", "SI"].includes(format) || !playerId1) {
    throw Object.assign(new Error("Every Net Skins row requires Year, Round, supported Format, and Player ID 1."), { code: "INVALID_NET_SKINS_CONFIGURATION_ROW" });
  }
  if (format === "SC" && !playerId2) {
    throw Object.assign(new Error("Scramble Net Skins entries require Player ID 2."), { code: "SCRAMBLE_PAIRING_REQUIRED" });
  }
  if (configuredBuyIn !== null && configuredBuyIn !== effectiveBuyIn) {
    throw Object.assign(new Error(`Round ${round} Net Skins Buy-In does not match the existing engine contract.`), { code: "NET_SKINS_BUY_IN_CONTRACT_MISMATCH" });
  }
  const id = clean(row["Net Skins ID"]) || `${rowYear}-R${round}-${format}-M${match || "0"}-${playerId1}${playerId2 ? `-${playerId2}` : ""}`;
  return {
    entry_id: id,
    round_number: round,
    match_number: match,
    format,
    player_id_1: playerId1,
    player_id_2: playerId2,
    team_handicap: format === "SC" ? nullableNumber(row["Team Handicap"]) : null,
    buy_in: effectiveBuyIn,
    eligible,
    source_payload: {
      Year: rowYear, Round: round, Format: format, Match: match,
      "Net Skins ID": clean(row["Net Skins ID"]),
      "Player ID 1": playerId1, "Player ID 2": playerId2,
      "Team Handicap": format === "SC" ? nullableNumber(row["Team Handicap"]) : null,
      "Buy-In": configuredBuyIn, Eligible: eligible,
    },
  };
}

export function buildNetSkinsConfigurationImport({ sheets = {}, tournamentId, tournamentYear, sourceWorkbookId, requestedBy } = {}) {
  const rows = rowRecords(sheets["Net Skins"]);
  if (!rows.length) throw Object.assign(new Error("The Preview Net Skins configuration is empty."), { code: "NET_SKINS_CONFIGURATION_REQUIRED" });
  const year = number(tournamentYear);
  const entries = rows.map((row) => canonicalEntry(row, { year })).filter(Boolean)
    .sort((left, right) => left.round_number - right.round_number || left.entry_id.localeCompare(right.entry_id));
  if (!entries.length) throw Object.assign(new Error(`No Net Skins entries are configured for ${year}.`), { code: "NET_SKINS_CONFIGURATION_REQUIRED" });
  if (new Set(entries.map((entry) => entry.entry_id)).size !== entries.length) {
    throw Object.assign(new Error("Net Skins configuration contains duplicate logical entries."), { code: "DUPLICATE_NET_SKINS_ENTRY" });
  }
  const rounds = [...new Set(entries.map((entry) => entry.round_number))].sort((a, b) => a - b).map((roundNumber) => {
    const roundEntries = entries.filter((entry) => entry.round_number === roundNumber);
    const formats = [...new Set(roundEntries.map((entry) => entry.format))];
    if (formats.length !== 1) throw Object.assign(new Error(`Round ${roundNumber} mixes Net Skins formats.`), { code: "NET_SKINS_ROUND_FORMAT_CONFLICT" });
    const format = formats[0];
    const eligibleEntries = roundEntries.filter((entry) => entry.eligible);
    const activeKeys = eligibleEntries.map((entry) => format === "SC"
      ? [entry.player_id_1, entry.player_id_2].sort().join("|") : entry.player_id_1);
    if (new Set(activeKeys).size !== activeKeys.length) {
      throw Object.assign(new Error(`Round ${roundNumber} contains duplicate eligible Net Skins entries.`), { code: "DUPLICATE_NET_SKINS_ENTRY" });
    }
    const buyIn = format === "SC" ? 50 : 25;
    const canonical = {
      round_number: roundNumber,
      format,
      enabled: eligibleEntries.length > 0,
      entry_type: format === "SC" ? "PAIRING" : "INDIVIDUAL",
      buy_in_per_entry: buyIn,
      expected_pot: eligibleEntries.length * buyIn,
      completion_rule: "ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL",
      payout_rounding: "NONE",
      tie_rule: "NO_SKIN_NO_CARRY",
      entries: roundEntries,
    };
    return { ...canonical, configuration_fingerprint: scoringShadowPayloadHash(canonical) };
  });
  const fingerprint = scoringShadowPayloadHash({ tournamentId: clean(tournamentId), year, rounds });
  return {
    environment: "PREVIEW",
    tournament_id: clean(tournamentId),
    source_workbook_id: clean(sourceWorkbookId),
    requested_by: clean(requestedBy || "Net Skins configuration refresh"),
    configuration_fingerprint: fingerprint,
    rounds,
  };
}

export async function replaceNetSkinsConfiguration(input, options = {}) {
  const replaced = await scoringShadowRpc("replace_preview_net_skins_configuration", { input }, { ...options, timeoutMs: options.timeoutMs || 20_000 });
  if (replaced.payload?.ok) {
    const cleaned = await scoringShadowRpc("clear_disabled_net_skins_operational_state", { target_tournament_id: clean(input.tournament_id) }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
    if (!cleaned.payload?.ok) throw Object.assign(new Error("Disabled Net Skins operational state could not be reconciled."), { code: cleaned.payload?.code });
    replaced.payload.disabled_round_cleanup = cleaned.payload;
  }
  return replaced;
}

export async function readNetSkinsInputView(tournamentId, options = {}) {
  return scoringShadowRpc("read_net_skins_input_view", { target_tournament_id: clean(tournamentId) }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

export async function readNetSkinsResultView(tournamentId, options = {}) {
  return scoringShadowRpc("read_net_skins_result_view", { target_tournament_id: clean(tournamentId) }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

export async function writeNetSkinsDerivedResults(input, options = {}) {
  return scoringShadowRpc("write_net_skins_derived_results", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
}

export async function markNetSkinsRecalculationFailed(input, options = {}) {
  return scoringShadowRpc("mark_net_skins_recalculation_failed", { input }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

function displayMatchNumber(entry = {}) {
  return clean(entry.presentation?.display_match_number || entry.match?.match_id);
}

function array(value) {
  return Array.isArray(value) ? value.map(Number) : [];
}

export function netSkinsScoreRowsFromSupabaseView(view = {}) {
  const rows = [];
  for (const entry of view.matches || []) {
    const format = clean(entry.match?.format).toUpperCase();
    const round = number(entry.match?.round_number);
    const match = displayMatchNumber(entry);
    const holeByNumber = new Map((entry.holes || []).map((hole) => [number(hole.hole_number), hole]));
    const participants = entry.participants || [];
    for (const side of [1, 2]) {
      const sidePlayers = participants.filter((row) => number(row.team_side) === side)
        .sort((left, right) => number(left.player_slot) - number(right.player_slot));
      if (format === "SC") {
        const scorecard = (entry.scores || []).map((score) => {
          const gross = array(score[`team_${side}_gross_scores`])[0];
          const strokes = array(score[`team_${side}_strokes`])[0] || 0;
          const hole = holeByNumber.get(number(score.hole_number)) || {};
          return { hole: number(score.hole_number), match, gross,
            strokes, net: nullableNumber(score[`team_${side}_net_score`]),
            strokeIndex: number(hole.stroke_index), par: number(hole.par) };
        }).filter((score) => Number.isFinite(score.gross));
        if (scorecard.length) rows.push({
          id: `${clean(entry.match?.match_id)}:team-${side}`,
          round, match, entityType: "PAIRING",
          playerIds: sidePlayers.map((row) => clean(row.player_id)),
          name: sidePlayers.map((row) => clean(row.display_name || row.player_id)).join(" / "),
          scorecard,
        });
      } else {
        sidePlayers.forEach((participant, index) => {
          const fullRoundStrokes = number(participant.final_strokes);
          const scorecard = (entry.scores || []).map((score) => {
            const gross = array(score[`team_${side}_gross_scores`])[index];
            const hole = holeByNumber.get(number(score.hole_number)) || {};
            const strokes = getStrokesOnHole(fullRoundStrokes, number(hole.stroke_index));
            return { hole: number(score.hole_number), match, gross, strokes,
              net: Number.isFinite(gross) && Number.isFinite(strokes) ? gross - strokes : null,
              strokeIndex: number(hole.stroke_index), par: number(hole.par) };
          }).filter((score) => Number.isFinite(score.gross) && Number.isFinite(score.net));
          if (scorecard.length) rows.push({
            id: clean(participant.player_id), round, match, entityType: "PLAYER",
            playerIds: [clean(participant.player_id)], name: clean(participant.display_name || participant.player_id),
            scorecard,
          });
        });
      }
    }
  }
  return rows;
}

function engineEntries(view = {}) {
  return (view.configurations || []).flatMap((item) => (item.entries || []).map((entry) => ({
    "Net Skins ID": clean(entry.entry_id),
    Year: number(view.tournament?.tournament_year),
    Round: number(entry.round_number),
    Match: clean(entry.match_number),
    Format: clean(entry.format),
    "Player ID 1": clean(entry.player_id_1),
    "Player ID 2": clean(entry.player_id_2),
    "Team Handicap": nullableNumber(entry.team_handicap),
    "Buy-In": number(entry.buy_in),
    Eligible: entry.eligible === true,
  })));
}

function officialMatch(entry = {}) {
  const match = entry.match || {};
  return clean(match.status).toUpperCase() === "FINAL" && Boolean(match.scorecard_complete) && Boolean(clean(match.result_winner));
}

function roundIsOfficial(round = {}, view = {}) {
  if (!round.complete) return false;
  return (round.matches || []).every((matchNumber) => (view.matches || []).some((entry) =>
    number(entry.match?.round_number) === number(round.round) && displayMatchNumber(entry) === clean(matchNumber) && officialMatch(entry)));
}

export function calculateNetSkinsFromSupabaseView(view = {}) {
  const calculationStartedAt = performance.now();
  const year = number(view.tournament?.tournament_year);
  const scoreRows = netSkinsScoreRowsFromSupabaseView(view);
  const calculated = calculateNetSkins({ entries: engineEntries(view), scoreRows, activeYear: year });
  calculated.rounds = calculated.rounds.map((round) => ({
    ...round,
    finalized: roundIsOfficial(round, view),
    resultState: roundIsOfficial(round, view) ? "OFFICIAL" : "PROVISIONAL",
  }));
  const sourceFingerprintByRound = Object.fromEntries((calculated.rounds || []).map((round) => {
    const matches = (view.source_revision?.matches || []).filter((match) => number(match.round) === number(round.round));
    const matchIds = new Set(matches.map((match) => clean(match.matchId)));
    const holes = (view.source_revision?.holes || []).filter((hole) => matchIds.has(clean(hole.matchId)));
    return [number(round.round), scoringShadowPayloadHash({ tournamentId: clean(view.tournament?.tournament_id), matches, holes })];
  }));
  const sourceFingerprint = scoringShadowPayloadHash(sourceFingerprintByRound);
  return {
    netSkins: calculated,
    sourceFingerprint,
    queryMs: number(view.query_ms),
    calculationMs: performance.now() - calculationStartedAt,
    scoreRows,
    canonicalInputVerification: {
      individualRows: scoreRows.filter((row) => row.entityType === "PLAYER").length,
      scramblePairingRows: scoreRows.filter((row) => row.entityType === "PAIRING").length,
      scorecardHoles: scoreRows.reduce((sum, row) => sum + row.scorecard.length, 0),
      usesStoredIndividualGrossAndImmutableSnapshotAllocation: true,
      usesConfiguredScrambleTeamHandicap: true,
    },
    sourceFingerprintByRound,
  };
}

export function buildNetSkinsDerivedWrite(view = {}, calculated = {}, calculatedBy = "Net Skins worker") {
  const configurationByRound = new Map((view.configurations || []).map((item) => [number(item.configuration?.round_number), item.configuration || {}]));
  const calculatedAt = new Date().toISOString();
  return {
    environment: "PREVIEW",
    tournament_id: clean(view.tournament?.tournament_id),
    engine_version: NET_SKINS_ENGINE_VERSION,
    calculated_by: clean(calculatedBy),
    rounds: (calculated.netSkins?.rounds || []).map((round) => {
      const config = configurationByRound.get(number(round.round)) || {};
      const resultPayload = stable({ ...round, resultState: round.finalized ? "OFFICIAL" : "PROVISIONAL" });
      return {
        round_number: number(round.round),
        configuration_fingerprint: clean(config.configuration_fingerprint),
        source_fingerprint: clean(calculated.sourceFingerprintByRound?.[number(round.round)] || calculated.sourceFingerprint),
        result_state: round.finalized ? "OFFICIAL" : "PROVISIONAL",
        result_payload: resultPayload,
        payload_hash: scoringShadowPayloadHash(resultPayload),
        calculated_at: calculatedAt,
      };
    }),
  };
}

export async function recalculateNetSkinsTournament(tournamentId, { calculatedBy = "Net Skins worker" } = {}) {
  const input = await readNetSkinsInputView(tournamentId);
  if (!input.payload?.ok) throw Object.assign(new Error(`Net Skins input read failed (${input.payload?.code || "unknown"}).`), { code: input.payload?.code });
  const calculated = calculateNetSkinsFromSupabaseView(input.payload.data);
  const writeInput = buildNetSkinsDerivedWrite(input.payload.data, calculated, calculatedBy);
  const written = await writeNetSkinsDerivedResults(writeInput);
  if (!written.payload?.ok) throw Object.assign(new Error(`Net Skins derived write failed (${written.payload?.code || "unknown"}).`), { code: written.payload?.code });
  return { input: input.payload.data, calculated, write: written.payload, inputReadMs: input.durationMs, writeMs: written.durationMs };
}

export function netSkinsDataFromResultView(view = {}) {
  const snapshots = (view.snapshots || []).sort((left, right) => number(left.round_number) - number(right.round_number));
  const jobs = view.jobs || [];
  const rounds = snapshots.map((snapshot) => ({
    ...(snapshot.result_payload || {}),
    resultState: clean(snapshot.result_state),
    configurationFingerprint: clean(snapshot.configuration_fingerprint),
    sourceFingerprint: clean(snapshot.source_fingerprint),
    payloadHash: clean(snapshot.payload_hash),
    calculatedAt: clean(snapshot.calculated_at),
    publishedAt: clean(snapshot.published_at),
  }));
  return {
    netSkins: { rounds, results: rounds.flatMap((round) => round.skins || []) },
    jobs,
    stale: jobs.some((job) => clean(job.status).toUpperCase() !== "SUCCEEDED"),
    queryMs: number(view.query_ms),
  };
}

export async function currentNetSkinsOperationalResult(tournamentId, { recalculatePending = true, calculatedBy } = {}) {
  let read = await readNetSkinsResultView(tournamentId);
  if (!read.payload?.ok) throw Object.assign(new Error("Net Skins result read failed."), { code: read.payload?.code });
  let data = netSkinsDataFromResultView(read.payload.data);
  let recalculation = null;
  if (recalculatePending && (data.stale || !data.netSkins.rounds.length)) {
    try {
      recalculation = await recalculateNetSkinsTournament(tournamentId, { calculatedBy });
      read = await readNetSkinsResultView(tournamentId);
      if (!read.payload?.ok) throw Object.assign(new Error("Net Skins result read failed after recalculation."), { code: read.payload?.code });
      data = netSkinsDataFromResultView(read.payload.data);
    } catch (error) {
      const rounds = data.jobs.filter((job) => clean(job.status).toUpperCase() !== "SUCCEEDED").map((job) => number(job.round_number));
      await Promise.all(rounds.map((roundNumber) => markNetSkinsRecalculationFailed({
        environment: "PREVIEW", tournament_id: clean(tournamentId), round_number: roundNumber,
        error_code: clean(error?.code || "NET_SKINS_CALCULATION_FAILED"),
        error_safe: "Net Skins recalculation is temporarily unavailable.",
      }).catch(() => null)));
      if (!data.netSkins.rounds.length) throw error;
      data = { ...data, stale: true, recalculationError: clean(error?.code || "NET_SKINS_CALCULATION_FAILED") };
    }
  }
  return { ...data, serviceMs: read.durationMs, recalculation };
}

export function netSkinsParityProjection(model = {}) {
  return stable({
    year: number(model.year),
    rounds: (model.rounds || []).map((round) => ({
      round: number(round.round), format: clean(round.format), matches: (round.matches || []).map(clean).sort(),
      pot: number(round.pot), eligibleCount: number(round.eligibleCount), completedHoles: number(round.completedHoles),
      complete: Boolean(round.complete), finalized: Boolean(round.finalized), skinsAwarded: number(round.skinsAwarded),
      skinValue: number(round.skinValue),
      skins: (round.skins || []).map((skin) => ({
        hole: number(skin.hole), winner: clean(skin.winner), winnerPlayerId: clean(skin.winnerPlayerId),
        winnerPlayerId2: clean(skin.winnerPlayerId2), skinValue: number(skin.skinValue),
        roundPot: number(skin.roundPot), winningNetScore: number(skin.winningNetScore),
        format: clean(skin.format), match: clean(skin.match),
      })),
      leaderboard: (round.leaderboard || []).map((row) => ({
        name: clean(row.name), playerIds: (row.playerIds || []).map(clean),
        skinsWon: number(row.skinsWon), totalWinnings: number(row.totalWinnings),
        winningHoles: (row.winningHoles || []).map((skin) => number(skin.hole)),
      })),
    })),
  });
}

export function compareNetSkinsParity(expected = {}, actual = {}) {
  const left = netSkinsParityProjection(expected);
  const right = netSkinsParityProjection(actual);
  return { pass: JSON.stringify(left) === JSON.stringify(right), expected: JSON.stringify(left) === JSON.stringify(right) ? undefined : left,
    actual: JSON.stringify(left) === JSON.stringify(right) ? undefined : right };
}
