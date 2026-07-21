import test from "node:test";
import assert from "node:assert/strict";
import {
  informationForSection,
  paragraphs,
  publicGuideRecords,
  sectionSlug,
  visibleGuideSections,
} from "../lib/tournament-guide.js";

const tournament = { id: "SBI-2026", year: 2026 };

test("public guide exposes only published non-sensitive tournament records", () => {
  const records = [
    { "Item ID": "3", "Tournament ID": "SBI-2026", Status: "Published", Sensitive: "FALSE", "Display Order": "30" },
    { "Item ID": "1", "Tournament ID": "SBI-2026", Status: "Published", Sensitive: "FALSE", "Display Order": "10" },
    { "Item ID": "2", "Tournament ID": "SBI-2026", Status: "Draft", Sensitive: "FALSE", "Display Order": "20" },
    { "Item ID": "4", "Tournament ID": "SBI-2026", Status: "Published", Sensitive: "TRUE", "Display Order": "5" },
    { "Item ID": "5", "Tournament ID": "SBI-2025", Status: "Published", Sensitive: "FALSE", "Display Order": "1" },
  ];
  assert.deepEqual(publicGuideRecords(records, tournament).map((row) => row["Item ID"]), ["1", "3"]);
});

test("guide matching supports the tournament year during ID migration", () => {
  const records = [{ "Item ID": "1", "Tournament ID": "2026", Status: "Published" }];
  assert.equal(publicGuideRecords(records, tournament).length, 1);
});

test("section names normalize into stable public slugs", () => {
  assert.equal(sectionSlug("Calcutta & Skins"), "calcutta-skins");
  assert.equal(sectionSlug("Important Information"), "important-information");
});

test("paragraph breaks are preserved without interpreting HTML", () => {
  assert.deepEqual(paragraphs("First paragraph.\n\n<script>alert(1)</script>"), ["First paragraph.", "<script>alert(1)</script>"]);
});

test("empty optional sections are removed from navigation", () => {
  const data = { itinerary: [], rules: [], information: [{ Section: "Golf Genius" }] };
  assert.deepEqual(visibleGuideSections(data).map(([slug]) => slug), ["overview", "golf-genius"]);
  assert.equal(informationForSection(data.information, "golf-genius").length, 1);
});
