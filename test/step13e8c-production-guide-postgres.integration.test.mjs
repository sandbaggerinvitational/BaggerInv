import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { normalizeProductionGuideAuthoring } from "../lib/production-guide-authoring-contract.js";
import { canonicalGuideJson, guideProjectionHash } from "../lib/tournament-guide-projection.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase", "production_migrations");
const migration082 = "202608310082_production_guide_authoring_v1.sql";
const annualPredecessor = "202608300068_production_future_participant_identity_runtime_v1.sql";
const providerInventoryV4 = "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));
const workbook = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const projectRef = "ymqhhtxaywtqllynrmxe";
const projectUrl = `https://${projectRef}.supabase.co`;
const actorAuth = "00000000-0000-4000-8000-000000000001";
const initialProjectionRevision = "82000000-0000-4000-8000-000000000001";
const initialGuideRevision = "82000000-0000-4000-8000-000000000002";
const sourceTabs = [
  "Tournaments", "Guide Sections", "Tournament Itinerary",
  "Tournament Timeline", "Rule Book", "Tournament Rules", "Rounds",
  "Dining", "Local Guide", "Important Contacts", "Courses",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster, jwtRole = "service_role") {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: `-c request.jwt.claim.role=${jwtRole}`,
  };
}

function sql(cluster, database, input, jwtRole = "service_role") {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: environment(cluster, jwtRole), input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: environment(cluster) });
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function rpc(cluster, database, name, input, jwtRole = "service_role") {
  return JSON.parse(sql(cluster, database,
    `select public.${name}(${json(input)})::text`, jwtRole));
}

