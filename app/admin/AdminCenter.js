"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuideEditor from "./tournament-guide/GuideEditor";
import LiveMatchControl from "./live-matches/LiveMatchControl";
import OddsAdmin from "../odds-center/admin/OddsAdmin";
import TournamentEditor from "./TournamentEditor";
import styles from "./admin-center.module.css";

const TABS = [
  ["overview", "Overview"], ["tournament", "Tournament"], ["guide", "Guide"],
  ["live-matches", "Live Matches"], ["odds", "Odds"], ["players", "Players"],
  ["data-health", "Data Health"], ["preview", "Preview"],
];

const PREVIEWS = [["Homepage", "/"], ["Tournament Guide", "/tournament-guide"], ["Match Center", "/live"], ["Odds Center", "/odds-center"], ["Tournament History", "/history"], ["Champions", "/champions"]];

export default function AdminCenter({ tournaments }) {
  const search = useSearchParams();
  const router = useRouter();
  const requestedTab = search.get("tab");
  const initialTab = TABS.some(([id]) => id === requestedTab) ? requestedTab : "overview";
  const requestedTournament = search.get("tournament");
  const initialTournament = tournaments.find((item) => String(item.id) === requestedTournament || String(item.year) === requestedTournament) || tournaments[0];
  const [active, setActive] = useState(initialTab);
  const [tournamentId, setTournamentId] = useState(String(initialTournament?.id || ""));
  const [secret, setSecret] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const tournament = useMemo(() => tournaments.find((item) => String(item.id) === tournamentId) || tournaments[0], [tournaments, tournamentId]);

  function updateUrl(nextTab = active, nextTournament = tournamentId) {
    router.replace(`/admin?tab=${encodeURIComponent(nextTab)}&tournament=${encodeURIComponent(nextTournament)}`, { scroll: false });
  }
  function selectTab(tab) { setActive(tab); updateUrl(tab, tournamentId); }
  function selectTournament(id) { setTournamentId(id); updateUrl(active, id); }
  async function login() {
    setBusy(true); setStatus("Checking admin access…");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "x-admin-secret": secret } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to open Admin Center.");
      setAuthorized(true); setStatus("");
      const [guideResponse, liveResponse] = await Promise.all([
        fetch("/api/tournament-guide", { headers: { "x-guide-admin-secret": secret } }),
        fetch("/api/live-matches", { headers: { "x-live-admin-secret": secret } }),
      ]);
      if (guideResponse.ok && liveResponse.ok) {
        const [guidePayload, livePayload] = await Promise.all([guideResponse.json(), liveResponse.json()]);
        setAdminData({ guide: guidePayload.data, live: livePayload.data });
      }
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  const shortcuts = [["Edit Tournament", "tournament"], ["Update Live Matches", "live-matches"], ["Edit Tournament Guide", "guide"], ["Publish Odds", "odds"], ["Run Data Check", "data-health"], ["Open Public Preview", "preview"]];
  const guideCount = Object.values(adminData?.guide || {}).flat().filter((item) => String(item["Tournament ID"]) === tournamentId && item.Status === "Published").length;
  const selectedMatches = (adminData?.live?.matches || []).filter((match) => Number(match.Year) === Number(tournament?.year));
  const liveCount = selectedMatches.filter((match) => match["Match Status"] === "Live").length;
  const finalCount = selectedMatches.filter((match) => match["Match Status"] === "Final").length;
  return <section className={styles.shell}>
    <header className={styles.hero}><p>SBI Administration</p><h1>Admin Center</h1><span>Manage tournament data, live scoring, published analytics, and player-facing content from one place.</span></header>
    {!authorized ? <div className={styles.login}><label>Admin password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && secret) login(); }} /></label><button type="button" disabled={!secret || busy} onClick={login}>{busy ? "Checking…" : "Open Admin Center"}</button>{status ? <p>{status}</p> : null}</div> : <>
      <div className={styles.controlBar}><label>Tournament<select value={tournamentId} onChange={(event) => selectTournament(event.target.value)}>{tournaments.map((item) => <option value={item.id} key={item.id}>{item.year} — {item.label}</option>)}</select></label><a href="/" target="_blank" rel="noreferrer">Open public site ↗</a></div>
      <nav className={styles.tabs} aria-label="Admin Center sections">{TABS.map(([id,label]) => <button type="button" className={active === id ? styles.active : ""} onClick={() => selectTab(id)} key={id}>{label}</button>)}</nav>
      <div className={styles.panel}>
        {active === "overview" ? <><div className={styles.summary}><article><span>Tournament</span><strong>{tournament?.year}</strong><small>{tournament?.status}</small></article><article><span>Current round</span><strong>{tournament?.currentRound || "—"}</strong><small>{tournament?.dates || "Dates not set"}</small></article><article><span>Published guide</span><strong>{adminData ? guideCount : "—"}</strong><small>Published records</small></article><article><span>Live matches</span><strong>{adminData ? liveCount : "—"}</strong><small>{selectedMatches.length} configured</small></article><article><span>Finalized</span><strong>{adminData ? finalCount : "—"}</strong><small>Official matches</small></article><article><span>Teams</span><strong>2</strong><small>{tournament?.teamOne} vs. {tournament?.teamTwo}</small></article><article><span>Location</span><strong className={styles.compact}>{tournament?.location || "—"}</strong><small>Selected tournament</small></article></div><div className={styles.shortcuts}>{shortcuts.map(([label,tab]) => <button type="button" onClick={() => selectTab(tab)} key={tab}>{label}<span>→</span></button>)}</div></> : null}
        {active === "tournament" ? <TournamentEditor tournamentId={tournamentId} secret={secret} /> : null}
        {active === "guide" ? <GuideEditor tournaments={tournaments} embedded sharedSecret={secret} selectedTournamentId={tournamentId} onTournamentChange={selectTournament} /> : null}
        {active === "live-matches" ? <LiveMatchControl embedded sharedSecret={secret} selectedYear={tournament?.year} /> : null}
        {active === "odds" ? <OddsAdmin embedded sharedSecret={secret} /> : null}
        {active === "players" ? <ReadOnlyPanel title="Player administration" copy="Player records remain mapped to the existing Players sheet. A later editing phase can safely expose Active/Alumni, team, captain, BOG, Handicap Committee, rookie, and image fields without duplicating player records." rows={[["Current scope","Read-only schema review"],["Player source","Players sheet"],["Supported roles","Captain, BOG, Handicap Committee, Rookie"],["Public player page","Available"]]} /> : null}
        {active === "data-health" ? <div className={styles.frame}><iframe title="Data Health" src="/data-health?embedded=1" /></div> : null}
        {active === "preview" ? <div className={styles.previewGrid}>{PREVIEWS.map(([label,href]) => <a href={href} target="_blank" rel="noreferrer" key={href}><strong>{label}</strong><span>Open Public Page ↗</span></a>)}</div> : null}
      </div>
    </>}
  </section>;
}

function ReadOnlyPanel({ title, copy, rows }) {
  return <section className={styles.readOnly}><div><p>Sheet-driven settings</p><h2>{title}</h2><span>{copy}</span></div><dl>{rows.filter(([,value]) => value !== undefined && value !== null && value !== "").map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
