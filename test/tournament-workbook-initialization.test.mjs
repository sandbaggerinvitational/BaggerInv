import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  initializeTournamentWorkbook,
  workbookInitializationMessage,
} from "../lib/tournament-workbook-initialization.js";

const requiredValues = { Tournaments: [["Year"], [2026]], Players: [["Player ID"], ["P1"]] };

test("workbook initialization succeeds when both Net Skins sheets are absent", async () => {
  const result = await initializeTournamentWorkbook({
    requiredNames: ["Tournaments", "Players"],
    optionalNames: ["Net Skins", "Net Skins Result"],
    readRequired: async () => requiredValues,
    readSheet: async () => { throw new Error("Unable to parse range"); },
  });
  assert.deepEqual(result.sheets["Net Skins"], []);
  assert.deepEqual(result.sheets["Net Skins Result"], []);
  assert.equal(result.checks.required.Tournaments, "ready");
  assert.equal(result.checks.optional["Net Skins"], "missing");
});

test("workbook initialization succeeds with header-only Net Skins sheets", async () => {
  const optional = {
    "Net Skins": [["Year", "Round", "Eligible"]],
    "Net Skins Result": [["Year", "Round", "Hole"]],
  };
  const result = await initializeTournamentWorkbook({
    requiredNames: ["Tournaments", "Players"],
    optionalNames: Object.keys(optional),
    readRequired: async () => requiredValues,
    readSheet: async (name) => optional[name],
  });
  assert.equal(result.checks.optional["Net Skins"], "empty");
  assert.equal(result.checks.optional["Net Skins Result"], "empty");
});

test("workbook initialization exposes populated Net Skins sheets as ready", async () => {
  const optional = {
    "Net Skins": [["Year", "Round", "Eligible"], [2026, 1, true]],
    "Net Skins Result": [["Year", "Round", "Hole"], [2026, 1, 2]],
  };
  const result = await initializeTournamentWorkbook({
    requiredNames: ["Tournaments", "Players"],
    optionalNames: Object.keys(optional),
    readRequired: async () => requiredValues,
    readSheet: async (name) => optional[name],
  });
  assert.equal(result.checks.optional["Net Skins"], "ready");
  assert.equal(result.checks.optional["Net Skins Result"], "ready");
});

test("a required-sheet failure reports the exact workbook check", async () => {
  await assert.rejects(
    initializeTournamentWorkbook({
      requiredNames: ["Tournaments", "Players"],
      optionalNames: ["Net Skins"],
      readRequired: async () => { throw new Error("batch failed"); },
      readSheet: async (name) => {
        if (name === "Players") throw new Error("missing");
        return requiredValues[name];
      },
    }),
    (error) => {
      assert.equal(error.workbookCheck, 'required sheet "Players"');
      assert.equal(workbookInitializationMessage(error, "fallback"), 'Tournament workbook check failed: required sheet "Players".');
      return true;
    }
  );
});

test("the normalized loader keeps Net Skins outside its required batch", async () => {
  const source = await readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8");
  const requiredBlock = source.slice(source.indexOf("const requiredNames"), source.indexOf("const optionalNames"));
  assert.doesNotMatch(requiredBlock, /Net Skins/);
  assert.match(source, /const optionalNames = \["Net Skins", "Net Skins Result"\]/);
  assert.match(source, /workbookChecks/);
});

test("participant failure surfaces use safe workbook-check diagnostics", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/api/live/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/home/page.js", import.meta.url), "utf8"),
  ]);
  files.forEach((source) => assert.match(source, /workbookInitializationMessage/));
});
