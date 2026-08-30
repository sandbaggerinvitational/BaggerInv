"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import WeeklyHandicapPanel from "./WeeklyHandicapPanel.js";
import ProductionPlayersAccessPanel from "./ProductionPlayersAccessPanel.js";
import {
  DraftGuidePanel,
  OddsAndSideGamesPanel,
  SystemAuditPanel,
  TournamentDayPanel,
} from "./ProductionDirectorOperations.js";
import styles from "./production-director.module.css";

const pretty = (value) => String(value || "Unavailable").toLowerCase().replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function StateBadge({ state, children }) {
  const normalized = String(state || "unavailable").toLowerCase();
  const positive = ["ready", "healthy", "published", "official", "open", "supabase", "normal", "configured"].includes(normalized);
  const attention = ["attention", "paused", "unavailable"].includes(normalized);
  return <span className={styles.stateBadge} data-state={positive ? "ready" : attention ? "attention" : "neutral"}>{children || pretty(state)}</span>;
}

function AuthorityCards({ authority }) {
  return <div className={styles.authorityGrid}>
    {[
      ["Scoring", authority.scoring],
      ["Tournament reads", authority.reads],
      ["Participant identity", authority.identity],
      ["Scoring ingress", authority.ingress],
    ].map(([label, item]) => <article key={label}>
      <small>{label}</small>
      <strong>{item.label}</strong>
      <StateBadge state={item.value}>{item.value === "SUPABASE" ? "Active" : item.label}</StateBadge>
    </article>)}
  </div>;
}

function PublicationCards({ publications }) {
  return <div className={styles.publicationGrid}>
    {[
      ["Championship Odds", publications.odds],
      ["Net Skins", publications.netSkins],
      ["Calcutta", publications.calcutta],
    ].map(([label, item]) => <article key={label}>
      <small>{label}</small>
      <strong>{item.label}</strong>
      {item.publishedAt ? <span>Published {timestamp(item.publishedAt)}</span> : <span>Current Production state</span>}
    </article>)}
  </div>;
}

function Activity({ items }) {
  return <section className={styles.panel}>
    <header><span>Recent activity</span><h2>Match Activity</h2></header>
    {items.length ? <ul className={styles.activity}>{items.map((item) => <li key={item.id}>
      <div><strong>{item.label}</strong><span>{pretty(item.status)}</span></div>
      <time>{timestamp(item.updatedAt)}</time>
    </li>)}</ul> : <p className={styles.empty}>No recent Director activity is available yet.</p>}
  </section>;
}

function Issues({ issues }) {
  return <section className={styles.panel}>
    <header><span>Readiness</span><h2>Actionable Issues</h2></header>
    {issues.length ? <div className={styles.issues}>{issues.map((issue) => <article data-level={issue.level} key={issue.id}>
      <i aria-hidden="true">{issue.level === "action" ? "!" : issue.level === "warning" ? "▲" : "i"}</i>
      <div><strong>{issue.title}</strong><p>{issue.message}</p></div>
    </article>)}</div> : <div className={styles.allReady}><strong>Ready for tournament operations</strong><span>No actionable Production issues were found.</span></div>}
  </section>;
}

