import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_GUIDE_AUTHORING_DOMAINS,
  PRODUCTION_GUIDE_ITEM_STATUSES,
} from "../lib/production-guide-authoring-contract.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Director Guide editor is sectioned across the exact certified authoring domains", async () => {
  const editor = await read("../app/admin/director/ProductionGuideEditor.js");
  const domainKeys = PRODUCTION_GUIDE_AUTHORING_DOMAINS.map((domain) => domain.key);

  assert.deepEqual(domainKeys, [
    "tournament", "overview", "schedule", "timelineRows", "ruleBook",
    "tournamentRules", "rounds", "dining", "localGuide",
    "importantContacts", "courses",
  ]);
  for (const key of domainKeys) assert.match(editor, new RegExp(`key: "${key}"`), key);
  for (const label of [
    "Overview", "Sections", "Schedule / Itinerary", "Timeline", "Rule Book",
    "Tournament Rules", "Rounds Presentation", "Dining", "Local Guide",
    "Important Contacts", "Courses",
  ]) assert.match(editor, new RegExp(`label: "${label.replaceAll("/", "\\/")}"`), label);

  assert.deepEqual(PRODUCTION_GUIDE_ITEM_STATUSES,
    ["Draft", "Published", "Archived", "Cancelled"]);
  assert.deepEqual(
    [...editor.matchAll(/key: "([^"]+)"[^\n]*status: true/g)].map((match) => match[1]),
    ["overview", "schedule", "ruleBook"],
    "only the three certified item-status domains expose publication status",
  );
  assert.match(editor, /Item publication status is available only for Sections, Schedule \/ Itinerary, and Rule Book/);
  assert.match(editor, /field\("Status Override", "Status override", "select", TIMELINE_STATUS\)/,
    "timeline status override remains a bounded presentation state, not item publication");
  assert.doesNotMatch(editor, /Guide Information|Media Library|Site Settings/);
  assert.doesNotMatch(editor, /field\("(?:Tee Played|Slope|Rating|Yardage|Par|Hole Definitions)"/,
    "canonical scoring Course facts are never editable Guide fields");
});

