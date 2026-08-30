import { scoringShadowRpc } from "./scoring-shadow.js";
import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";

export const PRODUCTION_CALCUTTA_V1_CONTRACT = "production-calcutta-v1";
export const PRODUCTION_CALCUTTA_V1_PUBLICATION_POLICY =
  "DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET";
export const PRODUCTION_CALCUTTA_V1_STATES = Object.freeze([
  "NOT_CONFIGURED",
  "CONFIGURED",
  "AUCTION_COMPLETE",
  "IN_PROGRESS",
  "OFFICIAL",
  "UNAVAILABLE",
]);
export const PRODUCTION_CALCUTTA_V1_PUBLICATION_STATES = Object.freeze([
  "UNPUBLISHED",
  "PUBLISHED",
]);

const STATE_SET = new Set(PRODUCTION_CALCUTTA_V1_STATES);
const PUBLICATION_SET = new Set(PRODUCTION_CALCUTTA_V1_PUBLICATION_STATES);
const FINGERPRINT = /^[0-9a-f]{64}$/;
const clean = (value) => String(value ?? "").trim();

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 503;
  return error;
}

function integer(value, { nullable = false, minimum = 0 } = {}) {
  if (nullable && (value === null || value === undefined || clean(value) === "")) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw contractError(
      "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED",
      "The Production Calcutta revision binding is unavailable.",
    );
  }
  return parsed;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * JSON numeric facts from Postgres and the existing JS engine are serialized
 * as lossless display decimals. No cent-rounding or payout rounding is added.
 */
