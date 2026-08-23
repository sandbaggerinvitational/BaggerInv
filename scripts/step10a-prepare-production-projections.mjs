#!/usr/bin/env node

/**
 * Step 10A read-only Production projection payload preparation.
 *
 * This utility reads the exact Production workbook, runs the already-certified
 * domain parsers, and writes local, owner-protected JSON envelopes suitable for
 * review before a separately authorized dormant-project import. It never calls
 * Supabase, writes Google, creates Auth users, or changes any source selector.
 */

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

import {
  GUIDE_PROJECTION_SCHEMA_VERSION,
  GUIDE_PROJECTION_SHEETS,
  buildGuideProjection,
} from "../lib/tournament-guide-projection.js";
import {
  PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION,
  buildPlayerPublicProfileProjection,
} from "../lib/player-public-profile-contract.js";
import {
  PREDICTION_SETTINGS_CONTRACT_VERSION,
  PREDICTION_SETTINGS_SOURCE_TAB,
  buildPredictionSettingsProjection,
} from "../lib/prediction-settings-contract.js";
import {
  DRAFT_CONTRACT_VERSION,
  DRAFT_SOURCE_TABS,
  buildDraftProjection,
} from "../lib/draft-contract.js";
import { buildNetSkinsConfigurationImport } from "../lib/net-skins-supabase.js";
import {
  CALCUTTA_WORKBOOK_TABS,
  buildCalcuttaConfigurationImport,
} from "../lib/calcutta-supabase.js";
import {
  PUBLISHED_ODDS_WORKBOOK_TABS,
  buildPublishedOddsImport,
} from "../lib/published-odds-supabase.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

export const PRODUCTION_PROJECTION_RESOURCE = Object.freeze({
  environment: "PRODUCTION",
  projectRef: "ymqhhtxaywtqllynrmxe",
  projectUrl: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  workbookId: PRODUCTION_SPREADSHEET_ID,
  tournamentId: "2026",
  tournamentYear: 2026,
});

const CALCUTTA_CONFIGURATION_TABS = Object.freeze(CALCUTTA_WORKBOOK_TABS.slice(0, 4));
const NET_SKINS_SOURCE_TABS = Object.freeze(["Net Skins"]);

export const PRODUCTION_PROJECTION_SPECS = Object.freeze({
  GUIDE: Object.freeze({
    contractVersion: GUIDE_PROJECTION_SCHEMA_VERSION,
    sourceTabs: Object.freeze([...GUIDE_PROJECTION_SHEETS]),
    file: "guide.json",
  }),
  PLAYER_EDITORIAL: Object.freeze({
    contractVersion: PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION,
    sourceTabs: Object.freeze(["Players"]),
    file: "player-editorial.json",
  }),
  PREDICTION_SETTINGS: Object.freeze({
    contractVersion: PREDICTION_SETTINGS_CONTRACT_VERSION,
    sourceTabs: Object.freeze([PREDICTION_SETTINGS_SOURCE_TAB]),
    file: "prediction-settings.json",
  }),
  DRAFT: Object.freeze({
    contractVersion: DRAFT_CONTRACT_VERSION,
    sourceTabs: Object.freeze([...DRAFT_SOURCE_TABS]),
    file: "draft.json",
  }),
  NET_SKINS_CONFIGURATION: Object.freeze({
    contractVersion: "net-skins-configuration-v1",
    sourceTabs: NET_SKINS_SOURCE_TABS,
    supportingTabs: Object.freeze(["Live Matches"]),
    file: "net-skins-configuration.json",
  }),
  CALCUTTA_CONFIGURATION: Object.freeze({
    contractVersion: "calcutta-configuration-v1",
    sourceTabs: CALCUTTA_CONFIGURATION_TABS,
    file: "calcutta-configuration.json",
  }),
  PUBLISHED_ODDS: Object.freeze({
    contractVersion: "published-odds-v1",
    sourceTabs: Object.freeze([...PUBLISHED_ODDS_WORKBOOK_TABS]),
    file: "published-odds.json",
  }),
});

export const PRODUCTION_PROJECTION_READ_TABS = Object.freeze([...new Set(
  Object.values(PRODUCTION_PROJECTION_SPECS).flatMap((spec) => [
    ...spec.sourceTabs,
    ...(spec.supportingTabs || []),
  ]),
)]);

