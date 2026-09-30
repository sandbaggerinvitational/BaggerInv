# Proposed financial extraction — review only

Historical rejected proposal, preserved unchanged below. It was not installed. The subsequent owner-approved **reduced C** implementation and accurate operation-scoped provenance are documented in [P0F-FINANCIAL-CONTEXT-PROOF.md](P0F-FINANCIAL-CONTEXT-PROOF.md); current certification is [CERTIFICATION.md](CERTIFICATION.md). Statements below about pending approval describe the earlier checkpoint, not the current candidate.

Status: **NOT APPLIED — automatic approval review rejected the write.** This document is an owner-review artifact, not an executable migration or permission to apply one.

The rejected action was writing migration 129. The runtime review classified private-core extraction for Net Skins/Calcutta together with delivery-audit table/trigger changes as a broader financial-domain change than the approved isolated-context scope. No alternate path was implemented. Its empty migration 129 scaffold was removed at the safe checkpoint; the rejected SQL was never installed.

## Why the context alone is insufficient

The isolated context-only prototype test proves exact resource/current2026 scope and current database-linked Director authority. The established public financial functions additionally bind a specific Production resource/activation, so calling them with an isolated context correctly fails. Calling the older Preview configuration importers changes entry/auction semantics. The proposed extraction therefore exposes the same existing ledgers and mutation bodies behind two independently authorized wrappers; it does not replace the domain algorithm.

## Required minimum versus additional proposed changes

The narrow context requirement for IDs010–011 is access to the existing Net Skins **entry registration** and Calcutta **current management read, purchase/ownership save, and single-entry clear**. It is not permission to rewrite financial rules or the lifecycle. Three mutation cores would satisfy that operation set: `save_production_net_skins_entries_v1`, `replace_production_calcutta_v1_auction_facts`, and `clear_production_calcutta_v1_auction_entry`; the management projection already accepts a target. None may bypass its original domain guards.

The rejected proposal was wider than that minimum in three explicitly reviewable ways:

1. It additionally extracted `configure_production_calcutta_v1`, which edits point/payout configuration. That function is shown below because it was in the rejected proposal, but its extraction is **not established as necessary** for the narrow ownership/purchase/clear capability. Treat it as a separate scope decision; do not approve it implicitly.
2. It added a second receipt lookup after acquiring the current-row lock in configuration and auction replacement. That changes concurrent retry behavior from a possible stale-CAS rejection to returning the committed matching receipt. It is a proposed idempotency behavior improvement, **not byte-identical domain preservation** and not necessary merely to expose the existing operation. It needs its own justification/proof if retained.
3. It added audit columns and changed the delivery-provenance trigger. Accurate isolated provenance is required; this particular cross-family trigger/table expansion is a separate proposed implementation with broader evidence impact. Its rejection is not permission to omit or mislabel provenance.

The minimum owner-review question is therefore whether to permit **only the three named mutation-core extractions and the already-targeted management read**, with unchanged financial admission/domain predicates and original public Production wrappers. Configuration extraction, retry-behavior changes and the proposed provenance-table/trigger expansion are separate decisions. No revised implementation has been attempted after rejection. This artifact does not ask for blanket approval and does not claim that the rejected combined proposal was semantics-neutral.

## Public boundary and permissions

Existing Production public wrappers would keep the exact existing admission predicates: Net Skins uses `assert_tournament_setup_runtime_v1`; Calcutta uses its existing runtime and actor assertions, with the clear operation's service-role/current-pointer guard intact. Existing function signatures, SECURITY DEFINER behavior, fixed search path, owner and service-only entry grants would be retained and verified. New private cores would be revoked from PUBLIC, anon, authenticated and service_role. The new isolated service-only gateway would be the only additional caller after independent database admission. No runtime client can enable a binding or inject a private context.

