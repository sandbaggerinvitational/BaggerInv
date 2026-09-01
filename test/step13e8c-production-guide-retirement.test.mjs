import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertDirectorMutationAuthority,
  directorMutationAuthorityDiagnostics,
} from "../lib/director-mutation-authority.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Production Google Guide synchronization is retired before any activation, Supabase, or Google request", async () => {
  const script = `
    import { inspectProductionDirectorProjectionSynchronization } from "./lib/production-director-projection-synchronization.js";
    let transportCalls = 0;
    let result = null;
    try {
      await inspectProductionDirectorProjectionSynchronization({
        domain: "GUIDE",
        actorAuthUserId: "10000000-0000-4000-8000-000000000001",
        actorPlayerId: "CB01",
        env: {},
        dependencies: {
          productionRpc: async () => { transportCalls += 1; },
          readWorkbookSheetsByName: async () => { transportCalls += 1; },
        },
      });
    } catch (error) { result = { code: error.code, status: error.status }; }
    process.stdout.write(JSON.stringify({ result, transportCalls }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const value = JSON.parse(child.stdout);
  assert.deepEqual(value.result, { code: "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED", status: 410 });
  assert.equal(value.transportCalls, 0);
});

test("Production Admin CMS schedule authority is retired without changing isolated Preview behavior", () => {
  const production = {
    VERCEL_ENV: "production",
    SCORING_MUTATION_SOURCE: "SUPABASE",
    PRODUCTION_CUTOVER_PHASE: "OBSERVATION",
  };
  assert.throws(() => assertDirectorMutationAuthority({
    surface: "admin-cms",
    action: "schedule",
    env: production,
  }), (error) => error.code === "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED" && error.status === 410);
  const diagnosis = directorMutationAuthorityDiagnostics({
    surface: "admin-cms",
    action: "schedule",
    env: production,
  });
  assert.equal(diagnosis.productionGoogleAuthoringRetired, true);
  assert.equal(diagnosis.execution, "GOOGLE_DIRECTOR_AUTHORING");

  const preview = assertDirectorMutationAuthority({
    surface: "admin-cms",
    action: "schedule",
    env: { VERCEL_ENV: "preview", SCORING_MUTATION_SOURCE: "GOOGLE" },
  });
  assert.equal(preview.execution, "GOOGLE_DIRECTOR_AUTHORING");
});

test("the privileged Production Google authoring boundary rejects every retired Guide operation before callback dispatch", () => {
  const script = `
    import { withProductionGoogleAuthoringWrite } from "./lib/production-google-authoring.js";
    import { GOOGLE_AUTHORING_OPERATIONS } from "./lib/google-workbook-mutation-intent.js";
    let callbackCalls = 0;
    const failures = {};
    for (const operation of [
      GOOGLE_AUTHORING_OPERATIONS.ADMIN_CMS_GUIDE,
      GOOGLE_AUTHORING_OPERATIONS.TOURNAMENT_GUIDE,
    ]) {
      try {
        await withProductionGoogleAuthoringWrite({
          request: {},
          operation,
          env: {
            VERCEL_ENV: "production",
            GOOGLE_SHEETS_ID: "not-the-production-workbook",
          },
        }, async () => { callbackCalls += 1; });
      } catch (error) {
        failures[operation] = { code: error.code, status: error.status };
      }
    }
    process.stdout.write(JSON.stringify({ callbackCalls, failures }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const value = JSON.parse(child.stdout);
  assert.equal(value.callbackCalls, 0);
  for (const operation of ["ADMIN_CMS_GUIDE", "TOURNAMENT_GUIDE"]) {
    assert.deepEqual(value.failures[operation], {
      code: "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED",
      status: 410,
    });
  }
});

test("all legacy Production Guide HTTP authoring entries fail closed before Google runtime loading", async () => {
  const [legacy, cms, sync, center] = await Promise.all([
    read("../app/api/tournament-guide/route.js"),
    read("../app/api/admin/cms/route.js"),
    read("../app/api/admin/production-director-synchronization/route.js"),
    read("../app/admin/AdminCenter.js"),
  ]);

  assert.match(legacy, /retiredProductionGuide\(\)/);
  assert.match(legacy, /PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED/);
  assert.match(legacy, /await legacyPreviewGuideRuntime\(\)/);
  assert.ok(legacy.indexOf("const retired = retiredProductionGuide()") < legacy.indexOf("await legacyPreviewGuideRuntime()"));
  assert.doesNotMatch(legacy, /^import .*google-sheets-write/m,
    "the retired Production route does not eagerly load the Google Guide transport");
  assert.match(legacy, /return import\("\.\.\/\.\.\/\.\.\/lib\/google-sheets-write"\)/,
    "the isolated Preview route loads the legacy transport only after its Production retirement guard");

  assert.match(cms, /retiredProductionGuide\(resource\)/);
  assert.match(cms, /resource !== "schedule"/);
  assert.match(sync, /domain\)\.toUpperCase\(\) === "GUIDE"/);
  assert.match(sync, /status: 410/);

  assert.match(center, /active === "guide" \? previewMode/);
  assert.match(center, /active === "schedule" \? previewMode/);
  assert.match(center, /Legacy \/ non-authoritative/);
  assert.match(center, /later edits do not change the Production Guide/);
  assert.match(center, /former Google Guide editor is retained only in isolated Preview/);
});

test("retirement removes Production Guide credentials/inventory and retains scoring/archive Google infrastructure", async () => {
  const [credentials, intents, inventory, sync] = await Promise.all([
    read("../lib/google-service-account-credential-context.js"),
    read("../lib/google-workbook-mutation-intent.js"),
    read("../lib/production-google-writer-inventory.js"),
    read("../lib/production-director-projection-synchronization.js"),
  ]);
  for (const retained of ["SCORING_GOOGLE_OUTBOX", "FUTURE_MATCH_GOOGLE_COMPATIBILITY", "ROUND_SCORECARDS_ARCHIVE"]) {
    assert.match(credentials, new RegExp(`\\b${retained}\\b`));
    assert.match(intents, new RegExp(`\\b${retained}\\b`));
  }
  assert.doesNotMatch(credentials, /^\s*GUIDE_SYNCHRONIZATION:\s*Object\.freeze/m);
  assert.doesNotMatch(inventory, /^\s*GUIDE:\s*GOOGLE_AUTHORING_OPERATIONS/m);
  assert.doesNotMatch(inventory, /^\s*TOURNAMENT_GUIDE:\s*GOOGLE_AUTHORING_OPERATIONS/m);
  assert.doesNotMatch(inventory, /domain: "GUIDE(?:_PRESENTATION)?"/);
  assert.match(inventory, /PREVIEW_ONLY_GOOGLE_WRITER_ENTRYPOINTS[\s\S]*app\/api\/tournament-guide\/route\.js/);
  assert.match(inventory, /PREVIEW_ONLY_GOOGLE_WRITERS[\s\S]*saveTournamentGuideRecord/);
  assert.match(intents, /\[GOOGLE_AUTHORING_OPERATIONS\.ADMIN_CMS_GUIDE\]:\s*sheetSet\(/,
    "isolated Preview retains its bounded Guide workbook intent");
  assert.match(sync, /PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED/);
  assert.match(sync, /PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED/);
  assert.match(sync, /PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED/);
});