function requestId(value) {
  return `83000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function requestHash(value) {
  return Number(value).toString(16).padStart(64, "0");
}

function actorScope(target = "2026") {
  return {
    contract_version: "production-guide-authoring-v1",
    environment: "PRODUCTION",
    project_ref: projectRef,
    project_url: projectUrl,
    source_workbook_id: workbook,
    tournament_id: "2026",
    tournament_year: 2026,
    target_tournament_id: target,
    target_tournament_year: Number(target),
    authorization: {
      tournament_id: "2026",
      auth_user_id: actorAuth,
      player_id: "P01",
      role: "DIRECTOR",
    },
  };
}

function canonicalCourseContext() {
  return [{
    course_id: "COURSE01",
    tee: "Gold",
    slope: 136,
    rating: 71.9,
    par: 72,
    configuration_consistent: true,
    rounds: [{
      round_number: 1,
      format: "BB",
      name: "Best Ball",
      status: "UPCOMING",
    }],
    holes: Array.from({ length: 18 }, (_, index) => ({
      hole_number: index + 1,
      yardage: 350 + index,
      par: 4,
      stroke_index: index + 1,
    })),
  }];
}

function guideContent(year = 2026, label = "Director") {
  const scope = String(year);
  return {
    tournament: {
      "Tournament ID": scope,
      Year: scope,
      "Tournament Name": `${label} Sandbagger Invitational`,
      "Tournament Edition": `${year} Tournament Guide`,
      "Tournament Dates": "September 24–27",
      "Start Date": `${year}-09-24`,
      "End Date": `${year}-09-27`,
      Destination: "Kiawah Island",
      "Time Zone": "America/New_York",
      "Annual Image": "images/tournaments/logos/sandbagger.png",
      "Hero Image": "images/tournaments/hero/kiawah.webp",
      "Mobile Hero Image": "images/tournaments/hero/kiawah-mobile.webp",
    },
    overview: [{
      "Section ID": "overview",
      "Tournament ID": scope,
      "Section Name": "Overview",
      "Section Slug": "overview",
      Description: `${label} welcome to the tournament.`,
      "Display Order": "1",
      Status: "Published",
    }],
    schedule: [{
      "Event ID": "round-1",
      "Tournament ID": scope,
      "Event Date": `${year}-09-25`,
      "Day Label": "Friday",
      "Start Time": "7:20 AM",
      "End Time": "12:00 PM",
      "Event Type": "Golf",
      Title: "Round 1",
      Subtitle: "Best Ball",
      Location: "Turtle Point",
      Details: "Morning golf",
      "Round ID": "1",
      "Course ID": "COURSE01",
      "Display Order": "1",
      Status: "Published",
      Featured: "TRUE",
    }],
    timelineRows: [{
      Year: scope,
      "Tournament Day": "Friday",
      "Event Date": `${year}-09-25`,
      "Start Time": "7:20 AM",
      "End Time": "12:00 PM",
      "Event Type": "Golf",
      Title: "Round 1",
      Subtitle: "Best Ball",
      Location: "Turtle Point",
      "Display on Home": "TRUE",
      "Notification Minutes": "30",
      "Sort Order": "1",
      "Status Override": "",
    }],
    ruleBook: [{
      "Rule ID": "rule-1",
      "Tournament ID": scope,
      Category: "Scoring",
      Subcategory: "",
      Title: "Nassau",
      Body: "Front, back, and overall points are available.",
      "Display Order": "1",
      Status: "Published",
      "Effective Year": scope,
      Important: "TRUE",
    }],
    tournamentRules: [{
      Year: scope,
      Round: "1",
      Format: "BB",
      "Team Size": "2",
      "Points Available": "3",
      "Front 9 Used": "TRUE",
      "Back 9 Used": "TRUE",
      "Overall Used": "TRUE",
      "Front 9 Points": "1",
      "Back 9 Points": "1",
      "Overall Points": "1",
      Description: "Best Ball presentation",
    }],
    rounds: [{
      "Format ID": "BB",
      Name: "Best Ball",
      "Team Size": "2",
      Description: "Two-player best ball.",
    }],
    dining: [{
      Year: scope,
      Day: "Friday",
      Meal: "Dinner",
      Cuisine: "Lowcountry",
      "Start Time": "7:00 PM",
      "End Time": "9:00 PM",
      Location: "Clubhouse",
      "Dress Code": "Resort casual",
      "Reservations Required": "TRUE",
      Notes: "Meet in the lobby.",
      "Sort Order": "1",
    }],
    localGuide: [{
      Year: scope,
      Section: "Transportation",
      Title: "Tournament Shuttle",
      Description: "Shuttle service to the course.",
      Address: "1 Main Street",
      Phone: "555-0100",
      Website: "kiawah.example/shuttle",
      "Sort Order": "1",
    }],
    importantContacts: [{
      Year: scope,
      Category: "Tournament",
      Name: "Katie",
      Role: "Participant liaison",
      Phone: "+1 (555) 010-1000",
      "Text Enabled": "TRUE",
      Email: "katie@example.com",
      Website: "https://example.com/guide",
      "Sort Order": "1",
    }],
    courses: [{
      "Course ID": "COURSE01",
      Year: scope,
      Round: "1",
      Format: "BB",
      Course: "Turtle Point",
      City: "Kiawah Island",
      State: "SC",
      Destination: "Kiawah Island",
      "Year Opened": "1981",
      Designer: "Jack Nicklaus",
      Website: "https://turtle.example",
      "Course Logo": "images/courses/logos/turtle.png",
      "Course Profile Image": "images/courses/profile/turtle.webp",
      "GPS Link": "https://maps.example/turtle",
      Overview: "Oceanfront championship course.",
      "Playing Tips": "Use the wind.",
      "Signature Holes": "14",
      History: "Opened in 1981.",
    }],
  };
}

function normalizeGuide(year, label) {
  return normalizeProductionGuideAuthoring({
    content: guideContent(year, label),
    targetTournamentId: String(year),
    targetTournamentYear: year,
    canonicalCourseContext: canonicalCourseContext(),
  });
}

function mutationPayload(normalized, canonicalReferenceFingerprint) {
  return {
    authoring_content: normalized.authoringContent,
    projection_payload: normalized.projectionPayload,
    authoring_content_fingerprint: normalized.authoringContentFingerprint,
    content_fingerprint: normalized.contentFingerprint,
    projection_payload_hash: normalized.projectionPayloadHash,
    canonical_reference_fingerprint: canonicalReferenceFingerprint,
  };
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-guide-pg-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  const port = 59300 + (process.pid % 200);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl,
    ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-guide-pg-/);
    await rm(cluster.directory, { recursive: true, force: true });
  }
}

function installSupabaseCompatibility(cluster, database) {
  sql(cluster, database, `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, phone text, phone_change text,
      email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
      confirmation_sent_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table auth.identities (
      id uuid primary key, user_id uuid not null references auth.users(id),
      provider text not null, identity_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
        current_user)
    $$;
    create function public.rls_auto_enable()
      returns void language plpgsql as $$ begin end $$;
  `);
}

function installAnnualFixture(cluster, database) {
  sql(cluster, database, `
    set session_replication_role=replica;
    insert into production_control.maintenance_deployment_capability_bindings (
      capability_binding_id,rebind_id,boundary_mode,contract_version,
      capability_ceiling,tournament_id,epoch_id,deployment_id,deployment_commit,
      capability_manifest,capability_fingerprint,runtime_observed_at,
      request_fingerprint,payload_hash,actor_id,response_value
    ) select
      '71000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002','MAINTENANCE_WINDOW_V1',
      'production-maintenance-single-deployment-capability-v1','OBSERVATION',
      '2026',value.authority_generation_id,'dpl_GuideFixture',repeat('7',40),
      '{}'::jsonb,repeat('7',64),clock_timestamp(),repeat('8',64),
      repeat('9',64),'step13e8c-fixture','{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
  `);
}

function seedGuideFixture(cluster, database, initial) {
  const sourceValue = {
    tournamentId: "2026",
    source: { authoringAuthority: "GOOGLE_SYNCHRONIZATION", fixture: true },
  };
  const sourceCanonical = canonicalGuideJson(sourceValue);
  const sourceHash = guideProjectionHash(sourceCanonical);
  sql(cluster, database, `
    insert into scoring_authority.players(player_id,display_name,source_payload)
    values ('P01','Director One','{}');
    insert into scoring_authority.teams(
      tournament_id,team_id,team_side,name,source_payload
    ) values ('2026','TEAM-1',1,'Team One','{}');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,source_payload,tournament_handicap
    ) values ('2026','P01','TEAM-1',1,'ACTIVE','P01','{}',10);
    insert into auth.users(id,email,email_confirmed_at)
    values ('${actorAuth}','director@example.org',clock_timestamp());
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_revision,link_method,
      email_identity_hash,linked_at,linked_by
    ) values ('${actorAuth}','P01','ACTIVE',1,'APPROVED_EMAIL_OTP',
      encode(extensions.digest('director@example.org','sha256'),'hex'),
      clock_timestamp(),'step13e8c');
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,role_active,granted_by
    ) values ('2026','${actorAuth}','DIRECTOR',true,'step13e8c');
    insert into production_control.director_entitlements(
      entitlement_id,auth_user_id,tournament_id,player_id,role,status,
      granted_by,granted_at
    ) values ('00000000-0000-4000-8000-000000000002','${actorAuth}',
      '2026','P01','DIRECTOR','ACTIVE','step13e8c',clock_timestamp());

    insert into scoring_authority.rounds(
      tournament_id,round_number,format,name,status,source_payload
    ) values ('2026',1,'BB','Best Ball','UPCOMING','{}');
    insert into scoring_authority.tournament_setup_operational_v1(
      tournament_id,destination,start_date,end_date,timezone,
      setup_revision,updated_by_player_id
    ) values ('2026','Kiawah Island','2026-09-24','2026-09-27',
      'America/New_York',1,'P01');
    insert into scoring_authority.tournament_setup_round_details_v1(
      tournament_id,round_number,team_size,points_available,display_order,
      setup_revision,updated_by_player_id
    ) values ('2026',1,2,3,1,1,'P01');
    insert into scoring_authority.tournament_setup_course_tees_v1(
      tournament_id,course_id,tee_id,display_name,location,rating,slope,par,
      setup_revision,updated_by_player_id
    ) values ('2026','COURSE01','Gold','Turtle Point','Kiawah Island',
      71.9,136,72,1,'P01');
    insert into scoring_authority.tournament_setup_course_holes_v1(
      tournament_id,course_id,tee_id,hole_number,par,stroke_index,yardage,
      setup_revision
    ) select '2026','COURSE01','Gold',value,4,value,349+value,1
      from generate_series(1,18) value;
    insert into scoring_authority.tournament_setup_round_courses_v1(
      tournament_id,round_number,course_id,tee_id,setup_revision,
      updated_by_player_id
    ) values ('2026',1,'COURSE01','Gold',1,'P01');

    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2027',2027,'2027 Guide fixture','${workbook}','SUPABASE');
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode,
      created_by_player_id,source_manifest
    ) values ('2027',2027,'production-future-year-administration-v1',
      '2027 Guide fixture','DRAFT',1,0,'BLANK','P01','{}');
    insert into production_control.future_tournament_resources_v1(
      tournament_id,project_ref,project_url,source_workbook_id,
      resource_status,resource_revision,google_compatibility_policy,
      updated_by_player_id
    ) values ('2027','${projectRef}','${projectUrl}','${workbook}',
      'CURRENT_RESOURCE_BOUND',1,'CURRENT_CERTIFIED','P01');
    insert into scoring_authority.rounds(
      tournament_id,round_number,format,name,status,source_payload
    ) values ('2027',1,'BB','Best Ball','UPCOMING','{}');
    insert into scoring_authority.tournament_setup_operational_v1(
      tournament_id,destination,start_date,end_date,timezone,
      setup_revision,updated_by_player_id
    ) values ('2027','Kiawah Island','2027-09-24','2027-09-27',
      'America/New_York',1,'P01');
    insert into scoring_authority.tournament_setup_round_details_v1(
      tournament_id,round_number,team_size,points_available,display_order,
      setup_revision,updated_by_player_id
    ) values ('2027',1,2,3,1,1,'P01');
    insert into scoring_authority.tournament_setup_course_tees_v1(
      tournament_id,course_id,tee_id,display_name,location,rating,slope,par,
      setup_revision,updated_by_player_id
    ) values ('2027','COURSE01','Gold','Turtle Point','Kiawah Island',
      71.9,136,72,1,'P01');
    insert into scoring_authority.tournament_setup_course_holes_v1(
      tournament_id,course_id,tee_id,hole_number,par,stroke_index,yardage,
      setup_revision
    ) select '2027','COURSE01','Gold',value,4,value,349+value,1
      from generate_series(1,18) value;
    insert into scoring_authority.tournament_setup_round_courses_v1(
      tournament_id,round_number,course_id,tee_id,setup_revision,
      updated_by_player_id
    ) values ('2027',1,'COURSE01','Gold',1,'P01');

    insert into production_control.projection_revisions(
      revision_id,domain,tournament_id,tournament_year,revision_number,
      previous_revision_id,project_ref,project_url,source_workbook_id,
      source_tabs,contract_version,source_fingerprint,payload_fingerprint,
      source_payload,projection_payload,validation_status,
      validation_diagnostics,imported_by,imported_at
    ) values (
      '${initialProjectionRevision}','GUIDE','2026',2026,1,null,
      '${projectRef}','${projectUrl}','${workbook}',${json(sourceTabs)},
      'guide-projection-v1','${sourceHash}','${initial.projectionPayloadHash}',
      ${json(sourceValue)},${json(initial.projectionPayload)},'VALID','{}',
      'Google synchronization','2026-01-01T00:00:00Z'
    );
    insert into production_control.projection_current(
      domain,tournament_id,revision_id,advanced_by,advanced_at
    ) values ('GUIDE','2026','${initialProjectionRevision}',
      'Google synchronization','2026-01-01T00:00:00Z');
    insert into scoring_authority.guide_content_revisions(
      revision_id,tournament_id,projection_revision,source_workbook_id,
      content_fingerprint,source_workbook_fingerprint,payload_hash,
      source_canonical_json,content_canonical_json,payload_canonical_json,
      content_payload,validation_status,source_metadata,source_sync_sequence,
      trigger_type,imported_by,imported_at
    ) values (
      '${initialGuideRevision}','2026',1,'${workbook}',
      '${initial.contentFingerprint}','${sourceHash}',
      '${initial.projectionPayloadHash}',${json(sourceCanonical)}#>>'{}',
      ${json(initial.contentCanonicalJson)}#>>'{}',
      ${json(initial.projectionPayloadCanonicalJson)}#>>'{}',
      ${json(initial.projectionPayload)},'VALID',
      '{"authoringAuthority":"GOOGLE_SYNCHRONIZATION"}',1,'INITIAL',
      'Google synchronization','2026-01-01T00:00:00Z'
    );
    insert into scoring_authority.guide_projection_current(
      tournament_id,source_workbook_id,revision_id,publication_sequence,
      source_sync_sequence,published_at,last_verified_at
    ) values ('2026','${workbook}','${initialGuideRevision}',1,1,
      '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
  `);
}

test("migration 082 installs inertly and enforces the complete annual Guide lifecycle", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e8c_guide";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } });
  installSupabaseCompatibility(cluster, database);

  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  const predecessorIndex = names.indexOf(annualPredecessor);
  const migrationIndex = names.indexOf(migration082);
  assert.ok(predecessorIndex >= 0 && migrationIndex > predecessorIndex);
  for (const name of names.slice(0, predecessorIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventoryV4) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments(
          tournament_id,tournament_year,name,source_workbook_id,scoring_authority
        ) values ('2026',2026,'Guide fixture','${workbook}','GOOGLE');
        insert into scoring_authority.ingress_gates(
          tournament_id,state,authority,active_epoch_id,
          unresolved_client_queues,updated_by
        ) values ('2026','PAUSED','GOOGLE',null,0,'step13e8c');
      `);
    }
  }
  installAnnualFixture(cluster, database);
  for (const name of names.slice(predecessorIndex + 1, migrationIndex)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }

  const initial = normalizeGuide(2026, "Google imported");
  seedGuideFixture(cluster, database, initial);
  const before = sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.projection_revisions
      where domain='GUIDE'),
    (select revision_id from production_control.projection_current
      where domain='GUIDE' and tournament_id='2026'),
    (select count(*) from scoring_authority.guide_content_revisions),
    (select revision_id from scoring_authority.guide_projection_current
      where tournament_id='2026'),
    (select payload_fingerprint from production_control.projection_revisions
      where revision_id='${initialProjectionRevision}'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'))`);

  sqlFile(cluster, database, path.join(migrationsDirectory, migration082));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.projection_revisions
      where domain='GUIDE'),
    (select revision_id from production_control.projection_current
      where domain='GUIDE' and tournament_id='2026'),
    (select count(*) from scoring_authority.guide_content_revisions),
    (select revision_id from scoring_authority.guide_projection_current
      where tournament_id='2026'),
    (select payload_fingerprint from production_control.projection_revisions
      where revision_id='${initialProjectionRevision}'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'))`), before);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.guide_authoring_drafts_v1),
    (select count(*) from production_control.guide_authoring_revisions_v1),
    (select count(*) from production_control.guide_authoring_current_v1),
    (select count(*) from production_control.guide_authoring_operation_receipts_v1),
    (select count(*) from production_control.guide_authoring_audit_events_v1),
    (select count(*) from production_control.future_annual_projection_bindings_v1
      where domain='GUIDE'))`), "0|0|0|0|0|0");

  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.create_production_guide_draft_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.read_production_guide_authoring_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.preview_production_guide_draft_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'public.import_production_guide_projection(jsonb)','EXECUTE'),
    has_table_privilege('service_role',
      'production_control.guide_authoring_drafts_v1','SELECT'),
    (select relrowsecurity from pg_catalog.pg_class
      where oid='production_control.guide_authoring_drafts_v1'::regclass))`),
  "t|f|f|f|f|t");
  assert.throws(() => sql(cluster, database, `
    set role anon;
    select public.read_production_guide_authoring_v1('{}'::jsonb);
  `, "anon"), /permission denied/i);
  assert.throws(() => sql(cluster, database, `
    set role authenticated;
    select public.create_production_guide_draft_v1('{}'::jsonb);
  `, "authenticated"), /permission denied/i);
  assert.throws(() => sql(cluster, database, `
    set role service_role;
    select count(*) from production_control.guide_authoring_drafts_v1;
  `), /permission denied/i);

  const readCurrent = rpc(cluster, database, "read_production_guide_authoring_v1", {
    ...actorScope(),
    operation: "READ_PRODUCTION_GUIDE_AUTHORING_V1",
    history_limit: 10,
  });
  assert.equal(readCurrent.data.current.revision, 1);
  assert.equal(readCurrent.data.current.revisionId, initialProjectionRevision);
  assert.equal(readCurrent.data.current.authoringAuthority, "GOOGLE_SYNCHRONIZATION");
  assert.equal(readCurrent.data.history[0].authoringAuthority, "GOOGLE_SYNCHRONIZATION");
  assert.equal(readCurrent.data.openDraft, null);
  assert.equal(readCurrent.data.googleAuthoring.productionStatus, "RETIRED");

  for (const name of [
    "synchronize_production_director_projection",
    "synchronize_production_future_annual_projection_v1",
  ]) {
    const retired = rpc(cluster, database, name, { domain: "GUIDE" });
    assert.equal(retired.code, "GUIDE_GOOGLE_AUTHORING_RETIRED");
  }

  const canonical2026 = sql(cluster, database,
    "select production_control.guide_canonical_reference_fingerprint_v1('2026')");
  const createdGuide = normalizeGuide(2026, "Director staged");
  const createInput = {
    ...actorScope(),
    operation: "CREATE_PRODUCTION_GUIDE_DRAFT_V1",
    operation_request_id: requestId(1),
    request_payload_hash: requestHash(1),
    expected_published_revision: 1,
    expected_published_revision_id: initialProjectionRevision,
    reason: "Create a Director Guide draft",
    ...mutationPayload(createdGuide, canonical2026),
  };
  const created = rpc(cluster, database, "create_production_guide_draft_v1", createInput);
  assert.equal(created.code, "GUIDE_DRAFT_CREATED");
  assert.equal(created.draftVersion, 1);
  assert.equal(sql(cluster, database, `select revision_id
    from production_control.projection_current
    where domain='GUIDE' and tournament_id='2026'`), initialProjectionRevision);
  const createRetry = rpc(cluster, database,
    "create_production_guide_draft_v1", createInput);
  assert.equal(createRetry.idempotent, true);
  const createConflict = rpc(cluster, database,
    "create_production_guide_draft_v1", {
      ...createInput,
      reason: "Different payload under the same operation identity",
    });
  assert.equal(createConflict.code, "GUIDE_IDEMPOTENCY_CONFLICT");
  const staleCreate = rpc(cluster, database,
    "create_production_guide_draft_v1", {
      ...createInput,
      operation_request_id: requestId(2),
      request_payload_hash: requestHash(2),
      expected_published_revision: 0,
      expected_published_revision_id: null,
    });
  assert.equal(staleCreate.code, "GUIDE_PREDECESSOR_STALE");

  const updatedContent = guideContent(2026, "Director updated");
  updatedContent.overview[0].Description = "Director reviewed and updated Guide.";
  const updatedGuide = normalizeProductionGuideAuthoring({
    content: updatedContent,
    targetTournamentId: "2026",
    targetTournamentYear: 2026,
    canonicalCourseContext: canonicalCourseContext(),
  });
  const updateInput = {
    ...actorScope(),
    operation: "UPDATE_PRODUCTION_GUIDE_DRAFT_V1",
    operation_request_id: requestId(3),
    request_payload_hash: requestHash(3),
    expected_published_revision: 1,
    expected_published_revision_id: initialProjectionRevision,
    draft_id: created.draftId,
    expected_draft_version: 1,
    reason: "Review Guide content",
    ...mutationPayload(updatedGuide, canonical2026),
  };
  const updated = rpc(cluster, database, "update_production_guide_draft_v1", updateInput);
  assert.equal(updated.code, "GUIDE_DRAFT_UPDATED");
  assert.equal(updated.draftVersion, 2);
  const staleUpdate = rpc(cluster, database,
    "update_production_guide_draft_v1", {
      ...updateInput,
      operation_request_id: requestId(4),
      request_payload_hash: requestHash(4),
    });
  assert.equal(staleUpdate.code, "GUIDE_DRAFT_VERSION_STALE");

  const validateInput = {
    ...actorScope(),
    operation: "VALIDATE_PRODUCTION_GUIDE_DRAFT_V1",
    operation_request_id: requestId(5),
    request_payload_hash: requestHash(5),
    draft_id: created.draftId,
    expected_draft_version: 2,
    ...mutationPayload(updatedGuide, canonical2026),
  };
  const validated = rpc(cluster, database,
    "validate_production_guide_draft_v1", validateInput);
  assert.equal(validated.code, "GUIDE_DRAFT_VALIDATED");
  assert.equal(validated.draftVersion, 3);
  assert.equal(rpc(cluster, database,
    "validate_production_guide_draft_v1", validateInput).idempotent, true);

  const currentBeforePreview = sql(cluster, database, `select revision_id
    from production_control.projection_current
    where domain='GUIDE' and tournament_id='2026'`);
  const previewInput = {
    ...actorScope(),
    operation: "PREVIEW_PRODUCTION_GUIDE_DRAFT_V1",
    draft_id: created.draftId,
    expected_draft_version: 3,
    ...mutationPayload(updatedGuide, canonical2026),
  };
  sql(cluster, database, `update scoring_authority.tournament_setup_course_tees_v1
    set slope=137 where tournament_id='2026' and course_id='COURSE01'
      and tee_id='Gold'`);
  assert.equal(rpc(cluster, database,
    "preview_production_guide_draft_v1", previewInput).code,
  "GUIDE_CANONICAL_REFERENCE_STALE");
  sql(cluster, database, `update scoring_authority.tournament_setup_course_tees_v1
    set slope=136 where tournament_id='2026' and course_id='COURSE01'
      and tee_id='Gold'`);
  const preview = rpc(cluster, database,
    "preview_production_guide_draft_v1", previewInput);
  assert.equal(preview.label, "DRAFT PREVIEW");
  assert.equal(preview.public, false);
  assert.equal(preview.participantCurrent, false);
  assert.equal(sql(cluster, database, `select revision_id
    from production_control.projection_current
    where domain='GUIDE' and tournament_id='2026'`), currentBeforePreview);

  const publishInput = {
    ...actorScope(),
    operation: "PUBLISH_PRODUCTION_GUIDE_DRAFT_V1",
    operation_request_id: requestId(6),
    request_payload_hash: requestHash(6),
    draft_id: created.draftId,
    expected_draft_version: 3,
    expected_published_revision: 1,
    expected_published_revision_id: initialProjectionRevision,
    expected_content_fingerprint: updatedGuide.contentFingerprint,
    confirmation: "PUBLISH TOURNAMENT GUIDE",
    reason: "Publish the validated Director Guide",
    ...mutationPayload(updatedGuide, canonical2026),
  };
  const published = rpc(cluster, database,
    "publish_production_guide_draft_v1", publishInput);
  assert.equal(published.code, "GUIDE_REVISION_PUBLISHED", JSON.stringify(published));
  assert.equal(published.revision, 2);
  assert.equal(published.previousRevision, 1);
  assert.equal(rpc(cluster, database,
    "publish_production_guide_draft_v1", publishInput).idempotent, true);
  const conflictingGuide = normalizeGuide(2026, "Conflicting retry");
  const publishConflict = rpc(cluster, database,
    "publish_production_guide_draft_v1", {
      ...publishInput,
      ...mutationPayload(conflictingGuide, canonical2026),
    });
  assert.equal(publishConflict.code, "GUIDE_IDEMPOTENCY_CONFLICT");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select revision_number from production_control.guide_authoring_current_v1
      where tournament_id='2026'),
    (select revision_number from production_control.projection_revisions r
      join production_control.projection_current c on c.revision_id=r.revision_id
      where c.domain='GUIDE' and c.tournament_id='2026'),
    (select projection_revision from scoring_authority.guide_content_revisions r
      join scoring_authority.guide_projection_current c on c.revision_id=r.revision_id
      where c.tournament_id='2026'),
    (select count(*) from production_control.projection_revisions
      where domain='GUIDE'),
    (select count(*) from scoring_authority.guide_content_revisions),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'))`), "2|2|2|2|2|2026");
  assert.equal(sql(cluster, database, `select payload_fingerprint
    from production_control.projection_revisions
    where revision_id='${initialProjectionRevision}'`), initial.projectionPayloadHash);
  const publicGuide = rpc(cluster, database, "read_production_guide_projection", {
    environment: "PRODUCTION",
    project_ref: projectRef,
    project_url: projectUrl,
    source_workbook_id: workbook,
    tournament_id: "2026",
    tournament_year: 2026,
    domain: "GUIDE",
    contract_version: "guide-projection-v1",
    source_tabs: sourceTabs,
  });
  assert.equal(publicGuide.data.revision_number, 2);
  assert.equal(publicGuide.data.payload.content.tournament["Tournament Name"],
    "Director updated Sandbagger Invitational");

  const discardGuide = normalizeGuide(2026, "Discarded");
  const discardCreate = rpc(cluster, database,
    "create_production_guide_draft_v1", {
      ...actorScope(),
      operation: "CREATE_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: requestId(7),
      request_payload_hash: requestHash(7),
      expected_published_revision: 2,
      expected_published_revision_id: published.revisionId,
      reason: "Create a disposable Guide draft",
      ...mutationPayload(discardGuide, canonical2026),
    });
  const discardInput = {
    ...actorScope(),
    operation: "DISCARD_PRODUCTION_GUIDE_DRAFT_V1",
    operation_request_id: requestId(8),
    request_payload_hash: requestHash(8),
    draft_id: discardCreate.draftId,
    expected_draft_version: 1,
    reason: "Discard the disposable Guide draft",
  };
  const discarded = rpc(cluster, database,
    "discard_production_guide_draft_v1", discardInput);
  assert.equal(discarded.code, "GUIDE_DRAFT_DISCARDED");
  assert.equal(discarded.currentChanged, false);
  assert.equal(rpc(cluster, database,
    "discard_production_guide_draft_v1", discardInput).idempotent, true);
  assert.equal(sql(cluster, database, `select revision_number
    from production_control.guide_authoring_current_v1
    where tournament_id='2026'`), "2");

  const copyInput = {
    ...actorScope("2027"),
    operation: "COPY_PREVIOUS_PRODUCTION_GUIDE_AS_DRAFT_V1",
    operation_request_id: requestId(9),
    request_payload_hash: requestHash(9),
    source_tournament_id: "2026",
    source_tournament_year: 2026,
    expected_published_revision: 0,
    expected_published_revision_id: null,
    reason: "Copy the prior Guide for future-year review",
  };
  const copied = rpc(cluster, database,
    "copy_previous_production_guide_as_draft_v1", copyInput);
  assert.equal(copied.code, "GUIDE_PREVIOUS_GUIDE_COPIED");
  assert.equal(copied.requiresReview, true);
  assert.equal(copied.madeCurrent, false);
  assert.deepEqual(copied.authoringContent.importantContacts, []);
  assert.equal(copied.authoringContent.tournament["Tournament Dates"], "");
  assert.equal(copied.authoringContent.tournament["Start Date"], "");
  assert.equal(copied.authoringContent.tournament["End Date"], "");
  assert.equal(copied.authoringContent.schedule[0]["Event Date"], "");
  assert.equal(copied.authoringContent.ruleBook[0]["Effective Year"], 2027);
  assert.equal(rpc(cluster, database,
    "copy_previous_production_guide_as_draft_v1", copyInput).idempotent, true);
  assert.equal(rpc(cluster, database,
    "copy_previous_production_guide_as_draft_v1", {
      ...copyInput,
      reason: "Different clone payload under the same operation identity",
    }).code, "GUIDE_IDEMPOTENCY_CONFLICT");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='GUIDE'),
    (select count(*) from production_control.guide_authoring_current_v1
      where tournament_id='2027'),
    (select revision_number from production_control.guide_authoring_current_v1
      where tournament_id='2026'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'))`), "0|0|2|2026");

  const canonical2027 = sql(cluster, database,
    "select production_control.guide_canonical_reference_fingerprint_v1('2027')");
  const futureGuide = normalizeGuide(2027, "Future Director");
  const futureUpdate = rpc(cluster, database,
    "update_production_guide_draft_v1", {
      ...actorScope("2027"),
      operation: "UPDATE_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: requestId(10),
      request_payload_hash: requestHash(10),
      expected_published_revision: 0,
      expected_published_revision_id: null,
      draft_id: copied.draftId,
      expected_draft_version: 1,
      reason: "Review and complete the future Guide",
      ...mutationPayload(futureGuide, canonical2027),
    });
  assert.equal(futureUpdate.draftVersion, 2);
  const futureValidateInput = {
    ...actorScope("2027"),
    operation: "VALIDATE_PRODUCTION_GUIDE_DRAFT_V1",
    operation_request_id: requestId(11),
    request_payload_hash: requestHash(11),
    draft_id: copied.draftId,
    expected_draft_version: 2,
    ...mutationPayload(futureGuide, canonical2027),
  };
  const futureValidated = rpc(cluster, database,
    "validate_production_guide_draft_v1", futureValidateInput);
  assert.equal(futureValidated.draftVersion, 3);
  const futurePreview = rpc(cluster, database,
    "preview_production_guide_draft_v1", {
      ...actorScope("2027"),
      operation: "PREVIEW_PRODUCTION_GUIDE_DRAFT_V1",
      draft_id: copied.draftId,
      expected_draft_version: 3,
      ...mutationPayload(futureGuide, canonical2027),
    });
  assert.equal(futurePreview.label, "DRAFT PREVIEW");
  const futurePublished = rpc(cluster, database,
    "publish_production_guide_draft_v1", {
      ...actorScope("2027"),
      operation: "PUBLISH_PRODUCTION_GUIDE_DRAFT_V1",
      operation_request_id: requestId(12),
      request_payload_hash: requestHash(12),
      draft_id: copied.draftId,
      expected_draft_version: 3,
      expected_published_revision: 0,
      expected_published_revision_id: null,
      expected_content_fingerprint: futureGuide.contentFingerprint,
      confirmation: "PUBLISH TOURNAMENT GUIDE",
      reason: "Publish the validated future Guide",
      ...mutationPayload(futureGuide, canonical2027),
    });
  assert.equal(futurePublished.revision, 1);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select revision_number from production_control.guide_authoring_current_v1
      where tournament_id='2027'),
    (select source_revision from production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='GUIDE'),
    (select authoring_authority from production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='GUIDE'),
    (select certification_status from production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='GUIDE'),
    (select revision_number from production_control.guide_authoring_current_v1
      where tournament_id='2026'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'))`),
  "1|1|SUPABASE_DIRECTOR|CERTIFIED|2|2026");
  assert.equal(sql(cluster, database, `select count(*)
    from production_control.projection_current
    where domain='GUIDE' and tournament_id<>'2026'`), "0");
  assert.equal(sql(cluster, database, `select count(*)
    from scoring_authority.guide_projection_current
    where tournament_id<>'2026'`), "0");

  const readFuture = rpc(cluster, database, "read_production_guide_authoring_v1", {
    ...actorScope("2027"),
    operation: "READ_PRODUCTION_GUIDE_AUTHORING_V1",
    history_limit: 10,
  });
  assert.equal(readFuture.data.current.revision, 1);
  assert.equal(readFuture.data.current.authoringAuthority, "SUPABASE_DIRECTOR");
  assert.equal(readFuture.data.currentTournamentId, "2026");
  assert.equal(readFuture.data.openDraft, null);
  assert.ok(readFuture.data.audit.some((event) =>
    event.action === "PREVIOUS_GUIDE_COPIED"));
  assert.ok(readFuture.data.audit.some((event) =>
    event.action === "REVISION_PUBLISHED"));
  assert.doesNotMatch(JSON.stringify(readFuture.data.audit),
    /katie@example|010-1000|request_payload_hash|canonicalReferenceFingerprint/i);
});