The public Calcutta wrapper would retain its existing activation-row lock, resource lookup and exact resource fingerprint construction. It would pass the resulting metadata internally to the shared core. The isolated wrapper would pass metadata derived from its locked, installed isolated binding. No Production resource row or environment claim would be fabricated.

## Exact proposed domain-body diffs

These diffs compare each currently installed source definition with the proposed private domain body. They do not show applied changes. Before-body hashes must additionally match installed PostgreSQL before an eventual migration proceeds. Net Skins has no domain change; Calcutta resource metadata would become an explicit private argument. Configuration/auction save would also recheck the existing receipt after waiting for the current-row lock, matching the existing clear operation's deterministic concurrent-replay behavior. That replay change is explicitly part of this review, not hidden cleanup.


### save_production_net_skins_entries_v1

Source: `supabase/production_migrations/202609090098_production_net_skins_entries_v1.sql`. Before body SHA256: `570a92f93d420227da384df0624c2e9f06ee60da32c125d9f9200b857455c9c3`.

```diff
--- save_production_net_skins_entries_v1 current public body
+++ save_production_net_skins_entries_v1 proposed private body
@@ -3,7 +3,6 @@
   prior production_control.net_skins_entry_revisions_v1%rowtype;
   field jsonb; row_value jsonb; canonical jsonb:='[]'; item jsonb; configured_value boolean; response_value jsonb;
 begin
-  perform production_control.assert_tournament_setup_runtime_v1(input);
   if coalesce(input->>'round_number','') !~ '^[1-9][0-9]?$' or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or jsonb_typeof(input->'configured') is distinct from 'boolean' or jsonb_typeof(input->'entries') is distinct from 'array'
     or input->>'actor_player_id' is distinct from input#>>'{authorization,player_id}'

```


### configure_production_calcutta_v1

Source: `supabase/production_migrations/202608290056_production_calcutta_v1.sql`. Before body SHA256: `26e633c93d9e9151b889e1fc309c7d61d84c38f176705704612a03ce341986a7`.

```diff
--- configure_production_calcutta_v1 current public body
+++ configure_production_calcutta_v1 proposed private body
@@ -1,7 +1,5 @@
 
 declare
-  activation production_control.cutover_activation_state%rowtype;
-  resource production_control.resource_scope%rowtype;
   current_value scoring_authority.calcutta_v1_current%rowtype;
   configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
   publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
@@ -21,8 +19,6 @@
     input#>>'{authorization,auth_user_id}', ''
   )::uuid;
 begin
-  perform production_control.assert_production_calcutta_v1_runtime(input);
-  perform production_control.assert_production_scoring_actor(input, true);
   existing_response := production_control.lookup_cutover_receipt(
     'CALCUTTA_V1_CONFIGURE', input
   );
@@ -32,17 +28,14 @@
       message = 'PRODUCTION_CALCUTTA_CONFIGURATION_INPUT_INVALID';
   end if;
 
-  select value.* into strict activation
-  from production_control.cutover_activation_state value
-  where value.scope_key = 'BAGGER_INV_PRODUCTION'
-  for update;
-  select value.* into strict resource
-  from production_control.resource_scope value
-  where value.scope_key = 'BAGGER_INV_PRODUCTION';
   select value.* into strict current_value
   from scoring_authority.calcutta_v1_current value
   where value.tournament_id = '2026'
   for update;
+
+  -- Same-identity callers may have waited for this exact current row.
+  existing_response := production_control.lookup_cutover_receipt('CALCUTTA_V1_CONFIGURE', input);
+  if existing_response is not null then return existing_response; end if;
 
   if current_value.configuration_revision <>
        coalesce((input->>'expected_configuration_revision')::bigint, -1)
@@ -77,22 +70,7 @@
     production_control.build_production_calcutta_v1_configuration(input);
   configuration_fingerprint_value :=
     production_control.calcutta_v1_hash(manifest_value);
-  resource_fingerprint_value := production_control.calcutta_v1_hash(
-    pg_catalog.jsonb_build_object(
-      'contract_version', 'production-calcutta-v1',
-      'environment', 'PRODUCTION',
-      'project_ref', resource.project_ref,
-      'project_url', resource.project_url,
-      'source_workbook_id', resource.google_workbook_id,
-      'tournament_id', resource.current_tournament_id,
-      'vercel_project_id', input->>'vercel_project_id',
-      'vercel_team_id', input->>'vercel_team_id',
-      'vercel_environment', 'production',
-      'deployment_commit', activation.expected_deployment_commit,
-      'authority_epoch_id', activation.authority_generation_id,
-      'activation_revision', activation.activation_revision
-    )
-  );
+  resource_fingerprint_value := context->>'resource_fingerprint';
 
   insert into scoring_authority.calcutta_v1_configuration_revisions (
     tournament_id, configuration_revision, contract_version, state,
@@ -104,7 +82,7 @@
     '2026', current_value.configuration_revision + 1,
     'production-calcutta-v1', 'CONFIGURED', manifest_value,
     configuration_fingerprint_value, resource_fingerprint_value,
-    activation.activation_revision, activation.authority_generation_id,
+    (context->>'activation_revision')::bigint, (context->>'authority_epoch_id')::uuid,
     actor_player, actor_auth_user, request_fingerprint_value,
     payload_hash_value, pg_catalog.now()
   ) returning * into configuration_value;

```


