import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeProductionPredictionSettingsAuthoring,
  PRODUCTION_PREDICTION_SETTING_SPECS,
} from "../lib/production-prediction-settings-contract.js";
import {
  normalizePredictionSettings,
  PREDICTION_SETTING_ALIASES,
  PREDICTION_SETTINGS_CONTRACT_VERSION,
  PREDICTION_SETTINGS_DEFAULTS,
} from "../lib/prediction-settings-contract.js";
import { predictionSettingsViewFromOddsConfiguration } from
  "../lib/prediction-settings-supabase.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";

const root = new URL("..", import.meta.url);
const serverModule = new URL(
  "../lib/production-director-projection-synchronization.js",
  import.meta.url,
).href;

const completeObject = () => Object.fromEntries(
  PRODUCTION_PREDICTION_SETTING_SPECS.map((setting) => [
    setting.canonicalKey,
    setting.defaultValue,
  ]),
);

const completeRows = () => PRODUCTION_PREDICTION_SETTING_SPECS.map((setting) => ({
  Setting: setting.canonicalKey,
  Value: setting.defaultValue,
}));

function assertInvalidSettings(settings, issueCode) {
  assert.throws(
    () => normalizeProductionPredictionSettingsAuthoring(settings),
    (error) => error?.code === "PREDICTION_SETTINGS_INVALID" &&
      error?.diagnostics?.errors?.some((issue) => issue.code === issueCode),
  );
}

test("strict Production authoring accepts all eleven aliases through the complete-schema boundary", () => {
  assert.equal(Object.keys(PREDICTION_SETTING_ALIASES).length, 11);
  for (const [canonicalKey, alias] of Object.entries(PREDICTION_SETTING_ALIASES)) {
    const rows = completeRows().map((row) => row.Setting === canonicalKey
      ? { Setting: alias, Value: 17.5 }
      : row);
    const normalized = normalizeProductionPredictionSettingsAuthoring(rows);
    assert.equal(normalized.canonicalSettings[canonicalKey], 17.5, alias);
    assert.equal(Object.keys(normalized.canonicalSettings).length, 30, alias);
  }
});

test("strict Production authoring preserves every supported type and every boolean spelling", () => {
  const settings = {
    ...completeObject(),
    "Player Category Weight": "42%",
    "Minimum Scorecard Recorded Rounds": "2.4",
    "Minimum Scorecard Confidence": "strong",
    "Prediction Model": " SBI v1.0 ",
  };
  const normalized = normalizeProductionPredictionSettingsAuthoring(settings);
  assert.equal(normalized.canonicalSettings["Player Category Weight"], 42);
  assert.equal(normalized.canonicalSettings["Minimum Scorecard Recorded Rounds"], 2);
  assert.equal(normalized.canonicalSettings["Minimum Scorecard Confidence"], "Strong");
  assert.equal(normalized.canonicalSettings["Prediction Model"], "SBI v1.0");

  for (const value of [true, "TRUE", "YES", "ON", "1"]) {
    assert.equal(normalizeProductionPredictionSettingsAuthoring({
      ...completeObject(),
      "Scorecard Influence Enabled": value,
    }).canonicalSettings["Scorecard Influence Enabled"], true, String(value));
  }
  for (const value of [false, "FALSE", "NO", "OFF", "0"]) {
    assert.equal(normalizeProductionPredictionSettingsAuthoring({
      ...completeObject(),
      "Scorecard Influence Enabled": value,
    }).canonicalSettings["Scorecard Influence Enabled"], false, String(value));
  }
});

test("strict Production authoring enforces lower, upper, integer, enum, and relationship bounds", () => {
  assertInvalidSettings({
    ...completeObject(),
    "Scorecard Category Weight": -0.01,
  }, "VALUE_BELOW_MINIMUM");
  assertInvalidSettings({
    ...completeObject(),
    "Maximum Win Probability": 100.01,
  }, "VALUE_ABOVE_MAXIMUM");
  assertInvalidSettings({
    ...completeObject(),
    "Minimum Scorecard Confidence": "Excellent",
  }, "INVALID_ENUM_VALUE");
  assertInvalidSettings({
    ...completeObject(),
    "Minimum Win Probability": 80,
    "Maximum Win Probability": 20,
  }, "PROBABILITY_BOUNDS_REVERSED");

  const exactBounds = normalizeProductionPredictionSettingsAuthoring({
    ...completeObject(),
    "Scorecard Category Weight": 0,
    "Minimum Win Probability": 0,
    "Maximum Win Probability": 100,
    "Minimum Scorecard Recorded Rounds": -1,
  });
  assert.equal(exactBounds.canonicalSettings["Minimum Scorecard Recorded Rounds"], 0,
    "the authoritative legacy integer parser clamps negative values to its minimum");
});

