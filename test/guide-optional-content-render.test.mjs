import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "next/dist/build/swc/index.js";

const blank = () => null;
const chrome = { Header: blank, Footer: blank, AssetImage: blank,
  Link: ({ href, children }) => React.createElement("a", { href }, children), styles: new Proxy({}, { get: (_, key) => String(key) }) };
// Render real Guide JSX; only Next routing, unrelated chrome and the read loader
// are injected. Content selection and Guide presentation helpers run unchanged.
async function component(path, name, overrides = {}) {
  const url = new URL(path, import.meta.url);
  let source = await readFile(url, "utf8");
  const bindings = { React, ...chrome, ...overrides };
  for (const match of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/gm)) {
    const [, names, location] = match;
    if (names.startsWith("{") && location.includes("/lib/")) {
      const keys = names.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
      if (keys.some(key => !(key in bindings))) {
        const module = await import(new URL(location.endsWith(".js") ? location : `${location}.js`, url));
        for (const key of keys) if (!(key in bindings)) bindings[key] = module[key];
      }
    }
  }
  source = source.replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];/gm, "")
    .replace(/export default /g, "").replace(/export const /g, "const ");
  const compiled = await transform(source, { jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  return new Function(...Object.keys(bindings), `${compiled.code}; return ${name};`)(...Object.values(bindings));
}
function minimumContent() {
  return {
    tournamentIdentity: { id: "2026", year: 2026, name: "Test Invitational", editionTitle: "10th Annual", dates: "September 25–26", location: "Kiawah", timeZone: "America/New_York" },
    tournament: { "Tournament Name": "Test Invitational" },
    overview: [], timelineRows: [], ruleBook: [], dining: [], localGuide: [], importantContacts: [],
    schedule: [{ "Event ID": "welcome", "Event Date": "2026-09-25", "Start Time": "07:30", Title: "Welcome", "Event Type": "Social", "Day Label": "Friday", "Display Order": "1", Status: "Published" }],
    courses: ["TPGC01", "CPGC01", "OCGC01"].map((id, i) => ({ "Course ID": id, Round: String(i + 1), Course: id })),
    rounds: ["BB", "SC", "SI"].map(id => ({ "Format ID": id, Name: id, "Team Size": id === "SI" ? "1" : "2" })),
    tournamentRules: ["BB", "SC", "SI"].map((id, i) => ({ Round: String(i + 1), Format: id, "Points Available": id === "SI" ? "1" : "3" })),
  };
}

test("real public Guide omits empty optional navigation/cards and preserves itinerary and three format cards", async () => {
  const PublicGuide = await component("../app/tournament-guide/PublicTournamentGuide.js", "PublicTournamentGuide");
  const html = renderToStaticMarkup(React.createElement(PublicGuide, { content: minimumContent() }));
  assert.match(html, /Welcome/);
  assert.match(html, /3 courses/);
  for (const round of [1, 2, 3]) assert.match(html, new RegExp(`Round ${round}`));
  assert.doesNotMatch(html, /href="#(?:dining|local-guide|contacts)"|id="(?:dining|local-guide|contacts)"/);
  assert.doesNotMatch(html, /<details|No content|will appear here|undefined|NaN/);
});

test("real participant directory exposes only populated destinations, retaining public/PWA routing", async () => {
  const Guide = await component("../app/tournament-guide/page.js", "TournamentGuidePage", {
    applicationPageEnvironment: async () => ({}), resolveTournamentGuideContent: async () => minimumContent(),
    pageMetadata: value => value, TournamentGuideHero: blank, GuideDirectoryIcon: blank,
    PublicTournamentGuide: blank, redirect: () => { throw new Error("Unexpected redirect"); },
  });
  const html = renderToStaticMarkup(await Guide({ participantPresentation: true, searchParams: {} }));
  for (const link of ["/app/guide/schedule", "/app/courses", "/app/guide/rules"]) assert.ok(html.includes(`href="${link}"`));
  assert.doesNotMatch(html, /Dining|Local Guide|Important Contacts|href="\/tournament-guide/);
});

test("real private partial preview omits unused domains without requiring prose on course/format records", async () => {
  const source = await readFile(new URL("../app/admin/director/ProductionGuideEditor.js", import.meta.url), "utf8");
  const definitions = source.slice(source.indexOf("const field ="), source.indexOf("const EMPTY_CONTENT"));
  const preview = source.slice(source.indexOf("function Preview("), source.indexOf("export default function"));
  const compiled = await transform(`${definitions}\n${preview}`, { jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "classic" } } } });
  const Preview = new Function("React", "useRef", "useEffect", "clean", "styles", `${compiled.code}; return Preview;`)(React, React.useRef, React.useEffect, value => String(value ?? "").trim(), {});
  const html = renderToStaticMarkup(React.createElement(Preview, { content: minimumContent(), onClose: blank }));
  assert.match(html, /DRAFT PREVIEW/);
  assert.match(html, /Welcome/);
  assert.match(html, /Courses/);
  assert.doesNotMatch(html, /<h3>(?:Sections|Timeline|Rule Book|Dining|Local Guide|Important Contacts)<\/h3>|No content in this section|Incomplete draft item/);
});
