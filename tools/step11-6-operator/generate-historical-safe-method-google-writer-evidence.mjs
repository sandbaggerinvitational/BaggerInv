#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { posix as path } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { parse } = require("next/dist/compiled/babel/parser");

const ROOT = new URL("../../", import.meta.url);
const INVENTORY_URL = new URL(
  "../../docs/evidence/step11-6-production-origin-inventory-v4.json",
  import.meta.url,
);
const EVIDENCE_URL = new URL(
  "../../docs/evidence/step11-6-historical-safe-method-google-writer-v2.json",
  import.meta.url,
);

export const HISTORICAL_SAFE_METHOD_WRITER_SCHEMA =
  "step11-6-historical-safe-method-google-writer-v2";
export const HISTORICAL_SAFE_METHOD_WRITER_FILE =
  "app/api/cron/round-scorecards-archive/route.js";
export const HISTORICAL_SAFE_METHOD_WRITER_REQUEST_PATH =
  "/api/cron/round-scorecards-archive";
export const HISTORICAL_SAFE_METHOD_WRITER_BLOB =
  "1d0ea635f7495aab0e619025fd626553d190953b";
export const HISTORICAL_SAFE_METHOD_405_BLOB =
  "c78228ffc3889277d3e91ba47fa42b8ebb967572";
export const HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT = 236;
export const HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT =
  "a8263e02ab7b65df938367fbf39769c70b501a614ebcdfa46800bda2e82de3a2";
export const HISTORICAL_SAFE_METHOD_WRITER_BLOCKED_PATHS_FINGERPRINT =
  "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa";

const SAFE_HTTP_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"]);
const ROUTE_FILE_PATTERN = /^app\/.+\/route\.(?:js|jsx|mjs|ts|tsx)$/;
const SOURCE_FILE_EXTENSIONS = Object.freeze([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const MUTATING_HTTP_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AST_IGNORED_KEYS = new Set([
  "comments", "end", "errors", "extra", "innerComments", "leadingComments",
  "loc", "start", "tokens", "trailingComments",
]);

const ORIGIN_INVENTORY_SCHEMA = "step11-6-production-origin-inventory-v4";
const PROVIDER_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
  "gitBranch", "providerSource", "deploymentStatus", "createdAt",
  "shaResolution",
]);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactArray = (value, expected) =>
  Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);

function git(args, { input, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    input,
    encoding: input === undefined ? "utf8" : undefined,
    maxBuffer,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr?.toString?.() || "git command failed").trim());
  }
  return result.stdout;
}

function batchObjectTypes(specs) {
  if (specs.length === 0) return [];
  const lines = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: Buffer.from(`${specs.join("\n")}\n`),
  }).toString("utf8").trim().split("\n");
  if (lines.length !== specs.length) {
    throw new Error("The Git object audit returned an incomplete response.");
  }
  return lines.map((line, index) => {
    if (line === `${specs[index]} missing`) return null;
    const match = line.match(/^([0-9a-f]{40}) (commit|blob)$/);
    if (!match) throw new Error(`Unexpected Git object response: ${line}`);
    return { objectId: match[1], objectType: match[2] };
  });
}

function normalizedInventory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schemaVersion !== ORIGIN_INVENTORY_SCHEMA ||
      !exactArray(value.providerRecordTuple, PROVIDER_RECORD_TUPLE) ||
      !Array.isArray(value.providerRecords) ||
      value.providerRecordCount !== value.providerRecords.length ||
      sha256(JSON.stringify(value.providerRecords)) !==
        value.providerRecordsFingerprint) {
    throw new Error("The retained v4 Production origin inventory was invalid.");
  }
  return value;
}

function countSummary(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => compare(left, right));
}

const sourceByBlob = new Map();
const moduleIndexByBlob = new Map();
const exhaustiveAuditByCommitFingerprint = new Map();

function blobSource(blob) {
  if (!sourceByBlob.has(blob)) {
    sourceByBlob.set(blob, git(["cat-file", "blob", blob]));
  }
  return sourceByBlob.get(blob);
}

function commitTree(sha) {
  const result = new Map();
  const output = git(["ls-tree", "-r", "--full-tree", sha]);
  for (const line of output.split("\n")) {
    if (!line) continue;
    const match = line.match(/^\d+ blob ([0-9a-f]{40})\t(.+)$/);
    if (match) result.set(match[2], match[1]);
  }
  return result;
}

