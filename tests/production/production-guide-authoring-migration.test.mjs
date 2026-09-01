import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/production_migrations/202608310082_production_guide_authoring_v1.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

const rpcNames = [
  "read_production_guide_authoring_v1",
  "create_production_guide_draft_v1",
  "update_production_guide_draft_v1",
  "validate_production_guide_draft_v1",
  "preview_production_guide_draft_v1",
  "publish_production_guide_draft_v1",
  "discard_production_guide_draft_v1",
  "copy_previous_production_guide_as_draft_v1",
];

test("082 installs an inert, exact-domain Guide authoring foundation", () => {
  assert.match(sql, /^-- Step 13E\.8C:[\s\S]*\nbegin;/);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\s*$/);

  const beforeFirstMutation = sql.slice(
    0,
    sql.indexOf("create function public.create_production_guide_draft_v1"),
  );
  assert.doesNotMatch(beforeFirstMutation, /\ninsert\s+into\s+/i);
  assert.doesNotMatch(beforeFirstMutation, /\ndelete\s+from\s+/i);

  assert.match(sql, /\["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"\]/);
  assert.doesNotMatch(sql, /Guide Information|Media Library|Site Settings/);
  assert.match(sql, /or domain in \('PREDICTION_SETTINGS', 'DRAFT', 'GUIDE'\)/);
});

test("Guide authoring storage is private, RLS-protected, immutable where required, and receipt-backed", () => {
  for (const table of [
    "guide_authoring_drafts_v1",
    "guide_authoring_revisions_v1",
    "guide_authoring_current_v1",
    "guide_authoring_revision_provenance_v1",
    "guide_authoring_operation_receipts_v1",
    "guide_authoring_audit_events_v1",
  ]) {
    assert.match(sql, new RegExp(`create table production_control\\.${table} \\(`));
    assert.match(sql, new RegExp(`alter table production_control\\.${table} enable row level security;`));
  }
  assert.match(sql, /from public, anon, authenticated, service_role;/);
  assert.match(sql, /GUIDE_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /primary key \(tournament_id, operation, operation_request_id\)/);
  assert.match(sql, /before update or delete on production_control\.guide_authoring_revisions_v1/);
  assert.match(sql, /before update or delete on\s+production_control\.guide_authoring_revision_provenance_v1/);
  assert.match(sql, /before update or delete on\s+production_control\.guide_authoring_operation_receipts_v1/);
  assert.match(sql, /before update or delete on production_control\.guide_authoring_audit_events_v1/);
  assert.doesNotMatch(
    sql.slice(
      sql.indexOf("create table production_control.guide_authoring_audit_events_v1"),
      sql.indexOf("alter table production_control.guide_authoring_drafts_v1 enable"),
    ),
    /payload_hash|contact|request_id/i,
  );
});

test("every bounded public Guide operation is service-only and fixes its search path", () => {
  for (const name of rpcNames) {
    const definition = new RegExp(
      `create function public\\.${name}\\(input jsonb\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = pg_catalog`,
    );
    assert.match(sql, definition, name);
    assert.match(sql, new RegExp(`public\\.${name}\\(jsonb\\)`));
  }
  assert.match(sql, /grant execute on function[\s\S]*to service_role;/);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all) on (?:table )?production_control\.guide_authoring/i);
  assert.match(sql, /assert_annual_future_admin_scope_v1\(\s*input, 'production-guide-authoring-v1', true, false\s*\)/);
});

test("validation is bounded, privacy-safe, stable-ID aware, and canonical-reference protected", () => {
  assert.match(sql, /GUIDE_CONTENT_TOO_LARGE/);
  assert.match(sql, /GUIDE_COLLECTION_TOO_LARGE/);
  assert.match(sql, /pg_catalog\.length\(value\) > 20000/);
  assert.match(sql, /pg_catalog\.jsonb_array_length\(domain_value\.value\) > 500/);
  assert.match(sql, /GUIDE_STABLE_ITEM_ID_INVALID/);
  assert.match(sql, /GUIDE_STABLE_ID_DUPLICATE/);
  assert.match(sql, /GUIDE_LOGICAL_KEY_DUPLICATE/);
  assert.match(sql, /GUIDE_SECTION_SLUG_DUPLICATE/);
  assert.match(sql, /GUIDE_UNSAFE_CONTENT/);
  assert.match(sql, /GUIDE_URL_INVALID/);
  assert.match(sql, /GUIDE_EMAIL_INVALID/);
  assert.match(sql, /GUIDE_PHONE_INVALID/);
  assert.match(sql, /GUIDE_CONTACT_NOT_PARTICIPANT_SAFE/);
  assert.match(sql, /GUIDE_ROUND_REFERENCE_INVALID/);
  assert.match(sql, /GUIDE_COURSE_REFERENCE_INVALID/);
  assert.match(sql, /GUIDE_SCORING_FACT_CONFLICT/);
  assert.match(sql, /GUIDE_RULE_SCORING_CONFLICT/);
  assert.match(sql, /GUIDE_INTERNAL_ID_PROJECTED/);
  assert.match(sql, /validated_content_fingerprint/);
  assert.match(sql, /validated_canonical_reference_fingerprint/);
  assert.match(sql, /GUIDE_CANONICAL_REFERENCE_STALE/);
  assert.match(sql, /GUIDE_DRAFT_VALIDATION_STALE/);
});

