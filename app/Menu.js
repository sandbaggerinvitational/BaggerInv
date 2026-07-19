"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const menuGroups = [
  {
    label: "Live",
    links: [{ label: "Match Center", href: "/live" }],
  },
  {
    label: "War Room",
    links: [
      { label: "Matchup Builder", href: "/war-room" },
      { label: "Lineup Optimizer", href: "/war-room/lineup-optimizer" },
      { label: "Match Simulator", href: "/war-room/simulator" },
    ],
  },
  {
    label: "Players",
    links: [
      { label: "Player Directory", href: "/players" },
      { label: "Compare Players", href: "/compare" },
      { label: "Board of Governors", href: "/board-of-governors" },
      { label: "Sandbagger Ratings", href: "/ratings" },
      { label: "Records", href: "/records" },
    ],
  },
  {
    label: "Tournament",
    links: [
      { label: "History", href: "/history" },
      { label: "The Cup", href: "/#cup" },
    ],
  },
  {
    label: "Admin",
    links: [{ label: "Data Health", href: "/data-health" }],
  },
];

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  if (href === "/war-room") return pathname === href;
  if (href.includes("#")) return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Menu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => setIsOpen(false), [pathname]);

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
            <span>Established 2016</span>
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
            <Link
              className={`sideNavHome ${isActive(pathname, "/") ? "current" : ""}`}
              href="/"
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>

            {menuGroups.map((group) => (
              <section className="sideNavGroup" key={group.label}>
                <h2>{group.label}</h2>
                <div>
                  {group.links.map((link) => (
                    <Link
                      className={isActive(pathname, link.href) ? "current" : ""}
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </nav>

          <div className="sideMenuFooter">24 players · Two teams · One trophy</div>
        </div>
      </aside>
    </>
  );
}