test("strict Production authoring preserves canonical precedence and rejects duplicate conflicts", () => {
  const precedence = completeRows();
  precedence.push({
    Setting: PREDICTION_SETTING_ALIASES["Format Win Percentage"],
    Value: 99,
  });
  const normalized = normalizeProductionPredictionSettingsAuthoring(precedence);
  assert.equal(normalized.canonicalSettings["Format Win Percentage"],
    completeObject()["Format Win Percentage"]);
  assert.equal(normalized.diagnostics.shadowedAliases.length, 1);
  assert.equal(normalized.diagnostics.shadowedAliases[0].resolution,
    "CANONICAL_PRECEDENCE");

  const duplicateCanonical = completeRows();
  duplicateCanonical.push({ Setting: "Player Category Weight", Value: 99 });
  assertInvalidSettings(duplicateCanonical, "DUPLICATE_SETTING_CONFLICT");

  const duplicateAlias = completeRows()
    .filter((row) => row.Setting !== "Format Win Percentage");
  duplicateAlias.push(
    { Setting: PREDICTION_SETTING_ALIASES["Format Win Percentage"], Value: 28 },
    { Setting: PREDICTION_SETTING_ALIASES["Format Win Percentage"], Value: 29 },
  );
  assertInvalidSettings(duplicateAlias, "DUPLICATE_SETTING_CONFLICT");
});

test("persisted validation binds an idempotency identity and deterministic canonical payload hash", () => {
  const moduleUrl = new URL(
    "../lib/production-prediction-settings-server.js",
    import.meta.url,
  ).href;
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--input-type=module",
    "--eval",
    `
      import { validateProductionPredictionSettings } from ${JSON.stringify(moduleUrl)};
      const calls = [];
      const options = {
        env: {},
        getActivation: () => ({ phase: "OBSERVATION", resources: {} }),
        rpc: async (name, input) => {
          calls.push({ name, input });
          return { payload: { ok: true } };
        },
      };
      const common = {
        actorAuthUserId: "10000000-0000-4000-8000-000000000001",
        actorPlayerId: "CB01",
        actorTournamentId: "2026",
        targetTournamentId: "2026",
        draftId: "20000000-0000-4000-8000-000000000002",
        expectedRevision: 2,
      };
      await validateProductionPredictionSettings({
        ...common,
        operationRequestId: "30000000-0000-4000-8000-000000000003",
      }, options);
      await validateProductionPredictionSettings({
        ...common,
        operationRequestId: "40000000-0000-4000-8000-000000000004",
      }, options);
      await validateProductionPredictionSettings({
        ...common,
        draftId: "50000000-0000-4000-8000-000000000005",
        operationRequestId: "60000000-0000-4000-8000-000000000006",
      }, options);
      console.log(JSON.stringify(calls));
    `,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const calls = JSON.parse(result.stdout.trim());
  assert.equal(calls.length, 3);
  assert.equal(calls[0].name,
    "validate_production_prediction_settings_revision_v1");
  assert.equal(calls[0].input.operation_request_id,
    "30000000-0000-4000-8000-000000000003");
  assert.match(calls[0].input.request_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(calls[0].input.request_payload_hash,
    calls[1].input.request_payload_hash,
    "retry identities are excluded from the logical mutation payload");
  assert.notEqual(calls[0].input.request_payload_hash,
    calls[2].input.request_payload_hash,
    "a different draft produces a different canonical mutation hash");
});

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must remain a named function`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} source is incomplete`);
}