### replace_production_calcutta_v1_auction_facts

Source: `supabase/production_migrations/202608290056_production_calcutta_v1.sql`. Before body SHA256: `02cb4d732c0ef2ad8ccb94f0f95d79b3b613e2636897fb42b909d2a0c2daac54`.

```diff
--- replace_production_calcutta_v1_auction_facts current public body
+++ replace_production_calcutta_v1_auction_facts proposed private body
@@ -1,7 +1,5 @@
 
 declare
-  activation production_control.cutover_activation_state%rowtype;
-  resource production_control.resource_scope%rowtype;
   current_value scoring_authority.calcutta_v1_current%rowtype;
   auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
   publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
@@ -21,8 +19,6 @@
     input#>>'{authorization,auth_user_id}', ''
   )::uuid;
 begin
-  perform production_control.assert_production_calcutta_v1_runtime(input);
-  perform production_control.assert_production_scoring_actor(input, true);
   existing_response := production_control.lookup_cutover_receipt(
     'CALCUTTA_V1_REPLACE_AUCTION', input
   );
@@ -32,17 +28,14 @@
       message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
   end if;
 
-  select value.* into strict activation
-  from production_control.cutover_activation_state value
-  where value.scope_key = 'BAGGER_INV_PRODUCTION'
-  for update;
-  select value.* into strict resource
-  from production_control.resource_scope value
-  where value.scope_key = 'BAGGER_INV_PRODUCTION';
   select value.* into strict current_value
   from scoring_authority.calcutta_v1_current value
   where value.tournament_id = '2026'
   for update;
+
+  -- Same-identity callers may have waited for this exact current row.
+  existing_response := production_control.lookup_cutover_receipt('CALCUTTA_V1_REPLACE_AUCTION', input);
+  if existing_response is not null then return existing_response; end if;
 
   if current_value.state = 'NOT_CONFIGURED' then
     raise exception using errcode = '55000',
@@ -73,22 +66,7 @@
   auction_fingerprint_value := production_control.calcutta_v1_hash(
     manifest_value
   );
-  resource_fingerprint_value := production_control.calcutta_v1_hash(
-    pg_catalog.jsonb_build_object(
-      'contract_version', 'production-calcutta-v1',
-      'environment', 'PRODUCTION',
-      'project_ref', resource.project_ref,
-      'project_url', resource.project_url,
-      'source_workbook_id', resource.google_workbook_id,
-      'tournament_id', resource.current_tournament_id,
-      'vercel_project_id', input->>'vercel_project_id',
-      'vercel_team_id', input->>'vercel_team_id',
-      'vercel_environment', 'production',
-      'deployment_commit', activation.expected_deployment_commit,
-      'authority_epoch_id', activation.authority_generation_id,
-      'activation_revision', activation.activation_revision
-    )
-  );
+  resource_fingerprint_value := context->>'resource_fingerprint';
 
   insert into scoring_authority.calcutta_v1_auction_fact_revisions (
     tournament_id, auction_revision, state, auction_manifest,
@@ -98,7 +76,7 @@
   ) values (
     '2026', current_value.auction_revision + 1, 'AUCTION_COMPLETE',
     manifest_value, auction_fingerprint_value, resource_fingerprint_value,
-    activation.activation_revision, activation.authority_generation_id,
+    (context->>'activation_revision')::bigint, (context->>'authority_epoch_id')::uuid,
     actor_player, actor_auth_user, request_fingerprint_value,
     payload_hash_value, pg_catalog.now()
   ) returning * into auction_value;

```


