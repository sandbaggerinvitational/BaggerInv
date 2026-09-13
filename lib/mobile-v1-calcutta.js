import { isCanonicalReviewer } from './mobile-reviewer-identity.js';
import { productionCalcuttaPresentation } from './mobile-v1-calcutta-presentation.js';
import { productionCutoverReadTransportEnvironment } from "./production-cutover-read-transport.js";
import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";
import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { readMobilePreviewCalcuttaV1 } from "./mobile-v1-preview-leaders-products.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";
import {
  productionCalcuttaV1ContractData,
  readProductionCalcuttaV1 as readCanonicalProductionCalcuttaV1,
} from "./production-calcutta-v1.js";

export const MOBILE_CALCUTTA_CONTRACT_VERSION = "production-calcutta-v1";

const clean = (value) => String(value ?? "").trim();

export function mobileCalcuttaRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({
    product: "mobile-calcutta-v1",
    data,
  });
}

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

export function mobileCalcuttaDataFromProductionView(view = {}, identity = {}) {
  const tournamentId = clean(identity.tournamentId);
  let contract;
  try {
    contract = productionCalcuttaV1ContractData(view, { expectedTournamentId: tournamentId });
  } catch {
    throw unavailable();
  }
  const playerId = clean(identity.playerId);
  if (contract.contractVersion !== MOBILE_CALCUTTA_CONTRACT_VERSION ||
      contract.tournamentId !== tournamentId || (!playerId && !isCanonicalReviewer(identity.context))) {
    throw unavailable();
  }
  const presentation=productionCalcuttaPresentation(contract,view.result,playerId || null);
  if(presentation && isCanonicalReviewer(identity.context)) presentation.observer={subjectId:identity.authUserId};
  return {
    ...contract,
    viewer: { playerId: playerId || null },
    ...(isCanonicalReviewer(identity.context) ? {observer: {subjectId:identity.authUserId}} : {}),
    presentation,
  };
}

export async function readMobileProductionCalcuttaV1({ tournamentId, playerId, context } = {}, {
  env = process.env,
  dependencies = {},
} = {}) {
  const resolvedTournamentId = clean(tournamentId);
  const resolvedPlayerId = clean(playerId);
  if (!/^\d{4}$/.test(resolvedTournamentId) || (!resolvedPlayerId && !isCanonicalReviewer(context))) throw unavailable();
  const readState = (dependencies.productionReadTransportEnvironment ||
    productionCutoverReadTransportEnvironment)(
    env,
    "read_production_calcutta_v1",
    { input: { player_id: resolvedPlayerId, ...(isCanonicalReviewer(context) ? {observer_auth_user_id:context.authUserId} : {}) } },
  );
  if (!readState?.allowed) throw unavailable();
  try {
    return await (dependencies.readCanonicalProductionCalcuttaV1 ||
      readCanonicalProductionCalcuttaV1)({
      playerId: resolvedPlayerId,
      reviewerAuthUserId: isCanonicalReviewer(context) ? context.authUserId : "",
      ...(resolvedTournamentId === "2026"
        ? {} : { tournamentId: resolvedTournamentId }),
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
    const authority = mobileNativeDevelopmentAuthorityEnvironment(env);
    if (authority.runtime === "preview" && !authority.available) throw unavailable();
    const reader = dependencies.readCalcuttaV1 || (authority.available
      ? dependencies.readPreviewCalcuttaV1 || readMobilePreviewCalcuttaV1
      : dependencies.readProductionCalcuttaV1 || readMobileProductionCalcuttaV1);
    read = await reader({
      tournamentId: identity?.tournamentId,
      playerId: identity?.playerId,
      context: identity?.context,
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