async function verifiedSettingsView() {
  const source = await readFile(new URL(
    "../lib/prediction-input-bundle-service.js",
    import.meta.url,
  ), "utf8");
  const implementation = extractFunction(source, "verifiedSettingsView");
  return Function(
    "predictionSettingsViewFromOddsConfiguration",
    "normalizePredictionSettings",
    "PREDICTION_SETTINGS_CONTRACT_VERSION",
    "scoringShadowPayloadHash",
    "clean",
    `"use strict"; ${implementation}; return verifiedSettingsView;`,
  )(
    predictionSettingsViewFromOddsConfiguration,
    normalizePredictionSettings,
    PREDICTION_SETTINGS_CONTRACT_VERSION,
    scoringShadowPayloadHash,
    (value) => String(value ?? "").trim(),
  );
}

function trustedConfiguration(overrides = {}) {
  const sourceSettings = PRODUCTION_PREDICTION_SETTING_SPECS.map((setting) => ({
    Setting: setting.canonicalKey,
    Value: setting.defaultValue,
  }));
  const normalized = normalizePredictionSettings(sourceSettings);
  return {
    tournament_id: "2026",
    configuration_revision: 2,
    is_current: true,
    validation_status: "VALID",
    settings_contract_version: PREDICTION_SETTINGS_CONTRACT_VERSION,
    settings: sourceSettings,
    canonical_settings: normalized.canonicalSettings,
    effective_settings: normalized.effectiveSettings,
    settings_fingerprint: scoringShadowPayloadHash(sourceSettings),
    effective_settings_fingerprint: scoringShadowPayloadHash(
      normalized.effectiveSettings,
    ),
    ...overrides,
  };
}

function assertCurrentTrustRejected(verify, configuration, label) {
  assert.throws(
    () => verify(configuration, { trustCurrentSupabaseConfiguration: true }),
    (error) => error?.code ===
      "PREDICTION_INPUT_SETTINGS_CURRENT_CONFIGURATION_REQUIRED",
    label,
  );
}

test("Production trust mode accepts only a current, valid, exact-contract configuration", async () => {
  const verify = await verifiedSettingsView();
  const accepted = verify(trustedConfiguration(), {
    trustCurrentSupabaseConfiguration: true,
  });
  assert.equal(accepted.freshness, "CURRENT");

  assertCurrentTrustRejected(verify, trustedConfiguration({ is_current: false }),
    "noncurrent revisions cannot become CURRENT");
  assertCurrentTrustRejected(verify, trustedConfiguration({ validation_status: "INVALID" }),
    "invalid revisions cannot become CURRENT");
  assertCurrentTrustRejected(verify, trustedConfiguration({
    settings_contract_version: "prediction-settings-v0",
  }), "wrong contracts cannot become CURRENT");
});

test("Production trust mode rejects settings and fingerprint integrity mismatches", async () => {
  const verify = await verifiedSettingsView();
  assertCurrentTrustRejected(verify, trustedConfiguration({
    effective_settings: {
      ...PREDICTION_SETTINGS_DEFAULTS,
      "Player Category Weight": 99,
    },
  }), "effective values must agree with their canonical source rows");
  assertCurrentTrustRejected(verify, trustedConfiguration({
    effective_settings_fingerprint: "f".repeat(64),
  }), "the stored effective fingerprint must certify the stored effective values");
});

function compilePredictionSettingsRoute(source, dependencies, env) {
  const withoutImports = source.replace(/^import\s[\s\S]*?;\s*$/gm, "");
  const executable = withoutImports
    .replace(/export const dynamic\s*=/, "const dynamic =")
    .replace(/export async function GET/, "async function GET")
    .replace(/export async function POST/, "async function POST");
  const names = Object.keys(dependencies);
  return Function(
    ...names,
    "process",
    "console",
    `"use strict"; ${executable}; return { GET, POST };`,
  )(
    ...Object.values(dependencies),
    { env },
    { error() {} },
  );
}

const jsonResponse = Object.freeze({
  json(payload, options = {}) {
    return {
      payload,
      status: options.status || 200,
      headers: options.headers || {},
    };
  },
});

const identity = Object.freeze({
  authUserId: "10000000-0000-4000-8000-000000000001",
  actor: Object.freeze({ id: "CB01" }),
  tournamentId: "2026",
});

function request({ query = "", body = {}, originValid = true } = {}) {
  return {
    originValid,
    nextUrl: { searchParams: new URLSearchParams(query) },
    async json() { return body; },
  };
}

