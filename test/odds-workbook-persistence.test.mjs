import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatChampionshipOdds } from "../lib/championship-odds-format.js";
import { oddsPersistenceDiagnostics, oddsWorkbookValue } from "../lib/odds-workbook-persistence.js";

test("finite American odds persist as native numbers without presentation formatting", () => {
  assert.equal(oddsWorkbookValue({ probability: 23, americanOdds: "+334" }, { worksheet: "Odds Player Results" }), 334);
  assert.equal(oddsWorkbookValue({ probability: 60, americanOdds: "-150" }, { worksheet: "Odds Team Results" }), -150);
  assert.equal(oddsWorkbookValue({ probability: 0.1, americanOdds: 99_900 }, { worksheet: "Odds Player Results" }), 99_900);
  assert.throws(() => oddsWorkbookValue({ probability: 0.1, americanOdds: "+25,000+" }, { worksheet: "Odds Player Results" }), /no persistence-safe/);
  assert.throws(() => oddsWorkbookValue({ probability: 0.1, americanOdds: "+25,001" }, { worksheet: "Odds Player Results" }), /no persistence-safe/);
});

test("zero-probability non-finite odds persist as blank while probability stays zero", () => {
  const row = { id: "CB01", name: "Clay Beltran", probability: 0, americanOdds: "+∞" };
  assert.equal(oddsWorkbookValue(row, { worksheet: "Odds Player Results" }), "");
  assert.equal(row.probability, 0);
  assert.equal(row.americanOdds, "+∞");
  assert.equal(formatChampionshipOdds(row.americanOdds), "+25,000+");
});

test("100-percent non-finite odds also use a blank numeric reporting cell", () => {
  assert.equal(oddsWorkbookValue({ probability: 100, americanOdds: "-∞" }, { worksheet: "Odds Team Results" }), "");
  assert.throws(() => oddsWorkbookValue({ probability: 10, americanOdds: "+∞" }, { worksheet: "Odds Player Results" }), /no persistence-safe/);
});

test("Preview diagnostics identify every exact non-finite team and player row", () => {
  const diagnostics = oddsPersistenceDiagnostics({
    teams: [{ side: 1, name: "The Pickles", probability: 100, americanOdds: "-∞" }],
    players: [
      { id: "CB01", name: "Clay Beltran", probability: 0, americanOdds: "+∞" },
      { id: "AM01", name: "Alex Monteleone", probability: 20, americanOdds: "+400" },
    ],
  }, formatChampionshipOdds);
  assert.deepEqual(diagnostics, [
    { worksheet: "Odds Team Results", entity: "team", id: 1, name: "The Pickles", probability: 100, rawAmericanOdds: "-∞", runtimeType: "string", finite: false, displayAmericanOdds: "-∞", workbookAmericanOdds: "" },
    { worksheet: "Odds Player Results", entity: "player", id: "CB01", name: "Clay Beltran", probability: 0, rawAmericanOdds: "+∞", runtimeType: "string", finite: false, displayAmericanOdds: "+25,000+", workbookAmericanOdds: "" },
  ]);
});

test("projection publication keeps snapshot presentation data separate from reporting-sheet persistence", async () => {
  const [writer, route] = await Promise.all([
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(writer, /oddsWorkbookValue\(row, \{ worksheet: "Odds Team Results"/);
  assert.match(writer, /oddsWorkbookValue\(row, \{ worksheet: "Odds Player Results"/);
  assert.match(route, /oddsPersistenceDiagnostics\(preview, formatChampionshipOdds\)/);
  assert.match(writer, /"Snapshot JSON": JSON\.stringify\(row\)/);
});
