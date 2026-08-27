import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import { PRODUCTION_GOOGLE_WORKBOOK_ID } from "./production-foundation-resource-contract.js";

export const GOOGLE_WORKBOOK_MUTATION_INTENTS = Object.freeze({
  CANONICAL_LEGACY: "CANONICAL_LEGACY",
  AUTHORING: "AUTHORING",
  MIRROR_ARCHIVE: "MIRROR_ARCHIVE",
});

export const GOOGLE_AUTHORING_OPERATIONS = Object.freeze({
  ADMIN_CMS_DRAFT: "ADMIN_CMS_DRAFT",
  ADMIN_CMS_GUIDE: "ADMIN_CMS_GUIDE",
  ADMIN_CMS_PRESENTATION: "ADMIN_CMS_PRESENTATION",
  ADMIN_CMS_PREDICTION_SETTINGS: "ADMIN_CMS_PREDICTION_SETTINGS",
  ODDS_PUBLICATION: "ODDS_PUBLICATION",
  PASSPORT_ROLLBACK: "PASSPORT_ROLLBACK",
  TOURNAMENT_GUIDE: "TOURNAMENT_GUIDE",
});

const authoringOperations = new Set(Object.values(GOOGLE_AUTHORING_OPERATIONS));
const sheetSet = (...names) => new Set(names);
const AUTHORING_OPERATION_SHEETS = Object.freeze({
  [GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_DRAFT]: sheetSet(
    "Draft Settings", "Draft Picks", "Admin Audit Log",
  ),
  [GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_GUIDE]: sheetSet(
    "Tournament Itinerary", "Admin Audit Log",
  ),
  [GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_PRESENTATION]: sheetSet(
    "Media Library", "Site Settings", "Admin Audit Log",
  ),
  [GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_PREDICTION_SETTINGS]: sheetSet(
    "Prediction Settings", "Admin Audit Log",
  ),
  [GOOGLE_AUTHORING_OPERATIONS.ODDS_PUBLICATION]: sheetSet(
    "Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results",
  ),
  [GOOGLE_AUTHORING_OPERATIONS.PASSPORT_ROLLBACK]: sheetSet(
    "Player Passport", "Trusted Devices", "Notification Log", "Admin Audit Log",
  ),
  [GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE]: sheetSet(
    "Guide Sections", "Rule Book", "Tournament Itinerary", "Guide Information", "Admin Audit Log",
  ),
});

const MIRROR_ARCHIVE_OPERATION_SHEETS = Object.freeze({
  SCORING_GOOGLE_OUTBOX: sheetSet(
    "Live Hole Scores", "Live Matches", "Matches", "Match Update Log", "Admin Audit Log",
    "Net Skins Result", "Calcutta Round Results", "Calcutta Standings",
  ),
  ROUND_SCORECARDS_ARCHIVE: sheetSet("Round Scorecards"),
  ODDS_GOOGLE_MIRROR: sheetSet(
    "Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results",
  ),
});

const PARTICIPANT_CANONICAL_OPERATION_SHEETS = Object.freeze({
  "PARTICIPANT:SCORE": sheetSet("Live Hole Scores", "Live Matches", "Match Update Log"),
  "PARTICIPANT:CONFIRM": sheetSet(
    "Live Matches", "Matches", "Match Update Log", "Admin Audit Log",
    "Net Skins Result", "Calcutta Round Results", "Calcutta Standings",
  ),
});