async function routeHarness(overrides = {}, env = { VERCEL_ENV: "production" }) {
  const source = await readFile(new URL(
    "../app/api/director/prediction-settings/route.js",
    import.meta.url,
  ), "utf8");
  const calls = [];
  const dependencies = {
    NextResponse: jsonResponse,
    authorizePreviewDirector: async () => ({
      status: "active",
      source: "production-director-entitlement",
      identity,
    }),
    assertProductionCutoverActivation: () => ({ phase: "OBSERVATION" }),
    assertProductionCutoverRequest: (incoming) => {
      if (!incoming.originValid) throw new Error("origin rejected");
    },
    readProductionPredictionSettingsAuthoring: async (values) => {
      calls.push({ action: "read", values });
      return { tournamentId: values.targetTournamentId || "2026" };
    },
    stageProductionPredictionSettings: async (values) => {
      calls.push({ action: "stage", values });
      return { draftId: "20000000-0000-4000-8000-000000000002" };
    },
    validateProductionPredictionSettings: async (values) => {
      calls.push({ action: "validate", values });
      return { state: "VALIDATED" };
    },
    commitProductionPredictionSettings: async (values) => {
      calls.push({ action: "commit", values });
      return { configurationRevision: 3 };
    },
    copyProductionPredictionSettingsDraft: async (values) => {
      calls.push({ action: "copy-previous", values });
      return { state: "STAGED" };
    },
    dataAuthorityResponseHeaders: () => ({}),
    withDataAuthorityRequestScope: async (_scope, run) => ({
      result: await run(),
      diagnostics: {},
    }),
    ...overrides,
  };
  return {
    calls,
    route: compilePredictionSettingsRoute(source, dependencies, env),
  };
}

test("Prediction Settings route behavior isolates Preview and denies anonymous or participant access", async () => {
  let authorizationCalls = 0;
  const preview = await routeHarness({
    authorizePreviewDirector: async () => {
      authorizationCalls += 1;
      return { status: "active", source: "production-director-entitlement", identity };
    },
  }, { VERCEL_ENV: "preview" });
  const previewResponse = await preview.route.GET(request());
  assert.equal(previewResponse.status, 404);
  assert.equal(authorizationCalls, 0);
  assert.equal(preview.calls.length, 0);

  for (const authorization of [
    { status: "missing", source: "" },
    { status: "active", source: "participant-session", identity },
  ]) {
    const denied = await routeHarness({
      authorizePreviewDirector: async () => authorization,
    });
    const response = await denied.route.GET(request());
    assert.equal(response.status, 403, authorization.source || authorization.status);
    assert.equal(response.payload.code, "DIRECTOR_AUTHORIZATION_REQUIRED");
    assert.equal(denied.calls.length, 0);
  }
});

test("Prediction Settings route behavior requires origin and derives actor scope only from the Director identity", async () => {
  const origin = await routeHarness();
  const originResponse = await origin.route.POST(request({
    originValid: false,
    body: { action: "stage" },
  }));
  assert.equal(originResponse.status, 404);
  assert.equal(origin.calls.length, 0);

  const allowed = await routeHarness();
  const response = await allowed.route.POST(request({ body: {
    action: "stage",
    targetTournamentId: "2027",
    actorAuthUserId: "90000000-0000-4000-8000-000000000009",
    actorPlayerId: "SPOOF",
    actorTournamentId: "2099",
    expectedRevision: 0,
    operationRequestId: "30000000-0000-4000-8000-000000000003",
    settings: completeObject(),
  } }));
  assert.equal(response.status, 200);
  assert.equal(allowed.calls.length, 1);
  assert.equal(allowed.calls[0].values.actorAuthUserId, identity.authUserId);
  assert.equal(allowed.calls[0].values.actorPlayerId, "CB01");
  assert.equal(allowed.calls[0].values.actorTournamentId, "2026");
  assert.equal(allowed.calls[0].values.targetTournamentId, "2027");
});

