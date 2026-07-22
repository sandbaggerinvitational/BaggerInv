import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_CMS_RESOURCES, TOURNAMENT_CMS_FIELDS, cmsResource } from "../lib/admin-cms-config.js";

test("Admin CMS exposes only allowlisted sheet resources", () => {
  assert.equal(cmsResource("players").tab, "Players");
  assert.equal(cmsResource("matches").tab, "Matches");
  assert.equal(cmsResource("unknown"), null);
});

test("every editable resource has stable identity and field definitions", () => {
  for (const [name, schema] of Object.entries(ADMIN_CMS_RESOURCES)) {
    assert.ok(schema.tab, `${name} needs a sheet tab`);
    assert.ok(schema.idFields.length, `${name} needs stable identity fields`);
    assert.ok(schema.fields.length, `${name} needs editable fields`);
    for (const id of schema.idFields) assert.ok(schema.fields.some((field) => field.name === id), `${name} is missing identity field ${id}`);
  }
});

test("tournament editor includes status and homepage controls", () => {
  const names = new Set(TOURNAMENT_CMS_FIELDS.map((field) => field.name));
  for (const required of ["Year", "Tournament Status", "Current Round", "Hero Image", "Mobile Hero Image"]) assert.ok(names.has(required));
});
