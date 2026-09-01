import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { navigationSections } from "../app/navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const participantDestinations = ["/home", "/my-match", "/score", "/game-center/", "/me", "/participant-auth", "/app/"];

test("public drawer is portaled outside the filtered header and contained by the viewport", async () => {
  const [menu, css] = await Promise.all([source("app/Menu.js"), source("app/globals.css")]);
  assert.match(menu, /import \{ createPortal \} from "react-dom"/);
  assert.match(menu, /setPublicOverlayRoot\(document\.body\)/);
  assert.match(menu, /createPortal\(<[\s\S]*className="menuDrawerViewport"[\s\S]*publicOverlayRoot\)/);
  assert.match(css, /:root\s*\{[\s\S]*--public-site-header-height:\s*max\(84px,\s*calc\(82px \+ var\(--safe-top\)\)\)/);
  assert.doesNotMatch(css, /\.siteHeader\s*\{[^}]*--public-site-header-height/s);
  assert.match(menu, /className="menuDrawerViewport"/);
  assert.match(css, /\.menuDrawerViewport\{[^}]*position:fixed;[^}]*inset:var\(--public-site-header-height\) 0 0;[^}]*overflow:clip;[^}]*contain:layout paint/s);
  assert.match(css, /\.sideMenu\s*\{[^}]*width:\s*min\(100vw,\s*520px\)/s);
  assert.match(css, /\.menuDrawerViewport \.sideMenu\{[^}]*position:absolute;[^}]*right:0;[^}]*height:100%;[^}]*visibility:hidden;[^}]*transform:translateX\(100%\)/s);
  assert.match(css, /\.menuDrawerViewport \.sideMenu\.open\{[^}]*visibility:visible;[^}]*pointer-events:auto;[^}]*transform:translateX\(0\)/s);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.sideMenu\s*\{\s*width:\s*100vw;/);
  assert.doesNotMatch(css, /(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/s);
});

test("opening public navigation preserves the exact site brand and changes only the right control", async () => {
  const [header, menu, css] = await Promise.all([
    source("app/components.js"),
    source("app/Menu.js"),
    source("app/globals.css"),
  ]);
  const siteContent = menu.slice(menu.indexOf("const siteContent"), menu.indexOf("const hubContent"));

  assert.match(header, /<header className="siteHeader">[\s\S]*<Link href=\{homeHref\} className="brand">[\s\S]*sandbagger-logo\.png[\s\S]*<strong>Sandbagger Invitational<\/strong>[\s\S]*Established \{SITE_ESTABLISHED_YEAR\}[\s\S]*<Menu/);
  assert.doesNotMatch(siteContent, /sideMenuTop|Sandbagger Invitational|sandbagger-logo\.png/);
  assert.match(menu, /aria-label=\{appShell \? "Open Tournament Hub" : isOpen \? "Close navigation menu" : "Open navigation menu"\}/);
  assert.match(menu, /onClick=\{\(\) => appShell \? setIsOpen\(true\) : setIsOpen\(\(open\) => !open\)\}/);
  assert.match(css, /:root\s*\{[\s\S]*--public-site-header-height:[^;}]+;/s);
  assert.match(css, /\.menuBackdrop\s*\{[^}]*inset:\s*var\(--public-site-header-height\) 0 0;/s);
  assert.match(css, /\.siteHeader \.menuButton\.active span:nth-child\(1\)[^}]*translateY\(7px\) rotate\(45deg\)/s);
  assert.match(css, /\.siteHeader \.menuButton\.active span:nth-child\(2\)[^}]*opacity:\s*0/s);
  assert.match(css, /\.siteHeader \.menuButton\.active span:nth-child\(3\)[^}]*translateY\(-7px\) rotate\(-45deg\)/s);
  assert.doesNotMatch(css, /\.menuButton\.active[^,{]*[+~][^,{]*\.brand|\.siteHeader:has\([^)]*menuButton\.active[^}]*\.brand/s);
});

test("every public close path restores focus to the menu opener", async () => {
  const menu = await source("app/Menu.js");
  assert.match(menu, /const menuButton = useRef\(null\)/);
  assert.match(menu, /const publicMenuWasOpen = useRef\(false\)/);
  assert.match(menu, /requestAnimationFrame\(\(\) => menuButton\.current\?\.focus\(\{ preventScroll: true \}\)\)/);
  assert.match(menu, /ref=\{menuButton\}[\s\S]*aria-expanded=\{isOpen\}/);
  assert.match(menu, /event\.key === "Escape"[\s\S]*setIsOpen\(false\)/);
  assert.match(menu, /document\.activeElement === menuButton\.current[\s\S]*first\.focus\(\)/);
  assert.match(menu, /document\.activeElement === last[\s\S]*menuButton\.current\?\.focus/);
  assert.match(menu, /className=\{`menuBackdrop[\s\S]*onClick=\{\(\) => setIsOpen\(false\)\}/);
  assert.match(menu, /isOpen \? "Close navigation menu" : "Open navigation menu"/);
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
