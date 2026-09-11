"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./player-passport-admin.module.css";

export default function PlayerPassportAdmin({ secret, updatedBy }) {
  const [data, setData] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async (method = "GET", body) => {
    const response = await fetch("/api/player-passport/admin", {
      method,
      headers: { "content-type": "application/json", "x-live-admin-secret": secret },
      body: body ? JSON.stringify({ ...body, updatedBy }) : undefined,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    return payload;
  };

  const load = async () => {
    setBusy(true);
    try { setData((await request()).data); setStatus(""); }
    catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const act = async (action, playerId = "", deviceId = "") => {
    if (!updatedBy.trim()) { setStatus("Enter your name in Updated by first."); return; }
    setBusy(true); setStatus("");
    try {
      const payload = await request("POST", { action, playerId, deviceId });
      if (payload.credential) setCredentials((current) => ({ ...current, [playerId]: payload.credential }));
      if (payload.credentials) setCredentials((current) => Object.fromEntries([
        ...Object.entries(current),
        ...payload.credentials.map((item) => [item.player.id, item]),
      ]));
      setData(payload.data);
      setStatus(action === "generate-missing" ? `${payload.credentials.length} missing Player Passports generated.` : "Player Passport updated.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const exportText = useMemo(() => Object.values(credentials).map((item) => {
    const player = data?.players?.find((row) => row.id === (item.playerId || item.player?.id));
    const reference = item.reference;
    return `${player?.name || item.player?.name || item.playerId}\nInvitation: ${location.origin}/activate?player=${reference}\nActivation code: ${item.code}`;
  }).join("\n\n"), [credentials, data]);

  return <section className={styles.shell}>
    <header><div><span>Trusted participant access</span><h2>Player Passport</h2><p>Generate one-time activation credentials and manage remembered devices. Codes are shown only once.</p></div>
      <div><button disabled={busy} onClick={() => act("generate-missing")}>Generate Missing Player Passports</button>{exportText ? <button onClick={() => navigator.clipboard.writeText(exportText)}>Copy New Invitations</button> : null}</div>
    </header>
    {status ? <p className={styles.status}>{status}</p> : null}
    {!data ? <p>Loading Player Passports…</p> : <div className={styles.grid}>{data.players.map((player) => {
      const credential = credentials[player.id];
      return <article key={player.id}>
        <div className={styles.identity}><strong>{player.name}</strong><span>{player.activationActive ? "Activation ready" : player.activationUsedAt ? "Activation used" : player.version ? "Activation disabled" : "Not generated"}</span><small>{player.trustedDeviceCount} trusted device{player.trustedDeviceCount === 1 ? "" : "s"}</small></div>
        <div className={styles.actions}>
          <button disabled={busy} onClick={() => {
            if (player.version && !window.confirm("Generate a new one-time activation code? Existing trusted devices will remain active.")) return;
            act("generate", player.id);
          }}>{player.version ? "Regenerate code" : "Generate activation"}</button>
          {player.activationActive ? <button disabled={busy} onClick={() => act("disable", player.id)}>Disable activation</button> : null}
          {player.trustedDeviceCount ? <button disabled={busy} onClick={() => {
            if (window.confirm(`Revoke all trusted devices for ${player.name}?`)) act("revoke-devices", player.id);
          }}>Revoke all devices</button> : null}
        </div>
        {credential ? <div className={styles.reveal}>
          <b>Shown once</b><strong>Activation code: {credential.code}</strong>
          <a href={`/activate?player=${credential.reference}`} target="_blank">Open invitation link ↗</a>
          <button onClick={() => navigator.clipboard.writeText(`${location.origin}/activate?player=${credential.reference}`)}>Copy invitation link</button>
          <button onClick={() => navigator.clipboard.writeText(credential.code)}>Copy code</button>
        </div> : null}
        {player.trustedDevices?.length ? <details><summary>Trusted devices</summary>{player.trustedDevices.map((device) => <div className={styles.device} key={device.id}><span>{device.label}<small>Created {device.createdAt}</small></span><button disabled={busy} onClick={() => act("revoke-devices", player.id, device.id)}>Revoke</button></div>)}</details> : null}
      </article>;
    })}</div>}
  </section>;
}
