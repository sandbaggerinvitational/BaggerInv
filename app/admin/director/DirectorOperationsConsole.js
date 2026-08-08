"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./director.module.css";

const MatchManagement = dynamic(() => import("./DirectorOperationEditors.js").then((module) => module.MatchManagement), { loading: () => <EditorLoading /> });
const CourseTeesManagement = dynamic(() => import("./DirectorOperationEditors.js").then((module) => module.CourseTeesManagement), { loading: () => <EditorLoading /> });
const CalcuttaManagement = dynamic(() => import("./DirectorOperationEditors.js").then((module) => module.CalcuttaManagement), { loading: () => <EditorLoading /> });
const NetSkinsManagement = dynamic(() => import("./DirectorOperationEditors.js").then((module) => module.NetSkinsManagement), { loading: () => <EditorLoading /> });
const NotificationManagement = dynamic(() => import("./DirectorOperationEditors.js").then((module) => module.NotificationManagement), { loading: () => <EditorLoading /> });

const clean = (value) => String(value || "").trim();
const TITLES = { match: "Match Management", courseTees: "Course Tees", calcutta: "Calcutta", skins: "Net Skins", notifications: "Notifications" };

function EditorLoading() { return <div className={styles.editorLoading} role="status">Opening operation…</div>; }

export function OperationsSection({ id, eyebrow, title, summary, children, open = false }) {
  return <details className={styles.operationsSection} id={id} open={open}>
    <summary><span><small>{eyebrow}</small><strong>{title}</strong><em>{summary}</em></span><b aria-hidden="true">+</b></summary>
    <div className={styles.operationsBody}>{children}</div>
  </details>;
}

function DirectorBottomSheet({ active, onClose, children }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = previousOverflow; previous?.focus?.(); };
  }, [active, onClose]);
  if (!active) return null;
  return <div className={styles.operationSheetBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.operationSheet} role="dialog" aria-modal="true" aria-labelledby="operation-sheet-title">
      <header><div><span>Mission Control</span><h2 id="operation-sheet-title">{TITLES[active.type]}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${TITLES[active.type]}`}>×</button></header>
      <div className={styles.operationSheetScroller}>{children}</div>
    </section>
  </div>;
}

export function DirectorOperationsHub({ operations, notificationSandbox, busy, saveOperation, operateMatch, sendNotification }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);
  const openedAt = useRef(0);
  const open = (type, context = {}) => { openedAt.current = performance.now(); setActive({ type, context }); };
  const close = () => setActive(null);
  const save = async (...args) => { const success = await saveOperation(...args); if (success) close(); return success; };
  const notify = async (...args) => { const success = await sendNotification(...args); if (success) close(); return success; };
  const templates = notificationSandbox?.templates || [];
  const results = useMemo(() => {
    const needle = clean(query).toLowerCase();
    if (needle.length < 2) return [];
    const found = [];
    for (const player of operations.players || []) {
      if (!player.name.toLowerCase().includes(needle)) continue;
      const matches = operations.matches.filter((match) => match.players.some((item) => item.id === player.id));
      if (matches.length) found.push({ id: `match-${player.id}`, label: `${player.name} · ${matches.length} match${matches.length === 1 ? "" : "es"}`, type: "Match", operation: "match", context: { playerId: player.id, matchId: matches[0].id } });
      if (operations.calcutta.purchases.some((item) => item.golferPlayerId === player.id) || operations.calcutta.ownership.some((item) => item.ownerPlayerId === player.id)) found.push({ id: `calcutta-${player.id}`, label: player.name, type: "Calcutta", operation: "calcutta", context: { playerId: player.id } });
      if (operations.netSkins.some((item) => item.playerIds.includes(player.id))) found.push({ id: `skins-${player.id}`, label: player.name, type: "Net Skins", operation: "skins", context: { playerId: player.id } });
      found.push({ id: `profile-${player.id}`, label: player.name, type: "Player Profile", href: player.slug ? `/players/${player.slug}` : "/players" });
    }
    for (const template of templates) if (`${template.label} ${template.id}`.toLowerCase().includes(needle)) found.push({ id: `notification-${template.id}`, label: template.label, type: "Notification", operation: "notifications", context: { templateId: template.id } });
    return found.slice(0, 12);
  }, [operations, query, templates]);
  useEffect(() => {
    if (!active || !openedAt.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      console.info("Director Mission Control performance", { operation: "bottom-sheet-open", editor: active.type, elapsedMs: Math.round(performance.now() - openedAt.current), googleRequests: 0 });
      openedAt.current = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);
  return <>
    <section className={styles.directorSearch} aria-labelledby="director-search-title">
      <label htmlFor="director-search"><span>Mission Control</span><strong id="director-search-title">Find an operation</strong></label>
      <input id="director-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, match, Calcutta, Net Skins…" autoComplete="off" />
      {query.length >= 2 ? <div className={styles.searchResults}>{results.length ? results.map((result) => result.href
        ? <Link href={result.href} key={result.id}><span>{result.label}</span><small>{result.type}</small></Link>
        : <button type="button" onClick={() => open(result.operation, result.context)} key={result.id}><span>{result.label}</span><small>{result.type}</small></button>) : <p>No Director tools match “{query}”.</p>}</div> : null}
      <div className={styles.operationLaunchers} aria-label="Director operations">
        <button type="button" onClick={() => open("match")}>Match Management</button><button type="button" onClick={() => open("courseTees")}>Course Tees</button><button type="button" onClick={() => open("calcutta")}>Calcutta</button><button type="button" onClick={() => open("skins")}>Net Skins</button><button type="button" onClick={() => open("notifications")}>Notifications</button>
      </div>
    </section>
    <DirectorBottomSheet active={active} onClose={close}>
      {active?.type === "match" ? <MatchManagement operations={operations} busy={busy} save={save} operate={operateMatch} initialContext={active.context} /> : null}
      {active?.type === "courseTees" ? <CourseTeesManagement operations={operations} busy={busy} save={save} /> : null}
      {active?.type === "calcutta" ? <CalcuttaManagement operations={operations} busy={busy} save={save} initialContext={active.context} /> : null}
      {active?.type === "skins" ? <NetSkinsManagement operations={operations} busy={busy} save={save} initialContext={active.context} /> : null}
      {active?.type === "notifications" ? <NotificationManagement sandbox={notificationSandbox} busy={busy} send={notify} initialContext={active.context} /> : null}
    </DirectorBottomSheet>
  </>;
}
