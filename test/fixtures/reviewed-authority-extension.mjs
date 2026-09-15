import assert from "node:assert/strict";

// Owner-approved Director-only extension. This constructs one exact expected
// file; it never removes or normalizes differences from the current source.
export function withDirectorCalcuttaRead(original) {
  const anchor = '  inspect_production_calcutta_v1: "OBSERVATION",\n';
  assert.equal(original.split(anchor).length, 2, "exact frozen anchor required");
  assert.equal(original.includes("read_production_calcutta_management_v1"), false,
    "the frozen source must not already contain the extension");
  return original.replace(anchor,
    `${anchor}  read_production_calcutta_management_v1: "OBSERVATION",\n`);
}