function patternNames(node, values = []) {
  if (!node || typeof node !== "object") return values;
  if (node.type === "Identifier") values.push(node.name);
  else if (node.type === "RestElement") patternNames(node.argument, values);
  else if (node.type === "AssignmentPattern") patternNames(node.left, values);
  else if (node.type === "ObjectPattern") {
    for (const property of node.properties || []) {
      patternNames(property.type === "RestElement" ? property.argument : property.value, values);
    }
  } else if (node.type === "ArrayPattern") {
    for (const element of node.elements || []) patternNames(element, values);
  }
  return values;
}

function exportedName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "StringLiteral") return node.value;
  return null;
}

function moduleIndex(blob) {
  if (moduleIndexByBlob.has(blob)) return moduleIndexByBlob.get(blob);
  const source = blobSource(blob);
  let ast;
  try {
    ast = parse(source, {
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      plugins: [
        "decorators-legacy", "dynamicImport", "importAttributes", "importMeta",
        "jsx", "topLevelAwait", "typescript",
      ],
      sourceType: "unambiguous",
    });
  } catch (error) {
    throw new Error(`The historical route callgraph parser rejected blob ${blob}: ${error.message}`);
  }
  const locals = new Map();
  const imports = new Map();
  const namespaceImports = new Map();
  const exports = new Map();
  const exportStars = [];
  const registerDeclaration = (declaration, exported = false) => {
    if (!declaration) return;
    if (declaration.type === "FunctionDeclaration" ||
        declaration.type === "ClassDeclaration") {
      if (declaration.id?.name) {
        locals.set(declaration.id.name, declaration);
        if (exported) exports.set(declaration.id.name, {
          kind: "local", local: declaration.id.name,
        });
      }
      return;
    }
    if (declaration.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations || []) {
        for (const name of patternNames(declarator.id)) {
          locals.set(name, declarator.init || declarator);
          if (exported) exports.set(name, { kind: "local", local: name });
        }
      }
    }
  };
  for (const statement of ast.program.body) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers || []) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          namespaceImports.set(specifier.local.name, statement.source.value);
        } else {
          imports.set(specifier.local.name, {
            imported: specifier.type === "ImportDefaultSpecifier"
              ? "default"
              : exportedName(specifier.imported),
            source: statement.source.value,
          });
        }
      }
      continue;
    }
    if (statement.type === "ExportNamedDeclaration") {
      registerDeclaration(statement.declaration, true);
      for (const specifier of statement.specifiers || []) {
        const name = exportedName(specifier.exported);
        if (!name) continue;
        if (statement.source) {
          exports.set(name, {
            imported: exportedName(specifier.local),
            kind: "reexport",
            source: statement.source.value,
          });
        } else {
          exports.set(name, {
            kind: "local", local: exportedName(specifier.local),
          });
        }
      }
      continue;
    }
    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = statement.declaration;
      if ((declaration.type === "FunctionDeclaration" ||
          declaration.type === "ClassDeclaration") && declaration.id?.name) {
        locals.set(declaration.id.name, declaration);
        exports.set("default", { kind: "local", local: declaration.id.name });
      } else {
        exports.set("default", { kind: "node", node: declaration });
      }
      continue;
    }
    if (statement.type === "ExportAllDeclaration") {
      exportStars.push(statement.source.value);
      continue;
    }
    registerDeclaration(statement);
  }
  const index = { exportStars, exports, imports, locals, namespaceImports };
  moduleIndexByBlob.set(blob, index);
  return index;
}

function localModuleSource(source) {
  return typeof source === "string" && (source.startsWith(".") || source.startsWith("@/"));
}

function resolveLocalModule(tree, importer, source) {
  if (!localModuleSource(source)) return null;
  const base = source.startsWith("@/")
    ? source.slice(2)
    : path.normalize(path.join(path.dirname(importer), source));
  const candidates = [base];
  if (!SOURCE_FILE_EXTENSIONS.some((extension) => base.endsWith(extension)) &&
      !base.endsWith(".json")) {
    for (const extension of SOURCE_FILE_EXTENSIONS) candidates.push(`${base}${extension}`);
    candidates.push(`${base}.json`);
    for (const extension of SOURCE_FILE_EXTENSIONS) {
      candidates.push(path.join(base, `index${extension}`));
    }
    candidates.push(path.join(base, "index.json"));
  }
  return candidates.find((candidate) => tree.has(candidate)) || null;
}

