"use client";

import { useState } from "react";
import styles from "./director.module.css";

const clean = (value) => String(value || "").trim();

function NotificationHealth({ sandbox }) {
  const checks = [["pwaInstalled", "PWA Installed"], ["permissionGranted", "Notification Permission"], ["pushSubscription", "Push Subscription"], ["readyToSend", "Ready To Send"]];
  const blocker = !sandbox.configured ? "Preview push keys are not configured."
    : !sandbox.health.pwaInstalled ? "Install and open the PWA on this device."
      : !sandbox.health.permissionGranted ? "Allow notifications for this PWA."
        : !sandbox.health.pushSubscription ? "Register this device's push subscription from the Home setup banner."
          : "This device can receive test notifications.";
  return <div className={styles.notificationHealth} aria-label="Notification Health"><h3>Notification Health</h3><ul>{checks.map(([key, label]) => <li data-ready={sandbox.health[key] ? "true" : "false"} key={key}><span aria-hidden="true">{sandbox.health[key] ? "✅" : "○"}</span><strong>{label}</strong></li>)}</ul><p role="status">{blocker}</p></div>;
}

function MatchEditor({ match, operations, busy, save }) {
  const bySlot = (side, slot) => match.players.find((player) => player.side === side && player.slot === slot)?.id || "";
  const [form, setForm] = useState({ Round: clean(match.round), Match: clean(match.match), "Course ID": clean(match.courseId), "Tee Time": clean(match.teeTime), "Starting Hole": clean(match.startingHole), "Team 1 Player 1": bySlot(1, 1), "Team 1 Player 2": bySlot(1, 2), "Team 2 Player 1": bySlot(2, 1), "Team 2 Player 2": bySlot(2, 2) });
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <form className={styles.operationsForm} onSubmit={(event) => { event.preventDefault(); save("match-management", { matchId: match.id, updates: form }); }}>
    <div className={styles.formGrid}><label>Round<input value={form.Round} onChange={update("Round")} inputMode="numeric" /></label><label>Match<input value={form.Match} onChange={update("Match")} inputMode="numeric" /></label><label>Tee Time<input value={form["Tee Time"]} onChange={update("Tee Time")} /></label><label>Course<select value={form["Course ID"]} onChange={update("Course ID")}>{operations.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></label></div>
    <div className={styles.pairingGrid}>{[1, 2].flatMap((side) => [1, 2].map((slot) => { const field = `Team ${side} Player ${slot}`; return <label key={field}>Team {side} · Player {slot}<select value={form[field]} onChange={update(field)}><option value="">Unassigned</option>{operations.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>; }))}</div>
    {operations.capabilities.startingHole ? <label>Starting Hole<input value={form["Starting Hole"]} onChange={update("Starting Hole")} /></label> : <p className={styles.capabilityNote}>Starting Hole is not writable in the verified Live Matches schema.</p>}
    <button disabled={Boolean(busy)} type="submit">Save</button>
  </form>;
}

export function MatchManagement({ operations, busy, save, initialContext = {} }) {
  const initialMatch = operations.matches.find((item) => item.id === initialContext.matchId || item.players.some((player) => player.id === initialContext.playerId));
  const [matchId, setMatchId] = useState(initialMatch?.id || operations.matches[0]?.id || "");
  const match = operations.matches.find((item) => item.id === matchId);
  return <div className={styles.managementPanel}><label>Find match<select value={matchId} onChange={(event) => setMatchId(event.target.value)}>{operations.matches.map((item) => <option value={item.id} key={item.id}>Round {item.round} · Match {item.match} · {item.players.map((player) => player.name).join(" / ")}</option>)}</select></label>{match ? <MatchEditor key={match.id} match={match} operations={operations} busy={busy} save={save} /> : <p>No matches are configured.</p>}</div>;
}

export function CalcuttaManagement({ operations, busy, save, initialContext = {} }) {
  const purchases = operations.calcutta.purchases;
  const initial = purchases.find((item) => item.golferPlayerId === initialContext.playerId);
  const [golferId, setGolferId] = useState(initial?.golferPlayerId || purchases[0]?.golferPlayerId || "");
  const purchase = purchases.find((item) => item.golferPlayerId === golferId);
  const [price, setPrice] = useState(purchase?.purchasePrice || 0); const [ownerId, setOwnerId] = useState(operations.players[0]?.id || ""); const [percentage, setPercentage] = useState(100);
  const owners = operations.calcutta.ownership.filter((item) => item.golferPlayerId === golferId);
  return <div className={styles.managementPanel}><label>Golfer<select value={golferId} onChange={(event) => { const next = event.target.value; setGolferId(next); setPrice(purchases.find((item) => item.golferPlayerId === next)?.purchasePrice || 0); }}>{purchases.map((item) => <option value={item.golferPlayerId} key={item.golferPlayerId}>{item.golfer}</option>)}</select></label>{purchase ? <><form className={styles.inlineOperation} onSubmit={(event) => { event.preventDefault(); save("calcutta-management", { operation: "purchase", golferPlayerId: golferId, purchasePrice: Number(price) }); }}><label>Purchase Price<input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label><button disabled={Boolean(busy)}>Save</button></form><div className={styles.ownerList}><strong>Owners</strong>{owners.length ? owners.map((owner) => <p key={owner.ownerPlayerId}><span>{owner.owner}</span><b>{owner.ownershipPercentage}%</b><button disabled={Boolean(busy)} onClick={() => save("calcutta-management", { operation: "owner-remove", golferPlayerId: golferId, ownerPlayerId: owner.ownerPlayerId })}>Remove</button></p>) : <p>No owners assigned. Add an owner to complete the portfolio.</p>}</div><form className={styles.inlineOperation} onSubmit={(event) => { event.preventDefault(); save("calcutta-management", { operation: "owner-save", golferPlayerId: golferId, ownerPlayerId: ownerId, ownershipPercentage: Number(percentage) }); }}><label>Owner<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{operations.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label><label>Ownership %<input type="number" min="1" max="100" value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label><button disabled={Boolean(busy)}>Save</button></form></> : <p>No Calcutta purchase records are available.</p>}</div>;
}

export function NetSkinsManagement({ operations, busy, save, initialContext = {} }) {
  const playerIds = [...new Set(operations.netSkins.flatMap((entry) => entry.playerIds))]; const [playerId, setPlayerId] = useState(playerIds.includes(initialContext.playerId) ? initialContext.playerId : playerIds[0] || "");
  const entries = operations.netSkins.filter((entry) => entry.playerIds.includes(playerId)); const player = operations.players.find((item) => item.id === playerId); const eligible = entries.length > 0 && entries.every((entry) => entry.eligible);
  return <div className={styles.managementPanel}><label>Player<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{playerIds.map((id) => <option value={id} key={id}>{operations.players.find((item) => item.id === id)?.name || id}</option>)}</select></label>{playerId ? <div className={styles.eligibilityControl}><div><strong>{player?.name || playerId}</strong><span>{entries.length} configured round entr{entries.length === 1 ? "y" : "ies"}</span></div><b data-eligible={eligible ? "true" : "false"}>{eligible ? "Eligible" : "Ineligible"}</b><button disabled={Boolean(busy)} onClick={() => save("net-skins-eligibility", { playerId, eligible: !eligible })}>Save as {eligible ? "Ineligible" : "Eligible"}</button></div> : <p>No Net Skins entries are configured.</p>}</div>;
}

export function NotificationManagement({ sandbox, busy, send, initialContext = {} }) {
  if (!sandbox) return <p>Notification operations are unavailable.</p>;
  const ordered = [...sandbox.templates].sort((left, right) => left.id === initialContext.templateId ? -1 : right.id === initialContext.templateId ? 1 : 0);
  return <div className={styles.notificationSheet}><span>Notification Sandbox</span><NotificationHealth sandbox={sandbox} /><h3>Approved Messages</h3><p>{sandbox.currentDeviceReady ? "Select an approved tournament message." : "This device is not ready to receive notifications."}</p><div className={styles.notificationTemplates}>{ordered.map((template) => <button disabled={Boolean(busy) || !sandbox.currentDeviceReady} onClick={() => send(template)} key={template.id}>{template.label}</button>)}</div><div className={styles.notificationLog}><h3>Notification Log</h3>{sandbox.log?.length ? sandbox.log.map((item, index) => <article key={`${item.templateId || "notification"}-${item.sentAt || index}`}><div><strong>{item.label || item.title || "Tournament notification"}</strong><span>{item.recipient || "Current device"}</span></div><time>{item.sentAt ? new Date(item.sentAt).toLocaleString() : "Pending"}</time><b data-status={item.status === "failed" ? "failed" : "sent"}>{item.status || "Sent"}</b>{item.detail ? <small>{item.detail}</small> : null}</article>) : <p>No notifications sent in this Director session.</p>}</div></div>;
}
