import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mobileCalcuttaRepresentationRevision } from "../lib/mobile-v1-calcutta.js";

const schemaUrl = new URL("../contracts/mobile/v1/calcutta.schema.json", import.meta.url);
const readmeUrl = new URL("../contracts/mobile/v1/README.md", import.meta.url);
const nativeSpecUrl = new URL("../docs/native-ios/native-product-screen-spec.md", import.meta.url);

const expectedStates = [
  "NOT_CONFIGURED",
  "CONFIGURED",
  "AUCTION_COMPLETE",
  "IN_PROGRESS",
  "OFFICIAL",
  "UNAVAILABLE",
];

async function schema() {
  return JSON.parse(await readFile(schemaUrl, "utf8"));
}

function propertyNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => propertyNames(entry, names));
    return names;
  }
  if (!value || typeof value !== "object") return names;
  if (value.properties && typeof value.properties === "object") {
    Object.keys(value.properties).forEach((name) => names.add(name));
  }
  Object.values(value).forEach((entry) => propertyNames(entry, names));
  return names;
}

test("Calcutta defines one additive mobile-v1 envelope with the exact lifecycle and separate publication state", async () => {
  const contract = await schema();
  assert.equal(contract.$id, "urn:bagger:mobile:v1:calcutta");
  assert.deepEqual(contract.required, ["ok", "apiVersion", "data", "meta"]);
  assert.equal(contract.properties.ok.const, true);
  assert.equal(contract.properties.apiVersion.const, "v1");
  assert.equal(contract.properties.data.properties.contractVersion.const, "production-calcutta-v1");
  assert.deepEqual(contract.$defs.state.enum, expectedStates);
  assert.deepEqual(contract.$defs.publicationState.enum, ["UNPUBLISHED", "PUBLISHED"]);
  assert.equal(contract.$defs.state.enum.includes("AUCTION_OPEN"), false);
  assert.equal(contract.properties.data.properties.publicationState.$ref, "#/$defs/publicationState");
  assert.equal(contract.properties.data.properties.published.type, "boolean");
  assert.equal(contract.properties.meta.$ref, "shared.schema.json#/$defs/meta");
});

test("Calcutta revision, publication, and stale-result rules are explicit and fail closed", async () => {
  const contract = await schema();
  const data = contract.properties.data;
  const revision = new RegExp(data.properties.revision.pattern);
  assert.equal(revision.test("calcutta-v1:4:7:2:9:IN_PROGRESS:PUBLISHED"), true);
  assert.equal(revision.test("calcutta-v1:4:7:2:0:AUCTION_COMPLETE:UNPUBLISHED"), true);
  assert.equal(revision.test("calcutta-v1:4:7:2:9:AUCTION_OPEN:PUBLISHED"), false);
  assert.equal(revision.test("calcutta-v1:4:7:2:9:IN_PROGRESS"), false);

  const conditionalContract = JSON.stringify(data.allOf);
  for (const value of [
    "UNPUBLISHED", "PUBLISHED", "NOT_CONFIGURED", "CONFIGURED",
    "IN_PROGRESS", "OFFICIAL", "UNAVAILABLE",
  ]) assert.match(conditionalContract, new RegExp(value));
  assert.match(conditionalContract, /"market":\{"type":"null"\}/);
  assert.match(conditionalContract, /"result":\{"type":"null"\}/);
  assert.match(conditionalContract, /"tournamentComplete":\{"const":true\}/);
  assert.match(conditionalContract, /"tournamentComplete":\{"const":false\}/);
  const publishedResultGate = data.allOf.find((condition) =>
    condition.if?.allOf?.some((part) => part.properties?.state?.enum?.includes("IN_PROGRESS")));
  assert.equal(
    publishedResultGate.if.allOf.some((part) => part.properties?.publicationState?.const === "PUBLISHED"),
    true,
  );
  assert.equal(data.allOf.some((condition) =>
    condition.if?.properties?.state?.enum?.includes("IN_PROGRESS") &&
    condition.then?.properties?.publicationState?.const === "PUBLISHED"), false,
  "lifecycle alone must not force publication");
  const visibleResultGate = data.allOf.find((condition) => condition.if?.properties?.result?.type === "object");
  assert.equal(visibleResultGate.then.properties.resultRevision.type, "integer");
  assert.equal(Object.hasOwn(visibleResultGate, "else"), false, "hidden canonical result revision may be retained");
  const preAuctionGate = data.allOf.find((condition) =>
    condition.if?.properties?.state?.enum?.includes("CONFIGURED"));
  assert.equal(preAuctionGate.then.properties.auctionRevision.const, 0);
  assert.equal(preAuctionGate.then.properties.auctionFingerprint.type, "null");
  assert.equal(preAuctionGate.then.properties.resultRevision.type, "null");

  assert.deepEqual(contract.$defs.freshness.required, [
    "stale", "updating", "configuredAt", "auctionUpdatedAt",
    "publishedAt", "calculatedAt", "sourceFingerprint",
  ]);
  assert.equal(contract.$defs.freshness.properties.stale.type, "boolean");
  assert.equal(contract.$defs.freshness.properties.updating.type, "boolean");
});

