import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
const enabled = process.execArgv.includes("--conditions=react-server");
const { manageCalcutta } = enabled
  ? await import("../lib/calcutta-management-server.js")
  : {};
const { readProductionCalcuttaManagement } = enabled
  ? await import("../lib/production-calcutta-server.js")
  : {};
const serverTest = enabled ? test : () => {};
if (!enabled)
  test("Calcutta server behavior in server-only runtime", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--test",
        new URL(import.meta.url).pathname,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
import { fixture } from "./calcutta-management.test.mjs";
import {
  configurationDraft,
  predecessor,
} from "../lib/calcutta-management-model.js";
const actor = {
  actorAuthUserId: "11111111-1111-4111-8111-111111111111",
  actorPlayerId: "P1",
};
serverTest(
  "HTTP success without semantic receipt is not accepted",
  async () => {
    const h = harness();
    h.options.dependencies.configure = async () => ({ ok: true });
    await assert.rejects(
      manageCalcutta(
        "management-configure",
        {
          ...predecessor(h.model),
          rows: configurationDraft(h.model),
          requestFingerprint: "8".repeat(64),
        },
        actor,
        h.options,
      ),
      /receipt/,
    );
    assert.equal(h.writes, 0);
  },
);
function harness() {
  let model = fixture(),
    writes = 0;
  const receipts = new Map(),
    history = new Map([
      [0, { purchases: [], ownership: [], fingerprint: null }],
    ]);
  const read = async (a) => {
    assert.equal(a.actorAuthUserId, actor.actorAuthUserId);
    const base = history.get(a.expectedAuctionRevision || 0);
    return {
      ok: true,
      data: structuredClone({
        ...model,
        predecessor_auction_fingerprint: base?.fingerprint,
        predecessor_purchases: base?.purchases,
        predecessor_ownership: base?.ownership,
      }),
    };
  };
  const mutate = (kind) => async (p) => {
    const payload = JSON.stringify(p);
    if (receipts.has(p.requestFingerprint)) {
      const r = receipts.get(p.requestFingerprint);
      assert.equal(payload, r.payload, "conflicting idempotency");
      return r.receipt;
    }
    assert.equal(
      p.expectedConfigurationRevision,
      model.configuration_revision,
      "stale configuration",
    );
    assert.equal(
      p.expectedAuctionRevision,
      model.auction_revision,
      "stale auction",
    );
    assert.equal(
      p.expectedPublicationRevision,
      model.publication_revision,
      "stale publication",
    );
    writes++;
    if (kind === "config") {
      model = {
        ...model,
        point_structure: p.pointStructure,
        payout_structure: p.payoutStructure,
        configuration_revision: model.configuration_revision + 1,
      };
    } else {
      model = {
        ...model,
        purchases: p.purchases,
        ownership: p.ownership,
        auction_revision: model.auction_revision + 1,
        auction_fingerprint: "b".repeat(64),
      };
      history.set(model.auction_revision, {
        purchases: p.purchases,
        ownership: p.ownership,
        fingerprint: model.auction_fingerprint,
      });
    }
    model.publication_revision++;
    const receipt = {
      ok: true,
      idempotent: false,
      code:
        kind === "config"
          ? "PRODUCTION_CALCUTTA_V1_CONFIGURED"
          : "PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED",
      publication_state: model.publication_state,
      publication_revision: model.publication_revision,
      configuration_revision: model.configuration_revision,
      configuration_fingerprint: model.configuration_fingerprint,
      auction_revision: model.auction_revision,
      auction_fingerprint: model.auction_fingerprint,
    };
    receipts.set(p.requestFingerprint, { payload, receipt });
    return receipt;
  };
  return {
    options: {
      scoringDispatchContext: { runtime: { tournamentId: "2026" } },
      dependencies: {
        read,
        configure: mutate("config"),
        replace: mutate("auction"),
      },
    },
    get model() {
      return model;
    },
    set model(v) {
      model = v;
    },
    get writes() {
      return writes;
    },
  };
}
serverTest(
  "read is mutation-free; configuration save verifies all values and remains unpublished",
  async () => {
    const h = harness();
    await manageCalcutta("management-read", {}, actor, h.options);
    assert.equal(h.writes, 0);
    const rows = configurationDraft(h.model);
    rows[0].points[0] = "97";
    const p = {
      ...predecessor(h.model),
      rows,
      requestFingerprint: "c".repeat(64),
    };
    const result = await manageCalcutta(
      "management-configure",
      p,
      actor,
      h.options,
    );
    assert.equal(result.readbackVerified, true);
    assert.equal(result.data.configuration_revision, 3);
    assert.equal(result.data.publication_state, "UNPUBLISHED");
    await manageCalcutta("management-configure", p, actor, h.options);
    assert.equal(h.writes, 1);
    const changed = structuredClone(p);
    changed.rows[0].points[0] = "98";
    await assert.rejects(
      manageCalcutta("management-configure", changed, actor, h.options),
      /conflicting idempotency/,
    );
  },
);
serverTest(
  "entry save/retry uses immutable predecessor; other entries preserved and self-buy allowed",
  async () => {
    const h = harness();
    const p = {
      ...predecessor(h.model),
      requestFingerprint: "d".repeat(64),
      entry: {
        playerId: "P1",
        purchasePrice: "100",
        owners: [{ buyerId: "P1", percentage: "100" }],
      },
    };
    await manageCalcutta("management-entry", p, actor, h.options);
    await manageCalcutta("management-entry", p, actor, h.options);
    assert.equal(h.writes, 1);
    const second = {
      ...predecessor(h.model),
      requestFingerprint: "e".repeat(64),
      entry: {
        playerId: "P2",
        purchasePrice: "200",
        owners: [
          { buyerId: "P1", percentage: "25" },
          { buyerId: "P2", percentage: "75" },
        ],
      },
    };
    const result = await manageCalcutta(
      "management-entry",
      second,
      actor,
      h.options,
    );
    assert.equal(result.data.purchases.length, 2);
    assert.equal(result.data.purchases[0].purchase_price, "100");
    assert.equal(result.data.ownership.length, 3);
    await manageCalcutta("management-entry", second, actor, h.options);
    assert.equal(h.writes, 2);
  },
);
serverTest(
  "stale predecessor, tournament drift, published state and invalid ownership fail closed",
  async () => {
    const h = harness();
    const p = {
      ...predecessor(h.model),
      requestFingerprint: "f".repeat(64),
      entry: {
        playerId: "P1",
        purchasePrice: "100",
        owners: [{ buyerId: "P1", percentage: "99" }],
      },
    };
    await assert.rejects(
      manageCalcutta("management-entry", p, actor, h.options),
      /100%/,
    );
    p.entry.owners[0].percentage = "100";
    await assert.rejects(
      manageCalcutta(
        "management-entry",
        { ...p, expectedTournamentId: "2030" },
        actor,
        h.options,
      ),
      /tournament changed/,
    );
    await assert.rejects(
      manageCalcutta(
        "management-entry",
        { ...p, expectedConfigurationRevision: 1 },
        actor,
        h.options,
      ),
      /stale configuration/,
    );
    h.model = { ...h.model, publication_state: "PUBLISHED" };
    await assert.rejects(
      manageCalcutta("management-entry", p, actor, h.options),
      /Unpublish/,
    );
    assert.equal(h.writes, 0);
  },
);
serverTest(
  "successful commit with failed readback can reuse original request without duplicate writes",
  async () => {
    const h = harness(),
      original = h.options.dependencies.read;
    let reads = 0;
    h.options.dependencies.read = async (...args) => {
      if (++reads === 2) throw new Error("network uncertain");
      return original(...args);
    };
    const p = {
      ...predecessor(h.model),
      requestFingerprint: "9".repeat(64),
      entry: {
        playerId: "P1",
        purchasePrice: "100",
        owners: [{ buyerId: "P1", percentage: "100" }],
      },
    };
    await assert.rejects(
      manageCalcutta("management-entry", p, actor, h.options),
      /network uncertain/,
    );
    assert.equal(h.writes, 1);
    const result = await manageCalcutta(
      "management-entry",
      p,
      actor,
      h.options,
    );
    assert.equal(result.readbackVerified, true);
    assert.equal(h.writes, 1);
  },
);

serverTest(
  "private read uses certified current/future dispatch and requires Director identity",
  async () => {
    const calls = [];
    const current = {
      scoringDispatchContext: { runtime: { tournamentId: "2026" } },
      dependencies: {
        getActivation: () => ({}),
        rpc: async (name, input) => {
          calls.push({ name, input });
          return {
            payload:
              name === "inspect_production_cutover_authority"
                ? { ok: true, authority: "SUPABASE", activation_revision: 7 }
                : { ok: true, data: fixture() },
          };
        },
      },
    };
    await readProductionCalcuttaManagement(
      { ...actor, expectedAuctionRevision: 2 },
      current,
    );
    assert.equal(calls[1].name, "read_production_calcutta_management_v1");
    assert.equal(calls[1].input.predecessor_auction_revision, 2);
    assert.equal(calls[1].input.authorization.role, "DIRECTOR");
    await assert.rejects(
      readProductionCalcuttaManagement({}, current),
      /Director/,
    );
    const annual = {
      scoringDispatchContext: {
        runtime: {
          tournamentId: "2032",
          runtimeGenerationId: "11111111-1111-4111-8111-111111111111",
        },
      },
      dependencies: {
        scoringRpc: async (name, input, options) => {
          assert.equal(name, "read_production_calcutta_management_v1");
          assert.equal(
            options.scoringDispatchContext.runtime.tournamentId,
            "2032",
          );
          assert.equal(input.authorization.role, "DIRECTOR");
          return { payload: { ok: true, data: fixture("2032", 20) } };
        },
      },
    };
    assert.equal(
      (await readProductionCalcuttaManagement(actor, annual)).data
        .tournament_id,
      "2032",
    );
  },
);
