import "server-only";

import {
  buildDraftProjection,
  compareDraftProjection,
  DRAFT_SOURCE_TABS,
} from "./draft-contract.js";
import { draftReadEnvironment } from "./draft-read-source.js";
import { importDraftProjection, readDraftProjection } from "./draft-supabase.js";
import { readWorkbookSheetsByName } from "./google-sheets-write.js";
import {
  assertPreviewSpreadsheetIsolation,
  configuredSpreadsheetId,
} from "./spreadsheet-environment.js";
import { loadSecondaryHistoryModel } from "./secondary-history-service.js";

const clean = (value) => String(value ?? "").trim();
const records = (sheet) => (sheet?.records || []).map(({ record }) => record);

export async function buildDraftSourceProjection({ actorId, env = process.env, dependencies = {} } = {}) {
  if (clean(env.VERCEL_ENV).toLowerCase() !== "preview") {
    const error = new Error("Draft synchronization is Preview-only.");
    error.code = "DRAFT_PREVIEW_REQUIRED";
    error.status = 404;
    throw error;
  }
  const workbookId = dependencies.configuredSpreadsheetId
    ? dependencies.configuredSpreadsheetId(env)
    : clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID || configuredSpreadsheetId());
  (dependencies.assertPreviewSpreadsheetIsolation || assertPreviewSpreadsheetIsolation)(workbookId);
  const sheetsReader = dependencies.readWorkbookSheetsByName || readWorkbookSheetsByName;
  const historyLoader = dependencies.loadSecondaryHistoryModel || loadSecondaryHistoryModel;
  const [sheets, secondaryHistory] = await Promise.all([
    sheetsReader(DRAFT_SOURCE_TABS, { fresh: true }),
    historyLoader({ env }),
  ]);
  return buildDraftProjection({
    settingsRows: records(sheets["Draft Settings"]),
    pickRows: records(sheets["Draft Picks"]),
    history: secondaryHistory.calculations,
    sourceWorkbookId: workbookId,
    requestedBy: clean(actorId || "Tournament Director"),
  });
}

export async function readStoredDraftProjection({ env = process.env, dependencies = {} } = {}) {
  const reader = dependencies.readDraftProjection || readDraftProjection;
  const read = await reader({ scope: "YEARS" }, { env, timeoutMs: 15_000 });
  if (!read?.payload?.ok || !read.payload.data) return { read, drafts: [] };
  return { read, drafts: read.payload.data.drafts || [] };
}

export async function synchronizeDraftProjection({ actorId, correctionReason = "", env = process.env, dependencies = {} } = {}) {
  const sourceProjection = await buildDraftSourceProjection({ actorId, env, dependencies });
  if (clean(correctionReason)) {
    sourceProjection.correction_reason = clean(correctionReason);
  }
  const importer = dependencies.importDraftProjection || importDraftProjection;
  const imported = await importer(sourceProjection, { env, timeoutMs: 20_000 });
  if (!imported?.payload?.ok) {
    const error = new Error("Draft projection could not be synchronized.");
    error.code = imported?.payload?.code || "DRAFT_PROJECTION_SYNC_FAILED";
    error.status = 503;
    error.diagnostics = imported?.payload || null;
    throw error;
  }
  const stored = await readStoredDraftProjection({ env, dependencies });
  if (!stored.drafts.length) {
    const error = new Error("Draft projection could not be read back.");
    error.code = "DRAFT_PROJECTION_READBACK_FAILED";
    error.status = 503;
    throw error;
  }
  const parity = compareDraftProjection(sourceProjection.drafts, stored.drafts);
  if (!parity.pass) {
    const error = new Error("Draft projection read-back parity failed.");
    error.code = "DRAFT_PROJECTION_READBACK_PARITY_FAILED";
    error.status = 503;
    error.diagnostics = parity;
    throw error;
  }
  return {
    ok: true,
    sourceAuthority: "GOOGLE",
    projectionDatastore: "SUPABASE",
    changed: Boolean(imported.payload.changed),
    changedCount: Number(imported.payload.changed_count || 0),
    duplicateCount: Number(imported.payload.duplicate_count || 0),
    results: imported.payload.results || [],
    synchronizationFingerprint: sourceProjection.synchronization_fingerprint,
    sourceProjection,
    storedDrafts: stored.drafts,
    parity,
    freshness: { status: "CURRENT", reason: "SYNCHRONIZED_SOURCE_FINGERPRINT" },
    googleRead: { tabs: [...DRAFT_SOURCE_TABS], broadPredictionLoaderUsed: false, historicalLoaderUsed: false },
  };
}

export function shouldSynchronizeDraftAfterWrite(env = process.env) {
  const source = draftReadEnvironment(env);
  return source.preview && source.requested === "supabase" && !source.blocked;
}
