import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../app/war-room/team-intelligence/TeamIntelligence.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/war-room/team-intelligence/page.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/war-room/team-intelligence/team-intelligence.module.css", import.meta.url), "utf8");

test("Lineup Lab is first, default, and query-addressable", () => {
  assert.match(component, /initialTool = "lineup-lab"/);
  assert.match(component, /const tabs = \[\["lineup-lab", "Lineup Lab"\]/);
  assert.match(component, /url\.searchParams\.set\("tool", key\)/);
  assert.match(component, /popstate/);
  assert.match(page, /params\?\.tool/);
});

test("Lineup Lab only exposes partnership formats", () => {
  const lineupSource = component.slice(component.indexOf("function LineupLab"), component.indexOf("function Rankings"));
  assert.doesNotMatch(lineupSource, /<option value="SI">/);
  assert.match(lineupSource, /<option value="BB">Best Ball/);
  assert.match(lineupSource, /<option value="SC">Scramble/);
});

test("confidence and opponent rows use compact non-wrapping treatments", () => {
  assert.match(component, /function ConfidenceBadge/);
  assert.match(styles, /\.confidenceBadge\{/);
  assert.match(styles, /white-space:nowrap/);
  assert.match(styles, /text-overflow:ellipsis/);
});
