import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("advanced analytics contain their intrinsic table width locally", async () => {
  const [component, css] = await Promise.all([
    source("app/statistics/AdvancedTable.js"),
    source("app/historical.module.css"),
  ]);

  assert.match(component, /className=\{styles\.advancedTableWrap\}/);
  assert.match(component, /role="region"/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(css, /\.advancedStatsStack,\s*\.advancedStatSection\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.advancedTableWrap\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*overflow-x:\s*auto;/s);
  assert.match(css, /\.advancedTable\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*820px;/s);
  assert.match(css, /overscroll-behavior-inline:\s*contain/);
  assert.doesNotMatch(css, /(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/s);
});

test("advanced analytics use native table semantics with meaningful headers", async () => {
  const component = await source("app/statistics/AdvancedTable.js");

  assert.match(component, /<table[\s\S]*<caption[\s\S]*<thead>[\s\S]*<tbody>/);
  assert.match(component, /<th key=\{header\} scope="col">/);
  assert.match(component, /<tr className=\{styles\.advancedTableRow\}>/);
  assert.match(component, /<th scope="row">\{child\}<\/th>/);
  assert.match(component, /<td>\{child\}<\/td>/);
  assert.doesNotMatch(component, /role="(?:table|rowgroup|row|columnheader|rowheader|cell)"/);
});

test("every AdvancedTable consumer supplies a specific accessible label", async () => {
  const routes = [
    "app/statistics/partnerships/page.js",
    "app/statistics/handicaps/page.js",
    "app/statistics/rivalries/page.js",
  ];

  for (const route of routes) {
    const page = await source(route);
    const tables = page.match(/<AdvancedTable\b/g) || [];
    const labels = page.match(/<AdvancedTable\s+label=/g) || [];
    assert.equal(labels.length, tables.length, route);
    assert.match(page, /<Header \/>/, route);
    assert.match(page, /<Footer \/>/, route);
    assert.match(page, /data-secondary-history-source=\{useSupabase \? "supabase" : "google"\}/, route);
  }
});