### clear_production_calcutta_v1_auction_entry

Source: `supabase/production_incremental/director-calcutta-clear-entry-v1.sql`. Before body SHA256: `60a31e54426b2ca65d027923eb69a2eb8f2458df3b6e1e6768882e59e18ef0fa`.

```diff
--- clear_production_calcutta_v1_auction_entry current public body
+++ clear_production_calcutta_v1_auction_entry proposed private body
@@ -1,7 +1,5 @@
 
 declare
-  activation production_control.cutover_activation_state%rowtype;
-  resource production_control.resource_scope%rowtype;
   current_value scoring_authority.calcutta_v1_current%rowtype;
   auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
   publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
@@ -26,15 +24,6 @@
     input#>>'{authorization,auth_user_id}', ''
   )::uuid;
 begin
-  perform production_control.assert_production_service_role();
-  perform production_control.assert_production_calcutta_v1_runtime(input);
-  if input->>'contract_version' is distinct from 'production-calcutta-v1'
-     or input->>'expected_tournament_id' is distinct from '2026'
-     or (select tournament_id from production_control.current_tournament_pointer_v1
-         where scope_key='BAGGER_INV_PRODUCTION') is distinct from '2026' then
-    raise exception using errcode='42501', message='PRODUCTION_CALCUTTA_CLEAR_SCOPE_DENIED';
-  end if;
-  perform production_control.assert_production_scoring_actor(input, true);
   existing_response := production_control.lookup_cutover_receipt(
     'CALCUTTA_V1_CLEAR_ENTRY', input
   );
@@ -44,13 +33,6 @@
       message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
   end if;
 
-  select value.* into strict activation
-  from production_control.cutover_activation_state value
-  where value.scope_key = 'BAGGER_INV_PRODUCTION'
-  for update;
-  select value.* into strict resource
-  from production_control.resource_scope value
-  where value.scope_key = 'BAGGER_INV_PRODUCTION';
   select value.* into strict current_value
   from scoring_authority.calcutta_v1_current value
   where value.tournament_id = '2026'
@@ -123,22 +105,7 @@
   auction_fingerprint_value := production_control.calcutta_v1_hash(
     manifest_value
   );
-  resource_fingerprint_value := production_control.calcutta_v1_hash(
-    pg_catalog.jsonb_build_object(
-      'contract_version', 'production-calcutta-v1',
-      'environment', 'PRODUCTION',
-      'project_ref', resource.project_ref,
-      'project_url', resource.project_url,
-      'source_workbook_id', resource.google_workbook_id,
-      'tournament_id', resource.current_tournament_id,
-      'vercel_project_id', input->>'vercel_project_id',
-      'vercel_team_id', input->>'vercel_team_id',
-      'vercel_environment', 'production',
-      'deployment_commit', activation.expected_deployment_commit,
-      'authority_epoch_id', activation.authority_generation_id,
-      'activation_revision', activation.activation_revision
-    )
-  );
+  resource_fingerprint_value := context->>'resource_fingerprint';
 
   insert into scoring_authority.calcutta_v1_auction_fact_revisions (
     tournament_id, auction_revision, state, auction_manifest,
@@ -148,7 +115,7 @@
   ) values (
     '2026', current_value.auction_revision + 1, 'AUCTION_COMPLETE',
     manifest_value, auction_fingerprint_value, resource_fingerprint_value,
-    activation.activation_revision, activation.authority_generation_id,
+    (context->>'activation_revision')::bigint, (context->>'authority_epoch_id')::uuid,
     actor_player, actor_auth_user, request_fingerprint_value,
     payload_hash_value, pg_catalog.now()
   ) returning * into auction_value;

```