test("Guide lifecycle keeps unsaved edits out of validation, preview, and publication", async () => {
  const editor = await read("../app/admin/director/ProductionGuideEditor.js");

  assert.match(editor, /const ENDPOINT = "\/api\/director\/guide"/);
  assert.match(editor, /credentials: "same-origin"/);
  assert.match(editor, /createClientMutationOperationIdentityRegistry/);
  for (const action of ["stage", "validate", "preview", "publish", "discard", "copy-previous"]) {
    assert.match(editor, new RegExp(`mutation\\("${action}"`), action);
  }
  assert.match(editor, /const PUBLISH_CONFIRMATION = "PUBLISH TOURNAMENT GUIDE"/);
  assert.match(editor, /contentFingerprint: first\(openDraft/);
  assert.match(editor, /expectedRevision: currentRevision/);
  assert.match(editor, /currentRevisionId = clean\(first\(data\?\.current, "revisionId", "revision_id"\)\)/);
  assert.match(editor, /expectedRevisionId: currentRevisionId/,
    "draft creation and publication carry the exact current revision UUID as well as its number");
  assert.match(editor, /expectedDraftVersion: draftVersion\(openDraft\)/);

  assert.match(editor, /const \[dirty, setDirty\] = useState\(false\)/);
  assert.match(editor, /setDirty\(true\)[\s\S]*setPreview\(null\)/);
  assert.match(editor, /disabled=\{Boolean\(busy\) \|\| dirty\}/,
    "Validate is disabled after a local edit until the draft is saved");
  assert.match(editor, /disabled=\{Boolean\(busy\) \|\| dirty \|\| state !== "VALIDATED"\}/g,
    "Preview and Publish require the exact stored validated draft");
  assert.match(editor, /Guide draft saved in Supabase\. Published content is unchanged\./);
  assert.match(editor, /The current public and participant\/PWA Guide remains unchanged/);
  assert.match(editor, /if \(action === "publish"\) await onChanged\?\.\(\)/,
    "only publication refreshes current cross-domain presentation");
  assert.match(editor, /loadSequence/,
    "a late response for one tournament cannot overwrite a newly selected annual scope");
  assert.match(editor, /"effectiveAt", "effective_at", "publishedAt", "published_at"/,
    "revision history renders the database contract's effective timestamp");

  assert.match(editor, /"authoringContent", "authoring_content", "content", "guide"/);
  assert.match(editor, /"projectionPayload", "projection_payload", "projection"/);
  assert.match(editor, /row\.itemId \|\| row\.item_id/,
    "hidden server-issued item IDs remain stable through editing and reordering");
  assert.doesNotMatch(editor, /field\("(?:itemId|item_id)"/,
    "hidden stable IDs are not exposed as Director form fields");
});

test("DRAFT PREVIEW is a private, validated, accessible Director modal", async () => {
  const [editor, route] = await Promise.all([
    read("../app/admin/director/ProductionGuideEditor.js"),
    read("../app/api/director/guide/route.js"),
  ]);

  assert.match(editor, /DRAFT PREVIEW/);
  assert.match(editor, /data-preview-visibility="director-only"/);
  assert.match(editor, /role="dialog" aria-modal="true"/);
  assert.match(editor, /aria-describedby="guide-preview-description"/);
  assert.match(editor, /event\.key === "Escape"/);
  assert.match(editor, /event\.key === "Tab"/);
  assert.match(editor, /visible only to the authenticated Director/);
  assert.match(editor, /state !== "VALIDATED"/);
  assert.match(editor, /It does not change the public website or participant\/PWA Guide until Publish Revision succeeds/);

  assert.match(route, /Preview is deliberately POST-only/);
  assert.match(route, /authorize\(request, \{ mutation: true \}\)/);
  assert.match(route, /requireOrigin: true/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /result\.source !== "production-director-entitlement"/);
});

test("Guide item ordering is keyboard-accessible, immutable, and limited to ordered domains", async () => {
  const [editor, css] = await Promise.all([
    read("../app/admin/director/ProductionGuideEditor.js"),
    read("../app/admin/director/production-guide-editor.module.css"),
  ]);

  assert.match(editor, /aria-label=\{`Move \$\{domain\.singular\} up`\}/);
  assert.match(editor, /aria-label=\{`Move \$\{domain\.singular\} down`\}/);
  assert.match(editor, /if \(domain\.singleton \|\| !domain\.order/,
    "fixed logical-key order cannot be rearranged with a false UI affordance");
  assert.match(editor, /const nextRows = rows\.map\(\(row\) => \(\{ \.\.\.row \}\)\)/,
    "reorder does not mutate the previous React state");
  assert.match(editor, /nextRows\.forEach\(\(row, index\) => \{ row\[domain\.order\] = String\(index \+ 1\); \}\)/);
  assert.match(editor, /readOnly=\{definition\.type === "readonly"\}/);
  assert.match(editor, /definition\.type === "phone" \? "tel"/);
  assert.match(css, /:focus-visible/);
});

test("Director integration retires the Guide sync card without merging website and PWA presentation", async () => {
  const [operations, editor, publicGuide, participantGuide, participantDetail, publicDetail] = await Promise.all([
    read("../app/admin/director/ProductionDirectorOperations.js"),
    read("../app/admin/director/ProductionGuideEditor.js"),
    read("../app/tournament-guide/page.js"),
    read("../app/app/guide/page.js"),
    read("../app/app/guide/[section]/page.js"),
    read("../app/tournament-guide/[section]/page.js"),
  ]);

  assert.match(operations, /import ProductionGuideEditor/);
  assert.match(operations, /<ProductionGuideEditor onChanged=\{refresh\} \/>/);
  assert.doesNotMatch(operations, /ProjectionSyncCard|domain="GUIDE"|production-director-synchronization/);
  assert.doesNotMatch(editor, /google-sheets|\/api\/tournament-guide|production-director-synchronization/i);

  assert.match(publicGuide, /if \(!participantPresentation\)[\s\S]*<PublicTournamentGuide content=\{content\} \/>/);
  assert.match(participantGuide, /participantPresentation: true/);
  assert.match(participantDetail, /participantPresentation: true/);
  assert.match(publicDetail, /if \(!participantPresentation\)[\s\S]*redirect\(`\/tournament-guide#/);
  assert.doesNotMatch(editor, /public-tournament-guide\.module\.css|tournament-guide\.module\.css|ParticipantRouteFrame/,
    "the private authoring UI does not import either public-site or participant/PWA styling");
});
