"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./activate.module.css";

export default function PlayerPassportActivation({ invitedReference = "" }) {
  const [data, setData] = useState(null);
  const [reference, setReference] = useState(invitedReference);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(true);
  const [activated, setActivated] = useState(null);

  useEffect(() => {
    fetch(`/api/player-passport/activation${invitedReference ? `?player=${encodeURIComponent(invitedReference)}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setData(payload.data);
        setReference(payload.data.selectedReference || "");
      })
      .catch((error) => setStatus(error.message || "Unable to load activation."))
      .finally(() => setBusy(false));
  }, [invitedReference]);

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
    } catch (error) {
      setStatus(error.message || "Unable to activate Player Passport.");
    } finally { setBusy(false); }
  };

  if (activated) return <section className={styles.shell}>
    <span className={styles.eyebrow}>Player Passport activated</span>
    <h1>Welcome, {activated.name}.</h1>
    <p>This device will remember you. Your Passport can open scorecards only for matches in which you are participating.</p>
    <div className={styles.actions}><Link href="/score">Open My Match</Link><Link href="/">View My Tournament</Link></div>
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
