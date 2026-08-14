"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatTournamentEdition } from "../lib/tournament-branding";
import Sheet from "./ui/Sheet";

const hubSections = [
  { label: "Tournament", links: [
    { icon: "📖", label: "Tournament Guide", href: "/tournament-guide" },
    { icon: "🏆", label: "Tournament History", href: "/history" },
  ] },
  { label: "Information", links: [
    { icon: "📞", label: "Important Contacts", href: "/tournament-guide/contacts" },
  ] },
  { label: "App", links: [
    { icon: "🔔", label: "Notification Preferences", href: "/me#notification-preferences" },
  ] },
];

export default function Menu({ activeNavigationHref = "", homeHref = "/", appShell = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [director, setDirector] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [tournament, setTournament] = useState({ name: "", edition: "", location: "", year: "" });
  const [refreshing, setRefreshing] = useState(false);
  const closeButton = useRef(null);

  useEffect(() => {
    if (appShell || !isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [appShell, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const readDirectorAccess = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch("/api/director/access", { cache: "no-store" }).catch(() => null);
        if (response?.ok) return response.json().catch(() => null);
        if (response?.status !== 503 || attempt === 1) return null;
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      return null;
    };
    const applyTournament = (active) => {
        if (!active) return;
        setTournament({
          name: active.name || active.Name || "",
          edition: formatTournamentEdition(active.edition || active["Tournament Edition"] || active.Annual),
          location: active.location || active.Location || "",
          year: active.year || active.Year || "",
        });
    };
    const active = window.__sbiTournamentIdentity;
    if (active) applyTournament(active);
    Promise.all([
      fetch("/api/player-passport/session", { cache: "no-store" })
        .then(async (response) => response.ok ? await response.json() : null)
        .catch(() => null),
      readDirectorAccess(),
    ]).then(([session, directorAccess]) => {
      if (cancelled) return;
      const legacyDirector = session?.identityAuthority !== "supabase" && session?.player?.role === "DIRECTOR";
      setDirector(directorAccess?.authorized === true || legacyDirector);
      if (!active) applyTournament(session?.tournament);
    });
    return () => { cancelled = true; };
  }, [capabilityRevision, isOpen]);

  useEffect(() => {
    const refreshCapability = () => setCapabilityRevision((value) => value + 1);
    const clearCapability = () => { setDirector(false); refreshCapability(); };
    window.addEventListener("focus", refreshCapability);
    window.addEventListener("player-passport-changed", refreshCapability);
    window.addEventListener("player-passport-cleared", clearCapability);
    return () => {
      window.removeEventListener("focus", refreshCapability);
      window.removeEventListener("player-passport-changed", refreshCapability);
      window.removeEventListener("player-passport-cleared", clearCapability);
    };
  }, []);

  useEffect(() => setIsOpen(false), [pathname]);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  const hubContent = (close = () => setIsOpen(false)) => <>
    <div className="sideMenuTop">
      <div>
        <small>Tournament Hub</small>
        <strong>{tournament.name || "Tournament"}</strong>
        {tournament.edition ? <span className="sideMenuEdition">{tournament.edition}</span> : null}
        {tournament.location || tournament.year ? <span>{[tournament.location, tournament.year].filter(Boolean).join(" • ")}</span> : null}
      </div>
      <button ref={closeButton} className="closeMenuButton" type="button" aria-label="Close navigation menu" onClick={() => close()}>×</button>
    </div>
    <div className="sideMenuScroll">
      <nav className="sideNav" aria-label="Tournament Hub navigation">
        {hubSections.map((group) => <section className="sideNavGroup" key={group.label}>
          <h2>{group.label}</h2>
          <div>{group.links.map((link) => <Link
            className={(() => {
              const [pathAndQuery, linkHash = ""] = link.href.split("#");
              const [linkPath, linkQuery = ""] = pathAndQuery.split("?");
              const currentQuery = isOpen && typeof window !== "undefined" ? window.location.search.slice(1) : "";
              return pathname === linkPath && currentQuery === linkQuery && (linkHash ? hash === `#${linkHash}` : !hash) ? "current" : "";
            })()}
            key={link.href}
            href={link.href}
            prefetch={false}
            onClick={appShell ? (event) => { event.preventDefault(); close(() => router.push(link.href)); } : () => close()}
          ><span aria-hidden="true">{link.icon}</span><b>{link.label}</b><i aria-hidden="true">›</i></Link>)}
          {group.label === "App" ? <button type="button" disabled={refreshing} onClick={() => {
            setRefreshing(true);
            router.refresh();
            window.dispatchEvent(new Event("focus"));
            window.setTimeout(() => { setRefreshing(false); close(); }, 350);
          }}><span aria-hidden="true">🔄</span><b>{refreshing ? "Refreshing Tournament Data…" : "Refresh Tournament Data"}</b><i aria-hidden="true">›</i></button> : null}</div>
        </section>)}
      </nav>
      {director ? <section className="sideNavGroup sideNavDirector"><h2>Director</h2><div><Link className="directorMenuLink" href="/admin/director" prefetch={false} onClick={appShell ? (event) => { event.preventDefault(); close(() => router.push("/admin/director")); } : () => close()}><span aria-hidden="true">🎯</span><b>Tournament Director</b><i aria-hidden="true">›</i></Link></div></section> : null}
    </div>
  </>;

  return (
    <>
      <button
        className={`menuButton ${isOpen ? "active" : ""}`}
        type="button"
        aria-label="Open Tournament Hub"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>

      {appShell
        ? <Sheet open={isOpen} onClose={() => setIsOpen(false)} placement="right" label="Tournament Hub" initialFocusRef={closeButton} panelClassName="sideMenu open">{({ close }) => hubContent(close)}</Sheet>
        : <><div className={`menuBackdrop ${isOpen ? "show" : ""}`} onClick={() => setIsOpen(false)} /><aside className={`sideMenu ${isOpen ? "open" : ""}`} aria-hidden={!isOpen} aria-modal="true" role="dialog" aria-label="Tournament Hub">{hubContent()}</aside></>}
    </>
  );
}
