"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./activate.module.css";

export default function PlayerPassportActivation({ invitedReference = "", activePlayer = null }) {
  const [data, setData] = useState(null);
  const [reference, setReference] = useState(invitedReference);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(true);
  const [activated, setActivated] = useState(activePlayer);

  useEffect(() => {
    if (activePlayer) {
      setBusy(false);
      return;
    }
    fetch(`/api/player-passport/activation${invitedReference ? `?player=${encodeURIComponent(invitedReference)}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setData(payload.data);
        setReference(payload.data.selectedReference || "");
      })
      .catch((error) => setStatus(error.message || "Unable to load activation."))
      .finally(() => setBusy(false));
  }, [activePlayer, invitedReference]);

  const selected = useMemo(() => reference
    ? data?.players?.find((player) => player.reference === reference)
    : null, [data, reference]);

  const activate = async () => {
    setBusy(true); setStatus("Activating Player Passport…");
    try {
      const response = await fetch("/api/player-passport/activation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, activationCode: code, deviceLabel: navigator.userAgent.includes("Mobile") ? "Mobile browser / PWA" : "Browser / PWA" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setActivated(payload.player);
      setStatus("");
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new Event("player-passport-changed"));
      window.setTimeout(() => window.location.replace("/home"), 500);
    } catch (error) {
      setStatus(error.message || "Unable to activate Player Passport.");
    } finally { setBusy(false); }
  };

  const clearPassport = async () => {
    await fetch("/api/player-passport/session", { method: "DELETE" });
    setActivated(null);
    setData(null);
    setReference("");
    setCode("");
    window.history.replaceState({}, "", "/activate");
    window.dispatchEvent(new Event("player-passport-cleared"));
    window.location.reload();
  };

  if (activated) return <section className={styles.shell}>
    <span className={styles.eyebrow}>Player Passport active</span>
    <h1>Welcome back, {activated.name}.</h1>
    <p>This device remembers you. Your Passport can open scorecards only for matches in which you are participating.</p>
    <div className={styles.actions}><Link href="/home">Open My Tournament</Link><Link href="/my-match">Open My Match</Link></div>
    <button type="button" className={styles.fallback} onClick={clearPassport}>This isn’t me</button>
    <p className={styles.note}>For the app experience, use your browser’s Add to Home Screen option.</p>
  </section>;

  return <section className={styles.shell}>
    <span className={styles.eyebrow}>SBI Player Passport</span>
    <h1>{data?.tournament?.name || "Welcome to the Sandbagger Invitational"}</h1>
    <p>Activate your Player Passport to find your matches and enter live scores from this trusted device.</p>
    {busy && !data ? <p className={styles.status}>Loading eligible players…</p> : <>
      <label>Who are you?
        <select value={reference} onChange={(event) => setReference(event.target.value)}>
          <option value="">Select your name</option>
          {(data?.players || []).map((player) => <option value={player.reference} disabled={!player.activationAvailable} key={player.name}>{player.name}{!player.activationAvailable ? " · Not ready" : ""}</option>)}
        </select>
      </label>
      {selected ? <div className={styles.confirm}><span>Confirm your identity</span><strong>Are you {selected.name}?</strong><small>The invitation link alone does not activate access.</small></div> : null}
      <label>One-time activation code
        <input type="password" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
      </label>
      <button type="button" disabled={busy || !reference || !code.trim()} onClick={activate}>{busy ? "Activating…" : "Activate Player Passport"}</button>
    </>}
    {status ? <p className={styles.status}>{status}</p> : null}
    <Link className={styles.fallback} href="/score">Use a match code instead</Link>
  </section>;
}