function propertyName(node, computed = false) {
  if (!computed && node?.type === "Identifier") return node.name;
  if (node?.type === "StringLiteral" || node?.type === "NumericLiteral") {
    return String(node.value);
  }
  return null;
}

function memberChain(node) {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
    return memberChain(node.callee);
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    const property = propertyName(node.property, node.computed);
    return property ? [...memberChain(node.object), property] : memberChain(node.object);
  }
  return [];
}

function staticString(node) {
  if (!node) return "";
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral") {
    return (node.quasis || []).map((quasi) => quasi.value?.cooked || quasi.value?.raw || "")
      .join("${}");
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return `${staticString(node.left)}${staticString(node.right)}`;
  }
  return "";
}

function mutatingMethodFromArguments(args = []) {
  for (const argument of args) {
    if (argument?.type !== "ObjectExpression") continue;
    for (const property of argument.properties || []) {
      if ((property.type === "ObjectProperty" || property.type === "Property") &&
          propertyName(property.key, property.computed) === "method" &&
          (property.value?.type === "StringLiteral" ||
            property.value?.type === "Literal")) {
        const method = String(property.value.value).toUpperCase();
        if (MUTATING_HTTP_METHODS.has(method)) return method;
      }
    }
  }
  return null;
}

function googleMutationSink(call, modulePath) {
  if (call.type !== "CallExpression" && call.type !== "OptionalCallExpression") return null;
  const chain = memberChain(call.callee);
  const last = chain.at(-1) || "";
  if (["append", "batchUpdate", "clear", "update"].includes(last) &&
      (chain.includes("spreadsheets") || chain.includes("values"))) {
    return `GOOGLE_SHEETS_CLIENT_${last.toUpperCase()}`;
  }
  const method = mutatingMethodFromArguments(call.arguments);
  if (!method) return null;
  const endpoint = staticString(call.arguments?.[0]);
  if (last === "fetch" && /sheets\.googleapis\.com/i.test(endpoint)) {
    return `GOOGLE_SHEETS_FETCH_${method}`;
  }
  if (/google-sheets|google.*sheet|sheet.*google/i.test(modulePath) &&
      /^(?:google|googleRequest|googleSheetsRequest|requestGoogleSheets)$/i.test(last)) {
    return `GOOGLE_SHEETS_REST_${method}`;
  }
  return null;
}

function referenceIdentifier(node, parent, key) {
  if (!parent) return false;
  if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" ||
      parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
      key === "id") return false;
  if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression") && key === "params") return false;
  if (parent.type === "VariableDeclarator" && key === "id") return false;
  if ((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
      key === "property" && !parent.computed) return false;
  if ((parent.type === "ObjectProperty" || parent.type === "ObjectMethod" ||
      parent.type === "ClassMethod" || parent.type === "ClassProperty") &&
      key === "key" && !parent.computed && !parent.shorthand) return false;
  if (/^(?:Import|Export).+Specifier$/.test(parent.type)) return false;
  if ((parent.type === "LabeledStatement" || parent.type === "BreakStatement" ||
      parent.type === "ContinueStatement") && key === "label") return false;
  return true;
}

function safeMethodExports(index) {
  return SAFE_HTTP_METHODS.filter((method) => index.exports.has(method));
}

