import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { isValidOpaqueMatchID, requireOpaqueMatchID } from "../lib/mobile-opaque-match-id.js";
import { validOpaqueMatchIDs, invalidOpaqueMatchIDs } from "./support/mobile-opaque-match-id-cases.mjs";

for (const { case: name, value } of validOpaqueMatchIDs) {
  test(`opaque Match ID accepts and preserves ${name}`, () => {
    assert.equal(isValidOpaqueMatchID(value), true);
    assert.equal(requireOpaqueMatchID(value), value);
    assert.equal(requireOpaqueMatchID(value, { nullable: true }), value);
    assert.deepEqual(Buffer.from(requireOpaqueMatchID(value), "utf8"), Buffer.from(value, "utf8"));
  });
}

for (const { case: name, value } of invalidOpaqueMatchIDs) {
  test(`opaque Match ID rejects ${name} without coercion`, () => {
    assert.equal(isValidOpaqueMatchID(value), false);
    assert.throws(() => requireOpaqueMatchID(value), { code: "MOBILE_API_UNAVAILABLE" });
  });
}

test("nullable IDs accept only null or undefined absence and preserve whitespace", () => {
  assert.equal(requireOpaqueMatchID(null, { nullable: true }), null);
  assert.equal(requireOpaqueMatchID(undefined, { nullable: true }), null);
  assert.throws(() => requireOpaqueMatchID("", { nullable: true }));
  assert.equal(requireOpaqueMatchID(" ", { nullable: true }), " ");
});

test("Unicode scalar count is deliberately different from UTF-16 units and grapheme clusters", () => {
  assert.equal("🏌".repeat(200).length, 400);
  assert.equal(isValidOpaqueMatchID("🏌".repeat(200)), true);
  assert.equal(isValidOpaqueMatchID("e\u0301".repeat(100)), true);
  assert.equal(isValidOpaqueMatchID("e\u0301".repeat(101)), false);
  assert.notEqual(requireOpaqueMatchID("match-é"), requireOpaqueMatchID("match-e\u0301"));
});

test("both Match schemas exactly match the shared runtime scalar contract", async () => {
  const schemas = await Promise.all(["matches", "match-detail"].map(async (name) => JSON.parse(
    await readFile(new URL(`../contracts/mobile/v1/${name}.schema.json`, import.meta.url), "utf8"),
  )));
  assert.deepEqual(schemas[0].$defs.matchIdentifier, schemas[1].$defs.matchIdentifier);
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  for (const schema of schemas) {
    const validate = ajv.compile(schema.$defs.matchIdentifier);
    for (const { case: name, value } of validOpaqueMatchIDs) {
      assert.equal(validate(value), true, `${schema.$id}: ${name}`);
    }
    for (const { case: name, value } of invalidOpaqueMatchIDs) {
      assert.equal(validate(value), false, `${schema.$id}: ${name}`);
    }
  }
});