const LIVE_MATCH_CANONICAL_ACTIONS = new Set([
  "UPDATE", "MARK-LIVE", "PAIRING", "FINALIZE", "REOPEN", "ACCESS-GENERATE", "ACCESS-DISABLE",
]);
const LIVE_MATCH_CANONICAL_SHEETS = sheetSet(
  "Live Matches", "Matches", "Match Update Log", "Admin Audit Log",
  "Net Skins Result", "Calcutta Round Results", "Calcutta Standings",
);
const DIRECTOR_CANONICAL_ACTIONS = new Set([
  "AUTOMATION-CHECK", "SET-LIVE", "OPEN-ROUND", "UNLOCK-SCORING", "LOCK-SCORING", "CLOSE-ROUND",
  "REOPEN-MATCH", "MATCH-UNLOCK-SCORING", "MATCH-LOCK-SCORING", "MATCH-MARK-LIVE",
  "MATCH-FINALIZE", "MATCH-REOPEN", "AUTOMATION", "MATCH-MANAGEMENT", "ROUND-PAIRINGS",
  "CALCUTTA-MANAGEMENT", "NET-SKINS-ELIGIBILITY", "COURSE-TEES",
]);
const DIRECTOR_CANONICAL_SHEETS = sheetSet(
  "Tournaments", "Courses", "Live Matches", "Matches", "Match Update Log", "Admin Audit Log",
  "Calcutta Purchases", "Calcutta Ownership", "Calcutta Round Results", "Calcutta Standings",
  "Net Skins", "Net Skins Result",
);
const CANONICAL_CMS_RESOURCE_SHEETS = Object.freeze({
  PLAYERS: sheetSet("Players", "Admin Audit Log"),
  TEAMS: sheetSet("Team Names", "Admin Audit Log"),
  ROSTERS: sheetSet("Handicaps", "Admin Audit Log"),
  COURSES: sheetSet("Courses", "Admin Audit Log"),
  MATCHES: sheetSet("Matches", "Admin Audit Log"),
  AWARDS: sheetSet("Awards", "Admin Audit Log"),
});
const CANONICAL_CMS_ACTIONS = new Set(["SAVE", "ARCHIVE", "DELETE", "REORDER"]);
const ADMIN_TOURNAMENT_SHEETS = sheetSet(
  "Tournaments", "Admin Audit Log", "Calcutta Round Results", "Calcutta Standings",
);

/**
 * Exhaustive sheet-name union for the legacy Google-canonical authority. This
 * is deliberately derived from the same allowlists used by the last-line
 * mutation guard so the Step 11.6 provider fence cannot drift into a separate
 * hand-maintained inventory.
 */
export const PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES = Object.freeze([
  ...new Set([
    ...Object.values(PARTICIPANT_CANONICAL_OPERATION_SHEETS).flatMap((sheets) => [...sheets]),
    ...LIVE_MATCH_CANONICAL_SHEETS,
    ...DIRECTOR_CANONICAL_SHEETS,
    ...Object.values(CANONICAL_CMS_RESOURCE_SHEETS).flatMap((sheets) => [...sheets]),
    ...ADMIN_TOURNAMENT_SHEETS,
  ]),
].sort());
const mutationContext = new AsyncLocalStorage();
const recordedAmbiguityErrors = new WeakSet();
const clean = (value) => String(value ?? "").trim();
const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
const hash = (value) => {
  const serialized = JSON.stringify(stableValue(value));
  return createHash("sha256").update(serialized === undefined ? "null" : serialized).digest("hex");
};

function mutationIntentError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.mutationIntentDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function canonicalOperationSheets(operation) {
  if (PARTICIPANT_CANONICAL_OPERATION_SHEETS[operation]) {
    return PARTICIPANT_CANONICAL_OPERATION_SHEETS[operation];
  }
  if (operation === "ADMIN_TOURNAMENT:UPDATE") return ADMIN_TOURNAMENT_SHEETS;
  if (operation.startsWith("LIVE_MATCHES:")) {
    const action = operation.slice("LIVE_MATCHES:".length);
    return LIVE_MATCH_CANONICAL_ACTIONS.has(action) ? LIVE_MATCH_CANONICAL_SHEETS : null;
  }
  if (operation.startsWith("DIRECTOR:")) {
    const action = operation.slice("DIRECTOR:".length);
    return DIRECTOR_CANONICAL_ACTIONS.has(action) ? DIRECTOR_CANONICAL_SHEETS : null;
  }
  if (operation.startsWith("ADMIN_CMS:")) {
    const [, resource, action, ...remainder] = operation.split(":");
    if (remainder.length || !CANONICAL_CMS_ACTIONS.has(action)) return null;
    return CANONICAL_CMS_RESOURCE_SHEETS[resource] || null;
  }
  return null;
}

function allowedProductionMutationSheets(intent, operation) {
  if (intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY) {
    return canonicalOperationSheets(operation);
  }
  if (intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.AUTHORING) {
    return AUTHORING_OPERATION_SHEETS[operation] || null;
  }
  if (intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.MIRROR_ARCHIVE) {
    return MIRROR_ARCHIVE_OPERATION_SHEETS[operation] || null;
  }
  return null;
}

