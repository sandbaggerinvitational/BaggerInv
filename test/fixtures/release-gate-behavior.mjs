import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const source = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

// Evaluate actual source fragments, not a duplicated implementation. Missing or
// ambiguous boundaries fail the test. All transport/context dependencies are
// supplied explicitly by the test; this harness never opens a server.
export function between(value, start, end) {
  const index = value.indexOf(start);
  assert.ok(index >= 0, `Missing source boundary: ${start}`);
  const finish = value.indexOf(end, index + start.length);
  assert.ok(finish >= 0, `Missing source boundary: ${end}`);
  return value.slice(index, finish);
}
export function declaration(value, name) {
  const pattern = new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^}`, "m");
  const match = value.match(pattern);
  assert.ok(match, `Missing function: ${name}`);
  return match[0].replace(/^export /, "");
}
export async function evaluate(code, bindings = {}) {
  const compiled = await require("next/dist/build/swc").transform(`module.exports = function() {\n${code}\n};`, {
    filename: "release-gate-fixture.jsx",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022",
      transform: { react: { runtime: "classic", pragma: "__jsx", pragmaFrag: "__Fragment" } } },
    module: { type: "commonjs" },
  });
  const module = { exports: null };
  new Function(...Object.keys(bindings), "__jsx", "__Fragment", "module", compiled.code)(
    ...Object.values(bindings), (type, props, ...children) => ({ type, props: { ...props, children } }), "fragment", module);
  return module.exports();
}
export const css = new Proxy({}, { get: (_, key) => String(key) });
export const hooks = { useState: value => [typeof value === "function" ? value() : value, () => {}],
  useMemo: fn => fn(), useEffect: () => {}, useCallback: fn => fn, useRef: value => ({ current: value }) };

export async function historyHrefContract(path, name = "historyPresentationHref") {
  const code = await source(path);
  const fn = between(code, `const ${name} =`, "\n};") + "\n};";
  const resolve = await evaluate(`${fn}\nreturn ${name};`);
  const expected = [["/history/2026", "/app/history/2026"],
    ["/players/test", name === "coursePresentationHref" ? "/players/test" : "/app/players/test"],
    ["/courses/C1?year=2026", path.includes("/team/") ? "/courses/C1?year=2026" : "/app/courses/C1?year=2026"]];
  for (const [input, output] of expected) {
    assert.equal(resolve(input, false), input);
    assert.equal(resolve(input, true), output);
  }
  return resolve;
}

export async function leaderboardVisibilityContract(code) {
  const { leaderboardModulesForNetSkinsState } = await import("../../lib/leaderboards-navigation.js");
  const expression = code.match(/const leaderboardModules = ([^;]+);/);
  assert.ok(expression);
  assert.match(code, /leaderboardModules\.map/);
  for (const [state, expected] of [[null, ["players", "teams", "insights"]], [{ state: "NOT_CONFIGURED", visible: false }, ["players", "teams", "insights"]], [{ state: "CONFIGURED", visible: true }, ["players", "teams", "skins", "insights"]]]) {
    const actual = await evaluate(`return ${expression[1]};`, { leaderboardModulesForNetSkinsState, netSkinsState: state, productionNetSkinsV1: true });
    assert.deepEqual(actual.map(item => item.value), expected);
  }
}

export async function taglineContract(code) {
  const { TOURNAMENT_2026_TAGLINE } = await import("../../lib/site-config.js");
  assert.equal(TOURNAMENT_2026_TAGLINE, "24 Players. 3 Rounds. 2 Teams. 1 Trophy.");
  const match = code.match(/<(span|div)(?: className="sideMenuFooter")?>\{TOURNAMENT_2026_TAGLINE\}<\/\1>/);
  assert.ok(match, "canonical tagline must be rendered");
  const node = await evaluate(`return (${match[0]});`, { TOURNAMENT_2026_TAGLINE });
  assert.deepEqual(node.props.children, [TOURNAMENT_2026_TAGLINE]);
}

export async function publicMenuContract(menu) {
  const fragment = between(menu, "  const publicOverlay =", "\n  return (");
  for (const appShell of [false, true]) for (const isOpen of [false, true]) {
    let portals = 0;
    const result = await evaluate(`${fragment}\nreturn publicOverlay;`, {
      appShell, isOpen, publicOverlayRoot: "portal-root", publicDialog: {}, siteContent: "public-navigation", setIsOpen: () => {},
      createPortal: (tree, root) => { portals++; assert.equal(root, "portal-root"); return tree; },
    });
    assert.equal(portals, appShell ? 0 : 1);
    if (appShell) assert.equal(result, null);
    else {
      const { elements } = await import("./director-behavior.mjs");
      const dialog = elements(result).find(node => node.props.role === "dialog");
      assert.equal(dialog.props["aria-modal"], "true");
      assert.equal(dialog.props["aria-hidden"], !isOpen);
      assert.deepEqual(dialog.props.children, ["public-navigation"]);
    }
  }
  assert.match(menu, /appShell[\s\S]*\? <Sheet[\s\S]*: publicOverlay/);
}

export async function supabasePageContract(path = "app/live/page.js") {
  const { loadDirectorSource, elements } = await import("./director-behavior.mjs");
  const prefix = path.startsWith("app/app/") ? "../../" : "../";
  const lib = path.startsWith("app/app/") ? "../../../lib/" : "../../lib/";
  let reads = 0, selection = "supabase";
  const deps = {
    [prefix + "PreviewModeBadge" + (prefix === "../../" ? ".js" : "")]: "PreviewModeBadge",
    [lib + "production-shadow-request-environment" + (prefix === "../../" ? ".js" : "")]: { applicationPageEnvironment: async () => ({ VERCEL_ENV: "preview" }) },
    [lib + "workbookInitializationMessage"]: {},
  };
  if (prefix === "../") Object.assign(deps, {
    "../components": { Header: "Header", Footer: "Footer" }, "./MatchCenter": "MatchCenter",
    "./TournamentSupabaseRead": "TournamentSupabaseRead", "./sheetData": { getTournamentData: async () => { reads++; return {}; } },
    [lib + "seo"]: { pageMetadata: () => ({}) }, [lib + "tournament-read-source"]: { requireTournamentReadSource: () => ({ resolved: selection }) },
    [lib + "tournament-workbook-initialization"]: { workbookInitializationMessage: () => "unavailable" },
    [lib + "leaderboards-navigation"]: { isLegacyCalcuttaModule: value => value === "calcutta" }, "next/navigation": { redirect: url => { throw new Error(`redirect:${url}`); } },
  });
  else Object.assign(deps, {
    "../../live/LeaderboardsDashboard.js": "LeaderboardsDashboard", "../../live/LeaderboardsSupabaseRead.js": "LeaderboardsSupabaseRead",
    "../../live/sheetData.js": { getTournamentData: async () => { reads++; return {}; } },
    [lib + "leaderboards-core-read-source.js"]: { requireLeaderboardsCoreReadSource: () => ({ resolved: selection }) },
    [lib + "net-skins-read-source.js"]: { requireNetSkinsReadSource: () => ({ resolved: "supabase", productionCutover: { handled: true } }) },
    [lib + "tournament-workbook-initialization.js"]: { workbookInitializationMessage: () => "unavailable" },
  });
  const page = (await loadDirectorSource(path, deps)).default;
  for (const view of ["", "points", "scores", "leaderboards", "calcutta"]) {
    const tree = await page({ searchParams: Promise.resolve({ view }) });
    const component = elements(tree).find(node => node.type === (prefix === "../" ? "TournamentSupabaseRead" : "LeaderboardsSupabaseRead"));
    assert.ok(component, view);
    if (prefix === "../") assert.equal(component.props.initialView, view);
    else assert.equal(component.props.netSkinsReadSource, "supabase");
  }
  assert.equal(reads, 0, "Supabase selection must never call Google");
  selection = "google";
  await page({ searchParams: Promise.resolve({}) });
  assert.equal(reads, 1, "only explicitly selected legacy source may load Google");
}
