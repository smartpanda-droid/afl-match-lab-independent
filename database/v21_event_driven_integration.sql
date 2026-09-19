-- Integrate V2.1 validation into the existing event-driven master without adding a new cron.
-- Safe to run once after same_bloodline_validation_v21.sql.

do $patch$
declare
  d text;
  needle text;
  replacement text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='afl' and p.proname='event_driven_tick'
  limit 1;

  needle := E'  return jsonb_build_object(\n    ''status'',''ok'',\n    ''active_match_window'',has_active_window,';
  replacement := E'  r := afl.v21_validation_tick();\n  if coalesce((r->>''captured'')::integer,0)>0 or coalesce((r->>''settled'')::integer,0)>0 then\n    out := out || jsonb_build_object(''v21_validation'',r);\n  end if;\n\n  return jsonb_build_object(\n    ''status'',''ok'',\n    ''active_match_window'',has_active_window,';

  if position(needle in d)=0 then
    raise exception 'event_driven_tick patch point not found';
  end if;

  if position('afl.v21_validation_tick()' in d)=0 then
    d := replace(d,needle,replacement);
    execute d;
  end if;
end;
$patch$;