test("Calcutta ETag revision changes when source freshness changes without a domain revision", () => {
  const base = {
    revision: "calcutta-v1:2:1:2:7:IN_PROGRESS:PUBLISHED",
    freshness: {
      sourceFingerprint: "a".repeat(64),
      stale: false,
      updating: false,
    },
  };
  const current = mobileCalcuttaRepresentationRevision(base);
  assert.match(current, /^[0-9a-f]{64}$/);
  assert.notEqual(mobileCalcuttaRepresentationRevision({
    ...base,
    freshness: { ...base.freshness, sourceFingerprint: "b".repeat(64), stale: true, updating: true },
  }), current);
  assert.notEqual(mobileCalcuttaRepresentationRevision({
    ...base,
    freshness: { ...base.freshness, stale: true, updating: true },
  }), current);
});

test("Calcutta money is canonical decimal-string USD and never a cent-rounded or floating authority", async () => {
  const contract = await schema();
  assert.equal(contract.properties.data.properties.currencyCode.const, "USD");

  const decimal = new RegExp(contract.$defs.decimal.pattern);
  const nonnegative = new RegExp(contract.$defs.nonnegativeDecimal.pattern);
  const ownership = new RegExp(contract.$defs.ownershipFraction.pattern);
  for (const value of ["0", "25", "118.125", "0.3333333333333333"]) {
    assert.equal(decimal.test(value), true);
    assert.equal(nonnegative.test(value), true);
  }
  assert.equal(decimal.test("-118.125"), true);
  for (const invalid of ["$118.125", "1,000", "1e3", "+25", " 25 "]) {
    assert.equal(decimal.test(invalid), false);
    assert.equal(nonnegative.test(invalid), false);
  }
  assert.equal(nonnegative.test("-0.01"), false);
  assert.equal(contract.$defs.decimal.type, "string");
  assert.equal(contract.$defs.nonnegativeDecimal.type, "string");
  for (const value of ["1", "0.5", "0.0001"]) assert.equal(ownership.test(value), true);
  for (const invalid of ["0", "1.0", "1.01", "2", "0.50"]) assert.equal(ownership.test(invalid), false);
  assert.equal(contract.$defs.owner.properties.ownershipFraction.$ref, "#/$defs/ownershipFraction");
  assert.equal(contract.$defs.investment.properties.ownershipFraction.$ref, "#/$defs/ownershipFraction");

  const refs = [
    contract.$defs.market.properties.pot,
    contract.$defs.purchase.properties.purchasePrice,
    contract.$defs.roundResult.properties.payoutFraction,
    contract.$defs.roundResult.properties.guaranteedWinnings,
    contract.$defs.golfer.properties.overallPayoutFraction,
    contract.$defs.golfer.properties.totalPayoutFraction,
    contract.$defs.golfer.properties.tournamentValue,
    contract.$defs.golfer.properties.netProfit,
    contract.$defs.golfer.properties.roi,
    contract.$defs.investment.properties.purchaseCost,
    contract.$defs.investment.properties.tournamentValue,
    contract.$defs.portfolio.properties.purchaseCost,
    contract.$defs.portfolio.properties.tournamentValue,
  ];
  assert.equal(refs.every((entry) => ["#/$defs/decimal", "#/$defs/nonnegativeDecimal"].includes(entry.$ref)), true);
  for (const field of ["grossScore", "netScore", "courseHandicap", "points"]) {
    assert.equal(contract.$defs.roundResult.properties[field].type, "number");
  }
});

