import test from "node:test";
import assert from "node:assert/strict";
import {
  playerDirectoryHref,
  safePlayerDirectoryReturnHref,
} from "../lib/context-navigation.js";

test("player return links preserve directory query state", () => {
  assert.equal(
    playerDirectoryHref({ team: "pickles", status: "active" }),
    "/players?team=pickles&status=active"
  );
  assert.equal(
    safePlayerDirectoryReturnHref("/players?team=pickles&status=active"),
    "/players?team=pickles&status=active"
  );
});

test("player return links reject external and unrelated destinations", () => {
  assert.equal(
    safePlayerDirectoryReturnHref("https://example.com/players"),
    "/players"
  );
  assert.equal(safePlayerDirectoryReturnHref("/admin"), "/players");
  assert.equal(safePlayerDirectoryReturnHref("//example.com"), "/players");
});
