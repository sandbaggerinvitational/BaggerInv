import "server-only";
import {
  readProductionCalcuttaManagement,
  clearProductionCalcuttaV1AuctionEntry,
  configureProductionCalcuttaV1,
  replaceProductionCalcuttaV1AuctionFacts,
} from "./production-calcutta-server.js";
import { resolveProductionScoringDispatchContext } from "./production-scoring-operations-server.js";
import {
  configurationPayload,
  entryPayload,
  mergeEntry,
  canonicalEqual,
} from "./calcutta-management-model.js";

function reject(
  message,
  code = "PRODUCTION_CALCUTTA_MANAGEMENT_CONFLICT",
  status = 409,
) {
  throw Object.assign(new Error(message), { code, status });
}
// One selected entry is merged with its immutable predecessor server-side.
// Retrying after uncertain HTTP delivery reconstructs the SAME canonical payload.
export async function manageCalcutta(action, input, actor, options = {}) {
  const deps = options.dependencies || {};
  const scoped = {
    ...options,
    scoringDispatchContext:
      options.scoringDispatchContext ||
      (await (deps.resolveContext || resolveProductionScoringDispatchContext)({
        requiredPhase: "OBSERVATION",
        env: options.env || process.env,
      })),
  };
  const read = deps.read || readProductionCalcuttaManagement;
  const model = (
    await read(
      { ...actor, expectedAuctionRevision: input.expectedAuctionRevision },
      scoped,
    )
  ).data;
  if (action === "management-read") return { ok: true, data: model };
  if (model.tournament_id !== input.expectedTournamentId)
    reject("The current tournament changed. Reload before saving.");
  if (model.publication_state !== "UNPUBLISHED")
    reject(
      "Unpublish through the separate publication workflow before editing.",
    );
  if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint || ""))
    reject("A reusable request identity is required.", undefined, 400);
  const base = { ...input, ...actor };
  let intended;
  let receipt;
  if (action === "management-configure") {
    try {
      intended = configurationPayload(input.rows, model.players.length);
    } catch (error) {
      reject(error.message, "PRODUCTION_CALCUTTA_MANAGEMENT_VALIDATION", 400);
    }
    // The existing adapter accepts numeric point awards: fail instead of losing precision.
    if (
      intended.pointStructure.some((r) =>
        [1, 2, 3].some(
          (n) =>
            !canonicalEqual(
              r[`round_${n}_award`],
              Number(r[`round_${n}_award`]),
            ),
        ),
      )
    )
      reject(
        "Point precision exceeds the existing canonical adapter.",
        undefined,
        400,
      );
    receipt = await (deps.configure || configureProductionCalcuttaV1)(
      { ...base, ...intended },
      scoped,
    );
  } else if (action === "management-clear-entry") {
    if (!model.players.some(p => p.player_id === input.playerId))
      reject("The golfer is not in the current Calcutta roster.", undefined, 400);
    if (model.predecessor_auction_fingerprint !== (input.expectedAuctionFingerprint || null))
      reject("The auction predecessor could not be verified.");
    if (!model.predecessor_purchases.some(p => p.player_id === input.playerId))
      reject("The saved entry is already Not Entered.");
    intended = {
      purchases: model.predecessor_purchases.filter(p => p.player_id !== input.playerId),
      ownership: model.predecessor_ownership.filter(p => p.player_id !== input.playerId),
    };
    receipt = await (deps.clear || clearProductionCalcuttaV1AuctionEntry)({ ...base, playerId: input.playerId }, scoped);
  } else if (action === "management-entry") {
    let entry;
    try {
      entry = entryPayload(input.entry, model.players);
    } catch (error) {
      reject(error.message, "PRODUCTION_CALCUTTA_MANAGEMENT_VALIDATION", 400);
    }
    if (
      model.predecessor_auction_fingerprint !==
      (input.expectedAuctionFingerprint || null)
    )
      reject("The auction predecessor could not be verified.");
    if (
      input.expectedAuctionRevision > 0 &&
      !model.predecessor_auction_fingerprint
    )
      reject("The auction predecessor is unavailable.");
    intended = mergeEntry(
      {
        purchases: model.predecessor_purchases,
        ownership: model.predecessor_ownership,
      },
      entry,
    );
    receipt = await (deps.replace || replaceProductionCalcuttaV1AuctionFacts)(
      { ...base, ...intended },
      scoped,
    );
  } else reject("Unsupported management action.", undefined, 400);
  const expectedCode =
    action === "management-configure"
      ? "PRODUCTION_CALCUTTA_V1_CONFIGURED"
      : action === "management-clear-entry" ? "PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED" : "PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED";
  const expectedConfiguration =
    Number(input.expectedConfigurationRevision) +
    (action === "management-configure" ? 1 : 0);
  const expectedAuction =
    Number(input.expectedAuctionRevision) +
    (action === "management-entry" || action === "management-clear-entry" ? 1 : 0);
  if (
    (action === "management-clear-entry" && receipt?.cleared_player_id !== input.playerId) ||
    !receipt?.ok ||
    receipt.code !== expectedCode ||
    receipt.publication_state !== "UNPUBLISHED" ||
    receipt.configuration_revision !== expectedConfiguration ||
    receipt.auction_revision !== expectedAuction ||
    receipt.publication_revision !==
      Number(input.expectedPublicationRevision) + 1
  )
    reject(
      "The canonical save receipt is unavailable. Retry the same request.",
    );
  const accepted = (await read(actor, scoped)).data;
  const matches =
    action === "management-configure"
      ? canonicalEqual(accepted.point_structure, intended.pointStructure) &&
        canonicalEqual(accepted.payout_structure, intended.payoutStructure)
      : canonicalEqual(accepted.purchases, intended.purchases) &&
        canonicalEqual(accepted.ownership, intended.ownership);
  if (
    !matches ||
    accepted.publication_state !== "UNPUBLISHED" ||
    accepted.configuration_revision !== receipt.configuration_revision ||
    accepted.auction_revision !== receipt.auction_revision ||
    accepted.publication_revision !== receipt.publication_revision ||
    accepted.configuration_fingerprint !== receipt.configuration_fingerprint ||
    accepted.auction_fingerprint !== receipt.auction_fingerprint
  )
    reject(
      "The save returned a receipt, but readback changed or could not be reconciled. Retain the request and reload.",
    );
  return { ok: true, receipt, data: accepted, readbackVerified: true };
}
