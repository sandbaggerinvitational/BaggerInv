// Proof layer: INTEGRATION — local immutable report package, no provider access.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../docs/reliability/2026-tournament-postmortem/", import.meta.url);
test("PRESERVE-001 all preserved report bytes match the approved manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("preservation-manifest.json", root)));
  const names = (await readdir(root)).sort();
  assert.equal(manifest.artifacts.length, 122);
  assert.deepEqual(names, [...manifest.artifacts.map(item => item.file), "preservation-manifest.json"].sort());
  for (const item of manifest.artifacts) {
    assert.match(item.file, /^[A-Za-z0-9_.-]+$/);
    const bytes = await readFile(new URL(item.file, root));
    assert.equal(bytes.length, item.bytes, item.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, item.file);
    if (item.file.endsWith(".json")) JSON.parse(bytes);
  }
});

test("PRESERVE-002 original source manifest remains a byte-exact subset", async () => {
  const source = JSON.parse(await readFile(new URL("package-manifest.json", root)));
  const preserved = JSON.parse(await readFile(new URL("preservation-manifest.json", root)));
  assert.equal(source.artifacts.length, 118);
  for (const item of source.artifacts) {
    assert.deepEqual(preserved.artifacts.find(candidate => candidate.file === item.file), item);
  }
});
