import "server-only";

import { cache } from "react";

import {
  DRAFT_CONTRACT_VERSION,
  draftFingerprint,
  hydrateDraftPresentation,
} from "./draft-contract.js";
import { requireDraftReadSource } from "./draft-read-source.js";
import { readDraftProjection } from "./draft-supabase.js";

const clean = (value) => String(value ?? "").trim();

function projectionData(read) {
  const payload = read?.payload || read || {};
  if (payload.ok !== true || !payload.data) {
    const error = new Error("Draft projection is temporarily unavailable.");
    error.code = clean(payload.code || "DRAFT_PROJECTION_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  if (clean(payload.data.contract_version) !== DRAFT_CONTRACT_VERSION) {
    const error = new Error("Draft projection contract is incompatible.");
    error.code = "DRAFT_PROJECTION_CONTRACT_MISMATCH";
    error.status = 503;
    throw error;
  }
  if (clean(payload.data.validation_status || "VALID") !== "VALID") {
    const error = new Error("Draft projection is invalid.");
    error.code = "DRAFT_PROJECTION_INVALID";
    error.status = 503;
    throw error;
  }
  return payload.data;
}

function hydrateStoredDraft(row = {}) {
  const seed = row.presentation_seed || row.presentationSeed;
  if (!seed || typeof seed !== "object") {
    const error = new Error("Draft presentation projection is incomplete.");
    error.code = "DRAFT_PRESENTATION_PROJECTION_INCOMPLETE";
    error.status = 503;
    throw error;
  }
  const actualFingerprint = draftFingerprint({
    configuration: row.configuration,
    picks: row.normalized_picks || row.picks,
    presentationSeed: seed,
  });
  if (clean(row.payload_fingerprint) !== actualFingerprint) {
    const error = new Error("Draft projection fingerprint validation failed.");
    error.code = "DRAFT_PROJECTION_FINGERPRINT_MISMATCH";
    error.status = 503;
    throw error;
  }
  return Object.freeze({
    ...hydrateDraftPresentation(seed),
    projection: Object.freeze({
      revision: Number(row.revision_number || 0),
      revisionId: clean(row.revision_id),
      sourceFingerprint: clean(row.source_fingerprint),
      configurationFingerprint: clean(row.configuration_fingerprint),
      picksFingerprint: clean(row.picks_fingerprint),
      payloadFingerprint: clean(row.payload_fingerprint),
      contractVersion: clean(row.contract_version),
      synchronizedAt: clean(row.synchronized_at),
      synchronizedBy: clean(row.synchronized_by),
    }),
  });
}

async function readUncached({ scope = "YEARS", year = null, playerId = "", tournamentId = "", env = process.env, dependencies = {}, timeoutMs } = {}) {
  const source = requireDraftReadSource(env);
  if (source.resolved !== "supabase") {
    const error = new Error("Supabase Draft delivery is not selected in this runtime.");
    error.code = "DRAFT_SUPABASE_READ_NOT_SELECTED";
    error.status = 503;
    throw error;
  }
  const reader = dependencies.readDraftProjection || readDraftProjection;
  const startedAt = performance.now();
  const read = await reader({ scope, year, playerId, tournamentId }, { env, timeoutMs });
  const data = projectionData(read);
  const drafts = (data.drafts || []).map(hydrateStoredDraft).sort((left, right) => right.year - left.year);
  return {
    drafts,
    diagnostics: {
      requestedSource: source.requested,
      resolvedSource: source.resolved,
      scope: clean(scope).toUpperCase(),
      rows: drafts.length,
      revisions: drafts.map((draft) => ({ year: draft.year, revision: draft.projection.revision })),
      supabaseRequests: 1,
      googleDraftRequests: 0,
      fallbackUsed: false,
      payloadBytes: Buffer.byteLength(JSON.stringify(data)),
      requestMs: Number(read?.durationMs || 0),
      totalServiceMs: Math.max(0, performance.now() - startedAt),
    },
  };
}

const cachedYears = cache(() => readUncached({ scope: "YEARS" }));
const cachedCurrent = cache(() => readUncached({ scope: "CURRENT" }));

export async function loadDraftProjection(options = {}) {
  if (!options.env && !options.dependencies && !options.timeoutMs) {
    if (clean(options.scope).toUpperCase() === "YEARS") return cachedYears();
    if (clean(options.scope).toUpperCase() === "CURRENT") return cachedCurrent();
  }
  return readUncached(options);
}

export async function readDraftsFromSupabase(options = {}) {
  return (await loadDraftProjection(options)).drafts;
}
