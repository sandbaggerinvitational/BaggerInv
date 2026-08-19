import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contactCallHref, contactCategoryIcon, contactEmailHref, contactGroups, contactsViewModel, contactTextHref, contactWebsiteHref } from "../lib/tournament-guide-contacts.js";

const records = [
  { Year: 2026, Category: "Emergency", Name: "Emergency Services", Role: "Immediate assistance", Phone: "911", "Text Enabled": "No", "Sort Order": 3 },
  { Year: 2026, Category: "Tournament", Name: "Tournament Director", Role: "Commissioner", Phone: "(843) 555-0100", "Text Enabled": "Yes", Email: "director@example.com", "Sort Order": 1 },
  { Year: 2026, Category: "Tournament", Name: "Tournament Website", Role: "Information", Website: "bagger.example.com", "Sort Order": 2 },
];

test("Important Contacts groups by Category and preserves Sort Order", () => {
  const groups = contactGroups(contactsViewModel(records));
  assert.deepEqual([...groups.keys()], ["Tournament", "Emergency"]);
  assert.deepEqual(groups.get("Tournament").map((contact) => contact.name), ["Tournament Director", "Tournament Website"]);
});

test("Important Contacts derives category icons and direct action URLs", () => {
  assert.equal(contactCategoryIcon("Tournament"), "🏆");
  assert.equal(contactCategoryIcon("Golf Operations"), "⛳");
  assert.equal(contactCategoryIcon("Resort"), "🏨");
  assert.equal(contactCategoryIcon("Transportation"), "🚐");
  assert.equal(contactCategoryIcon("Dining"), "🍽️");
  assert.equal(contactCategoryIcon("Emergency"), "🚨");
  assert.equal(contactCallHref("(843) 555-0100"), "tel:8435550100");
  assert.equal(contactTextHref("(843) 555-0100"), "sms:8435550100");
  assert.equal(contactEmailHref("director@example.com"), "mailto:director@example.com");
  assert.equal(contactWebsiteHref("bagger.example.com"), "https://bagger.example.com");
  assert.equal(contactCallHref("not a phone"), "");
  assert.equal(contactTextHref("x"), "");
  assert.equal(contactEmailHref("missing-at.example.com"), "");
  assert.equal(contactWebsiteHref("javascript:alert(1)"), "");
});

test("Important Contacts annual rows retain contacts while exposing only usable action combinations", () => {
  const contacts = contactsViewModel([
    { Year: 2027, Category: "Tournament", Name: "Phone Only", Phone: "555-0100", "Text Enabled": "No", Email: "bad", Website: "" },
    { Year: 2027, Category: "Resort", Name: "Email Only", Phone: "", Email: "frontdesk@example.com", Website: "javascript:bad" },
    { Year: 2027, Category: "Transportation", Name: "Website Only", Website: "shuttle.example.com" },
    { Year: 2027, Category: "Emergency", Name: "Text Contact", Phone: "911", "Text Enabled": "Yes" },
  ]);
  assert.equal(contacts.length, 4);
  assert.deepEqual(contacts.map(({ phone, textEnabled, email, website }) => ({ phone: Boolean(phone), textEnabled, email: Boolean(email), website: Boolean(website) })), [
    { phone: true, textEnabled: false, email: false, website: false },
    { phone: false, textEnabled: false, email: true, website: false },
    { phone: false, textEnabled: false, email: false, website: true },
    { phone: true, textEnabled: true, email: false, website: false },
  ]);
});

test("Important Contacts exposes only workbook-supported icon actions", async () => {
  const [component, model, normalized, schema, css] = await Promise.all([
    readFile(new URL("../app/tournament-guide/ImportantContacts.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-guide-contacts.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-guide-content.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/tournament-guide.module.css", import.meta.url), "utf8"),
  ]);
  for (const field of ["Year", "Category", "Name", "Role", "Phone", "Text Enabled", "Email", "Website", "Sort Order"]) {
    const pattern = new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.match(model, pattern);
    assert.match(schema, pattern);
  }
  assert.match(component, /contact\.phone \?/);
  assert.match(component, /contact\.phone && contact\.textEnabled \?/);
  assert.match(component, /contact\.email \?/);
  assert.match(component, /contact\.website \?/);
  assert.match(component, /<ExternalLinkConfirm href=\{contactWebsiteHref\(contact\.website\)\}/);
  assert.doesNotMatch(component, />Call<|>Text<|>Email<|>Website</);
  assert.match(component, /className=\{styles\.visuallyHidden\}/);
  assert.match(normalized, /fetchOptionalSheet\("Important Contacts"\)/);
  assert.match(normalized, /importantContactRows[\s\S]*recordMatchesTournament\(row, guideTournament\)/);
  assert.match(css, /\.contactActions>a\{[^}]*width:44px;height:44px;flex:0 0 44px/);
  assert.match(css, /@media\(max-width:700px\)\{\.contactSections>section>div\{grid-template-columns:1fr\}\}/);
});

test("Important Contacts density keeps compact accessible actions and priority treatment without changing visibility", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/tournament-guide/ImportantContacts.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/tournament-guide.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /className=\{styles\.contactActionGlyph\}/);
  assert.match(css, /\.contactActionGlyph\{font-size:1\.08rem;line-height:1\}/);
  assert.match(css, /\.contactCard\{[^}]*grid-template-rows:1fr auto;gap:12px;align-items:center;padding:16px/);
  assert.match(css, /\.contactCard>div:first-child\{[^}]*gap:3px;[^}]*text-align:center/);
  assert.match(css, /\.contactActions\{[^}]*justify-content:center;gap:8px\}/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*\.contactCard\{padding:14px\}\}/);
  assert.match(component, /isTournamentDirector[\s\S]*styles\.primaryContactCard/);
  assert.match(css, /\.primaryContactCard p\{color:#9a7627;font-weight:800\}/);
  assert.match(component, /category === "Emergency" \? styles\.emergencyContactHeading/);
  assert.match(css, /\.emergencyContactHeading>span\{[^}]*background:#fff0ed/);
});
