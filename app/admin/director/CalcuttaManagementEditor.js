"use client";
import { useEffect, useRef, useState } from "react";
import {
  auctionEntry,
  canonicalEqual,
  configurationDraft,
  configurationPayload,
  entryPayload,
  fraction,
  half,
  multiply,
  ownershipState,
  predecessor,
  sum,
} from "../../../lib/calcutta-management-model.js";
import styles from "./calcutta-management.module.css";
const safe = (fn) => {
  try {
    return fn();
  } catch {
    return "—";
  }
};
async function request(action, input = {}) {
  const r = await fetch("/api/admin/production-calcutta-v1", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...input }),
  });
  const p = await r.json();
  if (!r.ok || !p.ok || !p.result?.ok)
    throw new Error(p.code || "Calcutta operation unavailable");
  return p.result;
}
function Field({ label, value, onChange, disabled }) {
  return (
    <label>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Scroll({ label, children }) {
  return (
    <div
      className={styles.scroll}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
export default function CalcuttaManagementEditor({ onChanged }) {
  const [model, setModel] = useState(null),
    [rows, setRows] = useState([]),
    [entry, setEntry] = useState(null),
    [tab, setTab] = useState("configuration");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [hypothetical, setHypothetical] = useState("1000");
  const pending = useRef(null);
  const apply = (m) => {
    setModel(m);
    setRows(configurationDraft(m));
    setEntry(null);
    setReview(false);
    setConfirm(false);
  };
  const load = async () => {
    setBusy(true);
    try {
      apply((await request("management-read")).data);
      setMessage("Canonical state loaded. No write performed.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const dirty = Boolean(
    model &&
      (!canonicalEqual(rows, configurationDraft(model)) ||
        (entry && !canonicalEqual(entry, auctionEntry(model, entry.playerId)))),
  );
  useEffect(() => {
    const guard = (e) => {
      if (dirty || pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  if (!model)
    return (
      <section className={styles.editor}>
        <h3>Calcutta management</h3>
        <p role="status">{message || "Loading canonical state…"}</p>
        <button disabled={busy} onClick={load}>
          Retry read
        </button>
      </section>
    );
  const base = configurationDraft(model),
    count = model.players.length,
    teams = count / 2;
  const name = (id) =>
    model.players.find((p) => p.player_id === id)?.display_name || id;
  const locked =
    busy ||
    Boolean(pending.current) ||
    model.publication_state !== "UNPUBLISHED";
  const changeRows = (place, field, i, value) => {
    setRows(
      rows.map((r) =>
        r.place === place
          ? { ...r, [field]: r[field].map((v, j) => (i === j ? value : v)) }
          : r,
      ),
    );
    setReview(false);
    setConfirm(false);
  };
  const changeEntry = (v) => {
    setEntry(v);
    setReview(false);
    setConfirm(false);
  };
  const overview = model.players.map((p) => {
    const value =
      entry?.playerId === p.player_id
        ? entry
        : auctionEntry(model, p.player_id);
    return { ...p, entry: value, ...ownershipState(value.owners) };
  });
  let invalid = "";
  try {
    if (tab === "configuration") configurationPayload(rows, count);
    else if (entry) entryPayload(entry, model.players);
  } catch (e) {
    invalid = e.message;
  }
  const discard = () => {
    if (
      (!dirty && !pending.current) ||
      window.confirm(
        "Discard local changes and reload? An uncertain save may already have committed.",
      )
    ) {
      pending.current = null;
      load();
    }
  };
  const save = async (next = false) => {
    setBusy(true);
    setMessage("");
    try {
      if (!pending.current) {
        const requestFingerprint = [
          ...crypto.getRandomValues(new Uint8Array(32)),
        ]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        pending.current = {
          action:
            tab === "configuration"
              ? "management-configure"
              : "management-entry",
          payload: {
            ...predecessor(model),
            requestFingerprint,
            ...(tab === "configuration" ? { rows } : { entry }),
          },
          next,
          playerId: entry?.playerId,
        };
      }
      const intent = pending.current,
        result = await request(intent.action, intent.payload);
      if (!result.readbackVerified || !result.receipt?.ok)
        throw new Error("Semantic receipt/readback uncertain.");
      apply(result.data);
      pending.current = null;
      if (intent.next) {
        const i = result.data.players.findIndex(
          (p) => p.player_id === intent.playerId,
        );
        if (result.data.players[i + 1])
          setEntry(
            auctionEntry(result.data, result.data.players[i + 1].player_id),
          );
      }
      setMessage(
        "Saved and every value verified. Publication remains UNPUBLISHED.",
      );
      try {
        await onChanged?.();
      } catch {
        setMessage(
          "Save verified. Refresh surrounding Director status separately.",
        );
      }
    } catch (e) {
      setMessage(
        `${e.message} Retry uses the same request identity; discard/reload to inspect current state.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.editor} aria-label="Calcutta management">
      <h3>Calcutta status · {model.tournament_id}</h3>
      <p>
        {model.state} · Configuration revision {model.configuration_revision} ·
        Auction revision {model.auction_revision} · {model.publication_state}
      </p>
      <p>
        Rules:{" "}
        {model.state === "NOT_CONFIGURED"
          ? "Not configured"
          : "Canonical validated revision"}
        . {count} active golfers · {teams} Scramble teams.
      </p>
      <div className={styles.actions}>
        <button
          disabled={busy || Boolean(pending.current) || dirty}
          aria-pressed={tab === "configuration"}
          onClick={() => {
            setTab("configuration");
            setReview(false);
          }}
        >
          Points &amp; Payouts
        </button>
        <button
          disabled={busy || Boolean(pending.current) || dirty}
          aria-pressed={tab === "auction"}
          onClick={() => {
            setTab("auction");
            setReview(false);
          }}
        >
          Auction / Ownership
        </button>
        <button disabled={busy} onClick={discard}>
          {dirty || pending.current
            ? "Discard Changes / Reload"
            : "Refresh canonical state"}
        </button>
      </div>
      {dirty && (
        <p role="status">
          UNSAVED CHANGES — save or discard before switching workflows.
        </p>
      )}
      {model.publication_state !== "UNPUBLISHED" && (
        <p role="alert">
          Editing is locked while published. Use the separate publication
          workflow first.
        </p>
      )}
      {tab === "configuration" ? (
        <>
          {[0, 1, 2, 3].map((round) => (
            <section key={round}>
              <h4>
                {
                  [
                    "Round 1 — Best Ball",
                    "Round 2 — Scramble",
                    "Round 3 — Singles",
                    "Overall payout",
                  ][round]
                }
              </h4>
              <p>
                {round === 1
                  ? "ROUND 2 VALUES ARE TEAM VALUES. Each award is split equally between both partners. Player shares are read-only."
                  : "Ranking: individual golfer"}
              </p>
              <Scroll label={`Awards ${round + 1}`}>
                <table>
                  <thead>
                    <tr>
                      <th>Place</th>
                      {round < 3 && (
                        <th>{round === 1 ? "Team points" : "Points"}</th>
                      )}
                      <th>{round === 1 ? "Team payout %" : "Payout %"}</th>
                      {round === 1 && (
                        <>
                          <th>Player point share</th>
                          <th>Player payout share</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, round === 1 ? teams : count).map((r) => (
                      <tr key={r.place}>
                        <th>{r.place}</th>
                        {round < 3 && (
                          <td>
                            <Field
                              label={`R${round + 1} place ${r.place} points`}
                              value={r.points[round]}
                              disabled={locked}
                              onChange={(v) =>
                                changeRows(r.place, "points", round, v)
                              }
                            />
                          </td>
                        )}
                        <td>
                          <Field
                            label={`${round === 3 ? "Overall" : `R${round + 1}`} place ${r.place} payout %`}
                            value={r.percentages[round]}
                            disabled={locked}
                            onChange={(v) =>
                              changeRows(r.place, "percentages", round, v)
                            }
                          />
                        </td>
                        {round === 1 && (
                          <>
                            <td>{safe(() => half(r.points[1]))}</td>
                            <td>{safe(() => half(r.percentages[1]))}%</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
            </section>
          ))}
          <h4>Live totals</h4>
          <p role="status">
            Proposed configuration:{" "}
            {invalid
              ? "INVALID — see validation message"
              : "VALID — payout total exactly 100%"}
          </p>
          <p>
            Points:{" "}
            {[0, 1, 2]
              .map(
                (i) =>
                  `R${i + 1}: ${safe(() => sum(rows.map((r) => r.points[i])))}`,
              )
              .join(" · ")}{" "}
            · Total: {safe(() => sum(rows.flatMap((r) => r.points)))}
          </p>
          <p>
            Payout:{" "}
            {[0, 1, 2, 3]
              .map(
                (i) =>
                  `${i === 3 ? "Overall" : `R${i + 1}`}: ${safe(() => sum(rows.map((r) => r.percentages[i])))}%`,
              )
              .join(" · ")}{" "}
            · Total: {safe(() => sum(rows.flatMap((r) => r.percentages)))}%
          </p>
          <p>
            Non-monotonic schedules are valid. Tie semantics remain
            occupied-place award averaging with fractional awards.
          </p>
        </>
      ) : (
        <>
          <h4>Auction overview</h4>
          <p>
            Entries {model.purchases.length}/{count} · Complete ownership{" "}
            {overview.filter((s) => s.status === "COMPLETE").length}/{count} ·
            Incomplete{" "}
            {overview.filter((s) => s.status === "INCOMPLETE").length} · Invalid{" "}
            {overview.filter((s) => s.status === "INVALID").length}
          </p>
          <p>
            Canonical total purchase value:{" "}
            {safe(() => sum(model.purchases.map((p) => p.purchase_price)))}{" "}
            {model.currency_code}. Roster coverage is distinct from canonical
            auction-revision status.
          </p>
          <label>
            Filter entries
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {["ALL", "NOT ENTERED", "INCOMPLETE", "COMPLETE", "INVALID"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <Scroll label="Auction overview">
            <table>
              <thead>
                <tr>
                  <th>Golfer</th>
                  <th>Price</th>
                  <th>Owners</th>
                  <th>Total / status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {overview
                  .filter((s) => filter === "ALL" || s.status === filter)
                  .map((s) => (
                    <tr key={s.player_id}>
                      <th>{s.display_name}</th>
                      <td>{s.entry.purchasePrice || "—"}</td>
                      <td>
                        {s.entry.owners
                          .map((o) => `${name(o.buyerId)} ${o.percentage}%`)
                          .join(", ") || "—"}
                      </td>
                      <td>
                        {s.total}% · {s.status}
                      </td>
                      <td>
                        <button
                          disabled={locked || dirty}
                          onClick={() =>
                            changeEntry(auctionEntry(model, s.player_id))
                          }
                        >
                          Edit {s.display_name}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Scroll>
          {entry && (
            <section>
              <h4>Purchase: {name(entry.playerId)}</h4>
              <Field
                label={`Purchase price (${model.currency_code})`}
                value={entry.purchasePrice}
                disabled={locked}
                onChange={(v) => changeEntry({ ...entry, purchasePrice: v })}
              />
              <p>
                Self-purchase and ownership of multiple golfers are supported.
                Percentages are never normalized automatically.
              </p>
              {entry.owners.map((o, i) => (
                <fieldset key={i}>
                  <legend>Owner {i + 1}</legend>
                  <label>
                    Buyer
                    <select
                      aria-label="Buyer"
                      disabled={locked}
                      value={o.buyerId}
                      onChange={(e) =>
                        changeEntry({
                          ...entry,
                          owners: entry.owners.map((r, j) =>
                            i === j ? { ...r, buyerId: e.target.value } : r,
                          ),
                        })
                      }
                    >
                      <option value="">Select buyer</option>
                      {model.players.map((p) => (
                        <option key={p.player_id} value={p.player_id}>
                          {p.display_name}
                          {p.player_id === entry.playerId ? " (self)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Ownership %"
                    value={o.percentage}
                    disabled={locked}
                    onChange={(v) =>
                      changeEntry({
                        ...entry,
                        owners: entry.owners.map((r, j) =>
                          i === j ? { ...r, percentage: v } : r,
                        ),
                      })
                    }
                  />
                  <p>
                    Ownership cost:{" "}
                    {safe(() =>
                      multiply(entry.purchasePrice, fraction(o.percentage)),
                    )}{" "}
                    {model.currency_code} (informational)
                  </p>
                  <button
                    disabled={locked}
                    onClick={() =>
                      changeEntry({
                        ...entry,
                        owners: entry.owners.filter((_, j) => i !== j),
                      })
                    }
                  >
                    Remove owner {i + 1}
                  </button>
                </fieldset>
              ))}
              <button
                disabled={locked}
                onClick={() =>
                  changeEntry({
                    ...entry,
                    owners: [...entry.owners, { buyerId: "", percentage: "" }],
                  })
                }
              >
                + Add Owner
              </button>
              <p role="status">
                {ownershipState(entry.owners).status} —{" "}
                {ownershipState(entry.owners).total}% total ·{" "}
                {ownershipState(entry.owners).difference}%{" "}
                {ownershipState(entry.owners).status === "INVALID"
                  ? "overallocated"
                  : "unassigned"}
              </p>
              <details>
                <summary>
                  Hypothetical payout preview — not official results
                </summary>
                <Field
                  label="Hypothetical golfer payout"
                  value={hypothetical}
                  onChange={setHypothetical}
                />
                {entry.owners.map((o, i) => (
                  <p key={i}>
                    {name(o.buyerId)}:{" "}
                    {safe(() => multiply(hypothetical, fraction(o.percentage)))}{" "}
                    {model.currency_code}
                  </p>
                ))}
              </details>
            </section>
          )}
        </>
      )}
      {invalid && <p role="alert">{invalid}</p>}
      <button
        disabled={locked || !dirty || Boolean(invalid)}
        onClick={() => {
          setReview(true);
          setConfirm(false);
        }}
      >
        Review Changes
      </button>
      {review && (
        <section className={styles.review}>
          <h4>Current → Proposed</h4>
          {tab === "configuration" ? (
            rows.map((r, i) =>
              canonicalEqual(r, base[i]) ? null : (
                <p key={r.place}>
                  Place {r.place}: points {base[i].points.join(" / ")} →{" "}
                  {r.points.join(" / ")}; payouts{" "}
                  {base[i].percentages.join(" / ")}% →{" "}
                  {r.percentages.join(" / ")}%
                </p>
              ),
            )
          ) : (
            <>
              <p>
                {name(entry.playerId)}: price{" "}
                {auctionEntry(model, entry.playerId).purchasePrice || "—"} →{" "}
                {entry.purchasePrice} {model.currency_code}
              </p>
              <p>
                Owners:{" "}
                {auctionEntry(model, entry.playerId)
                  .owners.map((o) => `${name(o.buyerId)} ${o.percentage}%`)
                  .join(", ") || "None"}{" "}
                →{" "}
                {entry.owners
                  .map((o) => `${name(o.buyerId)} ${o.percentage}%`)
                  .join(", ")}
              </p>
            </>
          )}
          <p>
            Creates a new immutable revision. Prior history is preserved.
            Publication WILL REMAIN UNPUBLISHED. No official results are
            calculated.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            I confirm these exact changes.
          </label>
          <div className={styles.actions}>
            <button
              disabled={busy || !confirm || Boolean(invalid)}
              onClick={() => save(false)}
            >
              {tab === "configuration"
                ? "Save New Revision"
                : "Save Auction Entry"}
            </button>
            {tab === "auction" && (
              <button
                disabled={busy || !confirm || Boolean(invalid)}
                onClick={() => save(true)}
              >
                Save &amp; Next
              </button>
            )}
          </div>
        </section>
      )}
      {pending.current && (
        <button disabled={busy} onClick={() => save()}>
          Retry same saved request
        </button>
      )}
      <p role="status">{message}</p>
      <h4>Results / Publication</h4>
      <p>
        Use the separate existing publication and calculation controls. Editing
        and saving here never publishes or calculates results.
      </p>
    </section>
  );
}
