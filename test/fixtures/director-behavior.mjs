import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { netSkinsConfigurationReadiness } from "../../lib/net-skins-configuration-readiness.js";
const require = createRequire(import.meta.url);

// Execute the real route/component source with isolated dependencies, never a server.
export async function loadDirectorSource(path, dependencies) {
  const filename = new URL(`../../${path}`, import.meta.url);
  const { code } = await require("next/dist/build/swc").transform(await readFile(filename, "utf8"), {
    filename: filename.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true },
      transform: { react: { runtime: "classic", pragma: "__jsx" } }, target: "es2022" }, module: { type: "commonjs" },
  });
  const module = { exports: {} };
  const resolve = key => {
    if (!(key in dependencies)) throw new Error(`Unstubbed dependency: ${key}`);
    return dependencies[key];
  };
  new Function("require", "module", "exports", "__jsx", code)(resolve, module, module.exports,
    (type, props, ...children) => ({ type, props: { ...props, children } }));
  return module.exports;
}

export function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}
export function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" ? text(tree.props?.children) : String(tree ?? "");
}
export async function netSkinsHarness(entryState) {
  const cells = []; let cursor = 0;
  const hooks = {
    useState: initial => { const i = cursor++; if (!(i in cells)) cells[i] = i === 0 ? entryState : initial;
      return [cells[i], value => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; },
    useRef: value => ({ current: value }), useCallback: fn => fn, useMemo: fn => fn(), useEffect: () => {},
  };
  const deps = { react: hooks,
    "../../../lib/net-skins-configuration-readiness.js": { netSkinsConfigurationReadiness },
    "../../../lib/client-mutation-operation-identity.js": {}, "./production-director.module.css": {} };
  for (const name of ["ProductionDraftEditor", "ProductionGuideEditor", "ProductionPredictionSettingsEditor", "ProductionNetSkinsEntries", "ProductionOddsSnapshotReview", "CalcuttaManagementEditor"]) deps[`./${name}.js`] = () => null;
  const { NetSkinsCard } = await loadDirectorSource("app/admin/director/ProductionDirectorOperations.js", deps);
  let refreshes = 0;
  return { cells, render(readiness) { cursor = 0; return NetSkinsCard({ data: { publications: { netSkins: { state: "NOT_CONFIGURED", configurationRevision: 0 } },
    privateOperations: { netSkins: { readiness } } }, refresh: async () => { refreshes++; } }); },
    get refreshes() { return refreshes; } };
}

export const savedEntryState = { phase: "ready", rounds: [
  { roundNumber: 1, configured: true, state: "ENTRIES_SAVED", revision: 2, enteredCount: 4 },
  { roundNumber: 3, configured: false, state: "WAITING_FOR_PAIRINGS", revision: 0, enteredCount: 0 },
] };
