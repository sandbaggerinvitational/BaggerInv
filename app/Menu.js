"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatTournamentEdition } from "../lib/tournament-branding";

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

export default function Menu({ activeNavigationHref = "", homeHref = "/" }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hash, setHash] = useState("");
  const [director, setDirector] = useState(false);
  const [tournament, setTournament] = useState({ name: "", edition: "", location: "", year: "" });
  const [refreshing, setRefreshing] = useState(false);
  const closeButton = useRef(null);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) closeButton.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event) => { if (event.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
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
      fetch("/api/director/access", { cache: "no-store" })
        .then(async (response) => response.ok ? await response.json() : null)
        .catch(() => null),
    ]).then(([session, directorAccess]) => {
      const legacyDirector = session?.identityAuthority !== "supabase" && session?.player?.role === "DIRECTOR";
      setDirector(directorAccess?.authorized === true || legacyDirector);
      if (!active) applyTournament(session?.tournament);
    });
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  useEffect(() => setIsOpen(false), [pathname]);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

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

      <div
        className={`menuBackdrop ${isOpen ? "show" : ""}`}
        onClick={() => setIsOpen(false)}
      />

      <aside className={`sideMenu ${isOpen ? "open" : ""}`} aria-hidden={!isOpen} aria-modal="true" role="dialog" aria-label="Tournament Hub">
        <div className="sideMenuTop">
          <div>
            <small>Tournament Hub</small>
            <strong>{tournament.name || "Tournament"}</strong>
            {tournament.edition ? <span className="sideMenuEdition">{tournament.edition}</span> : null}
            {tournament.location || tournament.year ? <span>{[tournament.location, tournament.year].filter(Boolean).join(" • ")}</span> : null}
          </div>
          <button
            ref={closeButton}
            className="closeMenuButton"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="sideMenuScroll">
          <nav className="sideNav" aria-label="Tournament Hub navigation">
            {hubSections.map((group) => <section className="sideNavGroup" key={group.label}>
              <h2>{group.label}</h2>
              <div>{group.links.map((link) => <Link
                className={(() => {
                  const [pathAndQuery, linkHash = ""] = link.href.split("#");
                  const [linkPath, linkQuery = ""] = pathAndQuery.split("?");
                  return pathname === linkPath && searchParams.toString() === linkQuery && (linkHash ? hash === `#${linkHash}` : !hash) ? "current" : "";
                })()}
                key={link.href}
                href={link.href}
                prefetch={false}
                onClick={() => setIsOpen(false)}
              ><span aria-hidden="true">{link.icon}</span><b>{link.label}</b><i aria-hidden="true">›</i></Link>)}
              {group.label === "App" ? <button type="button" disabled={refreshing} onClick={() => {
                setRefreshing(true);
                router.refresh();
                window.dispatchEvent(new Event("focus"));
                window.setTimeout(() => { setRefreshing(false); setIsOpen(false); }, 350);
              }}><span aria-hidden="true">🔄</span><b>{refreshing ? "Refreshing Tournament Data…" : "Refresh Tournament Data"}</b><i aria-hidden="true">›</i></button> : null}</div>
            </section>)}
          </nav>

          {director ? <section className="sideNavGroup sideNavDirector"><h2>Director</h2><div><Link className="directorMenuLink" href="/admin/director" prefetch={false} onClick={() => setIsOpen(false)}><span aria-hidden="true">🎯</span><b>Tournament Director</b><i aria-hidden="true">›</i></Link></div></section> : null}
        </div>
      </aside>
    </>
  );
}
