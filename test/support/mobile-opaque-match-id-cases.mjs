import { readFile } from "node:fs/promises";

const fixtures = JSON.parse(await readFile(
  new URL("../../contracts/mobile/v1/opaque-match-id-fixtures.json", import.meta.url), "utf8",
));

export const validOpaqueMatchIDs = [
  ...fixtures.valid,
  { case: "200BMPScalars", value: "m".repeat(200) },
  { case: "200NonBMPScalars", value: "🏌".repeat(200) },
  { case: "150Scalars300UTF16Units", value: "𐐀".repeat(150) },
  { case: "200MixedScalars", value: "m🏌".repeat(100) },
];

export const invalidOpaqueMatchIDs = [
  ...fixtures.invalid,
  { case: "201BMPScalars", value: "m".repeat(201) },
  { case: "201NonBMPScalars", value: "🏌".repeat(201) },
  { case: "unpairedHighSurrogate", value: "match\uD800" },
  { case: "unpairedLowSurrogate", value: "match\uDC00" },
  { case: "reversedSurrogatePair", value: "\uDC00\uD800" },
  { case: "highSurrogateBeforeBMP", value: "\uD800x" },
  { case: "highHighLowSurrogates", value: "\uD800\uD800\uDC00" },
  { case: "null", value: null },
  { case: "undefined", value: undefined },
  { case: "number", value: 12 },
  { case: "array", value: ["match"] },
  { case: "object", value: { matchId: "match" } },
];
