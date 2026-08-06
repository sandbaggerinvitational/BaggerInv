"use client";

import { useEffect, useRef, useState } from "react";
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
  const [form, setForm] = useState(() => ({ Round: clean(match.round), Match: clean(match.match), "Course ID": clean(match.courseId), "Tee Time": clean(match.teeTime), ...(operations.capabilities.startingHole ? { "Starting Hole": clean(match.startingHole) } : {}), "Team 1 Player 1": bySlot(1, 1), "Team 1 Player 2": bySlot(1, 2), "Team 2 Player 1": bySlot(2, 1), "Team 2 Player 2": bySlot(2, 2) }));
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <form className={styles.operationsForm} onSubmit={(event) => { event.preventDefault(); save("match-management", { matchId: match.id, updates: form }); }}>
    <div className={styles.formGrid}><label>Round<input value={form.Round} onChange={update("Round")} inputMode="numeric" /></label><label>Match<input value={form.Match} onChange={update("Match")} inputMode="numeric" /></label><label>Tee Time<input value={form["Tee Time"]} onChange={update("Tee Time")} /></label><label>Course<select value={form["Course ID"]} onChange={update("Course ID")}>{operations.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></label></div>
    <div className={styles.pairingGrid}>{[1, 2].flatMap((side) => [1, 2].map((slot) => { const field = `Team ${side} Player ${slot}`; return <label key={field}>Team {side} · Player {slot}<select value={form[field]} onChange={update(field)}><option value="">Unassigned</option>{operations.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>; }))}</div>
    {operations.capabilities.startingHole ? <label>Starting Hole<input value={form["Starting Hole"]} onChange={update("Starting Hole")} /></label> : null}
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
  const ownershipFor = (id) => operations.calcutta.ownership.filter((item) => item.golferPlayerId === id).map((item) => ({ ownerPlayerId: item.ownerPlayerId, ownershipPercentage: String(item.ownershipPercentage) }));
  const [price, setPrice] = useState(purchase?.purchasePrice || 0);
  const [ownerRows, setOwnerRows] = useState(() => ownershipFor(initial?.golferPlayerId || purchases[0]?.golferPlayerId || ""));
  const ownerSelectRefs = useRef([]);
  const pendingOwnerFocus = useRef(null);
  useEffect(() => { if (pendingOwnerFocus.current === null) return; ownerSelectRefs.current[pendingOwnerFocus.current]?.focus(); pendingOwnerFocus.current = null; }, [ownerRows.length]);
  const total = ownerRows.reduce((sum, owner) => sum + (Number(owner.ownershipPercentage) || 0), 0);
  const hasBlank = ownerRows.some((owner) => !owner.ownerPlayerId || owner.ownershipPercentage === "");
  const hasInvalidPercentage = ownerRows.some((owner) => !Number.isFinite(Number(owner.ownershipPercentage)) || Number(owner.ownershipPercentage) <= 0 || Number(owner.ownershipPercentage) > 100);
  const selectedOwners = ownerRows.map((owner) => owner.ownerPlayerId).filter(Boolean);
  const hasDuplicate = new Set(selectedOwners).size !== selectedOwners.length;
  const ownershipComplete = ownerRows.length > 0 && !hasBlank && !hasInvalidPercentage && !hasDuplicate && Math.abs(total - 100) < 0.000001;
  const ownershipStatus = ownershipComplete ? { tone: "ready", icon: "🟢", message: "✓ Ready to Save" } : total < 100 ? { tone: "under", icon: "🟡", message: `Need ${100 - total}% more.` } : total > 100 ? { tone: "over", icon: "🔴", message: `Reduce ownership by ${total - 100}%.` } : { tone: "invalid", icon: "🔴", message: "Resolve ownership errors." };
  const updateOwner = (index, field, value) => setOwnerRows((current) => current.map((owner, ownerIndex) => ownerIndex === index ? { ...owner, [field]: value } : owner));
  const addOwner = () => setOwnerRows((current) => { pendingOwnerFocus.current = current.length; return [...current, { ownerPlayerId: "", ownershipPercentage: "" }]; });
  const removeOwner = (index) => setOwnerRows((current) => current.filter((_, ownerIndex) => ownerIndex !== index));
  return <div className={styles.managementPanel}><label>Golfer<select value={golferId} onChange={(event) => { const next = event.target.value; setGolferId(next); setPrice(purchases.find((item) => item.golferPlayerId === next)?.purchasePrice || 0); setOwnerRows(ownershipFor(next)); }}>{purchases.map((item) => <option value={item.golferPlayerId} key={item.golferPlayerId}>{item.golfer}</option>)}</select></label>{purchase ? <><form className={styles.inlineOperation} onSubmit={(event) => { event.preventDefault(); save("calcutta-management", { operation: "purchase", golferPlayerId: golferId, purchasePrice: Number(price) }); }}><label>Purchase Price<input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label><button disabled={Boolean(busy)}>Save</button></form><form className={styles.ownershipEditor} onSubmit={(event) => { event.preventDefault(); if (!ownershipComplete) return; save("calcutta-management", { operation: "owner-group", golferPlayerId: golferId, owners: ownerRows.map((owner) => ({ ownerPlayerId: owner.ownerPlayerId, ownershipPercentage: Number(owner.ownershipPercentage) })) }); }}><div className={styles.ownershipHeader}><strong>Owners</strong><div className={styles.ownershipStatus} data-status={ownershipStatus.tone} role="status"><span aria-hidden="true">{ownershipStatus.icon}</span><div><small>Ownership Total</small><b>{total}%</b><em>{ownershipStatus.message}</em></div></div></div>{ownerRows.map((owner, index) => <fieldset className={hasDuplicate && owner.ownerPlayerId && selectedOwners.filter((id) => id === owner.ownerPlayerId).length > 1 ? styles.invalidOwner : ""} key={`${index}-${owner.ownerPlayerId}`}><label>Owner<select ref={(element) => { ownerSelectRefs.current[index] = element; }} value={owner.ownerPlayerId} onChange={(event) => updateOwner(index, "ownerPlayerId", event.target.value)}><option value="">Select owner</option>{operations.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label><label>Ownership %<div className={styles.ownershipPercentInput}><input aria-invalid={owner.ownershipPercentage === "" || Number(owner.ownershipPercentage) <= 0 || Number(owner.ownershipPercentage) > 100 ? "true" : "false"} aria-label={`Owner ${index + 1} ownership percentage`} type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={owner.ownershipPercentage} onChange={(event) => updateOwner(index, "ownershipPercentage", event.target.value)} /><span aria-hidden="true">%</span></div></label><button className={styles.removeOwnerButton} type="button" aria-label={`Remove owner ${index + 1}`} title="Remove owner" disabled={Boolean(busy)} onClick={() => removeOwner(index)}><span aria-hidden="true">⌫</span></button></fieldset>)}<button className={styles.addOwnerButton} type="button" disabled={Boolean(busy)} onClick={addOwner}>+ Add Another Owner</button><div className={styles.ownershipValidation} role="status">{!ownerRows.length ? <p>Add at least one owner.</p> : null}{hasDuplicate ? <p>Each owner may only appear once.</p> : null}{hasBlank ? <p>Complete every owner and ownership percentage.</p> : null}{ownerRows.some((owner) => Number(owner.ownershipPercentage) > 100) ? <p>Ownership percentages cannot exceed 100%.</p> : null}{ownerRows.some((owner) => owner.ownershipPercentage !== "" && Number(owner.ownershipPercentage) <= 0) ? <p>Ownership percentages must be greater than 0%.</p> : null}{ownerRows.length && !hasBlank && !hasInvalidPercentage && !hasDuplicate && Math.abs(total - 100) >= 0.000001 ? <p>Ownership percentages must total exactly 100%. Current total: {total}%</p> : null}</div><button className={styles.saveOwnershipButton} disabled={Boolean(busy) || !ownershipComplete} type="submit">Save Changes</button></form></> : <p>No Calcutta purchase records are available.</p>}</div>;
}

export function NetSkinsManagement({ operations, busy, save, initialContext = {} }) {
  const formatName = (value) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[String(value || "").toUpperCase()] || String(value || "");
  const playerIds = [...new Set(operations.netSkins.flatMap((entry) => entry.playerIds))];
  const configuredRounds = [...new Map([...operations.netSkins, ...operations.matches].map((entry) => [Number(entry.round), { round: Number(entry.round), format: formatName(entry.format) }])).values()].filter((entry) => Number.isFinite(entry.round)).sort((left, right) => left.round - right.round);
  const initialPlayerId = playerIds.includes(initialContext.playerId) ? initialContext.playerId : playerIds[0] || "";
  const eligibilityFor = (id) => Object.fromEntries(configuredRounds.map((item) => { const entries = operations.netSkins.filter((entry) => entry.playerIds.includes(id) && Number(entry.round) === item.round); return [item.round, entries.length > 0 && entries.every((entry) => entry.eligible)]; }));
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [savedEligibility, setSavedEligibility] = useState(() => eligibilityFor(initialPlayerId));
  const [draftEligibility, setDraftEligibility] = useState(() => eligibilityFor(initialPlayerId));
  const [highlightedRound, setHighlightedRound] = useState(null);
  const highlightTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);
  const pending = configuredRounds.filter((item) => Boolean(draftEligibility[item.round]) !== Boolean(savedEligibility[item.round]));
  const selectPlayer = (next) => { const eligibility = eligibilityFor(next); setPlayerId(next); setSavedEligibility(eligibility); setDraftEligibility(eligibility); };
  const toggleRound = (round) => { setDraftEligibility((current) => ({ ...current, [round]: !current[round] })); setHighlightedRound(round); window.clearTimeout(highlightTimer.current); highlightTimer.current = window.setTimeout(() => setHighlightedRound(null), 480); };
  return <form className={styles.managementPanel} onSubmit={(event) => { event.preventDefault(); if (!pending.length) return; save("net-skins-eligibility", { playerId, updates: pending.map((item) => ({ round: item.round, eligible: Boolean(draftEligibility[item.round]) })) }); }}><label>Player<select value={playerId} onChange={(event) => selectPlayer(event.target.value)}>{playerIds.map((id) => <option value={id} key={id}>{operations.players.find((item) => item.id === id)?.name || id}</option>)}</select></label><div className={styles.skinsBulkEditor}>{configuredRounds.map((item) => { const eligible = Boolean(draftEligibility[item.round]); const changed = pending.some((pendingRound) => pendingRound.round === item.round); return <article data-changed={changed ? "true" : "false"} data-highlighted={highlightedRound === item.round ? "true" : "false"} key={item.round}><strong>Round {item.round} • {item.format}</strong><button className={styles.eligibilitySwitch} type="button" role="switch" aria-checked={eligible} aria-label={`Round ${item.round} ${item.format} eligibility`} disabled={Boolean(busy)} onClick={() => toggleRound(item.round)}><i aria-hidden="true" /><b>{eligible ? "ON" : "OFF"}</b></button></article>; })}</div>{pending.length ? <div className={styles.unsavedChanges} role="status" aria-label={`Unsaved Changes. ${pending.length} update${pending.length === 1 ? "" : "s"} pending.`}><strong><span aria-hidden="true">●</span> Unsaved Changes</strong></div> : null}<button className={styles.saveSkinsButton} disabled={Boolean(busy) || !pending.length} type="submit">Save Changes</button></form>;
}

export function NotificationManagement({ sandbox, busy, send, initialContext = {} }) {
  if (!sandbox) return <p>Notification operations are unavailable.</p>;
  const ordered = [...sandbox.templates].sort((left, right) => left.id === initialContext.templateId ? -1 : right.id === initialContext.templateId ? 1 : 0);
  return <div className={styles.notificationSheet}><span>Notification Sandbox</span><NotificationHealth sandbox={sandbox} /><h3>Approved Messages</h3><p>{sandbox.currentDeviceReady ? "Select an approved tournament message." : "This device is not ready to receive notifications."}</p><div className={styles.notificationTemplates}>{ordered.map((template) => <button disabled={Boolean(busy) || !sandbox.currentDeviceReady} onClick={() => send(template)} key={template.id}>{template.label}</button>)}</div><div className={styles.notificationLog}><h3>Notification Log</h3>{sandbox.log?.length ? sandbox.log.map((item, index) => <article key={`${item.templateId || "notification"}-${item.sentAt || index}`}><div><strong>{item.label || item.title || "Tournament notification"}</strong><span>{item.recipient || "Current device"}</span></div><time>{item.sentAt ? new Date(item.sentAt).toLocaleString() : "Pending"}</time><b data-status={item.status === "failed" ? "failed" : "sent"}>{item.status || "Sent"}</b>{item.detail ? <small>{item.detail}</small> : null}</article>) : <p>No notifications sent in this Director session.</p>}</div></div>;
}