function assertProductionMutationSheetBoundary(store, affectedSheets, method, path) {
  const normalizedSheets = [...new Set(affectedSheets.map(clean).filter(Boolean))];
  if (!normalizedSheets.length) {
    store.rejectedWrites += 1;
    throw mutationIntentError(
      "PRODUCTION_GOOGLE_MUTATION_SHEET_REQUIRED",
      "Production Google writes must identify every affected workbook sheet.",
      { intent: store.intent, operation: store.operation, method: clean(method).toUpperCase(), path: clean(path) },
      500,
    );
  }
  const allowedSheets = allowedProductionMutationSheets(store.intent, store.operation);
  if (!allowedSheets) {
    store.rejectedWrites += 1;
    throw mutationIntentError(
      "PRODUCTION_GOOGLE_MUTATION_OPERATION_NOT_ALLOWED",
      "This Production Google mutation operation has no approved workbook domain.",
      { intent: store.intent, operation: store.operation, affectedSheets: normalizedSheets.sort() },
      403,
    );
  }
  const disallowedSheets = normalizedSheets.filter((sheet) => !allowedSheets.has(sheet));
  if (disallowedSheets.length) {
    store.rejectedWrites += 1;
    throw mutationIntentError(
      "PRODUCTION_GOOGLE_MUTATION_SHEET_NOT_ALLOWED",
      "This Production Google mutation attempted to cross its approved workbook domain.",
      {
        intent: store.intent,
        operation: store.operation,
        affectedSheets: normalizedSheets.sort(),
        disallowedSheets: disallowedSheets.sort(),
      },
      403,
    );
  }
  return normalizedSheets;
}

export function withGoogleWorkbookMutationIntent(options, operation) {
  if (typeof operation !== "function") {
    throw new TypeError("A Google workbook mutation callback is required.");
  }
  const intent = clean(options?.intent).toUpperCase();
  if (!Object.values(GOOGLE_WORKBOOK_MUTATION_INTENTS).includes(intent)) {
    throw mutationIntentError(
      "GOOGLE_WORKBOOK_MUTATION_INTENT_INVALID",
      "A recognized Google workbook mutation intent is required.",
      { intent },
      500,
    );
  }
  const operationName = clean(options?.operation).toUpperCase();
  if (!operationName) {
    throw mutationIntentError(
      "GOOGLE_WORKBOOK_MUTATION_OPERATION_REQUIRED",
      "A bounded Google workbook mutation operation is required.",
      { intent },
      500,
    );
  }
  if (intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.AUTHORING && !authoringOperations.has(operationName)) {
    throw mutationIntentError(
      "GOOGLE_WORKBOOK_AUTHORING_OPERATION_NOT_ALLOWED",
      "This Google workbook authoring operation is not allowlisted.",
      { intent, operation: operationName },
      403,
    );
  }
  const parent = mutationContext.getStore();
  if (parent) {
    if (parent.intent !== intent || parent.operation !== operationName) {
      throw mutationIntentError(
        "GOOGLE_WORKBOOK_MUTATION_INTENT_NESTING_CONFLICT",
        "A Google workbook mutation cannot change intent inside an active mutation scope.",
        {
          activeIntent: parent.intent,
          activeOperation: parent.operation,
          requestedIntent: intent,
          requestedOperation: operationName,
        },
        409,
      );
    }
    if (intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY &&
        parent.admission !== options?.admission) {
      throw mutationIntentError(
        "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_NESTING_CONFLICT",
        "A canonical Google mutation cannot change admission inside an active mutation scope.",
        { operation: operationName },
        409,
      );
    }
    return operation();
  }
  const store = {
    intent,
    operation: operationName,
    admission: options?.admission || null,
    capabilityModule: null,
    capabilityModulePromise: null,
    writeStartPromise: null,
    writeStarted: false,
    writeAttempts: 0,
    confirmedWrites: 0,
    rejectedWrites: 0,
    ambiguousWrites: 0,
    affectedSheets: new Set(),
    providerBeforeReads: [],
    providerAfterReads: [],
    certifiedProviderProof: null,
  };
  return mutationContext.run(store, operation);
}

/**
 * Last-line workbook-write guard. It validates intent before credentials are
 * selected by the sole Sheets transport, then exposes a provider-dispatch hook.
 * Exact Production writes cannot proceed without one of three explicit intents.
 * Canonical legacy writes additionally require a live v3 admission; the hook
 * atomically records durable WRITE_STARTED after OAuth and immediately before
 * the first Google provider request is invoked.
 */