export function canonicalCalcuttaDecimal(value, { signed = false } = {}) {
  const source = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : clean(value);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(source)) {
    throw contractError(
      "CALCUTTA_V1_DECIMAL_REQUIRED",
      "A canonical Production Calcutta decimal value is unavailable.",
    );
  }
  if (!signed && source.startsWith("-")) {
    throw contractError(
      "CALCUTTA_V1_DECIMAL_REQUIRED",
      "A non-negative Production Calcutta decimal value is required.",
    );
  }
  let [whole, fraction = ""] = source.split(".");
  const negative = whole.startsWith("-");
  if (negative) whole = whole.slice(1);
  whole = whole.replace(/^0+(?=\d)/, "") || "0";
  fraction = fraction.replace(/0+$/, "");
  const zero = whole === "0" && !fraction;
  return `${negative && !zero ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function ownershipFraction(value) {
  const result = canonicalCalcuttaDecimal(value);
  const [whole, fraction = ""] = result.split(".");
  if (result === "0" || BigInt(whole) > 1n || (whole === "1" && fraction)) {
    throw contractError(
      "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED",
      "A valid Production Calcutta ownership fraction is unavailable.",
    );
  }
  return result;
}

function exactDecimalTotal(values, target = "1") {
  const scale = Math.max(...[...values, target].map((value) =>
    String(value).split(".")[1]?.length || 0));
  const units = (value) => {
    const [whole, fraction = ""] = String(value).split(".");
    return BigInt(whole) * (10n ** BigInt(scale)) +
      BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
  };
  return values.reduce((sum, value) => sum + units(value), 0n) === units(target);
}

function fingerprint(value, { nullable = false } = {}) {
  const resolved = clean(value).toLowerCase();
  if (nullable && !resolved) return null;
  if (!FINGERPRINT.test(resolved)) {
    throw contractError(
      "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED",
      "The Production Calcutta fingerprint binding is unavailable.",
    );
  }
  return resolved;
}

function timestamp(value) {
  const resolved = clean(value);
  if (!resolved) return null;
  if (!Number.isFinite(Date.parse(resolved))) {
    throw contractError(
      "CALCUTTA_V1_FRESHNESS_REQUIRED",
      "The Production Calcutta freshness contract is unavailable.",
    );
  }
  return resolved;
}

function person(value = {}) {
  const playerId = clean(value.player_id ?? value.playerId ?? value.id);
  const displayName = clean(value.display_name ?? value.displayName ?? value.name);
  if (!playerId || !displayName) {
    throw contractError(
      "CALCUTTA_V1_PLAYER_BINDING_REQUIRED",
      "A stable Production Calcutta Player binding is unavailable.",
    );
  }
  return { playerId, displayName };
}

function marketDto(value = {}) {
  if (!value || typeof value !== "object" || !Array.isArray(value.purchases)) {
    throw contractError(
      "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED",
      "The published Production Calcutta market is unavailable.",
    );
  }
  const purchases = value.purchases.map((purchase) => {
    const player = person(purchase.player || {
      player_id: purchase.player_id,
      display_name: purchase.display_name,
    });
    const owners = Array.isArray(purchase.owners) ? purchase.owners.map((owner) => ({
      player: person(owner.player || {
        player_id: owner.owner_player_id ?? owner.player_id,
        display_name: owner.owner_display_name ?? owner.display_name,
      }),
      ownershipFraction: ownershipFraction(
        owner.ownership_fraction ?? owner.ownershipFraction,
      ),
    })) : [];
    if (!owners.length ||
        new Set(owners.map((owner) => owner.player.playerId)).size !== owners.length ||
        !exactDecimalTotal(owners.map((owner) => owner.ownershipFraction))) {
      throw contractError(
        "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED",
        "The published Production Calcutta ownership market is unavailable.",
      );
    }
    return {
      player,
      purchasePrice: canonicalCalcuttaDecimal(
        purchase.purchase_price ?? purchase.purchasePrice,
      ),
      owners,
    };
  });
  if (!purchases.length || new Set(purchases.map((purchase) => purchase.player.playerId)).size !== purchases.length) {
    throw contractError(
      "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED",
      "The published Production Calcutta purchase market is unavailable.",
    );
  }
  return {
    pot: canonicalCalcuttaDecimal(value.pot),
    purchases,
  };
}

function resultPlayer(value = {}) {
  return person(value.player || value.owner || {
    player_id: value.player_id ?? value.playerId ?? value.owner_id ?? value.ownerId ?? value.id,
    display_name: value.display_name ?? value.displayName ?? value.name,
  });
}

function roundDto(value = {}, tournamentId) {
  const roundNumber = integer(value.round ?? value.round_number, { minimum: 1 });
  if (roundNumber > 3) {
    throw contractError("CALCUTTA_V1_RESULT_REQUIRED", "The Production Calcutta round is unavailable.");
  }
  const format = clean(value.format).toUpperCase();
  if (!new Set(["BB", "SC", "SI"]).has(format)) {
    throw contractError("CALCUTTA_V1_RESULT_REQUIRED", "The Production Calcutta format is unavailable.");
  }
  return {
    roundId: `${tournamentId}:R${roundNumber}`,
    roundNumber,
    format,
    grossScore: number(value.gross ?? value.gross_score),
    netScore: number(value.net ?? value.net_score),
    courseHandicap: number(value.fullCourseHandicap ?? value.course_handicap),
    rank: integer(value.place ?? value.rank, { minimum: 1 }),
    tieSize: integer(value.tieSize ?? value.tie_size ?? 1, { minimum: 1 }),
    points: number(value.points),
    payoutFraction: canonicalCalcuttaDecimal(
      value.payoutPercent ?? value.payout_fraction ?? 0,
    ),
    guaranteedWinnings: canonicalCalcuttaDecimal(
      value.guaranteedWinnings ?? value.guaranteed_winnings ?? 0,
    ),
  };
}

function investmentDto(value = {}) {
  return {
    player: resultPlayer(value),
    ownershipFraction: ownershipFraction(
      value.ownership ?? value.ownership_fraction,
    ),
    purchaseCost: canonicalCalcuttaDecimal(
      value.purchasePrice ?? value.purchase_cost ?? 0,
    ),
    guaranteedWinnings: canonicalCalcuttaDecimal(
      value.guaranteedWinnings ?? value.guaranteed_winnings ?? 0,
    ),
    tournamentValue: canonicalCalcuttaDecimal(
      value.currentPayoutValue ?? value.tournament_value ?? 0,
    ),
    netProfit: canonicalCalcuttaDecimal(
      value.netProfit ?? value.net_profit ?? 0,
      { signed: true },
    ),
    roi: canonicalCalcuttaDecimal(value.roi ?? 0, { signed: true }),
  };
}

function resultDto(value = {}, tournamentId) {
  if (!value || typeof value !== "object" || !Array.isArray(value.golfers) ||
      !Array.isArray(value.portfolios)) {
    throw contractError(
      "CALCUTTA_V1_RESULT_REQUIRED",
      "The current Production Calcutta result is unavailable.",
    );
  }
  const completedRounds = Array.isArray(value.completedRounds ?? value.completed_rounds)
    ? [...new Set((value.completedRounds ?? value.completed_rounds).map((round) => integer(round, { minimum: 1 })))]
      .sort((left, right) => left - right)
    : [];
  if (completedRounds.some((round) => round > 3)) {
    throw contractError("CALCUTTA_V1_RESULT_REQUIRED", "The Production Calcutta result is unavailable.");
  }
  const golfers = value.golfers.map((golfer) => {
    const rawRounds = Array.isArray(golfer.rounds)
      ? golfer.rounds
      : Object.values(golfer.rounds || {});
    return {
      rank: integer(golfer.rank, { minimum: 1 }),
      tieSize: integer(golfer.tieSize ?? golfer.tie_size ?? 1, { minimum: 1 }),
      player: resultPlayer(golfer),
      rounds: rawRounds.map((round) => roundDto(round, tournamentId))
        .sort((left, right) => left.roundNumber - right.roundNumber),
      totalPoints: number(golfer.totalPoints ?? golfer.total_points),
      overallPayoutFraction: canonicalCalcuttaDecimal(
        golfer.overallPayoutPercent ?? golfer.overall_payout_fraction ?? 0,
      ),
      totalPayoutFraction: canonicalCalcuttaDecimal(
        golfer.totalPayoutPercent ?? golfer.total_payout_fraction ?? 0,
      ),
      guaranteedWinnings: canonicalCalcuttaDecimal(
        golfer.guaranteedWinnings ?? golfer.guaranteed_winnings ?? 0,
      ),
      tournamentValue: canonicalCalcuttaDecimal(
        golfer.currentPayoutValue ?? golfer.tournament_value ?? 0,
      ),
      netProfit: canonicalCalcuttaDecimal(
        golfer.netProfit ?? golfer.net_profit ?? 0,
        { signed: true },
      ),
      roi: canonicalCalcuttaDecimal(golfer.roi ?? 0, { signed: true }),
      remainingUpside: canonicalCalcuttaDecimal(
        golfer.remainingUpside ?? golfer.remaining_upside ?? 0,
      ),
    };
  });
  const portfolios = value.portfolios.map((portfolio) => ({
    rank: integer(portfolio.rank, { minimum: 1 }),
    owner: resultPlayer(portfolio.owner || portfolio),
    investments: Array.isArray(portfolio.investments)
      ? portfolio.investments.map(investmentDto)
      : [],
    purchaseCost: canonicalCalcuttaDecimal(
      portfolio.purchaseCost ?? portfolio.purchase_cost ?? 0,
    ),
    guaranteedWinnings: canonicalCalcuttaDecimal(
      portfolio.guaranteedWinnings ?? portfolio.guaranteed_winnings ?? 0,
    ),
    tournamentValue: canonicalCalcuttaDecimal(
      portfolio.currentPayoutValue ?? portfolio.tournament_value ?? 0,
    ),
    netProfit: canonicalCalcuttaDecimal(
      portfolio.netProfit ?? portfolio.net_profit ?? 0,
      { signed: true },
    ),
    roi: canonicalCalcuttaDecimal(portfolio.roi ?? 0, { signed: true }),
  }));
  return {
    tournamentComplete: value.tournamentComplete === true || value.tournament_complete === true,
    completedRounds,
    golfers,
    portfolios,
  };
}

function freshnessDto(value = {}) {
  if (!value || typeof value !== "object" || typeof value.stale !== "boolean") {
    throw contractError(
      "CALCUTTA_V1_FRESHNESS_REQUIRED",
      "The Production Calcutta freshness contract is unavailable.",
    );
  }
  return {
    stale: value.stale === true,
    updating: value.updating === true,
    configuredAt: timestamp(value.configured_at ?? value.configuredAt),
    auctionUpdatedAt: timestamp(
      value.auction_recorded_at ?? value.auction_updated_at ?? value.auctionUpdatedAt,
    ),
    publishedAt: timestamp(value.published_at ?? value.publishedAt),
    calculatedAt: timestamp(value.calculated_at ?? value.calculatedAt),
    sourceFingerprint: fingerprint(
      value.source_fingerprint ?? value.sourceFingerprint,
      { nullable: true },
    ),
  };
}

/**
 * Strict participant-safe contract. Unpublished auction, ownership, and result
 * facts are rejected rather than silently copied into the returned DTO.
 */
export function productionCalcuttaV1ContractData(view = {}) {
  const contractVersion = clean(view.contract_version ?? view.contractVersion);
  const tournamentId = clean(view.tournament_id ?? view.tournamentId);
  const state = clean(view.state).toUpperCase();
  const publicationState = clean(view.publication_state ?? view.publicationState).toUpperCase();
  const currencyCode = clean(view.currency_code ?? view.currencyCode).toUpperCase();
  const configurationRevision = integer(
    view.configuration_revision ?? view.configurationRevision,
    { minimum: 1 },
  );
  const auctionRevision = integer(view.auction_revision ?? view.auctionRevision);
  const publicationRevision = integer(view.publication_revision ?? view.publicationRevision);
  const resultRevision = integer(view.result_revision ?? view.resultRevision, {
    nullable: true,
    minimum: 1,
  });
  const revision = clean(view.revision);
  const expectedRevision = `calcutta-v1:${configurationRevision}:${auctionRevision}:${publicationRevision}:${resultRevision ?? 0}:${state}:${publicationState}`;
  const published = view.published === true;
  if (contractVersion !== PRODUCTION_CALCUTTA_V1_CONTRACT ||
      tournamentId !== PRODUCTION_TOURNAMENT_ID ||
      !STATE_SET.has(state) || !PUBLICATION_SET.has(publicationState) ||
      currencyCode !== "USD" || revision !== expectedRevision ||
      published !== (publicationState === "PUBLISHED")) {
    throw contractError(
      "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED",
      "The Production Calcutta resource binding is unavailable.",
    );
  }
  if (["NOT_CONFIGURED", "CONFIGURED"].includes(state) && published) {
    throw contractError(
      "CALCUTTA_V1_PUBLICATION_STATE_REQUIRED",
      "The Production Calcutta publication state is unavailable.",
    );
  }
  const configurationFingerprint = fingerprint(
    view.configuration_fingerprint ?? view.configurationFingerprint,
    { nullable: state === "NOT_CONFIGURED" },
  );
  const auctionFingerprint = fingerprint(
    view.auction_fingerprint ?? view.auctionFingerprint,
    { nullable: auctionRevision === 0 },
  );
  if ((auctionRevision === 0) !== (auctionFingerprint === null) ||
      (["AUCTION_COMPLETE", "IN_PROGRESS", "OFFICIAL", "UNAVAILABLE"].includes(state) &&
        auctionRevision === 0)) {
    throw contractError(
      "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED",
      "The Production Calcutta auction binding is unavailable.",
    );
  }
  if (state === "NOT_CONFIGURED" &&
      (configurationRevision !== 1 || configurationFingerprint !== null ||
        auctionRevision !== 0 || publicationRevision !== 0 || resultRevision !== null)) {
    throw contractError(
      "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED",
      "The unconfigured Production Calcutta binding is unavailable.",
    );
  }
  if (state === "CONFIGURED" && (auctionRevision !== 0 || resultRevision !== null)) {
    throw contractError(
      "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED",
      "The configured Production Calcutta binding is unavailable.",
    );
  }
  if (!published && (view.market != null || view.result != null)) {
    throw contractError(
      "CALCUTTA_V1_UNPUBLISHED_FACTS_FORBIDDEN",
      "Unpublished Production Calcutta facts cannot be returned.",
    );
  }
  if (state === "UNAVAILABLE" && view.result != null) {
    throw contractError(
      "CALCUTTA_V1_RESULT_REQUIRED",
      "Unavailable Production Calcutta state cannot expose a result.",
    );
  }
  const market = published ? marketDto(view.market) : null;
  const result = published && view.result != null ? resultDto(view.result, tournamentId) : null;
  if (result && (!Number.isSafeInteger(resultRevision) || resultRevision < 1)) {
    throw contractError(
      "CALCUTTA_V1_RESULT_REQUIRED",
      "The current Production Calcutta result revision is unavailable.",
    );
  }
  if (["IN_PROGRESS", "OFFICIAL"].includes(state) && published && !result) {
    throw contractError(
      "CALCUTTA_V1_RESULT_REQUIRED",
      "The current Production Calcutta result is unavailable.",
    );
  }
  if (state === "IN_PROGRESS" && published && result?.tournamentComplete !== false) {
    throw contractError(
      "CALCUTTA_V1_RESULT_REQUIRED",
      "The in-progress Production Calcutta result has invalid finality.",
    );
  }
  if (state === "OFFICIAL" && published && result?.tournamentComplete !== true) {
    throw contractError(
      "CALCUTTA_V1_RESULT_REQUIRED",
      "The official Production Calcutta result is incomplete.",
    );
  }
  return {
    contractVersion,
    tournamentId,
    state,
    publicationState,
    published,
    currencyCode,
    configurationRevision,
    auctionRevision,
    publicationRevision,
    resultRevision,
    configurationFingerprint,
    auctionFingerprint,
    revision,
    freshness: freshnessDto(view.freshness),
    market,
    result,
  };
}

function webPlayer(player = {}) {
  return {
    id: clean(player.playerId),
    name: clean(player.displayName),
    photo: "",
    slug: "",
  };
}

function auctionPresentation(contract) {
  const golfers = contract.market.purchases.map((purchase, index) => ({
    playerId: purchase.player.playerId,
    player: webPlayer(purchase.player),
    purchasePrice: number(purchase.purchasePrice),
    rounds: {},
    totalPoints: 0,
    totalPayoutPercent: 0,
    currentPayoutValue: 0,
    guaranteedWinnings: 0,
    remainingUpside: 0,
    netProfit: -number(purchase.purchasePrice),
    roi: -1,
    rank: index + 1,
    tieSize: 1,
    owners: purchase.owners.map((owner) => ({
      ownerId: owner.player.playerId,
      owner: webPlayer(owner.player),
      ownership: number(owner.ownershipFraction),
    })),
  }));
  const portfolios = new Map();
  for (const purchase of contract.market.purchases) {
    for (const ownership of purchase.owners) {
      const ownerId = ownership.player.playerId;
      const share = number(ownership.ownershipFraction);
      const purchaseCost = number(purchase.purchasePrice) * share;
      const owner = portfolios.get(ownerId) || {
        ownerId,
        owner: webPlayer(ownership.player),
        investments: [],
        purchaseCost: 0,
        guaranteedWinnings: 0,
        currentPayoutValue: 0,
        netProfit: 0,
        roi: 0,
      };
      owner.investments.push({
        playerId: purchase.player.playerId,
        player: webPlayer(purchase.player),
        ownership: share,
        purchasePrice: purchaseCost,
        guaranteedWinnings: 0,
        currentPayoutValue: 0,
        netProfit: -purchaseCost,
        roi: -1,
      });
      owner.purchaseCost += purchaseCost;
      owner.netProfit -= purchaseCost;
      owner.roi = owner.purchaseCost ? -1 : 0;
      portfolios.set(ownerId, owner);
    }
  }
  const rankedPortfolios = [...portfolios.values()].map((portfolio, index) => ({
    ...portfolio,
    rank: index + 1,
  }));
  return {
    available: true,
    year: Number(contract.tournamentId),
    pot: number(contract.market.pot),
    distributedPrizePool: 0,
    guaranteedDistributed: 0,
    remainingPrizePool: number(contract.market.pot),
    completedRounds: [],
    tournamentComplete: false,
    golfers,
    portfolios: rankedPortfolios,
    storylines: [],
    hero: {
      leadingPortfolio: rankedPortfolios[0] || null,
      highestRoi: null,
      bestInvestment: null,
      highestGuaranteed: null,
      highestUpside: null,
    },
    source: { mode: "production-calcutta-v1-published-auction" },
  };
}

function resultPresentation(contract, rawResult) {
  const purchases = new Map(contract.market.purchases.map((purchase) => [
    purchase.player.playerId,
    purchase,
  ]));
  const golfers = (rawResult?.golfers || []).map((golfer) => {
    const playerId = clean(golfer.playerId ?? golfer.player_id ?? golfer.player?.id);
    const purchase = purchases.get(playerId);
    const rawRounds = Array.isArray(golfer.rounds)
      ? golfer.rounds
      : Object.values(golfer.rounds || {});
    return {
      ...golfer,
      rounds: Object.fromEntries(rawRounds.map((round) => [
        Number(round.round ?? round.round_number ?? round.roundNumber),
        round,
      ])),
      owners: (purchase?.owners || []).map((owner) => ({
        ownerId: owner.player.playerId,
        owner: webPlayer(owner.player),
        ownership: number(owner.ownershipFraction),
      })),
    };
  });
  return {
    ...(rawResult || {}),
    available: true,
    year: Number(contract.tournamentId),
    pot: number(contract.market.pot),
    completedRounds: contract.result.completedRounds,
    tournamentComplete: contract.result.tournamentComplete,
    golfers,
    storylines: Array.isArray(rawResult?.storylines) ? rawResult.storylines : [],
    hero: rawResult?.hero || {
      leadingPortfolio: rawResult?.portfolios?.[0] || null,
      highestRoi: null,
      bestInvestment: null,
      highestGuaranteed: null,
      highestUpside: null,
    },
    source: { mode: "production-calcutta-v1-published-result" },
  };
}

/** Map the bounded V1 read into the existing participant Calcutta renderer. */
export function productionCalcuttaV1Data(view = {}) {
  const contract = productionCalcuttaV1ContractData(view);
  const visible = contract.published;
  const available = contract.state !== "UNAVAILABLE";
  const calcutta = visible && available
    ? contract.result
      ? resultPresentation(contract, view.result)
      : auctionPresentation(contract)
    : null;
  return {
    calcuttaState: Object.freeze({
      ...contract,
      market: undefined,
      result: undefined,
      configured: contract.state !== "NOT_CONFIGURED",
      visible,
      available,
      stale: contract.freshness.stale,
    }),
    calcutta,
    jobs: [],
    stale: contract.freshness.stale,
    revision: contract.revision,
    queryMs: number(view.query_ms ?? view.queryMs),
  };
}

export async function readProductionCalcuttaV1({ playerId = "", env = process.env } = {}) {
  return scoringShadowRpc("read_production_calcutta_v1", {
    input: clean(playerId) ? { player_id: clean(playerId) } : {},
  }, { env, timeoutMs: 8_000 });
}

export async function currentProductionCalcuttaV1(options = {}) {
  const read = await readProductionCalcuttaV1(options);
  if (!read.payload?.ok || !read.payload.data) {
    const error = new Error("Production Calcutta state is unavailable.");
    error.code = clean(read.payload?.code || "CALCUTTA_V1_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return {
    ...productionCalcuttaV1Data(read.payload.data),
    serviceMs: number(read.durationMs),
    recalculation: null,
  };
}
