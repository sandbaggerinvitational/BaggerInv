-- Inert publication-policy correction. No draft, content, receipt or pointer writes.
-- Structural validation, canonical references, actor/CAS/idempotency and publish
-- transactions remain installed and unchanged. Legacy import policy is unchanged.
begin;

create or replace function production_control.validate_guide_authoring_v1(
 target text,target_year integer,proposed_authoring jsonb,proposed_projection jsonb,
 declared_authoring_fingerprint text default null,declared_content_fingerprint text default null,declared_projection_hash text default null
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $publication$
declare result jsonb; issues jsonb := '[]'; spec record; item jsonb; field_name text;
 overview_value jsonb; zone_value text; start_value text; end_value text;
begin
 result := production_control.validate_guide_draft_structure_v1(target,target_year,proposed_authoring,proposed_projection,declared_authoring_fingerprint,declared_content_fingerprint,declared_projection_hash);
 if not coalesce((result->>'pass')::boolean,false) then return result; end if;
 overview_value := proposed_authoring->'tournament';
 for spec in select * from (values
  ('Tournament Name','Name'),('Tournament Edition','Annual'),
  ('Tournament Dates','Dates'),('Destination','Location'),('Time Zone','Timezone')
 ) f(primary_field,alias_field) loop
  if coalesce(nullif(pg_catalog.btrim(overview_value->>spec.primary_field),''),nullif(pg_catalog.btrim(overview_value->>spec.alias_field),''),'')='' then
   issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source','Tournaments','field',spec.primary_field,'message','Complete '||spec.primary_field||' before publication.'));
  end if;
 end loop;
 zone_value:=coalesce(nullif(pg_catalog.btrim(overview_value->>'Time Zone'),''),nullif(pg_catalog.btrim(overview_value->>'Timezone'),''));
 if zone_value is not null and not exists(select 1 from pg_catalog.pg_timezone_names where name=zone_value) then
  issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source','Tournaments','field','Time Zone','message','Use a valid tournament timezone.'));
 end if;
 start_value:=nullif(pg_catalog.btrim(overview_value->>'Start Date'),'');
 end_value:=nullif(pg_catalog.btrim(overview_value->>'End Date'),'');
 for field_name in select unnest(array['Start Date','End Date']) loop
  if coalesce(overview_value->>field_name,'')<>'' and not production_control.guide_date_valid_v1(overview_value->>field_name,target_year) then
   issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source','Tournaments','field',field_name,'message','Use a real date in the tournament year.'));
  end if;
 end loop;
 if (start_value is null) <> (end_value is null) or start_value > end_value then
  issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source','Tournaments','field','Start Date / End Date','message','Supply both structured dates in chronological order, or leave both blank.'));
 end if;
 for spec in select * from (values
 ('overview',array['Section ID','Section Name','Section Slug','Description','Display Order'],false),
 ('schedule',array['Event ID','Event Date','Day Label','Start Time','Event Type','Title','Display Order'],true),
 ('timelineRows',array['Event Date','Start Time','Title','Sort Order'],false),
 ('ruleBook',array['Rule ID','Category','Title','Body','Display Order'],false),
 ('dining',array['Day','Meal','Location','Sort Order'],false),
 ('localGuide',array['Section','Title','Sort Order'],false),
 ('importantContacts',array['Category','Name','Sort Order'],false),
 ('courses',array['Course ID','Round','Format','Course'],true),
 ('tournamentRules',array['Round','Format','Points Available'],true),
 ('rounds',array['Format ID','Name','Team Size'],true)
 ) s(domain_key,required_fields,requires_content) loop
  if spec.requires_content and (case when pg_catalog.jsonb_typeof(proposed_projection->'content'->spec.domain_key)='array' then pg_catalog.jsonb_array_length(proposed_projection->'content'->spec.domain_key)=0 else true end) then
   issues:=issues||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','GUIDE_PUBLICATION_INCOMPLETE','source',spec.domain_key,'message',case when spec.domain_key='schedule' then 'Guide Itinerary needs at least one published participant event.' else spec.domain_key||' has no complete published content.' end));
  end if;
  -- Validate every supplied row, including optional domains and private items.
  -- Absent optional content is valid; malformed existing content is not ignored.
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

revoke all on function production_control.validate_guide_authoring_v1(text,integer,jsonb,jsonb,text,text,text) from public,anon,authenticated,service_role;
commit;
