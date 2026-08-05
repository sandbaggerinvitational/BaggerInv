import test from "node:test";
import assert from "node:assert/strict";
import { formatChampionshipOdds, MAX_DISPLAYED_POSITIVE_ODDS } from "../lib/championship-odds-format.js";

test("Championship odds remain exact through the approved display threshold", () => {
  assert.equal(MAX_DISPLAYED_POSITIVE_ODDS, 25_000);
  assert.equal(formatChampionshipOdds("+454"), "+454");
  assert.equal(formatChampionshipOdds("+25000"), "+25,000");
  assert.equal(formatChampionshipOdds("-150"), "-150");
});

test("Championship odds above the threshold use a presentation-only abbreviation", () => {
  assert.equal(formatChampionshipOdds("+25001"), "+25,000+");
  assert.equal(formatChampionshipOdds("+80981"), "+25,000+");
  assert.equal(formatChampionshipOdds("+∞"), "+25,000+");
});

test("Opening and Round 2 examples retain their underlying exact odds", () => {
  const opening = { probability: 0.12, americanOdds: "+80981" };
  const roundTwo = { probability: 18.1, americanOdds: "+454" };
  assert.equal(formatChampionshipOdds(opening.americanOdds), "+25,000+");
  assert.equal(formatChampionshipOdds(roundTwo.americanOdds), "+454");
  assert.deepEqual([opening.probability, opening.americanOdds, roundTwo.probability, roundTwo.americanOdds], [0.12, "+80981", 18.1, "+454"]);
});
