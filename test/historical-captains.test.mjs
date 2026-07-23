import assert from "node:assert/strict";
import test from "node:test";
import {
  historicalCaptainReference,
  resolveHistoricalCaptain,
} from "../lib/historical-captains.js";

test("historical captain prefers the stable Captain Player ID", () => {
  const reference = historicalCaptainReference({
    "Captain Player ID": "CP01",
    Captain: "OLD01",
    "Captain Name": "Chase Patterson",
  });
  assert.deepEqual(reference, { id: "CP01", name: "Chase Patterson" });
});

test("historical captain resolves an existing Player ID and supports a name fallback", () => {
  const playerMap = {
    CP01: { "Player ID": "CP01", "Display Name": "Chase Patterson" },
  };
  assert.equal(
    resolveHistoricalCaptain({ Captain: "CP01" }, playerMap)?.["Player ID"],
    "CP01"
  );
  assert.equal(
    resolveHistoricalCaptain({ "Captain Name": "chase patterson" }, playerMap)?.["Player ID"],
    "CP01"
  );
});