function auditSafeHandler({ sha, tree, routePath, routeBlob, method }) {
  const nodes = new Set();
  const edges = new Set();
  const sinks = new Set();
  const unresolved = new Set();
  const visited = new Set();
  const currentStack = [];
  const nodeId = (modulePath, blob, kind, symbol) =>
    JSON.stringify([modulePath, blob, kind, symbol]);
  const addEdge = (target) => {
    if (currentStack.length) edges.add(JSON.stringify([currentStack.at(-1), target]));
  };
  const resolveImport = (importer, source, symbol) => {
    const resolved = resolveLocalModule(tree, importer, source);
    if (!resolved) {
      if (localModuleSource(source)) {
        unresolved.add(JSON.stringify([importer, source, symbol, "LOCAL_MODULE_MISSING"]));
      }
      return null;
    }
    return resolved;
  };
  const visitExport = (modulePath, symbol) => {
    const blob = tree.get(modulePath);
    if (!blob) {
      unresolved.add(JSON.stringify([modulePath, symbol, "MODULE_BLOB_MISSING"]));
      return;
    }
    if (modulePath.endsWith(".json")) return;
    const id = nodeId(modulePath, blob, "export", symbol);
    addEdge(id);
    nodes.add(id);
    if (visited.has(id)) return;
    visited.add(id);
    currentStack.push(id);
    const index = moduleIndex(blob);
    const binding = index.exports.get(symbol);
    if (binding?.kind === "local") visitLocal(modulePath, binding.local);
    else if (binding?.kind === "node") visitNode(modulePath, binding.node, null, null);
    else if (binding?.kind === "reexport") {
      const resolved = resolveImport(modulePath, binding.source, binding.imported);
      if (resolved) visitExport(resolved, binding.imported);
    } else if (index.exportStars.length) {
      for (const source of index.exportStars) {
        const resolved = resolveImport(modulePath, source, symbol);
        if (resolved) visitExport(resolved, symbol);
      }
    } else {
      unresolved.add(JSON.stringify([modulePath, symbol, "EXPORTED_BINDING_MISSING"]));
    }
    currentStack.pop();
  };
  const visitLocal = (modulePath, symbol) => {
    const blob = tree.get(modulePath);
    const id = nodeId(modulePath, blob, "local", symbol);
    addEdge(id);
    nodes.add(id);
    if (visited.has(id)) return;
    visited.add(id);
    const index = moduleIndex(blob);
    const binding = index.locals.get(symbol);
    if (!binding) return;
    currentStack.push(id);
    visitNode(modulePath, binding, null, null);
    currentStack.pop();
  };
  const visitReference = (modulePath, name) => {
    const blob = tree.get(modulePath);
    const index = moduleIndex(blob);
    if (index.locals.has(name)) {
      visitLocal(modulePath, name);
      return;
    }
    const imported = index.imports.get(name);
    if (imported) {
      const resolved = resolveImport(modulePath, imported.source, imported.imported);
      if (resolved) visitExport(resolved, imported.imported);
    }
  };
  const visitNode = (modulePath, node, parent, key) => {
    if (!node || typeof node !== "object") return;
    const sink = googleMutationSink(node, modulePath);
    if (sink) sinks.add(JSON.stringify([modulePath, tree.get(modulePath), sink]));
    if ((node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
        node.object?.type === "Identifier") {
      const index = moduleIndex(tree.get(modulePath));
      const namespaceSource = index.namespaceImports.get(node.object.name);
      if (namespaceSource) {
        const symbol = propertyName(node.property, node.computed);
        if (!symbol) {
          unresolved.add(JSON.stringify([
            modulePath, namespaceSource, node.object.name, "DYNAMIC_NAMESPACE_MEMBER",
          ]));
        } else {
          const resolved = resolveImport(modulePath, namespaceSource, symbol);
          if (resolved) visitExport(resolved, symbol);
        }
        if (node.computed) visitNode(modulePath, node.property, node, "property");
        return;
      }
    }
    if (node.type === "Identifier" && referenceIdentifier(node, parent, key)) {
      visitReference(modulePath, node.name);
      return;
    }
    if (node.type === "ImportExpression" ||
        ((node.type === "CallExpression" || node.type === "OptionalCallExpression") &&
          (node.callee?.type === "Import" ||
            (node.callee?.type === "Identifier" && node.callee.name === "require")))) {
      const sourceNode = node.source || node.arguments?.[0];
      const source = staticString(sourceNode);
      if (source && localModuleSource(source)) {
        const resolved = resolveImport(modulePath, source, "*");
        if (!resolved) return;
      } else if (!source && sourceNode) {
        unresolved.add(JSON.stringify([modulePath, "NON_LITERAL_DYNAMIC_IMPORT"]));
      }
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (childKey === "type" || AST_IGNORED_KEYS.has(childKey)) continue;
      if (Array.isArray(child)) {
        for (const item of child) visitNode(modulePath, item, node, childKey);
      } else if (child && typeof child === "object") {
        visitNode(modulePath, child, node, childKey);
      }
    }
  };
  visitExport(routePath, method);
  return {
    edges: [...edges].sort(compare),
    nodes: [...nodes].sort(compare),
    sinks: [...sinks].sort(compare),
    unresolved: [...unresolved].sort(compare),
    binding: [sha, routePath, routeBlob, method],
  };
}

export function exhaustiveHistoricalSafeMethodRouteCallgraphAudit(availableShas) {
  const commitFingerprint = sha256(JSON.stringify(availableShas));
  if (exhaustiveAuditByCommitFingerprint.has(commitFingerprint)) {
    return exhaustiveAuditByCommitFingerprint.get(commitFingerprint);
  }
  const routeBindings = [];
  const uniqueRouteBlobs = new Set();
  const safeHandlerBindings = [];
  const graphNodes = new Set();
  const graphEdges = new Set();
  const writerBindings = [];
  const unresolved = [];
  for (const sha of availableShas) {
    const tree = commitTree(sha);
    const routes = [...tree.entries()]
      .filter(([routePath]) => ROUTE_FILE_PATTERN.test(routePath))
      .sort(([left], [right]) => compare(left, right));
    for (const [routePath, routeBlob] of routes) {
      routeBindings.push([sha, routePath, routeBlob]);
      uniqueRouteBlobs.add(routeBlob);
      for (const method of safeMethodExports(moduleIndex(routeBlob))) {
        const result = auditSafeHandler({ sha, tree, routePath, routeBlob, method });
        safeHandlerBindings.push(result.binding);
        for (const node of result.nodes) graphNodes.add(node);
        for (const edge of result.edges) graphEdges.add(edge);
        if (result.sinks.length) writerBindings.push([...result.binding, result.sinks]);
        for (const item of result.unresolved) unresolved.push([
          sha, routePath, routeBlob, method, JSON.parse(item),
        ]);
      }
    }
  }
  routeBindings.sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
  safeHandlerBindings.sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
  writerBindings.sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
  const routeBlobs = [...uniqueRouteBlobs].sort(compare);
  const nodes = [...graphNodes].sort(compare);
  const edges = [...graphEdges].sort(compare);
  const uniqueWriterRoutes = [...new Set(writerBindings.map((binding) =>
    JSON.stringify(binding.slice(1, 4))))].sort(compare);
  const writerShas = [...new Set(writerBindings.map((binding) => binding[0]))].sort(compare);
  const audit = Object.freeze({
    readyAuditedUniqueCommitCount: availableShas.length,
    routeBindingCount: routeBindings.length,
    routeBindingsFingerprint: sha256(JSON.stringify(routeBindings)),
    uniqueRouteBlobCount: routeBlobs.length,
    uniqueRouteBlobsFingerprint: sha256(JSON.stringify(routeBlobs)),
    explicitSafeHandlerBindingCount: safeHandlerBindings.length,
    explicitSafeHandlerBindingsFingerprint: sha256(JSON.stringify(safeHandlerBindings)),
    reachableCallgraphNodeCount: nodes.length,
    reachableCallgraphNodesFingerprint: sha256(JSON.stringify(nodes)),
    reachableCallgraphEdgeCount: edges.length,
    reachableCallgraphEdgesFingerprint: sha256(JSON.stringify(edges)),
    safeMethodGoogleWriterBindingCount: writerBindings.length,
    safeMethodGoogleWriterBindingsFingerprint: sha256(JSON.stringify(writerBindings)),
    safeMethodGoogleWriterUniqueRouteCount: uniqueWriterRoutes.length,
    safeMethodGoogleWriterUniqueRoutesFingerprint:
      sha256(JSON.stringify(uniqueWriterRoutes)),
    safeMethodGoogleWriterUniqueCommitCount: writerShas.length,
    safeMethodGoogleWriterUniqueCommitsFingerprint: sha256(JSON.stringify(writerShas)),
    safeMethodGoogleWriterPathSummary: countSummary(
      writerBindings.map((binding) => binding[1]),
    ),
    unresolvedReachableCallgraphReferenceCount: unresolved.length,
    writerBindings,
  });
  exhaustiveAuditByCommitFingerprint.set(commitFingerprint, audit);
  return audit;
}

function assertHistoricalBodies() {
  const writer = git(["cat-file", "blob", HISTORICAL_SAFE_METHOD_WRITER_BLOB]);
  if (!/export async function GET\(request\)\s*\{\s*return archiveOperation\(request\);\s*\}/s
    .test(writer) ||
      !/drainScorecardArchiveJobs\(\{\s*maximum:\s*5,\s*stopOnFailure:\s*false\s*\}\)/s
        .test(writer) ||
      !/export async function POST\(request\)/.test(writer)) {
    throw new Error("The reviewed historical safe-method writer blob changed semantics.");
  }
  const successor = git(["cat-file", "blob", HISTORICAL_SAFE_METHOD_405_BLOB]);
  if (!/export async function GET\(request\)\s*\{[\s\S]*?METHOD_NOT_ALLOWED[\s\S]*?status:\s*405[\s\S]*?Allow:\s*"POST"[\s\S]*?\}/
    .test(successor) ||
      !/export async function POST\(request\)\s*\{\s*return archiveOperation\(request\);\s*\}/s
        .test(successor)) {
    throw new Error("The reviewed POST-only successor blob changed semantics.");
  }
}

export function buildHistoricalSafeMethodGoogleWriterEvidence(
  inventoryValue = JSON.parse(readFileSync(INVENTORY_URL, "utf8")),
) {
  const inventory = normalizedInventory(inventoryValue);
  assertHistoricalBodies();
  const ready = inventory.providerRecords.filter((record) => record[7] === "READY");
  const uniqueNonNullShas = [...new Set(ready.map((record) => record[1])
    .filter(Boolean))].sort(compare);
  const commitObjects = batchObjectTypes(uniqueNonNullShas);
  const availableShas = [];
  const unavailableShas = [];
  for (let index = 0; index < uniqueNonNullShas.length; index += 1) {
    const object = commitObjects[index];
    if (object?.objectType === "commit") availableShas.push(uniqueNonNullShas[index]);
    else if (object === null) unavailableShas.push(uniqueNonNullShas[index]);
    else throw new Error("A retained deployment SHA did not resolve to a Git commit.");
  }
  const routeSpecs = availableShas.map((sha) =>
    `${sha}:${HISTORICAL_SAFE_METHOD_WRITER_FILE}`);
  const routeObjects = batchObjectTypes(routeSpecs);
  const routeBlobBySha = new Map();
  for (let index = 0; index < availableShas.length; index += 1) {
    const object = routeObjects[index];
    if (object === null) continue;
    if (object.objectType !== "blob") {
      throw new Error("The historical writer route did not resolve to a Git blob.");
    }
    routeBlobBySha.set(availableShas[index], object.objectId);
  }
  const observedRouteBlobs = [...new Set(routeBlobBySha.values())].sort(compare);
  const expectedRouteBlobs = [
    HISTORICAL_SAFE_METHOD_WRITER_BLOB,
    HISTORICAL_SAFE_METHOD_405_BLOB,
  ].sort(compare);
  if (!exactArray(observedRouteBlobs, expectedRouteBlobs)) {
    throw new Error("An unexplained historical Round Scorecards route blob was present.");
  }
  const availableSet = new Set(availableShas);
  const exhaustiveAudit = exhaustiveHistoricalSafeMethodRouteCallgraphAudit(
    availableShas,
  );
  const { writerBindings: _writerBindings, ...exhaustiveAuditSummary } =
    exhaustiveAudit;
  if (exhaustiveAudit.readyAuditedUniqueCommitCount !== availableShas.length ||
      exhaustiveAudit.unresolvedReachableCallgraphReferenceCount !== 0) {
    throw new Error(
      "The exhaustive historical safe-method route/callgraph audit was incomplete.",
    );
  }
  const affected = ready.filter((record) => availableSet.has(record[1]) &&
    routeBlobBySha.get(record[1]) === HISTORICAL_SAFE_METHOD_WRITER_BLOB);
  const affectedOrigins = [...new Set(affected.map((record) => record[3]))].sort(compare);
  const affectedShas = [...new Set(affected.map((record) => record[1]))].sort(compare);
  if (affected.length !== affectedOrigins.length) {
    throw new Error("Affected READY deployment origins were not one-to-one.");
  }
  const routePresent = ready.filter((record) => availableSet.has(record[1]) &&
    routeBlobBySha.has(record[1]));
  const unresolved = ready.filter((record) => !record[1] || !availableSet.has(record[1]));
  const blockedRequestPaths = [HISTORICAL_SAFE_METHOD_WRITER_REQUEST_PATH];
  const base = {
    schemaVersion: HISTORICAL_SAFE_METHOD_WRITER_SCHEMA,
    originInventorySchemaVersion: inventory.schemaVersion,
    originInventoryProviderRecordCount: inventory.providerRecordCount,
    originInventoryProviderRecordsFingerprint: inventory.providerRecordsFingerprint,
    auditScope: {
      deploymentStatus: "READY",
      routeFile: HISTORICAL_SAFE_METHOD_WRITER_FILE,
      readyRecordCount: ready.length,
      readyUniqueNonNullCommitCount: uniqueNonNullShas.length,
      readyAuditedUniqueCommitCount: availableShas.length,
      readyUnauditableUniqueCommitCount: unavailableShas.length,
      readyUnauditableRecordCount: unresolved.length,
      routePresentRecordCount: routePresent.length,
      routeAbsentRecordCount: ready.length - unresolved.length - routePresent.length,
      observedRouteBlobCount: observedRouteBlobs.length,
      unexplainedRouteBlobCount: 0,
    },
    historicalSafeMethodWriter: {
      routeBlob: HISTORICAL_SAFE_METHOD_WRITER_BLOB,
      operationClass: "MIRROR_ARCHIVE",
      writerIntent: "MIRROR_ARCHIVE",
      externalMutationTarget: "GOOGLE_ROUND_SCORECARDS_WORKSHEET",
      explicitMutatingMethods: ["GET"],
      frameworkDispatchedPotentialMutatingMethods: ["HEAD"],
      optionsMutationObserved: false,
      affectedReadyDeploymentCount: affected.length,
      affectedReadyOriginCount: affectedOrigins.length,
      affectedReadyOriginsFingerprint: sha256(JSON.stringify(affectedOrigins)),
      affectedReadyOrigins: affectedOrigins,
      affectedUniqueCommitCount: affectedShas.length,
      affectedUniqueCommitsFingerprint: sha256(JSON.stringify(affectedShas)),
      deploymentTargetSummary: countSummary(affected.map((record) => record[4])),
      gitBranchSummary: countSummary(affected.map((record) => record[5] ?? null)),
      providerSourceSummary: countSummary(affected.map((record) => record[6] ?? null)),
    },
    postFixRoute: {
      routeBlob: HISTORICAL_SAFE_METHOD_405_BLOB,
      safeMethodBehavior: "GET_405_ALLOW_POST",
      affectedReadyDeploymentCount: routePresent.length - affected.length,
    },
    exhaustiveSafeMethodRouteCallgraphAudit: {
      ...exhaustiveAuditSummary,
      sourceUnresolvedReferenceCount: 0,
      enforcementBoundary:
        "EXACT_LEGACY_DRIVE_PERMISSION_WRITER_TO_READER",
      allDiscoveredBindingsCoveredByPersistentAclFence: true,
    },
    providerFenceContract: {
      blockedRequestPaths,
      blockedRequestPathCount: blockedRequestPaths.length,
      blockedRequestPathsFingerprint: sha256(JSON.stringify(blockedRequestPaths)),
      conditionType: "path",
      conditionOperator: "inc",
      methodScope: "ALL_METHODS",
      conditionGroupRelation: "OR",
      sourceUnresolvedReadyOriginsRemainCoveredByExactHostAllMethodGroup: true,
      policy:
        "EXACT_HISTORICAL_SAFE_METHOD_GOOGLE_WRITER_PATH_REQUIRES_ALL_METHOD_PROJECT_WIDE_DENY",
    },
  };
  if (base.historicalSafeMethodWriter.affectedReadyOriginCount !==
      HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT ||
      base.historicalSafeMethodWriter.affectedReadyOriginsFingerprint !==
        HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT ||
      base.providerFenceContract.blockedRequestPathsFingerprint !==
        HISTORICAL_SAFE_METHOD_WRITER_BLOCKED_PATHS_FINGERPRINT) {
    throw new Error("The historical safe-method writer evidence drifted.");
  }
  return {
    ...base,
    evidenceFingerprint: sha256(JSON.stringify(base)),
  };
}

export function verifyHistoricalSafeMethodGoogleWriterEvidence() {
  const expected = buildHistoricalSafeMethodGoogleWriterEvidence();
  const actual = JSON.parse(readFileSync(EVIDENCE_URL, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("The committed historical safe-method writer evidence is stale.");
  }
  return actual;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  if (process.argv.includes("--write")) {
    writeFileSync(
      EVIDENCE_URL,
      `${JSON.stringify(buildHistoricalSafeMethodGoogleWriterEvidence(), null, 2)}\n`,
      { mode: 0o644 },
    );
  } else {
    verifyHistoricalSafeMethodGoogleWriterEvidence();
  }
}
