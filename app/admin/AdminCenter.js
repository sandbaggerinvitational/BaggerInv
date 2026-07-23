"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuideEditor from "./tournament-guide/GuideEditor";
import LiveMatchControl from "./live-matches/LiveMatchControl";
import OddsAdmin from "../odds-center/admin/OddsAdmin";
import TournamentEditor from "./TournamentEditor";
import CmsManager, { AuditLogPanel, DashboardPanel, StandingsPanel } from "./CmsManager";
import styles from "./admin-center.module.css";
import { resolveTournamentSelection } from "../../lib/tournament-identifiers";

const TABS = [
  ["dashboard", "Dashboard"], ["tournament", "Tournament"], ["players", "Players"], ["teams", "Teams"],
  ["draft", "Draft"], ["schedule", "Schedule"], ["courses", "Courses"], ["matches", "Matches"], ["live-scoring", "Live Scoring"],
  ["standings", "Standings"], ["guide", "Guide"], ["odds", "Odds"], ["media", "Media"],
  ["history", "History"], ["data-health", "Data Health"], ["settings", "Settings"], ["audit-log", "Audit Log"],
];

export default function AdminCenter({ tournaments }) {
  const search = useSearchParams();
  const router = useRouter();
  const requestedTab = search.get("tab");
  const initialTab = TABS.some(([id]) => id === requestedTab) ? requestedTab : "dashboard";
  const requestedTournament = search.get("tournament");
  const initialTournamentId = resolveTournamentSelection(tournaments, requestedTournament);
  const [active, setActive] = useState(initialTab);
  const [tournamentId, setTournamentId] = useState(initialTournamentId);
  const [secret, setSecret] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const tournament = useMemo(() => tournaments.find((item) => String(item.id) === tournamentId) || null, [tournaments, tournamentId]);
  const validTournamentIds = useMemo(() => new Set(tournaments.map((item) => String(item.id))), [tournaments]);

  useEffect(() => {
    const resolved = resolveTournamentSelection(tournaments, requestedTournament);
    if (!resolved) return;
    if (tournamentId !== resolved) setTournamentId(resolved);
    if (requestedTournament !== resolved) {
      router.replace(`/admin?tab=${encodeURIComponent(initialTab)}&tournament=${encodeURIComponent(resolved)}`, { scroll: false });
    }
  }, [initialTab, requestedTournament, router, tournamentId, tournaments]);

  function updateUrl(nextTab = active, nextTournament = tournamentId) {
    router.replace(`/admin?tab=${encodeURIComponent(nextTab)}&tournament=${encodeURIComponent(nextTournament)}`, { scroll: false });
  }
  function selectTab(tab) { setActive(tab); updateUrl(tab, tournamentId); }
  function selectTournament(id) {
    if (!validTournamentIds.has(String(id)) || String(id) === "0") {
      setStatus("Unable to resolve the selected tournament.");
      return;
    }
    setTournamentId(String(id)); updateUrl(active, String(id)); setStatus("");
  }
  async function login() {
    setBusy(true); setStatus("Checking admin access…");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "x-admin-secret": secret } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to open Admin Center.");
      setAuthorized(true); setStatus("");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  const shared = { secret, tournamentId, year: tournament?.year, updatedBy };
  return <section className={styles.shell}>
    <header className={styles.hero}><p>SBI Administration</p><h1>Admin Center</h1><span>The operating system for tournament content, teams, competition, live scoring, analytics, and history.</span></header>
    {!tournament ? <div className={styles.login}><p>Unable to resolve the selected tournament.</p></div> : !authorized ? <div className={styles.login}><label>Admin password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && secret) login(); }} /></label><button type="button" disabled={!secret || busy} onClick={login}>{busy ? "Checking…" : "Open Admin Center"}</button>{status ? <p>{status}</p> : null}</div> : <>
      <div className={styles.controlBar}><label>Tournament<select value={tournamentId} onChange={(event) => selectTournament(event.target.value)}>{tournaments.map((item) => <option value={item.id} key={item.id}>{item.year} — {item.label}</option>)}</select></label><label>Updated by<input value={updatedBy} onChange={(event) => setUpdatedBy(event.target.value)} placeholder="Your name for the audit log" /></label><a href="/" target="_blank" rel="noreferrer">Open public site ↗</a></div>
      <nav className={styles.tabs} aria-label="Admin Center sections">{TABS.map(([id,label]) => <button type="button" className={active === id ? styles.active : ""} onClick={() => selectTab(id)} key={id}>{label}</button>)}</nav>
      <div className={styles.panel}>
        {active === "dashboard" ? <DashboardPanel {...shared} onNavigate={selectTab} /> : null}
        {active === "tournament" ? <TournamentEditor tournamentId={tournamentId} secret={secret} sharedUpdatedBy={updatedBy} /> : null}
        {active === "players" ? <CmsManager resource="players" {...shared} description="Manage player profiles, status, leadership roles, handicapping details, biography, and public presentation." /> : null}
        {active === "teams" ? <div className={styles.stack}><CmsManager resource="teams" {...shared} description="Manage the selected tournament's team identity, captain, colors, logo, motto, and description." /><CmsManager resource="rosters" {...shared} title="Roster Assignments" description="Assign players to Team 1 or Team 2 and maintain the tournament handicap used across the public site." /></div> : null}
        {active === "draft" ? <div className={styles.stack}><CmsManager resource="draft-settings" {...shared} description="Schedule the draft, assign its teams and captains, set the pick count, and control the public draft presentation." /><CmsManager resource="draft-picks" {...shared} description="Build the official draft board. Player selections write directly to the Draft Picks sheet." /></div> : null}
        {active === "schedule" ? <CmsManager resource="schedule" {...shared} description="Build the tournament-week itinerary, connect rounds and courses, publish events, and reorder the schedule." /> : null}
        {active === "courses" ? <CmsManager resource="courses" {...shared} description="Manage the selected year's course assignments, tees, ratings, yardage, imagery, and GPS links." /> : null}
        {active === "matches" ? <CmsManager resource="matches" {...shared} description="Create and edit official pairings, formats, tee times, starting holes, and match status." /> : null}
        {active === "live-scoring" ? <LiveMatchControl embedded sharedSecret={secret} sharedUpdatedBy={updatedBy} selectedYear={tournament?.year} /> : null}
        {active === "standings" ? <StandingsPanel secret={secret} year={tournament?.year} /> : null}
        {active === "guide" ? <GuideEditor tournaments={tournaments} embedded sharedSecret={secret} sharedUpdatedBy={updatedBy} selectedTournamentId={tournamentId} onTournamentChange={selectTournament} /> : null}
        {active === "odds" ? <OddsAdmin embedded sharedSecret={secret} /> : null}
        {active === "media" ? <CmsManager resource="media" {...shared} description="Catalog approved logos, hero images, course photos, player photos, and championship artwork for use throughout the site." /> : null}
        {active === "history" ? <CmsManager resource="awards" {...shared} title="History & Awards" description="Manage year-specific awards and winners. Championship team and final score remain in the Tournament record." /> : null}
        {active === "data-health" ? <div className={styles.frame}><iframe title="Data Health" src={`/data-health?embedded=1&tournament=${encodeURIComponent(tournamentId)}`} /></div> : null}
        {active === "settings" ? <CmsManager resource="settings" {...shared} description="Manage site-wide feature flags, established year, delays, theme options, and other shared values." /> : null}
        {active === "audit-log" ? <AuditLogPanel secret={secret} /> : null}
      </div>
    </>}
  </section>;
}