test("draft lifecycle requires optimistic draft and publication predecessors", () => {
  assert.match(sql, /'DRAFT', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED'/);
  assert.match(sql, /expected_published_revision bigint not null/);
  assert.match(sql, /expected_published_revision_id uuid/);
  assert.match(sql, /draft_version bigint not null/);
  assert.match(sql, /GUIDE_PREDECESSOR_STALE/);
  assert.match(sql, /GUIDE_DRAFT_VERSION_STALE/);
  assert.match(sql, /GUIDE_VALIDATED_DRAFT_REQUIRED/);
  assert.match(sql, /input->>'confirmation' is distinct from\s+'PUBLISH TOURNAMENT GUIDE'/);
  assert.match(sql, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(\s*'production-guide-authoring:'\|\|target,0\)\)/);
});

test("preview is isolated and publication advances both legacy 2026 pointers atomically", () => {
  const previewBody = sql.slice(
    sql.indexOf("create function public.preview_production_guide_draft_v1"),
    sql.indexOf("create function public.publish_production_guide_draft_v1"),
  );
  assert.doesNotMatch(previewBody, /insert into|update production_control|update scoring_authority/i);
  assert.match(previewBody, /'label','DRAFT PREVIEW','public',false,'participantCurrent',false/);

  const publishBody = sql.slice(
    sql.indexOf("create function public.publish_production_guide_draft_v1"),
    sql.indexOf("create function public.discard_production_guide_draft_v1"),
  );
  assert.match(publishBody, /insert into production_control\.projection_revisions/);
  assert.match(publishBody, /insert into production_control\.projection_current/);
  assert.match(publishBody, /insert into scoring_authority\.guide_content_revisions/);
  assert.match(publishBody, /insert into scoring_authority\.guide_projection_current/);
  assert.match(publishBody, /insert into production_control\.guide_authoring_revisions_v1/);
  assert.match(publishBody, /insert into production_control\.guide_authoring_current_v1/);
  assert.match(publishBody, /validation->>'contentFingerprint' is distinct from\s+draft\.validated_content_fingerprint/);
});

test("future publication is year-isolated, Supabase-authored, and clone remains a review-only draft", () => {
  assert.match(sql, /insert into production_control\.future_annual_projection_bindings_v1/);
  assert.match(sql, /target,'GUIDE',coalesce\(annual_resource\.source_workbook_id,\s*'SUPABASE_DIRECTOR'\),next_revision/);
  assert.match(sql, /'CERTIFIED',actor_player,\s*effective_at_value,'SUPABASE_DIRECTOR'/);
  assert.match(sql, /readiness_fingerprint=null,readiness_setup_revision=null/);
  assert.match(sql, /'COPIED_PREVIOUS'/);
  assert.match(sql, /'requiresReview',true/);
  assert.match(sql, /'datesAndTimesCopied',false,'contactsCopied',false/);
  assert.match(sql, /'publicationStateCopied',false,'auditCopied',false/);
  assert.match(sql, /'madeCurrent',false/);
});

test("Production Google Guide synchronization and import are retired without touching retained mirrors", () => {
  assert.match(sql, /sync_prod_director_projection_before_guide_retirement_v1/);
  assert.match(sql, /sync_prod_future_projection_before_guide_retirement_v1/);
  assert.equal((sql.match(/GUIDE_GOOGLE_AUTHORING_RETIRED/g) ?? []).length, 2);
  assert.match(sql, /revoke all on function public\.import_production_guide_projection\(jsonb\)/);
  assert.match(sql, /import_production_guide_projection_dormant_internal\(jsonb\)/);
  assert.doesNotMatch(sql, /SCORING_GOOGLE_OUTBOX|ROUND_SCORECARDS_ARCHIVE|ODDS_GOOGLE_MIRROR/);
});
