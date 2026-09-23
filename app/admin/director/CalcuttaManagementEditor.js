"use client";
import { useEffect, useRef, useState } from "react";
import {
  decimal,
  percent,
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
export const ownershipPercent = value => safe(() => `${percent(value)}%`);
export function money(value, currency = "USD") {
  if (value === "" || value == null) return "—";
  return safe(() => { const [whole, part] = decimal(value).split("."); return `${currency === "USD" ? "$" : `${currency} `}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${part ? `.${part}` : ""}`; });
}
export function entryStatus(entry, players) {
  const state = ownershipState(entry.owners);
  if (!entry.purchasePrice && !entry.owners.length) return state;
  try { entryPayload(entry, players); return state; }
  catch (error) { return { ...state, status: error.message === "Ownership must total exactly 100%." && state.status === "INCOMPLETE" ? "INCOMPLETE" : "INVALID", error: !entry.purchasePrice ? "Purchase price required." : error.message }; }
}
export function nextUnentered(model, playerId) {
  const i = model.players.findIndex(p => p.player_id === playerId);
  return [...model.players.slice(i + 1), ...model.players.slice(0, i)].find(p => !model.purchases.some(row => row.player_id === p.player_id));
}
export function FinancialSafety() { return <aside className={styles.safety}><strong>Review carefully</strong><p>Saved purchase prices become canonical financial facts. Ownership percentages must match the intended ownership. Publishing makes the selected auction revision visible to participants. No money is collected or transferred. Payment and settlement stay outside The Bagger.</p></aside>; }
export function AuctionRows({ rows, name, currency, onEdit, disabled }) {
 return <div className={styles.auctionList} role="table" aria-label="Calcutta golfers"><div className={styles.auctionHead} role="row"><span>Player</span><span>Purchase price</span><span>Owner(s)</span><span>Ownership / status</span><span>Action</span></div>{rows.map(s => <div className={styles.auctionRow} role="row" key={s.player_id}><div role="cell"><strong>{s.display_name}</strong><small>{s.player_id}{s.unsaved ? " · UNSAVED" : ""}</small></div><div role="cell" data-label="Purchase price">{money(s.entry.purchasePrice,currency)}</div><div role="cell" data-label="Owners">{s.entry.owners.map(o => `${name(o.buyerId)} — ${o.percentage}%`).join(" · ") || "—"}</div><div role="cell" data-label="Ownership"><span className={styles.badge} data-state={s.status}>{s.total}% · {s.status}</span>{s.error && <small>{s.error}</small>}</div><div role="cell">{onEdit ? <button disabled={disabled} onClick={()=>onEdit(s.player_id)}>{s.status === "NOT ENTERED" ? "Enter Auction" : "Edit"}<span className={styles.srOnly}> {s.display_name}</span></button> : "Saved"}</div></div>)}</div>;
}
function OwnerSelect({players,value,onChange,disabled,index}) {
 const [search,setSearch]=useState("");
 return <div><label>Search owner {index + 1}<input type="search" value={search} disabled={disabled} onChange={e=>setSearch(e.target.value)} placeholder="Name or Player ID" /></label><label>Owner {index + 1}<select disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">Select Owner</option>{players.filter(p=>p.player_id===value || `${p.display_name} ${p.player_id}`.toLowerCase().includes(search.toLowerCase())).map(p=><option key={p.player_id} value={p.player_id}>{p.display_name} · {p.player_id}</option>)}</select></label></div>;
}
export default function CalcuttaManagementEditor({ onChanged, onDraftStateChange, externalPublicationRevision, transport = request }) {
  const [model, setModel] = useState(null),
    [rows, setRows] = useState([]),
    [entry, setEntry] = useState(null),
    [tab, setTab] = useState("auction");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [hypothetical, setHypothetical] = useState("1000");
  const [search, setSearch] = useState(""), [auctionReview, setAuctionReview] = useState(false);
  const [clearReview, setClearReview] = useState(false);
  const pending = useRef(null);
  const editorRef = useRef(null);
  useEffect(() => { if (entry) { editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); editorRef.current?.focus({ preventScroll: true }); } }, [entry?.playerId]);
  const apply = (m) => {
    setModel(m);
    setRows(configurationDraft(m));
    setEntry(null);
    setClearReview(false);
    setReview(false);
    setConfirm(false);
  };
  const load = async () => {
    setBusy(true);
    try {
      apply((await transport("management-read")).data);
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
    if (model && externalPublicationRevision !== undefined && externalPublicationRevision !== model.publication_revision && !dirty && !busy && !pending.current) load();
  }, [externalPublicationRevision, model?.publication_revision, dirty]);
  useEffect(() => { onDraftStateChange?.(dirty || busy || Boolean(pending.current)); }, [dirty, busy, onDraftStateChange]);
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
    model.publication_state !== "UNPUBLISHED" ||
    (externalPublicationRevision !== undefined && externalPublicationRevision !== model.publication_revision);
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
    setClearReview(false);
    setEntry(v);
    setReview(false);
    setConfirm(false);
  };
  const overview = model.players.map((p) => {
    const value =
      entry?.playerId === p.player_id
        ? entry
        : auctionEntry(model, p.player_id);
    return { ...p, entry: value, unsaved: entry?.playerId === p.player_id && dirty, ...entryStatus(value, model.players) };
  });
  const savedOverview = model.players.map(p => { const value=auctionEntry(model,p.player_id); return {...p,entry:value,...entryStatus(value,model.players)}; });
  const attention = overview.filter(s=>["INVALID","INCOMPLETE"].includes(s.status)).length;
  let invalid = "";
  try {
    if (tab === "configuration") configurationPayload(rows, count);
    else if (entry) entryPayload(entry, model.players);
  } catch (e) {
    invalid = tab === "auction" && entry && !entry.purchasePrice ? "Purchase price required." : e.message;
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
  const save = async (next = false, clearing = false) => {
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
            clearing ? "management-clear-entry" : tab === "configuration"
              ? "management-configure"
              : "management-entry",
          payload: {
            ...predecessor(model),
            requestFingerprint,
            ...(clearing ? { playerId: entry.playerId } : tab === "configuration" ? { rows } : { entry }),
          },
          next,
          playerId: entry?.playerId,
        };
      }
      const intent = pending.current,
        result = await transport(intent.action, intent.payload);
      if (!result.readbackVerified || !result.receipt?.ok)
        throw new Error("Semantic receipt/readback uncertain.");
      apply(result.data);
      pending.current = null;
      if (intent.next) {
        const nextPlayer = nextUnentered(result.data, intent.playerId);
        if (nextPlayer) setEntry(auctionEntry(result.data, nextPlayer.player_id));
      }
      setMessage(
        intent.action === "management-clear-entry" ? `${name(intent.playerId)} cleared and verified · NOT ENTERED · No purchase price · No owners · 0% ownership. Prior revision preserved. Still UNPUBLISHED.` : intent.playerId ? `${name(intent.playerId)} saved · ${money(auctionEntry(result.data,intent.playerId).purchasePrice,model.currency_code)} · ${auctionEntry(result.data,intent.playerId).owners.map(o=>`${name(o.buyerId)} — ${o.percentage}%`).join(" · ")} · Ownership Complete. Still UNPUBLISHED.` : "Points & Payouts saved and verified. Still UNPUBLISHED.",
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
      <h3>Calcutta Auction — {model.tournament_id}</h3>
      <p className={styles.steps}>1 · Enter Auction → 2 · Review Auction → 3 · Publish Auction → 4 · Results / Values</p>
      <p>
        Configuration revision {model.configuration_revision} ·
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
          Enter Auction
        </button>
        <button disabled={busy} onClick={discard}>
          {dirty || pending.current
            ? "Discard Changes / Reload"
            : "Reload saved auction"}
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
          <h4>Points &amp; Payouts · Configuration revision {model.configuration_revision}</h4><p>These are the saved award rules. Editing and confirming creates a new configuration revision; it does not publish the auction. Server validation remains final.</p>
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
          <h4>Auction progress <small>· saved auction revision {model.auction_revision}</small></h4>
          <div className={styles.progress}><div><strong>{model.purchases.length} / {count}</strong><span>Golfers entered · saved</span></div><div><strong>{savedOverview.filter(s=>s.status === "COMPLETE").length} / {count}</strong><span>Ownership complete · saved</span></div><div><strong>{attention}</strong><span>Needs attention · includes draft</span></div><div><strong>{money(sum(model.purchases.map(p=>p.purchase_price)),model.currency_code)}</strong><span>Total purchase value · saved</span></div></div>
          <div className={styles.tools}><label>Search golfer or owner<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label><label>Filter entries<select value={filter} onChange={e=>setFilter(e.target.value)}>{["ALL","NOT ENTERED","NEEDS ATTENTION","INCOMPLETE","COMPLETE","INVALID"].map(v=><option key={v}>{v}</option>)}</select></label><button disabled={dirty || busy || Boolean(pending.current)} onClick={()=>setAuctionReview(!auctionReview)}>Review Auction</button></div>
          {auctionReview && <section className={styles.review}><h4>2 · Review saved auction</h4><p>Revision {model.auction_revision} · {savedOverview.filter(s=>s.status === "COMPLETE").length} / {count} ownership complete · {money(sum(model.purchases.map(p=>p.purchase_price)),model.currency_code)} saved.</p><p>Partial roster auctions are supported. Review NOT ENTERED golfers before publishing; every entered purchase must have exactly 100% valid ownership.</p><FinancialSafety /><AuctionRows rows={savedOverview} name={name} currency={model.currency_code} /></section>}
          <AuctionRows rows={overview.filter(s=>(filter === "ALL" || s.status === filter || (filter === "NEEDS ATTENTION" && ["INVALID","INCOMPLETE"].includes(s.status))) && `${s.display_name} ${s.player_id} ${s.entry.owners.map(o=>name(o.buyerId)).join(" ")}`.toLowerCase().includes(search.toLowerCase()))} name={name} currency={model.currency_code} disabled={locked || dirty} onEdit={id=>{changeEntry(auctionEntry(model,id));setAuctionReview(false);}} />
          {entry && (
            <section className={styles.purchaseEditor} ref={editorRef} tabIndex={-1}>
              <h4>Enter Calcutta Purchase — {name(entry.playerId)}</h4><p>Player ID: {entry.playerId} · {dirty ? "UNSAVED LOCAL ENTRY" : "Saved state / no changes"}</p>
              <Field
                label={`Purchase Price (${model.currency_code || "USD"})`}
                value={entry.purchasePrice}
                disabled={locked}
                onChange={(v) => changeEntry({ ...entry, purchasePrice: v })}
              />
              <p>
                Owners are current tournament golfers. Self-purchase and ownership of multiple golfers are supported. Decimal prices are supported; no rounding is applied.
                Percentages are never normalized automatically.
              </p>
              {entry.owners.map((o, i) => (
                <fieldset key={i}>
                  <legend>Owner {i + 1}</legend>
                  <OwnerSelect players={model.players} value={o.buyerId} disabled={locked} index={i} onChange={value=>changeEntry({...entry,owners:entry.owners.map((r,j)=>i===j?{...r,buyerId:value}:r)})} />
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
                disabled={locked || entry.owners.length >= count}
                onClick={() =>
                  changeEntry({
                    ...entry,
                    owners: [...entry.owners, { buyerId: "", percentage: "" }],
                  })
                }
              >
                + Add Owner
              </button>
              <p role="status" className={styles.ownershipTotal}>TOTAL OWNERSHIP: {ownershipState(entry.owners).total}% — {entryStatus(entry,model.players).status}{ownershipState(entry.owners).status === "INCOMPLETE" ? ` · NEEDS ${ownershipState(entry.owners).difference}%` : ownershipState(entry.owners).status === "INVALID" ? " · CHECK SHARES (MAXIMUM 100%)" : ""}</p>
              <button disabled={busy || Boolean(pending.current)} onClick={()=>{if(!dirty || window.confirm("Discard this unsaved entry?")){setEntry(null);setReview(false);setConfirm(false);}}}>Cancel</button>
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
      {tab === "auction" && entry && model.purchases.some(p => p.player_id === entry.playerId) && (
        <section className={styles.clearEntry} aria-label="Clear saved auction entry">
          <button disabled={locked || dirty} onClick={() => { setClearReview(true); setReview(false); setConfirm(false); }}>Clear Auction Entry</button>
          {dirty && <p>Discard or save local edits before clearing the saved entry.</p>}
          {clearReview && <section className={styles.review} role="region" aria-label="Confirm clear auction entry">
            <h4>Clear {name(entry.playerId)}'s auction entry?</h4>
            <p>Current saved purchase price: {money(auctionEntry(model,entry.playerId).purchasePrice,model.currency_code)}</p>
            <ul>{auctionEntry(model,entry.playerId).owners.map(o => <li key={o.buyerId}>{name(o.buyerId)} — {o.percentage}%</li>)}</ul>
            <p>This will return {name(entry.playerId)} to NOT ENTERED. The prior auction revision will remain in audit history. This does not remove the golfer from the tournament or Calcutta roster.</p>
            <div className={styles.actions}>
              <button disabled={busy || Boolean(pending.current)} onClick={() => setClearReview(false)}>Cancel</button>
              <button disabled={locked || dirty} onClick={() => save(false,true)}>Clear Auction Entry</button>
            </div>
          </section>}
        </section>
      )}
      {invalid && <p role="alert">{invalid}</p>}
      <button
        disabled={locked || !dirty || Boolean(invalid)}
        onClick={() => {
          setReview(true);
          setConfirm(false);
        }}
      >
        {tab === "configuration" ? "Review Rule Changes" : "Review Entry Changes"}
      </button>
      {review && (
        <section className={styles.review}>
          <h4>Review carefully · saved → proposed</h4>
          <FinancialSafety />
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
        Use the separate Calcutta Publication card below. Editing
        and saving here never publishes or calculates results. Publication queues the existing recalculation. Current/projected values require current calculated golf sources; official/final values require complete canonical golf sources. R2 uses canonical Scramble pair Full Net, not invented individual Scramble performance.
      </p>
    </section>
  );
}
