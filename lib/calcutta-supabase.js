import {
  buildCalcuttaModel,
  calcuttaPublicationRecords,
  calcuttaRoundResultsFromTournamentModel,
} from "./calcutta.js";
import { readCompetitionDerivedState } from "./competition-derived-supabase.js";
import {
  leaderboardsCoreDataFromSupabaseView,
  readLeaderboardsCoreView,
} from "./leaderboards-core-supabase.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";

export const CALCUTTA_ENGINE_VERSION = "calcutta-js-v1";
export const CALCUTTA_WORKBOOK_TABS = [
  "Calcutta Purchases",
  "Calcutta Ownership",
  "Calcutta Point Structure",
  "Calcutta Payout",
  "Calcutta Round Results",
  "Calcutta Standings",
];

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(String(value ?? "").replace(/[$,%]/g, "").replace(/,/g, "")))
  ? Number(String(value ?? "").replace(/[$,%]/g, "").replace(/,/g, "")) : fallback;
const round = (value) => Number(clean(value).match(/\d+/)?.[0]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function rows(sheet) {
  return (sheet?.records || []).map(({ record }) => record);
}

function requireHeaders(sheets, tab, required) {
  const headers = sheets[tab]?.headers || Object.keys(rows(sheets[tab])[0] || {});
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length) throw Object.assign(new Error(`${tab} is missing: ${missing.join(", ")}.`), { code: "CALCUTTA_SCHEMA_REQUIRED" });
}