export async function prepareGoogleWorkbookMutation({
  spreadsheetId,
  method,
  path,
  affectedSheets = [],
  env = process.env,
} = {}) {
  const productionWorkbook = clean(spreadsheetId) === PRODUCTION_GOOGLE_WORKBOOK_ID;
  const productionRuntime = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const store = mutationContext.getStore();
  if (productionRuntime && !productionWorkbook) {
    throw mutationIntentError(
      "PRODUCTION_GOOGLE_WORKBOOK_RESOURCE_MISMATCH",
      "Production Google writes require the exact Production workbook.",
      { productionWorkbook: false },
    );
  }
  if (productionWorkbook && !store) {
    throw mutationIntentError(
      "PRODUCTION_GOOGLE_MUTATION_INTENT_REQUIRED",
      "Production Google workbook writes require an explicit mutation intent.",
      { method: clean(method).toUpperCase(), path: clean(path), productionWorkbook: true },
    );
  }
  if (!store) return null;

  const normalizedAffectedSheets = productionWorkbook
    ? assertProductionMutationSheetBoundary(store, affectedSheets, method, path)
    : affectedSheets.map(clean).filter(Boolean);
  for (const sheet of normalizedAffectedSheets) {
    const name = clean(sheet);
    if (name) store.affectedSheets.add(name);
  }
  store.writeAttempts += 1;

  const canonicalLegacy = productionWorkbook &&
    store.intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY;
  if (canonicalLegacy) {
    if (!store.admission?.enabled || !clean(store.admission?.admissionId || store.admission?.leaseId)) {
      throw mutationIntentError(
        "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_REQUIRED",
        "Production canonical Google writes require an active v3 admission.",
        { intent: store.intent, operation: store.operation, productionWorkbook: true },
      );
    }
  }

  const prepareDispatch = canonicalLegacy
    ? async () => {
      if (!store.capabilityModulePromise) {
        // Keep the capability module server-only without propagating `server-only`
        // through read-only consumers of this shared intent module.
        store.capabilityModulePromise = import("./production-cutover-scoring-ingress.js");
      }
      if (!store.writeStartPromise) {
        store.writeStartPromise = store.capabilityModulePromise.then((capabilityModule) => {
          store.capabilityModule = capabilityModule;
          return capabilityModule.consumeProductionGoogleAdmissionCapability(store.admission, {
            scope: store,
            operation: store.operation,
            method: clean(method).toUpperCase(),
            path: clean(path),
          });
        });
      }
      try {
        await store.writeStartPromise;
        store.writeStarted = true;
      } catch (error) {
        // The durable marker may have committed immediately before the
        // capability expired. Preserve that boundary so outcome reporting can
        // never misclassify it as proven-no-write.
        if (error?.capabilityDiagnostics?.writeStarted === true) {
          store.writeStarted = true;
        }
        if (error?.authorityDiagnostics?.writeStartOutcomeUnknown === true) {
          markGoogleWorkbookMutationAmbiguous(error);
        }
        throw error;
      }
      return true;
    }
    : async () => true;
  const assertDispatch = canonicalLegacy
    ? () => store.capabilityModule.assertProductionGoogleAdmissionCapabilityActive(store.admission, {
      scope: store,
      operation: store.operation,
    })
    : () => true;
  return Object.freeze({
    intent: store.intent,
    operation: store.operation,
    productionWorkbook,
    admission: productionWorkbook && store.intent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY
      ? store.admission : null,
    prepareDispatch,
    assertDispatch,
  });
}

export function confirmGoogleWorkbookMutation() {
  const store = mutationContext.getStore();
  if (store) store.confirmedWrites += 1;
}

export function rejectGoogleWorkbookMutation() {
  const store = mutationContext.getStore();
  if (store) store.rejectedWrites += 1;
}

export function markGoogleWorkbookMutationAmbiguous(error) {
  const store = mutationContext.getStore();
  if (!store) return false;
  if (error && (typeof error === "object" || typeof error === "function")) {
    if (recordedAmbiguityErrors.has(error)) return false;
    recordedAmbiguityErrors.add(error);
  }
  store.ambiguousWrites += 1;
  return true;
}

