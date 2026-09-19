-- AFL Match Lab public API least-privilege hardening
-- Applied to Supabase production on 2026-09-20.
-- Browser roles are allowed to execute only the six RPCs used by current frontend JS.

begin;

revoke execute on function public.afl_match_bootstrap(uuid) from public,anon,authenticated;
revoke execute on function public.afl_match_market_quote(uuid,numeric,numeric) from public;
revoke execute on function public.afl_multi_lab_evaluate(uuid[],numeric) from public;
revoke execute on function public.afl_multi_lab_legs(uuid) from public,anon,authenticated;
revoke execute on function public.afl_multi_lab_market_picker(uuid) from public;
revoke execute on function public.afl_multi_lab_match_market_quote(uuid,text,text,numeric) from public;
revoke execute on function public.afl_multi_source_fingerprint(uuid) from public,anon,authenticated;
revoke execute on function public.afl_player_market_quote(uuid,uuid,text,numeric) from public;
revoke execute on function public.afl_price_value(numeric,numeric) from public;
revoke execute on function public.afl_rank_system_multis(jsonb) from public,anon,authenticated;
revoke execute on function public.afl_rebuild_system_multi_cache(uuid) from public,anon,authenticated;
revoke execute on function public.afl_should_refresh_system_multi(uuid) from public,anon,authenticated;
revoke execute on function public.afl_system_multi_candidates(uuid) from public,anon,authenticated;
revoke execute on function public.afl_system_multi_health(uuid) from public,anon,authenticated;
revoke execute on function public.afl_try_refresh_lock(uuid,text,integer) from public,anon,authenticated;

grant execute on function public.afl_match_market_quote(uuid,numeric,numeric) to anon,authenticated,service_role;
grant execute on function public.afl_player_market_quote(uuid,uuid,text,numeric) to anon,authenticated,service_role;
grant execute on function public.afl_price_value(numeric,numeric) to anon,authenticated,service_role;
grant execute on function public.afl_multi_lab_market_picker(uuid) to anon,authenticated,service_role;
grant execute on function public.afl_multi_lab_match_market_quote(uuid,text,text,numeric) to anon,authenticated,service_role;
grant execute on function public.afl_multi_lab_evaluate(uuid[],numeric) to anon,authenticated,service_role;

grant execute on function public.afl_match_bootstrap(uuid) to service_role;
grant execute on function public.afl_multi_lab_legs(uuid) to service_role;
grant execute on function public.afl_multi_source_fingerprint(uuid) to service_role;
grant execute on function public.afl_rank_system_multis(jsonb) to service_role;
grant execute on function public.afl_rebuild_system_multi_cache(uuid) to service_role;
grant execute on function public.afl_should_refresh_system_multi(uuid) to service_role;
grant execute on function public.afl_system_multi_candidates(uuid) to service_role;
grant execute on function public.afl_system_multi_health(uuid) to service_role;
grant execute on function public.afl_try_refresh_lock(uuid,text,integer) to service_role;

revoke all on table public.afl_refresh_lock from anon,authenticated;
revoke all on table public.afl_system_multi_cache from anon,authenticated;
revoke all on table public.afl_system_multi_config from anon,authenticated;

create policy afl_refresh_lock_deny_clients
on public.afl_refresh_lock for select to anon,authenticated using (false);

create policy afl_system_multi_cache_deny_clients
on public.afl_system_multi_cache for select to anon,authenticated using (false);

create policy afl_system_multi_config_deny_clients
on public.afl_system_multi_config for select to anon,authenticated using (false);

create policy review_data_status_deny_clients
on afl.review_data_status for select to anon,authenticated using (false);

commit;