function ownershipFraction(value) {
  const raw = clean(value);
  const parsed = number(raw);
  if (!parsed) return 0;
  return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

// The existing engine defines Calcutta Payout values as percentage points.
function payoutFraction(value) {
  return number(value) / 100;
}

function yearRows(sheets, tab, year) {
  return rows(sheets[tab]).filter((row) => number(row.Year) === number(year));
}

export function buildCalcuttaConfigurationImport({ sheets = {}, tournamentId, tournamentYear,
  sourceWorkbookId, requestedBy } = {}) {
  const year = number(tournamentYear);
  for (const [tab, headers] of Object.entries({
    "Calcutta Purchases": ["Year", "Golfer Player ID", "Purchase Price"],
    "Calcutta Ownership": ["Year", "Golfer Player ID", "Owner Player ID", "Ownership %"],
    "Calcutta Point Structure": ["Year", "Place", "Round 1 Award", "Round 2 Award", "Round 3 Award"],
    "Calcutta Payout": ["Year", "Place", "Round 1 Award %", "Round 2 Award %", "Round 3 Award %", "Overall Award %"],
  })) requireHeaders(sheets, tab, headers);

  const purchases = yearRows(sheets, "Calcutta Purchases", year).map((row) => ({
    player_id: clean(row["Golfer Player ID"]), purchase_price: number(row["Purchase Price"], NaN),
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (!purchases.length || purchases.some((row) => !row.player_id || !Number.isFinite(row.purchase_price) || row.purchase_price < 0)) {
    throw Object.assign(new Error("Every Calcutta purchase requires a Player ID and non-negative purchase price."), { code: "INVALID_CALCUTTA_PURCHASE" });
  }
  if (new Set(purchases.map((row) => row.player_id)).size !== purchases.length) {
    throw Object.assign(new Error("Calcutta contains a duplicate purchased asset."), { code: "DUPLICATE_CALCUTTA_PURCHASE" });
  }

  const purchasedPlayers = new Set(purchases.map((row) => row.player_id));
  const ownership = yearRows(sheets, "Calcutta Ownership", year).map((row) => ({
    player_id: clean(row["Golfer Player ID"]), owner_player_id: clean(row["Owner Player ID"]),
    ownership_fraction: ownershipFraction(row["Ownership %"]),
  })).sort((left, right) => left.player_id.localeCompare(right.player_id) || left.owner_player_id.localeCompare(right.owner_player_id));
  if (!ownership.length || ownership.some((row) => !purchasedPlayers.has(row.player_id) || !row.owner_player_id || row.ownership_fraction <= 0 || row.ownership_fraction > 1)) {
    throw Object.assign(new Error("Every Calcutta ownership row must map a purchased asset to a valid positive owner share."), { code: "INVALID_CALCUTTA_OWNERSHIP" });
  }
  if (new Set(ownership.map((row) => `${row.player_id}:${row.owner_player_id}`)).size !== ownership.length) {
    throw Object.assign(new Error("A Calcutta owner may only appear once per purchased asset."), { code: "DUPLICATE_CALCUTTA_OWNER" });
  }
  const ownershipTotals = Object.fromEntries(purchases.map(({ player_id }) => [player_id,
    ownership.filter((row) => row.player_id === player_id).reduce((sum, row) => sum + row.ownership_fraction, 0)]));
  const invalidOwnership = Object.entries(ownershipTotals).filter(([, total]) => Math.abs(total - 1) >= 0.000001);
  if (invalidOwnership.length) throw Object.assign(new Error("Calcutta ownership must total exactly 100% for every purchased asset."), {
    code: "CALCUTTA_OWNERSHIP_TOTAL_MISMATCH", diagnostics: invalidOwnership,
  });

  const pointStructure = yearRows(sheets, "Calcutta Point Structure", year).map((row) => ({
    place: number(row.Place), round_1_award: number(row["Round 1 Award"]),
    round_2_award: number(row["Round 2 Award"]), round_3_award: number(row["Round 3 Award"]),
  })).sort((left, right) => left.place - right.place);
  const payoutStructure = yearRows(sheets, "Calcutta Payout", year).map((row) => ({
    place: number(row.Place), round_1_fraction: payoutFraction(row["Round 1 Award %"]),
    round_2_fraction: payoutFraction(row["Round 2 Award %"]), round_3_fraction: payoutFraction(row["Round 3 Award %"]),
    overall_fraction: payoutFraction(row["Overall Award %"]),
  })).sort((left, right) => left.place - right.place);
  for (const [name, values, fields] of [
    ["points", pointStructure, ["round_1_award", "round_2_award", "round_3_award"]],
    ["payout", payoutStructure, ["round_1_fraction", "round_2_fraction", "round_3_fraction", "overall_fraction"]],
  ]) {
    if (!values.length || values.some((row) => !Number.isInteger(row.place) || row.place < 1 || fields.some((field) => !Number.isFinite(row[field]) || row[field] < 0)) || new Set(values.map((row) => row.place)).size !== values.length) {
      throw Object.assign(new Error(`Calcutta ${name} structure is incomplete or ambiguous.`), { code: `INVALID_CALCUTTA_${name.toUpperCase()}_STRUCTURE` });
    }
  }
  const preciseSum = (values) => Number(values.reduce((sum, value) => sum + value, 0).toFixed(12));
  const payoutAllocation = {
    round_1: preciseSum(payoutStructure.map((row) => row.round_1_fraction)),
    round_2: preciseSum(payoutStructure.map((row) => row.round_2_fraction)),
    round_3: preciseSum(payoutStructure.map((row) => row.round_3_fraction)),
    overall: preciseSum(payoutStructure.map((row) => row.overall_fraction)),
  };
  const totalPayoutFraction = Object.values(payoutAllocation).reduce((sum, value) => sum + value, 0);
  if (Math.abs(totalPayoutFraction - 1) >= 0.000001) throw Object.assign(new Error("Calcutta payout percentages must reconcile to exactly 100% of the market."), {
    code: "CALCUTTA_PAYOUT_TOTAL_MISMATCH", diagnostics: { payoutAllocation, totalPayoutFraction },
  });
  const totalMarketValue = purchases.reduce((sum, row) => sum + row.purchase_price, 0);
  const canonical = {
    tournament_id: clean(tournamentId), tournament_year: year,
    purchases, ownership, point_structure: pointStructure, payout_structure: payoutStructure,
    financial_contract: {
      total_market_value: totalMarketValue, ownership_totals: ownershipTotals,
      payout_allocation: payoutAllocation, total_payout_fraction: totalPayoutFraction,
      tie_rule: "COMPETITION_RANK_WITH_OCCUPIED_PLACE_AWARD_AVERAGING",
      payout_rounding: "NONE", scramble_asset: "PLAYER_PURCHASE_WITH_PAIRING_PERFORMANCE_SPLIT_EQUALLY",
      completion_rule: "ALL_PURCHASED_PLAYERS_HAVE_OFFICIAL_COMPLETED_ROUND_RESULT",
    },
  };
  return {
    environment: "PREVIEW", ...canonical,
    source_workbook_id: clean(sourceWorkbookId), requested_by: clean(requestedBy || "Calcutta configuration refresh"),
    configuration_fingerprint: scoringShadowPayloadHash(canonical),
  };
}

export async function replaceCalcuttaConfiguration(input, options = {}) {
  return scoringShadowRpc("replace_preview_calcutta_configuration", { input }, { ...options, timeoutMs: options.timeoutMs || 20_000 });
}

export async function readCalcuttaConfigurationView(tournamentId, options = {}) {
  return scoringShadowRpc("read_calcutta_configuration_view", { target_tournament_id: clean(tournamentId) }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

async function requestCalcuttaRecalculation(tournamentId, { requestedBy, reason } = {}) {
  return scoringShadowRpc("request_preview_calcutta_recalculation", { input: {
    environment: "PREVIEW", tournament_id: clean(tournamentId),
    requested_by: clean(requestedBy || "Calcutta worker"), reason: clean(reason || "EXPLICIT_REBUILD"),
  } }, { timeoutMs: 8_000 });
}

async function claimCalcuttaRecalculation(tournamentId) {
  return scoringShadowRpc("claim_preview_calcutta_recalculation", { input: {
    environment: "PREVIEW", tournament_id: clean(tournamentId),
  } }, { timeoutMs: 8_000 });
}

async function writeCalcuttaDerivedResult(input) {
  return scoringShadowRpc("write_preview_calcutta_result", { input }, { timeoutMs: 15_000 });
}

async function failCalcuttaRecalculation(tournamentId, claim, error) {
  return scoringShadowRpc("fail_preview_calcutta_recalculation", { input: {
    environment: "PREVIEW", tournament_id: clean(tournamentId),
    claim_started_at: clean(claim?.claim_started_at),
    error_code: clean(error?.code || "CALCUTTA_CALCULATION_FAILED"),
    error_safe: "Calcutta recalculation is temporarily unavailable.",
  } }, { timeoutMs: 8_000 });
}

function googleConfigurationFromView(view = {}) {
  const config = view.configuration || {};
  const year = number(view.tournament?.tournament_year || config.tournament_year);
  return {
    year,
    purchases: (config.purchases || []).map((row) => ({ Year: year, "Golfer Player ID": clean(row.player_id), "Purchase Price": number(row.purchase_price) })),
    ownership: (config.ownership || []).map((row) => ({ Year: year, "Golfer Player ID": clean(row.player_id), "Owner Player ID": clean(row.owner_player_id), "Ownership %": number(row.ownership_fraction) })),
    pointStructure: (config.point_structure || []).map((row) => ({ Year: year, Place: number(row.place),
      "Round 1 Award": number(row.round_1_award), "Round 2 Award": number(row.round_2_award), "Round 3 Award": number(row.round_3_award) })),
    payoutStructure: (config.payout_structure || []).map((row) => ({ Year: year, Place: number(row.place),
      "Round 1 Award %": number(row.round_1_fraction) * 100, "Round 2 Award %": number(row.round_2_fraction) * 100,
      "Round 3 Award %": number(row.round_3_fraction) * 100, "Overall Award %": number(row.overall_fraction) * 100 })),
  };
}

export function calculateCalcuttaFromSupabaseViews(configurationView = {}, coreView = {}) {
  const startedAt = performance.now();
  const core = coreView.tournament?.id ? coreView : leaderboardsCoreDataFromSupabaseView(coreView);
  const configuration = googleConfigurationFromView(configurationView);
  const players = Object.fromEntries((core.players || []).map((player) => [clean(player.id), player]));
  const canonicalRoundResults = calcuttaRoundResultsFromTournamentModel({
    year: configuration.year, rounds: core.rounds || [], scoreLeaderboard: core.scoreLeaderboard || [],
  });
  const publication = calcuttaPublicationRecords({ ...configuration, players, roundResults: canonicalRoundResults });
  const model = buildCalcuttaModel({ ...configuration, players,
    roundResults: publication.roundResults, standings: publication.standings });
  const completedRounds = [...(model.completedRounds || [])].map(number).sort((a, b) => a - b);
  const completedSet = new Set(completedRounds);
  const sourceRevision = {
    tournamentId: clean(core.tournament?.id), completedRounds,
    matches: (core.sourceRevision?.matches || []).filter((row) => completedSet.has(number(row.round || clean(row.matchId).match(/-R(\d+)-/)?.[1]))),
    holes: (core.sourceRevision?.holes || []).filter((row) => completedSet.has(number(clean(row.matchId).match(/-R(\d+)-/)?.[1]))),
  };
  return {
    calcutta: model, publication, canonicalRoundResults,
    configurationFingerprint: clean(configurationView.configuration?.configuration_fingerprint),
    sourceFingerprint: scoringShadowPayloadHash(sourceRevision), sourceRevision,
    resultState: model.tournamentComplete ? "OFFICIAL" : "PROVISIONAL",
    calculationMs: performance.now() - startedAt,
    canonicalInputVerification: {
      scoreSource: "canonical Supabase gross/net from existing leaderboard adapter",
      completedRounds, officialRoundRows: publication.roundResults.length,
      purchasedAssets: configuration.purchases.length,
      scramblePairingRows: canonicalRoundResults.filter((row) => number(row.Round) === 2 && clean(row["Player IDs"]).includes(",")).length,
    },
  };
}

export function buildCalcuttaDerivedWrite(configurationView = {}, calculated = {}, claim = {}, calculatedBy = "Calcutta worker") {
  const calculatedAt = new Date().toISOString();
  const resultPayload = stable(calculated.calcutta || {});
  return {
    environment: "PREVIEW", tournament_id: clean(configurationView.tournament?.tournament_id), round_number: 0,
    engine_key: "CALCUTTA", engine_version: CALCUTTA_ENGINE_VERSION,
    configuration_fingerprint: clean(calculated.configurationFingerprint), source_fingerprint: clean(calculated.sourceFingerprint),
    result_state: clean(calculated.resultState), result_payload: resultPayload,
    payload_hash: scoringShadowPayloadHash(resultPayload), calculated_by: clean(calculatedBy),
    started_at: calculatedAt, calculated_at: calculatedAt, duration_ms: number(calculated.calculationMs),
    claim_started_at: clean(claim.claim_started_at),
    published_at: calculated.resultState === "OFFICIAL" ? calculatedAt : null,
  };
}

export async function recalculateCalcuttaTournament(tournamentId, { calculatedBy = "Calcutta worker", force = false, debounceMs = 250 } = {}) {
  let resolvedTournamentId = clean(tournamentId);
  if (!resolvedTournamentId) {
    const scope = await readLeaderboardsCoreView("");
    if (!scope.payload?.ok) throw Object.assign(new Error("Current Calcutta scope is unavailable."), { code: scope.payload?.code || "CALCUTTA_SCOPE_UNAVAILABLE" });
    resolvedTournamentId = clean(scope.payload.data?.tournament?.tournament_id);
  }
  if (force) {
    const requested = await requestCalcuttaRecalculation(resolvedTournamentId, { requestedBy: calculatedBy, reason: "EXPLICIT_REBUILD" });
    if (!requested.payload?.ok) throw Object.assign(new Error("Calcutta rebuild could not be requested."), { code: requested.payload?.code || "CALCUTTA_REQUEST_FAILED" });
  }
  const waitMs = Math.max(0, Math.min(2_000, number(debounceMs)));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const claimed = await claimCalcuttaRecalculation(resolvedTournamentId);
  if (!claimed.payload?.ok) throw Object.assign(new Error("Calcutta work could not be claimed."), { code: claimed.payload?.code || "CALCUTTA_CLAIM_FAILED" });
  const claim = claimed.payload.claims?.[0];
  if (!claim) return { skipped: true, reason: "NO_PENDING_CALCUTTA_JOB" };
  const inputStartedAt = performance.now();
  try {
    const [configurationRead, coreRead] = await Promise.all([
      readCalcuttaConfigurationView(resolvedTournamentId), readLeaderboardsCoreView(resolvedTournamentId),
    ]);
    if (!configurationRead.payload?.ok || !coreRead.payload?.ok) throw Object.assign(new Error("Calcutta canonical input is unavailable."), {
      code: configurationRead.payload?.code || coreRead.payload?.code || "CALCUTTA_INPUT_UNAVAILABLE",
    });
    const inputReadMs = performance.now() - inputStartedAt;
    const calculated = calculateCalcuttaFromSupabaseViews(configurationRead.payload.data, coreRead.payload.data);
    const writeInput = buildCalcuttaDerivedWrite(configurationRead.payload.data, calculated, claim, calculatedBy);
    const written = await writeCalcuttaDerivedResult(writeInput);
    if (!written.payload?.ok) throw Object.assign(new Error("Calcutta result could not be stored."), { code: written.payload?.code || "CALCUTTA_WRITE_FAILED" });
    return { input: { configuration: configurationRead.payload.data, core: coreRead.payload.data }, calculated,
      write: written.payload, inputReadMs, serviceReadMs: configurationRead.durationMs + coreRead.durationMs,
      writeMs: written.durationMs, debounceMs: waitMs, claim };
  } catch (error) {
    await failCalcuttaRecalculation(resolvedTournamentId, claim, error).catch(() => null);
    throw error;
  }
}

export function calcuttaDataFromResultView(view = {}) {
  const snapshot = (view.snapshots || []).find((row) => clean(row.engine_key).toUpperCase() === "CALCUTTA") || null;
  const job = (view.jobs || []).find((row) => clean(row.engine_key).toUpperCase() === "CALCUTTA") || null;
  return {
    calcutta: snapshot?.result_payload || null,
    stale: !snapshot || clean(job?.status).toUpperCase() !== "SUCCEEDED",
    snapshot: snapshot ? {
      resultState: clean(snapshot.result_state), engineVersion: clean(snapshot.engine_version),
      configurationFingerprint: clean(snapshot.configuration_fingerprint), sourceFingerprint: clean(snapshot.source_fingerprint),
      payloadHash: clean(snapshot.payload_hash), calculatedAt: clean(snapshot.calculated_at), publishedAt: clean(snapshot.published_at),
    } : null,
    job, queryMs: number(view.query_ms),
  };
}

export async function currentCalcuttaOperationalResult(tournamentId, { recalculatePending = true, calculatedBy } = {}) {
  let resolvedTournamentId = clean(tournamentId);
  if (!resolvedTournamentId) {
    const scope = await readLeaderboardsCoreView("");
    if (!scope.payload?.ok) throw Object.assign(new Error("Current Calcutta scope is unavailable."), { code: scope.payload?.code || "CALCUTTA_SCOPE_UNAVAILABLE" });
    resolvedTournamentId = clean(scope.payload.data?.tournament?.tournament_id);
  }
  let read = await readCompetitionDerivedState(resolvedTournamentId, ["CALCUTTA"]);
  if (!read.payload?.ok) throw Object.assign(new Error("Calcutta result is unavailable."), { code: read.payload?.code || "CALCUTTA_READ_UNAVAILABLE" });
  let data = calcuttaDataFromResultView(read.payload.data);
  let recalculation = null;
  if (recalculatePending && (data.stale || !data.calcutta)) {
    try {
      recalculation = await recalculateCalcuttaTournament(resolvedTournamentId, { calculatedBy });
      read = await readCompetitionDerivedState(resolvedTournamentId, ["CALCUTTA"]);
      if (!read.payload?.ok) throw Object.assign(new Error("Calcutta result is unavailable after recalculation."), { code: read.payload?.code });
      data = calcuttaDataFromResultView(read.payload.data);
    } catch (error) {
      if (!data.calcutta) throw error;
      data = { ...data, stale: true, recalculationError: clean(error?.code || "CALCUTTA_CALCULATION_FAILED") };
    }
  }
  return { ...data, serviceMs: read.durationMs, recalculation };
}

export function calcuttaParityProjection(model = {}) {
  return stable({
    available: Boolean(model.available), year: number(model.year), pot: number(model.pot),
    distributedPrizePool: number(model.distributedPrizePool), guaranteedDistributed: number(model.guaranteedDistributed),
    remainingPrizePool: number(model.remainingPrizePool), completedRounds: (model.completedRounds || []).map(number),
    tournamentComplete: Boolean(model.tournamentComplete),
    golfers: (model.golfers || []).map((golfer) => ({ playerId: clean(golfer.playerId), rank: number(golfer.rank),
      tieSize: number(golfer.tieSize), purchasePrice: number(golfer.purchasePrice), totalPoints: number(golfer.totalPoints),
      overallPayoutPercent: number(golfer.overallPayoutPercent), totalPayoutPercent: number(golfer.totalPayoutPercent),
      currentPayoutValue: number(golfer.currentPayoutValue), guaranteedWinnings: number(golfer.guaranteedWinnings),
      remainingUpside: number(golfer.remainingUpside), netProfit: number(golfer.netProfit), roi: number(golfer.roi),
      owners: (golfer.owners || []).map((owner) => ({ ownerId: clean(owner.ownerId), ownership: number(owner.ownership) }))
        .sort((left, right) => left.ownerId.localeCompare(right.ownerId)),
      rounds: Object.fromEntries(Object.entries(golfer.rounds || {}).map(([scope, result]) => [scope, {
        round: number(result.round), format: clean(result.format), gross: number(result.gross), net: number(result.net),
        fullCourseHandicap: number(result.fullCourseHandicap), place: number(result.place), tieSize: number(result.tieSize),
        points: number(result.points), payoutPercent: number(result.payoutPercent), guaranteedWinnings: number(result.guaranteedWinnings),
      }])),
    })),
    portfolios: (model.portfolios || []).map((owner) => ({ ownerId: clean(owner.ownerId), rank: number(owner.rank),
      purchaseCost: number(owner.purchaseCost), guaranteedWinnings: number(owner.guaranteedWinnings),
      currentPayoutValue: number(owner.currentPayoutValue), netProfit: number(owner.netProfit), roi: number(owner.roi),
      investments: (owner.investments || []).map((investment) => ({ playerId: clean(investment.playerId), ownership: number(investment.ownership),
        purchasePrice: number(investment.purchasePrice), guaranteedWinnings: number(investment.guaranteedWinnings),
        currentPayoutValue: number(investment.currentPayoutValue), netProfit: number(investment.netProfit), roi: number(investment.roi) }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
    })),
  });
}

export function compareCalcuttaParity(expected = {}, actual = {}) {
  const left = calcuttaParityProjection(expected);
  const right = calcuttaParityProjection(actual);
  const pass = JSON.stringify(left) === JSON.stringify(right);
  return { pass, expected: pass ? undefined : left, actual: pass ? undefined : right };
}
