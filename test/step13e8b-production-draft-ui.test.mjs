import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_DRAFT_CONFIGURATION_FIELDS,
  PRODUCTION_DRAFT_PICK_FIELDS,
  PRODUCTION_DRAFT_STATUS_MODES,
} from "../lib/production-draft-authoring-contract.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Director Draft editor presents the exact existing setup and pick contract without coercing legacy schedule strings", async () => {
  const editor = await read("../app/admin/director/ProductionDraftEditor.js");
  const configurationKeys = PRODUCTION_DRAFT_CONFIGURATION_FIELDS.map((field) => field.key);
  const pickKeys = PRODUCTION_DRAFT_PICK_FIELDS.map((field) => field.key);

  assert.deepEqual(configurationKeys, [
    "year", "name", "date", "time", "time_zone", "location",
    "status_mode", "format", "total_picks", "team_1_id", "team_2_id",
    "team_1_captain_player_id", "team_2_captain_player_id",
    "first_pick_team_id", "notes",
  ]);
  assert.deepEqual(pickKeys, [
    "pick_number", "team_id", "player_id", "selected_at", "selected_by", "notes",
  ]);
  assert.deepEqual(PRODUCTION_DRAFT_STATUS_MODES,
    ["Automatic", "Unscheduled", "Scheduled", "Live", "Complete"]);

  for (const key of configurationKeys) assert.match(editor, new RegExp(`\\b${key}\\b`), key);
  for (const key of pickKeys) assert.match(editor, new RegExp(`\\b${key}\\b`), key);
  assert.match(editor, /Draft Setup/);
  assert.match(editor, /Draft Board \/ Picks/);
  assert.match(editor, /Pick #/);
  assert.match(editor, /Selected Player/);
  assert.match(editor, /Status \/ Notes/);
  assert.match(editor, /type=\{field === "total_picks" \? "number" : "text"\}/,
    "date, time, and time zone remain lossless text values");
  assert.doesNotMatch(editor, /type="date"|type="time"/);
  assert.doesNotMatch(editor, /onChange=\{[^}]*selected_(?:at|by)/,
    "selection provenance is displayed but never edited");
  assert.match(editor, /pick\.selected_by, pick\.selected_at/);
});

test("Director Draft workflow is bounded, idempotent, review-first, and keeps completed history read-only", async () => {
  const editor = await read("../app/admin/director/ProductionDraftEditor.js");

  assert.match(editor, /const ENDPOINT = "\/api\/director\/draft"/);
  assert.match(editor, /credentials: "same-origin"/);
  assert.match(editor, /createClientMutationOperationIdentityRegistry/);
  assert.match(editor, /action: "stage"/);
  assert.match(editor, /action: "validate"/);
  assert.match(editor, /action: "commit"/);
  assert.match(editor, /action: "copy-previous"/);
  assert.match(editor, /SAVE DRAFT REVISION/);
  assert.match(editor, /Validate & Review/);
  assert.match(editor, /Review exact Draft changes/);
  assert.match(editor, /Save Revision/);
  assert.match(editor, /Revision history/);
  assert.match(editor, /"selectedPickCount", "selected_pick_count", "pickCount", "pick_count"/,
    "the UI accepts the canonical selected-pick count and compatibility aliases");
  assert.match(editor, /pickCount: committedPicks/,
    "zero selected picks remains a valid receipt count");
  assert.match(editor, /Director Console/);
  assert.match(editor, /Google synchronization/,
    "history retains truthful source provenance");
  assert.match(editor, /Copy Previous Draft Setup as Draft/);
  assert.match(editor,
    /const sourceTournamentId = isFuture\s*\? String\(Number\(targetTournamentId\) - 1\)\s*:\s*currentTournamentId/,
    "a future Draft copies only its immediately preceding tournament year");
  assert.match(editor, /mode === "view" && isFuture[^\n]+copyPrevious/,
    "copy remains unavailable for the current tournament");
  assert.match(editor, /No prior selections, timestamps, or completed status were copied/);
  assert.match(editor, /data-code="DRAFT_CORRECTION_REQUIRED"/);
  assert.match(editor, /Completed Draft is read-only/);
  assert.match(editor, /dependencyReadiness/);
  assert.match(editor, /Needs Attention/);
  assert.match(editor, /Draft dependencies need review/);
  assert.match(editor, /DRAFT_DATE_INVALID: "Draft date is not a valid calendar date"/);
  assert.match(editor, /DRAFT_PLAYER_TEAM_INVALID: "A selected Player is not active on the chosen canonical Team"/);
  assert.match(editor, /first\(issue, "code"\)/,
    "code-only server validation issues are translated into Director-facing guidance");
  assert.match(editor, /Existing Draft history remains unchanged/);
  assert.doesNotMatch(editor, /JSON\.stringify\(dependency(?:Readiness|Issues)/,
    "the dependency notice never exposes raw diagnostics");
  assert.match(editor, /const editable = explicitlyMutable && !correctionRequired/,
    "a future active mutable Draft is not accidentally blocked after annual activation");
  assert.doesNotMatch(editor, /record-pick|reset-picks|expectedNextPick/,
    "uncertified live-pick and correction operations are not invented");
  assert.doesNotMatch(editor, /\/api\/admin\/cms|production-director-synchronization/);
  assert.doesNotMatch(editor, /Raw JSON|payload hash|source fingerprint|internal SQL|RPC name/i);
});

test("Draft replaces only its Director synchronization card and leaves Guide synchronization intact", async () => {
  const [operations, admin] = await Promise.all([
    read("../app/admin/director/ProductionDirectorOperations.js"),
    read("../app/admin/AdminCenter.js"),
  ]);

  assert.match(operations, /import ProductionDraftEditor/);
  assert.match(operations, /<ProductionDraftEditor onChanged=\{refresh\}/);
  assert.doesNotMatch(operations, /<ProjectionSyncCard\s+domain="DRAFT"/);
  assert.match(operations, /<ProjectionSyncCard domain="GUIDE" title="Tournament Guide"/);
  assert.match(operations, /Google remains the temporary Guide authoring surface/);
  assert.match(operations, /Supabase-native authoring/);
  assert.match(operations, /\["DRAFT", "Draft"\]/);

  assert.match(admin, /active === "draft" \? previewMode/);
  assert.match(admin, /resource="draft-settings"/);
  assert.match(admin, /resource="draft-picks"/);
  assert.match(admin, /Legacy \/ non-authoritative/);
  assert.match(admin, /later edits do not change the Production Draft/);
  assert.match(admin, /\/admin\/director\?section=draft-guide/);
});

test("Draft route requires Production Director entitlement and same-origin mutations with no Google transport", async () => {
  const route = await read("../app/api/director/draft/route.js");

  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /production-director-entitlement/);
  assert.match(route, /requireOrigin: true/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.match(route, /withDataAuthorityRequestScope/);
  assert.match(route, /const ACTIONS = new Set\(\["stage", "validate", "commit", "copy-previous"\]\)/);
  assert.match(route, /googleRequests: 0/);
  assert.doesNotMatch(route, /google-sheets|readWorkbook|synchronizeProductionDirectorProjection/);
  assert.doesNotMatch(route, /input\.actor|input\.actorPlayer|input\.actorAuth/,
    "actor identity comes only from the authenticated entitlement");
});