const clean = (value) => String(value ?? "").trim();

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function productionProjectionFingerprint(value, { serialized = false } = {}) {
  const input = serialized ? String(value) : JSON.stringify(stable(value));
  return createHash("sha256").update(input).digest("hex");
}

export function productionProjectionCanonicalJson(value) {
  return JSON.stringify(stable(value));
}

function sheetRecords(sheet) {
  return (sheet?.records || []).map((item) => item?.record || item || {});
}

function sourceRowsForYear(sheets, tab, year = PRODUCTION_PROJECTION_RESOURCE.tournamentYear) {
  return sheetRecords(sheets?.[tab]).filter((row) => {
    const rowYear = Number(row?.Year ?? row?.year);
    return Number.isInteger(rowYear) && rowYear === Number(year);
  });
}

function safeDiagnostics(value, depth = 0) {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeDiagnostics(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (/secret|password|credential|access.?token|access.?code|otp|authorization/i.test(key)) {
        return [[key, "[REDACTED]"]];
      }
      return [[key, safeDiagnostics(item, depth + 1)]];
    }));
  }
  return value;
}

function productionScopeError(code, message, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

export function assertProductionProjectionResource({
  workbookId = PRODUCTION_PROJECTION_RESOURCE.workbookId,
  projectRef = PRODUCTION_PROJECTION_RESOURCE.projectRef,
  projectUrl = PRODUCTION_PROJECTION_RESOURCE.projectUrl,
  tournamentId = PRODUCTION_PROJECTION_RESOURCE.tournamentId,
  tournamentYear = PRODUCTION_PROJECTION_RESOURCE.tournamentYear,
} = {}) {
  if (clean(workbookId) !== PRODUCTION_PROJECTION_RESOURCE.workbookId
      || clean(projectRef) !== PRODUCTION_PROJECTION_RESOURCE.projectRef
      || clean(projectUrl) !== PRODUCTION_PROJECTION_RESOURCE.projectUrl
      || clean(tournamentId) !== PRODUCTION_PROJECTION_RESOURCE.tournamentId
      || Number(tournamentYear) !== PRODUCTION_PROJECTION_RESOURCE.tournamentYear) {
    throw productionScopeError(
      "PRODUCTION_PROJECTION_EXACT_RESOURCE_REQUIRED",
      "Projection preparation requires the exact dormant Production resources.",
    );
  }
  return PRODUCTION_PROJECTION_RESOURCE;
}

function baseEnvelope(domain, {
  actor,
  sourcePayload,
  payload,
  sourceFingerprint,
  payloadFingerprint,
  validationStatus = "VALID",
  validationDiagnostics = {},
  extra = {},
}) {
  const spec = PRODUCTION_PROJECTION_SPECS[domain];
  const sourceCanonicalJson = productionProjectionCanonicalJson(sourcePayload);
  const payloadCanonicalJson = productionProjectionCanonicalJson(payload);
  const computedSourceFingerprint = productionProjectionFingerprint(sourceCanonicalJson, { serialized: true });
  const computedPayloadFingerprint = productionProjectionFingerprint(payloadCanonicalJson, { serialized: true });
  if (clean(sourceFingerprint).toLowerCase() !== computedSourceFingerprint) {
    throw productionScopeError(
      "PRODUCTION_PROJECTION_SOURCE_FINGERPRINT_MISMATCH",
      `${domain} source semantics do not match the parser-declared source fingerprint.`,
    );
  }
  if (clean(payloadFingerprint).toLowerCase() !== computedPayloadFingerprint) {
    throw productionScopeError(
      "PRODUCTION_PROJECTION_PAYLOAD_FINGERPRINT_MISMATCH",
      `${domain} payload semantics do not match the declared payload fingerprint.`,
    );
  }
  return {
    environment: PRODUCTION_PROJECTION_RESOURCE.environment,
    project_ref: PRODUCTION_PROJECTION_RESOURCE.projectRef,
    project_url: PRODUCTION_PROJECTION_RESOURCE.projectUrl,
    source_workbook_id: PRODUCTION_PROJECTION_RESOURCE.workbookId,
    tournament_id: PRODUCTION_PROJECTION_RESOURCE.tournamentId,
    tournament_year: PRODUCTION_PROJECTION_RESOURCE.tournamentYear,
    domain,
    contract_version: spec.contractVersion,
    source_tabs: [...spec.sourceTabs],
    source_fingerprint: clean(sourceFingerprint).toLowerCase(),
    payload_fingerprint: clean(payloadFingerprint).toLowerCase(),
    requested_by: clean(actor),
    validation_status: validationStatus,
    validation_diagnostics: safeDiagnostics(validationDiagnostics),
    source_payload: sourcePayload,
    payload,
    source_canonical_json: sourceCanonicalJson,
    payload_canonical_json: payloadCanonicalJson,
    ...extra,
  };
}

function notConfiguredEnvelope(domain, { actor, sourcePayload, payload, reason }) {
  return baseEnvelope(domain, {
    actor,
    sourcePayload,
    payload,
    sourceFingerprint: productionProjectionFingerprint(sourcePayload),
    payloadFingerprint: productionProjectionFingerprint(payload),
    validationStatus: "NOT_CONFIGURED",
    validationDiagnostics: { reason },
  });
}

export function buildDraftHistoryAdapter(context = {}) {
  if (context?.getTournament && context?.getPlayerMap && context?.getTournamentHandicap) return context;
  const tournaments = Array.isArray(context?.tournaments) ? context.tournaments : [];
  const playerRows = Array.isArray(context?.players) ? context.players : [];
  const playerMap = context?.player_map && typeof context.player_map === "object"
    ? context.player_map
    : Object.fromEntries(playerRows.flatMap((player) => {
      const id = clean(player?.["Player ID"] || player?.player_id || player?.id);
      return id ? [[id, player]] : [];
    }));
  const handicaps = Array.isArray(context?.tournament_handicaps) ? context.tournament_handicaps : [];
  if (!tournaments.length || !Object.keys(playerMap).length) return null;
  return {
    getTournament(year) {
      return tournaments.find((item) => Number(item?.year ?? item?.Year) === Number(year)) || null;
    },
    getPlayerMap() {
      return playerMap;
    },
    getTournamentHandicap(playerId, year) {
      const row = handicaps.find((item) => clean(item?.player_id ?? item?.["Player ID"]) === clean(playerId)
        && Number(item?.tournament_year ?? item?.year ?? item?.Year) === Number(year));
      return row?.handicap ?? row?.tournament_handicap ?? row?.value ?? null;
    },
  };
}

function errorBlocker(domain, error) {
  const diagnostics = error?.diagnostics ?? (
    error?.divergences ? { divergences: error.divergences }
      : error?.issues ? { issues: error.issues }
        : undefined
  );
  return {
    domain,
    code: clean(error?.code || "PRODUCTION_PROJECTION_PREPARATION_FAILED"),
    message: clean(error?.message || "Projection preparation failed."),
    ...(diagnostics === undefined ? {} : { diagnostics: safeDiagnostics(diagnostics) }),
  };
}

const DEFAULT_BUILDERS = Object.freeze({
  guide: buildGuideProjection,
  playerEditorial: buildPlayerPublicProfileProjection,
  predictionSettings: buildPredictionSettingsProjection,
  draft: buildDraftProjection,
  netSkins: buildNetSkinsConfigurationImport,
  calcutta: buildCalcuttaConfigurationImport,
  publishedOdds: buildPublishedOddsImport,
});

/**
 * Pure preparation surface. `sheets` is caller-supplied Google read output;
 * this function performs no network or filesystem operations.
 */
export function prepareProductionProjectionPayloads({
  sheets = {},
  actor = "Step 10A Production shadow preparation",
  canonicalCourseContext,
  draftHistory,
  resource = {},
  builders = {},
} = {}) {
  assertProductionProjectionResource(resource);
  if (!clean(actor)) throw productionScopeError("PRODUCTION_PROJECTION_ACTOR_REQUIRED", "A Production import actor is required.");
  const parser = { ...DEFAULT_BUILDERS, ...builders };
  const envelopes = {};
  const blockers = [];
  const run = (domain, operation) => {
    try {
      envelopes[domain] = operation();
    } catch (error) {
      blockers.push(errorBlocker(domain, error));
    }
  };

  run("GUIDE", () => {
    if (!Array.isArray(canonicalCourseContext) || !canonicalCourseContext.length) {
      throw productionScopeError(
        "PRODUCTION_GUIDE_CANONICAL_COURSE_CONTEXT_REQUIRED",
        "Guide preparation requires the separately certified Production course/hole context.",
      );
    }
    const guideSheets = Object.fromEntries(GUIDE_PROJECTION_SHEETS.map((tab) => [tab, sheetRecords(sheets[tab])]));
    const projection = parser.guide({
      sheets: guideSheets,
      tournament: { id: "2026", year: 2026 },
      approvedTournamentId: "2026",
      canonicalCourseContext,
    });
    const payload = { schemaVersion: projection.schemaVersion, content: projection.content };
    return baseEnvelope("GUIDE", {
      actor,
      sourcePayload: JSON.parse(projection.sourceCanonicalJson),
      payload,
      sourceFingerprint: projection.sourceFingerprint,
      payloadFingerprint: projection.payloadHash,
      validationDiagnostics: { ...projection.validation, sourceCounts: projection.sourceCounts },
      extra: {
        source_canonical_json: projection.sourceCanonicalJson,
        content_canonical_json: projection.contentCanonicalJson,
        payload_canonical_json: projection.payloadCanonicalJson,
        content_fingerprint: projection.contentFingerprint,
        source_metadata: { google_read_only: true, canonical_course_context_supplied: true },
      },
    });
  });

  run("PLAYER_EDITORIAL", () => {
    const playerRows = sheetRecords(sheets.Players);
    // The certified public-profile-v1 parser intentionally excludes these
    // retained Director-authored fields. Never silently discard them or leak
    // GHIN/role data through a public-profile payload; require a separately
    // reviewed Production editorial/private-metadata contract when populated.
    const outsidePublicContract = ["GHIN", "Home Club", "Career Notes"]
      .map((field) => ({ field, populated_rows: playerRows.filter((row) => clean(row?.[field])).length }))
      .filter((item) => item.populated_rows > 0);
    if (outsidePublicContract.length) {
      throw productionScopeError(
        "PRODUCTION_PLAYER_EDITORIAL_CONTRACT_INCOMPLETE",
        "Production Players contains retained metadata outside player-public-profile-v1.",
        { fields: outsidePublicContract, values_exposed: false },
      );
    }
    const projection = parser.playerEditorial(playerRows, {
      sourceWorkbookId: PRODUCTION_PROJECTION_RESOURCE.workbookId,
    });
    const payload = {
      contract_version: projection.contract_version,
      source_workbook_id: projection.source_workbook_id,
      players: projection.players,
    };
    // player-public-profile-v1 fingerprints the complete projection contract,
    // not only the row array. Preserve those exact source semantics so the
    // database can independently recompute and verify the declared hash.
    const sourcePayload = payload;
    return baseEnvelope("PLAYER_EDITORIAL", {
      actor,
      sourcePayload,
      payload,
      sourceFingerprint: projection.source_fingerprint,
      payloadFingerprint: productionProjectionFingerprint(payload),
      validationDiagnostics: {
        playerCount: projection.players.length,
        rawFieldsExcluded: true,
        canonical_or_entitlement_fields_excluded: ["Captain", "Role"]
          .map((field) => ({ field, populated_rows: playerRows.filter((row) => clean(row?.[field])).length }))
          .filter((item) => item.populated_rows > 0),
      },
    });
  });

  run("PREDICTION_SETTINGS", () => {
    const projection = parser.predictionSettings({
      tournamentId: "2026",
      tournamentYear: 2026,
      sourceWorkbookId: PRODUCTION_PROJECTION_RESOURCE.workbookId,
      rows: sheetRecords(sheets[PREDICTION_SETTINGS_SOURCE_TAB]),
      requestedBy: actor,
    });
    const payload = {
      settings: projection.settings,
      settings_fingerprint: projection.settings_fingerprint,
      canonical_settings: projection.canonical_settings,
      effective_settings: projection.effective_settings,
      effective_settings_fingerprint: projection.effective_settings_fingerprint,
      settings_contract_version: projection.settings_contract_version,
      source_tab: projection.source_tab,
    };
    const sourcePayload = {
      sourceTab: projection.source_tab,
      rows: projection.settings,
    };
    return baseEnvelope("PREDICTION_SETTINGS", {
      actor,
      sourcePayload,
      payload,
      sourceFingerprint: projection.source_fingerprint,
      payloadFingerprint: productionProjectionFingerprint(payload),
      validationDiagnostics: projection.validation_diagnostics,
      extra: {
        settings_canonical_json: productionProjectionCanonicalJson(payload.settings),
        effective_settings_canonical_json: productionProjectionCanonicalJson(payload.effective_settings),
      },
    });
  });

  run("DRAFT", () => {
    const history = buildDraftHistoryAdapter(draftHistory);
    if (!history) {
      throw productionScopeError(
        "PRODUCTION_DRAFT_CANONICAL_HISTORY_REQUIRED",
        "Draft preparation requires Production-derived canonical tournament, team, player, and handicap context.",
      );
    }
    const projection = parser.draft({
      settingsRows: sheetRecords(sheets["Draft Settings"]),
      pickRows: sheetRecords(sheets["Draft Picks"]),
      history,
      sourceWorkbookId: PRODUCTION_PROJECTION_RESOURCE.workbookId,
      requestedBy: actor,
    });
    const payload = {
      drafts: projection.drafts,
      synchronization_fingerprint: projection.synchronization_fingerprint,
    };
    const sourcePayload = {
      drafts: projection.drafts.map((draft) => ({
        tournament_year: draft.tournament_year,
        source_settings: draft.source_settings,
        source_picks: draft.source_picks,
      })),
    };
    return baseEnvelope("DRAFT", {
      actor,
      sourcePayload,
      payload,
      sourceFingerprint: productionProjectionFingerprint(sourcePayload),
      payloadFingerprint: productionProjectionFingerprint(payload),
      validationDiagnostics: {
        draftCount: projection.drafts.length,
        years: projection.drafts.map((draft) => draft.tournament_year),
      },
    });
  });

  run("NET_SKINS_CONFIGURATION", () => {
    const currentRows = sourceRowsForYear(sheets, "Net Skins");
    if (!currentRows.length) {
      const sourcePayload = { rows: [] };
      const payload = { status: "NOT_CONFIGURED", rounds: [] };
      return notConfiguredEnvelope("NET_SKINS_CONFIGURATION", {
        actor,
        sourcePayload,
        payload,
        reason: "NO_PRODUCTION_2026_NET_SKINS_CONFIGURATION",
      });
    }
    const projection = parser.netSkins({
      sheets,
      tournamentId: "2026",
      tournamentYear: 2026,
      sourceWorkbookId: PRODUCTION_PROJECTION_RESOURCE.workbookId,
      requestedBy: actor,
    });
    const payload = { status: "VALID", rounds: projection.rounds };
    const sourcePayload = { rows: projection.rounds.flatMap((round) => round.entries.map((entry) => entry.source_payload)) };
    return baseEnvelope("NET_SKINS_CONFIGURATION", {
      actor,
      sourcePayload,
      payload,
      sourceFingerprint: productionProjectionFingerprint(sourcePayload),
      payloadFingerprint: productionProjectionFingerprint(payload),
      validationDiagnostics: {
        roundCount: projection.rounds.length,
        entryCount: projection.rounds.reduce((sum, round) => sum + round.entries.length, 0),
      },
    });
  });

  run("CALCUTTA_CONFIGURATION", () => {
    const currentRows = CALCUTTA_CONFIGURATION_TABS.flatMap((tab) => sourceRowsForYear(sheets, tab));
    if (!currentRows.length) {
      const sourcePayload = { purchases: [], ownership: [], point_structure: [], payout_structure: [] };
      const payload = {
        status: "NOT_CONFIGURED",
        purchases: [],
        ownership: [],
        point_structure: [],
        payout_structure: [],
        financial_contract: {
          total_market_value: 0,
          ownership_totals: {},
          payout_allocation: { round_1: 0, round_2: 0, round_3: 0, overall: 0 },
          total_payout_fraction: 0,
        },
      };
      return notConfiguredEnvelope("CALCUTTA_CONFIGURATION", {
        actor,
        sourcePayload,
        payload,
        reason: "NO_PRODUCTION_2026_CALCUTTA_CONFIGURATION",
      });
    }
    const projection = parser.calcutta({
      sheets,
      tournamentId: "2026",
      tournamentYear: 2026,
      sourceWorkbookId: PRODUCTION_PROJECTION_RESOURCE.workbookId,
      requestedBy: actor,
    });
    const payload = {
      status: "VALID",
      purchases: projection.purchases,
      ownership: projection.ownership,
      point_structure: projection.point_structure,
      payout_structure: projection.payout_structure,
      financial_contract: projection.financial_contract,
    };
    return baseEnvelope("CALCUTTA_CONFIGURATION", {
      actor,
      sourcePayload: payload,
      payload,
      sourceFingerprint: productionProjectionFingerprint(payload),
      payloadFingerprint: productionProjectionFingerprint(payload),
      validationDiagnostics: {
        purchaseCount: projection.purchases.length,
        ownershipCount: projection.ownership.length,
      },
    });
  });

  run("PUBLISHED_ODDS", () => {
    const projection = parser.publishedOdds({
      sheets,
      tournamentId: "2026",
      tournamentYear: 2026,
      sourceWorkbookId: PRODUCTION_PROJECTION_RESOURCE.workbookId,
      requestedBy: actor,
    });
    const sourceSnapshots = projection.snapshots;
    const payloadSnapshots = sourceSnapshots.map((snapshot) => ({
      ...snapshot,
      published_payload_canonical_json: productionProjectionCanonicalJson(snapshot.published_payload),
    }));
    const payload = {
      current_official_milestone: projection.current_official_milestone,
      snapshots: payloadSnapshots,
    };
    const sourcePayload = {
      tournamentId: "2026",
      year: 2026,
      currentPhase: projection.current_official_milestone,
      snapshots: sourceSnapshots,
    };
    return baseEnvelope("PUBLISHED_ODDS", {
      actor,
      sourcePayload,
      payload,
      sourceFingerprint: projection.import_fingerprint,
      payloadFingerprint: productionProjectionFingerprint(payload),
      validationDiagnostics: {
        snapshotCount: projection.snapshots.length,
        reportingParityVerified: projection.snapshots.every((snapshot) => snapshot.publication_verified === true),
      },
    });
  });

  return {
    ok: blockers.length === 0,
    resource: {
      environment: PRODUCTION_PROJECTION_RESOURCE.environment,
      project_ref: PRODUCTION_PROJECTION_RESOURCE.projectRef,
      project_url: PRODUCTION_PROJECTION_RESOURCE.projectUrl,
      source_workbook_id: PRODUCTION_PROJECTION_RESOURCE.workbookId,
      tournament_id: PRODUCTION_PROJECTION_RESOURCE.tournamentId,
      tournament_year: PRODUCTION_PROJECTION_RESOURCE.tournamentYear,
    },
    envelopes,
    blockers,
    safety: {
      google_read_only: true,
      google_writes: 0,
      supabase_requests: 0,
      auth_users_created: 0,
      otp_sends: 0,
      source_or_authority_changes: 0,
    },
  };
}

export async function writeProductionProjectionArtifacts(outputDir, prepared, { googleReadDiagnostics = {} } = {}) {
  if (!clean(outputDir)) throw productionScopeError("PRODUCTION_PROJECTION_OUTPUT_DIRECTORY_REQUIRED", "A caller-provided output directory is required.");
  const resolved = path.resolve(outputDir);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  await chmod(resolved, 0o700);
  const reservedNames = new Set(["manifest.json", ...Object.values(PRODUCTION_PROJECTION_SPECS).map((spec) => spec.file)]);
  const staleArtifacts = (await readdir(resolved)).filter((name) => reservedNames.has(name));
  if (staleArtifacts.length) {
    throw productionScopeError(
      "PRODUCTION_PROJECTION_OUTPUT_NOT_EMPTY",
      "The output directory contains an earlier projection artifact; use a fresh directory to prevent stale-domain confusion.",
      { files: staleArtifacts.sort() },
    );
  }
  const files = [];
  for (const [domain, envelope] of Object.entries(prepared.envelopes || {})) {
    const spec = PRODUCTION_PROJECTION_SPECS[domain];
    const target = path.join(resolved, spec.file);
    await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
    await chmod(target, 0o600);
    files.push({ domain, file: spec.file, payload_fingerprint: envelope.payload_fingerprint, validation_status: envelope.validation_status });
  }
  const manifest = {
    contract: "step10a-production-projection-preparation-v1",
    resource: prepared.resource,
    complete: prepared.blockers?.length === 0,
    files,
    blockers: prepared.blockers || [],
    google_read_diagnostics: safeDiagnostics(googleReadDiagnostics),
    safety: prepared.safety,
  };
  const manifestPath = path.join(resolved, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(manifestPath, 0o600);
  return { outputDir: resolved, manifestPath, manifest };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw productionScopeError("PRODUCTION_PROJECTION_ARGUMENT_INVALID", `Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (["help"].includes(key)) result[key] = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw productionScopeError("PRODUCTION_PROJECTION_ARGUMENT_REQUIRED", `Missing value for --${key}.`);
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

async function optionalJson(filename, key) {
  if (!filename) return undefined;
  let value;
  try { value = JSON.parse(await readFile(path.resolve(filename), "utf8")); }
  catch {
    throw productionScopeError("PRODUCTION_PROJECTION_CONTEXT_INVALID", `${key} must be valid local JSON.`);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.help) {
    process.stdout.write("Usage: node scripts/step10a-prepare-production-projections.mjs --output-dir DIR [--actor LABEL] [--canonical-course-context FILE] [--draft-context FILE]\n");
    return;
  }
  if (["preview", "production"].includes(clean(process.env.VERCEL_ENV).toLowerCase())) {
    throw productionScopeError("PRODUCTION_PROJECTION_LOCAL_ONLY", "This preparation utility is local/server-only and cannot run inside a deployed Vercel function.");
  }
  assertProductionProjectionResource({ workbookId: args["workbook-id"] || PRODUCTION_PROJECTION_RESOURCE.workbookId });
  if (!args["output-dir"]) throw productionScopeError("PRODUCTION_PROJECTION_OUTPUT_DIRECTORY_REQUIRED", "--output-dir is required.");
  const [{ loadCanonicalProductionProjectionShadowSource }, { withDataAuthorityRequestScope }] = await Promise.all([
    import("../lib/google-sheets-data.js"),
    import("../lib/data-authority-request.js"),
  ]);
  const googleRead = await withDataAuthorityRequestScope({
    label: "step10a-production-projection-gviz-read",
    source: "google",
  }, () => loadCanonicalProductionProjectionShadowSource());
  if (Number(googleRead.diagnostics?.googleWriterOperations || 0) !== 0) {
    throw productionScopeError("PRODUCTION_PROJECTION_GOOGLE_WRITE_DETECTED", "Payload preparation detected an unexpected Google writer operation.");
  }
  const canonicalCourseContextValue = await optionalJson(args["canonical-course-context"], "canonical course context");
  const draftContextValue = await optionalJson(args["draft-context"], "Draft canonical context");
  const prepared = prepareProductionProjectionPayloads({
    sheets: googleRead.result,
    actor: args.actor || "Step 10A Production shadow preparation",
    canonicalCourseContext: canonicalCourseContextValue?.canonical_course_context || canonicalCourseContextValue?.courses || canonicalCourseContextValue,
    draftHistory: draftContextValue,
  });
  const written = await writeProductionProjectionArtifacts(args["output-dir"], prepared, {
    googleReadDiagnostics: googleRead.diagnostics,
  });
  process.stdout.write(`${JSON.stringify({
    ok: prepared.ok,
    output_directory: written.outputDir,
    files: written.manifest.files,
    blockers: prepared.blockers,
    google_http_requests: Number(googleRead.diagnostics?.googleHttpRequests || 0),
    google_gviz_requests: Number(googleRead.diagnostics?.googleGvizRequests || 0),
    google_writer_operations: Number(googleRead.diagnostics?.googleWriterOperations || 0),
    supabase_requests: 0,
  }, null, 2)}\n`);
  if (!prepared.ok) process.exitCode = 2;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: clean(error?.code || "PRODUCTION_PROJECTION_PREPARATION_FAILED"),
      message: clean(error?.message || "Projection preparation failed."),
    })}\n`);
    process.exitCode = 1;
  });
}
