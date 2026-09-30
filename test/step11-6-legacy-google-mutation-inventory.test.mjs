import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { ADMIN_CMS_RESOURCES } from "../lib/admin-cms-config.js";
import { DIRECTOR_MUTATION_POLICY } from "../lib/director-mutation-authority.js";
import {
  PREVIEW_ONLY_GOOGLE_WRITERS,
  PREVIEW_ONLY_GOOGLE_WRITER_ENTRYPOINTS,
  PRODUCTION_AUTHORING_GOOGLE_WRITERS,
  PRODUCTION_CANONICAL_GOOGLE_MUTATION_ENTRY_MATRIX,
  PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_CLASSIFICATION,
  PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITER_DETAILS,
  PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS,
  PRODUCTION_CANONICAL_GOOGLE_WRITERS,
  PRODUCTION_GOOGLE_WRITER_ENTRYPOINTS,
  PRODUCTION_MIRROR_ARCHIVE_GOOGLE_WRITERS,
} from "../lib/production-google-writer-inventory.js";

const require = createRequire(import.meta.url);
const { parse } = require("next/dist/compiled/babel/parser");
const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => readFile(path.join(root, relative), "utf8");
const routeFile = (route) => `app${route}/route.js`;

async function javascriptFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(relative));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

function ast(source) {
  return parse(source, {
    allowAwaitOutsideFunction: true,
    plugins: ["dynamicImport", "importMeta", "jsx", "topLevelAwait"],
    sourceType: "module",
  });
}

function children(node) {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node)
    .filter(([key]) => !["comments", "end", "extra", "loc", "start", "tokens"].includes(key))
    .flatMap(([, value]) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []);
}

function calledIdentifiers(node) {
  const calls = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if ((value.type === "CallExpression" || value.type === "OptionalCallExpression") &&
        value.callee?.type === "Identifier") {
      calls.add(value.callee.name);
    }
    for (const child of children(value)) visit(child);
  };
  visit(node);
  return calls;
}

function topLevelFunctions(program) {
  const functions = new Map();
  const exported = new Set();
  const register = (declaration, isExported = false) => {
    if (declaration?.type === "FunctionDeclaration" && declaration.id?.name) {
      functions.set(declaration.id.name, declaration);
      if (isExported) exported.add(declaration.id.name);
    }
    if (declaration?.type === "VariableDeclaration") {
      for (const item of declaration.declarations || []) {
        if (item.id?.type !== "Identifier" ||
            !["ArrowFunctionExpression", "FunctionExpression"].includes(item.init?.type)) continue;
        functions.set(item.id.name, item.init);
        if (isExported) exported.add(item.id.name);
      }
    }
  };
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration") register(statement.declaration, true);
    else register(statement);
  }
  return { exported, functions };
}

function exportedGoogleMutationFunctions(source) {
  const parsed = ast(source);
  const { exported, functions } = topLevelFunctions(parsed.program);
  const calls = new Map();
  const directMutation = new Set();
  for (const [name, fn] of functions) {
    const identifiers = calledIdentifiers(fn.body);
    calls.set(name, identifiers);
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if ((value.type === "CallExpression" || value.type === "OptionalCallExpression") &&
          value.callee?.type === "Identifier" && value.callee.name === "google" &&
          value.arguments.length >= 2) {
        // Every two-argument call to the private transport in this module is a
        // provider mutation. Reads use the single path argument.
        directMutation.add(name);
      }
      for (const child of children(value)) visit(child);
    };
    visit(fn.body);
  }
  const mutating = new Set(directMutation);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, identifiers] of calls) {
      if (!mutating.has(name) && [...identifiers].some((symbol) => mutating.has(symbol))) {
        mutating.add(name);
        changed = true;
      }
    }
  }
  return [...exported].filter((name) => mutating.has(name)).sort();
}

function safeHandlerWriterReachability(source, writerSymbols) {
  const parsed = ast(source);
  const { functions } = topLevelFunctions(parsed.program);
  const calls = new Map([...functions].map(([name, fn]) => [name, calledIdentifiers(fn.body)]));
  const reachesWriter = new Set([...calls]
    .filter(([, identifiers]) => [...identifiers].some((name) => writerSymbols.has(name)))
    .map(([name]) => name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, identifiers] of calls) {
      if (!reachesWriter.has(name) && [...identifiers].some((called) => reachesWriter.has(called))) {
        reachesWriter.add(name);
        changed = true;
      }
    }
  }
  return ["GET", "HEAD", "OPTIONS"].filter((method) => reachesWriter.has(method));
}

test("AST inventory classifies every exported Google mutation function exactly", async () => {
  const discovered = exportedGoogleMutationFunctions(await read("lib/google-sheets-write.js"));
  const classified = [...new Set([
    ...PRODUCTION_CANONICAL_GOOGLE_WRITERS,
    ...PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS,
    ...PRODUCTION_AUTHORING_GOOGLE_WRITERS,
    ...PRODUCTION_MIRROR_ARCHIVE_GOOGLE_WRITERS,
    ...PREVIEW_ONLY_GOOGLE_WRITERS,
  ])].sort();
  assert.deepEqual(discovered, classified,
    "A Google mutation export was added, removed, or left outside the exact intent inventory.");
  const canonical = new Set([
    ...PRODUCTION_CANONICAL_GOOGLE_WRITERS,
    ...PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS,
  ]);
  assert.deepEqual(PRODUCTION_AUTHORING_GOOGLE_WRITERS.filter((symbol) => canonical.has(symbol)), []);
  assert.deepEqual(PRODUCTION_MIRROR_ARCHIVE_GOOGLE_WRITERS.filter((symbol) => canonical.has(symbol)), []);
  assert.deepEqual(PRODUCTION_AUTHORING_GOOGLE_WRITERS
    .filter((symbol) => PRODUCTION_MIRROR_ARCHIVE_GOOGLE_WRITERS.includes(symbol)), ["publishOddsSnapshot"]);
});

