-- Generated from the certified final staging catalog on 2026-08-23.
-- Data, test-only objects, schedulers, workers, and browser grants are intentionally absent.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists scoring_authority;
create schema if not exists participant_identity;
revoke all on schema scoring_authority from public, anon, authenticated;
revoke all on schema participant_identity from public, anon, authenticated;
grant usage on schema scoring_authority, participant_identity to service_role;

create table "participant_identity"."identity_audit_events" (
  "event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "tournament_id" text,
  "auth_user_id" uuid,
  "player_id" text,
  "actor_id" text,
  "actor_name" text,
  "request_id" text,
  "reason_code" text,
  "link_revision" bigint,
  "configuration_revision" bigint,
  "safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."identity_audit_events" enable row level security;

create table "participant_identity"."identity_config_import_runs" (
  "run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "source_system" text NOT NULL,
  "source_workbook_id" text,
  "source_fingerprint" text NOT NULL,
  "configuration_revision" bigint NOT NULL,
  "status" text NOT NULL,
  "roster_count" integer DEFAULT 0 NOT NULL,
  "received_count" integer DEFAULT 0 NOT NULL,
  "valid_count" integer DEFAULT 0 NOT NULL,
  "missing_count" integer DEFAULT 0 NOT NULL,
  "duplicate_count" integer DEFAULT 0 NOT NULL,
  "malformed_count" integer DEFAULT 0 NOT NULL,
  "shared_count" integer DEFAULT 0 NOT NULL,
  "inactive_count" integer DEFAULT 0 NOT NULL,
  "unknown_player_count" integer DEFAULT 0 NOT NULL,
  "mapping_conflict_count" integer DEFAULT 0 NOT NULL,
  "validation_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requested_by" text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."identity_config_import_runs" enable row level security;

create table "participant_identity"."identity_context_revisions" (
  "tournament_id" text NOT NULL,
  "context_revision" bigint DEFAULT 1 NOT NULL,
  "configuration_fingerprint" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text NOT NULL
);
alter table "participant_identity"."identity_context_revisions" enable row level security;

create table "participant_identity"."participant_auth_identifiers" (
  "identifier_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "player_id" text NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "identifier_type" text NOT NULL,
  "normalized_value_private" text NOT NULL,
  "status" text NOT NULL,
  "verified_at" timestamp with time zone,
  "verification_source" text,
  "revision" bigint DEFAULT 1 NOT NULL,
  "source_system" text NOT NULL,
  "source_tournament_id" text,
  "source_configuration_revision" bigint,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" text,
  "revoke_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."participant_auth_identifiers" enable row level security;

create table "participant_identity"."participant_auth_otp_attempts" (
  "request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text,
  "player_id" text,
  "auth_user_id" uuid,
  "email_identity_hash" text NOT NULL,
  "client_request_hash" text NOT NULL,
  "status" text NOT NULL,
  "safe_reason" text,
  "request_duration_ms" integer,
  "verification_duration_ms" integer,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."participant_auth_otp_attempts" enable row level security;

create table "participant_identity"."participant_auth_public_rate_events" (
  "event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auth_method" text NOT NULL,
  "client_fingerprint" text NOT NULL,
  "identifier_fingerprint" text NOT NULL,
  "outcome" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."participant_auth_public_rate_events" enable row level security;

create table "participant_identity"."participant_identity_contacts" (
  "tournament_id" text NOT NULL,
  "player_id" text NOT NULL,
  "email" text NOT NULL,
  "email_normalized" text NOT NULL,
  "identity_active" boolean DEFAULT true NOT NULL,
  "configuration_revision" bigint NOT NULL,
  "verified_by" text,
  "verified_at" timestamp with time zone,
  "source_system" text NOT NULL,
  "source_workbook_id" text,
  "source_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."participant_identity_contacts" enable row level security;

create table "participant_identity"."participant_phone_otp_attempts" (
  "attempt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "identifier_id" uuid NOT NULL,
  "identifier_revision" bigint NOT NULL,
  "player_id" text NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "requested_by_auth_user_id" uuid NOT NULL,
  "client_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "safe_reason" text,
  "provider_called" boolean DEFAULT false NOT NULL,
  "auth_phone_attached" boolean DEFAULT false NOT NULL,
  "verify_failure_count" integer DEFAULT 0 NOT NULL,
  "request_duration_ms" integer,
  "verification_duration_ms" integer,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "provider_requested_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "expires_at" timestamp with time zone DEFAULT now() + '00:10:00'::interval NOT NULL,
  "verified_at" timestamp with time zone,
  "used_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."participant_phone_otp_attempts" enable row level security;

create table "participant_identity"."tournament_roles" (
  "tournament_id" text NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "role_active" boolean DEFAULT true NOT NULL,
  "role_revision" bigint DEFAULT 1 NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "granted_by" text NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."tournament_roles" enable row level security;

create table "participant_identity"."user_player_links" (
  "link_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "player_id" text NOT NULL,
  "status" text NOT NULL,
  "link_revision" bigint DEFAULT 1 NOT NULL,
  "link_method" text NOT NULL,
  "email_identity_hash" text NOT NULL,
  "linked_at" timestamp with time zone,
  "linked_by" text,
  "revoked_at" timestamp with time zone,
  "revoked_by" text,
  "revoke_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "participant_identity"."user_player_links" enable row level security;

create table "scoring_authority"."audit_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text,
  "mutation_key" text,
  "action" text NOT NULL,
  "actor_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."audit_events" enable row level security;

create table "scoring_authority"."authority_epochs" (
  "epoch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "epoch_type" text NOT NULL,
  "status" text NOT NULL,
  "authority_before" text NOT NULL,
  "authority_after" text NOT NULL,
  "reconciliation_fingerprint" text NOT NULL,
  "google_checkpoints" jsonb NOT NULL,
  "supabase_match_revisions" jsonb NOT NULL,
  "deployment_commit" text NOT NULL,
  "actor_id" text NOT NULL,
  "reason" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "committed_at" timestamp with time zone
);
alter table "scoring_authority"."authority_epochs" enable row level security;

create table "scoring_authority"."calcutta_configuration_import_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "purchase_count" integer DEFAULT 0 NOT NULL,
  "ownership_count" integer DEFAULT 0 NOT NULL,
  "total_market_value" numeric(14,2) DEFAULT 0 NOT NULL,
  "requested_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."calcutta_configuration_import_runs" enable row level security;

create table "scoring_authority"."calcutta_configurations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "configuration_revision" bigint NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "purchases" jsonb NOT NULL,
  "ownership" jsonb NOT NULL,
  "point_structure" jsonb NOT NULL,
  "payout_structure" jsonb NOT NULL,
  "financial_contract" jsonb NOT NULL,
  "source_workbook_id" text NOT NULL,
  "status" text DEFAULT 'APPROVED'::text NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "superseded_at" timestamp with time zone
);
alter table "scoring_authority"."calcutta_configurations" enable row level security;

create table "scoring_authority"."competition_derived_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "round_number" integer DEFAULT 0 NOT NULL,
  "engine_key" text NOT NULL,
  "engine_version" text NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL,
  "calculated_by" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "duration_ms" numeric DEFAULT 0 NOT NULL,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."competition_derived_runs" enable row level security;

create table "scoring_authority"."competition_derived_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "engine_key" text NOT NULL,
  "engine_version" text NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "result_state" text NOT NULL,
  "result_payload" jsonb NOT NULL,
  "payload_hash" text NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "calculated_at" timestamp with time zone NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."competition_derived_snapshots" enable row level security;

create table "scoring_authority"."competition_recalculation_jobs" (
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "engine_key" text NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "requested_source_revision" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error_code" text,
  "last_error_safe" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."competition_recalculation_jobs" enable row level security;

create table "scoring_authority"."completed_history_awards" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "award_id" text NOT NULL,
  "award_type" text NOT NULL,
  "label" text NOT NULL,
  "recipient_kind" text NOT NULL,
  "winner_player_id" text,
  "winner_team_id" text,
  "recipient_display" text,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_awards" enable row level security;

create table "scoring_authority"."completed_history_correction_applications" (
  "revision_id" uuid NOT NULL,
  "correction_id" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_correction_applications" enable row level security;

create table "scoring_authority"."completed_history_course_appearances" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "appearance_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "course_id" text NOT NULL,
  "source_course_id" text NOT NULL,
  "display_name" text NOT NULL,
  "location" text,
  "tee" text,
  "rating" numeric,
  "slope" integer,
  "yardage" integer,
  "par" integer,
  "hole_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_course_appearances" enable row level security;

create table "scoring_authority"."completed_history_course_identities" (
  "course_id" text NOT NULL,
  "canonical_name" text NOT NULL,
  "canonical_location" text,
  "first_seen_year" integer NOT NULL,
  "identity_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."completed_history_course_identities" enable row level security;

create table "scoring_authority"."completed_history_current_revisions" (
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "revision_id" uuid NOT NULL,
  "project_ref" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "advanced_by" text NOT NULL,
  "advanced_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."completed_history_current_revisions" enable row level security;

create table "scoring_authority"."completed_history_import_runs" (
  "import_run_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "operation" text NOT NULL,
  "status" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "actor_id" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_import_runs" enable row level security;

create table "scoring_authority"."completed_history_match_participants" (
  "revision_id" uuid NOT NULL,
  "match_id" text NOT NULL,
  "player_id" text NOT NULL,
  "team_side" integer NOT NULL,
  "player_slot" integer NOT NULL,
  "tournament_handicap" numeric,
  "applied_handicap" numeric,
  "applied_strokes" numeric,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_match_participants" enable row level security;

create table "scoring_authority"."completed_history_matches" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "format" text NOT NULL,
  "course_appearance_id" text NOT NULL,
  "lifecycle" text NOT NULL,
  "completion_state" text NOT NULL,
  "scorecard_coverage" text NOT NULL,
  "result" text NOT NULL,
  "result_winner" text NOT NULL,
  "team_1_points" numeric,
  "team_2_points" numeric,
  "points_available" numeric,
  "points_availability" text NOT NULL,
  "source_match_key" text NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_matches" enable row level security;

create table "scoring_authority"."completed_history_record_eligibility" (
  "revision_id" uuid NOT NULL,
  "match_id" text NOT NULL,
  "player_id" text NOT NULL,
  "is_record_eligible" boolean NOT NULL,
  "reason_code" text NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_record_eligibility" enable row level security;

create table "scoring_authority"."completed_history_revisions" (
  "revision_id" uuid NOT NULL,
  "project_ref" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "revision_number" bigint NOT NULL,
  "source_fingerprint" text NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "database_payload_fingerprint" text NOT NULL,
  "import_contract_version" text NOT NULL,
  "correction_set_version" text NOT NULL,
  "importer_version" text NOT NULL,
  "source_counts" jsonb NOT NULL,
  "canonical_counts" jsonb NOT NULL,
  "certification" jsonb NOT NULL,
  "operation" text NOT NULL,
  "previous_revision_id" uuid,
  "correction_reason" text,
  "imported_by" text NOT NULL,
  "certified_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."completed_history_revisions" enable row level security;

create table "scoring_authority"."completed_history_roster_facts" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "player_id" text NOT NULL,
  "display_name" text NOT NULL,
  "team_id" text NOT NULL,
  "team_side" integer NOT NULL,
  "participation_status" text NOT NULL,
  "is_captain" boolean DEFAULT false NOT NULL,
  "is_governor" boolean,
  "tournament_handicap" numeric,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_roster_key" text
);
alter table "scoring_authority"."completed_history_roster_facts" enable row level security;

create table "scoring_authority"."completed_history_round_facts" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "format" text NOT NULL,
  "name" text NOT NULL,
  "team_size" integer NOT NULL,
  "points_per_match" numeric,
  "handicap_allowance" numeric,
  "course_appearance_id" text,
  "scoring_semantics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_round_facts" enable row level security;

create table "scoring_authority"."completed_history_scorecards" (
  "revision_id" uuid NOT NULL,
  "scorecard_id" text NOT NULL,
  "match_id" text NOT NULL,
  "entity_kind" text NOT NULL,
  "player_id" text,
  "team_side" integer,
  "player_slot" integer,
  "coverage_status" text NOT NULL,
  "recorded_holes" integer NOT NULL,
  "hole_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "score_semantics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_scorecards" enable row level security;

create table "scoring_authority"."completed_history_team_facts" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "team_id" text NOT NULL,
  "team_side" integer NOT NULL,
  "name" text NOT NULL,
  "captain_player_id" text,
  "logo_key" text,
  "presentation_identity" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_team_facts" enable row level security;

create table "scoring_authority"."completed_history_tournament_facts" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "start_date" date,
  "end_date" date,
  "destination" text,
  "timezone" text,
  "lifecycle" text NOT NULL,
  "score_availability" text NOT NULL,
  "official_team_1_points" numeric,
  "official_team_2_points" numeric,
  "total_awarded_points" numeric,
  "expected_configured_points" numeric,
  "champion_team_side" integer,
  "champion_team_id" text,
  "team_size" integer,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."completed_history_tournament_facts" enable row level security;

create table "scoring_authority"."draft_configuration_facts" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "draft_name" text NOT NULL,
  "draft_date" text,
  "draft_time" text,
  "time_zone" text,
  "location" text,
  "status_mode" text,
  "draft_format" text,
  "total_picks" integer NOT NULL,
  "team_1_id" text NOT NULL,
  "team_2_id" text NOT NULL,
  "team_1_captain_player_id" text,
  "team_2_captain_player_id" text,
  "first_pick_team_id" text NOT NULL,
  "notes" text
);
alter table "scoring_authority"."draft_configuration_facts" enable row level security;

create table "scoring_authority"."draft_current_revisions" (
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "revision_id" uuid NOT NULL,
  "advanced_by" text NOT NULL,
  "advanced_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."draft_current_revisions" enable row level security;

create table "scoring_authority"."draft_pick_facts" (
  "revision_id" uuid NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "pick_number" integer NOT NULL,
  "round_number" integer NOT NULL,
  "pick_within_round" integer NOT NULL,
  "source_team_id" text,
  "team_id" text,
  "player_id" text,
  "player_name_snapshot" text,
  "selected_at_source" text,
  "selected_by_source" text,
  "pick_status" text NOT NULL,
  "notes" text,
  "presentation_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."draft_pick_facts" enable row level security;

create table "scoring_authority"."draft_revisions" (
  "revision_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_ref" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "source_tabs" jsonb NOT NULL,
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "revision_number" bigint NOT NULL,
  "previous_revision_id" uuid,
  "source_fingerprint" text NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "picks_fingerprint" text NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "contract_version" text NOT NULL,
  "validation_status" text NOT NULL,
  "validation_diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_settings" jsonb NOT NULL,
  "source_picks" jsonb NOT NULL,
  "configuration" jsonb NOT NULL,
  "presentation_seed" jsonb NOT NULL,
  "operation" text NOT NULL,
  "correction_reason" text,
  "synchronized_by" text NOT NULL,
  "synchronized_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."draft_revisions" enable row level security;

create table "scoring_authority"."finalized_scorecard_snapshots" (
  "snapshot_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text NOT NULL,
  "snapshot_revision" bigint NOT NULL,
  "match_revision" bigint NOT NULL,
  "scoring_snapshot_id" text NOT NULL,
  "scoring_snapshot_revision" bigint NOT NULL,
  "source_fingerprint" text NOT NULL,
  "payload_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "state" text DEFAULT 'CURRENT'::text NOT NULL,
  "finalized_at" timestamp with time zone NOT NULL,
  "invalidated_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  "superseded_by_snapshot_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."finalized_scorecard_snapshots" enable row level security;

create table "scoring_authority"."game_center_presentations" (
  "match_id" text NOT NULL,
  "tournament_id" text NOT NULL,
  "course_name" text DEFAULT ''::text NOT NULL,
  "course_logo" text DEFAULT ''::text NOT NULL,
  "course_yardage" text DEFAULT ''::text NOT NULL,
  "tee_time" text DEFAULT ''::text NOT NULL,
  "starting_hole" text DEFAULT ''::text NOT NULL,
  "display_match_number" text DEFAULT ''::text NOT NULL,
  "match_sort_order" integer NOT NULL,
  "team_1_logo" text DEFAULT ''::text NOT NULL,
  "team_1_primary_color" text DEFAULT ''::text NOT NULL,
  "team_1_secondary_color" text DEFAULT ''::text NOT NULL,
  "team_2_logo" text DEFAULT ''::text NOT NULL,
  "team_2_primary_color" text DEFAULT ''::text NOT NULL,
  "team_2_secondary_color" text DEFAULT ''::text NOT NULL,
  "tournament_location" text DEFAULT ''::text NOT NULL,
  "tournament_logo" text DEFAULT ''::text NOT NULL,
  "tournament_status" text DEFAULT ''::text NOT NULL,
  "tournament_time_zone" text DEFAULT 'America/Chicago'::text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "source_updated_at" timestamp with time zone,
  "source_payload_hash" text NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."game_center_presentations" enable row level security;

create table "scoring_authority"."google_match_checkpoints" (
  "match_id" text NOT NULL,
  "last_supabase_match_revision" bigint DEFAULT 0 NOT NULL,
  "google_match_updated_at" timestamp with time zone,
  "google_match_revision" bigint DEFAULT 0 NOT NULL,
  "google_hole_revisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_outbox_event_id" uuid,
  "verified_fingerprint" text,
  "verified_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."google_match_checkpoints" enable row level security;

create table "scoring_authority"."google_outbox_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text NOT NULL,
  "match_revision" bigint NOT NULL,
  "hole_number" integer,
  "hole_revision" bigint,
  "mutation_key" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "claimed_by" text,
  "last_error_code" text,
  "last_error_safe" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone
);
alter table "scoring_authority"."google_outbox_events" enable row level security;

create table "scoring_authority"."guide_content_revisions" (
  "revision_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "projection_revision" bigint NOT NULL,
  "source_workbook_id" text NOT NULL,
  "content_fingerprint" text NOT NULL,
  "source_workbook_fingerprint" text NOT NULL,
  "payload_hash" text NOT NULL,
  "source_canonical_json" text NOT NULL,
  "content_canonical_json" text NOT NULL,
  "payload_canonical_json" text NOT NULL,
  "content_payload" jsonb NOT NULL,
  "validation_status" text NOT NULL,
  "source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_sync_sequence" bigint NOT NULL,
  "trigger_type" text NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."guide_content_revisions" enable row level security;

create table "scoring_authority"."guide_projection_current" (
  "tournament_id" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "revision_id" uuid NOT NULL,
  "publication_sequence" bigint DEFAULT 1 NOT NULL,
  "source_sync_sequence" bigint NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."guide_projection_current" enable row level security;

create table "scoring_authority"."guide_sync_controls" (
  "tournament_id" text NOT NULL,
  "next_attempt_sequence" bigint DEFAULT 1 NOT NULL,
  "newest_claimed_sequence" bigint DEFAULT 0 NOT NULL,
  "newest_completed_sequence" bigint DEFAULT 0 NOT NULL,
  "newest_published_sequence" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."guide_sync_controls" enable row level security;

create table "scoring_authority"."guide_sync_runs" (
  "run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "attempt_sequence" bigint NOT NULL,
  "claim_token" uuid NOT NULL,
  "project_ref" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "trigger_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "status" text DEFAULT 'CLAIMED'::text NOT NULL,
  "previous_content_fingerprint" text,
  "source_workbook_fingerprint" text,
  "new_content_fingerprint" text,
  "changed" boolean,
  "validation_status" text DEFAULT 'NOT_RUN'::text NOT NULL,
  "published_revision_id" uuid,
  "failure_category" text,
  "failure_safe" text,
  "audit_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."guide_sync_runs" enable row level security;

create table "scoring_authority"."guide_sync_worker_configuration" (
  "configuration_id" boolean DEFAULT true NOT NULL,
  "project_ref" text NOT NULL,
  "tournament_id" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "endpoint_url" text NOT NULL,
  "worker_secret" text NOT NULL,
  "vercel_protection_bypass" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "configured_by" text NOT NULL,
  "configured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_request_id" bigint,
  "last_invocation_id" uuid,
  "last_requested_at" timestamp with time zone
);
alter table "scoring_authority"."guide_sync_worker_configuration" enable row level security;

create table "scoring_authority"."hole_scores" (
  "match_id" text NOT NULL,
  "hole_number" integer NOT NULL,
  "hole_revision" bigint NOT NULL,
  "team_1_gross_scores" jsonb NOT NULL,
  "team_2_gross_scores" jsonb NOT NULL,
  "team_1_strokes" jsonb NOT NULL,
  "team_2_strokes" jsonb NOT NULL,
  "team_1_net_score" integer NOT NULL,
  "team_2_net_score" integer NOT NULL,
  "hole_winner" text NOT NULL,
  "source_google_revision" bigint DEFAULT 0 NOT NULL,
  "source_google_updated_at" timestamp with time zone,
  "mutation_key" text NOT NULL,
  "actor_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."hole_scores" enable row level security;

create table "scoring_authority"."ingress_gates" (
  "tournament_id" text NOT NULL,
  "state" text DEFAULT 'OPEN'::text NOT NULL,
  "authority" text DEFAULT 'GOOGLE'::text NOT NULL,
  "active_epoch_id" uuid,
  "unresolved_client_queues" integer DEFAULT 0 NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."ingress_gates" enable row level security;

create table "scoring_authority"."match_holes" (
  "match_id" text NOT NULL,
  "hole_number" integer NOT NULL,
  "snapshot_id" text NOT NULL,
  "stroke_index" integer NOT NULL,
  "par" integer NOT NULL,
  "yardage" integer
);
alter table "scoring_authority"."match_holes" enable row level security;

create table "scoring_authority"."match_participants" (
  "match_id" text NOT NULL,
  "player_id" text NOT NULL,
  "team_side" integer NOT NULL,
  "player_slot" integer NOT NULL,
  "handicap_index" numeric,
  "course_handicap" numeric,
  "playing_handicap" numeric NOT NULL,
  "final_strokes" integer NOT NULL
);
alter table "scoring_authority"."match_participants" enable row level security;

create table "scoring_authority"."matches" (
  "match_id" text NOT NULL,
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "format" text NOT NULL,
  "scoring_snapshot_id" text NOT NULL,
  "status" text NOT NULL,
  "scoring_locked" boolean DEFAULT false NOT NULL,
  "permission_revision" bigint DEFAULT 1 NOT NULL,
  "match_revision" bigint DEFAULT 0 NOT NULL,
  "source_google_revision" bigint DEFAULT 0 NOT NULL,
  "scored_holes" integer DEFAULT 0 NOT NULL,
  "current_hole" integer DEFAULT 0 NOT NULL,
  "holes_remaining" integer DEFAULT 18 NOT NULL,
  "team_1_holes_won" integer DEFAULT 0 NOT NULL,
  "team_2_holes_won" integer DEFAULT 0 NOT NULL,
  "running_result" text DEFAULT 'Scheduled'::text NOT NULL,
  "result_winner" text DEFAULT ''::text NOT NULL,
  "clinched" boolean DEFAULT false NOT NULL,
  "scorecard_complete" boolean DEFAULT false NOT NULL,
  "unresolved_mutations" integer DEFAULT 0 NOT NULL,
  "source_google_updated_at" timestamp with time zone,
  "authority_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finalized_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."matches" enable row level security;

create table "scoring_authority"."net_skins_configuration_entries" (
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "entry_id" text NOT NULL,
  "match_number" text DEFAULT ''::text NOT NULL,
  "format" text NOT NULL,
  "player_id_1" text NOT NULL,
  "player_id_2" text,
  "team_handicap" numeric(10,3),
  "buy_in" numeric(12,2) NOT NULL,
  "eligible" boolean DEFAULT true NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "individual_stroke_allocation" numeric(10,3) GENERATED ALWAYS AS (NULLIF(btrim(COALESCE(source_payload ->> 'Individual Stroke Allocation'::text, ''::text)), ''::text)::numeric) STORED
);
alter table "scoring_authority"."net_skins_configuration_entries" enable row level security;

create table "scoring_authority"."net_skins_configuration_import_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "round_count" integer DEFAULT 0 NOT NULL,
  "entry_count" integer DEFAULT 0 NOT NULL,
  "requested_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."net_skins_configuration_import_runs" enable row level security;

create table "scoring_authority"."net_skins_configurations" (
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "format" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "entry_type" text NOT NULL,
  "buy_in_per_entry" numeric(12,2) NOT NULL,
  "expected_pot" numeric(12,2) NOT NULL,
  "completion_rule" text NOT NULL,
  "payout_rounding" text NOT NULL,
  "tie_rule" text NOT NULL,
  "configuration_revision" bigint DEFAULT 1 NOT NULL,
  "configuration_fingerprint" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."net_skins_configurations" enable row level security;

create table "scoring_authority"."odds_calculation_checkpoints" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "job_id" text NOT NULL,
  "checkpoint_sequence" integer NOT NULL,
  "completed_iterations" integer NOT NULL,
  "checkpoint_contract_version" text NOT NULL,
  "checkpoint_payload" jsonb NOT NULL,
  "checkpoint_hash" text NOT NULL,
  "attempt_number" integer NOT NULL,
  "resource_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."odds_calculation_checkpoints" enable row level security;

create table "scoring_authority"."odds_calculation_jobs" (
  "job_id" text NOT NULL,
  "tournament_id" text NOT NULL,
  "phase" text NOT NULL,
  "total_iterations" integer NOT NULL,
  "completed_iterations" integer DEFAULT 0 NOT NULL,
  "engine_version" text NOT NULL,
  "publication_contract_version" text NOT NULL,
  "checkpoint_contract_version" text NOT NULL,
  "deterministic_seed" text NOT NULL,
  "input_fingerprint" text NOT NULL,
  "settings_fingerprint" text NOT NULL,
  "invocation_fingerprint" text NOT NULL,
  "source_revision" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "input_snapshot" jsonb NOT NULL,
  "checkpoint_payload" jsonb NOT NULL,
  "checkpoint_hash" text NOT NULL,
  "checkpoint_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "claim_token" uuid,
  "lease_expires_at" timestamp with time zone,
  "requested_by" text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "output_timestamp" timestamp with time zone NOT NULL,
  "result_payload" jsonb,
  "result_fingerprint" text,
  "output_payload_bytes" integer,
  "resource_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_error_code" text,
  "last_error_safe" text,
  "superseded_by" text,
  "superseded_at" timestamp with time zone,
  "publication_status" text DEFAULT 'NOT_REQUESTED'::text NOT NULL,
  "publication_reference" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."odds_calculation_jobs" enable row level security;

create table "scoring_authority"."odds_google_mirror_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "snapshot_id" uuid NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error_safe" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."odds_google_mirror_jobs" enable row level security;

create table "scoring_authority"."odds_input_configurations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "configuration_revision" bigint NOT NULL,
  "source_workbook_id" text NOT NULL,
  "settings" jsonb NOT NULL,
  "historical_ratings" jsonb NOT NULL,
  "settings_fingerprint" text NOT NULL,
  "ratings_fingerprint" text NOT NULL,
  "pairing_fingerprint" text NOT NULL,
  "bundle_fingerprint" text NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "superseded_at" timestamp with time zone,
  "source_tab" text,
  "source_fingerprint" text,
  "canonical_settings" jsonb,
  "effective_settings" jsonb,
  "effective_settings_fingerprint" text,
  "settings_contract_version" text,
  "validation_status" text,
  "validation_diagnostics" jsonb,
  "synchronized_at" timestamp with time zone,
  "previous_configuration_id" uuid
);
alter table "scoring_authority"."odds_input_configurations" enable row level security;

create table "scoring_authority"."odds_input_import_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "bundle_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "requested_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."odds_input_import_runs" enable row level security;

create table "scoring_authority"."odds_published_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "milestone" text NOT NULL,
  "phase_order" integer NOT NULL,
  "publication_revision" bigint NOT NULL,
  "published_at" timestamp with time zone NOT NULL,
  "published_payload" jsonb NOT NULL,
  "payload_hash" text NOT NULL,
  "source_fingerprint" text,
  "engine_version" text,
  "engine_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "google_publication_fingerprint" text NOT NULL,
  "google_publication_reference" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_current_for_milestone" boolean DEFAULT true NOT NULL,
  "is_current_official" boolean DEFAULT false NOT NULL,
  "publication_verified" boolean DEFAULT true NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "logical_payload_hash" text,
  "settings_fingerprint" text,
  "ratings_fingerprint" text,
  "pairing_fingerprint" text,
  "deterministic_seed" text,
  "publication_actor_id" text,
  "mirror_status" text DEFAULT 'VERIFIED_GOOGLE_IMPORT'::text NOT NULL
);
alter table "scoring_authority"."odds_published_snapshots" enable row level security;

create table "scoring_authority"."odds_snapshot_import_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "import_fingerprint" text NOT NULL,
  "current_official_milestone" text NOT NULL,
  "status" text NOT NULL,
  "snapshot_count" integer NOT NULL,
  "requested_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."odds_snapshot_import_runs" enable row level security;

create table "scoring_authority"."participant_home_presentations" (
  "tournament_id" text NOT NULL,
  "presentation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_workbook_id" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."participant_home_presentations" enable row level security;

create table "scoring_authority"."players" (
  "player_id" text NOT NULL,
  "display_name" text NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."players" enable row level security;

create table "scoring_authority"."rounds" (
  "tournament_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "format" text NOT NULL,
  "name" text NOT NULL,
  "handicap_allowance" numeric,
  "status" text DEFAULT 'UPCOMING'::text NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."rounds" enable row level security;

create table "scoring_authority"."score_mutations" (
  "match_id" text NOT NULL,
  "mutation_key" text NOT NULL,
  "mutation_type" text NOT NULL,
  "hole_number" integer,
  "payload_hash" text NOT NULL,
  "previous_match_revision" bigint NOT NULL,
  "next_match_revision" bigint NOT NULL,
  "previous_hole_revision" bigint,
  "next_hole_revision" bigint,
  "result" jsonb NOT NULL,
  "actor_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."score_mutations" enable row level security;

create table "scoring_authority"."score_revision_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "match_id" text NOT NULL,
  "hole_number" integer,
  "mutation_key" text NOT NULL,
  "action" text NOT NULL,
  "previous_match_revision" bigint NOT NULL,
  "next_match_revision" bigint NOT NULL,
  "previous_hole_revision" bigint,
  "next_hole_revision" bigint,
  "before_state" jsonb NOT NULL,
  "after_state" jsonb NOT NULL,
  "actor_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."score_revision_history" enable row level security;

create table "scoring_authority"."scorecard_archive_checkpoints" (
  "match_id" text NOT NULL,
  "tournament_id" text NOT NULL,
  "current_snapshot_id" uuid,
  "finalized_snapshot_revision" bigint,
  "finalized_match_revision" bigint,
  "source_fingerprint" text,
  "archive_payload_hash" text,
  "expected_logical_identities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "google_row_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "google_readback_hash" text,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "last_job_id" uuid,
  "last_error_code" text,
  "last_error_safe" text,
  "verified_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."scorecard_archive_checkpoints" enable row level security;

create table "scoring_authority"."scorecard_archive_jobs" (
  "job_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text NOT NULL,
  "snapshot_id" uuid NOT NULL,
  "snapshot_revision" bigint NOT NULL,
  "match_revision" bigint NOT NULL,
  "event_type" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "archive_payload_hash" text NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "claimed_by" text,
  "claim_token" uuid,
  "last_error_code" text,
  "last_error_safe" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verified_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."scorecard_archive_jobs" enable row level security;

create table "scoring_authority"."scorecard_archive_worker_configuration" (
  "configuration_id" boolean DEFAULT true NOT NULL,
  "project_ref" text NOT NULL,
  "endpoint_url" text NOT NULL,
  "worker_secret" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "configured_by" text NOT NULL,
  "configured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_request_id" bigint,
  "last_requested_at" timestamp with time zone,
  "vercel_protection_bypass" text
);
alter table "scoring_authority"."scorecard_archive_worker_configuration" enable row level security;

create table "scoring_authority"."scoring_ingress_leases" (
  "lease_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text NOT NULL,
  "authority" text NOT NULL,
  "actor_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
alter table "scoring_authority"."scoring_ingress_leases" enable row level security;

create table "scoring_authority"."scoring_permissions" (
  "match_id" text NOT NULL,
  "player_id" text NOT NULL,
  "can_score" boolean DEFAULT true NOT NULL,
  "permission_revision" bigint DEFAULT 1 NOT NULL,
  "revoked_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."scoring_permissions" enable row level security;

create table "scoring_authority"."scoring_snapshots" (
  "snapshot_id" text NOT NULL,
  "tournament_id" text NOT NULL,
  "match_id" text NOT NULL,
  "snapshot_revision" bigint NOT NULL,
  "scoring_rules_version" text NOT NULL,
  "format" text NOT NULL,
  "handicap_allowance" numeric,
  "course_id" text NOT NULL,
  "tee" text NOT NULL,
  "rating" numeric,
  "slope" integer,
  "par" integer NOT NULL,
  "match_netting_baseline" text NOT NULL,
  "hole_definitions" jsonb NOT NULL,
  "participant_configuration" jsonb NOT NULL,
  "team_configuration" jsonb NOT NULL,
  "effective_at" timestamp with time zone,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "canonical_hash" text NOT NULL
);
alter table "scoring_authority"."scoring_snapshots" enable row level security;

create table "scoring_authority"."teams" (
  "tournament_id" text NOT NULL,
  "team_id" text NOT NULL,
  "team_side" integer NOT NULL,
  "name" text NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
alter table "scoring_authority"."teams" enable row level security;

create table "scoring_authority"."tournament_players" (
  "tournament_id" text NOT NULL,
  "player_id" text NOT NULL,
  "team_id" text NOT NULL,
  "team_side" integer NOT NULL,
  "participation_status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "source_roster_key" text NOT NULL,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."tournament_players" enable row level security;

create table "scoring_authority"."tournaments" (
  "tournament_id" text NOT NULL,
  "tournament_year" integer NOT NULL,
  "name" text NOT NULL,
  "source_workbook_id" text NOT NULL,
  "scoring_authority" text DEFAULT 'GOOGLE'::text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table "scoring_authority"."tournaments" enable row level security;

alter table "participant_identity"."identity_audit_events" add constraint "identity_audit_events_pkey" PRIMARY KEY (event_id);
alter table "participant_identity"."identity_config_import_runs" add constraint "identity_config_import_runs_pkey" PRIMARY KEY (run_id);
alter table "participant_identity"."identity_context_revisions" add constraint "identity_context_revisions_pkey" PRIMARY KEY (tournament_id);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_pkey" PRIMARY KEY (identifier_id);
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_pkey" PRIMARY KEY (request_id);
alter table "participant_identity"."participant_auth_public_rate_events" add constraint "participant_auth_public_rate_events_pkey" PRIMARY KEY (event_id);
alter table "participant_identity"."participant_identity_contacts" add constraint "participant_identity_contacts_pkey" PRIMARY KEY (tournament_id, player_id);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_pkey" PRIMARY KEY (attempt_id);
alter table "participant_identity"."tournament_roles" add constraint "tournament_roles_pkey" PRIMARY KEY (tournament_id, auth_user_id, role);
alter table "participant_identity"."user_player_links" add constraint "user_player_links_pkey" PRIMARY KEY (link_id);
alter table "scoring_authority"."audit_events" add constraint "audit_events_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."authority_epochs" add constraint "authority_epochs_pkey" PRIMARY KEY (epoch_id);
alter table "scoring_authority"."calcutta_configuration_import_runs" add constraint "calcutta_configuration_import_runs_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."competition_recalculation_jobs" add constraint "competition_recalculation_jobs_pkey" PRIMARY KEY (tournament_id, round_number, engine_key);
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_pkey" PRIMARY KEY (revision_id, award_id);
alter table "scoring_authority"."completed_history_correction_applications" add constraint "completed_history_correction_applications_pkey" PRIMARY KEY (revision_id, correction_id);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_pkey" PRIMARY KEY (revision_id, appearance_id);
alter table "scoring_authority"."completed_history_course_identities" add constraint "completed_history_course_identities_pkey" PRIMARY KEY (course_id);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_pkey" PRIMARY KEY (tournament_id);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_pkey" PRIMARY KEY (import_run_id);
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_participants_pkey" PRIMARY KEY (revision_id, match_id, team_side, player_slot);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_pkey" PRIMARY KEY (revision_id, match_id);
alter table "scoring_authority"."completed_history_record_eligibility" add constraint "completed_history_record_eligibility_pkey" PRIMARY KEY (revision_id, match_id, player_id);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_pkey" PRIMARY KEY (revision_id);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_pkey" PRIMARY KEY (revision_id, player_id);
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_pkey" PRIMARY KEY (revision_id, round_number);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_pkey" PRIMARY KEY (revision_id, scorecard_id);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_pkey" PRIMARY KEY (revision_id, team_id);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_pkey" PRIMARY KEY (revision_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_pkey" PRIMARY KEY (revision_id);
alter table "scoring_authority"."draft_current_revisions" add constraint "draft_current_revisions_pkey" PRIMARY KEY (tournament_id);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_pkey" PRIMARY KEY (revision_id, pick_number);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_pkey" PRIMARY KEY (revision_id);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_pkey" PRIMARY KEY (snapshot_id);
alter table "scoring_authority"."game_center_presentations" add constraint "game_center_presentations_pkey" PRIMARY KEY (match_id);
alter table "scoring_authority"."google_match_checkpoints" add constraint "google_match_checkpoints_pkey" PRIMARY KEY (match_id);
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_pkey" PRIMARY KEY (revision_id);
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_pkey" PRIMARY KEY (tournament_id);
alter table "scoring_authority"."guide_sync_controls" add constraint "guide_sync_controls_pkey" PRIMARY KEY (tournament_id);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_pkey" PRIMARY KEY (run_id);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_pkey" PRIMARY KEY (configuration_id);
alter table "scoring_authority"."hole_scores" add constraint "hole_scores_pkey" PRIMARY KEY (match_id, hole_number);
alter table "scoring_authority"."ingress_gates" add constraint "ingress_gates_pkey" PRIMARY KEY (tournament_id);
alter table "scoring_authority"."match_holes" add constraint "match_holes_pkey" PRIMARY KEY (match_id, hole_number);
alter table "scoring_authority"."match_participants" add constraint "match_participants_pkey" PRIMARY KEY (match_id, team_side, player_slot);
alter table "scoring_authority"."matches" add constraint "matches_pkey" PRIMARY KEY (match_id);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_pkey" PRIMARY KEY (tournament_id, round_number, entry_id);
alter table "scoring_authority"."net_skins_configuration_import_runs" add constraint "net_skins_configuration_import_runs_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_pkey" PRIMARY KEY (tournament_id, round_number);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_pkey" PRIMARY KEY (job_id);
alter table "scoring_authority"."odds_google_mirror_jobs" add constraint "odds_google_mirror_jobs_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."odds_input_import_runs" add constraint "odds_input_import_runs_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."odds_snapshot_import_runs" add constraint "odds_snapshot_import_runs_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."participant_home_presentations" add constraint "participant_home_presentations_pkey" PRIMARY KEY (tournament_id);
alter table "scoring_authority"."players" add constraint "players_pkey" PRIMARY KEY (player_id);
alter table "scoring_authority"."rounds" add constraint "rounds_pkey" PRIMARY KEY (tournament_id, round_number);
alter table "scoring_authority"."score_mutations" add constraint "score_mutations_pkey" PRIMARY KEY (match_id, mutation_key);
alter table "scoring_authority"."score_revision_history" add constraint "score_revision_history_pkey" PRIMARY KEY (id);
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_pkey" PRIMARY KEY (match_id);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_pkey" PRIMARY KEY (job_id);
alter table "scoring_authority"."scorecard_archive_worker_configuration" add constraint "scorecard_archive_worker_configuration_pkey" PRIMARY KEY (configuration_id);
alter table "scoring_authority"."scoring_ingress_leases" add constraint "scoring_ingress_leases_pkey" PRIMARY KEY (lease_id);
alter table "scoring_authority"."scoring_permissions" add constraint "scoring_permissions_pkey" PRIMARY KEY (match_id, player_id);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_pkey" PRIMARY KEY (snapshot_id);
alter table "scoring_authority"."teams" add constraint "teams_pkey" PRIMARY KEY (tournament_id, team_id);
alter table "scoring_authority"."tournament_players" add constraint "tournament_players_pkey" PRIMARY KEY (tournament_id, player_id);
alter table "scoring_authority"."tournaments" add constraint "tournaments_pkey" PRIMARY KEY (tournament_id);
alter table "participant_identity"."user_player_links" add constraint "user_player_links_auth_user_id_key" UNIQUE (auth_user_id);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_tournament_id_configuration_revisio_key" UNIQUE (tournament_id, configuration_revision);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_tournament_id_round_number_engine__key" UNIQUE (tournament_id, round_number, engine_key, engine_version, configuration_fingerprint, source_fingerprint, payload_hash, status);
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_tournament_id_round_number_en_key" UNIQUE (tournament_id, round_number, engine_key, engine_version, configuration_fingerprint, source_fingerprint, payload_hash);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearanc_revision_id_round_number_key" UNIQUE (revision_id, round_number);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_revision_id_key" UNIQUE (revision_id);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_tournament_year_key" UNIQUE (tournament_year);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_revision_id_key" UNIQUE (revision_id);
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_parti_revision_id_match_id_player_i_key" UNIQUE (revision_id, match_id, player_id);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_revision_id_source_match_key_key" UNIQUE (revision_id, source_match_key);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_project_ref_tournament_year_sou_key" UNIQUE (project_ref, tournament_year, source_fingerprint, payload_fingerprint, database_payload_fingerprint);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_revision_id_tournament_id_key" UNIQUE (revision_id, tournament_id);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_tournament_id_revision_number_key" UNIQUE (tournament_id, revision_number);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_tournament_year_revision_number_key" UNIQUE (tournament_year, revision_number);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_revision_id_team_side_key" UNIQUE (revision_id, team_side);
alter table "scoring_authority"."draft_current_revisions" add constraint "draft_current_revisions_revision_id_key" UNIQUE (revision_id);
alter table "scoring_authority"."draft_current_revisions" add constraint "draft_current_revisions_tournament_year_key" UNIQUE (tournament_year);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_revision_id_player_id_key" UNIQUE (revision_id, player_id);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_revision_id_tournament_id_key" UNIQUE (revision_id, tournament_id);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_tournament_id_payload_fingerprint_key" UNIQUE (tournament_id, payload_fingerprint);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_tournament_id_revision_number_key" UNIQUE (tournament_id, revision_number);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_match_id_match_revision_key" UNIQUE (match_id, match_revision);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_match_id_snapshot_revision_key" UNIQUE (match_id, snapshot_revision);
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_match_id_match_revision_key" UNIQUE (match_id, match_revision);
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_match_id_mutation_key_key" UNIQUE (match_id, mutation_key);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_tournament_id_content_fingerprint_key" UNIQUE (tournament_id, content_fingerprint);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_tournament_id_projection_revision_key" UNIQUE (tournament_id, projection_revision);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_tournament_id_revision_id_key" UNIQUE (tournament_id, revision_id);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_tournament_id_source_workbook_id_re_key" UNIQUE (tournament_id, source_workbook_id, revision_id);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_claim_token_key" UNIQUE (claim_token);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_tournament_id_attempt_sequence_key" UNIQUE (tournament_id, attempt_sequence);
alter table "scoring_authority"."match_participants" add constraint "match_participants_match_id_player_id_key" UNIQUE (match_id, player_id);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_job_id_checkpoint_sequence_key" UNIQUE (job_id, checkpoint_sequence);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_job_id_completed_iterations_key" UNIQUE (job_id, completed_iterations);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_invocation_fingerprint_key" UNIQUE (invocation_fingerprint);
alter table "scoring_authority"."odds_google_mirror_jobs" add constraint "odds_google_mirror_jobs_snapshot_id_key" UNIQUE (snapshot_id);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_tournament_id_bundle_fingerprint_key" UNIQUE (tournament_id, bundle_fingerprint);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_tournament_id_configuration_revis_key" UNIQUE (tournament_id, configuration_revision);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_tournament_id_milestone_published__key" UNIQUE (tournament_id, milestone, published_at, payload_hash);
alter table "scoring_authority"."score_revision_history" add constraint "score_revision_history_match_id_mutation_key_key" UNIQUE (match_id, mutation_key);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_match_id_event_type_match_revision_key" UNIQUE (match_id, event_type, match_revision);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_match_id_snapshot_revision_key" UNIQUE (match_id, snapshot_revision);
alter table "scoring_authority"."teams" add constraint "teams_tournament_id_team_side_key" UNIQUE (tournament_id, team_side);
alter table "scoring_authority"."tournaments" add constraint "tournaments_tournament_year_key" UNIQUE (tournament_year);
alter table "participant_identity"."identity_config_import_runs" add constraint "identity_config_import_runs_configuration_revision_check" CHECK (configuration_revision > 0);
alter table "participant_identity"."identity_config_import_runs" add constraint "identity_config_import_runs_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."identity_config_import_runs" add constraint "identity_config_import_runs_status_check" CHECK (status = ANY (ARRAY['APPLIED'::text, 'REVIEW_REQUIRED'::text, 'APPROVED'::text, 'REJECTED'::text]));
alter table "participant_identity"."identity_context_revisions" add constraint "identity_context_revisions_context_revision_check" CHECK (context_revision > 0);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_check" CHECK (identifier_type = 'EMAIL'::text AND normalized_value_private = lower(normalized_value_private) AND normalized_value_private ~* ('^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text COLLATE "C") OR identifier_type = 'PHONE'::text AND normalized_value_private ~ ('^\+[1-9][0-9]{7,14}$'::text COLLATE "C"));
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_check1" CHECK (status <> 'VERIFIED'::text OR verified_at IS NOT NULL);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_check2" CHECK ((status <> ALL (ARRAY['ELIGIBLE'::text, 'VERIFICATION_PENDING'::text])) OR verified_at IS NULL);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_check3" CHECK (status <> 'REVOKED'::text OR revoked_at IS NOT NULL);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_identifier_type_check" CHECK (identifier_type = ANY (ARRAY['EMAIL'::text, 'PHONE'::text]));
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_normalized_value_private_check" CHECK (normalized_value_private = btrim(normalized_value_private));
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_revision_check" CHECK (revision > 0);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_source_configuration_revisio_check" CHECK (source_configuration_revision IS NULL OR source_configuration_revision > 0);
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_status_check" CHECK (status = ANY (ARRAY['ELIGIBLE'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text, 'REVOKED'::text]));
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_client_request_hash_check" CHECK (client_request_hash ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_email_identity_hash_check" CHECK (email_identity_hash ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_request_duration_ms_check" CHECK (request_duration_ms IS NULL OR request_duration_ms >= 0);
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_status_check" CHECK (status = ANY (ARRAY['AUTHORIZED'::text, 'REJECTED'::text, 'SENT'::text, 'DELIVERY_FAILED'::text, 'VERIFIED'::text, 'VERIFICATION_FAILED'::text]));
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_verification_duration_ms_check" CHECK (verification_duration_ms IS NULL OR verification_duration_ms >= 0);
alter table "participant_identity"."participant_auth_public_rate_events" add constraint "participant_auth_public_rate_event_identifier_fingerprint_check" CHECK (identifier_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."participant_auth_public_rate_events" add constraint "participant_auth_public_rate_events_auth_method_check" CHECK (auth_method = 'PHONE'::text);
alter table "participant_identity"."participant_auth_public_rate_events" add constraint "participant_auth_public_rate_events_client_fingerprint_check" CHECK (client_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."participant_auth_public_rate_events" add constraint "participant_auth_public_rate_events_outcome_check" CHECK (outcome = ANY (ARRAY['REQUEST_ACCEPTED'::text, 'RATE_LIMITED'::text]));
alter table "participant_identity"."participant_identity_contacts" add constraint "participant_identity_contacts_configuration_revision_check" CHECK (configuration_revision > 0);
alter table "participant_identity"."participant_identity_contacts" add constraint "participant_identity_contacts_email_check" CHECK (email = btrim(email));
alter table "participant_identity"."participant_identity_contacts" add constraint "participant_identity_contacts_email_normalized_check" CHECK (email_normalized = lower(btrim(email_normalized)));
alter table "participant_identity"."participant_identity_contacts" add constraint "participant_identity_contacts_email_normalized_check1" CHECK (email_normalized ~* ('^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text COLLATE "C"));
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_check" CHECK (verified_at IS NULL OR status = 'VERIFIED'::text);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_check1" CHECK (used_at IS NULL OR status = 'VERIFIED'::text);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_client_fingerprint_check" CHECK (client_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_identifier_revision_check" CHECK (identifier_revision > 0);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_request_duration_ms_check" CHECK (request_duration_ms IS NULL OR request_duration_ms >= 0);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_status_check" CHECK (status = ANY (ARRAY['REQUESTING'::text, 'SENT'::text, 'VERIFIED'::text, 'SEND_FAILED'::text, 'VERIFY_LOCKED'::text, 'EXPIRED'::text, 'CANCELLED'::text, 'RATE_LIMITED'::text, 'UUID_MISMATCH'::text]));
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_verification_duration_ms_check" CHECK (verification_duration_ms IS NULL OR verification_duration_ms >= 0);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_verify_failure_count_check" CHECK (verify_failure_count >= 0 AND verify_failure_count <= 5);
alter table "participant_identity"."tournament_roles" add constraint "tournament_roles_role_check" CHECK (role = ANY (ARRAY['PARTICIPANT'::text, 'CAPTAIN'::text, 'DIRECTOR'::text, 'IDENTITY_ADMIN'::text]));
alter table "participant_identity"."tournament_roles" add constraint "tournament_roles_role_revision_check" CHECK (role_revision > 0);
alter table "participant_identity"."user_player_links" add constraint "user_player_links_email_identity_hash_check" CHECK (email_identity_hash ~ '^[0-9a-f]{64}$'::text);
alter table "participant_identity"."user_player_links" add constraint "user_player_links_link_revision_check" CHECK (link_revision > 0);
alter table "participant_identity"."user_player_links" add constraint "user_player_links_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'REVOKED'::text]));
alter table "scoring_authority"."authority_epochs" add constraint "authority_epochs_authority_after_check" CHECK (authority_after = ANY (ARRAY['GOOGLE'::text, 'SUPABASE'::text]));
alter table "scoring_authority"."authority_epochs" add constraint "authority_epochs_authority_before_check" CHECK (authority_before = ANY (ARRAY['GOOGLE'::text, 'SUPABASE'::text]));
alter table "scoring_authority"."authority_epochs" add constraint "authority_epochs_epoch_type_check" CHECK (epoch_type = ANY (ARRAY['CUTOVER'::text, 'ROLLBACK'::text]));
alter table "scoring_authority"."authority_epochs" add constraint "authority_epochs_status_check" CHECK (status = ANY (ARRAY['PREPARED'::text, 'COMMITTED'::text, 'BLOCKED'::text, 'ABORTED'::text]));
alter table "scoring_authority"."calcutta_configuration_import_runs" add constraint "calcutta_configuration_import_r_configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."calcutta_configuration_import_runs" add constraint "calcutta_configuration_import_runs_status_check" CHECK (status = ANY (ARRAY['APPLIED'::text, 'NO_CHANGE'::text, 'REJECTED'::text]));
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_configuration_revision_check" CHECK (configuration_revision > 0);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_financial_contract_check" CHECK (jsonb_typeof(financial_contract) = 'object'::text);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_ownership_check" CHECK (jsonb_typeof(ownership) = 'array'::text);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_payout_structure_check" CHECK (jsonb_typeof(payout_structure) = 'array'::text);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_point_structure_check" CHECK (jsonb_typeof(point_structure) = 'array'::text);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_purchases_check" CHECK (jsonb_typeof(purchases) = 'array'::text);
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_status_check" CHECK (status = ANY (ARRAY['APPROVED'::text, 'SUPERSEDED'::text]));
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_tournament_year_check" CHECK (tournament_year >= 2000 AND tournament_year <= 2200);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_duration_ms_check" CHECK (duration_ms >= 0::numeric);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_status_check" CHECK (status = ANY (ARRAY['SUCCEEDED'::text, 'FAILED'::text]));
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_result_payload_check" CHECK (jsonb_typeof(result_payload) = 'object'::text);
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_result_state_check" CHECK (result_state = ANY (ARRAY['PROVISIONAL'::text, 'OFFICIAL'::text]));
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."competition_recalculation_jobs" add constraint "competition_recalculation_jobs_requested_source_revision_check" CHECK (jsonb_typeof(requested_source_revision) = 'object'::text);
alter table "scoring_authority"."competition_recalculation_jobs" add constraint "competition_recalculation_jobs_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text]));
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_check" CHECK (recipient_kind = 'PLAYER'::text AND winner_player_id IS NOT NULL OR recipient_kind = 'TEAM'::text AND winner_team_id IS NOT NULL OR recipient_kind = 'TEXT'::text AND btrim(COALESCE(recipient_display, ''::text)) <> ''::text OR recipient_kind = 'UNAVAILABLE'::text AND winner_player_id IS NULL AND winner_team_id IS NULL);
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_recipient_kind_check" CHECK (recipient_kind = ANY (ARRAY['PLAYER'::text, 'TEAM'::text, 'TEXT'::text, 'UNAVAILABLE'::text]));
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_correction_applications" add constraint "completed_history_correction_applications_evidence_check" CHECK (jsonb_typeof(evidence) = 'object'::text);
alter table "scoring_authority"."completed_history_correction_applications" add constraint "completed_history_correction_applications_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_hole_definitions_check" CHECK (jsonb_typeof(hole_definitions) = 'array'::text);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_hole_definitions_check1" CHECK (jsonb_array_length(hole_definitions) = ANY (ARRAY[0, 18]));
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_par_check" CHECK (par IS NULL OR par > 0);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_slope_check" CHECK (slope IS NULL OR slope > 0);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_yardage_check" CHECK (yardage IS NULL OR yardage > 0);
alter table "scoring_authority"."completed_history_course_identities" add constraint "completed_history_course_identities_first_seen_year_check" CHECK (first_seen_year >= 2017 AND first_seen_year <= 2025);
alter table "scoring_authority"."completed_history_course_identities" add constraint "completed_history_course_identities_identity_payload_check" CHECK (jsonb_typeof(identity_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_project_ref_check" CHECK (project_ref = 'ymqhhtxaywtqllynrmxe'::text);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_source_workbook_id_check" CHECK (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_tournament_year_check" CHECK (tournament_year >= 2017 AND tournament_year <= 2025);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_metadata_check" CHECK (jsonb_typeof(metadata) = 'object'::text);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_operation_check" CHECK (operation = ANY (ARRAY['INITIAL_IMPORT'::text, 'CORRECTION'::text]));
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_payload_fingerprint_check" CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_request_fingerprint_check" CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_status_check" CHECK (status = 'SUCCEEDED'::text);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_tournament_year_check" CHECK (tournament_year >= 2017 AND tournament_year <= 2025);
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_participants_player_slot_check" CHECK (player_slot = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_participants_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_participants_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_check" CHECK (points_availability = 'RECORDED'::text AND team_1_points IS NOT NULL AND team_2_points IS NOT NULL AND points_available IS NOT NULL OR points_availability = 'UNAVAILABLE'::text AND team_1_points IS NULL AND team_2_points IS NULL);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_completion_state_check" CHECK (completion_state = ANY (ARRAY['COMPLETE'::text, 'CONCEDED'::text, 'FORFEIT'::text, 'LEGACY_FINAL'::text]));
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_lifecycle_check" CHECK (lifecycle = 'FINAL'::text);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_points_availability_check" CHECK (points_availability = ANY (ARRAY['RECORDED'::text, 'UNAVAILABLE'::text]));
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_result_winner_check" CHECK (result_winner = ANY (ARRAY['Team 1'::text, 'Team 2'::text, 'Halved'::text]));
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_scorecard_coverage_check" CHECK (scorecard_coverage = ANY (ARRAY['COMPLETE'::text, 'PARTIAL'::text, 'UNAVAILABLE'::text]));
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_record_eligibility" add constraint "completed_history_record_eligibility_reason_code_check" CHECK (btrim(reason_code) <> ''::text);
alter table "scoring_authority"."completed_history_record_eligibility" add constraint "completed_history_record_eligibility_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_canonical_counts_check" CHECK (jsonb_typeof(canonical_counts) = 'object'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_certification_check" CHECK (jsonb_typeof(certification) = 'object'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_check" CHECK (operation = 'INITIAL_IMPORT'::text AND previous_revision_id IS NULL AND correction_reason IS NULL OR operation = 'CORRECTION'::text AND previous_revision_id IS NOT NULL AND length(btrim(correction_reason)) >= 10);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_database_payload_fingerprint_check" CHECK (database_payload_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_operation_check" CHECK (operation = ANY (ARRAY['INITIAL_IMPORT'::text, 'CORRECTION'::text]));
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_payload_fingerprint_check" CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_project_ref_check" CHECK (project_ref = 'ymqhhtxaywtqllynrmxe'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_revision_number_check" CHECK (revision_number > 0);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_source_counts_check" CHECK (jsonb_typeof(source_counts) = 'object'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_source_workbook_id_check" CHECK (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_tournament_year_check" CHECK (tournament_year >= 2017 AND tournament_year <= 2025);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_participation_status_check" CHECK (participation_status = ANY (ARRAY['ACTIVE'::text, 'WITHDRAWN'::text, 'INACTIVE'::text]));
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_source_key_nonempty" CHECK (source_roster_key IS NOT NULL AND length(btrim(source_roster_key)) > 0) NOT VALID;
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_round_number_check" CHECK (round_number >= 1 AND round_number <= 99);
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_scoring_semantics_check" CHECK (jsonb_typeof(scoring_semantics) = 'object'::text);
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_team_size_check" CHECK (team_size > 0);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_check" CHECK (coverage_status = 'COMPLETE'::text AND recorded_holes = 18 AND jsonb_array_length(hole_values) = 18 OR coverage_status = 'PARTIAL'::text AND recorded_holes >= 1 AND recorded_holes <= 17 AND jsonb_array_length(hole_values) = 18 OR coverage_status = 'UNAVAILABLE'::text AND recorded_holes = 0 AND (jsonb_array_length(hole_values) = ANY (ARRAY[0, 18])));
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_coverage_status_check" CHECK (coverage_status = ANY (ARRAY['COMPLETE'::text, 'PARTIAL'::text, 'UNAVAILABLE'::text]));
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_entity_kind_check" CHECK (entity_kind = ANY (ARRAY['PLAYER'::text, 'PAIRING'::text, 'TEAM'::text]));
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_hole_values_check" CHECK (jsonb_typeof(hole_values) = 'array'::text);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_player_slot_check" CHECK (player_slot = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_recorded_holes_check" CHECK (recorded_holes >= 0 AND recorded_holes <= 18);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_score_semantics_check" CHECK (jsonb_typeof(score_semantics) = 'object'::text);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_presentation_identity_check" CHECK (jsonb_typeof(presentation_identity) = 'object'::text);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_champion_team_side_check" CHECK (champion_team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_check" CHECK (score_availability = 'RECORDED'::text AND official_team_1_points IS NOT NULL AND official_team_2_points IS NOT NULL AND total_awarded_points IS NOT NULL OR score_availability = 'UNAVAILABLE'::text AND official_team_1_points IS NULL AND official_team_2_points IS NULL AND total_awarded_points IS NULL);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_lifecycle_check" CHECK (lifecycle = 'FINAL'::text);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_score_availability_check" CHECK (score_availability = ANY (ARRAY['RECORDED'::text, 'UNAVAILABLE'::text]));
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_team_size_check" CHECK (team_size > 0);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_tournament_year_check" CHECK (tournament_year >= 2017 AND tournament_year <= 2025);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_check" CHECK (team_1_id <> team_2_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_check1" CHECK (first_pick_team_id = team_1_id OR first_pick_team_id = team_2_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_check2" CHECK (team_1_captain_player_id IS NULL OR team_1_captain_player_id IS DISTINCT FROM team_2_captain_player_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_total_picks_check" CHECK (total_picks > 0);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_check" CHECK (pick_status = 'PENDING'::text AND player_id IS NULL OR pick_status = 'SELECTED'::text AND player_id IS NOT NULL AND team_id IS NOT NULL);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_pick_number_check" CHECK (pick_number > 0);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_pick_status_check" CHECK (pick_status = ANY (ARRAY['PENDING'::text, 'SELECTED'::text]));
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_pick_within_round_check" CHECK (pick_within_round > 0);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_presentation_snapshot_check" CHECK (jsonb_typeof(presentation_snapshot) = 'object'::text);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_round_number_check" CHECK (round_number > 0);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_check" CHECK (operation <> 'HISTORICAL_CORRECTION'::text AND correction_reason IS NULL OR operation = 'HISTORICAL_CORRECTION'::text AND length(btrim(correction_reason)) >= 10);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_configuration_check" CHECK (jsonb_typeof(configuration) = 'object'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_contract_version_check" CHECK (contract_version = 'draft-projection-v1'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_operation_check" CHECK (operation = ANY (ARRAY['INITIAL_IMPORT'::text, 'CURRENT_SYNC'::text, 'HISTORICAL_CORRECTION'::text]));
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_payload_fingerprint_check" CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_picks_fingerprint_check" CHECK (picks_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_presentation_seed_check" CHECK (jsonb_typeof(presentation_seed) = 'object'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_project_ref_check" CHECK (project_ref = 'ymqhhtxaywtqllynrmxe'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_revision_number_check" CHECK (revision_number > 0);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_source_picks_check" CHECK (jsonb_typeof(source_picks) = 'array'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_source_settings_check" CHECK (jsonb_typeof(source_settings) = 'object'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_source_tabs_check" CHECK (source_tabs = '["Draft Settings", "Draft Picks"]'::jsonb);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_source_workbook_id_check" CHECK (length(btrim(source_workbook_id)) > 10 AND source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_tournament_year_check" CHECK (tournament_year >= 2000 AND tournament_year <= 2200);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_validation_diagnostics_check" CHECK (jsonb_typeof(validation_diagnostics) = 'object'::text);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_validation_status_check" CHECK (validation_status = 'VALID'::text);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_match_revision_check" CHECK (match_revision >= 0);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_scoring_snapshot_revision_check" CHECK (scoring_snapshot_revision >= 0);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_snapshot_revision_check" CHECK (snapshot_revision > 0);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_state_check" CHECK (state = ANY (ARRAY['CURRENT'::text, 'SUPERSEDED'::text, 'INVALIDATED'::text]));
alter table "scoring_authority"."game_center_presentations" add constraint "game_center_presentations_match_sort_order_check" CHECK (match_sort_order > 0);
alter table "scoring_authority"."game_center_presentations" add constraint "game_center_presentations_source_payload_hash_check" CHECK (source_payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_event_type_check" CHECK (event_type = ANY (ARRAY['HOLE_SCORE_UPSERTED'::text, 'MATCH_FINALIZED'::text, 'MATCH_REOPENED'::text]));
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'DELIVERED'::text, 'RETRYABLE'::text, 'BLOCKED'::text]));
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check" CHECK (COALESCE(source_canonical_json::jsonb ->> 'tournamentId'::text, ''::text) = tournament_id);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check1" CHECK (COALESCE(content_canonical_json::jsonb #>> '{tournamentIdentity,id}'::text[], ''::text) = tournament_id);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check2" CHECK (content_canonical_json::jsonb = (content_payload -> 'content'::text));
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check3" CHECK (payload_canonical_json::jsonb = content_payload);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check4" CHECK (encode(extensions.digest(source_canonical_json, 'sha256'::text), 'hex'::text) = source_workbook_fingerprint);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check5" CHECK (encode(extensions.digest(content_canonical_json, 'sha256'::text), 'hex'::text) = content_fingerprint);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_check6" CHECK (encode(extensions.digest(payload_canonical_json, 'sha256'::text), 'hex'::text) = payload_hash);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_content_canonical_json_check" CHECK (COALESCE((content_canonical_json::jsonb #>> '{tournamentIdentity,year}'::text[])::integer, 0) = 2026);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_content_fingerprint_check" CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_content_payload_check" CHECK (jsonb_typeof(content_payload) = 'object'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_content_payload_check1" CHECK (COALESCE(content_payload ->> 'schemaVersion'::text, ''::text) = 'guide-projection-v1'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_content_payload_check2" CHECK (COALESCE(jsonb_typeof(content_payload -> 'content'::text), ''::text) = 'object'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_imported_by_check" CHECK (btrim(imported_by) <> ''::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_projection_revision_check" CHECK (projection_revision > 0);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_canonical_json_check" CHECK (jsonb_typeof(source_canonical_json::jsonb) = 'object'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_canonical_json_check1" CHECK (COALESCE(jsonb_typeof(source_canonical_json::jsonb -> 'source'::text), ''::text) = 'object'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_metadata_check" CHECK (jsonb_typeof(source_metadata) = 'object'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_sync_sequence_check" CHECK (source_sync_sequence > 0);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_workbook_fingerprint_check" CHECK (source_workbook_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_workbook_id_check" CHECK (btrim(source_workbook_id) <> ''::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_source_workbook_id_check1" CHECK (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_tournament_id_check" CHECK (tournament_id = '2026'::text);
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_trigger_type_check" CHECK (trigger_type = ANY (ARRAY['INITIAL'::text, 'SCHEDULED'::text, 'MANUAL'::text]));
alter table "scoring_authority"."guide_content_revisions" add constraint "guide_content_revisions_validation_status_check" CHECK (validation_status = 'VALID'::text);
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_publication_sequence_check" CHECK (publication_sequence > 0);
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_source_sync_sequence_check" CHECK (source_sync_sequence > 0);
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_source_workbook_id_check" CHECK (btrim(source_workbook_id) <> ''::text);
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_source_workbook_id_check1" CHECK (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_tournament_id_check" CHECK (tournament_id = '2026'::text);
alter table "scoring_authority"."guide_sync_controls" add constraint "guide_sync_controls_newest_claimed_sequence_check" CHECK (newest_claimed_sequence >= 0);
alter table "scoring_authority"."guide_sync_controls" add constraint "guide_sync_controls_newest_completed_sequence_check" CHECK (newest_completed_sequence >= 0);
alter table "scoring_authority"."guide_sync_controls" add constraint "guide_sync_controls_newest_published_sequence_check" CHECK (newest_published_sequence >= 0);
alter table "scoring_authority"."guide_sync_controls" add constraint "guide_sync_controls_next_attempt_sequence_check" CHECK (next_attempt_sequence > 0);
alter table "scoring_authority"."guide_sync_controls" add constraint "guide_sync_controls_tournament_id_check" CHECK (tournament_id = '2026'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_actor_id_check" CHECK (btrim(actor_id) <> ''::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_attempt_sequence_check" CHECK (attempt_sequence > 0);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_audit_metadata_check" CHECK (jsonb_typeof(audit_metadata) = 'object'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_duration_ms_check" CHECK (duration_ms IS NULL OR duration_ms >= 0::numeric);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_new_content_fingerprint_check" CHECK (new_content_fingerprint IS NULL OR new_content_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_previous_content_fingerprint_check" CHECK (previous_content_fingerprint IS NULL OR previous_content_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_project_ref_check" CHECK (project_ref = 'ymqhhtxaywtqllynrmxe'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_source_workbook_fingerprint_check" CHECK (source_workbook_fingerprint IS NULL OR source_workbook_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_source_workbook_id_check" CHECK (btrim(source_workbook_id) <> ''::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_source_workbook_id_check1" CHECK (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_status_check" CHECK (status = ANY (ARRAY['CLAIMED'::text, 'SUCCEEDED'::text, 'NOOP'::text, 'FAILED'::text, 'REJECTED'::text, 'STALE'::text]));
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_tournament_id_check" CHECK (tournament_id = '2026'::text);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_trigger_type_check" CHECK (trigger_type = ANY (ARRAY['INITIAL'::text, 'SCHEDULED'::text, 'MANUAL'::text]));
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_validation_status_check" CHECK (validation_status = ANY (ARRAY['NOT_RUN'::text, 'VALID'::text, 'INVALID'::text]));
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_check" CHECK (worker_secret <> vercel_protection_bypass);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_configuration_id_check" CHECK (configuration_id);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_configured_by_check" CHECK (btrim(configured_by) <> ''::text);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_endpoint_url_check" CHECK (endpoint_url = 'https://baggerinv.com/api/cron/guide-sync'::text);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_project_ref_check" CHECK (project_ref = 'ymqhhtxaywtqllynrmxe'::text);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_source_workbook_id_check" CHECK (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'::text);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_source_workbook_id_check1" CHECK (btrim(source_workbook_id) <> ''::text);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_tournament_id_check" CHECK (tournament_id = '2026'::text);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_vercel_protection_bypass_check" CHECK (length(vercel_protection_bypass) >= 32);
alter table "scoring_authority"."guide_sync_worker_configuration" add constraint "guide_sync_worker_configuration_worker_secret_check" CHECK (length(worker_secret) >= 32);
alter table "scoring_authority"."hole_scores" add constraint "hole_scores_hole_number_check" CHECK (hole_number >= 1 AND hole_number <= 18);
alter table "scoring_authority"."hole_scores" add constraint "hole_scores_hole_revision_check" CHECK (hole_revision > 0);
alter table "scoring_authority"."hole_scores" add constraint "hole_scores_hole_winner_check" CHECK (hole_winner = ANY (ARRAY['Team 1'::text, 'Team 2'::text, 'Halved'::text]));
alter table "scoring_authority"."hole_scores" add constraint "hole_scores_source_google_revision_check" CHECK (source_google_revision >= 0);
alter table "scoring_authority"."ingress_gates" add constraint "ingress_gates_authority_check" CHECK (authority = ANY (ARRAY['GOOGLE'::text, 'SUPABASE'::text]));
alter table "scoring_authority"."ingress_gates" add constraint "ingress_gates_state_check" CHECK (state = ANY (ARRAY['OPEN'::text, 'PAUSED'::text]));
alter table "scoring_authority"."ingress_gates" add constraint "ingress_gates_unresolved_client_queues_check" CHECK (unresolved_client_queues >= 0);
alter table "scoring_authority"."match_holes" add constraint "match_holes_hole_number_check" CHECK (hole_number >= 1 AND hole_number <= 18);
alter table "scoring_authority"."match_holes" add constraint "match_holes_par_check" CHECK (par >= 3 AND par <= 6);
alter table "scoring_authority"."match_holes" add constraint "match_holes_stroke_index_check" CHECK (stroke_index >= 1 AND stroke_index <= 18);
alter table "scoring_authority"."match_participants" add constraint "match_participants_player_slot_check" CHECK (player_slot = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."match_participants" add constraint "match_participants_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."matches" add constraint "matches_current_hole_check" CHECK (current_hole >= 0 AND current_hole <= 18);
alter table "scoring_authority"."matches" add constraint "matches_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."matches" add constraint "matches_holes_remaining_check" CHECK (holes_remaining >= 0 AND holes_remaining <= 18);
alter table "scoring_authority"."matches" add constraint "matches_match_revision_check" CHECK (match_revision >= 0);
alter table "scoring_authority"."matches" add constraint "matches_permission_revision_check" CHECK (permission_revision > 0);
alter table "scoring_authority"."matches" add constraint "matches_scored_holes_check" CHECK (scored_holes >= 0 AND scored_holes <= 18);
alter table "scoring_authority"."matches" add constraint "matches_source_google_revision_check" CHECK (source_google_revision >= 0);
alter table "scoring_authority"."matches" add constraint "matches_status_check" CHECK (status = ANY (ARRAY['UPCOMING'::text, 'LIVE'::text, 'FINAL'::text]));
alter table "scoring_authority"."matches" add constraint "matches_unresolved_mutations_check" CHECK (unresolved_mutations >= 0);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_buy_in_check" CHECK (buy_in >= 0::numeric);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_check" CHECK (format = 'SC'::text AND player_id_2 IS NOT NULL AND player_id_2 <> player_id_1 OR format <> 'SC'::text AND player_id_2 IS NULL);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_source_payload_check" CHECK (jsonb_typeof(source_payload) = 'object'::text);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_individual_allocation_shape" CHECK (format <> 'SC'::text OR individual_stroke_allocation IS NULL);
alter table "scoring_authority"."net_skins_configuration_import_runs" add constraint "net_skins_configuration_import__configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."net_skins_configuration_import_runs" add constraint "net_skins_configuration_import_runs_status_check" CHECK (status = ANY (ARRAY['APPLIED'::text, 'NO_CHANGE'::text, 'REJECTED'::text]));
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_buy_in_per_entry_check" CHECK (buy_in_per_entry >= 0::numeric);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_completion_rule_check" CHECK (completion_rule = 'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL'::text);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_configuration_fingerprint_check" CHECK (configuration_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_configuration_revision_check" CHECK (configuration_revision > 0);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_entry_type_check" CHECK (entry_type = ANY (ARRAY['INDIVIDUAL'::text, 'PAIRING'::text]));
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_expected_pot_check" CHECK (expected_pot >= 0::numeric);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_payout_rounding_check" CHECK (payout_rounding = 'NONE'::text);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_round_number_check" CHECK (round_number >= 1 AND round_number <= 99);
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_tie_rule_check" CHECK (tie_rule = 'NO_SKIN_NO_CARRY'::text);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_attempt_number_check" CHECK (attempt_number > 0);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_checkpoint_hash_check" CHECK (checkpoint_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_checkpoint_payload_check" CHECK (jsonb_typeof(checkpoint_payload) = 'object'::text);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_checkpoint_sequence_check" CHECK (checkpoint_sequence > 0);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_completed_iterations_check" CHECK (completed_iterations > 0);
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_resource_metrics_check" CHECK (jsonb_typeof(resource_metrics) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_attempt_count_check" CHECK (attempt_count >= 0);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_check" CHECK (completed_iterations >= 0 AND completed_iterations <= total_iterations);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_check1" CHECK (invocation_fingerprint ~ '^[0-9a-f]{64}$'::text AND invocation_fingerprint = job_id);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_checkpoint_count_check" CHECK (checkpoint_count >= 0);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_checkpoint_hash_check" CHECK (checkpoint_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_checkpoint_payload_check" CHECK (jsonb_typeof(checkpoint_payload) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_input_fingerprint_check" CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_input_snapshot_check" CHECK (jsonb_typeof(input_snapshot) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_job_id_check" CHECK (job_id ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_output_payload_bytes_check" CHECK (output_payload_bytes IS NULL OR output_payload_bytes >= 0);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_phase_check" CHECK (phase = ANY (ARRAY['Pre-Tournament'::text, 'After Round 1'::text, 'After Round 2'::text, 'Round 3 Pairings Announced'::text, 'Final Results'::text]));
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_publication_reference_check" CHECK (jsonb_typeof(publication_reference) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_publication_status_check" CHECK (publication_status = ANY (ARRAY['NOT_REQUESTED'::text, 'READY'::text, 'PUBLISHED'::text, 'STALE'::text]));
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_resource_metrics_check" CHECK (jsonb_typeof(resource_metrics) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_result_fingerprint_check" CHECK (result_fingerprint IS NULL OR result_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_result_payload_check" CHECK (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_settings_fingerprint_check" CHECK (settings_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_source_revision_check" CHECK (jsonb_typeof(source_revision) = 'object'::text);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'RETRYABLE'::text, 'SUPERSEDED'::text]));
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_total_iterations_check" CHECK (total_iterations = ANY (ARRAY[10000, 25000, 50000, 100000]));
alter table "scoring_authority"."odds_google_mirror_jobs" add constraint "odds_google_mirror_jobs_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'SUPERSEDED'::text]));
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_canonical_settings_object" CHECK (canonical_settings IS NULL OR jsonb_typeof(canonical_settings) = 'object'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_bundle_fingerprint_check" CHECK (bundle_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_configuration_revision_check" CHECK (configuration_revision > 0);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_historical_ratings_check" CHECK (jsonb_typeof(historical_ratings) = 'object'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_ratings_fingerprint_check" CHECK (ratings_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_settings_check" CHECK (jsonb_typeof(settings) = 'array'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_settings_fingerprint_check" CHECK (settings_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_effective_fingerprint_format" CHECK (effective_settings_fingerprint IS NULL OR effective_settings_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_effective_settings_object" CHECK (effective_settings IS NULL OR jsonb_typeof(effective_settings) = 'object'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_source_fingerprint_format" CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_validation_status" CHECK (validation_status IS NULL OR (validation_status = ANY (ARRAY['VALID'::text, 'INVALID'::text])));
alter table "scoring_authority"."odds_input_import_runs" add constraint "odds_input_import_runs_status_check" CHECK (status = ANY (ARRAY['APPLIED'::text, 'NO_CHANGE'::text, 'REJECTED'::text]));
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_engine_metadata_check" CHECK (jsonb_typeof(engine_metadata) = 'object'::text);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_google_publication_fingerprint_check" CHECK (google_publication_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_google_publication_reference_check" CHECK (jsonb_typeof(google_publication_reference) = 'object'::text);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_milestone_check" CHECK (milestone = ANY (ARRAY['Pre-Tournament'::text, 'After Round 1'::text, 'After Round 2'::text, 'Round 3 Pairings Announced'::text, 'Final Results'::text]));
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_phase_order_check" CHECK (phase_order >= 0 AND phase_order <= 4);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_publication_revision_check" CHECK (publication_revision > 0);
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_published_payload_check" CHECK (jsonb_typeof(published_payload) = 'object'::text);
alter table "scoring_authority"."odds_snapshot_import_runs" add constraint "odds_snapshot_import_runs_import_fingerprint_check" CHECK (import_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."odds_snapshot_import_runs" add constraint "odds_snapshot_import_runs_snapshot_count_check" CHECK (snapshot_count >= 0);
alter table "scoring_authority"."odds_snapshot_import_runs" add constraint "odds_snapshot_import_runs_status_check" CHECK (status = ANY (ARRAY['APPLIED'::text, 'NO_CHANGE'::text]));
alter table "scoring_authority"."participant_home_presentations" add constraint "participant_home_presentations_presentation_check" CHECK (jsonb_typeof(presentation) = 'object'::text);
alter table "scoring_authority"."participant_home_presentations" add constraint "participant_home_presentations_presentation_check1" CHECK (jsonb_typeof(COALESCE((presentation -> 'timeline'::text) -> 'events'::text, '[]'::jsonb)) = 'array'::text);
alter table "scoring_authority"."participant_home_presentations" add constraint "participant_home_presentations_presentation_check2" CHECK (jsonb_typeof(COALESCE(presentation -> 'netSkinsByPlayer'::text, '{}'::jsonb)) = 'object'::text);
alter table "scoring_authority"."participant_home_presentations" add constraint "participant_home_presentations_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."rounds" add constraint "rounds_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."rounds" add constraint "rounds_round_number_check" CHECK (round_number >= 1 AND round_number <= 99);
alter table "scoring_authority"."score_mutations" add constraint "score_mutations_mutation_type_check" CHECK (mutation_type = ANY (ARRAY['HOLE_SCORE'::text, 'FINALIZE'::text, 'REOPEN'::text]));
alter table "scoring_authority"."score_mutations" add constraint "score_mutations_payload_hash_check" CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_expected_logical_identities_check" CHECK (jsonb_typeof(expected_logical_identities) = 'array'::text);
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_google_row_numbers_check" CHECK (jsonb_typeof(google_row_numbers) = 'array'::text);
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'PENDING_INVALIDATION'::text, 'VERIFIED'::text, 'INVALIDATED'::text, 'FAILED'::text]));
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_archive_payload_hash_check" CHECK (archive_payload_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_attempts_check" CHECK (attempts >= 0);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_event_type_check" CHECK (event_type = ANY (ARRAY['SCORECARD_ARCHIVE_UPSERT'::text, 'SCORECARD_ARCHIVE_INVALIDATE'::text]));
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_match_revision_check" CHECK (match_revision >= 0);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_snapshot_revision_check" CHECK (snapshot_revision > 0);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_source_fingerprint_check" CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'RETRYABLE'::text, 'BLOCKED'::text, 'SUPERSEDED'::text]));
alter table "scoring_authority"."scorecard_archive_worker_configuration" add constraint "scorecard_archive_worker_bypass_valid" CHECK (vercel_protection_bypass IS NULL OR length(vercel_protection_bypass) >= 32);
alter table "scoring_authority"."scorecard_archive_worker_configuration" add constraint "scorecard_archive_worker_configuration_configuration_id_check" CHECK (configuration_id);
alter table "scoring_authority"."scorecard_archive_worker_configuration" add constraint "scorecard_archive_worker_configuration_endpoint_url_check" CHECK (endpoint_url = 'https://baggerinv.com/api/cron/round-scorecards-archive'::text);
alter table "scoring_authority"."scorecard_archive_worker_configuration" add constraint "scorecard_archive_worker_configuration_project_ref_check" CHECK (project_ref = 'ymqhhtxaywtqllynrmxe'::text);
alter table "scoring_authority"."scorecard_archive_worker_configuration" add constraint "scorecard_archive_worker_configuration_worker_secret_check" CHECK (length(worker_secret) >= 32);
alter table "scoring_authority"."scoring_ingress_leases" add constraint "scoring_ingress_leases_authority_check" CHECK (authority = ANY (ARRAY['GOOGLE'::text, 'SUPABASE'::text]));
alter table "scoring_authority"."scoring_permissions" add constraint "scoring_permissions_permission_revision_check" CHECK (permission_revision > 0);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_canonical_hash_check" CHECK (canonical_hash ~ '^[0-9a-f]{64}$'::text);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_format_check" CHECK (format = ANY (ARRAY['BB'::text, 'SC'::text, 'SI'::text]));
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_hole_definitions_check" CHECK (jsonb_typeof(hole_definitions) = 'array'::text AND jsonb_array_length(hole_definitions) = 18);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_participant_configuration_check" CHECK (jsonb_typeof(participant_configuration) = 'object'::text);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_snapshot_revision_check" CHECK (snapshot_revision >= 0);
alter table "scoring_authority"."teams" add constraint "teams_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."tournament_players" add constraint "tournament_players_participation_status_check" CHECK (participation_status = ANY (ARRAY['ACTIVE'::text, 'WITHDRAWN'::text, 'INACTIVE'::text]));
alter table "scoring_authority"."tournament_players" add constraint "tournament_players_team_side_check" CHECK (team_side = ANY (ARRAY[1, 2]));
alter table "scoring_authority"."tournaments" add constraint "tournaments_scoring_authority_check" CHECK (scoring_authority = ANY (ARRAY['GOOGLE'::text, 'SUPABASE'::text]));
alter table "participant_identity"."identity_audit_events" add constraint "identity_audit_events_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table "participant_identity"."identity_audit_events" add constraint "identity_audit_events_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id) ON DELETE SET NULL;
alter table "participant_identity"."identity_audit_events" add constraint "identity_audit_events_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE SET NULL;
alter table "participant_identity"."identity_config_import_runs" add constraint "identity_config_import_runs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "participant_identity"."identity_context_revisions" add constraint "identity_context_revisions_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_auth_identifiers" add constraint "participant_auth_identifiers_source_tournament_id_fkey" FOREIGN KEY (source_tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_auth_otp_attempts" add constraint "participant_auth_otp_attempts_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "participant_identity"."participant_identity_contacts" add constraint "participant_identity_contacts_tournament_id_player_id_fkey" FOREIGN KEY (tournament_id, player_id) REFERENCES scoring_authority.tournament_players(tournament_id, player_id);
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_identifier_id_fkey" FOREIGN KEY (identifier_id) REFERENCES participant_identity.participant_auth_identifiers(identifier_id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_requested_by_auth_user_id_fkey" FOREIGN KEY (requested_by_auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "participant_identity"."participant_phone_otp_attempts" add constraint "participant_phone_otp_attempts_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE RESTRICT;
alter table "participant_identity"."tournament_roles" add constraint "tournament_roles_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "participant_identity"."tournament_roles" add constraint "tournament_roles_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "participant_identity"."user_player_links" add constraint "user_player_links_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table "participant_identity"."user_player_links" add constraint "user_player_links_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id) ON DELETE RESTRICT;
alter table "scoring_authority"."audit_events" add constraint "audit_events_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."authority_epochs" add constraint "authority_epochs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."calcutta_configuration_import_runs" add constraint "calcutta_configuration_import_runs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."calcutta_configurations" add constraint "calcutta_configurations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."competition_derived_runs" add constraint "competition_derived_runs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."competition_derived_snapshots" add constraint "competition_derived_snapshots_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."competition_recalculation_jobs" add constraint "competition_recalculation_jobs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_tournament_id_winner_team_id_fkey" FOREIGN KEY (tournament_id, winner_team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."completed_history_awards" add constraint "completed_history_awards_winner_player_id_fkey" FOREIGN KEY (winner_player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."completed_history_correction_applications" add constraint "completed_history_correction_applications_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearan_revision_id_round_number_fkey" FOREIGN KEY (revision_id, round_number) REFERENCES scoring_authority.completed_history_round_facts(revision_id, round_number);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_course_id_fkey" FOREIGN KEY (course_id) REFERENCES scoring_authority.completed_history_course_identities(course_id);
alter table "scoring_authority"."completed_history_course_appearances" add constraint "completed_history_course_appearances_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_current_revisions" add constraint "completed_history_current_revisions_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_import_runs" add constraint "completed_history_import_runs_revision_id_tournament_id_fkey" FOREIGN KEY (revision_id, tournament_id) REFERENCES scoring_authority.completed_history_revisions(revision_id, tournament_id);
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_participants_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."completed_history_match_participants" add constraint "completed_history_match_participants_revision_id_match_id_fkey" FOREIGN KEY (revision_id, match_id) REFERENCES scoring_authority.completed_history_matches(revision_id, match_id);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_revision_id_course_appearance_id_fkey" FOREIGN KEY (revision_id, course_appearance_id) REFERENCES scoring_authority.completed_history_course_appearances(revision_id, appearance_id);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_matches" add constraint "completed_history_matches_revision_id_round_number_fkey" FOREIGN KEY (revision_id, round_number) REFERENCES scoring_authority.completed_history_round_facts(revision_id, round_number);
alter table "scoring_authority"."completed_history_record_eligibility" add constraint "completed_history_record_elig_revision_id_match_id_player__fkey" FOREIGN KEY (revision_id, match_id, player_id) REFERENCES scoring_authority.completed_history_match_participants(revision_id, match_id, player_id);
alter table "scoring_authority"."completed_history_record_eligibility" add constraint "completed_history_record_eligibility_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_previous_revision_id_fkey" FOREIGN KEY (previous_revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_revisions" add constraint "completed_history_revisions_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_tournament_id_player_id_fkey" FOREIGN KEY (tournament_id, player_id) REFERENCES scoring_authority.tournament_players(tournament_id, player_id);
alter table "scoring_authority"."completed_history_roster_facts" add constraint "completed_history_roster_facts_tournament_id_team_id_fkey" FOREIGN KEY (tournament_id, team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_round_facts" add constraint "completed_history_round_facts_tournament_id_round_number_fkey" FOREIGN KEY (tournament_id, round_number) REFERENCES scoring_authority.rounds(tournament_id, round_number);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."completed_history_scorecards" add constraint "completed_history_scorecards_revision_id_match_id_fkey" FOREIGN KEY (revision_id, match_id) REFERENCES scoring_authority.completed_history_matches(revision_id, match_id);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_captain_player_id_fkey" FOREIGN KEY (captain_player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."completed_history_team_facts" add constraint "completed_history_team_facts_tournament_id_team_id_fkey" FOREIGN KEY (tournament_id, team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament__tournament_id_champion_team__fkey" FOREIGN KEY (tournament_id, champion_team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_fac_revision_id_tournament_id_fkey" FOREIGN KEY (revision_id, tournament_id) REFERENCES scoring_authority.completed_history_revisions(revision_id, tournament_id);
alter table "scoring_authority"."completed_history_tournament_facts" add constraint "completed_history_tournament_facts_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.completed_history_revisions(revision_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.draft_revisions(revision_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_revision_id_tournament_id_fkey" FOREIGN KEY (revision_id, tournament_id) REFERENCES scoring_authority.draft_revisions(revision_id, tournament_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_team_1_captain_player_id_fkey" FOREIGN KEY (team_1_captain_player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_team_2_captain_player_id_fkey" FOREIGN KEY (team_2_captain_player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_tournament_id_first_pick_team_id_fkey" FOREIGN KEY (tournament_id, first_pick_team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_tournament_id_team_1_id_fkey" FOREIGN KEY (tournament_id, team_1_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."draft_configuration_facts" add constraint "draft_configuration_facts_tournament_id_team_2_id_fkey" FOREIGN KEY (tournament_id, team_2_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."draft_current_revisions" add constraint "draft_current_revisions_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.draft_revisions(revision_id);
alter table "scoring_authority"."draft_current_revisions" add constraint "draft_current_revisions_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES scoring_authority.draft_revisions(revision_id);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_revision_id_tournament_id_fkey" FOREIGN KEY (revision_id, tournament_id) REFERENCES scoring_authority.draft_revisions(revision_id, tournament_id);
alter table "scoring_authority"."draft_pick_facts" add constraint "draft_pick_facts_tournament_id_team_id_fkey" FOREIGN KEY (tournament_id, team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_previous_revision_id_fkey" FOREIGN KEY (previous_revision_id) REFERENCES scoring_authority.draft_revisions(revision_id);
alter table "scoring_authority"."draft_revisions" add constraint "draft_revisions_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_scoring_snapshot_id_fkey" FOREIGN KEY (scoring_snapshot_id) REFERENCES scoring_authority.scoring_snapshots(snapshot_id);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_superseded_by_snapshot_id_fkey" FOREIGN KEY (superseded_by_snapshot_id) REFERENCES scoring_authority.finalized_scorecard_snapshots(snapshot_id);
alter table "scoring_authority"."finalized_scorecard_snapshots" add constraint "finalized_scorecard_snapshots_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."game_center_presentations" add constraint "game_center_presentations_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."game_center_presentations" add constraint "game_center_presentations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."google_match_checkpoints" add constraint "google_match_checkpoints_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."google_outbox_events" add constraint "google_outbox_events_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."guide_projection_current" add constraint "guide_projection_current_tournament_id_source_workbook_id__fkey" FOREIGN KEY (tournament_id, source_workbook_id, revision_id) REFERENCES scoring_authority.guide_content_revisions(tournament_id, source_workbook_id, revision_id);
alter table "scoring_authority"."guide_sync_runs" add constraint "guide_sync_runs_tournament_id_published_revision_id_fkey" FOREIGN KEY (tournament_id, published_revision_id) REFERENCES scoring_authority.guide_content_revisions(tournament_id, revision_id);
alter table "scoring_authority"."hole_scores" add constraint "hole_scores_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."ingress_gates" add constraint "ingress_gates_active_epoch_id_fkey" FOREIGN KEY (active_epoch_id) REFERENCES scoring_authority.authority_epochs(epoch_id);
alter table "scoring_authority"."ingress_gates" add constraint "ingress_gates_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."match_holes" add constraint "match_holes_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."match_holes" add constraint "match_holes_snapshot_id_fkey" FOREIGN KEY (snapshot_id) REFERENCES scoring_authority.scoring_snapshots(snapshot_id);
alter table "scoring_authority"."match_participants" add constraint "match_participants_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."match_participants" add constraint "match_participants_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."matches" add constraint "matches_scoring_snapshot_id_fkey" FOREIGN KEY (scoring_snapshot_id) REFERENCES scoring_authority.scoring_snapshots(snapshot_id);
alter table "scoring_authority"."matches" add constraint "matches_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."matches" add constraint "matches_tournament_id_round_number_fkey" FOREIGN KEY (tournament_id, round_number) REFERENCES scoring_authority.rounds(tournament_id, round_number);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_player_id_1_fkey" FOREIGN KEY (player_id_1) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_player_id_2_fkey" FOREIGN KEY (player_id_2) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."net_skins_configuration_entries" add constraint "net_skins_configuration_entries_tournament_id_round_number_fkey" FOREIGN KEY (tournament_id, round_number) REFERENCES scoring_authority.net_skins_configurations(tournament_id, round_number) ON DELETE CASCADE;
alter table "scoring_authority"."net_skins_configuration_import_runs" add constraint "net_skins_configuration_import_runs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."net_skins_configurations" add constraint "net_skins_configurations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_calculation_checkpoints" add constraint "odds_calculation_checkpoints_job_id_fkey" FOREIGN KEY (job_id) REFERENCES scoring_authority.odds_calculation_jobs(job_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_superseded_by_fkey" FOREIGN KEY (superseded_by) REFERENCES scoring_authority.odds_calculation_jobs(job_id);
alter table "scoring_authority"."odds_calculation_jobs" add constraint "odds_calculation_jobs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_google_mirror_jobs" add constraint "odds_google_mirror_jobs_snapshot_id_fkey" FOREIGN KEY (snapshot_id) REFERENCES scoring_authority.odds_published_snapshots(id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_google_mirror_jobs" add constraint "odds_google_mirror_jobs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_previous_configuration_id_fkey" FOREIGN KEY (previous_configuration_id) REFERENCES scoring_authority.odds_input_configurations(id);
alter table "scoring_authority"."odds_input_configurations" add constraint "odds_input_configurations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_input_import_runs" add constraint "odds_input_import_runs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_published_snapshots" add constraint "odds_published_snapshots_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."odds_snapshot_import_runs" add constraint "odds_snapshot_import_runs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."participant_home_presentations" add constraint "participant_home_presentations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."rounds" add constraint "rounds_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."score_mutations" add constraint "score_mutations_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."score_revision_history" add constraint "score_revision_history_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_current_snapshot_id_fkey" FOREIGN KEY (current_snapshot_id) REFERENCES scoring_authority.finalized_scorecard_snapshots(snapshot_id);
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_last_job_id_fkey" FOREIGN KEY (last_job_id) REFERENCES scoring_authority.scorecard_archive_jobs(job_id);
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."scorecard_archive_checkpoints" add constraint "scorecard_archive_checkpoints_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_snapshot_id_fkey" FOREIGN KEY (snapshot_id) REFERENCES scoring_authority.finalized_scorecard_snapshots(snapshot_id);
alter table "scoring_authority"."scorecard_archive_jobs" add constraint "scorecard_archive_jobs_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."scoring_ingress_leases" add constraint "scoring_ingress_leases_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."scoring_permissions" add constraint "scoring_permissions_match_id_fkey" FOREIGN KEY (match_id) REFERENCES scoring_authority.matches(match_id) ON DELETE CASCADE;
alter table "scoring_authority"."scoring_permissions" add constraint "scoring_permissions_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."scoring_snapshots" add constraint "scoring_snapshots_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."teams" add constraint "teams_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."tournament_players" add constraint "tournament_players_player_id_fkey" FOREIGN KEY (player_id) REFERENCES scoring_authority.players(player_id);
alter table "scoring_authority"."tournament_players" add constraint "tournament_players_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES scoring_authority.tournaments(tournament_id) ON DELETE CASCADE;
alter table "scoring_authority"."tournament_players" add constraint "tournament_players_tournament_id_team_id_fkey" FOREIGN KEY (tournament_id, team_id) REFERENCES scoring_authority.teams(tournament_id, team_id);

CREATE INDEX participant_identity_audit_player_idx ON participant_identity.identity_audit_events USING btree (player_id, occurred_at DESC);
CREATE INDEX participant_identity_audit_tournament_idx ON participant_identity.identity_audit_events USING btree (tournament_id, occurred_at DESC);
CREATE UNIQUE INDEX participant_identity_approved_fingerprint_idx ON participant_identity.identity_config_import_runs USING btree (tournament_id, source_fingerprint) WHERE approved_at IS NOT NULL;
CREATE INDEX participant_identity_import_runs_tournament_idx ON participant_identity.identity_config_import_runs USING btree (tournament_id, requested_at DESC);
CREATE UNIQUE INDEX participant_auth_identifier_active_phone_unique_idx ON participant_identity.participant_auth_identifiers USING btree (normalized_value_private) WHERE identifier_type = 'PHONE'::text AND (status = ANY (ARRAY['ELIGIBLE'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text]));
CREATE UNIQUE INDEX participant_auth_identifier_current_email_unique_idx ON participant_identity.participant_auth_identifiers USING btree (normalized_value_private) WHERE identifier_type = 'EMAIL'::text AND (status = ANY (ARRAY['ELIGIBLE'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text]));
CREATE UNIQUE INDEX participant_auth_identifier_current_player_method_idx ON participant_identity.participant_auth_identifiers USING btree (player_id, identifier_type) WHERE status = ANY (ARRAY['ELIGIBLE'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text]);
CREATE UNIQUE INDEX participant_auth_identifier_current_user_method_idx ON participant_identity.participant_auth_identifiers USING btree (auth_user_id, identifier_type) WHERE status = ANY (ARRAY['ELIGIBLE'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text]);
CREATE INDEX participant_auth_identifier_lookup_idx ON participant_identity.participant_auth_identifiers USING btree (identifier_type, normalized_value_private, status);
CREATE INDEX participant_auth_identifier_player_history_idx ON participant_identity.participant_auth_identifiers USING btree (player_id, identifier_type, updated_at DESC);
CREATE INDEX participant_auth_otp_client_requested_idx ON participant_identity.participant_auth_otp_attempts USING btree (client_request_hash, requested_at DESC);
CREATE INDEX participant_auth_otp_player_requested_idx ON participant_identity.participant_auth_otp_attempts USING btree (player_id, requested_at DESC);
CREATE INDEX participant_auth_otp_status_idx ON participant_identity.participant_auth_otp_attempts USING btree (status, requested_at DESC);
CREATE INDEX participant_auth_public_rate_client_idx ON participant_identity.participant_auth_public_rate_events USING btree (client_fingerprint, occurred_at DESC);
CREATE INDEX participant_auth_public_rate_identifier_idx ON participant_identity.participant_auth_public_rate_events USING btree (identifier_fingerprint, occurred_at DESC);
CREATE UNIQUE INDEX participant_identity_active_email_idx ON participant_identity.participant_identity_contacts USING btree (tournament_id, email_normalized) WHERE identity_active;
CREATE INDEX participant_identity_contacts_player_idx ON participant_identity.participant_identity_contacts USING btree (player_id, identity_active);
CREATE INDEX participant_phone_otp_client_requested_idx ON participant_identity.participant_phone_otp_attempts USING btree (client_fingerprint, requested_at DESC);
CREATE INDEX participant_phone_otp_identifier_requested_idx ON participant_identity.participant_phone_otp_attempts USING btree (identifier_id, requested_at DESC);
CREATE UNIQUE INDEX participant_phone_otp_one_open_attempt_idx ON participant_identity.participant_phone_otp_attempts USING btree (identifier_id) WHERE status = ANY (ARRAY['REQUESTING'::text, 'SENT'::text]);
CREATE INDEX participant_phone_otp_player_requested_idx ON participant_identity.participant_phone_otp_attempts USING btree (player_id, requested_at DESC);
CREATE INDEX participant_identity_tournament_roles_active_idx ON participant_identity.tournament_roles USING btree (tournament_id, role, role_active);
CREATE UNIQUE INDEX participant_identity_current_player_link_idx ON participant_identity.user_player_links USING btree (player_id) WHERE status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text]);
CREATE INDEX participant_identity_links_status_idx ON participant_identity.user_player_links USING btree (status, player_id);
CREATE INDEX calcutta_configuration_import_runs_scope_idx ON scoring_authority.calcutta_configuration_import_runs USING btree (tournament_id, imported_at DESC);
CREATE UNIQUE INDEX calcutta_configurations_current_idx ON scoring_authority.calcutta_configurations USING btree (tournament_id) WHERE is_current;
CREATE INDEX calcutta_configurations_fingerprint_idx ON scoring_authority.calcutta_configurations USING btree (tournament_id, configuration_fingerprint);
CREATE INDEX calcutta_configurations_history_idx ON scoring_authority.calcutta_configurations USING btree (tournament_id, configuration_revision DESC);
CREATE INDEX competition_derived_runs_scope_idx ON scoring_authority.competition_derived_runs USING btree (tournament_id, engine_key, round_number, completed_at DESC);
CREATE UNIQUE INDEX competition_derived_current_idx ON scoring_authority.competition_derived_snapshots USING btree (tournament_id, round_number, engine_key) WHERE is_current;
CREATE INDEX competition_derived_history_idx ON scoring_authority.competition_derived_snapshots USING btree (tournament_id, engine_key, round_number, calculated_at DESC);
CREATE INDEX completed_history_awards_player_idx ON scoring_authority.completed_history_awards USING btree (winner_player_id, revision_id) WHERE winner_player_id IS NOT NULL;
CREATE INDEX completed_history_awards_type_idx ON scoring_authority.completed_history_awards USING btree (award_type, revision_id);
CREATE INDEX completed_history_corrections_category_idx ON scoring_authority.completed_history_correction_applications USING btree (category, revision_id);
CREATE INDEX completed_history_course_appearance_course_idx ON scoring_authority.completed_history_course_appearances USING btree (course_id, revision_id, round_number);
CREATE INDEX completed_history_course_appearance_source_idx ON scoring_authority.completed_history_course_appearances USING btree (source_course_id, revision_id);
CREATE INDEX completed_history_import_runs_year_idx ON scoring_authority.completed_history_import_runs USING btree (tournament_year, imported_at DESC);
CREATE INDEX completed_history_match_participants_player_idx ON scoring_authority.completed_history_match_participants USING btree (player_id, revision_id, match_id);
CREATE INDEX completed_history_matches_course_idx ON scoring_authority.completed_history_matches USING btree (course_appearance_id, revision_id);
CREATE INDEX completed_history_matches_round_idx ON scoring_authority.completed_history_matches USING btree (revision_id, round_number, match_id);
CREATE INDEX completed_history_matches_tournament_result_idx ON scoring_authority.completed_history_matches USING btree (tournament_id, lifecycle, result_winner);
CREATE INDEX completed_history_record_eligibility_excluded_idx ON scoring_authority.completed_history_record_eligibility USING btree (revision_id, match_id, player_id) WHERE is_record_eligible IS FALSE;
CREATE INDEX completed_history_record_eligibility_player_idx ON scoring_authority.completed_history_record_eligibility USING btree (player_id, is_record_eligible, revision_id);
CREATE INDEX completed_history_revisions_year_certified_idx ON scoring_authority.completed_history_revisions USING btree (tournament_year, certified_at DESC);
CREATE INDEX completed_history_roster_player_idx ON scoring_authority.completed_history_roster_facts USING btree (player_id, revision_id);
CREATE INDEX completed_history_roster_team_idx ON scoring_authority.completed_history_roster_facts USING btree (revision_id, team_side, player_id);
CREATE INDEX completed_history_scorecards_coverage_idx ON scoring_authority.completed_history_scorecards USING btree (coverage_status, revision_id);
CREATE INDEX completed_history_scorecards_match_idx ON scoring_authority.completed_history_scorecards USING btree (revision_id, match_id, coverage_status);
CREATE INDEX completed_history_scorecards_player_idx ON scoring_authority.completed_history_scorecards USING btree (player_id, revision_id) WHERE player_id IS NOT NULL;
CREATE INDEX completed_history_team_facts_captain_idx ON scoring_authority.completed_history_team_facts USING btree (captain_player_id, revision_id);
CREATE INDEX draft_pick_player_idx ON scoring_authority.draft_pick_facts USING btree (player_id, tournament_year DESC);
CREATE INDEX draft_revisions_year_idx ON scoring_authority.draft_revisions USING btree (tournament_year, revision_number DESC);
CREATE UNIQUE INDEX scoring_authority_finalized_scorecard_current_idx ON scoring_authority.finalized_scorecard_snapshots USING btree (match_id) WHERE state = 'CURRENT'::text;
CREATE INDEX scoring_authority_game_center_navigation_idx ON scoring_authority.game_center_presentations USING btree (tournament_id, match_sort_order, match_id);
CREATE INDEX scoring_authority_outbox_pending_idx ON scoring_authority.google_outbox_events USING btree (status, available_at, match_id, match_revision) WHERE status = ANY (ARRAY['PENDING'::text, 'RETRYABLE'::text, 'PROCESSING'::text]);
CREATE INDEX scoring_authority_guide_sync_runs_recent_idx ON scoring_authority.guide_sync_runs USING btree (tournament_id, attempt_sequence DESC);
CREATE INDEX scoring_authority_guide_sync_runs_status_idx ON scoring_authority.guide_sync_runs USING btree (status, started_at DESC);
CREATE UNIQUE INDEX scoring_authority_hole_score_revision_idx ON scoring_authority.hole_scores USING btree (match_id, hole_number, hole_revision);
CREATE INDEX scoring_authority_match_participants_player_idx ON scoring_authority.match_participants USING btree (player_id, match_id);
CREATE INDEX scoring_authority_matches_round_status_idx ON scoring_authority.matches USING btree (tournament_id, round_number, status);
CREATE UNIQUE INDEX net_skins_active_individual_entry_idx ON scoring_authority.net_skins_configuration_entries USING btree (tournament_id, round_number, player_id_1) WHERE eligible AND format <> 'SC'::text;
CREATE UNIQUE INDEX net_skins_active_pairing_entry_idx ON scoring_authority.net_skins_configuration_entries USING btree (tournament_id, round_number, LEAST(player_id_1, player_id_2), GREATEST(player_id_1, player_id_2)) WHERE eligible AND format = 'SC'::text;
CREATE INDEX net_skins_configuration_import_runs_scope_idx ON scoring_authority.net_skins_configuration_import_runs USING btree (tournament_id, imported_at DESC);
CREATE INDEX odds_calculation_jobs_claim_idx ON scoring_authority.odds_calculation_jobs USING btree (status, lease_expires_at, requested_at);
CREATE INDEX odds_calculation_jobs_scope_idx ON scoring_authority.odds_calculation_jobs USING btree (tournament_id, phase, requested_at DESC);
CREATE UNIQUE INDEX odds_input_current_idx ON scoring_authority.odds_input_configurations USING btree (tournament_id) WHERE is_current;
CREATE INDEX odds_input_prediction_settings_revision_idx ON scoring_authority.odds_input_configurations USING btree (tournament_id, configuration_revision DESC) WHERE settings_contract_version IS NOT NULL;
CREATE UNIQUE INDEX odds_native_publication_idempotency_idx ON scoring_authority.odds_published_snapshots USING btree (tournament_id, milestone, logical_payload_hash, source_fingerprint, settings_fingerprint, ratings_fingerprint, pairing_fingerprint, engine_version, deterministic_seed) WHERE logical_payload_hash IS NOT NULL;
CREATE UNIQUE INDEX odds_published_current_milestone_idx ON scoring_authority.odds_published_snapshots USING btree (tournament_id, milestone) WHERE is_current_for_milestone;
CREATE UNIQUE INDEX odds_published_current_official_idx ON scoring_authority.odds_published_snapshots USING btree (tournament_id) WHERE is_current_official;
CREATE INDEX odds_published_history_idx ON scoring_authority.odds_published_snapshots USING btree (tournament_id, phase_order, publication_revision DESC, published_at DESC);
CREATE INDEX odds_snapshot_import_runs_scope_idx ON scoring_authority.odds_snapshot_import_runs USING btree (tournament_id, imported_at DESC);
CREATE INDEX scoring_authority_mutations_history_idx ON scoring_authority.score_mutations USING btree (match_id, next_match_revision, created_at);
CREATE INDEX scoring_authority_scorecard_archive_jobs_pending_idx ON scoring_authority.scorecard_archive_jobs USING btree (status, available_at, match_id, match_revision DESC) WHERE status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'RETRYABLE'::text]);
CREATE INDEX scoring_ingress_leases_tournament_expiry_idx ON scoring_authority.scoring_ingress_leases USING btree (tournament_id, expires_at);
CREATE INDEX scoring_authority_tournament_players_team_idx ON scoring_authority.tournament_players USING btree (tournament_id, team_side, participation_status);

CREATE OR REPLACE FUNCTION scoring_authority.build_guide_course_context(target_tournament text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  course_context_value jsonb;
begin
  if btrim(coalesce(target_tournament, '')) <> '2026' then return '[]'::jsonb; end if;
  with raw_context as (
    select m.match_id, m.round_number, m.format, m.match_revision,
      ss.snapshot_id, ss.snapshot_revision, ss.course_id, ss.tee,
      ss.rating, ss.slope, ss.par, ss.canonical_hash,
      ss.tournament_id as snapshot_tournament_id,
      ss.match_id as snapshot_match_id,
      ss.format as snapshot_format,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'hole_number', mh.hole_number,
          'par', mh.par,
          'stroke_index', mh.stroke_index,
          'yardage', mh.yardage
        ) order by mh.hole_number)
        from scoring_authority.match_holes mh
        where mh.match_id = m.match_id and mh.snapshot_id = ss.snapshot_id
      ), '[]'::jsonb) as holes
    from scoring_authority.matches m
    join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
    where m.tournament_id = target_tournament
  ), validated_context as (
    select raw_context.*,
      raw_context.snapshot_tournament_id = target_tournament
      and raw_context.snapshot_match_id = raw_context.match_id
      and raw_context.snapshot_format = raw_context.format
      and exists (
        select 1 from scoring_authority.rounds canonical_round
        where canonical_round.tournament_id = target_tournament
          and canonical_round.round_number = raw_context.round_number
          and canonical_round.format = raw_context.format
      )
      and btrim(raw_context.course_id) <> ''
      and btrim(raw_context.tee) <> ''
      and raw_context.rating is not null
      and raw_context.slope is not null and raw_context.slope > 0
      and jsonb_array_length(raw_context.holes) = 18
      and not exists (
        select 1 from generate_series(1, 18) expected(hole_number)
        where not exists (
          select 1 from jsonb_array_elements(raw_context.holes) hole
          where (hole->>'hole_number')::integer = expected.hole_number
        )
      )
      and not exists (
        select 1 from generate_series(1, 18) expected(stroke_index)
        where not exists (
          select 1 from jsonb_array_elements(raw_context.holes) hole
          where (hole->>'stroke_index')::integer = expected.stroke_index
        )
      )
      and raw_context.par = coalesce((
        select sum((hole->>'par')::integer)
        from jsonb_array_elements(raw_context.holes) hole
      ), 0) as context_valid
    from raw_context
  ), ranked_context as (
    select validated_context.*,
      row_number() over (
        partition by upper(btrim(validated_context.course_id)), upper(btrim(validated_context.tee))
        order by validated_context.snapshot_revision desc,
          validated_context.match_id
      ) as context_rank
    from validated_context
  ), selected_context as (
    select * from ranked_context where context_rank = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id', selected.course_id,
    'tee', selected.tee,
    'rating', selected.rating,
    'slope', selected.slope,
    'par', selected.par,
    'scoring_snapshot_id', selected.snapshot_id,
    'scoring_snapshot_fingerprint', selected.canonical_hash,
    'configuration_fingerprint', encode(extensions.digest(jsonb_build_object(
      'course_id', selected.course_id,
      'tee', selected.tee,
      'rating', selected.rating,
      'slope', selected.slope,
      'par', selected.par,
      'holes', selected.holes
    )::text, 'sha256'), 'hex'),
    'configuration_consistent', selected.context_valid and not exists (
      select 1 from ranked_context compared
      where upper(btrim(compared.course_id)) = upper(btrim(selected.course_id))
        and upper(btrim(compared.tee)) = upper(btrim(selected.tee))
        and (
          not compared.context_valid
          or compared.rating is distinct from selected.rating
          or compared.slope is distinct from selected.slope
          or compared.par is distinct from selected.par
          or compared.holes is distinct from selected.holes
        )
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_number', assignment.round_number,
        'format', assignment.format,
        'name', assignment.name,
        'status', assignment.status
      ) order by assignment.round_number, assignment.format)
      from (
        select distinct compared.round_number, compared.format, r.name, r.status
        from ranked_context compared
        join scoring_authority.rounds r
          on r.tournament_id = target_tournament and r.round_number = compared.round_number
          and r.format = compared.format
        where upper(btrim(compared.course_id)) = upper(btrim(selected.course_id))
          and upper(btrim(compared.tee)) = upper(btrim(selected.tee))
      ) assignment
    ), '[]'::jsonb),
    'holes', selected.holes
  ) order by selected.course_id, selected.tee), '[]'::jsonb)
  into course_context_value
  from selected_context selected;
  return course_context_value;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.capture_finalized_scorecard_snapshot(target_match text, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  match_row scoring_authority.matches%rowtype;
  tournament_row scoring_authority.tournaments%rowtype;
  round_row scoring_authority.rounds%rowtype;
  scoring_row scoring_authority.scoring_snapshots%rowtype;
  presentation_row scoring_authority.game_center_presentations%rowtype;
  prior_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  existing_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  new_snapshot_id uuid := gen_random_uuid();
  next_snapshot_revision bigint;
  expected_participants integer;
  expected_scores_per_side integer;
  participant_count integer;
  hole_count integer;
  teams_value jsonb;
  participants_value jsonb;
  holes_value jsonb;
  hole_revisions jsonb;
  progress_value jsonb;
  source_value jsonb;
  payload_value jsonb;
  source_hash text;
  payload_hash_value text;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match, '')) for update;
  if not found then raise exception using errcode = 'P0001', message = 'ARCHIVE_MATCH_NOT_FOUND'; end if;
  if match_row.status <> 'FINAL' or not match_row.scorecard_complete or match_row.scored_holes <> 18
     or match_row.unresolved_mutations <> 0 or match_row.finalized_at is null or btrim(match_row.result_winner) = '' then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_FINALIZATION_INELIGIBLE';
  end if;
  if match_row.format not in ('BB', 'SC', 'SI') then raise exception using errcode = 'P0001', message = 'ARCHIVE_FORMAT_INVALID'; end if;

  select * into tournament_row from scoring_authority.tournaments where tournament_id = match_row.tournament_id;
  select * into round_row from scoring_authority.rounds where tournament_id = match_row.tournament_id and round_number = match_row.round_number;
  select * into scoring_row from scoring_authority.scoring_snapshots where snapshot_id = match_row.scoring_snapshot_id;
  select * into presentation_row from scoring_authority.game_center_presentations where match_id = match_row.match_id;
  if tournament_row.tournament_id is null or round_row.tournament_id is null or scoring_row.snapshot_id is null
     or presentation_row.match_id is null or btrim(presentation_row.display_match_number) = ''
     or scoring_row.match_id <> match_row.match_id or scoring_row.format <> match_row.format
     or scoring_row.tournament_id <> match_row.tournament_id or jsonb_array_length(scoring_row.hole_definitions) <> 18 then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_CANONICAL_CONTEXT_INCOMPLETE';
  end if;

  expected_participants := case when match_row.format = 'SI' then 2 else 4 end;
  expected_scores_per_side := case when match_row.format = 'BB' then 2 else 1 end;
  select count(*) into participant_count from scoring_authority.match_participants where match_id = match_row.match_id;
  if participant_count <> expected_participants
     or exists (
       select 1 from generate_series(1, 2) side(team_side)
       where (select count(*) from scoring_authority.match_participants mp where mp.match_id = match_row.match_id and mp.team_side = side.team_side)
         <> case when match_row.format = 'SI' then 1 else 2 end
     )
     or exists (
       select 1 from scoring_authority.match_participants mp
       left join scoring_authority.tournament_players tp
         on tp.tournament_id = match_row.tournament_id and tp.player_id = mp.player_id
       where mp.match_id = match_row.match_id
         and (tp.player_id is null or tp.team_side <> mp.team_side or tp.participation_status <> 'ACTIVE')
     ) then raise exception using errcode = 'P0001', message = 'ARCHIVE_PARTICIPANT_MAPPING_INVALID'; end if;

  select count(distinct hs.hole_number) into hole_count from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id;
  if hole_count <> 18
     or (select count(*) from scoring_authority.match_holes mh where mh.match_id = match_row.match_id) <> 18
     or exists (
       select 1 from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id and (
         not scoring_authority.valid_gross_scores(hs.team_1_gross_scores, expected_scores_per_side)
         or not scoring_authority.valid_gross_scores(hs.team_2_gross_scores, expected_scores_per_side)
         or jsonb_typeof(hs.team_1_strokes) <> 'array' or jsonb_array_length(hs.team_1_strokes) <> expected_scores_per_side
         or jsonb_typeof(hs.team_2_strokes) <> 'array' or jsonb_array_length(hs.team_2_strokes) <> expected_scores_per_side
       )
     ) then raise exception using errcode = 'P0001', message = 'ARCHIVE_HOLE_SET_INVALID'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'team_id', t.team_id, 'team_side', t.team_side, 'name', t.name
  ) order by t.team_side), '[]'::jsonb) into teams_value
  from scoring_authority.teams t where t.tournament_id = match_row.tournament_id;
  if jsonb_array_length(teams_value) <> 2 then raise exception using errcode = 'P0001', message = 'ARCHIVE_TEAM_MAPPING_INVALID'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
    'player_slot', mp.player_slot, 'handicap_index', mp.handicap_index,
    'course_handicap', mp.course_handicap, 'playing_handicap', mp.playing_handicap,
    'final_strokes', mp.final_strokes
  ) order by mp.team_side, mp.player_slot), '[]'::jsonb) into participants_value
  from scoring_authority.match_participants mp join scoring_authority.players p using (player_id)
  where mp.match_id = match_row.match_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'hole_number', hs.hole_number, 'hole_revision', hs.hole_revision,
    'par', mh.par, 'stroke_index', mh.stroke_index, 'yardage', mh.yardage,
    'team_1_gross_scores', hs.team_1_gross_scores, 'team_2_gross_scores', hs.team_2_gross_scores,
    'team_1_strokes', hs.team_1_strokes, 'team_2_strokes', hs.team_2_strokes,
    'team_1_net_score', hs.team_1_net_score, 'team_2_net_score', hs.team_2_net_score,
    'hole_winner', hs.hole_winner
  ) order by hs.hole_number), '[]'::jsonb),
  coalesce(jsonb_object_agg(hs.hole_number::text, hs.hole_revision order by hs.hole_number), '{}'::jsonb)
  into holes_value, hole_revisions
  from scoring_authority.hole_scores hs join scoring_authority.match_holes mh
    on mh.match_id = hs.match_id and mh.hole_number = hs.hole_number
  where hs.match_id = match_row.match_id;

  progress_value := scoring_authority.match_progress(match_row.match_id, match_row.format);
  if coalesce((progress_value->>'scorecard_complete')::boolean, false) is not true
     or btrim(coalesce(progress_value->>'result_winner', '')) <> btrim(match_row.result_winner) then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_RESULT_STATE_INCOHERENT';
  end if;

  source_value := jsonb_build_object(
    'schema_version', 'round-scorecards-v1',
    'tournament', jsonb_build_object('tournament_id', tournament_row.tournament_id, 'year', tournament_row.tournament_year, 'name', tournament_row.name),
    'round', jsonb_build_object('round_number', round_row.round_number, 'format', round_row.format, 'name', round_row.name),
    'match', jsonb_build_object(
      'match_id', match_row.match_id, 'display_number', presentation_row.display_match_number,
      'format', match_row.format, 'status', match_row.status, 'match_revision', match_row.match_revision,
      'result_winner', match_row.result_winner, 'running_result', match_row.running_result,
      'finalized_at', match_row.finalized_at
    ),
    'course', jsonb_build_object(
      'course_id', scoring_row.course_id, 'tee', scoring_row.tee, 'rating', scoring_row.rating,
      'slope', scoring_row.slope, 'par', scoring_row.par, 'scoring_snapshot_id', scoring_row.snapshot_id,
      'scoring_snapshot_revision', scoring_row.snapshot_revision, 'configuration_fingerprint', scoring_row.canonical_hash
    ),
    'teams', teams_value, 'participants', participants_value, 'holes', holes_value,
    'hole_revision_set', hole_revisions, 'result', progress_value
  );
  source_hash := encode(extensions.digest(source_value::text, 'sha256'), 'hex');
  payload_value := source_value || jsonb_build_object('source_fingerprint', source_hash);
  payload_hash_value := encode(extensions.digest(payload_value::text, 'sha256'), 'hex');

  select * into existing_row from scoring_authority.finalized_scorecard_snapshots
  where match_id = match_row.match_id and match_revision = match_row.match_revision;
  if found then
    if existing_row.source_fingerprint <> source_hash or existing_row.payload_hash <> payload_hash_value then
      raise exception using errcode = 'P0001', message = 'ARCHIVE_SNAPSHOT_REVISION_CONFLICT';
    end if;
    insert into scoring_authority.scorecard_archive_jobs (
      tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,
      source_fingerprint, archive_payload_hash
    ) values (
      existing_row.tournament_id, existing_row.match_id, existing_row.snapshot_id, existing_row.snapshot_revision,
      existing_row.match_revision, 'SCORECARD_ARCHIVE_UPSERT', existing_row.source_fingerprint, existing_row.payload_hash
    ) on conflict (match_id, event_type, match_revision) do nothing;
    return jsonb_build_object('ok', true, 'created', false, 'snapshot_id', existing_row.snapshot_id,
      'snapshot_revision', existing_row.snapshot_revision, 'match_revision', existing_row.match_revision,
      'source_fingerprint', existing_row.source_fingerprint, 'payload_hash', existing_row.payload_hash);
  end if;

  select * into prior_row from scoring_authority.finalized_scorecard_snapshots
  where match_id = match_row.match_id and state = 'CURRENT' for update;
  select coalesce(max(snapshot_revision), 0) + 1 into next_snapshot_revision
  from scoring_authority.finalized_scorecard_snapshots where match_id = match_row.match_id;
  if prior_row.snapshot_id is not null then
    update scoring_authority.finalized_scorecard_snapshots set
      state = 'SUPERSEDED', superseded_at = now(), superseded_by_snapshot_id = null
    where snapshot_id = prior_row.snapshot_id;
  end if;
  insert into scoring_authority.finalized_scorecard_snapshots (
    snapshot_id, tournament_id, match_id, snapshot_revision, match_revision,
    scoring_snapshot_id, scoring_snapshot_revision, source_fingerprint, payload_hash,
    payload, state, finalized_at
  ) values (
    new_snapshot_id, match_row.tournament_id, match_row.match_id, next_snapshot_revision, match_row.match_revision,
    scoring_row.snapshot_id, scoring_row.snapshot_revision, source_hash, payload_hash_value,
    payload_value, 'CURRENT', match_row.finalized_at
  );
  if prior_row.snapshot_id is not null then
    update scoring_authority.finalized_scorecard_snapshots set superseded_by_snapshot_id = new_snapshot_id
    where snapshot_id = prior_row.snapshot_id;
  end if;
  insert into scoring_authority.scorecard_archive_jobs (
    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,
    source_fingerprint, archive_payload_hash
  ) values (
    match_row.tournament_id, match_row.match_id, new_snapshot_id, next_snapshot_revision, match_row.match_revision,
    'SCORECARD_ARCHIVE_UPSERT', source_hash, payload_hash_value
  );
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash, status,
    last_error_code, last_error_safe, verified_at
  ) values (
    match_row.match_id, match_row.tournament_id, new_snapshot_id, next_snapshot_revision,
    match_row.match_revision, source_hash, payload_hash_value, 'PENDING', null, null, null
  ) on conflict (match_id) do update set
    tournament_id = excluded.tournament_id, current_snapshot_id = excluded.current_snapshot_id,
    finalized_snapshot_revision = excluded.finalized_snapshot_revision,
    finalized_match_revision = excluded.finalized_match_revision,
    source_fingerprint = excluded.source_fingerprint, archive_payload_hash = excluded.archive_payload_hash,
    expected_logical_identities = '[]'::jsonb, google_row_numbers = '[]'::jsonb,
    google_readback_hash = null, status = 'PENDING', last_job_id = null,
    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();
  insert into scoring_authority.audit_events (tournament_id, match_id, action, actor_id, metadata)
  values (match_row.tournament_id, match_row.match_id, 'FINALIZED_SCORECARD_SNAPSHOT_CREATED', coalesce(nullif(btrim(actor), ''), 'Supabase Finalization'),
    jsonb_build_object('snapshot_id', new_snapshot_id, 'snapshot_revision', next_snapshot_revision,
      'match_revision', match_row.match_revision, 'source_fingerprint', source_hash, 'payload_hash', payload_hash_value));
  return jsonb_build_object('ok', true, 'created', true, 'snapshot_id', new_snapshot_id,
    'snapshot_revision', next_snapshot_revision, 'match_revision', match_row.match_revision,
    'source_fingerprint', source_hash, 'payload_hash', payload_hash_value);
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.capture_scorecard_archive_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if new.status = 'FINAL' and old.status <> 'FINAL' then
    perform scoring_authority.capture_finalized_scorecard_snapshot(new.match_id, 'Supabase Finalization');
  elsif old.status = 'FINAL' and new.status <> 'FINAL' then
    perform scoring_authority.invalidate_finalized_scorecard_snapshot(new.match_id, new.match_revision, 'Supabase Reopen');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_calcutta_for_match_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if old.status is distinct from new.status
      or old.result_winner is distinct from new.result_winner
      or old.scorecard_complete is distinct from new.scorecard_complete
      or old.finalized_at is distinct from new.finalized_at
      or ((old.status = 'FINAL' or new.status = 'FINAL') and old.match_revision is distinct from new.match_revision) then
    perform scoring_authority.enqueue_calcutta_job(new.tournament_id, 'OFFICIAL_MATCH_STATE_CHANGE',
      jsonb_build_object('matchId', new.match_id, 'priorStatus', old.status, 'status', new.status,
        'matchRevision', new.match_revision, 'scorecardComplete', new.scorecard_complete,
        'resultWinner', new.result_winner));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_calcutta_job(target_tournament text, reason_value text, revision_value jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  insert into scoring_authority.competition_recalculation_jobs (
    tournament_id, round_number, engine_key, status, requested_source_revision,
    requested_at, updated_at
  ) values (
    target_tournament, 0, 'CALCUTTA', 'PENDING',
    jsonb_build_object('reason', reason_value, 'revision', coalesce(revision_value, '{}'::jsonb)),
    now(), now()
  ) on conflict (tournament_id, round_number, engine_key) do update set
    status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
    requested_at = now(), started_at = null, completed_at = null,
    last_error_code = null, last_error_safe = null, updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_competition_derived_job(target_tournament text, target_engine text, reason_value text, revision_value jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  insert into scoring_authority.competition_recalculation_jobs (
    tournament_id, round_number, engine_key, status, requested_source_revision,
    requested_at, updated_at
  ) values (
    target_tournament, 0, target_engine, 'PENDING',
    jsonb_build_object('reason', reason_value, 'revision', coalesce(revision_value, '{}'::jsonb)),
    now(), now()
  ) on conflict (tournament_id, round_number, engine_key) do update set
    status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
    requested_at = now(), started_at = null, completed_at = null,
    last_error_code = null, last_error_safe = null, updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_derived_for_match_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform scoring_authority.enqueue_competition_derived_job(
    new.tournament_id, 'TOURNAMENT_STORYLINES', 'MATCH_CHANGE',
    jsonb_build_object('matchId', new.match_id, 'matchRevision', new.match_revision,
      'status', new.status, 'resultWinner', new.result_winner)
  );
  if old.status is distinct from new.status
      or old.result_winner is distinct from new.result_winner
      or old.scorecard_complete is distinct from new.scorecard_complete
      or old.finalized_at is distinct from new.finalized_at then
    perform scoring_authority.enqueue_competition_derived_job(
      new.tournament_id, 'TEAM_MOMENTUM', 'OFFICIAL_RESULT_CHANGE',
      jsonb_build_object('matchId', new.match_id, 'matchRevision', new.match_revision,
        'status', new.status, 'resultWinner', new.result_winner)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_net_skins_recalculation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  target_match scoring_authority.matches%rowtype;
  target_match_id text;
begin
  target_match_id := case when tg_op = 'DELETE' then old.match_id else new.match_id end;
  select * into target_match from scoring_authority.matches
  where match_id = target_match_id;
  if target_match.match_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if exists (select 1 from scoring_authority.net_skins_configurations c
    where c.tournament_id = target_match.tournament_id and c.round_number = target_match.round_number and c.enabled) then
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status, requested_source_revision, requested_at, updated_at
    ) values (target_match.tournament_id, target_match.round_number, 'NET_SKINS', 'PENDING',
      jsonb_build_object('matchId', target_match.match_id, 'matchRevision', target_match.match_revision,
        'reason', tg_table_name), now(), now())
    on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
      requested_at = now(), started_at = null, completed_at = null,
      last_error_code = null, last_error_safe = null, updated_at = now();
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_storylines_for_net_skins_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if new.engine_key = 'NET_SKINS' and new.is_current then
    perform scoring_authority.enqueue_competition_derived_job(
      new.tournament_id, 'TOURNAMENT_STORYLINES', 'NET_SKINS_RESULT_CHANGE',
      jsonb_build_object('round', new.round_number, 'sourceFingerprint', new.source_fingerprint,
        'payloadHash', new.payload_hash)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_storylines_for_score_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  target_match_id text := case when tg_op = 'DELETE' then old.match_id else new.match_id end;
  target_match scoring_authority.matches%rowtype;
begin
  select * into target_match from scoring_authority.matches where match_id = target_match_id;
  if target_match.match_id is not null then
    perform scoring_authority.enqueue_competition_derived_job(
      target_match.tournament_id, 'TOURNAMENT_STORYLINES', 'SCORE_CHANGE',
      jsonb_build_object('matchId', target_match.match_id,
        'matchRevision', target_match.match_revision,
        'hole', case when tg_op = 'DELETE' then old.hole_number else new.hole_number end)
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.guard_completed_history_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IS_IMMUTABLE';
  end if;
  if current_setting('scoring_authority.completed_history_import', true) <> 'on' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IMPORT_RPC_REQUIRED';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.guard_completed_history_course_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IS_IMMUTABLE';
  end if;
  if current_setting('scoring_authority.completed_history_import', true) <> 'on' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IMPORT_RPC_REQUIRED';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.guard_completed_history_pointer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if current_setting('scoring_authority.completed_history_import', true) <> 'on' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IMPORT_RPC_REQUIRED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.guard_draft_projection_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if current_setting('scoring_authority.draft_projection_import', true) <> 'on' then
    raise exception 'Draft revisions are immutable outside the supported projection import operation.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION scoring_authority.guide_course_context_is_eligible(course_context jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
  select case
    when coalesce(jsonb_typeof(course_context), '') <> 'array' then false
    when jsonb_array_length(course_context) = 0 then false
    else not exists (
      select 1
      from jsonb_array_elements(course_context) context
      where coalesce((context->>'configuration_consistent')::boolean, false) is not true
        or btrim(coalesce(context->>'course_id', '')) = ''
        or btrim(coalesce(context->>'tee', '')) = ''
        or coalesce(jsonb_typeof(context->'rounds'), '') <> 'array'
        or jsonb_array_length(context->'rounds') = 0
        or coalesce(jsonb_typeof(context->'holes'), '') <> 'array'
        or jsonb_array_length(context->'holes') <> 18
        or exists (
          select 1 from generate_series(1, 18) expected(hole_number)
          where not exists (
            select 1 from jsonb_array_elements(context->'holes') hole
            where (hole->>'hole_number')::integer = expected.hole_number
          )
        )
        or exists (
          select 1 from generate_series(1, 18) expected(stroke_index)
          where not exists (
            select 1 from jsonb_array_elements(context->'holes') hole
            where (hole->>'stroke_index')::integer = expected.stroke_index
          )
        )
    )
  end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.invalidate_finalized_scorecard_snapshot(target_match text, target_match_revision bigint, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  match_row scoring_authority.matches%rowtype;
  snapshot_row scoring_authority.finalized_scorecard_snapshots%rowtype;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match, '')) for update;
  if not found then raise exception using errcode = 'P0001', message = 'ARCHIVE_MATCH_NOT_FOUND'; end if;
  if match_row.status = 'FINAL' then raise exception using errcode = 'P0001', message = 'ARCHIVE_REOPEN_STATE_REQUIRED'; end if;
  select * into snapshot_row from scoring_authority.finalized_scorecard_snapshots
  where match_id = match_row.match_id and state = 'CURRENT' for update;
  if not found then return jsonb_build_object('ok', true, 'created', false, 'code', 'NO_CURRENT_ARCHIVE'); end if;
  update scoring_authority.finalized_scorecard_snapshots set
    state = 'INVALIDATED', invalidated_at = now()
  where snapshot_id = snapshot_row.snapshot_id;
  insert into scoring_authority.scorecard_archive_jobs (
    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,
    source_fingerprint, archive_payload_hash
  ) values (
    match_row.tournament_id, match_row.match_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,
    target_match_revision, 'SCORECARD_ARCHIVE_INVALIDATE', snapshot_row.source_fingerprint, snapshot_row.payload_hash
  ) on conflict (match_id, event_type, match_revision) do nothing;
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash, status,
    last_error_code, last_error_safe, verified_at
  ) values (
    match_row.match_id, match_row.tournament_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,
    target_match_revision, snapshot_row.source_fingerprint, snapshot_row.payload_hash,
    'PENDING_INVALIDATION', null, null, null
  ) on conflict (match_id) do update set
    finalized_match_revision = excluded.finalized_match_revision, status = 'PENDING_INVALIDATION',
    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();
  insert into scoring_authority.audit_events (tournament_id, match_id, action, actor_id, metadata)
  values (match_row.tournament_id, match_row.match_id, 'FINALIZED_SCORECARD_ARCHIVE_INVALIDATION_QUEUED', coalesce(nullif(btrim(actor), ''), 'Supabase Reopen'),
    jsonb_build_object('snapshot_id', snapshot_row.snapshot_id, 'snapshot_revision', snapshot_row.snapshot_revision,
      'reopen_match_revision', target_match_revision));
  return jsonb_build_object('ok', true, 'created', true, 'snapshot_id', snapshot_row.snapshot_id,
    'snapshot_revision', snapshot_row.snapshot_revision, 'match_revision', target_match_revision);
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.jsonb_object_length(value jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select count(*)::integer from jsonb_object_keys(value);
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.match_access_decision(target_tournament_id text, target_player_id text, target_match_id text, requested_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'scoring_authority', 'participant_identity', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  tournament_key text := btrim(coalesce(target_tournament_id, ''));
  player_key text := btrim(coalesce(target_player_id, ''));
  match_key text := btrim(coalesce(target_match_id, ''));
  action_key text := upper(btrim(coalesce(requested_action, '')));
  match_row scoring_authority.matches%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  membership_active boolean := false;
  participant_member boolean := false;
  permission_active boolean := false;
  player_name text := '';
  allowed_value boolean := false;
  reason_code text := 'AUTHORIZED';
  context_revision_value bigint := 0;
begin
  select * into match_row from scoring_authority.matches m
    where m.match_id = match_key and m.tournament_id = tournament_key;
  select exists(select 1 from scoring_authority.tournament_players tp
    where tp.tournament_id = tournament_key and tp.player_id = player_key
      and tp.participation_status = 'ACTIVE') into membership_active;
  select exists(select 1 from scoring_authority.match_participants mp
    where mp.match_id = match_key and mp.player_id = player_key) into participant_member;
  select coalesce(p.display_name, '') into player_name from scoring_authority.players p where p.player_id = player_key;
  select * into permission_row from scoring_authority.scoring_permissions sp
    where sp.match_id = match_key and sp.player_id = player_key;
  permission_active := found and permission_row.can_score and permission_row.revoked_at is null;
  select coalesce(cr.context_revision, 0) into context_revision_value
    from participant_identity.identity_context_revisions cr where cr.tournament_id = tournament_key;
  context_revision_value := coalesce(context_revision_value, 0);

  if action_key not in ('VIEW_MATCH', 'VIEW_FINAL_SCORECARD', 'START_SCORING', 'VIEW_GAME_CENTER') then
    reason_code := 'INVALID_ACTION';
  elsif match_row.match_id is null then reason_code := 'MATCH_NOT_FOUND';
  elsif not membership_active then reason_code := 'TOURNAMENT_MEMBERSHIP_INACTIVE';
  elsif not participant_member then reason_code := 'NOT_MATCH_PARTICIPANT';
  elsif action_key in ('VIEW_MATCH', 'VIEW_GAME_CENTER') then allowed_value := true;
  elsif action_key = 'VIEW_FINAL_SCORECARD' then
    if match_row.status <> 'FINAL' then reason_code := 'MATCH_NOT_FINAL';
    else allowed_value := true;
    end if;
  elsif action_key = 'START_SCORING' then
    if match_row.status = 'FINAL' then reason_code := 'MATCH_FINAL';
    elsif match_row.scoring_locked then reason_code := 'MATCH_LOCKED';
    elsif not permission_active then reason_code := 'SCORING_PERMISSION_REVOKED';
    elsif permission_row.permission_revision <> match_row.permission_revision then reason_code := 'SCORING_PERMISSION_STALE';
    elsif match_row.status <> 'LIVE' then reason_code := 'MATCH_NOT_SCOREABLE';
    else allowed_value := true;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', allowed_value,
    'code', case when allowed_value then 'AUTHORIZED' else reason_code end,
    'action', action_key,
    'tournament_id', tournament_key,
    'player_id', player_key,
    'player_display_name', coalesce(player_name, ''),
    'match_id', match_key,
    'membership_active', membership_active,
    'participant_membership', participant_member,
    'match_status', coalesce(match_row.status, ''),
    'scoring_locked', coalesce(match_row.scoring_locked, false),
    'can_score', permission_active,
    'permission_revision', coalesce(permission_row.permission_revision, 0),
    'match_permission_revision', coalesce(match_row.permission_revision, 0),
    'match_revision', coalesce(match_row.match_revision, 0),
    'context_revision', context_revision_value,
    'read_only', action_key <> 'START_SCORING',
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.match_progress(target_match text, target_format text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  scored integer := 0; current_hole_value integer := 0; team_1_wins integer := 0; team_2_wins integer := 0;
  holes_remaining_value integer := 18; difference integer := 0; status_text text := 'Scheduled'; result_value text := '';
  clinched_value boolean := false; complete_value boolean := false; contiguous boolean := false;
  clinch_hole integer; clinch_lead integer; clinch_team_1 integer; clinch_team_2 integer;
  front_winner text := ''; back_winner text := ''; overall_winner text := '';
  team_1_points numeric; team_2_points numeric;
begin
  select count(*), coalesce(max(hole_number), 0),
    count(*) filter (where hole_winner = 'Team 1'), count(*) filter (where hole_winner = 'Team 2')
  into scored, current_hole_value, team_1_wins, team_2_wins
  from scoring_authority.hole_scores where match_id = target_match;
  holes_remaining_value := greatest(0, 18 - current_hole_value);
  complete_value := scored = 18 and current_hole_value = 18;
  if current_hole_value > 0 then
    select coalesce(bool_and(existing.hole_number is not null), false) into contiguous
    from generate_series(1, current_hole_value) expected(hole_number)
    left join scoring_authority.hole_scores existing on existing.match_id = target_match and existing.hole_number = expected.hole_number;
  end if;
  difference := team_1_wins - team_2_wins;
  if scored > 0 then status_text := case when difference = 0 then 'All square through ' || current_hole_value
    else (case when difference > 0 then 'Team 1' else 'Team 2' end) || ' ' || abs(difference) || ' UP through ' || current_hole_value end; end if;

  if target_format = 'SI' then
    with running as (
      select hole_number,
        sum(case when hole_winner = 'Team 1' then 1 else 0 end) over (order by hole_number) team_1,
        sum(case when hole_winner = 'Team 2' then 1 else 0 end) over (order by hole_number) team_2
      from scoring_authority.hole_scores where match_id = target_match
    ) select hole_number, abs(team_1 - team_2), team_1, team_2
      into clinch_hole, clinch_lead, clinch_team_1, clinch_team_2
      from running where abs(team_1 - team_2) > 18 - hole_number order by hole_number limit 1;
    if contiguous and clinch_hole is not null then
      clinched_value := true;
      result_value := case when clinch_team_1 > clinch_team_2 then 'Team 1' else 'Team 2' end;
      status_text := result_value || ' wins ' || clinch_lead || ' & ' || (18 - clinch_hole);
    elsif complete_value then
      result_value := case when difference = 0 then 'Halved' when difference > 0 then 'Team 1' else 'Team 2' end;
      status_text := case when result_value = 'Halved' then 'Match halved' else result_value || ' wins ' || abs(difference) || ' UP' end;
    end if;
    if clinched_value or complete_value then
      team_1_points := case when result_value = 'Team 1' then 3 when result_value = 'Halved' then 1.5 else 0 end;
      team_2_points := 3 - team_1_points;
      overall_winner := result_value;
    end if;
  elsif complete_value then
    front_winner := scoring_authority.segment_winner(target_match, 1, 9);
    back_winner := scoring_authority.segment_winner(target_match, 10, 18);
    overall_winner := scoring_authority.segment_winner(target_match, 1, 18);
    result_value := overall_winner;
    team_1_points := (case when front_winner = 'Team 1' then 1 when front_winner = 'Halved' then .5 else 0 end) +
      (case when back_winner = 'Team 1' then 1 when back_winner = 'Halved' then .5 else 0 end) +
      (case when overall_winner = 'Team 1' then 1 when overall_winner = 'Halved' then .5 else 0 end);
    team_2_points := 3 - team_1_points;
  end if;
  return jsonb_build_object(
    'scored_holes', scored, 'current_hole', current_hole_value, 'holes_remaining', holes_remaining_value,
    'team_1_holes_won', team_1_wins, 'team_2_holes_won', team_2_wins, 'running_result', status_text,
    'result_winner', result_value, 'clinched', clinched_value, 'scorecard_complete', complete_value,
    'front_winner', front_winner, 'back_winner', back_winner, 'overall_winner', overall_winner,
    'team_1_points', team_1_points, 'team_2_points', team_2_points
  );
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.protect_finalized_scorecard_snapshot_payload()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if new.tournament_id is distinct from old.tournament_id
     or new.match_id is distinct from old.match_id
     or new.snapshot_revision is distinct from old.snapshot_revision
     or new.match_revision is distinct from old.match_revision
     or new.scoring_snapshot_id is distinct from old.scoring_snapshot_id
     or new.scoring_snapshot_revision is distinct from old.scoring_snapshot_revision
     or new.source_fingerprint is distinct from old.source_fingerprint
     or new.payload_hash is distinct from old.payload_hash
     or new.payload is distinct from old.payload
     or new.finalized_at is distinct from old.finalized_at
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'FINALIZED_SCORECARD_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.reject_guide_revision_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'scoring_authority', 'public', 'pg_temp'
AS $function$
begin
  raise exception using errcode = 'P0001', message = 'GUIDE_CONTENT_REVISION_IMMUTABLE';
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.segment_winner(target_match text, first_hole integer, last_hole integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare counted integer; team_1 integer; team_2 integer;
begin
  select count(*), count(*) filter (where hole_winner = 'Team 1'), count(*) filter (where hole_winner = 'Team 2')
  into counted, team_1, team_2 from scoring_authority.hole_scores
  where match_id = target_match and hole_number between first_hole and last_hole;
  if counted <> last_hole - first_hole + 1 then return ''; end if;
  return case when team_1 = team_2 then 'Halved' when team_1 > team_2 then 'Team 1' else 'Team 2' end;
end;
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.strokes_on_hole(total_strokes integer, stroke_index integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select case when total_strokes <= 0 or stroke_index not between 1 and 18 then 0
    else floor(total_strokes / 18.0)::integer +
      case when mod(total_strokes, 18) > 0 and stroke_index <= mod(total_strokes, 18) then 1 else 0 end
  end
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.supersede_prior_odds_google_mirror_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if new.is_current_official is true and (tg_op='INSERT' or old.is_current_official is distinct from true) then
    update scoring_authority.odds_google_mirror_jobs set status='SUPERSEDED',
      last_error_safe='A newer official Odds publication superseded this reporting mirror.',updated_at=now()
    where tournament_id=new.tournament_id and snapshot_id<>new.id and status in ('PENDING','RUNNING','FAILED');
    update scoring_authority.odds_published_snapshots set mirror_status='SUPERSEDED'
    where tournament_id=new.tournament_id and id<>new.id and mirror_status in ('PENDING','RUNNING','FAILED');
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION scoring_authority.valid_gross_scores(values_json jsonb, expected_count integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when jsonb_typeof(values_json) = 'array' then
    jsonb_array_length(values_json) = expected_count and not exists (
      select 1 from jsonb_array_elements_text(values_json) value
      where value !~ '^[0-9]+$' or value::integer < 1 or value::integer > 20
    ) else false end
$function$;

CREATE OR REPLACE FUNCTION scoring_authority.validate_completed_history_payload(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  body jsonb := input->'payload';
  tournament_value jsonb := input->'payload'->'tournament';
  target_year integer;
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  team_count integer;
  player_count integer;
  roster_count integer;
  round_count integer;
  course_count integer;
  appearance_count integer;
  match_count integer;
  participant_count integer;
  scorecard_count integer;
  award_count integer;
  eligibility_count integer;
  correction_count integer;
  complete_scorecards integer;
  partial_scorecards integer;
  unavailable_scorecards integer;
  recorded_hole_rows integer;
  all_points_recorded boolean;
  derived_team_1 numeric;
  derived_team_2 numeric;
  official_team_1 numeric;
  official_team_2 numeric;
  total_awarded numeric;
  expected_configured numeric;
  score_availability text;
  champion_side integer;
  champion_team text;
  counts_value jsonb;
begin
  begin target_year := (input->>'tournament_year')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
  end;
  if target_year not between 2017 and 2025
     or target_tournament <> target_year::text then
    return jsonb_build_object('ok', false, 'code', 'COMPLETED_HISTORY_YEAR_SCOPE_INVALID');
  end if;
  if jsonb_typeof(body) <> 'object'
     or jsonb_typeof(tournament_value) <> 'object'
     or tournament_value->>'tournament_id' <> target_tournament
     or tournament_value->>'tournament_year' <> target_year::text
     or btrim(coalesce(tournament_value->>'name', '')) = '' then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_TOURNAMENT_CONTRACT_INVALID');
  end if;
  if jsonb_typeof(body->'teams') <> 'array'
     or jsonb_typeof(body->'players') <> 'array'
     or jsonb_typeof(body->'roster') <> 'array'
     or jsonb_typeof(body->'rounds') <> 'array'
     or jsonb_typeof(body->'courses') <> 'array'
     or jsonb_typeof(body->'course_appearances') <> 'array'
     or jsonb_typeof(body->'matches') <> 'array'
     or jsonb_typeof(body->'match_participants') <> 'array'
     or jsonb_typeof(body->'scorecards') <> 'array'
     or jsonb_typeof(body->'awards') <> 'array'
     or jsonb_typeof(body->'record_eligibility') <> 'array'
     or jsonb_typeof(body->'corrections') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_NORMALIZED_ARRAYS_REQUIRED');
  end if;

  team_count := jsonb_array_length(body->'teams');
  player_count := jsonb_array_length(body->'players');
  roster_count := jsonb_array_length(body->'roster');
  round_count := jsonb_array_length(body->'rounds');
  course_count := jsonb_array_length(body->'courses');
  appearance_count := jsonb_array_length(body->'course_appearances');
  match_count := jsonb_array_length(body->'matches');
  participant_count := jsonb_array_length(body->'match_participants');
  scorecard_count := jsonb_array_length(body->'scorecards');
  award_count := jsonb_array_length(body->'awards');
  eligibility_count := jsonb_array_length(body->'record_eligibility');
  correction_count := jsonb_array_length(body->'corrections');

  if team_count <> 2 or player_count = 0 or roster_count = 0
     or round_count <> 3 or course_count = 0 or appearance_count <> 3
     or match_count = 0 or participant_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_CANONICAL_SET_INCOMPLETE');
  end if;
  if (select count(distinct value->>'team_id') from jsonb_array_elements(body->'teams')) <> team_count
     or (select count(distinct value->>'team_side') from jsonb_array_elements(body->'teams')) <> 2
     or exists (
       select 1 from jsonb_array_elements(body->'teams') value
       where btrim(coalesce(value->>'team_id', '')) = ''
          or btrim(coalesce(value->>'name', '')) = ''
          or coalesce(value->>'team_side', '') not in ('1', '2')
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_TEAM_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'player_id') from jsonb_array_elements(body->'players')) <> player_count
     or exists (
       select 1 from jsonb_array_elements(body->'players') value
       where btrim(coalesce(value->>'player_id', '')) = ''
          or btrim(coalesce(value->>'display_name', '')) = ''
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_PLAYER_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'player_id') from jsonb_array_elements(body->'roster')) <> roster_count
     or exists (
       select 1 from jsonb_array_elements(body->'roster') roster
       where btrim(coalesce(roster->>'player_id', '')) = ''
          or btrim(coalesce(roster->>'team_id', '')) = ''
          or btrim(coalesce(roster->>'source_roster_key', '')) = ''
          or not exists (
            select 1 from jsonb_array_elements(body->'players') player
            where player->>'player_id' = roster->>'player_id'
          )
          or not exists (
            select 1 from jsonb_array_elements(body->'teams') team
            where team->>'team_id' = roster->>'team_id'
              and team->>'team_side' = roster->>'team_side'
          )
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_ROSTER_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'round_number') from jsonb_array_elements(body->'rounds')) <> round_count
     or exists (
       select 1 from jsonb_array_elements(body->'rounds') value
       where coalesce(value->>'format', '') not in ('BB', 'SC', 'SI')
          or nullif(value->>'round_number', '')::integer not between 1 and 99
          or nullif(value->>'team_size', '')::integer <= 0
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_ROUND_CONTRACT_INVALID');
  end if;
  if (select count(distinct value->>'course_id') from jsonb_array_elements(body->'courses')) <> course_count
     or exists (
       select 1 from jsonb_array_elements(body->'courses') value
       where btrim(coalesce(value->>'course_id', '')) = ''
          or btrim(coalesce(value->>'canonical_name', '')) = ''
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'appearance_id') from jsonb_array_elements(body->'course_appearances')) <> appearance_count
     or (select count(distinct value->>'round_number') from jsonb_array_elements(body->'course_appearances')) <> round_count
     or exists (
       select 1 from jsonb_array_elements(body->'course_appearances') appearance
       where btrim(coalesce(appearance->>'appearance_id', '')) = ''
          or btrim(coalesce(appearance->>'source_course_id', '')) = ''
          or btrim(coalesce(appearance->>'display_name', '')) = ''
          or not exists (
            select 1 from jsonb_array_elements(body->'courses') course
            where course->>'course_id' = appearance->>'course_id'
          )
          or not exists (
            select 1 from jsonb_array_elements(body->'rounds') round_value
            where round_value->>'round_number' = appearance->>'round_number'
          )
          or jsonb_typeof(coalesce(appearance->'hole_definitions', '[]'::jsonb)) <> 'array'
          or jsonb_array_length(coalesce(appearance->'hole_definitions', '[]'::jsonb)) not in (0, 18)
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_APPEARANCE_INVALID');
  end if;
  if (select count(distinct value->>'match_id') from jsonb_array_elements(body->'matches')) <> match_count
     or (select count(distinct value->>'source_match_key') from jsonb_array_elements(body->'matches')) <> match_count
     or exists (
       select 1 from jsonb_array_elements(body->'matches') match_value
       where btrim(coalesce(match_value->>'match_id', '')) = ''
          or btrim(coalesce(match_value->>'source_match_key', '')) = ''
          or coalesce(match_value->>'format', '') not in ('BB', 'SC', 'SI')
          or coalesce(match_value->>'lifecycle', '') <> 'FINAL'
          or coalesce(match_value->>'completion_state', '') not in ('COMPLETE', 'CONCEDED', 'FORFEIT', 'LEGACY_FINAL')
          or coalesce(match_value->>'scorecard_coverage', '') not in ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')
          or coalesce(match_value->>'result_winner', '') not in ('Team 1', 'Team 2', 'Halved')
          or coalesce(match_value->>'points_availability', '') not in ('RECORDED', 'UNAVAILABLE')
          or not exists (
            select 1 from jsonb_array_elements(body->'rounds') round_value
            where round_value->>'round_number' = match_value->>'round_number'
              and round_value->>'format' = match_value->>'format'
          )
          or not exists (
            select 1 from jsonb_array_elements(body->'course_appearances') appearance
            where appearance->>'appearance_id' = match_value->>'course_appearance_id'
              and appearance->>'round_number' = match_value->>'round_number'
          )
          or (match_value->>'points_availability' = 'RECORDED' and (
            match_value->>'team_1_points' is null or match_value->>'team_2_points' is null
            or match_value->>'points_available' is null
          ))
          or (match_value->>'points_availability' = 'UNAVAILABLE' and (
            match_value->>'team_1_points' is not null or match_value->>'team_2_points' is not null
          ))
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_CONTRACT_INVALID');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(body->'matches') match_value
    join jsonb_array_elements(body->'rounds') round_value
      on round_value->>'round_number' = match_value->>'round_number'
    where match_value->>'points_availability' = 'RECORDED'
      and (
        (match_value->>'team_1_points')::numeric + (match_value->>'team_2_points')::numeric
          is distinct from (match_value->>'points_available')::numeric
        or (match_value->>'points_available')::numeric
          is distinct from (round_value->>'points_per_match')::numeric
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_POINT_RECONCILIATION_FAILED');
  end if;
  if exists (
       select 1 from (
         select value->>'match_id', value->>'player_id', count(*)
         from jsonb_array_elements(body->'match_participants') value
         group by 1, 2 having count(*) > 1
       ) duplicate_participants
     )
     or exists (
       select 1 from jsonb_array_elements(body->'match_participants') participant
       where not exists (
         select 1 from jsonb_array_elements(body->'matches') match_value
         where match_value->>'match_id' = participant->>'match_id'
       )
       or not exists (
         select 1 from jsonb_array_elements(body->'roster') roster
         where roster->>'player_id' = participant->>'player_id'
           and roster->>'team_side' = participant->>'team_side'
       )
       or coalesce(participant->>'team_side', '') not in ('1', '2')
       or coalesce(participant->>'player_slot', '') not in ('1', '2')
     )
     or exists (
       select 1 from jsonb_array_elements(body->'matches') match_value
       where (
         select count(*) from jsonb_array_elements(body->'match_participants') participant
         where participant->>'match_id' = match_value->>'match_id'
       ) <> case when match_value->>'format' = 'SI' then 2 else 4 end
       or exists (
         select 1 from generate_series(1, 2) side(team_side)
         where (
           select count(*) from jsonb_array_elements(body->'match_participants') participant
           where participant->>'match_id' = match_value->>'match_id'
             and participant->>'team_side' = side.team_side::text
         ) <> case when match_value->>'format' = 'SI' then 1 else 2 end
       )
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_PARTICIPANTS_INVALID');
  end if;
  if eligibility_count <> participant_count
     or exists (
       select 1 from (
         select value->>'match_id', value->>'player_id', count(*)
         from jsonb_array_elements(body->'record_eligibility') value
         group by 1, 2 having count(*) > 1
       ) duplicate_eligibility
     )
     or exists (
       select 1 from jsonb_array_elements(body->'match_participants') participant
       where not exists (
         select 1 from jsonb_array_elements(body->'record_eligibility') eligibility
         where eligibility->>'match_id' = participant->>'match_id'
           and eligibility->>'player_id' = participant->>'player_id'
           and jsonb_typeof(eligibility->'is_record_eligible') = 'boolean'
           and btrim(coalesce(eligibility->>'reason_code', '')) <> ''
       )
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_RECORD_ELIGIBILITY_INVALID');
  end if;
  if scorecard_count <> (select count(distinct value->>'scorecard_id') from jsonb_array_elements(body->'scorecards'))
     or exists (
       select 1 from jsonb_array_elements(body->'scorecards') scorecard
       where btrim(coalesce(scorecard->>'scorecard_id', '')) = ''
          or coalesce(scorecard->>'entity_kind', '') not in ('PLAYER', 'PAIRING', 'TEAM')
          or coalesce(scorecard->>'coverage_status', '') not in ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')
          or not exists (
            select 1 from jsonb_array_elements(body->'matches') match_value
            where match_value->>'match_id' = scorecard->>'match_id'
          )
          or (scorecard->>'player_id' is not null and not exists (
            select 1 from jsonb_array_elements(body->'roster') roster
            where roster->>'player_id' = scorecard->>'player_id'
          ))
          or jsonb_typeof(coalesce(scorecard->'hole_values', '[]'::jsonb)) <> 'array'
          or (scorecard->>'coverage_status' = 'COMPLETE' and (
            (scorecard->>'recorded_holes')::integer <> 18
            or jsonb_array_length(scorecard->'hole_values') <> 18
          ))
          or (scorecard->>'coverage_status' = 'PARTIAL' and (
            (scorecard->>'recorded_holes')::integer not between 1 and 17
            or jsonb_array_length(scorecard->'hole_values') <> 18
          ))
          or (scorecard->>'coverage_status' = 'UNAVAILABLE' and (
            (scorecard->>'recorded_holes')::integer <> 0
            or jsonb_array_length(scorecard->'hole_values') not in (0, 18)
          ))
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_SCORECARD_CONTRACT_INVALID');
  end if;
  if award_count <> (select count(distinct value->>'award_id') from jsonb_array_elements(body->'awards'))
     or exists (
       select 1 from jsonb_array_elements(body->'awards') award
       where btrim(coalesce(award->>'award_id', '')) = ''
          or btrim(coalesce(award->>'award_type', '')) = ''
          or btrim(coalesce(award->>'label', '')) = ''
          or coalesce(award->>'recipient_kind', '') not in ('PLAYER', 'TEAM', 'TEXT', 'UNAVAILABLE')
          or (award->>'recipient_kind' = 'PLAYER' and not exists (
            select 1 from jsonb_array_elements(body->'players') player
            where player->>'player_id' = award->>'winner_player_id'
          ))
          or (award->>'recipient_kind' = 'TEAM' and not exists (
            select 1 from jsonb_array_elements(body->'teams') team
            where team->>'team_id' = award->>'winner_team_id'
          ))
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_AWARD_CONTRACT_INVALID');
  end if;

  select count(*) filter (where value->>'coverage_status' = 'COMPLETE'),
         count(*) filter (where value->>'coverage_status' = 'PARTIAL'),
         count(*) filter (where value->>'coverage_status' = 'UNAVAILABLE'),
         coalesce(sum((value->>'recorded_holes')::integer), 0)
  into complete_scorecards, partial_scorecards, unavailable_scorecards, recorded_hole_rows
  from jsonb_array_elements(body->'scorecards') value;
  all_points_recorded := not exists (
    select 1 from jsonb_array_elements(body->'matches') value
    where value->>'points_availability' <> 'RECORDED'
  );
  if all_points_recorded then
    select coalesce(sum((value->>'team_1_points')::numeric), 0),
           coalesce(sum((value->>'team_2_points')::numeric), 0)
    into derived_team_1, derived_team_2
    from jsonb_array_elements(body->'matches') value;
  end if;
  score_availability := coalesce(tournament_value->>'score_availability', '');
  official_team_1 := nullif(tournament_value->>'official_team_1_points', '')::numeric;
  official_team_2 := nullif(tournament_value->>'official_team_2_points', '')::numeric;
  total_awarded := nullif(tournament_value->>'total_awarded_points', '')::numeric;
  expected_configured := nullif(tournament_value->>'expected_configured_points', '')::numeric;
  champion_side := nullif(tournament_value->>'champion_team_side', '')::integer;
  champion_team := nullif(btrim(coalesce(tournament_value->>'champion_team_id', '')), '');
  if coalesce(tournament_value->>'lifecycle', '') <> 'FINAL'
     or score_availability not in ('RECORDED', 'UNAVAILABLE')
     or champion_side not in (1, 2) or champion_team is null
     or not exists (
       select 1 from jsonb_array_elements(body->'teams') team
       where team->>'team_id' = champion_team and team->>'team_side' = champion_side::text
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_FINAL_RESULT_INVALID');
  end if;
  if score_availability = 'RECORDED' and (
       not all_points_recorded
       or official_team_1 is distinct from derived_team_1
       or official_team_2 is distinct from derived_team_2
       or total_awarded is distinct from derived_team_1 + derived_team_2
       or (expected_configured is not null and expected_configured is distinct from total_awarded)
       or (official_team_1 > official_team_2 and champion_side <> 1)
       or (official_team_2 > official_team_1 and champion_side <> 2)
     ) then
    return jsonb_build_object(
      'ok', false, 'code', 'HISTORICAL_FINAL_SCORE_RECONCILIATION_FAILED',
      'derived', jsonb_build_object(
        'team_1_points', derived_team_1, 'team_2_points', derived_team_2,
        'total_awarded_points', derived_team_1 + derived_team_2
      )
    );
  elsif score_availability = 'UNAVAILABLE' and (
    official_team_1 is not null or official_team_2 is not null or total_awarded is not null
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE_SCORE_MUST_REMAIN_NULL');
  end if;

  counts_value := jsonb_build_object(
    'teams', team_count, 'players', player_count, 'roster', roster_count,
    'rounds', round_count, 'courses', course_count, 'course_appearances', appearance_count,
    'matches', match_count, 'match_participants', participant_count,
    'scorecards', scorecard_count, 'complete_scorecards', complete_scorecards,
    'partial_scorecards', partial_scorecards, 'unavailable_scorecards', unavailable_scorecards,
    'recorded_hole_rows', recorded_hole_rows, 'awards', award_count,
    'record_eligibility', eligibility_count,
    'record_exclusions', (
      select count(*) from jsonb_array_elements(body->'record_eligibility') value
      where coalesce((value->>'is_record_eligible')::boolean, false) is false
    ),
    'corrections', correction_count
  );
  return jsonb_build_object(
    'ok', true,
    'counts', counts_value,
    'derived_team_1_points', derived_team_1,
    'derived_team_2_points', derived_team_2,
    'score_availability', score_availability,
    'champion_team_side', champion_side,
    'champion_team_id', champion_team
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'code', 'HISTORICAL_NUMERIC_CONTRACT_INVALID');
end;
$function$;

CREATE OR REPLACE FUNCTION participant_identity.cancel_phone_otp_attempts_for_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'pg_temp'
AS $function$
begin
  if new.status <> 'ACTIVE' or new.auth_user_id <> old.auth_user_id or new.player_id <> old.player_id then
    update participant_identity.participant_phone_otp_attempts
    set status = 'CANCELLED', safe_reason = 'PLAYER_LINK_CHANGED', updated_at = now()
    where player_id = old.player_id and auth_user_id = old.auth_user_id
      and status in ('REQUESTING', 'SENT');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION participant_identity.cancel_stale_phone_otp_attempts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'pg_temp'
AS $function$
begin
  if old.identifier_type = 'PHONE' and (
    new.status = 'REVOKED'
    or new.revision <> old.revision
    or new.player_id <> old.player_id
    or new.auth_user_id <> old.auth_user_id
    or new.normalized_value_private <> old.normalized_value_private
  ) then
    update participant_identity.participant_phone_otp_attempts
    set status = 'CANCELLED', safe_reason = case when new.status = 'REVOKED' then 'PHONE_REVOKED' else 'IDENTIFIER_CHANGED' end,
      updated_at = now()
    where identifier_id = old.identifier_id and status in ('REQUESTING', 'SENT');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION participant_identity.canonical_auth_phone(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select regexp_replace(btrim(value), '[^0-9]', '', 'g')
$function$;

CREATE OR REPLACE FUNCTION participant_identity.enforce_current_phone_auth_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'auth', 'pg_temp'
AS $function$
declare canonical_auth_user_id uuid;
begin
  if new.identifier_type <> 'PHONE'
     or new.status not in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED') then
    return new;
  end if;

  select link.auth_user_id into canonical_auth_user_id
  from participant_identity.user_player_links link
  where link.player_id = new.player_id
    and link.status = 'ACTIVE'
  for key share;

  if canonical_auth_user_id is null then
    raise exception 'Current mobile ownership requires one active Player Passport Auth link.'
      using errcode = 'P0001';
  end if;

  if new.auth_user_id <> canonical_auth_user_id then
    raise exception 'Current mobile ownership must use the active Player Passport Auth user.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from participant_identity.participant_auth_identifiers email_identifier
    where email_identifier.player_id = new.player_id
      and email_identifier.auth_user_id = canonical_auth_user_id
      and email_identifier.identifier_type = 'EMAIL'
      and email_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  ) then
    raise exception 'Current mobile ownership requires matching email ownership for the active Auth user.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION participant_identity.resolve_approved_participant_tournament(target_auth_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
  select contact.tournament_id
  from participant_identity.user_player_links link
  join participant_identity.participant_identity_contacts contact
    on contact.player_id = link.player_id
   and contact.identity_active
   and link.email_identity_hash = encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex')
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact.tournament_id
   and membership.player_id = contact.player_id
   and membership.participation_status = 'ACTIVE'
  join participant_identity.identity_context_revisions revision
    on revision.tournament_id = contact.tournament_id
  join lateral (
    select run.approved_at
    from participant_identity.identity_config_import_runs run
    where run.tournament_id = contact.tournament_id
      and run.status = 'APPROVED'
      and run.source_fingerprint = revision.configuration_fingerprint
    order by run.approved_at desc nulls last, run.requested_at desc
    limit 1
  ) approved on true
  where link.auth_user_id = target_auth_user_id
    and link.status = 'ACTIVE'
  order by approved.approved_at desc nulls last, contact.updated_at desc, contact.tournament_id
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.admin_link_auth_user_to_player(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare actor text := btrim(coalesce(input->>'linked_by', ''));
declare contact participant_identity.participant_identity_contacts%rowtype;
declare auth_user auth.users%rowtype;
declare existing participant_identity.user_player_links%rowtype;
declare existing_identifier participant_identity.participant_auth_identifiers%rowtype;
declare inserted_id uuid;
declare identifier_status text;
begin
  if user_id is null or target_player = '' or target_tournament = '' or actor = '' then
    raise exception 'Complete link administration context is required.';
  end if;
  select * into auth_user from auth.users where id = user_id;
  if not found then raise exception 'Auth user does not exist.'; end if;
  select * into contact from participant_identity.participant_identity_contacts
    where tournament_id = target_tournament and player_id = target_player and identity_active;
  if not found then raise exception 'Approved active participant identity contact is required.'; end if;
  if lower(btrim(coalesce(auth_user.email, ''))) <> contact.email_normalized then
    raise exception 'Approved Auth user email does not match Participant Identity ownership.';
  end if;
  identifier_status := case when auth_user.email_confirmed_at is not null then 'VERIFIED' else 'ELIGIBLE' end;

  select * into existing from participant_identity.user_player_links
    where auth_user_id = user_id or (player_id = target_player and status in ('PENDING', 'ACTIVE', 'SUSPENDED')) limit 1;
  if found then
    if existing.auth_user_id <> user_id or existing.player_id <> target_player
      or existing.email_identity_hash <> encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex') then
      raise exception 'Existing Auth user or Player link requires an explicit audited link-change operation.';
    end if;
    select * into existing_identifier
    from participant_identity.participant_auth_identifiers
    where player_id = target_player and identifier_type = 'EMAIL'
      and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
    if found and (existing_identifier.auth_user_id <> user_id
      or existing_identifier.normalized_value_private <> contact.email_normalized) then
      raise exception 'Existing email identifier requires an explicit audited ownership change.';
    end if;
    if not found then
      insert into participant_identity.participant_auth_identifiers (
        player_id, auth_user_id, identifier_type, normalized_value_private, status,
        verified_at, verification_source, source_system, source_tournament_id,
        source_configuration_revision, created_by, updated_by
      ) values (
        target_player, user_id, 'EMAIL', contact.email_normalized, identifier_status,
        auth_user.email_confirmed_at,
        case when auth_user.email_confirmed_at is not null then 'SUPABASE_AUTH_EMAIL_CONFIRMED' else null end,
        'PARTICIPANT_IDENTITY_EMAIL_COMPATIBILITY', target_tournament,
        contact.configuration_revision, actor, actor
      );
    end if;
    return jsonb_build_object('ok', true, 'created', false, 'linkId', existing.link_id, 'status', existing.status);
  end if;

  insert into participant_identity.user_player_links (
    auth_user_id, player_id, status, link_method, email_identity_hash, linked_at, linked_by
  ) values (
    user_id, target_player, 'ACTIVE', 'DIRECTOR_APPROVED_EMAIL',
    encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex'), now(), actor
  ) returning link_id into inserted_id;

  insert into participant_identity.participant_auth_identifiers (
    player_id, auth_user_id, identifier_type, normalized_value_private, status,
    verified_at, verification_source, source_system, source_tournament_id,
    source_configuration_revision, created_by, updated_by
  ) values (
    target_player, user_id, 'EMAIL', contact.email_normalized, identifier_status,
    auth_user.email_confirmed_at,
    case when auth_user.email_confirmed_at is not null then 'SUPABASE_AUTH_EMAIL_CONFIRMED' else null end,
    'PARTICIPANT_IDENTITY_EMAIL_COMPATIBILITY', target_tournament,
    contact.configuration_revision, actor, actor
  );

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, link_revision, safe_metadata
  ) values (
    'AUTH_USER_LINKED', target_tournament, user_id, target_player, actor, 1,
    jsonb_build_object('emailIdentifierCreated', true, 'emailValueStoredInAudit', false)
  );
  return jsonb_build_object('ok', true, 'created', true, 'linkId', inserted_id, 'status', 'ACTIVE');
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_participant_identity_configuration(run_id uuid, expected_fingerprint text, approved_by_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'pg_temp'
AS $function$
declare current_run participant_identity.identity_config_import_runs%rowtype;
begin
  select * into current_run from participant_identity.identity_config_import_runs where identity_config_import_runs.run_id = approve_participant_identity_configuration.run_id for update;
  if not found then raise exception 'Identity configuration import was not found.'; end if;
  if current_run.status not in ('APPLIED', 'APPROVED') then raise exception 'Only a complete valid mapping can be approved.'; end if;
  if current_run.source_fingerprint <> lower(btrim(expected_fingerprint)) then raise exception 'Identity configuration changed before approval.'; end if;
  if btrim(coalesce(approved_by_name, '')) = '' then raise exception 'Director identity is required.'; end if;

  update participant_identity.identity_config_import_runs set
    status = 'APPROVED', approved_by = btrim(approved_by_name), approved_at = coalesce(approved_at, now()), updated_at = now()
  where identity_config_import_runs.run_id = approve_participant_identity_configuration.run_id;

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, actor_name, request_id, configuration_revision, safe_metadata
  ) values (
    'IDENTITY_MAPPING_APPROVED', current_run.tournament_id, btrim(approved_by_name), current_run.run_id::text,
    current_run.configuration_revision, jsonb_build_object('fingerprint', current_run.source_fingerprint)
  );
  return jsonb_build_object('ok', true, 'runId', current_run.run_id, 'status', 'APPROVED',
    'fingerprint', current_run.source_fingerprint, 'approvedBy', btrim(approved_by_name));
end;
$function$;

CREATE OR REPLACE FUNCTION public.authorize_match_access(target_tournament_id text, target_player_id text, target_match_id text, requested_action text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'participant_identity', 'public', 'extensions', 'pg_temp'
AS $function$
  select scoring_authority.match_access_decision(
    target_tournament_id, target_player_id, target_match_id, requested_action
  );
$function$;

CREATE OR REPLACE FUNCTION public.authorize_participant_phone_enrollment_verification(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'pg_temp'
AS $function$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt
    and auth_user_id = actor_auth_user
    and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found then return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_SESSION_REQUIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' then return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_STALE'); end if;
  if attempt.expires_at <= now() then
    update participant_identity.participant_phone_otp_attempts set status = 'EXPIRED', safe_reason = 'ATTEMPT_EXPIRED', updated_at = now()
    where attempt_id = target_attempt;
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_INVALID_OR_EXPIRED');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers
  where identifier_id = attempt.identifier_id for update;
  select * into email_identifier from participant_identity.participant_auth_identifiers
  where player_id = attempt.player_id and auth_user_id = attempt.auth_user_id
    and identifier_type = 'EMAIL' and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  select * into auth_user from auth.users where id = attempt.auth_user_id;
  if identifier.identifier_id is null or identifier.status <> 'VERIFICATION_PENDING'
     or identifier.revision <> attempt.identifier_revision
     or identifier.player_id <> attempt.player_id or identifier.auth_user_id <> attempt.auth_user_id
     or email_identifier.identifier_id is null
     or lower(btrim(coalesce(auth_user.email, ''))) <> email_identifier.normalized_value_private
     or nullif(btrim(coalesce(auth_user.phone, '')), '') is not null
     or auth_user.phone_confirmed_at is not null
     or participant_identity.canonical_auth_phone(nullif(auth_user.phone_change, ''))
       is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
     or not exists (select 1 from participant_identity.user_player_links link
       where link.player_id = attempt.player_id and link.auth_user_id = attempt.auth_user_id and link.status = 'ACTIVE')
     or not exists (select 1 from scoring_authority.tournament_players membership
       where membership.tournament_id = attempt.tournament_id and membership.player_id = attempt.player_id
         and membership.participation_status = 'ACTIVE')
     or exists (select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
       and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
         or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private))) then
    update participant_identity.participant_phone_otp_attempts set status = 'CANCELLED', safe_reason = 'AUTHORITY_MISMATCH', updated_at = now()
    where attempt_id = target_attempt;
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  return jsonb_build_object('ok', true, 'allowed', true, 'code', 'PHONE_OTP_VERIFY_ALLOWED',
    'attemptId', attempt.attempt_id, 'tournamentId', attempt.tournament_id,
    'playerId', attempt.player_id, 'authUserId', attempt.auth_user_id,
    'phoneE164', identifier.normalized_value_private,
    'emailNormalized', email_identifier.normalized_value_private,
    'expiresAt', attempt.expires_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.begin_participant_phone_public_request(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'pg_temp'
AS $function$
declare client_hash text := lower(btrim(coalesce(input->>'client_fingerprint', '')));
declare identifier_hash text := lower(btrim(coalesce(input->>'identifier_fingerprint', '')));
declare recent_client integer := 0;
declare recent_identifier integer := 0;
declare cooldown_seconds integer := 0;
declare allowed_value boolean := false;
begin
  if client_hash !~ '^[0-9a-f]{64}$' or identifier_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('participant-phone-public:' || client_hash, 0));
  delete from participant_identity.participant_auth_public_rate_events
  where occurred_at < now() - interval '30 days';
  select greatest(0, ceil(extract(epoch from ((max(occurred_at) + interval '60 seconds') - now())))::integer)
    into cooldown_seconds
  from participant_identity.participant_auth_public_rate_events
  where outcome = 'REQUEST_ACCEPTED'
    and (client_fingerprint = client_hash or identifier_fingerprint = identifier_hash)
    and occurred_at > now() - interval '60 seconds';
  select count(*) into recent_client
  from participant_identity.participant_auth_public_rate_events
  where client_fingerprint = client_hash and outcome = 'REQUEST_ACCEPTED'
    and occurred_at > now() - interval '1 hour';
  select count(*) into recent_identifier
  from participant_identity.participant_auth_public_rate_events
  where identifier_fingerprint = identifier_hash and outcome = 'REQUEST_ACCEPTED'
    and occurred_at > now() - interval '1 hour';
  allowed_value := cooldown_seconds = 0 and recent_client < 6 and recent_identifier < 3;
  insert into participant_identity.participant_auth_public_rate_events (
    auth_method, client_fingerprint, identifier_fingerprint, outcome
  ) values (
    'PHONE', client_hash, identifier_hash,
    case when allowed_value then 'REQUEST_ACCEPTED' else 'RATE_LIMITED' end
  );
  return jsonb_build_object(
    'ok', true, 'allowed', allowed_value,
    'code', case when allowed_value then 'PHONE_LOGIN_PUBLIC_REQUEST_ALLOWED'
      when cooldown_seconds > 0 then 'PHONE_OTP_COOLDOWN' else 'PHONE_OTP_RATE_LIMITED' end,
    'retryAfterSeconds', cooldown_seconds,
    'limits', jsonb_build_object('cooldownSeconds', 60, 'identifierPerHour', 3, 'clientPerHour', 6)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_participant_phone_login(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'pg_temp'
AS $function$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare changed integer := 0;
begin
  if target_attempt is null or expected_auth_user is null then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
  end if;
  update participant_identity.participant_phone_otp_attempts set
    status = 'CANCELLED', safe_reason = 'PARTICIPANT_CHANGED_AUTH_METHOD', updated_at = now()
  where attempt_id = target_attempt and auth_user_id = expected_auth_user
    and status in ('REQUESTING', 'SENT');
  get diagnostics changed = row_count;
  return jsonb_build_object('ok', true, 'cancelled', changed = 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_disabled_net_skins_operational_state(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  jobs_removed integer := 0;
  snapshots_retired integer := 0;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  delete from scoring_authority.competition_recalculation_jobs j
  using scoring_authority.net_skins_configurations c
  where j.tournament_id = target_tournament and j.engine_key = 'NET_SKINS'
    and c.tournament_id = j.tournament_id and c.round_number = j.round_number and not c.enabled;
  get diagnostics jobs_removed = row_count;
  update scoring_authority.competition_derived_snapshots s set is_current = false
  from scoring_authority.net_skins_configurations c
  where s.tournament_id = target_tournament and s.engine_key = 'NET_SKINS' and s.is_current
    and c.tournament_id = s.tournament_id and c.round_number = s.round_number and not c.enabled;
  get diagnostics snapshots_retired = row_count;
  return jsonb_build_object('ok', true, 'jobs_removed', jobs_removed, 'snapshots_retired', snapshots_retired);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_participant_phone_enrollment(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'pg_temp'
AS $function$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare returned_auth_user uuid := nullif(input->>'returned_auth_user_id', '')::uuid;
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt and auth_user_id = actor_auth_user and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_SESSION_REQUIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' or attempt.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  if returned_auth_user is null or returned_auth_user <> attempt.auth_user_id then
    update participant_identity.participant_phone_otp_attempts set status = 'UUID_MISMATCH', safe_reason = 'PHONE_OTP_AUTH_MISMATCH', updated_at = now()
    where attempt_id = target_attempt;
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers where identifier_id = attempt.identifier_id for update;
  select * into email_identifier from participant_identity.participant_auth_identifiers
  where player_id = attempt.player_id and auth_user_id = attempt.auth_user_id
    and identifier_type = 'EMAIL' and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  select * into auth_user from auth.users where id = attempt.auth_user_id;
  if identifier.identifier_id is null or identifier.status <> 'VERIFICATION_PENDING'
     or identifier.revision <> attempt.identifier_revision
     or identifier.player_id <> attempt.player_id or identifier.auth_user_id <> attempt.auth_user_id
     or email_identifier.identifier_id is null
     or lower(btrim(coalesce(auth_user.email, ''))) <> email_identifier.normalized_value_private
     or participant_identity.canonical_auth_phone(nullif(auth_user.phone, ''))
       is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
     or auth_user.phone_confirmed_at is null
     or nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null
     or not exists (select 1 from participant_identity.user_player_links link
       where link.player_id = attempt.player_id and link.auth_user_id = attempt.auth_user_id and link.status = 'ACTIVE')
     or (select count(*) from auth.identities identity where identity.user_id = attempt.auth_user_id and identity.provider = 'phone') <> 1
     or exists (select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
       and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
         or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private))) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  update participant_identity.participant_phone_otp_attempts set status = 'VERIFIED',
    safe_reason = 'SAME_AUTH_USER_PHONE_CHANGE_VERIFIED', verification_duration_ms = duration_value,
    verified_at = now(), used_at = now(), updated_at = now()
  where attempt_id = target_attempt and status = 'SENT';
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  update participant_identity.participant_auth_identifiers set status = 'VERIFIED', verified_at = now(),
    verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY', updated_by = 'SUPABASE_AUTH_PHONE_CHANGE', updated_at = now()
  where identifier_id = attempt.identifier_id and revision = attempt.identifier_revision and status = 'VERIFICATION_PENDING';
  if not found then raise exception 'Phone ownership changed during verification.'; end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    'PHONE_ENROLLMENT_VERIFIED', attempt.tournament_id, attempt.auth_user_id,
    attempt.player_id, attempt.player_id, 'Authenticated participant', attempt.attempt_id::text,
    jsonb_build_object('method', 'AUTHENTICATED_PHONE_CHANGE', 'returnedAuthUserMatch', true,
      'playerIdUnchanged', true, 'emailPreserved', true, 'durationMs', duration_value,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'sameAuthUser', true,
    'playerId', attempt.player_id, 'emailPreserved', true, 'activeLink', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspect_participant_auth_identifier_foundation(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'pg_temp'
AS $function$
declare target_tournament text := btrim(coalesce(target_tournament_id, ''));
declare result jsonb;
begin
  if target_tournament = '' then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED');
  end if;

  with roster as (
    select membership.player_id, link.auth_user_id
    from scoring_authority.tournament_players membership
    left join participant_identity.user_player_links link
      on link.player_id = membership.player_id
     and link.status = 'ACTIVE'
    where membership.tournament_id = target_tournament
      and membership.participation_status = 'ACTIVE'
  ), readiness as (
    select
      roster.player_id,
      roster.auth_user_id,
      email_identifier.identifier_id as email_identifier_id,
      phone_identifier.identifier_id as phone_identifier_id,
      phone_identifier.status as phone_status,
      case
        when phone_identifier.identifier_id is null then false
        when phone_identifier.auth_user_id <> roster.auth_user_id then true
        when exists (
          select 1 from auth.users other_user
          where other_user.id <> roster.auth_user_id
            and (
              other_user.phone = phone_identifier.normalized_value_private
              or other_user.phone_change = phone_identifier.normalized_value_private
            )
        ) then true
        else false
      end as auth_user_mismatch
    from roster
    left join lateral (
      select identifier.identifier_id
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = roster.player_id
        and identifier.auth_user_id = roster.auth_user_id
        and identifier.identifier_type = 'EMAIL'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      limit 1
    ) email_identifier on true
    left join lateral (
      select identifier.*
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = roster.player_id
        and identifier.identifier_type = 'PHONE'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      order by identifier.updated_at desc
      limit 1
    ) phone_identifier on true
  )
  select jsonb_build_object(
    'ok', true,
    'tournamentId', target_tournament,
    'eligiblePlayers', count(*),
    'authLinkedPlayers', count(*) filter (where auth_user_id is not null),
    'emailOwnership', count(*) filter (where email_identifier_id is not null),
    'emailBackfillMismatches', count(*) filter (
      where auth_user_id is not null and email_identifier_id is null
    ),
    'phoneConfigured', count(*) filter (where phone_identifier_id is not null),
    'phoneEligibleUnverified', count(*) filter (where phone_status = 'ELIGIBLE'),
    'phoneVerificationPending', count(*) filter (where phone_status = 'VERIFICATION_PENDING'),
    'phoneVerified', count(*) filter (where phone_status = 'VERIFIED'),
    'phoneRevoked', (
      select count(*)
      from participant_identity.participant_auth_identifiers identifier
      join roster current_roster on current_roster.player_id = identifier.player_id
      where identifier.identifier_type = 'PHONE' and identifier.status = 'REVOKED'
    ),
    'duplicatePhone', (
      select count(*) from (
        select identifier.normalized_value_private
        from participant_identity.participant_auth_identifiers identifier
        where identifier.identifier_type = 'PHONE'
          and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        group by identifier.normalized_value_private
        having count(*) > 1
      ) duplicates
    ),
    'invalidPhone', (
      select count(*)
      from participant_identity.participant_auth_identifiers identifier
      where identifier.identifier_type = 'PHONE'
        and identifier.normalized_value_private !~ '^\+[1-9][0-9]{7,14}$'::text collate "C"
    ),
    'authUserMismatch', count(*) filter (where auth_user_mismatch),
    'playerLinkParity', count(*) filter (
      where auth_user_id is not null and email_identifier_id is null
    ) = 0
  ) into result
  from readiness;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspect_participant_auth_phone_link_alignment(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'pg_temp'
AS $function$
declare target_tournament text := btrim(coalesce(target_tournament_id, ''));
declare result jsonb;
begin
  if target_tournament = '' then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED');
  end if;

  with phone_rows as (
    select
      phone_identifier.player_id,
      phone_identifier.status as phone_status,
      link.auth_user_id as link_auth_user_id,
      email_identifier.auth_user_id as email_auth_user_id,
      phone_identifier.auth_user_id as phone_auth_user_id,
      auth_user.phone as auth_phone,
      auth_user.phone_change as auth_phone_change,
      phone_identifier.normalized_value_private as phone_e164,
      exists (
        select 1 from auth.users other_user
        where other_user.id <> link.auth_user_id
          and (
            other_user.phone = phone_identifier.normalized_value_private
            or other_user.phone_change = phone_identifier.normalized_value_private
          )
      ) as other_auth_collision
    from participant_identity.participant_auth_identifiers phone_identifier
    join scoring_authority.tournament_players membership
      on membership.tournament_id = target_tournament
     and membership.player_id = phone_identifier.player_id
     and membership.participation_status = 'ACTIVE'
    left join participant_identity.user_player_links link
      on link.player_id = phone_identifier.player_id
     and link.status = 'ACTIVE'
    left join participant_identity.participant_auth_identifiers email_identifier
      on email_identifier.player_id = phone_identifier.player_id
     and email_identifier.identifier_type = 'EMAIL'
     and email_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
    left join auth.users auth_user on auth_user.id = link.auth_user_id
    where phone_identifier.identifier_type = 'PHONE'
      and phone_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  )
  select jsonb_build_object(
    'ok', true,
    'configuredPhoneCount', count(*),
    'mismatchCount', count(*) filter (
      where link_auth_user_id is null
        or email_auth_user_id is distinct from link_auth_user_id
        or phone_auth_user_id is distinct from link_auth_user_id
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'playerId', player_id,
      'phoneStatus', phone_status,
      'playerIdMatch', link_auth_user_id is not null,
      'linkAuthLabel', case when link_auth_user_id is null then 'NONE' else 'AUTH-UID-A' end,
      'emailAuthLabel', case
        when email_auth_user_id is null then 'NONE'
        when email_auth_user_id = link_auth_user_id then 'AUTH-UID-A'
        else 'AUTH-UID-OTHER'
      end,
      'phoneAuthLabel', case
        when phone_auth_user_id is null then 'NONE'
        when phone_auth_user_id = link_auth_user_id then 'AUTH-UID-A'
        else 'AUTH-UID-OTHER'
      end,
      'emailAuthUserMatch', email_auth_user_id = link_auth_user_id,
      'phoneAuthUserMatch', phone_auth_user_id = link_auth_user_id,
      'otherAuthUserCollision', other_auth_collision,
      'expectedAuthPhoneState', case
        when nullif(btrim(coalesce(auth_phone, '')), '') is null then 'UNSET'
        when auth_phone = phone_e164 then 'MATCH'
        else 'CONFLICT'
      end,
      'expectedAuthPhoneChangeState', case
        when nullif(btrim(coalesce(auth_phone_change, '')), '') is null then 'UNSET'
        when auth_phone_change = phone_e164 then 'MATCH'
        else 'CONFLICT'
      end
    ) order by player_id), '[]'::jsonb)
  ) into result
  from phone_rows;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspect_participant_identity_tournament_resolution(target_auth_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare link_row participant_identity.user_player_links%rowtype;
declare selected_tournament text;
declare candidates jsonb;
begin
  select * into link_row
  from participant_identity.user_player_links
  where auth_user_id = target_auth_user_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;

  selected_tournament := participant_identity.resolve_approved_participant_tournament(target_auth_user_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'tournamentId', tournament.tournament_id,
    'tournamentYear', tournament.tournament_year,
    'tournamentName', tournament.name,
    'membershipStatus', membership.participation_status,
    'approvedIdentityConfiguration', contact.tournament_id is not null and exists (
      select 1
      from participant_identity.identity_config_import_runs run
      join participant_identity.identity_context_revisions revision
        on revision.tournament_id = run.tournament_id
       and revision.configuration_fingerprint = run.source_fingerprint
      where run.tournament_id = tournament.tournament_id and run.status = 'APPROVED'
    ),
    'selected', tournament.tournament_id = selected_tournament
  ) order by tournament.tournament_year, tournament.tournament_id), '[]'::jsonb)
  into candidates
  from scoring_authority.tournament_players membership
  join scoring_authority.tournaments tournament
    on tournament.tournament_id = membership.tournament_id
  left join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = membership.tournament_id
   and contact.player_id = membership.player_id
   and contact.identity_active
   and link_row.email_identity_hash = encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex')
  where membership.player_id = link_row.player_id
    and membership.participation_status = 'ACTIVE';

  return jsonb_build_object(
    'ok', selected_tournament is not null,
    'code', case when selected_tournament is null then 'APPROVED_TOURNAMENT_CONTEXT_REQUIRED' else 'RESOLVED' end,
    'playerId', link_row.player_id,
    'selectedTournamentId', selected_tournament,
    'candidates', candidates
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_claim_is_current(target_tournament text, target_engine text, target_claim timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'pg_temp'
AS $function$
  select exists(select 1 from scoring_authority.competition_recalculation_jobs j where j.tournament_id=target_tournament
    and j.round_number=0 and j.engine_key=target_engine and j.status='RUNNING' and j.started_at=target_claim)
$function$;

CREATE OR REPLACE FUNCTION public.read_calcutta_configuration_view(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  tournament_value jsonb;
  configuration_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;
  select to_jsonb(c) - 'source_workbook_id' into configuration_value
  from scoring_authority.calcutta_configurations c
  where c.tournament_id = target_tournament and c.is_current and c.status = 'APPROVED';
  if configuration_value is null then return jsonb_build_object('ok', false, 'code', 'CALCUTTA_CONFIGURATION_REQUIRED'); end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'configuration', configuration_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_championship_odds_inputs(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare started timestamptz:=clock_timestamp(); config jsonb; current_state jsonb;
begin
  select to_jsonb(c) into config from scoring_authority.odds_input_configurations c where c.tournament_id=target_tournament_id and c.is_current;
  if config is null then return jsonb_build_object('ok',false,'code','ODDS_INPUT_CONFIGURATION_REQUIRED'); end if;
  current_state:=public.read_leaderboards_core_view(target_tournament_id);
  if coalesce((current_state->>'ok')::boolean,false) is not true then return current_state; end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('input_configuration',config,'current_state',current_state->'data',
    'query_ms',round(extract(epoch from(clock_timestamp()-started))*1000,3)));
end; $function$;

CREATE OR REPLACE FUNCTION public.read_competition_derived_state(target_tournament_id text, target_engine_keys text[] DEFAULT ARRAY['TEAM_MOMENTUM'::text, 'TOURNAMENT_STORYLINES'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  snapshots_value jsonb;
  jobs_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  if not exists (select 1 from scoring_authority.tournaments t where t.tournament_id = target_tournament) then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'engine_key', s.engine_key, 'engine_version', s.engine_version,
    'configuration_fingerprint', s.configuration_fingerprint,
    'source_fingerprint', s.source_fingerprint, 'result_state', s.result_state,
    'result_payload', s.result_payload, 'payload_hash', s.payload_hash,
    'calculated_at', s.calculated_at, 'published_at', s.published_at
  ) order by s.engine_key), '[]'::jsonb) into snapshots_value
  from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.round_number = 0
    and s.engine_key = any(target_engine_keys) and s.is_current;
  select coalesce(jsonb_agg(jsonb_build_object(
    'engine_key', j.engine_key, 'status', j.status,
    'requested_source_revision', j.requested_source_revision,
    'attempts', j.attempts, 'requested_at', j.requested_at,
    'started_at', j.started_at, 'completed_at', j.completed_at,
    'last_error_code', j.last_error_code
  ) order by j.engine_key), '[]'::jsonb) into jobs_value
  from scoring_authority.competition_recalculation_jobs j
  where j.tournament_id = target_tournament and j.round_number = 0
    and j.engine_key = any(target_engine_keys);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament_id', target_tournament, 'snapshots', snapshots_value, 'jobs', jobs_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_game_center_view(target_match_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  match_row scoring_authority.matches%rowtype;
  presentation_row scoring_authority.game_center_presentations%rowtype;
  tournament_value jsonb;
  round_value jsonb;
  snapshot_value jsonb;
  teams_value jsonb;
  participants_value jsonb;
  permissions_value jsonb;
  holes_value jsonb;
  scores_value jsonb;
  navigation_value jsonb;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match_id, ''));
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select * into presentation_row from scoring_authority.game_center_presentations where match_id = match_row.match_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_CENTER_PRESENTATION_NOT_IMPORTED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = match_row.tournament_id;
  select to_jsonb(r) into round_value from scoring_authority.rounds r where r.tournament_id = match_row.tournament_id and r.round_number = match_row.round_number;
  select to_jsonb(s) into snapshot_value from scoring_authority.scoring_snapshots s where s.snapshot_id = match_row.scoring_snapshot_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.team_side), '[]'::jsonb) into teams_value
    from scoring_authority.teams t where t.tournament_id = match_row.tournament_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
    'player_slot', mp.player_slot, 'handicap_index', mp.handicap_index,
    'course_handicap', mp.course_handicap, 'playing_handicap', mp.playing_handicap,
    'final_strokes', mp.final_strokes
  ) order by mp.team_side, mp.player_slot), '[]'::jsonb) into participants_value
    from scoring_authority.match_participants mp join scoring_authority.players p using (player_id)
    where mp.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(sp) order by sp.player_id), '[]'::jsonb) into permissions_value
    from scoring_authority.scoring_permissions sp where sp.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(mh) order by mh.hole_number), '[]'::jsonb) into holes_value
    from scoring_authority.match_holes mh where mh.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(hs) order by hs.hole_number), '[]'::jsonb) into scores_value
    from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id;

  with ordered as (
    select m.match_id, m.round_number, p.display_match_number, p.match_sort_order,
      lag(m.match_id) over (order by m.round_number, p.match_sort_order, m.match_id) as previous_id,
      lead(m.match_id) over (order by m.round_number, p.match_sort_order, m.match_id) as next_id,
      row_number() over (partition by m.round_number order by p.match_sort_order, m.match_id) as round_position,
      count(*) over (partition by m.round_number) as round_total
    from scoring_authority.matches m
    join scoring_authority.game_center_presentations p using (match_id)
    where m.tournament_id = match_row.tournament_id
  ), selected as (
    select * from ordered where match_id = match_row.match_id
  ) select jsonb_build_object(
    'previous', case when s.previous_id is null then null else jsonb_build_object(
      'id', s.previous_id, 'label', 'Round ' || pm.round_number || ', Match ' || pp.display_match_number) end,
    'next', case when s.next_id is null then null else jsonb_build_object(
      'id', s.next_id, 'label', 'Round ' || nm.round_number || ', Match ' || np.display_match_number) end,
    'position', jsonb_build_object('round', s.round_number, 'index', s.round_position, 'total', s.round_total)
  ) into navigation_value from selected s
    left join scoring_authority.matches pm on pm.match_id = s.previous_id
    left join scoring_authority.game_center_presentations pp on pp.match_id = s.previous_id
    left join scoring_authority.matches nm on nm.match_id = s.next_id
    left join scoring_authority.game_center_presentations np on np.match_id = s.next_id;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'round', round_value, 'match', to_jsonb(match_row),
    'snapshot', snapshot_value, 'teams', teams_value, 'participants', participants_value,
    'permissions', permissions_value, 'holes', holes_value, 'scores', scores_value,
    'presentation', to_jsonb(presentation_row), 'navigation', navigation_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_leaderboards_core_view(target_tournament_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  tournament_value jsonb;
  teams_value jsonb;
  players_value jsonb;
  rounds_value jsonb;
  matches_value jsonb;
  presentation_value jsonb;
  source_revision_value jsonb;
begin
  if target_tournament = '' then
    select hp.tournament_id into target_tournament
    from scoring_authority.participant_home_presentations hp
    join scoring_authority.tournaments t on t.tournament_id = hp.tournament_id
    where exists (
      select 1 from scoring_authority.matches m
      where m.tournament_id = hp.tournament_id
    )
    order by hp.imported_at desc, t.tournament_year desc, hp.tournament_id desc
    limit 1;
  end if;
  if coalesce(target_tournament, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'PUBLISHED_TOURNAMENT_NOT_FOUND');
  end if;

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb)
    into teams_value
  from scoring_authority.teams team where team.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.player_id,
    'display_name', p.display_name,
    'source_payload', p.source_payload,
    'presentation', coalesce((select hp.presentation -> 'leaderboardsPlayers' -> p.player_id
      from scoring_authority.participant_home_presentations hp
      where hp.tournament_id = target_tournament), '{}'::jsonb),
    'team_id', tp.team_id,
    'team_side', tp.team_side,
    'participation_status', tp.participation_status,
    'tournament_source_payload', tp.source_payload
  ) order by tp.team_side, p.display_name, p.player_id), '[]'::jsonb)
    into players_value
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  where tp.tournament_id = target_tournament and tp.participation_status = 'ACTIVE';

  select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number), '[]'::jsonb)
    into rounds_value
  from scoring_authority.rounds r where r.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object(
      'snapshot_id', ss.snapshot_id,
      'snapshot_revision', ss.snapshot_revision,
      'canonical_hash', ss.canonical_hash,
      'course_id', ss.course_id,
      'tee', ss.tee,
      'par', ss.par,
      'rating', ss.rating,
      'slope', ss.slope,
      'format', ss.format,
      'team_configuration', ss.team_configuration,
      'participant_configuration', ss.participant_configuration
    ),
    'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id,
      'display_name', p.display_name,
      'source_payload', p.source_payload,
      'team_side', mp.team_side,
      'player_slot', mp.player_slot,
      'handicap_index', mp.handicap_index,
      'course_handicap', mp.course_handicap,
      'playing_handicap', mp.playing_handicap,
      'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp
      join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', mh.hole_number,
      'stroke_index', mh.stroke_index,
      'par', mh.par,
      'yardage', mh.yardage
    ) order by mh.hole_number)
      from scoring_authority.match_holes mh where mh.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number,
      'hole_revision', hs.hole_revision,
      'team_1_gross_scores', hs.team_1_gross_scores,
      'team_2_gross_scores', hs.team_2_gross_scores,
      'team_1_strokes', hs.team_1_strokes,
      'team_2_strokes', hs.team_2_strokes,
      'team_1_net_score', hs.team_1_net_score,
      'team_2_net_score', hs.team_2_net_score,
      'hole_winner', hs.hole_winner,
      'updated_at', hs.updated_at
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb)
    into matches_value
  from scoring_authority.matches m
  join scoring_authority.rounds r
    on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select to_jsonb(hp) into presentation_value
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament;

  select jsonb_build_object(
    'tournamentId', target_tournament,
    'presentationFingerprint', coalesce((select hp.source_fingerprint
      from scoring_authority.participant_home_presentations hp
      where hp.tournament_id = target_tournament), ''),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id,
      'matchRevision', m.match_revision,
      'status', m.status,
      'scoringLocked', m.scoring_locked,
      'scorecardComplete', m.scorecard_complete,
      'finalizedAt', m.finalized_at
    ) order by m.match_id)
      from scoring_authority.matches m where m.tournament_id = target_tournament), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', hs.match_id,
      'holeNumber', hs.hole_number,
      'holeRevision', hs.hole_revision
    ) order by hs.match_id, hs.hole_number)
      from scoring_authority.hole_scores hs
      join scoring_authority.matches m on m.match_id = hs.match_id
      where m.tournament_id = target_tournament), '[]'::jsonb)
  ) into source_revision_value;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'teams', teams_value,
    'players', players_value,
    'rounds', rounds_value,
    'matches', matches_value,
    'tournament_presentation', presentation_value,
    'source_revision', source_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_match_authorization_matrix(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'participant_identity', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  tournament_key text := btrim(coalesce(target_tournament_id, ''));
  decisions jsonb;
begin
  select coalesce(jsonb_agg(
    scoring_authority.match_access_decision(tournament_key, tp.player_id, m.match_id, action_name)
    order by tp.player_id, m.match_id, action_name
  ), '[]'::jsonb) into decisions
  from scoring_authority.tournament_players tp
  cross join scoring_authority.matches m
  cross join unnest(array['START_SCORING','VIEW_FINAL_SCORECARD','VIEW_GAME_CENTER','VIEW_MATCH']) action_name
  where tp.tournament_id = tournament_key and tp.participation_status = 'ACTIVE'
    and m.tournament_id = tournament_key;
  return jsonb_build_object(
    'ok', true,
    'tournament_id', tournament_key,
    'decisions', decisions,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_my_match_view(target_tournament_id text, target_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'participant_identity', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  target_player text := btrim(coalesce(target_player_id, ''));
  tournament_value jsonb;
  player_value jsonb;
  tournament_player_value jsonb;
  team_value jsonb;
  teams_value jsonb;
  matches_value jsonb;
  current_round_value integer;
  context_revision_value bigint;
  expected_matches integer;
  presented_matches integer;
begin
  if target_tournament = '' or target_player = '' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_PARTICIPANT_CONTEXT_REQUIRED');
  end if;

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t
  where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select to_jsonb(p), to_jsonb(tp), to_jsonb(team)
    into player_value, tournament_player_value, team_value
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  join scoring_authority.teams team on team.tournament_id = tp.tournament_id and team.team_id = tp.team_id
  where tp.tournament_id = target_tournament and tp.player_id = target_player
    and tp.participation_status = 'ACTIVE';
  if player_value is null then return jsonb_build_object('ok', false, 'code', 'ACTIVE_TOURNAMENT_PLAYER_REQUIRED'); end if;

  select count(*) into expected_matches
  from scoring_authority.match_participants mp
  join scoring_authority.matches m on m.match_id = mp.match_id
  where mp.player_id = target_player and m.tournament_id = target_tournament;

  select count(*) into presented_matches
  from scoring_authority.match_participants mp
  join scoring_authority.matches m on m.match_id = mp.match_id
  join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where mp.player_id = target_player and m.tournament_id = target_tournament;
  if presented_matches <> expected_matches then
    return jsonb_build_object('ok', false, 'code', 'MY_MATCH_PRESENTATION_NOT_IMPORTED');
  end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb)
    into teams_value
  from scoring_authority.teams team
  where team.tournament_id = target_tournament;

  select coalesce(max(m.round_number) filter (where m.status <> 'FINAL'), max(m.round_number), 0)
    into current_round_value
  from scoring_authority.matches m
  where m.tournament_id = target_tournament;

  select coalesce(cr.context_revision, 0) into context_revision_value
  from participant_identity.identity_context_revisions cr
  where cr.tournament_id = target_tournament;
  context_revision_value := coalesce(context_revision_value, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object('snapshot_id', ss.snapshot_id, 'course_id', ss.course_id, 'tee', ss.tee),
    'presentation', to_jsonb(gp),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', participant.player_id,
      'display_name', participant_player.display_name,
      'team_side', participant.team_side,
      'player_slot', participant.player_slot
    ) order by participant.team_side, participant.player_slot)
      from scoring_authority.match_participants participant
      join scoring_authority.players participant_player on participant_player.player_id = participant.player_id
      where participant.match_id = m.match_id), '[]'::jsonb),
    'permission', (select to_jsonb(sp)
      from scoring_authority.scoring_permissions sp
      where sp.match_id = m.match_id and sp.player_id = target_player),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number,
      'hole_winner', hs.hole_winner
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, gp.match_sort_order, m.match_id), '[]'::jsonb)
    into matches_value
  from scoring_authority.match_participants own_participation
  join scoring_authority.matches m on m.match_id = own_participation.match_id
  join scoring_authority.rounds r on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where own_participation.player_id = target_player and m.tournament_id = target_tournament;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'player', player_value,
    'tournament_player', tournament_player_value,
    'team', team_value,
    'teams', teams_value,
    'current_round', current_round_value,
    'context_revision', context_revision_value,
    'matches', matches_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_net_skins_input_view(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  tournament_value jsonb;
  config_value jsonb;
  players_value jsonb;
  matches_value jsonb;
  source_revision_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'configuration', to_jsonb(c),
    'entries', coalesce((select jsonb_agg(to_jsonb(e) order by e.entry_id)
      from scoring_authority.net_skins_configuration_entries e
      where e.tournament_id = c.tournament_id and e.round_number = c.round_number), '[]'::jsonb)
  ) order by c.round_number), '[]'::jsonb) into config_value
  from scoring_authority.net_skins_configurations c
  where c.tournament_id = target_tournament and c.enabled;
  if jsonb_array_length(config_value) = 0 then return jsonb_build_object('ok', false, 'code', 'NET_SKINS_CONFIGURATION_REQUIRED'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', p.player_id, 'display_name', p.display_name)
    order by p.display_name, p.player_id), '[]'::jsonb) into players_value
  from scoring_authority.tournament_players tp join scoring_authority.players p on p.player_id = tp.player_id
  where tp.tournament_id = target_tournament and tp.participation_status = 'ACTIVE';

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m), 'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id, 'display_name', p.display_name,
      'team_side', mp.team_side, 'player_slot', mp.player_slot,
      'playing_handicap', mp.playing_handicap, 'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', mh.hole_number, 'stroke_index', mh.stroke_index, 'par', mh.par
    ) order by mh.hole_number) from scoring_authority.match_holes mh where mh.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number, 'hole_revision', hs.hole_revision,
      'team_1_gross_scores', hs.team_1_gross_scores, 'team_2_gross_scores', hs.team_2_gross_scores,
      'team_1_strokes', hs.team_1_strokes, 'team_2_strokes', hs.team_2_strokes,
      'team_1_net_score', hs.team_1_net_score, 'team_2_net_score', hs.team_2_net_score
    ) order by hs.hole_number) from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb) into matches_value
  from scoring_authority.matches m
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select jsonb_build_object(
    'tournamentId', target_tournament,
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id, 'round', m.round_number, 'matchRevision', m.match_revision,
      'status', m.status, 'finalizedAt', m.finalized_at, 'scorecardComplete', m.scorecard_complete,
      'resultWinner', m.result_winner) order by m.match_id)
      from scoring_authority.matches m where m.tournament_id = target_tournament), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', hs.match_id, 'hole', hs.hole_number, 'revision', hs.hole_revision)
      order by hs.match_id, hs.hole_number)
      from scoring_authority.hole_scores hs join scoring_authority.matches m on m.match_id = hs.match_id
      where m.tournament_id = target_tournament), '[]'::jsonb)
  ) into source_revision_value;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'configurations', config_value, 'players', players_value,
    'matches', matches_value, 'source_revision', source_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_net_skins_result_view(target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  snapshots_value jsonb;
  jobs_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'round_number', s.round_number, 'engine_version', s.engine_version,
    'configuration_fingerprint', s.configuration_fingerprint, 'source_fingerprint', s.source_fingerprint,
    'result_state', s.result_state, 'result_payload', s.result_payload,
    'payload_hash', s.payload_hash, 'calculated_at', s.calculated_at, 'published_at', s.published_at
  ) order by s.round_number), '[]'::jsonb) into snapshots_value
  from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.engine_key = 'NET_SKINS' and s.is_current;
  select coalesce(jsonb_agg(to_jsonb(j) order by j.round_number), '[]'::jsonb) into jobs_value
  from scoring_authority.competition_recalculation_jobs j
  where j.tournament_id = target_tournament and j.engine_key = 'NET_SKINS';
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament_id', target_tournament, 'snapshots', snapshots_value, 'jobs', jobs_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_auth_phone_eligibility(target_phone_e164 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'pg_temp'
AS $function$
declare target_phone text := btrim(coalesce(target_phone_e164, ''));
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare link_row participant_identity.user_player_links%rowtype;
declare target_tournament text;
begin
  if target_phone !~ '^\+[1-9][0-9]{7,14}$'::text collate "C" then
    return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_NOT_ELIGIBLE');
  end if;
  select * into identifier
  from participant_identity.participant_auth_identifiers
  where identifier_type = 'PHONE' and normalized_value_private = target_phone
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  if not found then return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_NOT_ELIGIBLE'); end if;
  select * into link_row from participant_identity.user_player_links
  where auth_user_id = identifier.auth_user_id and player_id = identifier.player_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_OWNERSHIP_INACTIVE'); end if;
  if exists (
    select 1 from auth.users auth_user
    where auth_user.id <> identifier.auth_user_id
      and (auth_user.phone = target_phone or auth_user.phone_change = target_phone)
  ) then
    return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_AUTH_COLLISION');
  end if;
  target_tournament := participant_identity.resolve_approved_participant_tournament(identifier.auth_user_id);
  if target_tournament is null or not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = target_tournament
      and membership.player_id = identifier.player_id
      and membership.participation_status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_TOURNAMENT_INELIGIBLE');
  end if;
  return jsonb_build_object('ok', true, 'eligible', true, 'code', 'PHONE_ELIGIBLE',
    'identifierId', identifier.identifier_id, 'authUserId', identifier.auth_user_id,
    'playerId', identifier.player_id, 'tournamentId', target_tournament,
    'status', identifier.status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_home_view(target_tournament_id text, target_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'participant_identity', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  target_player text := btrim(coalesce(target_player_id, ''));
  tournament_value jsonb;
  teams_value jsonb;
  rounds_value jsonb;
  matches_value jsonb;
  participant_value jsonb;
  home_presentation_value jsonb;
  live_revision_value jsonb;
begin
  if target_tournament = '' or target_player = '' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_PARTICIPANT_CONTEXT_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players tp
    where tp.tournament_id = target_tournament and tp.player_id = target_player
      and tp.participation_status = 'ACTIVE'
  ) then return jsonb_build_object('ok', false, 'code', 'ACTIVE_TOURNAMENT_PLAYER_REQUIRED'); end if;

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  participant_value := public.read_my_match_view(target_tournament, target_player);
  if not coalesce((participant_value->>'ok')::boolean, false) then return participant_value; end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb) into teams_value
  from scoring_authority.teams team where team.tournament_id = target_tournament;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number), '[]'::jsonb) into rounds_value
  from scoring_authority.rounds r where r.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object('snapshot_id', ss.snapshot_id, 'course_id', ss.course_id, 'tee', ss.tee,
      'par', ss.par, 'rating', ss.rating, 'slope', ss.slope, 'team_configuration', ss.team_configuration),
    'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
      'player_slot', mp.player_slot, 'playing_handicap', mp.playing_handicap, 'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp
      join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number, 'hole_winner', hs.hole_winner, 'updated_at', hs.updated_at
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb)
  into matches_value
  from scoring_authority.matches m
  join scoring_authority.rounds r on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select to_jsonb(hp) into home_presentation_value
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament;

  select jsonb_build_object(
    'maxMatchRevision', coalesce(max(m.match_revision), 0),
    'totalMatchRevisions', coalesce(sum(m.match_revision), 0),
    'scoredHoles', coalesce(sum(m.scored_holes), 0),
    'finalMatches', count(*) filter (where m.status = 'FINAL'),
    'authorityUpdatedAt', max(m.authority_updated_at)
  ) into live_revision_value
  from scoring_authority.matches m where m.tournament_id = target_tournament;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'teams', teams_value,
    'rounds', rounds_value,
    'matches', matches_value,
    'participant_view', participant_value,
    'home_presentation', home_presentation_value,
    'live_revision', live_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_identity_admin(target_tournament_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'pg_temp'
AS $function$
declare target text := nullif(btrim(coalesce(target_tournament_id, '')), '');
declare result jsonb;
begin
  if target is null then
    select tournament_id into target from scoring_authority.tournaments order by tournament_year desc limit 1;
  end if;
  select jsonb_build_object(
    'tournamentId', target,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', tp.player_id, 'displayName', p.display_name, 'teamId', tp.team_id,
      'participationStatus', tp.participation_status, 'email', c.email,
      'identityActive', coalesce(c.identity_active, false),
      'configurationRevision', c.configuration_revision,
      'verifiedBy', c.verified_by, 'verifiedAt', c.verified_at
    ) order by p.display_name)
      from scoring_authority.tournament_players tp
      join scoring_authority.players p on p.player_id = tp.player_id
      left join participant_identity.participant_identity_contacts c
        on c.tournament_id = tp.tournament_id and c.player_id = tp.player_id
      where tp.tournament_id = target and tp.participation_status = 'ACTIVE'), '[]'::jsonb),
    'latestRun', (select to_jsonb(r) - 'validation_report' || jsonb_build_object('validation_report', r.validation_report)
      from participant_identity.identity_config_import_runs r where r.tournament_id = target order by r.requested_at desc limit 1),
    'contextRevision', (select to_jsonb(cr) from participant_identity.identity_context_revisions cr where cr.tournament_id = target),
    'linkCount', (select count(*) from participant_identity.user_player_links l
      join scoring_authority.tournament_players tp on tp.player_id = l.player_id and tp.tournament_id = target
      where l.status in ('PENDING', 'ACTIVE', 'SUSPENDED'))
  ) into result;
  return jsonb_build_object('ok', true, 'data', result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_identity_context(target_tournament_id text, target_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'pg_temp'
AS $function$
declare result jsonb;
begin
  select jsonb_build_object(
    'playerId', p.player_id, 'displayName', p.display_name,
    'tournament', jsonb_build_object('id', t.tournament_id, 'year', t.tournament_year, 'name', t.name),
    'team', jsonb_build_object('id', team.team_id, 'name', team.name, 'side', team.team_side),
    'membership', jsonb_build_object('active', tp.participation_status = 'ACTIVE', 'status', tp.participation_status),
    'currentRound', (select max(round_number) from scoring_authority.matches m where m.tournament_id = t.tournament_id and m.status in ('LIVE', 'UPCOMING')),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id, 'round', m.round_number, 'format', m.format, 'status', m.status,
      'scoringLocked', m.scoring_locked, 'matchRevision', m.match_revision,
      'canScore', coalesce(sp.can_score, false), 'permissionRevision', sp.permission_revision
    ) order by m.round_number, m.match_id)
      from scoring_authority.match_participants mp
      join scoring_authority.matches m on m.match_id = mp.match_id
      left join scoring_authority.scoring_permissions sp on sp.match_id = m.match_id and sp.player_id = mp.player_id
      where mp.player_id = p.player_id and m.tournament_id = t.tournament_id), '[]'::jsonb),
    'contextRevision', coalesce(cr.context_revision, 0), 'generatedAt', now()
  ) into result
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  join scoring_authority.tournaments t on t.tournament_id = tp.tournament_id
  join scoring_authority.teams team on team.tournament_id = tp.tournament_id and team.team_id = tp.team_id
  left join participant_identity.identity_context_revisions cr on cr.tournament_id = tp.tournament_id
  where tp.tournament_id = btrim(target_tournament_id) and tp.player_id = btrim(target_player_id);
  if result is null then return jsonb_build_object('ok', false, 'code', 'PARTICIPANT_CONTEXT_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'data', result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_identity_context_for_auth(target_auth_user_id uuid, target_tournament_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare link_row participant_identity.user_player_links%rowtype;
declare target_tournament text := nullif(btrim(coalesce(target_tournament_id, '')), '');
declare approved_tournament text;
declare membership_status text;
declare context jsonb;
begin
  select * into link_row
  from participant_identity.user_player_links
  where auth_user_id = target_auth_user_id;

  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  if link_row.status = 'SUSPENDED' then return jsonb_build_object('ok', false, 'code', 'USER_PLAYER_LINK_SUSPENDED'); end if;
  if link_row.status = 'REVOKED' then return jsonb_build_object('ok', false, 'code', 'USER_PLAYER_LINK_REVOKED'); end if;
  if link_row.status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;

  approved_tournament := participant_identity.resolve_approved_participant_tournament(target_auth_user_id);
  if approved_tournament is null then
    return jsonb_build_object('ok', false, 'code', 'APPROVED_TOURNAMENT_CONTEXT_REQUIRED');
  end if;
  if target_tournament is null then target_tournament := approved_tournament; end if;
  if target_tournament <> approved_tournament then
    return jsonb_build_object('ok', false, 'code', 'WRONG_TOURNAMENT');
  end if;

  select participation_status into membership_status
  from scoring_authority.tournament_players
  where tournament_id = target_tournament and player_id = link_row.player_id;
  if membership_status is null then return jsonb_build_object('ok', false, 'code', 'WRONG_TOURNAMENT'); end if;
  if membership_status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_MEMBERSHIP_INACTIVE'); end if;

  context := public.read_participant_identity_context(target_tournament, link_row.player_id);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_phone_enrollment_state(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'auth', 'pg_temp'
AS $function$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare requested_player text := btrim(coalesce(input->>'player_id', ''));
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  if target_tournament = '' or requested_player = '' or actor_auth_user is null
     or not exists (
       select 1 from participant_identity.user_player_links link
       where link.player_id = requested_player and link.auth_user_id = actor_auth_user
         and link.status = 'ACTIVE'
     ) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_SESSION_REQUIRED');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers current_identifier
  where current_identifier.player_id = requested_player
    and current_identifier.auth_user_id = actor_auth_user
    and current_identifier.identifier_type = 'PHONE'
    and current_identifier.source_tournament_id = target_tournament
    and current_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE'); end if;
  if identifier.status = 'VERIFIED' then
    select * into auth_user from auth.users where id = actor_auth_user;
    if auth_user.id is null or auth_user.phone_confirmed_at is null
       or nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null
       or participant_identity.canonical_auth_phone(nullif(auth_user.phone, ''))
         is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
       or (select count(*) from auth.identities identity
         where identity.user_id = actor_auth_user and identity.provider = 'phone') <> 1 then
      return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
    end if;
    return jsonb_build_object('ok', true, 'status', 'VERIFIED');
  end if;
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.identifier_id = identifier.identifier_id
    and current_attempt.auth_user_id = actor_auth_user
    and current_attempt.player_id = requested_player
  order by current_attempt.requested_at desc limit 1;
  if attempt.attempt_id is null or attempt.status <> 'SENT' or attempt.expires_at <= now()
     or identifier.status <> 'VERIFICATION_PENDING' then
    return jsonb_build_object('ok', true, 'status', 'NONE');
  end if;
  return jsonb_build_object(
    'ok', true, 'status', 'VERIFICATION_PENDING', 'attemptId', attempt.attempt_id,
    'maskedMobile', '••• ••• ' || right(participant_identity.canonical_auth_phone(identifier.normalized_value_private), 4),
    'expiresAt', attempt.expires_at,
    'resendCooldownSeconds', greatest(0, ceil(extract(epoch from ((attempt.requested_at + interval '60 seconds') - now())))::integer)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_participant_sms_rollout_readiness(target_tournament_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'participant_identity', 'scoring_authority', 'public', 'auth', 'pg_temp'
AS $function$
declare target_tournament text := nullif(btrim(coalesce(target_tournament_id, '')), '');
begin
  return jsonb_build_object(
    'eligibleParticipants', (select count(*) from scoring_authority.tournament_players p
      where p.participation_status = 'ACTIVE' and (target_tournament is null or p.tournament_id = target_tournament)),
    'phoneConfigured', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'phoneVerified', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status = 'VERIFIED'
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'phoneUnverified', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING')
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'phoneMissing', (select count(*) from scoring_authority.tournament_players p
      where p.participation_status = 'ACTIVE' and (target_tournament is null or p.tournament_id = target_tournament)
        and not exists (select 1 from participant_identity.participant_auth_identifiers i
          where i.player_id = p.player_id and i.identifier_type = 'PHONE'
            and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED'))),
    'phoneRevoked', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status = 'REVOKED'
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'duplicates', (select count(*) from (select normalized_value_private
      from participant_identity.participant_auth_identifiers i where i.identifier_type = 'PHONE'
        and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and (target_tournament is null or i.source_tournament_id = target_tournament)
      group by normalized_value_private having count(*) > 1) duplicate),
    'authMismatch', (select count(*) from participant_identity.participant_auth_identifiers i
      left join participant_identity.user_player_links link
        on link.player_id = i.player_id and link.status = 'ACTIVE'
      left join auth.users auth_user on auth_user.id = i.auth_user_id
      where i.identifier_type = 'PHONE' and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and (target_tournament is null or i.source_tournament_id = target_tournament)
        and (link.auth_user_id is distinct from i.auth_user_id
          or (i.status = 'VERIFIED' and (auth_user.phone_confirmed_at is null
            or participant_identity.canonical_auth_phone(nullif(auth_user.phone, ''))
              is distinct from participant_identity.canonical_auth_phone(i.normalized_value_private)))))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_published_odds_view(target_tournament_id text DEFAULT NULL::text, target_source_workbook_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'scoring_authority', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  started_at timestamptz := clock_timestamp();
  resolved_tournament scoring_authority.tournaments%rowtype;
  snapshot_value jsonb;
  history_count integer;
  published_tournament_count integer;
begin
  if btrim(coalesce(target_tournament_id, '')) <> '' then
    select * into resolved_tournament from scoring_authority.tournaments t
    where t.tournament_id = btrim(target_tournament_id)
      and (btrim(coalesce(target_source_workbook_id, '')) = '' or t.source_workbook_id = btrim(target_source_workbook_id));
  elsif btrim(coalesce(target_source_workbook_id, '')) <> '' then
    select count(distinct t.tournament_id) into published_tournament_count
    from scoring_authority.tournaments t
    join scoring_authority.odds_published_snapshots s on s.tournament_id = t.tournament_id
    where t.source_workbook_id = btrim(target_source_workbook_id)
      and s.is_current_official and s.publication_verified;
    if published_tournament_count <> 1 then
      return jsonb_build_object('ok', false,
        'code', case when published_tournament_count = 0 then 'PUBLISHED_ODDS_TOURNAMENT_NOT_FOUND'
          else 'PUBLISHED_ODDS_TOURNAMENT_AMBIGUOUS' end);
    end if;
    select t.* into resolved_tournament
    from scoring_authority.tournaments t
    join scoring_authority.odds_published_snapshots s on s.tournament_id = t.tournament_id
    where t.source_workbook_id = btrim(target_source_workbook_id)
      and s.is_current_official and s.publication_verified;
  else return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_SCOPE_REQUIRED'); end if;
  if resolved_tournament.tournament_id is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'milestone', s.milestone, 'phase_order', s.phase_order,
    'publication_revision', s.publication_revision, 'published_at', s.published_at,
    'payload', s.published_payload, 'payload_hash', s.payload_hash,
    'source_fingerprint', s.source_fingerprint, 'engine_version', s.engine_version,
    'engine_metadata', s.engine_metadata, 'google_publication_fingerprint', s.google_publication_fingerprint,
    'is_current_official', s.is_current_official, 'publication_verified', s.publication_verified,
    'imported_at', s.imported_at
  ) order by s.phase_order), '[]'::jsonb), count(*) into snapshot_value, history_count
  from scoring_authority.odds_published_snapshots s
  where s.tournament_id = resolved_tournament.tournament_id and s.is_current_for_milestone and s.publication_verified;
  return jsonb_build_object('ok', true,
    'data', jsonb_build_object('tournament', to_jsonb(resolved_tournament), 'snapshots', snapshot_value,
      'history_count', history_count, 'query_ms', extract(epoch from (clock_timestamp() - started_at)) * 1000));
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_participant_phone_enrollment_failure(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'pg_temp'
AS $function$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_OTP_INVALID_OR_EXPIRED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare next_failures integer;
declare next_status text;
begin
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt and auth_user_id = actor_auth_user and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_SESSION_REQUIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  next_failures := least(5, attempt.verify_failure_count + case when reason_value = 'PHONE_OTP_PROVIDER_UNAVAILABLE' then 0 else 1 end);
  next_status := case
    when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'UUID_MISMATCH'
    when reason_value = 'PHONE_OTP_INVALID_OR_EXPIRED' and attempt.expires_at <= now() then 'EXPIRED'
    when next_failures >= 5 then 'VERIFY_LOCKED'
    else 'SENT'
  end;
  update participant_identity.participant_phone_otp_attempts set status = next_status,
    safe_reason = reason_value, verify_failure_count = next_failures,
    verification_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;
  if next_status in ('UUID_MISMATCH', 'EXPIRED', 'VERIFY_LOCKED') then
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
  end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name, request_id, safe_metadata
  ) values (
    case when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'PHONE_ENROLLMENT_UUID_MISMATCH' else 'PHONE_ENROLLMENT_VERIFY_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Authenticated participant', attempt.attempt_id::text,
    jsonb_build_object('safeReason', reason_value, 'attemptStatus', next_status,
      'verifyFailureCount', next_failures, 'durationMs', duration_value,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', true, 'status', next_status, 'verifyFailureCount', next_failures);
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_participant_phone_enrollment_send(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'auth', 'pg_temp'
AS $function$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare returned_auth_user uuid := nullif(input->>'returned_auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare provider_called_value boolean := coalesce((input->>'provider_called')::boolean, false);
declare pending_phone_matches boolean := coalesce((input->>'pending_phone_matches')::boolean, false);
declare pending_phone_source text := upper(btrim(coalesce(input->>'pending_phone_source', '')));
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_OTP_SEND_FAILED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  if reason_value !~ '^[A-Z0-9_]+$' then reason_value := 'PHONE_OTP_SEND_FAILED'; end if;
  if pending_phone_source not in (
    'UPDATE_USER_NEW_PHONE', 'UPDATE_USER_PHONE_CHANGE',
    'ADMIN_USER_NEW_PHONE', 'ADMIN_USER_PHONE_CHANGE'
  ) then
    pending_phone_matches := false;
    pending_phone_source := 'NONE';
  end if;

  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt
    and auth_user_id = actor_auth_user
    and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found or attempt.status <> 'REQUESTING' then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE');
  end if;

  select * into identifier from participant_identity.participant_auth_identifiers
  where identifier_id = attempt.identifier_id for update;
  select * into auth_user from auth.users where id = attempt.auth_user_id;

  if succeeded and returned_auth_user is distinct from attempt.auth_user_id then
    succeeded := false;
    reason_value := 'PHONE_OTP_AUTH_MISMATCH';
  elsif succeeded and (
    identifier.identifier_id is null
    or identifier.player_id <> attempt.player_id
    or identifier.auth_user_id <> attempt.auth_user_id
    or identifier.revision <> attempt.identifier_revision
    or identifier.status not in ('ELIGIBLE', 'VERIFICATION_PENDING')
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_ENROLLMENT_START_FAILED';
  elsif succeeded and (
    nullif(btrim(coalesce(auth_user.phone, '')), '') is not null
    or auth_user.phone_confirmed_at is not null
    or (
      nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null
      and participant_identity.canonical_auth_phone(auth_user.phone_change)
        <> participant_identity.canonical_auth_phone(identifier.normalized_value_private)
    )
    or (
      not pending_phone_matches
      and participant_identity.canonical_auth_phone(nullif(auth_user.phone_change, ''))
        is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
    )
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_PENDING_STATE_MISMATCH';
  elsif succeeded and exists (
    select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
      and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
        = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
        or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
        = participant_identity.canonical_auth_phone(identifier.normalized_value_private))
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_AUTH_COLLISION';
  end if;

  update participant_identity.participant_phone_otp_attempts set
    status = case when succeeded then 'SENT' else 'SEND_FAILED' end,
    safe_reason = case when succeeded then 'PHONE_CHANGE_VERIFICATION_PENDING' else reason_value end,
    provider_called = provider_called_value,
    provider_requested_at = case when provider_called_value then now() else null end,
    sent_at = case when succeeded then now() else null end,
    request_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;

  update participant_identity.participant_auth_identifiers set
    status = case when succeeded then 'VERIFICATION_PENDING' else 'ELIGIBLE' end,
    updated_by = 'SUPABASE_AUTH_PHONE_CHANGE', updated_at = now()
  where identifier_id = attempt.identifier_id
    and revision = attempt.identifier_revision
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING');

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    case when succeeded then 'PHONE_ENROLLMENT_CODE_SENT' else 'PHONE_ENROLLMENT_SEND_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Authenticated participant', attempt.attempt_id::text,
    jsonb_build_object(
      'method', 'AUTHENTICATED_PHONE_CHANGE',
      'providerCalled', provider_called_value,
      'safeReason', case when succeeded then 'PHONE_CHANGE_VERIFICATION_PENDING' else reason_value end,
      'pendingPhoneSource', pending_phone_source,
      'pendingPhoneNormalized', pending_phone_matches,
      'returnedAuthUserMatch', returned_auth_user = attempt.auth_user_id,
      'durationMs', duration_value,
      'rawPhoneLogged', false,
      'otpLogged', false
    )
  );

  return jsonb_build_object(
    'ok', succeeded,
    'code', case when succeeded then 'PHONE_OTP_VERIFICATION_PENDING' else reason_value end,
    'status', case when succeeded then 'VERIFICATION_PENDING' else 'SEND_FAILED' end,
    'expiresAt', attempt.expires_at,
    'sameAuthUser', succeeded and returned_auth_user = attempt.auth_user_id,
    'phoneRepresentationNormalized', succeeded and pending_phone_matches
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_participant_phone_login_failure(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'participant_identity', 'public', 'pg_temp'
AS $function$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_LOGIN_VERIFY_FAILED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare next_failures integer;
declare next_status text;
begin
  if reason_value !~ '^[A-Z0-9_]+$' then reason_value := 'PHONE_LOGIN_VERIFY_FAILED'; end if;
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.attempt_id = target_attempt
    and current_attempt.auth_user_id = expected_auth_user for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' or attempt.safe_reason <> 'PHONE_LOGIN_CODE_SENT' then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE');
  end if;
  next_failures := least(5, attempt.verify_failure_count + case when reason_value = 'PHONE_OTP_PROVIDER_UNAVAILABLE' then 0 else 1 end);
  next_status := case
    when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'UUID_MISMATCH'
    when reason_value in ('PHONE_LOGIN_SESSION_FAILED', 'PHONE_LOGIN_PASSPORT_MISSING') then 'CANCELLED'
    when attempt.expires_at <= now() then 'EXPIRED'
    when next_failures >= 5 then 'VERIFY_LOCKED'
    else 'SENT'
  end;
  update participant_identity.participant_phone_otp_attempts set
    status = next_status, safe_reason = case when next_status = 'SENT' then 'PHONE_LOGIN_CODE_SENT' else reason_value end,
    verify_failure_count = next_failures, verification_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    case when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'PHONE_LOGIN_UUID_MISMATCH' else 'PHONE_LOGIN_VERIFY_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Controlled signed-out participant', attempt.attempt_id::text,
    jsonb_build_object('safeReason', reason_value, 'attemptStatus', next_status,
      'verifyFailureCount', next_failures, 'unexpectedSessionTerminated', reason_value = 'PHONE_OTP_AUTH_MISMATCH',
      'ownershipMutated', false, 'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', true, 'status', next_status, 'verifyFailureCount', next_failures);
end;
$function$;

CREATE TRIGGER participant_auth_phone_link_invariant BEFORE INSERT OR UPDATE OF player_id, auth_user_id, identifier_type, status ON participant_identity.participant_auth_identifiers FOR EACH ROW EXECUTE FUNCTION participant_identity.enforce_current_phone_auth_link();
CREATE TRIGGER participant_phone_otp_identifier_invalidation AFTER UPDATE OF player_id, auth_user_id, normalized_value_private, status, revision ON participant_identity.participant_auth_identifiers FOR EACH ROW EXECUTE FUNCTION participant_identity.cancel_stale_phone_otp_attempts();
CREATE TRIGGER participant_phone_otp_link_invalidation AFTER UPDATE OF auth_user_id, player_id, status ON participant_identity.user_player_links FOR EACH ROW EXECUTE FUNCTION participant_identity.cancel_phone_otp_attempts_for_link();
CREATE TRIGGER tournament_storylines_net_skins_change AFTER INSERT OR UPDATE OF is_current, source_fingerprint, payload_hash ON scoring_authority.competition_derived_snapshots FOR EACH ROW EXECUTE FUNCTION scoring_authority.enqueue_storylines_for_net_skins_change();
alter table "scoring_authority"."competition_derived_snapshots" disable trigger "tournament_storylines_net_skins_change";
CREATE TRIGGER completed_history_awards_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_awards FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_correction_applications_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_correction_applications FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_course_appearances_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_course_appearances FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_course_identity_guard BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_course_identities FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_course_identity();
CREATE TRIGGER completed_history_current_revision_guard BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_current_revisions FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_pointer();
CREATE TRIGGER completed_history_import_runs_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_import_runs FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_match_participants_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_match_participants FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_matches_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_matches FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_record_eligibility_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_record_eligibility FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_revisions_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_revisions FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_roster_facts_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_roster_facts FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_round_facts_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_round_facts FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_scorecards_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_scorecards FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_team_facts_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_team_facts FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER completed_history_tournament_facts_append_only BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.completed_history_tournament_facts FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_completed_history_append_only();
CREATE TRIGGER draft_configuration_supported_write_guard BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.draft_configuration_facts FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_draft_projection_write();
CREATE TRIGGER draft_current_revisions_supported_write_guard BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.draft_current_revisions FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_draft_projection_write();
CREATE TRIGGER draft_picks_supported_write_guard BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.draft_pick_facts FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_draft_projection_write();
CREATE TRIGGER draft_revisions_supported_write_guard BEFORE INSERT OR DELETE OR UPDATE ON scoring_authority.draft_revisions FOR EACH ROW EXECUTE FUNCTION scoring_authority.guard_draft_projection_write();
CREATE TRIGGER protect_finalized_scorecard_snapshot_payload BEFORE UPDATE ON scoring_authority.finalized_scorecard_snapshots FOR EACH ROW EXECUTE FUNCTION scoring_authority.protect_finalized_scorecard_snapshot_payload();
CREATE TRIGGER scoring_authority_guide_revision_immutable BEFORE DELETE OR UPDATE ON scoring_authority.guide_content_revisions FOR EACH ROW EXECUTE FUNCTION scoring_authority.reject_guide_revision_mutation();
CREATE TRIGGER net_skins_hole_score_recalculation AFTER INSERT OR DELETE OR UPDATE ON scoring_authority.hole_scores FOR EACH ROW EXECUTE FUNCTION scoring_authority.enqueue_net_skins_recalculation();
alter table "scoring_authority"."hole_scores" disable trigger "net_skins_hole_score_recalculation";
CREATE TRIGGER tournament_storylines_score_change AFTER INSERT OR DELETE OR UPDATE ON scoring_authority.hole_scores FOR EACH ROW EXECUTE FUNCTION scoring_authority.enqueue_storylines_for_score_change();
alter table "scoring_authority"."hole_scores" disable trigger "tournament_storylines_score_change";
CREATE TRIGGER calcutta_official_match_change AFTER UPDATE OF status, result_winner, scorecard_complete, finalized_at, match_revision ON scoring_authority.matches FOR EACH ROW EXECUTE FUNCTION scoring_authority.enqueue_calcutta_for_match_change();
alter table "scoring_authority"."matches" disable trigger "calcutta_official_match_change";
CREATE TRIGGER capture_scorecard_archive_transition AFTER UPDATE OF status ON scoring_authority.matches FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION scoring_authority.capture_scorecard_archive_transition();
alter table "scoring_authority"."matches" disable trigger "capture_scorecard_archive_transition";
CREATE TRIGGER net_skins_match_lifecycle_recalculation AFTER UPDATE OF status, finalized_at, match_revision ON scoring_authority.matches FOR EACH ROW EXECUTE FUNCTION scoring_authority.enqueue_net_skins_recalculation();
alter table "scoring_authority"."matches" disable trigger "net_skins_match_lifecycle_recalculation";
CREATE TRIGGER tournament_derived_match_change AFTER UPDATE OF status, result_winner, scorecard_complete, finalized_at, match_revision ON scoring_authority.matches FOR EACH ROW EXECUTE FUNCTION scoring_authority.enqueue_derived_for_match_change();
alter table "scoring_authority"."matches" disable trigger "tournament_derived_match_change";
CREATE TRIGGER odds_google_mirror_supersession AFTER INSERT OR UPDATE OF is_current_official ON scoring_authority.odds_published_snapshots FOR EACH ROW EXECUTE FUNCTION scoring_authority.supersede_prior_odds_google_mirror_jobs();
alter table "scoring_authority"."odds_published_snapshots" disable trigger "odds_google_mirror_supersession";

revoke all on table "participant_identity"."identity_audit_events" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."identity_config_import_runs" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."identity_context_revisions" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."participant_auth_identifiers" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."participant_auth_otp_attempts" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."participant_auth_public_rate_events" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."participant_identity_contacts" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."participant_phone_otp_attempts" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."tournament_roles" from public, anon, authenticated, service_role;
revoke all on table "participant_identity"."user_player_links" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."audit_events" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."authority_epochs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."calcutta_configuration_import_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."calcutta_configurations" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."competition_derived_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."competition_derived_snapshots" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."competition_recalculation_jobs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_awards" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_correction_applications" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_course_appearances" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_course_identities" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_current_revisions" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_import_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_match_participants" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_matches" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_record_eligibility" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_revisions" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_roster_facts" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_round_facts" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_scorecards" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_team_facts" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."completed_history_tournament_facts" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."draft_configuration_facts" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."draft_current_revisions" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."draft_pick_facts" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."draft_revisions" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."finalized_scorecard_snapshots" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."game_center_presentations" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."google_match_checkpoints" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."google_outbox_events" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."guide_content_revisions" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."guide_projection_current" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."guide_sync_controls" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."guide_sync_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."guide_sync_worker_configuration" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."hole_scores" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."ingress_gates" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."match_holes" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."match_participants" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."matches" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."net_skins_configuration_entries" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."net_skins_configuration_import_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."net_skins_configurations" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_calculation_checkpoints" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_calculation_jobs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_google_mirror_jobs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_input_configurations" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_input_import_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_published_snapshots" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."odds_snapshot_import_runs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."participant_home_presentations" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."players" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."rounds" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."score_mutations" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."score_revision_history" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."scorecard_archive_checkpoints" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."scorecard_archive_jobs" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."scorecard_archive_worker_configuration" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."scoring_ingress_leases" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."scoring_permissions" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."scoring_snapshots" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."teams" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."tournament_players" from public, anon, authenticated, service_role;
revoke all on table "scoring_authority"."tournaments" from public, anon, authenticated, service_role;
revoke all on function public."admin_link_auth_user_to_player"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."approve_participant_identity_configuration"(run_id uuid, expected_fingerprint text, approved_by_name text) from public, anon, authenticated, service_role;
revoke all on function public."authorize_match_access"(target_tournament_id text, target_player_id text, target_match_id text, requested_action text) from public, anon, authenticated, service_role;
revoke all on function public."authorize_participant_phone_enrollment_verification"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."begin_participant_phone_public_request"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."cancel_participant_phone_login"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."clear_disabled_net_skins_operational_state"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."complete_participant_phone_enrollment"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."inspect_participant_auth_identifier_foundation"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."inspect_participant_auth_phone_link_alignment"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."inspect_participant_identity_tournament_resolution"(target_auth_user_id uuid) from public, anon, authenticated, service_role;
revoke all on function public."intelligence_claim_is_current"(target_tournament text, target_engine text, target_claim timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public."read_calcutta_configuration_view"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_championship_odds_inputs"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_competition_derived_state"(target_tournament_id text, target_engine_keys text[]) from public, anon, authenticated, service_role;
revoke all on function public."read_game_center_view"(target_match_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_leaderboards_core_view"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_match_authorization_matrix"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_my_match_view"(target_tournament_id text, target_player_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_net_skins_input_view"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_net_skins_result_view"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_auth_phone_eligibility"(target_phone_e164 text) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_home_view"(target_tournament_id text, target_player_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_identity_admin"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_identity_context"(target_tournament_id text, target_player_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_identity_context_for_auth"(target_auth_user_id uuid, target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_phone_enrollment_state"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."read_participant_sms_rollout_readiness"(target_tournament_id text) from public, anon, authenticated, service_role;
revoke all on function public."read_published_odds_view"(target_tournament_id text, target_source_workbook_id text) from public, anon, authenticated, service_role;
revoke all on function public."record_participant_phone_enrollment_failure"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."record_participant_phone_enrollment_send"(input jsonb) from public, anon, authenticated, service_role;
revoke all on function public."record_participant_phone_login_failure"(input jsonb) from public, anon, authenticated, service_role;
revoke all on all sequences in schema scoring_authority, participant_identity from public, anon, authenticated;
revoke all on all functions in schema scoring_authority, participant_identity from public, anon, authenticated, service_role;
grant select on all tables in schema scoring_authority, participant_identity to service_role;
grant usage, select on all sequences in schema scoring_authority, participant_identity to service_role;
alter default privileges in schema scoring_authority revoke all on tables from public, anon, authenticated;
alter default privileges in schema participant_identity revoke all on tables from public, anon, authenticated;
alter default privileges in schema scoring_authority revoke all on functions from public, anon, authenticated;
alter default privileges in schema participant_identity revoke all on functions from public, anon, authenticated;
commit;