export function recordGoogleWorkbookReadback({ path, payload } = {}) {
  const store = mutationContext.getStore();
  if (!store) return;
  const item = Object.freeze({ path: clean(path), fingerprint: hash(payload) });
  if (store.writeStarted || store.confirmedWrites > 0) store.providerAfterReads.push(item);
  else store.providerBeforeReads.push(item);
}

/**
 * Bind an operation-specific expected result to an independently read provider
 * result. Merely receiving a successful Sheets HTTP response, or performing an
 * unrelated GET later in the call tree, is deliberately insufficient. The
 * caller must project the exact canonical fields it expected and the exact
 * fields it read back; unequal projections fail closed.
 */
export function certifyGoogleWorkbookMutationReadback(input = {}) {
  const { before, expectedAfter, providerReadback, proofType } = input;
  const store = mutationContext.getStore();
  if (!store || store.intent !== GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY) {
    throw mutationIntentError(
      "PRODUCTION_CANONICAL_GOOGLE_READBACK_SCOPE_REQUIRED",
      "Canonical Google read-back proof requires an active canonical mutation scope.",
      {},
      500,
    );
  }
  if (!store.writeStarted || store.confirmedWrites < 1) {
    throw mutationIntentError(
      "PRODUCTION_CANONICAL_GOOGLE_PROVIDER_WRITE_REQUIRED",
      "Canonical Google read-back proof cannot be recorded before a confirmed provider write.",
      { writeStarted: store.writeStarted, confirmedWrites: store.confirmedWrites },
      500,
    );
  }
  if (!Object.hasOwn(input, "before") || !Object.hasOwn(input, "expectedAfter") ||
      !Object.hasOwn(input, "providerReadback") || !clean(proofType)) {
    throw mutationIntentError(
      "PRODUCTION_CANONICAL_GOOGLE_READBACK_EVIDENCE_REQUIRED",
      "Canonical Google read-back proof requires before, expected-after, and provider-readback evidence.",
      {},
      500,
    );
  }
  const evidence = (kind, payload) => hash({
    operation: store.operation,
    proofType: clean(proofType).toUpperCase(),
    kind,
    payload,
  });
  const expectedFingerprint = evidence("AFTER", expectedAfter);
  const readbackFingerprint = evidence("AFTER", providerReadback);
  if (expectedFingerprint !== readbackFingerprint) {
    throw mutationIntentError(
      "PRODUCTION_CANONICAL_GOOGLE_READBACK_MISMATCH",
      "Canonical Google provider read-back did not match the expected mutation result.",
      { proofType: clean(proofType).toUpperCase() },
      503,
    );
  }
  store.certifiedProviderProof = Object.freeze({
    providerBeforeFingerprint: evidence("BEFORE", before),
    providerAfterFingerprint: expectedFingerprint,
    providerReadbackFingerprint: readbackFingerprint,
    proofType: clean(proofType).toUpperCase(),
  });
  return store.certifiedProviderProof;
}

function evidenceFingerprint(items) {
  return items.length ? hash(items) : "";
}

export function googleWorkbookMutationOutcome() {
  const store = mutationContext.getStore();
  if (!store) return Object.freeze({
    intent: "",
    operation: "",
    writeStarted: false,
    writeAttempts: 0,
    confirmedWrites: 0,
    rejectedWrites: 0,
    ambiguousWrites: 0,
    affectedSheets: Object.freeze([]),
    providerBeforeFingerprint: "",
    providerAfterFingerprint: "",
    providerReadbackFingerprint: "",
  });
  const certified = store.certifiedProviderProof;
  return Object.freeze({
    intent: store.intent,
    operation: store.operation,
    writeStarted: store.writeStarted,
    writeAttempts: store.writeAttempts,
    confirmedWrites: store.confirmedWrites,
    rejectedWrites: store.rejectedWrites,
    ambiguousWrites: store.ambiguousWrites,
    affectedSheets: Object.freeze([...store.affectedSheets].sort()),
    providerBeforeFingerprint: certified?.providerBeforeFingerprint || "",
    providerAfterFingerprint: certified?.providerAfterFingerprint || "",
    providerReadbackFingerprint: certified?.providerReadbackFingerprint || "",
    providerReadDiagnosticsFingerprint: evidenceFingerprint(store.providerAfterReads),
    readbackProofType: certified?.proofType || "",
  });
}

export function googleAuthoringOperationNames() {
  return [...authoringOperations];
}
