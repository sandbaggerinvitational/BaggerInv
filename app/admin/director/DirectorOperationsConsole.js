"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./director.module.css";

const clean = (value) => String(value || "").trim();

export function OperationsSection({ id, eyebrow, title, summary, children, open = false }) {
  return <details className={styles.operationsSection} id={id} open={open}>
    <summary><span><small>{eyebrow}</small><strong>{title}</strong><em>{summary}</em></span><b aria-hidden="true">+</b></summary>
    <div className={styles.operationsBody}>{children}</div>
  </details>;
}

export function DirectorSearch({ operations, notificationTemplates = [] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = clean(query).toLowerCase();
    if (needle.length < 2) return [];
    const found = [];
    for (const player of operations.players || []) {
      if (!player.name.toLowerCase().includes(needle)) continue;
      const matches = operations.matches.filter((match) => match.players.some((item) => item.id === player.id));
      if (matches.length) found.push({ id: `match-${player.id}`, label: `${player.name} · ${matches.length} match${matches.length === 1 ? "" : "es"}`, type: "Match & Pairing", href: "#match-management" });
      if (operations.calcutta.purchases.some((item) => item.golferPlayerId === player.id) || operations.calcutta.ownership.some((item) => item.ownerPlayerId === player.id)) found.push({ id: `calcutta-${player.id}`, label: player.name, type: "Calcutta", href: "#calcutta-management" });
      if (operations.netSkins.some((item) => item.playerIds.includes(player.id))) found.push({ id: `skins-${player.id}`, label: player.name, type: "Net Skins", href: "#net-skins-management" });
      found.push({ id: `profile-${player.id}`, label: player.name, type: "Player Profile", href: player.slug ? `/players/${player.slug}` : "/players" });
    }
    for (const template of notificationTemplates) if (`${template.label} ${template.id}`.toLowerCase().includes(needle)) found.push({ id: `notification-${template.id}`, label: template.label, type: "Notification", href: "#notifications" });
    return found.slice(0, 12);
  }, [notificationTemplates, operations, query]);
  return <section className={styles.directorSearch} aria-labelledby="director-search-title">
    <label htmlFor="director-search"><span>Mission Control</span><strong id="director-search-title">Find an operation</strong></label>
    <input id="director-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, match, Calcutta, Net Skins…" autoComplete="off" />
    {query.length >= 2 ? <div className={styles.searchResults}>{results.length ? results.map((result) => <Link href={result.href} key={result.id}><span>{result.label}</span><small>{result.type}</small></Link>) : <p>No Director tools match “{query}”.</p>}</div> : null}
  </section>;
}

