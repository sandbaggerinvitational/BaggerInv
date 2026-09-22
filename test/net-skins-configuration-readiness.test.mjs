import assert from "node:assert/strict";
import test from "node:test";
import { netSkinsConfigurationReadiness } from "../lib/net-skins-configuration-readiness.js";
import { netSkinsHarness, savedEntryState, elements, text, loadDirectorSource } from "./fixtures/director-behavior.mjs";

test("saved-entry readiness fails closed for loading, unavailable, empty, stale, zero and malformed entries", () => {
  for (const input of [undefined, { phase: "failure" }, { phase: "ready" }, { phase: "ready", rounds: [] },
    ...[{ state: "REVIEW_REQUIRED" }, { state: "WAITING_FOR_PAIRINGS" }, { enteredCount: 0 }, { revision: 0 }, { enteredCount: "4" }]
      .map(override => ({ phase: "ready", rounds: [{ ...savedEntryState.rounds[0], ...override }] }))]) {
    assert.equal(netSkinsConfigurationReadiness(input).ready, false);
    assert.equal(netSkinsConfigurationReadiness(input).selection, undefined);
  }
});

test("only saved configured rounds participate; unpaired unconfigured Singles does not block", () => {
  assert.deepEqual(netSkinsConfigurationReadiness(savedEntryState).selection, { eligibleRoundNumbers: [1], entryRevisions: { 1: 2 } });
  const state = { phase: "ready", rounds: [...savedEntryState.rounds, { ...savedEntryState.rounds[0], roundNumber: 2, revision: 5 }] };
  assert.deepEqual(netSkinsConfigurationReadiness(state).selection, { eligibleRoundNumbers: [1, 2], entryRevisions: { 1: 2, 2: 5 } });
});

test("not-ready actual card cannot invoke confirmation, fetch or a write even if its handler is called", async () => {
  const previousFetch = globalThis.fetch, previousConfirm = globalThis.confirm;
  globalThis.fetch = () => { throw new Error("unexpected fetch"); };
  globalThis.confirm = () => { throw new Error("unexpected confirmation"); };
  try {
    for (const state of [{ phase: "loading" }, { phase: "failure" }, { phase: "ready", rounds: [] }]) {
      const harness = await netSkinsHarness(state), tree = harness.render();
      const button = elements(tree).find(e => e.type === "button");
      assert.equal(button.props.disabled, true);
      await button.props.onClick();
      assert.equal(harness.refreshes, 0);
      assert.ok(!text(tree).includes("No configuration action is offered"));
    }
  } finally { globalThis.fetch = previousFetch; globalThis.confirm = previousConfirm; }
});

test("ready actual card re-reads entries, uses latest revisions, then refreshes after one explicit save", async () => {
  const previousFetch = globalThis.fetch, previousConfirm = globalThis.confirm;
  const calls = [], latest = structuredClone(savedEntryState.rounds); latest[0].revision = 3;
  globalThis.confirm = () => true;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(options.method === "GET" ? { data: { rounds: latest } } : { ok: true }); };
  try {
    const harness = await netSkinsHarness(savedEntryState);
    // Legacy tournament-wide readiness is deliberately NOT the explicit-entry gate.
    for (const readiness of [undefined, { state: "NEEDS_SETUP", canConfigure: false, issues: [] }]) {
      const button = elements(harness.render(readiness)).find(e => e.type === "button");
      assert.equal(button.props.disabled, false);
    }
    await elements(harness.render()).find(e => e.type === "button").props.onClick();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[1].url, "/api/admin/production-net-skins-v1");
    const body = JSON.parse(calls[1].options.body);
    assert.equal(body.action, "configure");
    assert.deepEqual(body.entryRevisions, { 1: 3 });
    assert.deepEqual(body.eligibleRoundNumbers, [1]);
    assert.equal(harness.refreshes, 1);
    assert.match(text(harness.render()), /configuration was accepted/);
  } finally { globalThis.fetch = previousFetch; globalThis.confirm = previousConfirm; }
});

test("ready card cancels cleanly and stale/unavailable fresh entry reads never submit configuration", async () => {
  const previousFetch = globalThis.fetch, previousConfirm = globalThis.confirm;
  try {
    for (const mode of ["cancel", "stale", "unavailable"]) {
      const calls = [];
      globalThis.confirm = () => mode !== "cancel";
      globalThis.fetch = async (url, options) => { calls.push(options.method); return mode === "unavailable"
        ? Response.json({ error: "Entries unavailable" }, { status: 503 })
        : Response.json({ data: { rounds: [{ ...savedEntryState.rounds[0], state: mode === "cancel" ? "ENTRIES_SAVED" : "REVIEW_REQUIRED" }] } }); };
      const harness = await netSkinsHarness(savedEntryState);
      await elements(harness.render()).find(e => e.type === "button").props.onClick();
      assert.deepEqual(calls, ["GET"]);
      assert.equal(harness.refreshes, 0);
      if (mode !== "cancel") assert.equal(elements(harness.render()).find(e => e.type === "button").props.disabled, true);
    }
  } finally { globalThis.fetch = previousFetch; globalThis.confirm = previousConfirm; }
});

test("real configuration route rejects non-Production, foreign origin and unauthorized actors before any operation", async () => {
  const prior = process.env.VERCEL_ENV;
  let access = { status: "inactive" }, calls = 0;
  const api = await loadDirectorSource("app/api/admin/production-net-skins-v1/route.js", {
    "next/server": { NextResponse: { json: Response.json }, after: () => { throw new Error("unexpected worker"); } },
    "../../../../lib/preview-director-authorization.js": { authorizePreviewDirector: async input => { assert.equal(input.allowBootstrap, false); return access; } },
    "../../../../lib/production-cutover-activation-contract.js": { assertProductionCutoverActivation: () => {},
      assertProductionCutoverRequest: (request, _, opts) => { assert.equal(opts.requireOrigin, true); if (request.headers.get("origin") !== "https://example.invalid") throw new Error("origin"); } },
    "../../../../lib/production-net-skins-server.js": { configureProductionNetSkinsV1: async input => { calls++; assert.equal(input.actorPlayerId, "DIRECTOR"); return { ok: true }; } },
    "../../../../lib/data-authority-request.js": { withDataAuthorityRequestScope: async (_, fn) => ({ result: await fn() }), dataAuthorityResponseHeaders: () => ({}) },
    "../../../../lib/competition-derived-supabase.js": {},
  });
  const req = (origin = "https://example.invalid") => new Request("https://example.invalid/api/admin/production-net-skins-v1", {
    method: "POST", headers: { origin }, body: JSON.stringify({ action: "configure", actorPlayerId: "ATTACKER" }) });
  try {
    process.env.VERCEL_ENV = "preview"; assert.equal((await api.POST(req())).status, 404);
    process.env.VERCEL_ENV = "production"; assert.equal((await api.POST(req("https://other.invalid"))).status, 404);
    for (const status of ["inactive", "forbidden", "unavailable"]) { access = { status }; assert.equal((await api.POST(req())).status, status === "unavailable" ? 503 : 403); }
    assert.equal(calls, 0);
    access = { status: "active", identity: { authUserId: "synthetic", actor: { id: "DIRECTOR" } } };
    assert.equal((await api.POST(req())).status, 200); assert.equal(calls, 1);
  } finally { if (prior === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prior; }
});
