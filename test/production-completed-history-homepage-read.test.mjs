import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const root = new URL("../", import.meta.url);
const completedHistoryModule = new URL(
  "../lib/completed-history-supabase.js",
  import.meta.url,
).href;
const completedHistoryServiceModule = new URL(
  "../lib/completed-history-service.js",
  import.meta.url,
).href;
const previewProjectRef = "idgigvjjqkfbqjeredpb";
const previewUrl = `https://${previewProjectRef}.supabase.co`;
const commitSha = "a".repeat(40);
const productionSecret = `sb_secret_${"x".repeat(32)}`;

const productionEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commitSha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
  PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT:
    "production-maintenance-single-deployment-capability-v1",
  PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING: "OBSERVATION",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: productionSecret,
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: productionSecret,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SCORING_AUTHORITY: "supabase",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
});

const previewEnv = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SUPABASE_SCORING_MIRROR_URL: previewUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "preview-server-secret",
});

function runServerScript(script) {
  const child = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test("Production completed History uses the active cutover RPC with exact Production resources and preserves the historical year", () => {
  const observed = runServerScript(`
    const { readProductionCutoverCompletedHistory } = await import(${JSON.stringify(completedHistoryModule)});
    const env = ${JSON.stringify(productionEnv)};
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        url: String(url),
        body: JSON.parse(init.body),
        apikey: init.headers.apikey,
      });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          revision: { revision_id: "2025-production-revision" },
          tournament: { tournament_year: 2025 },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const read = await readProductionCutoverCompletedHistory({
      env,
      mode: "YEAR",
      year: 2025,
    });
    process.stdout.write(JSON.stringify({ calls, payload: read.payload }));
  `);

  assert.equal(observed.calls.length, 1);
  const [call] = observed.calls;
  assert.equal(
    call.url,
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_cutover_completed_history`,
  );
  assert.equal(call.apikey, productionSecret);
  assert.equal(call.body.input.environment, "PRODUCTION");
  assert.equal(call.body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(call.body.input.project_url, PRODUCTION_SUPABASE_URL);
  assert.equal(call.body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(call.body.input.tournament_id, "2026");
  assert.equal(call.body.input.tournament_year, 2025);
  assert.equal(call.body.input.mode, "YEAR");
  assert.equal(call.body.input.read_contract, "ACTIVE_CUTOVER");
  assert.equal(JSON.stringify(call).includes(previewProjectRef), false);
  assert.equal(observed.payload.ok, true);
  assert.equal(observed.payload.authoritative, true);
  assert.equal(observed.payload.shadow_only, false);
  assert.equal(observed.payload.google_foreground_requests, 0);
  assert.equal(observed.payload.data.tournament.tournament_year, 2025);
});

test("Preview completed History retains the Preview RPC and Preview resource contract", () => {
  const observed = runServerScript(`
    const { readCompletedHistory } = await import(${JSON.stringify(completedHistoryModule)});
    const env = ${JSON.stringify(previewEnv)};
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          revision: { revision_id: "2024-preview-revision" },
          tournament: { tournament_year: 2024 },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const read = await readCompletedHistory({ env, mode: "YEAR", year: 2024 });
    process.stdout.write(JSON.stringify({ calls, payload: read.payload }));
  `);

  assert.equal(observed.calls.length, 1);
  const [call] = observed.calls;
  assert.equal(
    call.url,
    `${previewUrl}/rest/v1/rpc/read_preview_completed_history`,
  );
  assert.deepEqual(call.body.input, {
    environment: "PREVIEW",
    project_ref: previewProjectRef,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    mode: "YEAR",
    tournament_year: 2024,
  });
  assert.equal(observed.payload.ok, true);
  assert.equal(observed.payload.authoritative, undefined);
  assert.equal(observed.payload.data.tournament.tournament_year, 2024);
});

test("Production completed History rejects Preview transport contamination before any request", () => {
  const observed = runServerScript(`
    const { readProductionCutoverCompletedHistory } = await import(${JSON.stringify(completedHistoryModule)});
    const env = {
      ...${JSON.stringify(productionEnv)},
      SUPABASE_SCORING_MIRROR_URL: ${JSON.stringify(previewUrl)},
      SUPABASE_SCORING_MIRROR_SECRET_KEY: "preview-server-secret",
    };
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("Preview transport must not be reached");
    };
    let failure = null;
    try {
      await readProductionCutoverCompletedHistory({ env, mode: "YEAR", year: 2025 });
    } catch (error) {
      failure = {
        code: error.code,
        reason: error.diagnostics?.reason,
      };
    }
    process.stdout.write(JSON.stringify({ fetchCalls, failure }));
  `);

  assert.equal(observed.fetchCalls, 0);
  assert.deepEqual(observed.failure, {
    code: "PRODUCTION_CUTOVER_READ_RPC_UNAVAILABLE",
    reason: "exact-production-read-url-required",
  });
});

test("Homepage completed-history composition uses only the Production reader and exposes every certified year to the render branch", async () => {
  const observed = runServerScript(`
    const { loadCompletedHistoryYears } = await import(${JSON.stringify(completedHistoryServiceModule)});
    const env = ${JSON.stringify(productionEnv)};
    const expectedYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
    const calls = [];
    let previewReaderCalls = 0;
    const productionReader = async ({ mode, year }) => {
      calls.push({ mode, year: year || null });
      if (mode === "YEARS") {
        return {
          payload: {
            ok: true,
            data: expectedYears.map((tournament_year) => ({ tournament_year })),
          },
          durationMs: 1,
        };
      }
      return {
        payload: {
          ok: true,
          data: {
            revision: { revision_id: String(year) + "-production-homepage" },
            tournament: { tournament_year: Number(year) },
          },
        },
        durationMs: 1,
      };
    };
    const completed = await loadCompletedHistoryYears({
      env,
      dependencies: {
        readProductionCutoverCompletedHistory: productionReader,
        readCompletedHistory: async () => {
          previewReaderCalls += 1;
          throw new Error("Production selected the Preview completed-history reader");
        },
        buildCompletedHistoryPresentation: (data) => {
          const year = Number(data.tournament.tournament_year);
          return {
            source: "supabase",
            year,
            tournament: {
              year,
              Destination: "Production destination " + year,
              logoFileName: "tournament-" + year + ".png",
            },
            diagnostics: { googleForegroundRequests: 0 },
          };
        },
      },
    });
    process.stdout.write(JSON.stringify({
      source: completed.source,
      calls,
      previewReaderCalls,
      years: completed.tournaments.map((row) => row.year),
      destinations: completed.tournaments.map((row) => row.Destination),
      googleForegroundRequests: completed.diagnostics.googleForegroundRequests,
    }));
  `);

  assert.equal(observed.source, "supabase");
  assert.equal(observed.previewReaderCalls, 0);
  assert.equal(observed.calls.length, 10);
  assert.deepEqual(observed.calls[0], { mode: "YEARS", year: null });
  assert.deepEqual(
    observed.calls.slice(1).map((call) => call.year).sort((a, b) => a - b),
    [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  );
  assert.deepEqual(
    observed.years,
    [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017],
  );
  assert.equal(observed.destinations[0], "Production destination 2025");
  assert.equal(observed.googleForegroundRequests, 0);

  const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");
  const supabaseBranchStart = page.indexOf(
    'if (homepageSource.resolved === "supabase")',
  );
  const googleBranchStart = page.indexOf("} else {", supabaseBranchStart);
  const renderStart = page.indexOf('<div className="yearGrid">');
  const renderEnd = page.indexOf("</div>", renderStart);
  assert.ok(supabaseBranchStart >= 0 && googleBranchStart > supabaseBranchStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  assert.match(
    page.slice(supabaseBranchStart, googleBranchStart),
    /tournaments = \[\.\.\.completed\.tournaments, currentTournament\]/,
  );
  assert.match(page.slice(renderStart, renderEnd), /tournaments\.map/);
  assert.match(page.slice(renderStart, renderEnd), /tournament\.year/);
  assert.match(page.slice(renderStart, renderEnd), /tournament\.Destination/);
});
