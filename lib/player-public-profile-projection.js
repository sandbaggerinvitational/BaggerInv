import "server-only";

import { readWorkbookSheetsByName } from "./google-sheets-write.js";
import { scoringShadowRpc } from "./scoring-shadow.js";
import {
  PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION,
  buildPlayerPublicProfileProjection,
} from "./player-public-profile-contract.js";
import {
  assertPreviewSpreadsheetIsolation,
  configuredSpreadsheetId,
} from "./spreadsheet-environment.js";

export {
  PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION,
  buildPlayerPublicProfileProjection,
  comparePlayerPublicProfileProjection,
  normalizePlayerPublicProfile,
  playerPublicProfileFingerprint,
} from "./player-public-profile-contract.js";
export const PREVIEW_PLAYER_PROFILE_PROJECT_REF = "idgigvjjqkfbqjeredpb";

const clean = (value) => String(value ?? "").trim();

export async function preparePreviewPlayerPublicProfileProjection({ env = process.env } = {}) {
  if (clean(env.VERCEL_ENV).toLowerCase() !== "preview") {
    const error = new Error("Player public-profile synchronization is Preview-only.");
    error.code = "PREVIEW_ENVIRONMENT_REQUIRED";
    throw error;
  }
  const workbookId = assertPreviewSpreadsheetIsolation(configuredSpreadsheetId());
  const sheets = await readWorkbookSheetsByName(["Players"], { fresh: true });
  const rows = (sheets.Players?.records || []).map((entry) => entry.record || entry);
  return buildPlayerPublicProfileProjection(rows, { sourceWorkbookId: workbookId });
}

export async function syncPreviewPlayerPublicProfiles({ authorization, env = process.env } = {}) {
  const projection = await preparePreviewPlayerPublicProfileProjection({ env });
  const rpc = await scoringShadowRpc("sync_preview_secondary_history_players", {
    input: {
      environment: "PREVIEW",
      project_ref: PREVIEW_PLAYER_PROFILE_PROJECT_REF,
      ...projection,
      authorization,
    },
  }, { env, timeoutMs: 20_000 });
  return { projection, rpc };
}

export async function readPreviewSecondaryHistoryPlayers({ env = process.env, timeoutMs = 10_000 } = {}) {
  return scoringShadowRpc("read_preview_secondary_history_players", {
    input: {
      environment: "PREVIEW",
      project_ref: PREVIEW_PLAYER_PROFILE_PROJECT_REF,
      contract_version: PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION,
    },
  }, { env, timeoutMs });
}