function MatchEditor({ match, operations, busy, act }) {
  const bySlot = (side, slot) => match.players.find((player) => player.side === side && player.slot === slot)?.id || "";
  const [form, setForm] = useState({
    Round: clean(match.round), Match: clean(match.match), "Course ID": clean(match.courseId), "Tee Time": clean(match.teeTime), "Starting Hole": clean(match.startingHole),
    "Team 1 Player 1": bySlot(1, 1), "Team 1 Player 2": bySlot(1, 2), "Team 2 Player 1": bySlot(2, 1), "Team 2 Player 2": bySlot(2, 2),
  });
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <form className={styles.operationsForm} onSubmit={(event) => { event.preventDefault(); act("match-management", { matchId: match.id, updates: form }); }}>
    <div className={styles.formGrid}><label>Round<input value={form.Round} onChange={update("Round")} inputMode="numeric" /></label><label>Match<input value={form.Match} onChange={update("Match")} inputMode="numeric" /></label><label>Tee Time<input value={form["Tee Time"]} onChange={update("Tee Time")} /></label><label>Course<select value={form["Course ID"]} onChange={update("Course ID")}>{operations.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></label></div>
    <div className={styles.pairingGrid}>{[1, 2].flatMap((side) => [1, 2].map((slot) => { const field = `Team ${side} Player ${slot}`; return <label key={field}>Team {side} · Player {slot}<select value={form[field]} onChange={update(field)}><option value="">Unassigned</option>{operations.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>; }))}</div>
    {operations.capabilities.startingHole ? <label>Starting Hole<input value={form["Starting Hole"]} onChange={update("Starting Hole")} /></label> : <p className={styles.capabilityNote}>Starting Hole is not writable in the verified Live Matches schema.</p>}
    <button disabled={Boolean(busy)} type="submit">Save Match Changes</button>
  </form>;
}

export function MatchManagement({ operations, busy, act }) {
  const [matchId, setMatchId] = useState(operations.matches[0]?.id || "");
  const match = operations.matches.find((item) => item.id === matchId);
  return <div className={styles.managementPanel}><label>Find match<select value={matchId} onChange={(event) => setMatchId(event.target.value)}>{operations.matches.map((item) => <option value={item.id} key={item.id}>Round {item.round} · Match {item.match} · {item.players.map((player) => player.name).join(" / ")}</option>)}</select></label>{match ? <MatchEditor key={match.id} match={match} operations={operations} busy={busy} act={act} /> : <p>No matches are configured.</p>}</div>;
}

export function CalcuttaManagement({ operations, busy, act }) {
  const purchases = operations.calcutta.purchases;
  const [golferId, setGolferId] = useState(purchases[0]?.golferPlayerId || "");
  const purchase = purchases.find((item) => item.golferPlayerId === golferId);
  const [price, setPrice] = useState(purchase?.purchasePrice || 0);
  const [ownerId, setOwnerId] = useState(operations.players[0]?.id || "");
  const [percentage, setPercentage] = useState(100);
  const owners = operations.calcutta.ownership.filter((item) => item.golferPlayerId === golferId);
  return <div className={styles.managementPanel}><label>Golfer<select value={golferId} onChange={(event) => { const next = event.target.value; setGolferId(next); setPrice(purchases.find((item) => item.golferPlayerId === next)?.purchasePrice || 0); }}>{purchases.map((item) => <option value={item.golferPlayerId} key={item.golferPlayerId}>{item.golfer}</option>)}</select></label>{purchase ? <>
    <form className={styles.inlineOperation} onSubmit={(event) => { event.preventDefault(); act("calcutta-management", { operation: "purchase", golferPlayerId: golferId, purchasePrice: Number(price) }); }}><label>Purchase Price<input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label><button disabled={Boolean(busy)}>Update Price</button></form>
    <div className={styles.ownerList}><strong>Owners</strong>{owners.length ? owners.map((owner) => <p key={owner.ownerPlayerId}><span>{owner.owner}</span><b>{owner.ownershipPercentage}%</b><button disabled={Boolean(busy)} onClick={() => act("calcutta-management", { operation: "owner-remove", golferPlayerId: golferId, ownerPlayerId: owner.ownerPlayerId })}>Remove</button></p>) : <p>No owners assigned. Add an owner to complete the portfolio.</p>}</div>
    <form className={styles.inlineOperation} onSubmit={(event) => { event.preventDefault(); act("calcutta-management", { operation: "owner-save", golferPlayerId: golferId, ownerPlayerId: ownerId, ownershipPercentage: Number(percentage) }); }}><label>Owner<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{operations.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label><label>Ownership %<input type="number" min="1" max="100" value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label><button disabled={Boolean(busy)}>Add or Update Owner</button></form>
  </> : <p>No Calcutta purchase records are available.</p>}</div>;
}

export function NetSkinsManagement({ operations, busy, act }) {
  const playerIds = [...new Set(operations.netSkins.flatMap((entry) => entry.playerIds))];
  const [playerId, setPlayerId] = useState(playerIds[0] || "");
  const entries = operations.netSkins.filter((entry) => entry.playerIds.includes(playerId));
  const player = operations.players.find((item) => item.id === playerId);
  const eligible = entries.length > 0 && entries.every((entry) => entry.eligible);
  return <div className={styles.managementPanel}><label>Player<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{playerIds.map((id) => <option value={id} key={id}>{operations.players.find((playerItem) => playerItem.id === id)?.name || id}</option>)}</select></label>{playerId ? <div className={styles.eligibilityControl}><div><strong>{player?.name || playerId}</strong><span>{entries.length} configured round entr{entries.length === 1 ? "y" : "ies"}</span></div><b data-eligible={eligible ? "true" : "false"}>{eligible ? "Eligible" : "Ineligible"}</b><button disabled={Boolean(busy)} onClick={() => act("net-skins-eligibility", { playerId, eligible: !eligible })}>Mark {eligible ? "Ineligible" : "Eligible"}</button></div> : <p>No Net Skins entries are configured.</p>}</div>;
}
