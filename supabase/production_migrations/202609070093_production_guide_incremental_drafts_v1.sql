-- Private incremental Guide drafts. No rows, pointers, or publications are changed by installation.

-- Existing CAS, actor, receipt, fixed search-path and immutable history protections are retained.

begin;

create or replace function production_control.validate_guide_draft_structure_v1(
  target text,
  target_year integer,
  proposed_authoring jsonb,
  proposed_projection jsonb,
  declared_authoring_fingerprint text default null,
  declared_content_fingerprint text default null,
  declared_projection_hash text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $validate_guide_authoring$
declare
  issues jsonb := '[]'::jsonb;
  content_value jsonb;
  authoring_hash text;
  content_hash text;
  projection_hash text;
  domain_value record;
  item_value record;
  link_value record;
  date_value text;
  time_value text;
  round_text text;
  round_number_value integer;
  course_id_value text;
  status_value text;
begin
  if pg_catalog.jsonb_typeof(proposed_authoring) is distinct from 'object'
     or pg_catalog.jsonb_typeof(proposed_projection) is distinct from 'object'
     or proposed_projection->>'schemaVersion' is distinct from
       'guide-projection-v1'
     or pg_catalog.jsonb_typeof(proposed_projection->'content')
       is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'pass', false,
      'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'GUIDE_PROJECTION_SHAPE_INVALID',
        'message', 'The Guide projection shape is invalid.'))
    );
  end if;
  content_value := proposed_projection->'content';
  authoring_hash := production_control.guide_authoring_hash_v1(
    proposed_authoring);
  content_hash := production_control.guide_authoring_hash_v1(content_value);
  projection_hash := production_control.guide_authoring_hash_v1(
    proposed_projection);

  if pg_catalog.octet_length(proposed_authoring::text) > 1500000
     or pg_catalog.octet_length(proposed_projection::text) > 1500000 then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTENT_TOO_LARGE',
        'message', 'The Guide exceeds the bounded authoring size.'));
  end if;
  if exists (select 1
    from production_control.guide_scalar_values_v1(proposed_authoring) value
    where pg_catalog.length(value) > 20000) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTENT_TOO_LARGE',
        'message', 'A Guide field exceeds the bounded text size.'));
  end if;
  if declared_authoring_fingerprint is not null
     and pg_catalog.lower(declared_authoring_fingerprint) <> authoring_hash then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_AUTHORING_FINGERPRINT_MISMATCH',
        'message', 'The Guide authoring fingerprint did not match.'));
  end if;
  if declared_content_fingerprint is not null
     and pg_catalog.lower(declared_content_fingerprint) <> content_hash then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTENT_FINGERPRINT_MISMATCH',
        'message', 'The Guide content fingerprint did not match.'));
  end if;
  if declared_projection_hash is not null
     and pg_catalog.lower(declared_projection_hash) <> projection_hash then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_PROJECTION_FINGERPRINT_MISMATCH',
        'message', 'The Guide projection fingerprint did not match.'));
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_object_keys(proposed_authoring) key_value
    where key_value not in (
      'tournament','overview','schedule','timelineRows','ruleBook',
      'tournamentRules','rounds','dining','localGuide',
      'importantContacts','courses'
    )
  ) or exists (
    select 1 from pg_catalog.jsonb_object_keys(content_value) key_value
    where key_value not in (
      'tournament','tournamentIdentity','overview','schedule','timelineRows',
      'courses','ruleBook','tournamentRules','rounds','dining','localGuide',
      'importantContacts','headers'
    )
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_DOMAIN_NOT_ALLOWLISTED',
        'message', 'Only the certified Tournament Guide domains are allowed.'));
  end if;

  if pg_catalog.jsonb_typeof(proposed_authoring->'tournament')
       is distinct from 'object'
     or content_value#>>'{tournamentIdentity,id}' is distinct from target
     or coalesce(content_value#>>'{tournamentIdentity,year}', '')
       is distinct from target_year::text then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_TOURNAMENT_SCOPE_MISMATCH',
        'message', 'Guide content must match the selected tournament and year.'));
  end if;

  for domain_value in
    select key_value, proposed_authoring->key_value value
    from pg_catalog.unnest(array[
      'overview','schedule','timelineRows','ruleBook','tournamentRules',
      'rounds','dining','localGuide','importantContacts','courses'
    ]) key_value
  loop
    if pg_catalog.jsonb_typeof(domain_value.value) is distinct from 'array' then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_DOMAIN_SHAPE_INVALID',
          'domain', domain_value.key_value,
          'message', 'A Guide collection was not an array.'));
    elsif pg_catalog.jsonb_array_length(domain_value.value) > 500 then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_COLLECTION_TOO_LARGE',
          'domain', domain_value.key_value,
          'message', 'A Guide collection exceeds 500 items.'));
    elsif exists (
      select 1 from pg_catalog.jsonb_array_elements(domain_value.value) item
      where pg_catalog.jsonb_typeof(item) <> 'object'
        or pg_catalog.btrim(coalesce(item->>'itemId', '')) = ''
        or pg_catalog.length(item->>'itemId') > 160
        or item->>'itemId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
    ) or exists (
      select 1
      from pg_catalog.jsonb_array_elements(domain_value.value) item
      group by pg_catalog.lower(pg_catalog.btrim(item->>'itemId'))
      having pg_catalog.count(*) > 1
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_STABLE_ITEM_ID_INVALID',
          'domain', domain_value.key_value,
          'message', 'Each Guide item needs a unique stable item ID.'));
    end if;
  end loop;

  -- Hidden authoring IDs must never cross the participant projection boundary.
  if proposed_projection::text ~ '"itemId"[[:space:]]*:' then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_INTERNAL_ID_PROJECTED',
        'message', 'Internal Guide item IDs are not participant content.'));
  end if;

  -- Explicit stable source IDs retain their certified duplicate semantics.
  for domain_value in
    select * from (values
      ('overview','Section ID'),
      ('schedule','Event ID'),
      ('ruleBook','Rule ID'),
      ('rounds','Format ID')
    ) pair(domain_key, identity_key)
  loop
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        proposed_authoring->domain_value.domain_key) item
      group by pg_catalog.lower(pg_catalog.btrim(
        item->>domain_value.identity_key))
      having pg_catalog.btrim(min(item->>domain_value.identity_key)) = ''
        or pg_catalog.count(*) > 1
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_STABLE_ID_DUPLICATE',
          'domain', domain_value.domain_key,
          'message', 'A certified Guide stable ID is missing or duplicated.'));
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'overview') item
    group by pg_catalog.lower(pg_catalog.btrim(item->>'Section Slug'))
    having pg_catalog.btrim(min(item->>'Section Slug')) = ''
      or pg_catalog.count(*) > 1
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_SECTION_SLUG_DUPLICATE',
        'message', 'Guide section slugs must be present and unique.'));
  end if;

  -- Preserve the established composite duplicate keys alongside hidden IDs.
  if exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'timelineRows') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Event Date',
        item->>'Start Time', item->>'Title')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'tournamentRules') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Round',
        item->>'Format')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'dining') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Day',
        item->>'Meal')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'localGuide') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Section',
        item->>'Title')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Category',
        item->>'Name')) having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'courses') item
      group by pg_catalog.lower(pg_catalog.concat_ws(':', item->>'Course ID',
        item->>'Round')) having pg_catalog.count(*) > 1) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_LOGICAL_KEY_DUPLICATE',
        'message', 'A Guide logical item key is duplicated.'));
  end if;

  -- Publication status exists only for Sections, Itinerary, and Rule Book.
  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'overview') item
    union all select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
    union all select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'ruleBook') item
  loop
    status_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      item_value.item->>'Status', '')));
    if status_value <> '' and status_value not in (
      'PUBLISHED','DRAFT','UNPUBLISHED','CANCELLED','ARCHIVED'
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_STATUS_INVALID',
          'message', 'An item uses an unsupported publication status.'));
    end if;
  end loop;

  for item_value in
    select item, 'Display Order' order_key from pg_catalog.jsonb_array_elements(
      proposed_authoring->'overview') item
    union all select item, 'Display Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'timelineRows') item
    union all select item, 'Display Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'ruleBook') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'dining') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'localGuide') item
    union all select item, 'Sort Order' from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
  loop
    if pg_catalog.btrim(coalesce(item_value.item->>item_value.order_key, '')) = ''
       or item_value.item->>item_value.order_key !~ '^[0-9]+(?:\.[0-9]+)?$' then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_ORDER_INVALID',
          'message', 'Guide display and sort orders must be non-negative numbers.'));
    end if;
  end loop;

  for domain_value in select * from (values
    ('overview','Display Order'),('schedule','Display Order'),
    ('timelineRows','Sort Order'),('ruleBook','Display Order'),
    ('dining','Sort Order'),('localGuide','Sort Order'),('importantContacts','Sort Order')
  ) orders(key,order_key) loop
    if exists (select 1 from pg_catalog.jsonb_array_elements(proposed_authoring->domain_value.key) item
      group by case when item->>domain_value.order_key ~ '^[0-9]+(?:\.[0-9]+)?$' then (item->>domain_value.order_key)::numeric end
      having count(*)>1) then
      issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code','GUIDE_ORDER_DUPLICATE','source',domain_value.key,'field',domain_value.order_key,
        'message','Use a distinct order for each item.'));
    end if;
  end loop;

  -- All stored content is plain/safe presentation material. React escaping is
  -- defense in depth, not the authoring sanitizer.
  if proposed_authoring::text ~* '<[[:space:]]*/?[[:space:]]*(script|style|iframe|object|embed|svg)'
     or proposed_authoring::text ~* 'on[a-z]+[[:space:]]*='
     or proposed_authoring::text ~* '(javascript|vbscript)[[:space:]]*:'
     or proposed_authoring::text ~* 'data[[:space:]]*:[[:space:]]*text/html' then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_UNSAFE_CONTENT',
        'message', 'Unsafe markup or a script-capable URL was rejected.'));
  end if;

  for link_value in
    select 'Website' key_value, item->>'Website' value, false asset
      from pg_catalog.jsonb_array_elements(proposed_authoring->'localGuide') item
    union all select 'Website', item->>'Website', false
      from pg_catalog.jsonb_array_elements(proposed_authoring->'importantContacts') item
    union all select 'Website', item->>'Website', false
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'GPS Link', item->>'GPS Link', false
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'Course Logo', item->>'Course Logo', true
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'Course Profile Image', item->>'Course Profile Image', true
      from pg_catalog.jsonb_array_elements(proposed_authoring->'courses') item
    union all select 'Annual Image', proposed_authoring#>>'{tournament,Annual Image}', true
    union all select 'Hero Image', proposed_authoring#>>'{tournament,Hero Image}', true
    union all select 'Mobile Hero Image', proposed_authoring#>>'{tournament,Mobile Hero Image}', true
  loop
    if not production_control.guide_url_valid_v1(
      coalesce(link_value.value, ''), link_value.asset) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_URL_INVALID',
          'field', link_value.key_value,
          'message', 'A Guide URL or asset reference is invalid.'));
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
    where pg_catalog.btrim(coalesce(item->>'Email', '')) <> ''
      and item->>'Email' !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_EMAIL_INVALID',
        'message', 'An Important Contact email address is invalid.'));
  end if;
  if exists (
    select 1 from (
      select item->>'Phone' phone from pg_catalog.jsonb_array_elements(
        proposed_authoring->'importantContacts') item
      union all select item->>'Phone' from pg_catalog.jsonb_array_elements(
        proposed_authoring->'localGuide') item
    ) phone_value
    where pg_catalog.btrim(coalesce(phone_value.phone, '')) <> ''
      and pg_catalog.length(pg_catalog.regexp_replace(
        phone_value.phone, '[^0-9]', '', 'g')) not between 7 and 15
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_PHONE_INVALID',
        'message', 'A Guide phone number is invalid.'));
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'importantContacts') item
    where pg_catalog.upper(pg_catalog.btrim(coalesce(
        item->>'Visibility', item->>'Audience', ''))) in (
          'DIRECTOR','DIRECTORS','ADMIN','PRIVATE','INTERNAL'
        )
       or pg_catalog.lower(pg_catalog.btrim(coalesce(
         item->>'Sensitive', ''))) in ('true','yes','1')
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_CONTACT_NOT_PARTICIPANT_SAFE',
        'message', 'Private or Director-only contacts cannot enter the Guide.'));
  end if;

  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
    union all select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'timelineRows') item
  loop
    date_value := coalesce(item_value.item->>'Event Date', '');
    if date_value <> '' and not production_control.guide_date_valid_v1(date_value, target_year) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_DATE_INVALID',
          'message', 'A Guide event date is invalid for the selected year.'));
    end if;
    time_value := coalesce(item_value.item->>'Start Time', '');
    if not production_control.guide_time_valid_v1(time_value)
       or not production_control.guide_time_valid_v1(coalesce(
         item_value.item->>'End Time', '')) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_TIME_INVALID',
          'message', 'A Guide event time is invalid.'));
    end if;
  end loop;
  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'dining') item
  loop
    if not production_control.guide_time_valid_v1(coalesce(
         item_value.item->>'Start Time', ''))
       or not production_control.guide_time_valid_v1(coalesce(
         item_value.item->>'End Time', '')) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_TIME_INVALID',
          'message', 'A dining time is invalid.'));
    end if;
  end loop;

  -- Guide references validate canonical assignments; they never modify them.
  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'schedule') item
  loop
    round_text := pg_catalog.btrim(coalesce(item_value.item->>'Round ID', ''));
    if round_text <> '' then
      begin
        round_number_value := pg_catalog.regexp_replace(
          round_text, '[^0-9]', '', 'g')::integer;
      exception when others then
        round_number_value := null;
      end;
      if round_number_value is null or not exists (
        select 1 from scoring_authority.rounds round_value
        where round_value.tournament_id = target
          and round_value.round_number = round_number_value
      ) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'GUIDE_ROUND_REFERENCE_INVALID',
            'message', 'An itinerary Round reference does not resolve.'));
      end if;
    end if;
    course_id_value := pg_catalog.btrim(coalesce(
      item_value.item->>'Course ID', ''));
    if course_id_value <> '' and not exists (
      select 1 from scoring_authority.tournament_setup_round_courses_v1 value
      where value.tournament_id = target
        and pg_catalog.upper(value.course_id) =
          pg_catalog.upper(course_id_value)
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_COURSE_REFERENCE_INVALID',
          'message', 'An itinerary Course reference does not resolve.'));
    end if;
  end loop;

  for item_value in
    select item from pg_catalog.jsonb_array_elements(
      proposed_authoring->'courses') item
  loop
    course_id_value := pg_catalog.btrim(coalesce(
      item_value.item->>'Course ID', ''));
    begin
      round_number_value := pg_catalog.regexp_replace(coalesce(
        item_value.item->>'Round', ''), '[^0-9]', '', 'g')::integer;
    exception when others then
      round_number_value := null;
    end;
    if course_id_value = '' or round_number_value is null or not exists (
      select 1
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = target
        and assignment.round_number = round_number_value
        and pg_catalog.upper(assignment.course_id) =
          pg_catalog.upper(course_id_value)
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_COURSE_REFERENCE_INVALID',
          'message', 'A Course presentation row does not match Tournament Setup.'));
    elsif exists (
      select 1
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      join scoring_authority.tournament_setup_course_tees_v1 tee
        on tee.tournament_id = assignment.tournament_id
       and tee.course_id = assignment.course_id
       and tee.tee_id = assignment.tee_id
      join scoring_authority.rounds round_value
        on round_value.tournament_id = assignment.tournament_id
       and round_value.round_number = assignment.round_number
      where assignment.tournament_id = target
        and assignment.round_number = round_number_value
        and pg_catalog.upper(assignment.course_id) =
          pg_catalog.upper(course_id_value)
        and (
          (pg_catalog.btrim(coalesce(item_value.item->>'Format', '')) <> ''
            and pg_catalog.upper(item_value.item->>'Format') <>
              pg_catalog.upper(round_value.format))
          or (pg_catalog.btrim(coalesce(
                item_value.item->>'Tee Played', item_value.item->>'Tee', '')) <> ''
            and pg_catalog.upper(coalesce(
              item_value.item->>'Tee Played', item_value.item->>'Tee')) <>
              pg_catalog.upper(assignment.tee_id))
          or (pg_catalog.btrim(coalesce(item_value.item->>'Slope', '')) <> ''
            and item_value.item->>'Slope' ~ '^[0-9]+$'
            and (item_value.item->>'Slope')::integer <> tee.slope)
          or (pg_catalog.btrim(coalesce(item_value.item->>'Par', '')) <> ''
            and item_value.item->>'Par' ~ '^[0-9]+$'
            and (item_value.item->>'Par')::integer <> tee.par)
        )
    ) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'GUIDE_SCORING_FACT_CONFLICT',
          'message', 'Guide presentation conflicts with canonical scoring facts.'));
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'tournamentRules') item
    where not exists (
      select 1 from scoring_authority.rounds round_value
      where round_value.tournament_id = target
        and round_value.round_number = pg_catalog.regexp_replace(
          coalesce(item->>'Round', ''), '[^0-9]', '', 'g')::integer
        and pg_catalog.upper(round_value.format) =
          pg_catalog.upper(pg_catalog.btrim(coalesce(item->>'Format', '')))
    )
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(
      proposed_authoring->'rounds') item
    where not exists (
      select 1 from scoring_authority.rounds round_value
      where round_value.tournament_id = target
        and pg_catalog.upper(round_value.format) =
          pg_catalog.upper(pg_catalog.btrim(item->>'Format ID'))
    )
  ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GUIDE_RULE_SCORING_CONFLICT',
        'message', 'Guide rule presentation conflicts with canonical rounds.'));
  end if;

  return pg_catalog.jsonb_build_object(
    'pass', pg_catalog.jsonb_array_length(issues) = 0,
    'issues', issues,
    'diagnostics', pg_catalog.jsonb_build_object(
      'validated', false,
      'structurallyValid', pg_catalog.jsonb_array_length(issues) = 0,
      'validationLevel', 'DRAFT',
      'issueCount', pg_catalog.jsonb_array_length(issues),
      'sourceTabs', production_control.guide_authoring_source_tabs_v1(),
      'domainCount', 11,
      'authoringItemCount',
        (select coalesce(pg_catalog.sum(pg_catalog.jsonb_array_length(
          proposed_authoring->key_value)), 0)::integer
         from pg_catalog.unnest(array[
           'overview','schedule','timelineRows','ruleBook','tournamentRules',
           'rounds','dining','localGuide','importantContacts','courses'
         ]) key_value)
    ),
    'authoringContent', proposed_authoring,
    'projectionPayload', proposed_projection,
    'authoringContentFingerprint', authoring_hash,
    'contentFingerprint', content_hash,
    'projectionPayloadHash', projection_hash
  );
