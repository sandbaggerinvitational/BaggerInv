import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localGuideDirections, localGuideGroups, localGuidePhone, localGuideSectionIcon, localGuideViewModel } from "../lib/tournament-guide-local.js";

const records = [
  { Year: 2026, Section: "Medical", Title: "Urgent Care", Description: "Nearest walk-in clinic.", Address: "10 Main St", Phone: "(843) 555-1212", Website: "https://example.com/clinic", "Sort Order": 3 },
  { Year: 2026, Section: "Transportation", Title: "Tournament Shuttle", Description: "Runs between the resort and courses.", Phone: "843-555-0100", "Sort Order": 1 },
  { Year: 2026, Section: "Transportation", Title: "Airport Transfer", Description: "Advance booking recommended.", Address: "Charleston International Airport", "Sort Order": 2 },
];

test("Local Guide groups records by Section and preserves workbook Sort Order", () => {
  const groups = localGuideGroups(localGuideViewModel(records));
  assert.deepEqual([...groups.keys()], ["Transportation", "Medical"]);
  assert.deepEqual(groups.get("Transportation").map((record) => record.title), ["Tournament Shuttle", "Airport Transfer"]);
});

test("Local Guide creates native maps and telephone actions safely", () => {
  assert.equal(localGuideDirections("10 Main St, Kiawah Island"), "https://maps.apple.com/?daddr=10%20Main%20St%2C%20Kiawah%20Island");
  assert.equal(localGuidePhone("(843) 555-1212"), "tel:8435551212");
  assert.equal(localGuideSectionIcon("Medical"), "🏥");
  assert.equal(localGuideSectionIcon("Unknown"), "📍");
});

test("Local Guide uses only approved workbook fields and data-backed actions", async () => {
  const [component, model, normalized, schema, css] = await Promise.all([
    readFile(new URL("../app/tournament-guide/LocalGuide.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-guide-local.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-guide-content.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/tournament-guide.module.css", import.meta.url), "utf8"),
  ]);
  for (const field of ["Year", "Section", "Title", "Description", "Address", "Phone", "Website", "Sort Order"]) {
    const pattern = new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.match(model, pattern);
    assert.match(schema, pattern);
  }
  assert.match(component, /record\.address \?/);
  assert.match(component, /record\.phone \?/);
  assert.match(component, /record\.website \?/);
  assert.match(component, /<ExternalLinkConfirm href=\{record\.website\}/);
  assert.match(component, /localGuideDirections\(record\.address\)/);
  assert.match(component, /localGuidePhone\(record\.phone\)/);
  assert.match(normalized, /fetchOptionalSheet\("Local Guide"\)/);
  assert.match(normalized, /localGuideRows[\s\S]*recordMatchesTournament\(row, guideTournament\)/);
  assert.match(css, /@media\(max-width:700px\)\{\.localGuideSections>section>div\{grid-template-columns:1fr\}\}/);
});
