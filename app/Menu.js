"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationSections } from "./navigation";
import { SITE_ESTABLISHED_YEAR } from "../lib/site-config";

function activeNavigationHrefForPath(pathname, hash) {
  const links = navigationSections.flatMap((section) => section.links);
  const hashMatch = links.find(({ href }) => {
    if (!href.includes("#")) return false;
    const [linkPath, linkHash] = href.split("#");
    return pathname === linkPath && hash === `#${linkHash}`;
  });

  if (hashMatch) return hashMatch.href;

  return links
    .filter(({ href }) => !href.includes("#"))
    .filter(({ href }) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href || "";
}

export default function Menu({ activeNavigationHref = "", homeHref = "/" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hash, setHash] = useState("");
  const pathname = usePathname();
  const [director, setDirector] = useState(false);
  const activeHref = activeNavigationHref || activeNavigationHrefForPath(pathname, hash);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => setIsOpen(false), [pathname]);

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
        aria-label="Open navigation menu"
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

      <aside className={`sideMenu ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
        <div className="sideMenuTop">
          <div>
            <strong>Sandbagger Invitational</strong>
            <span>Established {SITE_ESTABLISHED_YEAR}</span>
          </div>
          <button
            className="closeMenuButton"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="sideMenuScroll">
          <nav className="sideNav" aria-label="Site navigation">
            {navigationSections.map((group) =>
              group.label ? (
                <section className="sideNavGroup" key={group.label}>
                  <h2>{group.label}</h2>
                  <div>
                    {group.links.map((link) => (
                      <Link
                        className={activeHref === link.href ? "current" : ""}
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ) : (
                group.links.map((link) => (
                  <Link
                    className={`sideNavHome ${
                      activeHref === link.href ? "current" : ""
                    }`}
                    href={link.href === "/" ? homeHref : link.href}
                    key={link.href}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))
              )
            )}
          </nav>

          {director ? <Link className="directorMenuLink" href="/admin/director" onClick={() => setIsOpen(false)}>🎯 Tournament Director</Link> : null}

          <div className="sideMenuFooter">24 players · Two teams · One trophy</div>
        </div>
      </aside>
    </>
  );
}
