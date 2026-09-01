import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { navigationSections } from "../app/navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const participantDestinations = ["/home", "/my-match", "/score", "/game-center/", "/me", "/participant-auth", "/app/"];

test("public drawer is clipped to the viewport at every audited responsive width", async () => {
  const [menu, css] = await Promise.all([source("app/Menu.js"), source("app/globals.css")]);
  assert.match(menu, /className="menuDrawerViewport"/);
  assert.match(css, /\.menuDrawerViewport\{[^}]*position:fixed;[^}]*inset:0;[^}]*overflow:clip;[^}]*contain:layout paint/s);
  assert.match(css, /\.sideMenu\s*\{[^}]*width:\s*min\(100vw,\s*520px\)/s);
  assert.match(css, /\.menuDrawerViewport \.sideMenu\{[^}]*position:absolute;[^}]*right:0;[^}]*visibility:hidden;[^}]*transform:translateX\(100%\)/s);
  assert.match(css, /\.menuDrawerViewport \.sideMenu\.open\{[^}]*visibility:visible;[^}]*pointer-events:auto;[^}]*transform:translateX\(0\)/s);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.sideMenu\s*\{\s*width:\s*100vw;/);
  assert.doesNotMatch(css, /(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/s);
});

test("every public close path restores focus to the menu opener", async () => {
  const menu = await source("app/Menu.js");
  assert.match(menu, /const menuButton = useRef\(null\)/);
  assert.match(menu, /const publicMenuWasOpen = useRef\(false\)/);
  assert.match(menu, /requestAnimationFrame\(\(\) => menuButton\.current\?\.focus\(\{ preventScroll: true \}\)\)/);
  assert.match(menu, /ref=\{menuButton\}[\s\S]*aria-expanded=\{isOpen\}/);
  assert.match(menu, /event\.key === "Escape"\) setIsOpen\(false\)/);
  assert.match(menu, /className=\{`menuBackdrop[\s\S]*onClick=\{\(\) => setIsOpen\(false\)\}/);
  assert.match(menu, /aria-label="Close navigation menu" onClick=\{\(\) => setIsOpen\(false\)\}/);
  assert.match(menu, /href=\{link\.href\}[\s\S]*onClick=\{\(\) => setIsOpen\(false\)\}/);
});

test("public navigation removes legacy Admin while preserving entitlement-driven Director discovery", async () => {
  const menu = await source("app/Menu.js");
  const links = navigationSections.flatMap((section) => section.links);
  assert.equal(links.some(({ href, label }) => href === "/admin" || label === "Admin Center"), false);
  for (const { href } of links) {
    assert.equal(participantDestinations.some((prefix) => href === prefix || href.startsWith(prefix)), false, href);
  }
  assert.match(menu, /directorAccess\?\.authorized === true/);
  assert.match(menu, /\{director \? <section[\s\S]*href="\/admin\/director"[\s\S]*Tournament Director/);
  assert.doesNotMatch(menu, /href="\/admin"/);
});
