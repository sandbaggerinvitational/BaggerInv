import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COLUMN_PURPOSE,
  PROTECTED_COLUMN_MAP,
  columnPurpose,
  protectedFields,
  validateFieldWrite,
  validateSheetSchema,
  writableFields,
} from "../lib/workbook-protection.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Protected Column Map classifies every registered column exactly once", () => {
  const allowed = new Set(Object.values(COLUMN_PURPOSE));
  assert.equal(Object.keys(PROTECTED_COLUMN_MAP).length, 50);
  for (const [sheet, fields] of Object.entries(PROTECTED_COLUMN_MAP)) {
    assert.ok(Object.keys(fields).length, sheet);
    for (const [field, purpose] of Object.entries(fields)) {
      assert.ok(field, sheet);
      assert.ok(allowed.has(purpose), `${sheet}.${field}: ${purpose}`);
    }
  }
});

test("formula, lookup, derived, missing, and unknown fields fail closed", () => {
  const headers = ["Match ID", "Year", "Match Status"];
  assert.equal(columnPurpose("Matches", "Match ID"), COLUMN_PURPOSE.FORMULA);
  assert.throws(() => validateFieldWrite("Matches", headers, { "Match ID": "2026-R1-1" }), /Formula.*read only/);
  assert.throws(() => validateFieldWrite("Live Matches", ["T1 P1 Playing HCP"], { "T1 P1 Playing HCP": 8 }), /Lookup.*read only/);
  assert.throws(() => validateFieldWrite("Handicaps", ["Unnamed F"], { "Unnamed F": "x" }), /Derived \/ Read Only.*read only/);
  assert.throws(() => validateFieldWrite("Matches", headers, { Winner: "Team 1" }), /missing the Winner column/);
  assert.throws(() => validateFieldWrite("Unknown Sheet", ["Status"], { Status: "Live" }), /protection map is missing/);
});

test("approved field writes reject leading-apostrophe formulas", () => {
  assert.doesNotThrow(() => validateFieldWrite("Matches", ["Match Status"], { "Match Status": "Final" }));
  assert.throws(() => validateFieldWrite("Matches", ["Match Status"], { "Match Status": "'=SUM(A1:A2)" }), /leading apostrophe/);
});

test("runtime schema validation reports missing or unclassified columns without mutating structure", () => {
  assert.throws(
    () => validateSheetSchema("Notification Log", ["Unnamed A"], ["Notification ID"]),
    /missing required columns: Notification ID.*not modified/,
  );
  assert.throws(
    () => validateSheetSchema("Live Matches", ["Match ID"], ["Match ID", "Current Hole"]),
    /missing required columns: Current Hole.*not modified/,
  );
});

test("write allowlists separate formula and runtime fields", () => {
  assert.ok(writableFields("Matches").includes("Winner"));
  assert.ok(!writableFields("Matches").includes("Match ID"));
  assert.ok(protectedFields("Live Matches").includes("T1 P1 Playing HCP"));
  assert.ok(protectedFields("Guide Information").includes("Item ID"));
});

test("Google Sheets mutations contain no whole-row, whole-tab, or schema-creation primitives", async () => {
  const writer = await source("lib/google-sheets-write.js");
  for (const forbidden of [
    /function writeSheetRow/,
    /function clearSheetRow/,
    /function replaceTab/,
    /insertDataOption=INSERT_ROWS/,
    /appendDimension/,
    /!A:ZZ[^\n]*:clear/,
  ]) assert.doesNotMatch(writer, forbidden);
  assert.match(writer, /validateFieldWrite\(tab, headers, updates\)/);
  assert.match(writer, /readProtectedFieldValues/);
  assert.match(writer, /protected-column validation failed/);
});

test("the authorized Preview schema migration is one isolated column insertion", async () => {
  const writer = await source("lib/google-sheets-write.js");
  assert.equal((writer.match(/insertDimension/g) || []).length, 1);
  assert.match(writer, /migratePreviewLiveMatchScoringLock/);
  assert.match(writer, /sourceColumnCount/);
  assert.match(writer, /expectedFingerprint/);
  assert.match(writer, /existingValues: after\.logicalDataHash === before\.logicalDataHash/);
  assert.doesNotMatch(writer, /appendDimension/);
});

test("the authorized Preview participant identity schema initializer creates only its protected sheet", async () => {
  const writer = await source("lib/google-sheets-write.js");
  assert.equal((writer.match(/addSheet/g) || []).length, 1);
  assert.match(writer, /initializePreviewParticipantIdentityConfiguration/);
  assert.match(writer, /Participant Identity Configuration/);
  assert.match(writer, /VERCEL_ENV !== "preview"/);
  assert.match(writer, /requireIsolatedScoringSheet\(\)/);
  assert.match(writer, /addProtectedRange/);
  assert.match(writer, /before\.sheetExists/);
  const contract = await source("lib/participant-identity-workbook.js");
  assert.match(contract, /valueInputOption: "RAW"/);
  assert.match(contract, /Participant Identity Configuration!A1:I\$\{seedRows\.length \+ 1\}/);
});

test("Preview Reset, Guide administration, CMS, and finalization use field-scoped writes", async () => {
  const writer = await source("lib/google-sheets-write.js");
  assert.match(writer, /fieldScopedChanges\("Live Matches"/);
  assert.match(writer, /fieldScopedChanges\("Matches"/);
  assert.match(writer, /writableFields\("Matches"\)/);
  assert.match(writer, /Guide Information requires a workbook-generated Item ID row/);
  assert.match(writer, /clearSheetFields\(schema\.tab/);
  assert.doesNotMatch(writer, /headers\.map\(\(header\) => header \? record\[header\]/);
});

test("repository architecture forbids inferred worksheet dependencies", async () => {
  const architecture = await readFile(new URL("../docs/workbook-data-source-architecture.md", import.meta.url), "utf8");
  assert.match(architecture, /existing authoritative services, loaders, and normalized runtime models/);
  assert.match(architecture, /verify every directly referenced worksheet title against the active Preview workbook schema/i);
  assert.match(architecture, /never introduce a worksheet dependency based on an inferred or convenient name/i);
  assert.match(architecture, /stop and report the missing dependency/i);
  assert.match(architecture, /one authoritative application publisher calculates and writes that output/i);
  assert.match(architecture, /Consumers must not independently recalculate the same derived workbook data/i);
});