function Overview({ data }) {
  const tournament = data.tournament;
  return <>
    <section className={styles.summaryGrid} aria-label="Tournament overview">
      <article><small>Active tournament</small><strong>{tournament.name}</strong><span>{[tournament.destination, tournament.dates].filter(Boolean).join(" · ") || tournament.year}</span></article>
      <article><small>Current round</small><strong>{tournament.currentRound.label}</strong><span>{tournament.currentRound.format || pretty(tournament.currentRound.status)}</span></article>
      <article><small>Active roster</small><strong>{tournament.rosterCount}</strong><span>Participants</span></article>
      <article><small>Lifecycle</small><strong>{pretty(tournament.status)}</strong><span>Round {tournament.currentRound.number || "—"}</span></article>
      <article><small>Approved handicap revision</small><strong>{data.handicaps.currentRevision ?? "Unavailable"}</strong><span>{data.handicaps.available ? "Current tournament revision" : "Waiting for handicap authority"}</span></article>
    </section>

    <section className={styles.panel}>
      <header><span>Current authority</span><h2>Tournament Systems</h2><p>Production tournament operations are running on the current Supabase authority.</p></header>
      <AuthorityCards authority={data.authority} />
    </section>

    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <header><span>Participant access</span><h2>Enrollment</h2></header>
        <div className={styles.enrollmentSummary}>
          <strong>{data.enrollment.enrolled} / {data.enrollment.total}</strong>
          <span>participants enrolled</span>
          <StateBadge state={data.enrollment.state}>{pretty(data.enrollment.state)}</StateBadge>
        </div>
        <dl><div><dt>Not enrolled</dt><dd>{data.enrollment.pending}</dd></div><div><dt>Needs review</dt><dd>{data.enrollment.invalid}</dd></div></dl>
      </section>
      <section className={styles.panel}>
        <header><span>Background processing</span><h2>Worker Health</h2></header>
        <div className={styles.workerSummary}><strong>{pretty(data.workers.state)}</strong><StateBadge state={data.workers.state} /></div>
        <p>{data.workers.pending ? `${data.workers.pending} background items are pending.` : "No background work is waiting."}</p>
      </section>
    </div>

    <section className={styles.panel}>
      <header><span>Published experiences</span><h2>Odds & Side Games</h2></header>
      <PublicationCards publications={data.publications} />
    </section>
    <Issues issues={data.readinessIssues} />
    <Activity items={data.recentActivity} />
  </>;
}

export default function ProductionDirectorConsole({ directorName, initialSection = "overview" }) {
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) { setLoading(true); setFailure(null); }
    try {
      const response = await fetch("/api/director/production-overview", {
        cache: "no-store", credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "Director Console is temporarily unavailable."), { code: payload.code });
      setData(payload.data);
      return payload.data;
    } catch (error) {
      if (!background) setFailure({
        code: error?.code || "DIRECTOR_DATA_UNAVAILABLE",
        message: error?.message || "Director Console is temporarily unavailable.",
      });
      return null;
    } finally { if (!background) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => load({ background: true }), [load]);

  if (loading) return <section className={styles.shell}><div className={styles.loading} role="status"><strong>Opening Director Console</strong><span>Loading current Production tournament state…</span></div></section>;
  if (failure) {
    const authorizationFailure = failure.code === "DIRECTOR_AUTHORIZATION_UNAVAILABLE" || failure.code === "DIRECTOR_AUTHORIZATION_REQUIRED";
    return <section className={styles.shell}><div className={styles.failure} role="alert">
      <span>{authorizationFailure ? "Director access" : "Tournament data"}</span>
      <h1>{authorizationFailure ? "Director access is unavailable" : "Tournament data is unavailable"}</h1>
      <p>{failure.message}</p>
      <button type="button" onClick={load}>Try Again</button>
    </div></section>;
  }

  const section = data.navigation.some((item) => item.id === initialSection) ? initialSection : "overview";
  return <section className={styles.shell}>
    <header className={styles.hero}>
      <div><span>Production Director Console</span><h1>{data.tournament.name}</h1><p>{directorName} · {[data.tournament.destination, data.tournament.dates].filter(Boolean).join(" · ") || data.tournament.year}</p></div>
      <StateBadge state={data.tournament.status}>{pretty(data.tournament.status)}</StateBadge>
    </header>
    <nav className={styles.navigation} aria-label="Director Console">
      {data.navigation.map((item) => <Link aria-current={section === item.id ? "page" : undefined} href={item.href} key={item.id}>{item.label}</Link>)}
    </nav>
    <main className={styles.content}>
      {section === "overview" ? <Overview data={data} /> : null}
      {section === "players-access" ? <ProductionPlayersAccessPanel /> : null}
      {section === "handicaps" ? <div className={styles.handicapSlot} data-production-console-slot="handicaps"><WeeklyHandicapPanel /></div> : null}
      {section === "tournament-day" ? <TournamentDayPanel data={data} refresh={refresh} /> : null}
      {section === "odds-side-games" ? <OddsAndSideGamesPanel data={data} refresh={refresh} /> : null}
      {section === "draft-guide" ? <DraftGuidePanel data={data} refresh={refresh} /> : null}
      {section === "system-audit" ? <SystemAuditPanel data={data} /> : null}
    </main>
  </section>;
}
