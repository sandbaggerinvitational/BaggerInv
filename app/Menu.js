"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const hubSections = [
  { label: "Tournament", links: [
    { icon: "📖", label: "Tournament Guide", href: "/tournament-guide" },
    { icon: "📅", label: "Schedule", href: "/home#today-schedule-title" },
    { icon: "📍", label: "Courses", href: "/courses" },
    { icon: "🏆", label: "Tournament History", href: "/history" },
  ] },
  { label: "Information", links: [
    { icon: "📜", label: "Rules", href: "/tournament-guide#rules" },
    { icon: "📞", label: "Contact Tournament Director", href: "/tournament-guide#important-information" },
  ] },
  { label: "App", links: [
    { icon: "🔔", label: "Notification Preferences", href: "/me#notification-preferences" },
  ] },
];

export default function Menu({ activeNavigationHref = "", homeHref = "/" }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [director, setDirector] = useState(false);
  const [tournament, setTournament] = useState({ location: "Kiawah Island", year: "2026" });
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
    fetch("/api/live", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()).data?.tournament : null)
      .then((active) => {
        if (!active) return;
        setTournament({ location: active.location || active.Location || "Kiawah Island", year: active.year || "2026" });
      })
      .catch(() => {});
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  useEffect(() => setIsOpen(false), [pathname]);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    fetch("/api/player-passport/session", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()).player : null)
      .then((player) => { if (active) setDirector(player?.role === "DIRECTOR"); })
      .catch(() => {});
    return () => { active = false; };
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
            <strong>The Bagger</strong>
            <span>{tournament.location} • {tournament.year}</span>
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
                  const [linkPath, linkHash] = link.href.split("#");
                  return pathname === linkPath && (linkHash ? hash === `#${linkHash}` : !hash) ? "current" : "";
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