test("every callable mutation symbol remains on an exactly classified intent entrypoint", async () => {
  const symbols = [...new Set([
    ...PRODUCTION_CANONICAL_GOOGLE_WRITERS,
    ...PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS,
    ...PRODUCTION_AUTHORING_GOOGLE_WRITERS,
    ...PRODUCTION_MIRROR_ARCHIVE_GOOGLE_WRITERS,
    ...PREVIEW_ONLY_GOOGLE_WRITERS,
  ])];
  const productionByPath = new Map();
  for (const entry of PRODUCTION_GOOGLE_WRITER_ENTRYPOINTS) {
    if (!productionByPath.has(entry.path)) productionByPath.set(entry.path, new Set());
    productionByPath.get(entry.path).add(entry.boundary);
  }
  const preview = new Set(PREVIEW_ONLY_GOOGLE_WRITER_ENTRYPOINTS);
  const stringOnly = new Set([
    "app/admin/director/DirectorDashboard.js",
    "lib/director-mutation-authority.js",
    "lib/production-google-writer-inventory.js",
  ]);
  const unclassified = [];
  for (const relative of [...await javascriptFiles("app"), ...await javascriptFiles("lib")]) {
    if (relative === "lib/google-sheets-write.js" || stringOnly.has(relative)) continue;
    const source = await read(relative);
    const present = symbols.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(source));
    if (!present.length) continue;
    if (productionByPath.has(relative)) {
      for (const boundary of productionByPath.get(relative)) {
        assert.match(source, new RegExp(`\\b${boundary}\\b`), `${relative}:${boundary}`);
      }
      continue;
    }
    if (preview.has(relative)) {
      if (relative === "app/api/tournament-guide/route.js") {
        // Production is explicitly retired, including reads. Execute all
        // handlers and prove retirement precedes auth/body parsing/writers.
        const { loadDirectorSource } = await import("./fixtures/director-behavior.mjs");
        let authoringCalls = 0, bodyReads = 0;
        const route = await loadDirectorSource(relative, {
          "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
          "../../../lib/director-transaction-error": { directorTransactionError: () => "unexpected" },
          "../../../lib/production-google-authoring.js": { withProductionGoogleAuthoringWrite: () => { authoringCalls++; throw new Error("writer forbidden"); } },
          "../../../lib/google-workbook-mutation-intent.js": { GOOGLE_AUTHORING_OPERATIONS: { TOURNAMENT_GUIDE: "TOURNAMENT_GUIDE" } },
        });
        const before = process.env.VERCEL_ENV;
        try {
          for (const environment of ["production", " PRODUCTION "]) {
            process.env.VERCEL_ENV = environment;
            for (const method of ["GET", "POST", "DELETE"]) {
              const response = await route[method]({ headers: { get: () => { throw new Error("authorization must not be reached"); } }, json: () => { bodyReads++; throw new Error("body must not be read"); } });
              assert.equal(response.status, 410);
              assert.equal(response.body.code, "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED");
            }
          }
        } finally { if (before === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = before; }
        assert.equal(authoringCalls, 0); assert.equal(bodyReads, 0);
        continue;
      }
      assert.match(source,
        /VERCEL_ENV[^\n]{0,100}preview|process\.env\.VERCEL_ENV\s*!==\s*["']preview["']/,
        `${relative} must remain hard Preview-only`);
      continue;
    }
    unclassified.push({ relative, symbols: present });
  }
  assert.deepEqual(unclassified, []);
});

test("subordinate lifecycle writers require an admitted parent and have no external importer", async () => {
  assert.equal(PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_CLASSIFICATION,
    "INTERNAL_SUBORDINATE_REQUIRES_PARENT_ADMISSION");
  assert.deepEqual(PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITER_DETAILS.map((item) => ({
    symbol: item.symbol,
    classification: item.classification,
    admittedParents: [...item.admittedParents],
  })), PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS.map((symbol) => ({
    symbol,
    classification: "INTERNAL_SUBORDINATE_REQUIRES_PARENT_ADMISSION",
    admittedParents: ["finalizeLiveMatch", "reopenLiveMatch"],
  })));

  const importers = [];
  for (const relative of [...await javascriptFiles("app"), ...await javascriptFiles("lib")]) {
    if (["lib/google-sheets-write.js", "lib/production-google-writer-inventory.js"].includes(relative)) continue;
    const source = await read(relative);
    const symbols = PRODUCTION_CANONICAL_GOOGLE_SUBORDINATE_WRITERS
      .filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(source));
    if (symbols.length) importers.push({ relative, symbols });
  }
  assert.deepEqual(importers, []);
  const writer = await read("lib/google-sheets-write.js");
  assert.match(writer, /finalizeLiveMatch[\s\S]*synchronizeNetSkinsAfterMatch[\s\S]*synchronizeCalcuttaAfterOfficialUpdate/);
  assert.match(writer, /reopenLiveMatch[\s\S]*synchronizeNetSkinsAfterMatch[\s\S]*synchronizeCalcuttaAfterOfficialUpdate/);
});

// Retired behavior: Exact former Google-writer route matrix is obsolete after disconnection. New invariant is zero runtime writers and denied low-level provider transport, not preservation of all previous wrappers. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.


// Retired behavior: Closed Google import-surface matrix changes intentionally because participant/Director adapters no longer import the writer; preserve zero-runtime-write path/security tests. Replacement: canonical/zero-Google retirement suite; historical utility tests in this file remain.