## Delivery provenance expansion — separate explicit review item

A Calcutta replacement can supersede existing internal calculation jobs. Their unchanged delivery trigger writes an audit attempt, whose existing provenance trigger reads the fixed Production activation. An isolated operation must not receive a misleading Production label. The rejected combined proposal also added two audit columns (`handling_runtime_context`, default Production; `handling_context_binding_id`, nullable) and changed that provenance trigger to read an exact enabled isolated database binding before retaining the original Production fallback. This is classification only; no GUC or caller JSON would supply authority. It adds one bounded audit lookup, not score-transaction work. It nevertheless changes a trigger and invalidates affected P0-B evidence, so it requires explicit review and fresh proof. It is not necessary to complete context-only negative security tests, and has not been applied.

## Required proof before acceptance

Verify installed before hashes and exact Production-wrapper admission/grants/ownership; clean/upgrade migration; inactive and missing binding denial; wrong resource/current tournament/actor denial; revoked identity and entitlement; direct private-core denial; receipt replay, different-payload conflict and atomic rollback; stale CAS; simultaneous save/clear/publication; last-entry clear; immutable entry/pairing ancestry and zero financial side effects for entry registration; current canonical readback; correct isolated audit provenance; unchanged Production wrapper rejection; zero Google. Actual API/client and database proof must use the same installed canonical functions. Source inspection alone cannot pass either financial capability.

No Production, hosted staging, real Google, native shipping source or competitive data operation occurred. The owned local context-only SQL test passed separately; it does not prove the rejected financial migration.


## Owner-approved reduced implementation — design before write

Only the existing Net Skins entry save, Calcutta auction replacement and single-entry clear are shared. The original public function OIDs, attributes and Production admission calls remain; new private cores contain the same domain bodies, with an explicit trusted resource context for isolated calls. The Production branch keeps receipt lookup, activation/current locks, CAS, writes and audit in the original order. No second receipt check is added. Calcutta configuration is not extracted.

The isolated gateway revalidates the active canonical Director and exact owner-installed resource. Its private financial dispatcher provides the existing current projections and three mutations. Same-operation status is a read of the existing indexed receipts under fresh current authorization; an old context token participates only in the exact request hash. Missing receipt remains UNKNOWN. No receipt or replay semantics are changed.

Minimum provenance: the dispatcher installs an owner-only, RLS-protected transaction marker keyed by the actual backend PID and transaction ID only while admitted auction replacement or clear executes. A new, narrowly qualified BEFORE INSERT trigger runs after the existing delivery provenance trigger. It corrects only newly inserted CALCUTTA/SUPERSEDED handling fields for that exact transaction and tournament. The marker cannot be installed by runtime roles or client JSON and is removed before return; an exception rolls back its insertion. Existing originating activation remains unchanged. A linked operation audit uses the existing JSON details field for isolated binding, actor, operation UUID, job identity and delivery event ID. No old event is updated, no new cross-family audit columns are added, and other worker/family/Production transactions retain the existing provenance trigger behavior.

This provenance mechanism is limited to the owner's explicit minimum allowance. It still requires normal write approval, actual PostgreSQL privilege/rollback/concurrency proof and a fresh delivery regression. Source approval alone does not certify the capability.
