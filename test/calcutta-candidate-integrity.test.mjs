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

test("current Calcutta candidate preserves every runtime blob except the exact approved analytics identity update", async () => {
  assert.equal(git("merge-base", candidate, "HEAD").trim(), candidate);
  const baseline = new Map(git("ls-tree", "-rz", candidate).split("\0").filter(Boolean).map(row => {
    const [metadata, path] = row.split("\t");
    return [path, metadata.split(" ")[2]];
  }));
  // Include nonignored untracked additions as well as committed/staged files.
  // No extra application/configuration/migration path is silently allowed.
  const paths = new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean));
  for (const path of paths) {
    if (path === "node_modules") {
      // This one local symlink is absent from the candidate, HEAD and index,
      // hence from the exact Git deployment artifact. Dependencies are installed
      // from the still-byte-pinned package manifests, not shipped via this link.
      const link = new URL(path, root);
      const symbolicLink = (await lstat(link)).isSymbolicLink();
      assert.equal(symbolicLink, true, "unexpected node_modules artifact");
      assertNonShippedDependencyLink({ path, symbolicLink,
        shippedPaths: [...baseline.keys(), ...git("ls-tree", "-r", "--name-only", "HEAD").trim().split("\n"),
          ...git("ls-files", "--cached", "-z").split("\0")],
        target: await readlink(link), resolvedTarget: await realpath(link),
        targetDirectory: (await lstat(localDependencyTarget)).isDirectory(),
      });
      continue;
    }
    if (!isCertification(path)) assert.ok(baseline.has(path), `unexpected runtime addition: ${path}`);
  }
  for (const [path, blob] of baseline) {
    if (isCertification(path)) continue;
    const actual = await readFile(new URL(path, root));
    if (path === "lib/historical-analytics-reuse.js") {
      let expected = git("show", `${candidate}:${path}`);
      for (const [oldValue, newValue] of [
        ['const HISTORICAL_ANALYTICS_CODEC_IMPLEMENTATION = "9ac3c61a063f6920";',
          'const HISTORICAL_ANALYTICS_CODEC_IMPLEMENTATION = "fedfccf03d1d4a04";'],
        ['export const HISTORICAL_ANALYTICS_VERSION = "scorecard-domain-v1-0ef4c5ba687ce51b";',
          'export const HISTORICAL_ANALYTICS_VERSION = "scorecard-domain-v1-456440687845e6d6";'],
      ]) {
        assert.equal(expected.split(oldValue).length, 2, "exact reviewed identity required");
        expected = expected.replace(oldValue, newValue);
      }
      assert.equal(actual.toString("utf8"), expected, path);
    } else {
      assert.equal(createHash("sha1").update(`blob ${actual.length}\0`).update(actual).digest("hex"), blob, path);
    }
  }
});

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
