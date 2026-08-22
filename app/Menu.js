"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { readFreshPlayerPassportSession } from "../lib/participant-session-client.js";
import { formatTournamentEdition } from "../lib/tournament-branding";
import Sheet from "./ui/Sheet";

const hubSections = [
  { label: "Tournament", links: [
    { icon: "guide", label: "Tournament Guide", href: "/tournament-guide" },
    { icon: "history", label: "Tournament History", href: "/history" },
  ] },
  { label: "Support", links: [
    { icon: "contacts", label: "Important Contacts", href: "/tournament-guide/contacts" },
  ] },
];

function HubIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  if (name === "guide") return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z"/></svg>;
  if (name === "history") return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2M5.8 5.8 4 4"/></svg>;
  if (name === "contacts") return <svg {...common}><path d="M7.2 3.5h2.1l1.1 4-1.8 1.5a14 14 0 0 0 6.4 6.4l1.5-1.8 4 1.1v2.1a3.7 3.7 0 0 1-4 3.7A16.2 16.2 0 0 1 3.5 7.5a3.7 3.7 0 0 1 3.7-4Z"/></svg>;
  return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.8 8.2 7 10 4.2-1.8 7-5.3 7-10V6Z"/><path d="M9 12.2 11 14l4-4"/></svg>;
}

export default function Menu({ activeNavigationHref = "", homeHref = "/", appShell = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [director, setDirector] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [tournament, setTournament] = useState({ name: "", edition: "", location: "", year: "" });
  const closeButton = useRef(null);
  const shellCapabilityRevision = useRef(-1);

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
    // The participant shell warms account-scoped capability after Supabase
    // session restoration so the Director row is ready before the Hub opens.
    if (!appShell && !isOpen) return;
    // Opening an already-mounted participant Hub must not duplicate the warm
    // capability/session reads. Focus and account-change revisions revalidate.
    if (appShell && shellCapabilityRevision.current === capabilityRevision) return;
    if (appShell) shellCapabilityRevision.current = capabilityRevision;
    let cancelled = false;
    const readDirectorAccess = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch("/api/director/access", { cache: "no-store", credentials: "same-origin" }).catch(() => null);
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
      readFreshPlayerPassportSession()
        .then((response) => response.ok ? response.payload : null)
        .catch(() => null),
      readDirectorAccess(),
    ]).then(([session, directorAccess]) => {
      if (cancelled) return;
      const legacyDirector = session?.identityAuthority !== "supabase" && session?.player?.role === "DIRECTOR";
      setDirector(directorAccess?.authorized === true || legacyDirector);
      if (!active) applyTournament(session?.tournament);
    });
    return () => { cancelled = true; };
  }, [appShell, capabilityRevision, isOpen]);

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
          ><span><HubIcon name={link.icon} /></span><b>{link.label}</b><i aria-hidden="true">›</i></Link>)}</div>
        </section>)}
        {director ? <section className="sideNavGroup sideNavDirector"><h2>Director</h2><div><Link className="directorMenuLink" href="/admin/director" prefetch={false} onClick={appShell ? (event) => { event.preventDefault(); close(() => router.push("/admin/director")); } : () => close()}><span><HubIcon name="director" /></span><b>Tournament Director</b><i aria-hidden="true">›</i></Link></div></section> : null}
      </nav>
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
