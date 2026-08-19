import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  localGuideDirections,
  localGuideGroupDefaultOpen,
  localGuideGroups,
  localGuidePhone,
  localGuideRecordIcon,
  localGuideSectionIcon,
  localGuideViewModel,
  localGuideWebsite,
  normalizeLocalGuideSection,
  unknownLocalGuideSections,
} from "../lib/tournament-guide-local.js";

const records = [
  { Year: 2026, Section: "Medical", Title: "Urgent Care", Description: "Nearest walk-in clinic.", Address: "10 Main St", Phone: "(843) 555-1212", Website: "https://example.com/clinic", "Sort Order": 3 },
  { Year: 2026, Section: "Transportation", Title: "Tournament Shuttle", Description: "Runs between the resort and courses.", Phone: "843-555-0100", "Sort Order": 1 },
  { Year: 2026, Section: "Transportation", Title: "Airport Transfer", Description: "Advance booking recommended.", Address: "Charleston International Airport", "Sort Order": 2 },
];

test("Local Guide normalizes source sections into the annual participant hierarchy without dropping rows", () => {
  const groups = localGuideGroups(localGuideViewModel(records));
  assert.deepEqual([...groups.keys()], ["Transportation", "Medical & Emergency"]);
  assert.deepEqual(groups.get("Transportation").map((record) => record.title), ["Tournament Shuttle", "Airport Transfer"]);
  assert.equal([...groups.values()].flat().length, records.length);
  assert.equal(normalizeLocalGuideSection("Aiport"), "Airport & Hotel");
  assert.equal(normalizeLocalGuideSection("Resort"), "Airport & Hotel");
  assert.equal(normalizeLocalGuideSection("Pharmacy"), "Essentials");
  assert.equal(normalizeLocalGuideSection("Police"), "Medical & Emergency");
  assert.equal(normalizeLocalGuideSection("Future Recommendation"), "Other");
  assert.deepEqual(unknownLocalGuideSections([{ Section: "Future Recommendation" }, { Section: "Fuel" }]), ["Future Recommendation"]);
  assert.equal(localGuideGroupDefaultOpen("Transportation"), false);
  assert.equal(localGuideGroupDefaultOpen("Airport & Hotel"), false);
  assert.equal(localGuideGroupDefaultOpen("Essentials"), false);
  assert.equal(localGuideGroupDefaultOpen("Medical & Emergency"), false);
  assert.equal(localGuideGroupDefaultOpen("Other"), false);
});

test("Local Guide creates native maps and telephone actions safely", () => {
  assert.equal(localGuideDirections("10 Main St, Kiawah Island"), "https://maps.apple.com/?daddr=10%20Main%20St%2C%20Kiawah%20Island");
  assert.equal(localGuidePhone("(843) 555-1212"), "tel:8435551212");
  assert.equal(localGuideWebsite("Www.kiawahisland.com"), "https://Www.kiawahisland.com");
  assert.equal(localGuideWebsite("https://example.com"), "https://example.com");
  assert.equal(localGuideSectionIcon("Medical"), "🏥");
  assert.equal(localGuideSectionIcon("Transportation"), "🚐");
  assert.equal(localGuideSectionIcon("Airport"), "✈️");
  assert.equal(localGuideSectionIcon("Aiport"), "✈️");
  assert.equal(localGuideRecordIcon("Tournament Shuttle"), "🚌");
  assert.equal(localGuideRecordIcon("Airport Transfer"), "");
  assert.equal(localGuideSectionIcon("Unknown"), "📍");
});

test("Local Guide treats whitespace-only descriptions as absent", () => {
  const [resource] = localGuideViewModel([{
    Year: 2027,
    Section: "Transportation",
    Title: "Future Shuttle",
    Description: "  \n\t  ",
    Phone: "843-555-0100",
    "Sort Order": 1,
  }]);
  assert.equal(resource.description, "");
  assert.equal(resource.phone, "843-555-0100");
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
  assert.match(component, /groups\.size \?/);
  assert.match(component, /<h1>Local Guide<\/h1>/);
  assert.match(component, /localGuideSectionIcon\(section\)/);
  assert.match(component, /localGuideRecordIcon\(record\.title\)/);
  assert.match(component, /<details className=\{styles\.localGuideGroup\}/);
  assert.match(component, /open=\{localGuideGroupDefaultOpen\(section\)\}/);
  assert.match(component, /<summary><h2>/);
  assert.match(component, /visuallyHidden/);
  assert.match(component, /Local information is being prepared\./);
  assert.match(component, /<ExternalLinkConfirm href=\{localGuideWebsite\(record\.website\)\}/);
  assert.match(component, /localGuideDirections\(record\.address\)/);
  assert.match(component, /localGuidePhone\(record\.phone\)/);
  assert.match(normalized, /fetchOptionalSheet\("Local Guide"\)/);
  assert.match(normalized, /localGuideRows[\s\S]*recordMatchesTournament\(row, guideTournament\)/);
  assert.match(css, /@media\(max-width:700px\)\{\.localGuideGroup>div\{grid-template-columns:1fr\}\}/);
  assert.match(css, /width:36px;height:36px/);
  assert.match(css, /\.localGuideCard\{[^}]*gap:11px[^}]*align-content:start[^}]*padding:14px/);
  assert.match(css, /\.localGuideActions>a\{[^}]*flex:0 0 auto[^}]*min-height:44px[^}]*padding:0 9px/);
  assert.doesNotMatch(css, /\.localGuideActions>a\{[^}]*flex:0 0 100px/);
});