test("Prediction Settings route preserves bounded future-scope rejection without leaking configuration", async () => {
  const rejected = await routeHarness({
    stageProductionPredictionSettings: async () => {
      const error = new Error("Select a certified Production tournament.");
      error.code = "PREDICTION_SETTINGS_FUTURE_TOURNAMENT_REQUIRED";
      error.status = 403;
      throw error;
    },
  });
  const response = await rejected.route.POST(request({ body: {
    action: "stage",
    targetTournamentId: "2099",
    expectedRevision: 0,
    operationRequestId: "30000000-0000-4000-8000-000000000003",
    settings: completeObject(),
  } }));
  assert.equal(response.status, 403);
  assert.equal(response.payload.code,
    "PREDICTION_SETTINGS_FUTURE_TOURNAMENT_REQUIRED");
  assert.equal(JSON.stringify(response.payload).includes("canonicalSettings"), false);
  assert.equal(JSON.stringify(response.payload).includes("effectiveSettings"), false);
});

test("Prediction Settings route preserves authoritative per-setting validation issues", async () => {
  const validation = await routeHarness({
    stageProductionPredictionSettings: async () => {
      const error = new Error("Prediction Settings validation failed.");
      error.code = "PREDICTION_SETTINGS_INVALID";
      error.status = 422;
      error.diagnostics = {
        errors: [{
          code: "VALUE_ABOVE_MAXIMUM",
          key: "Maximum Win Probability",
          maximum: 100,
        }],
      };
      throw error;
    },
  });
  const response = await validation.route.POST(request({ body: {
    action: "stage",
    targetTournamentId: "2026",
    expectedRevision: 2,
    operationRequestId: "30000000-0000-4000-8000-000000000003",
    settings: completeObject(),
  } }));
  assert.equal(response.status, 422);
  assert.deepEqual(response.payload.issues, [{
    code: "VALUE_ABOVE_MAXIMUM",
    key: "Maximum Win Probability",
    maximum: 100,
  }]);
});

function runServerScript(body) {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--input-type=module",
    "--eval",
    `
      import {
        inspectProductionDirectorProjectionSynchronization,
        synchronizeProductionDirectorProjection,
      } from ${JSON.stringify(serverModule)};
      const activeEnv = {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
        VERCEL_PROJECT_NAME: "bagger-inv",
        VERCEL_GIT_COMMIT_SHA: "${"b".repeat(40)}",
        PRODUCTION_FOUNDATION_ENABLED: "true",
        PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
        PRODUCTION_CUTOVER_PHASE: "ODDS_WAR_ROOM",
        PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: "${"b".repeat(40)}",
        PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:
          "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
        PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
        PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
        PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
        PRODUCTION_SUPABASE_PROJECT_REF: "ymqhhtxaywtqllynrmxe",
        PRODUCTION_SUPABASE_URL: "https://ymqhhtxaywtqllynrmxe.supabase.co",
        PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_${"x".repeat(32)}",
        GOOGLE_SHEETS_ID:
          "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
        PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
        PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
        PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
        SCORING_AUTHORITY: "supabase",
      };
      const actorAuthUserId = "11111111-1111-4111-8111-111111111111";
      const actorPlayerId = "CB01";
      ${body}
    `,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test("retired Google Prediction Settings, Draft, and Guide cannot alter Supabase state", () => {
  const result = runServerScript(`
    const configuration = { revision: 2, value: 35 };
    let retiredDependencies = 0;
    let retiredCode = "";
    try {
      await synchronizeProductionDirectorProjection({
        domain: "PREDICTION_SETTINGS", actorAuthUserId, actorPlayerId,
        env: activeEnv,
        dependencies: {
          productionRpc: async () => {
            retiredDependencies += 1;
            configuration.revision += 1;
          },
          withProductionGoogleCredentials: async () => {
            retiredDependencies += 1;
          },
          readWorkbookSheetsByName: async () => {
            retiredDependencies += 1;
          },
        },
      });
    } catch (error) { retiredCode = error.code; }
    const retained = {};
    for (const domain of ["GUIDE", "DRAFT"]) {
      let rpcCalls = 0;
      let code = "";
      try {
        await inspectProductionDirectorProjectionSynchronization({
          domain, actorAuthUserId, actorPlayerId, env: activeEnv,
          dependencies: {
            productionRpc: async () => {
              rpcCalls += 1;
              return { ok: false };
            },
          },
        });
      } catch (error) { code = error.code; }
      retained[domain] = { rpcCalls, code };
    }
    console.log(JSON.stringify({ configuration, retiredDependencies,
      retiredCode, retained }));
  `);
  assert.deepEqual(result.configuration, { revision: 2, value: 35 });
  assert.equal(result.retiredDependencies, 0);
  assert.equal(result.retiredCode,
    "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED");
  assert.equal(result.retained.GUIDE.rpcCalls, 0);
  assert.equal(result.retained.GUIDE.code,
    "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED");
  assert.equal(result.retained.DRAFT.rpcCalls, 0);
  assert.equal(result.retained.DRAFT.code,
    "PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED");
});

test("participant, website, mobile, annual, and Tournament Setup surfaces do not acquire Director configuration internals", async () => {
  const publicFiles = [
    "app/api/participant/home/route.js",
    "app/api/participant/context/route.js",
    "app/api/tournament/live/route.js",
    "app/api/mobile/v1/today/route.js",
    "app/api/mobile/v1/matches/route.js",
    "app/api/mobile/v1/schedule/route.js",
    "app/api/mobile/v1/leaders/route.js",
  ];
  for (const file of publicFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source,
      /production-prediction-settings-(?:server|contract)|canonicalSettings|effectiveSettings/,
      file);
  }

  const [website, tournamentSetup, annual, engine] = await Promise.all([
    readFile(new URL("../app/odds-center/page.js", import.meta.url), "utf8"),
    readFile(new URL(
      "../app/api/director/tournament-setup/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../app/api/director/future-tournaments/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../lib/tournament-odds.js", import.meta.url), "utf8"),
  ]);
  assert.match(website, /readPublishedOddsView/);
  assert.match(website, /publishedOddsSnapshotsFromView/);
  assert.doesNotMatch(website,
    /production-prediction-settings|canonicalSettings|effectiveSettings/);
  assert.doesNotMatch(tournamentSetup, /production-prediction-settings/);
  assert.doesNotMatch(annual, /canonicalSettings|effectiveSettings/);
  assert.doesNotMatch(engine, /production-prediction-settings/);
});