exception when invalid_text_representation or numeric_value_out_of_range
  or division_by_zero then
  return pg_catalog.jsonb_build_object(
    'pass', false,
    'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'code', 'GUIDE_FIELD_VALUE_INVALID',
      'message', 'A Guide field value could not be validated.'))
  );
end;
$validate_guide_authoring$;

create or replace function production_control.validate_guide_authoring_v1(
 target text,target_year integer,proposed_authoring jsonb,proposed_projection jsonb,
 declared_authoring_fingerprint text default null,declared_content_fingerprint text default null,declared_projection_hash text default null
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $publication$
declare result jsonb; issues jsonb := '[]'; spec record; item jsonb; field_name text;
begin
 result := production_control.validate_guide_draft_structure_v1(target,target_year,proposed_authoring,proposed_projection,declared_authoring_fingerprint,declared_content_fingerprint,declared_projection_hash);
 if not coalesce((result->>'pass')::boolean,false) then return result; end if;
 if coalesce(nullif(pg_catalog.btrim(proposed_authoring#>>'{tournament,Tournament Name}'),''),nullif(pg_catalog.btrim(proposed_authoring#>>'{tournament,Name}'),''),'')='' then
  issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source','Tournaments','field','Tournament Name','message','Complete the tournament name before publication.'));
 end if;
 for spec in select * from (values
 ('overview',array['Section ID','Section Slug','Description','Display Order']),
 ('schedule',array['Event ID','Event Date','Day Label','Start Time','Event Type','Title','Display Order']),
 ('timelineRows',array['Event Date','Start Time','Title','Sort Order']),
 ('ruleBook',array['Rule ID','Category','Title','Body','Display Order']),
 ('dining',array['Day','Meal','Location','Sort Order']),
 ('localGuide',array['Section','Title','Sort Order']),
 ('importantContacts',array['Category','Name','Sort Order']),
 ('courses',array['Course ID','Round','Format','Course']),
 ('tournamentRules',array['Round','Format','Points Available']),
 ('rounds',array['Format ID','Name','Team Size'])
 ) s(domain_key,required_fields) loop
  if (case when pg_catalog.jsonb_typeof(proposed_projection->'content'->spec.domain_key)='array' then pg_catalog.jsonb_array_length(proposed_projection->'content'->spec.domain_key)=0 else true end) then
   issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source',spec.domain_key,'message',spec.domain_key||' has no complete published content.'));
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(proposed_authoring->spec.domain_key) loop
   foreach field_name in array spec.required_fields loop
    if pg_catalog.btrim(coalesce(nullif(item->>field_name,''),case when field_name='Course' then item->>'Course Name' end,''))='' then
     issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source',spec.domain_key,'field',field_name,'message','Complete '||field_name||' before publication.'));
    end if;
   end loop;
  end loop;
  if spec.domain_key in ('overview','schedule','ruleBook') and pg_catalog.jsonb_typeof(proposed_projection->'content'->spec.domain_key)='array' then
   for item in select value from pg_catalog.jsonb_array_elements(proposed_projection->'content'->spec.domain_key) loop
    if pg_catalog.upper(coalesce(nullif(item->>'Status',''),case when pg_catalog.upper(item->>'Published') in ('TRUE','YES','1') then 'PUBLISHED' end,'')) <> 'PUBLISHED' then
     issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source',spec.domain_key,'message','Private item status cannot enter the public projection.'));
    end if;
   end loop;
  end if;
 end loop;
 return result||pg_catalog.jsonb_build_object('pass',pg_catalog.jsonb_array_length(issues)=0,'issues',issues,'diagnostics',(result->'diagnostics')||pg_catalog.jsonb_build_object('validated',pg_catalog.jsonb_array_length(issues)=0,'validationLevel','PUBLICATION','issueCount',pg_catalog.jsonb_array_length(issues)));
end;
$publication$;

create or replace function public.create_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $create_guide_draft$
declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_revision bigint;
  expected_revision_id_text text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(input->>'expected_published_revision_id','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  validation jsonb;
  current_value jsonb;
  database_hash text;
  prior_receipt jsonb;
  draft_id_value uuid;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'CREATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_published_revision')::bigint;
  validation := production_control.validate_guide_draft_structure_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','CREATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedPublishedRevision',expected_revision,
      'expectedPublishedRevisionId',expected_revision_id_text,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'CREATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'CREATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  current_value := production_control.guide_current_publication_v1(target);
  if (current_value->>'revision')::bigint <> expected_revision
     or (expected_revision_id_text <> '' and expected_revision_id_text
       is distinct from pg_catalog.lower(coalesce(
         current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint,
      'currentRevisionId',current_value->>'revisionId');
  end if;
  if exists (select 1
    from production_control.guide_authoring_drafts_v1 value
    where value.tournament_id=target and value.state in ('DRAFT','VALIDATED'))
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_OPEN_DRAFT_EXISTS');
  end if;
  insert into production_control.guide_authoring_drafts_v1 (
    tournament_id,tournament_year,draft_version,state,authoring_kind,
    expected_published_revision,expected_published_revision_id,
    authoring_content,projection_payload,authoring_content_fingerprint,
    content_fingerprint,projection_payload_hash,canonical_reference_fingerprint,
    validation_diagnostics,
    reason,created_by_player_id,created_by_auth_user_id
  ) values (
    target,target_year,1,'DRAFT','DIRECTOR_EDIT',expected_revision,
    nullif(expected_revision_id_text,'')::uuid,
    validation->'authoringContent',validation->'projectionPayload',
    validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    input->>'canonical_reference_fingerprint',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'validated',false,'requiresReview',false),reason_value,
    actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_CREATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,'draftVersion',1,
    'state','DRAFT','expectedPublishedRevision',expected_revision,
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'DRAFT_CREATED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',1,
      'predecessorRevision',expected_revision,
      'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'CREATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;
$create_guide_draft$;

create or replace function public.update_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $update_guide_draft$
declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  expected_revision bigint;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  validation jsonb;
  current_value jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  database_hash text;
  prior_receipt jsonb;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'UPDATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  expected_revision := (input->>'expected_published_revision')::bigint;
  validation := production_control.validate_guide_draft_structure_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','UPDATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'expectedPublishedRevision',expected_revision,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'UPDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED','issues',validation->'issues');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'UPDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state not in ('DRAFT','VALIDATED')
     or draft.draft_version<>expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VERSION_STALE',
      'currentDraftVersion',draft.draft_version);
  end if;
  if draft.expected_published_revision<>expected_revision
     or (current_value->>'revision')::bigint<>expected_revision
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint);
  end if;
  if draft.authoring_content_fingerprint=
       validation->>'authoringContentFingerprint'
     and draft.projection_payload_hash=validation->>'projectionPayloadHash' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_NO_CHANGES');
  end if;
  update production_control.guide_authoring_drafts_v1 set
    draft_version=draft_version+1,state='DRAFT',
    authoring_content=validation->'authoringContent',
    projection_payload=validation->'projectionPayload',
    authoring_content_fingerprint=validation->>'authoringContentFingerprint',
    content_fingerprint=validation->>'contentFingerprint',
    projection_payload_hash=validation->>'projectionPayloadHash',
    canonical_reference_fingerprint=
      input->>'canonical_reference_fingerprint',
    validated_content_fingerprint=null,
    validated_canonical_reference_fingerprint=null,
    validation_diagnostics=(validation->'diagnostics')||
      pg_catalog.jsonb_build_object(
        'validated',false,'requiresReview',false,'reviewed',true),
    reason=reason_value,updated_at=pg_catalog.clock_timestamp(),validated_at=null
  where draft_id=draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_UPDATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',expected_draft_version+1,'state','DRAFT',
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'DRAFT_UPDATED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',expected_draft_version+1,
      'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'UPDATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
end;
$update_guide_draft$;

create or replace function public.copy_previous_production_guide_as_draft_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $copy_previous_guide$
declare
  target text;
  target_year integer;
  source_target text := pg_catalog.btrim(coalesce(
    input->>'source_tournament_id',''));
  source_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_revision bigint;
  expected_revision_id_text text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(input->>'expected_published_revision_id','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  database_hash text;
  prior_receipt jsonb;
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  source_value jsonb;
  current_value jsonb;
  copied_authoring jsonb;
  copied_projection jsonb;
  validation jsonb;
  draft_id_value uuid;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  begin source_year := (input->>'source_tournament_year')::integer;
  exception when others then source_year := 0; end;
  if input->>'operation' is distinct from
       'COPY_PREVIOUS_PRODUCTION_GUIDE_AS_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or source_target !~ '^20[0-9]{2}$'
     or source_target<>source_year::text
     or source_year<>target_year-1
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_INPUT_INVALID');
  end if;
  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  if target_year<=annual_pointer.tournament_year then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_FUTURE_TARGET_REQUIRED');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_published_revision')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','COPY_PREVIOUS','tournamentId',target,
      'sourceTournamentId',source_target,'sourceTournamentYear',source_year,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedPublishedRevision',expected_revision,
      'expectedPublishedRevisionId',expected_revision_id_text,
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if exists (select 1
    from production_control.guide_authoring_drafts_v1 value
    where value.tournament_id=target and value.state in ('DRAFT','VALIDATED'))
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_OPEN_DRAFT_EXISTS');
  end if;
  source_value := production_control.guide_current_publication_v1(source_target);
  current_value := production_control.guide_current_publication_v1(target);
  if source_value->'projectionPayload' is null
     or (source_value->>'revision')::bigint=0 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_SOURCE_REQUIRED');
  end if;
  if (current_value->>'revision')::bigint<>expected_revision
     or (expected_revision_id_text<>'' and expected_revision_id_text
       is distinct from pg_catalog.lower(coalesce(
         current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint);
  end if;
  copied_authoring := production_control.guide_clone_authoring_v1(
    source_value->'authoringContent',target,target_year);
  copied_projection := production_control.guide_projection_from_clone_v1(
    copied_authoring,source_value->'projectionPayload',target,target_year);
  validation := production_control.validate_guide_draft_structure_v1(
    target,target_year,copied_authoring,copied_projection);
  if validation->>'authoringContentFingerprint' is null
     or validation->>'contentFingerprint' is null
     or validation->>'projectionPayloadHash' is null then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_TARGET_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  insert into production_control.guide_authoring_drafts_v1 (
    tournament_id,tournament_year,draft_version,state,authoring_kind,
    expected_published_revision,expected_published_revision_id,
    source_tournament_id,source_tournament_year,source_revision,
    source_revision_id,authoring_content,projection_payload,
    authoring_content_fingerprint,content_fingerprint,
    projection_payload_hash,canonical_reference_fingerprint,
    validation_diagnostics,reason,created_by_player_id,created_by_auth_user_id
  ) values (
    target,target_year,1,'DRAFT','COPIED_PREVIOUS',expected_revision,
    nullif(expected_revision_id_text,'')::uuid,source_target,source_year,
    (source_value->>'revision')::bigint,
    nullif(source_value->>'revisionId','')::uuid,
    validation->'authoringContent',validation->'projectionPayload',
    validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    production_control.guide_canonical_reference_fingerprint_v1(target),
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'validated',false,'requiresReview',true,
      'sourceTournamentId',source_target,
      'issues',coalesce(validation->'issues','[]'::jsonb),
      'datesAndTimesCopied',false,'contactsCopied',false,
      'publicationStateCopied',false,'auditCopied',false),
    reason_value,actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_PREVIOUS_GUIDE_COPIED','idempotent',false,
    'tournamentId',target,'sourceTournamentId',source_target,
    'sourceRevision',(source_value->>'revision')::bigint,
    'draftId',draft_id_value,'draftVersion',1,'state','DRAFT',
    'requiresReview',true,'madeCurrent',false,
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'PREVIOUS_GUIDE_COPIED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',1,'sourceTournamentId',source_target,
      'sourceRevision',(source_value->>'revision')::bigint,
      'requiresReview',true,'contactsCopied',false,'madeCurrent',false));
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_GUIDE_PREVIOUS_COPIED','GUIDE',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'source_tournament_id',source_target,'requires_review',true,
      'made_current',false));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_COPY_SOURCE_OR_RESOURCE_REQUIRED');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_COPY_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;
$copy_previous_guide$;

create or replace function public.preview_production_guide_draft_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $preview_guide_draft$
declare
  target text;
  target_year integer;
  draft_id_value uuid;
  expected_draft_version bigint;
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  draft production_control.guide_authoring_drafts_v1%rowtype;
  validation jsonb;
begin
  target := production_control.assert_guide_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'PREVIEW_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREVIEW_INPUT_INVALID');
  end if;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target;
  if draft.state not in ('DRAFT','VALIDATED') or draft.draft_version<>expected_draft_version
     or authoring_value is distinct from draft.authoring_content then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREVIEW_CURRENT_DRAFT_REQUIRED');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target)
     or draft.canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint'
     or (draft.state='VALIDATED' and draft.validated_canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  validation := production_control.validate_guide_draft_structure_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  if not coalesce((validation->>'pass')::boolean,false)
     or validation->>'authoringContentFingerprint' is distinct from
       draft.authoring_content_fingerprint
     or validation->>'contentFingerprint' is distinct from
       draft.content_fingerprint
     or (draft.state='VALIDATED' and draft.validated_content_fingerprint is distinct from
       validation->>'contentFingerprint')
     or validation->>'projectionPayloadHash' is distinct from
       draft.projection_payload_hash
     or projection_value is distinct from draft.projection_payload then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VALIDATION_STALE',
      'issues',coalesce(validation->'issues','[]'::jsonb));
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_PREVIEW_READY',
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',draft.draft_version,'state',draft.state,
    'label','DRAFT PREVIEW','public',false,'participantCurrent',false,
    'preview',draft.projection_payload,
    'projectionPayload',draft.projection_payload,
    'validationDiagnostics',draft.validation_diagnostics);
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_PREVIEW_INPUT_INVALID');
end;
$preview_guide_draft$;

revoke all on function production_control.validate_guide_draft_structure_v1(text,integer,jsonb,jsonb,text,text,text) from public,anon,authenticated,service_role;

comment on function public.preview_production_guide_draft_v1(jsonb) is 'Director-only read-only preview of an exact structurally valid private draft. Never changes publication or validation state.';

notify pgrst, 'reload schema';

commit;
