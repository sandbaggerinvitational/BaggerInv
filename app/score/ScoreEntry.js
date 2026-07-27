"use client";

import { useMemo, useState } from "react";
import styles from "./score.module.css";

const jsonScores = (value) => {
  try { return JSON.parse(value || "[]"); } catch { return []; }
};

function playerIds(match, side) {
  return [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]].filter(Boolean);
}

export default function ScoreEntry() {
  const [mode, setMode] = useState("match");
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const [token, setToken] = useState("");
  const [matchId, setMatchId] = useState("");
  const [matchOptions, setMatchOptions] = useState([]);
  const [data, setData] = useState(null);
  const [holeNumber, setHoleNumber] = useState(1);
  const [gross, setGross] = useState({ team1: [], team2: [] });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The scoring request failed.");
    return payload;
  };

  const loadMatch = async (id, sessionToken = token) => {
    const response = await fetch(`/api/scoring/matches/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load the match.");
    setMatchId(id);
    setData(payload.data);
    const scored = payload.data.holeScores.map((item) => Number(item["Hole Number"]));
    const targetHole = payload.data.match["Match Status"] === "Final"
      ? Math.max(1, ...scored)
      : Array.from({ length: 18 }, (_, index) => index + 1)
        .find((hole) => !scored.includes(hole)) || 18;
    selectHole(targetHole, payload.data);
  };

  const login = async () => {
    setBusy(true); setStatus("Opening scoring…");
    try {
      const payload = await request("/api/scoring/session", {
        method: "POST",
        body: JSON.stringify({
          scorerName: name,
          ...(mode === "admin" ? { adminSecret: credential } : { accessCode: credential }),
        }),
      });
      setToken(payload.token);
      if (payload.scope === "match") {
        await loadMatch(payload.matchId, payload.token);
      } else {
        const response = await fetch("/api/scoring/matches", {
          headers: { authorization: `Bearer ${payload.token}` },
          cache: "no-store",
        });
        const list = await response.json();
        if (!response.ok) throw new Error(list.error || "Unable to load matches.");
        setMatchOptions(list.matches || []);
      }
      setStatus("");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const selectHole = (number, source = data) => {
    setHoleNumber(number);
    const saved = source?.holeScores?.find((item) => Number(item["Hole Number"]) === number);
    setGross({
      team1: jsonScores(saved?.["Team 1 Gross Scores"]),
      team2: jsonScores(saved?.["Team 2 Gross Scores"]),
    });
  };

  const match = data?.match || {};
  const isFinal = match["Match Status"] === "Final";
  const format = String(match.Format || "").toUpperCase();
  const slots = format === "BB" ? 2 : 1;
  const savedHole = data?.holeScores?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const courseHole = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const completed = useMemo(() => new Set((data?.holeScores || []).map((item) => Number(item["Hole Number"]))), [data]);

  const setScore = (side, index, value) => setGross((current) => {
    const next = [...current[side]];
    next[index] = value;
    return { ...current, [side]: next };
  });

  const save = async () => {
    setBusy(true); setStatus(`Saving hole ${holeNumber}…`);
    try {
      await request(`/api/scoring/matches/${encodeURIComponent(matchId)}`, {
        method: "POST",
        body: JSON.stringify({
          holeNumber,
          team1GrossScores: gross.team1,
          team2GrossScores: gross.team2,
          expectedRevision: Number(savedHole?.Revision || 0),
        }),
      });
      await loadMatch(matchId);
      setStatus(`Hole ${holeNumber} saved.`);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  if (!token) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>Enter scores</h1><p>Use the code assigned to your match.</p></div>
    <div className={styles.mode}>
      <button data-active={mode === "match"} onClick={() => setMode("match")}>Match code</button>
      <button data-active={mode === "admin"} onClick={() => setMode("admin")}>Administrator</button>
    </div>
    <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>{mode === "admin" ? "Admin password" : "Match code"}<input type="password" autoCapitalize="characters" value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
    <button className={styles.primary} disabled={busy || !name.trim() || !credential.trim()} onClick={login}>Open scoring</button>
    {status && <p className={styles.status}>{status}</p>}
  </section>;

  if (!data) return <section className={styles.login}>
    <div className={styles.brand}><span>ADMIN</span><h1>Choose a match</h1></div>
    <select value={matchId} onChange={(event) => setMatchId(event.target.value)}>
      <option value="">Select a match</option>
      {matchOptions.map((item) => <option key={item["Match ID"]} value={item["Match ID"]}>
        {item.Year} · Round {item.Round} · Match {item.Match} · {item.Format}
      </option>)}
    </select>
    <button className={styles.primary} disabled={!matchId || busy} onClick={() => loadMatch(matchId)}>Open match</button>
    {status && <p className={styles.status}>{status}</p>}
  </section>;

  return <section className={styles.shell}>
    <header><div><span>{format} · Round {match.Round}</span><h1>Match {match.Match}</h1><p>{match["Course ID"]} · Hole {holeNumber} · SI {courseHole?.["Stroke Index"] || "—"}</p></div><b>{completed.size}/18</b></header>
    <nav className={styles.holes}>{Array.from({ length: 18 }, (_, index) => index + 1).map((hole) =>
      <button key={hole} data-active={hole === holeNumber} data-complete={completed.has(hole)} onClick={() => selectHole(hole)}>{hole}</button>
    )}</nav>
    <div className={styles.teams}>{[1, 2].map((side) => {
      const ids = playerIds(match, side);
      const key = side === 1 ? "team1" : "team2";
      return <fieldset key={side}><legend>Team {side}</legend>
        {Array.from({ length: slots }, (_, index) => <label key={index}>
          {format === "SC" ? "Team gross score" : ids[index] || `Player ${index + 1}`}
          <input disabled={isFinal} type="number" inputMode="numeric" min="1" max="20" value={gross[key][index] || ""} onChange={(event) => setScore(key, index, event.target.value)} />
        </label>)}
        {savedHole && <small>Net {savedHole[`Team ${side} Net Score`]}</small>}
      </fieldset>;
    })}</div>
    {savedHole && <div className={styles.result}><span>Hole result</span><strong>{savedHole["Hole Winner"]}</strong><small>Revision {savedHole.Revision} · {savedHole["Updated By"]}</small></div>}
    {isFinal && <div className={styles.result}><span>Match complete</span><strong>{match.Notes || match["Match Status Text"] || "Final"}</strong><small>An administrator can reopen the match for corrections.</small></div>}
    <button className={styles.primary} disabled={isFinal || busy || gross.team1.length < slots || gross.team2.length < slots} onClick={save}>{isFinal ? "Match finalized" : savedHole ? "Update hole" : "Save hole"}</button>
    {status && <p className={styles.status}>{status}</p>}
  </section>;
}
