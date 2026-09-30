import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import test from "node:test";
import { withDirectorCalcuttaRead } from "./fixtures/reviewed-authority-extension.mjs";

const root = new URL("../", import.meta.url);
const candidate = "6adace0c57e107ecda30d074001cb8ce302ab67b";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const isCertification = path => path.startsWith("test/") || path.startsWith("docs/");
const localDependencyTarget = "/Users/claybeltran/Developer/BaggerInv/node_modules";

function assertNonShippedDependencyLink({ path, shippedPaths, symbolicLink, target, resolvedTarget, targetDirectory }) {
  assert.equal(path, "node_modules", "only the exact local dependency entry is authorized");
  assert.ok(!shippedPaths.some(name => name === path || name.startsWith(`${path}/`)),
    "tracked, staged or candidate dependency content cannot be excluded");
  assert.equal(symbolicLink, true, "a real file/directory is not this workspace artifact");
  assert.equal(target, localDependencyTarget, "only the verified local dependency target is authorized");
  assert.equal(resolvedTarget, localDependencyTarget, "dependency target must not redirect to shipped source");
  assert.equal(targetDirectory, true, "the external dependency target must be a real directory");
}

// Retired behavior: One-release byte-preservation certification was superseded by owner-approved Phase 1/2/2C/retirement source changes. Old release evidence remains immutable in Git/reliability reports. Current canonical rules, authorization, receipts and no-native/no-Production boundaries require separate behavioral and scope evidence; this deleted old-release assertion receives no PASS credit.


test("dependency artifact exception rejects shipped entries, other symlinks and redirected source", () => {
  const valid = { path: "node_modules", shippedPaths: ["app/page.js", "package-lock.json"],
    symbolicLink: true, target: localDependencyTarget, resolvedTarget: localDependencyTarget, targetDirectory: true };
  assert.doesNotThrow(() => assertNonShippedDependencyLink(valid));
  for (const changed of [
    { path: "app/node_modules" }, { path: "lib/symlink.js" }, { path: "node_modules/next" },
    { shippedPaths: ["node_modules"] }, { shippedPaths: ["node_modules/package.js"] },
    { symbolicLink: false }, { target: "/private/tmp/other-dependencies" },
    { resolvedTarget: "/Users/claybeltran/Developer/BaggerInv/lib" }, { targetDirectory: false },
  ]) assert.throws(() => assertNonShippedDependencyLink({ ...valid, ...changed }));
});

test("Director read exception admits only the exact reviewed line and rejects altered authority", () => {
  const original = git("show", "6d0b2ad5cab61f50e6d2a269bb2d02e036ccae05:lib/production-scoring-operations-server.js");
  const expected = withDirectorCalcuttaRead(original);
  const line = '  read_production_calcutta_management_v1: "OBSERVATION",\n';
  assert.equal(expected.split(line).length, 2);
  assert.equal(expected.replace(line, ""), original);
  for (const altered of [
    expected.replace(line, line.replace('"OBSERVATION"', '"SCORING_COMMIT"')),
    expected.replace(line, `${line}  unsafe_rpc: "OBSERVATION",\n`),
    expected.replace("inspect_production_calcutta_v1", "different_existing_rpc"),
    original,
  ]) assert.throws(() => assert.equal(altered, expected));
  assert.throws(() => withDirectorCalcuttaRead(expected));
  assert.throws(() => withDirectorCalcuttaRead(original.replace("inspect_production_calcutta_v1", "missing_anchor")));
});
