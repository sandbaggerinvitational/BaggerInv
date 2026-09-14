import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const privacy = read("app/(app-information)/privacy/page.js");
const support = read("app/(app-information)/support/page.js");
const layout = read("app/(app-information)/layout.js");
const css = read("app/(app-information)/information.module.css");

test("public static pages have exact App Store metadata and canonical URLs", () => {
  for (const [route, title, source] of [["privacy", "Privacy Policy", privacy], ["support", "Support", support]]) {
    assert.ok(source.includes(`absolute: "${title} | The Bagger"`));
    assert.ok(source.includes(`canonical: "https://baggerinv.com/${route}"`));
    assert.match(source, /index: true, follow: true/);
    assert.doesNotMatch(source, /cookies\(|headers\(|redirect\(|fetch\(|createClient\(|process\.env|use client/i);
    assert.match(source, /<h1>/);
  }
});
test("policy matches owner-declared V1 categories, purposes and providers", () => {
  for (const text of ["September 14, 2026", "Email address and user ID", "Device ID", "Gameplay content", "Product interaction", "Performance data and other diagnostic data", "Coarse location", "network or IP", "Supabase", "Vercel", "Resend", "Cloudflare Turnstile", "We do not sell personal information", "not designed as a child-directed service"]) assert.ok(privacy.includes(text), text);
  assert.match(privacy, /does not request precise GPS/);
  assert.match(privacy, /does not contain third-party advertising/);
  assert.doesNotMatch(privacy, /phone number|physical address|health\/fitness|payment card|advertising identifiers/i);
});
test("completed deletion disclosure distinguishes account removal from minimized competition retention", () => {
  for (const text of ["Settings → Account → Delete Account", "When deletion completes", "authentication account", "account contact information", "account-to-player login link", "nonessential account/profile information", "revoke account access", "necessary participant attribution", "historical handicap information required to explain tournament results", "Account contact information and authentication credentials are not retained merely for that purpose", "Limited security, integrity, and deletion records", "minimized or disassociated"]) assert.ok(privacy.includes(text), text);
  assert.doesNotMatch(privacy, /deletion requests where applicable|completion email|within \d+|SMS|erase.*binar|all.*records.*delet/i);
});
test("support has owner-selected contact and never asks for secrets", () => {
  assert.match(support, /mailto:SandbaggerInvitational@gmail\.com/);
  assert.match(support, /approved email authentication/);
  assert.match(support, /device model, iOS version/);
  assert.match(support, /Do not send one-time authentication codes, passwords, or other credentials/);
  assert.match(support, /href="\/privacy"/);
  assert.match(privacy, /href="\/support"/);
  assert.doesNotMatch(support, /when available|OWNER INPUT/);
});
test("isolated legal layout provides semantics, focus and mobile-safe sizing", () => {
  assert.match(layout, /<main id="app-information"/);
  assert.match(layout, /Skip to content/);
  assert.match(layout, /aria-label="App information"/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /max-width:780px/);
});
