"use client";

import { useState } from "react";
import Link from "next/link";

const menuLinks = [
  { label: "Home", href: "/" },
  { label: "Live Match Center", href: "/live" },
  { label: "Players", href: "/players" },
  { label: "History", href: "/history" },
  { label: "The Cup", href: "/#cup" },
];

export default function Menu() {
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <>
      <button
        className="menuButton"
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
        onClick={closeMenu}
      />

      <aside
        className={`sideMenu ${isOpen ? "open" : ""}`}
        aria-hidden={!isOpen}
      >
        <div className="sideMenuTop">
          <div>
            <strong>Sandbagger Invitational</strong>
            <span>Established 2016</span>
          </div>

          <button
            className="closeMenuButton"
            type="button"
            aria-label="Close navigation menu"
            onClick={closeMenu}
          >
            ×
          </button>
        </div>

        <nav className="sideNav">
          {menuLinks.map((link) => (
            <Link key={link.href} href={link.href} onClick={closeMenu}>
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
