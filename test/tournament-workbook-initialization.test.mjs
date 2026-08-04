import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  initializeTournamentWorkbook,
  workbookInitializationMessage,
} from "../lib/tournament-workbook-initialization.js";
import { GoogleReadError } from "../lib/google-api-reliability.js";

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

test("Tournament Timeline remains optional when missing, header-only, or populated", async () => {
  const cases = [
    { values: [], expected: "missing" },
    { values: [["Year", "Event Date", "Start Time", "Title"]], expected: "empty" },
    { values: [["Year", "Event Date", "Start Time", "Title"], [2026, "2026-09-25", "7:30 AM", "Round 1 Opens"]], expected: "ready" },
  ];
  for (const { values, expected } of cases) {
    const result = await initializeTournamentWorkbook({
      requiredNames: ["Tournaments", "Players"],
      optionalNames: ["Tournament Timeline"],
      readRequired: async () => requiredValues,
      readSheet: async () => values,
    });
    assert.equal(result.checks.optional["Tournament Timeline"], expected);
    assert.equal(result.checks.required.Tournaments, "ready");
  }
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

test("cold-start transient snapshot failures retry before required-sheet validation", async () => {
  let attempts = 0;
  let diagnosticReads = 0;
  const result = await initializeTournamentWorkbook({
    requiredNames: ["Tournaments", "Players", "Live Matches"],
    readRequired: async () => {
      attempts += 1;
      if (attempts < 3) throw new GoogleReadError("startup timeout", { category: "timeout" });
      return { ...requiredValues, "Live Matches": [["Match ID"], ["M1"]] };
    },
    readSheet: async () => { diagnosticReads += 1; return []; },
  });
  assert.equal(attempts, 3);
  assert.equal(diagnosticReads, 0);
  assert.equal(result.checks.required["Live Matches"], "ready");
});

test("persistent transient startup failure is not mislabeled as a missing sheet", async () => {
  let attempts = 0;
  let diagnosticReads = 0;
  await assert.rejects(
    initializeTournamentWorkbook({
      requiredNames: ["Live Matches"],
      readRequired: async () => {
        attempts += 1;
        throw new GoogleReadError("startup timeout", { status: 503, category: "upstream" });
      },
      readSheet: async () => { diagnosticReads += 1; return []; },
    }),
    (error) => {
      assert.equal(error.workbookCheck, "required normalized-sheet snapshot");
      assert.equal(error.category, "upstream");
      return true;
    }
  );
  assert.equal(attempts, 3);
  assert.equal(diagnosticReads, 0);
});

test("the normalized loader keeps Net Skins outside its required batch", async () => {
  const source = await readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8");
  const requiredBlock = source.slice(source.indexOf("const requiredNames"), source.indexOf("const optionalNames"));
  assert.doesNotMatch(requiredBlock, /Net Skins/);
  assert.match(source, /const optionalNames = \[[^\]]*"Net Skins"[^\]]*"Tournament Timeline"[^\]]*"Guide Sections"[^\]]*"Rule Book"[^\]]*"Rounds"[^\]]*\]/);
  assert.doesNotMatch(requiredBlock, /Tournament Timeline/);
  assert.match(source, /workbookChecks/);
});

test("server diagnostics stay internal while participant recovery uses friendly copy", async () => {
  const diagnosticFiles = await Promise.all([
    readFile(new URL("../app/api/live/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/page.js", import.meta.url), "utf8"),
  ]);
  diagnosticFiles.forEach((source) => assert.match(source, /workbookInitializationMessage/));
  const home = await readFile(new URL("../app/home/page.js", import.meta.url), "utf8");
  assert.match(home, /TournamentInitializationRecovery/);
  assert.doesNotMatch(home, /workbookInitializationMessage/);
});

test("recorded hole scores pass stroke index into every Net Skins scorecard row", async () => {
  const source = await readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8");
  assert.match(source, /const add = \(\{[^}]*strokeIndex[^}]*\}\) =>/);
  assert.equal((source.match(/holeNumber: row\["Hole Number"\],\s*strokeIndex,/g) || []).length, 2);
});
