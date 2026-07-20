import test from "node:test";import assert from "node:assert/strict";import {americanOdds} from "../lib/tournament-odds.js";
test("converts probabilities to American odds",()=>{assert.equal(americanOdds(50),"+100");assert.equal(americanOdds(40),"+150");assert.equal(americanOdds(25),"+300");assert.equal(americanOdds(60),"-150");});
