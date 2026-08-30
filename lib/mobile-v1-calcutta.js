import { createHash } from "node:crypto";

import {
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { productionCutoverReadTransportEnvironment } from "./production-cutover-read-transport.js";
import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import {
  productionCalcuttaV1ContractData,
  readProductionCalcuttaV1 as readCanonicalProductionCalcuttaV1,
} from "./production-calcutta-v1.js";

export const MOBILE_CALCUTTA_CONTRACT_VERSION = "production-calcutta-v1";

const clean = (value) => String(value ?? "").trim();

export function mobileCalcuttaRepresentationRevision(data = {}) {
  return createHash("sha256").update([
    "mobile-calcutta-v1-representation",
    clean(data.revision),
    clean(data.freshness?.sourceFingerprint),
    data.freshness?.stale === true ? "STALE" : "CURRENT",
    data.freshness?.updating === true ? "UPDATING" : "SETTLED",
  ].join("\n")).digest("hex");
}

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

export function mobileCalcuttaDataFromProductionView(view = {}, identity = {}) {
  let contract;
  try {
    contract = productionCalcuttaV1ContractData(view);
  } catch {
    throw unavailable();
  }
  const tournamentId = clean(identity.tournamentId);
  const playerId = clean(identity.playerId);
  if (contract.contractVersion !== MOBILE_CALCUTTA_CONTRACT_VERSION ||
      tournamentId !== PRODUCTION_TOURNAMENT_ID ||
      contract.tournamentId !== tournamentId || !playerId) {
    throw unavailable();
  }
  return {
    ...contract,
    viewer: { playerId },
  };
}

export async function readMobileProductionCalcuttaV1({ tournamentId, playerId } = {}, {
  env = process.env,
  dependencies = {},
} = {}) {
  const resolvedTournamentId = clean(tournamentId);
  const resolvedPlayerId = clean(playerId);
  if (resolvedTournamentId !== PRODUCTION_TOURNAMENT_ID || !resolvedPlayerId) throw unavailable();
  const readState = (dependencies.productionReadTransportEnvironment ||
    productionCutoverReadTransportEnvironment)(
    env,
    "read_production_calcutta_v1",
    { input: { player_id: resolvedPlayerId } },
  );
  if (!readState?.allowed) throw unavailable();
  try {
    return await (dependencies.readCanonicalProductionCalcuttaV1 ||
      readCanonicalProductionCalcuttaV1)({
      playerId: resolvedPlayerId,
      env,
    });
  } catch {
    throw unavailable();
  }
}

export async function mobileCalcuttaResult(identity, {
  env = process.env,
  now = new Date(),
  dependencies = {},
} = {}) {
  let read;
  try {
    read = await (dependencies.readProductionCalcuttaV1 || readMobileProductionCalcuttaV1)({
      tournamentId: identity?.tournamentId,
      playerId: identity?.playerId,
    }, { env, dependencies });
  } catch {
    throw unavailable();
  }
  const data = mobileCalcuttaDataFromProductionView(read?.payload?.data, identity);
  const representationRevision = mobileCalcuttaRepresentationRevision(data);
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw unavailable();
  return {
    status: 200,
    revision: representationRevision,
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data,
      meta: { generatedAt, revision: representationRevision },
    },
  };
}