test("published market and result expose only bounded stable-identity participant fields", async () => {
  const contract = await schema();
  assert.deepEqual(contract.$defs.player.required, ["playerId", "displayName"]);
  assert.deepEqual(contract.$defs.market.required, ["pot", "purchases"]);
  assert.deepEqual(contract.$defs.purchase.required, ["player", "purchasePrice", "owners"]);
  assert.deepEqual(contract.$defs.owner.required, ["player", "ownershipFraction"]);
  assert.deepEqual(contract.$defs.result.required, ["tournamentComplete", "completedRounds", "golfers", "portfolios"]);
  assert.deepEqual(contract.$defs.roundResult.required, [
    "roundId", "roundNumber", "format", "grossScore", "netScore",
    "courseHandicap", "rank", "tieSize", "points", "payoutFraction",
    "guaranteedWinnings",
  ]);
  assert.deepEqual(contract.$defs.roundResult.properties.format.enum, ["BB", "SC", "SI"]);
  assert.equal(contract.$defs.result.properties.completedRounds.maxItems, 3);
  assert.equal(contract.$defs.golfer.properties.rounds.maxItems, 3);

  const names = propertyNames(contract);
  for (const forbidden of [
    "email", "phone", "authUserId", "authUuid", "directorEntitlement",
    "sourceRows", "rawConfiguration", "job", "audit", "storylines",
  ]) assert.equal(names.has(forbidden), false, `schema must not expose ${forbidden}`);
});

test("Calcutta docs pin participant publication, no-rounding, stale, and dormant activation boundaries", async () => {
  const [readme, nativeSpec] = await Promise.all([
    readFile(readmeUrl, "utf8"),
    readFile(nativeSpecUrl, "utf8"),
  ]);
  for (const term of [
    "GET /calcutta",
    "read_production_calcutta_v1",
    "X-Bagger-Certification",
    "AUCTION_COMPLETE",
    "publicationState",
    "full **published** market",
    "currencyCode",
    "canonical base-10 string",
    "118.125",
    "payout_rounding: NONE",
    "calcutta-v1:<configuration-revision>:<auction-revision>:<publication-revision>:<result-revision-or-0>:<state>:<publication-state>",
    "opaque representation fingerprint",
    "exact current configuration and auction revisions",
    "Explicit unpublish changes visibility, not canonical auction/result facts, lifecycle, or their revision bindings",
    "resultRevision` may therefore remain non-null while the result body is hidden",
    "Production activation boundary",
    "separate, explicitly authorized Production-native milestone",
  ]) assert.ok(readme.includes(term), `mobile contract README must include ${term}`);
  assert.match(readme, /no `AUCTION_OPEN`/);
  assert.match(readme, /no email, phone, Auth UUID/);
  assert.match(readme, /never calculate, settle, round, or redistribute Calcutta value/);

  for (const term of [
    "production-calcutta-v1",
    "GET /api/mobile/v1/calcutta",
    "NOT_CONFIGURED",
    "AUCTION_COMPLETE",
    "there is no `AUCTION_OPEN`",
    "full market only when `publicationState` is `PUBLISHED`",
    "Explicit unpublish preserves the canonical lifecycle and facts",
    "canonical decimal string",
    "current canonical revisions",
    "not native activation",
  ]) assert.ok(nativeSpec.includes(term), `native product spec must include ${term}`);
  assert.doesNotMatch(nativeSpec, /Calcutta standings \| Web-only\/post-V1 evaluation/);
});