test("retained Round Scorecards archive credential operation remains available under its explicit gate", () => {
  const moduleUrl = new URL(
    "../lib/google-service-account-credential-context.js",
    import.meta.url,
  ).href;
  const foundationUrl = new URL(
    "../lib/production-foundation-resource-contract.js",
    import.meta.url,
  ).href;
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--input-type=module",
    "--eval",
    `
      import {
        productionGoogleCredentialEnvironment,
        PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
        PRODUCTION_VERCEL_PROJECT_ID,
      } from ${JSON.stringify(moduleUrl)};
      import {
        PRODUCTION_GOOGLE_WORKBOOK_ID,
        PRODUCTION_SUPABASE_PROJECT_REF,
        PRODUCTION_SUPABASE_URL,
        PRODUCTION_TOURNAMENT_ID,
        PRODUCTION_TOURNAMENT_YEAR,
      } from ${JSON.stringify(foundationUrl)};
      const resources = {
        supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
        googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
        tournamentId: PRODUCTION_TOURNAMENT_ID,
        tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
        vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
        vercelProjectName: "bagger-inv",
        canonicalHostname: "baggerinv.com",
      };
      const env = {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        VERCEL_PROJECT_NAME: "bagger-inv",
        PRODUCTION_FOUNDATION_ENABLED: "true",
        PRODUCTION_SUPABASE_PROJECT_REF,
        PRODUCTION_SUPABASE_URL,
        SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
        GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
        GOOGLE_SHEETS_SPREADSHEET_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy@example.invalid",
        GOOGLE_PRIVATE_KEY: "legacy-private-key",
        PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL:
          PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
        PRODUCTION_GOOGLE_PRIVATE_KEY: "production-private-key",
        SCORING_AUTHORITY: "supabase",
        PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
        ODDS_PUBLICATION_AUTHORITY: "supabase",
        PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true",
        ROUND_SCORECARDS_ARCHIVE_ENABLED: "true",
      };
      console.log(JSON.stringify(productionGoogleCredentialEnvironment({
        env, operation: "ROUND_SCORECARDS_ARCHIVE", resources,
      })));
    `,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const state = JSON.parse(result.stdout.trim());
  assert.equal(state.allowed, true);
  assert.equal(state.operation, "ROUND_SCORECARDS_ARCHIVE");
  assert.equal(state.policy.mirrorArchive, true);
});
