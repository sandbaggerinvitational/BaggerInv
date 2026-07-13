"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const menuLinks = [
  { label: "Home", href: "/" },
  { label: "Match Center", href: "/live" },
  { label: "Players", href: "/players" },
  { label: "Records", href: "/records" },
  { label: "History", href: "/history" },
  { label: "The Cup", href: "/#cup" },
];

export default function Menu() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

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

        <nav className="sideNav">
          {menuLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="sideMenuFooter">
          24 players · Two teams · One trophy
        </div>
      </aside>
    </>
  );
}
