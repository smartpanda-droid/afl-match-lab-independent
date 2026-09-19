# AFL Match Lab — Database Security Audit

Date: 2026-09-20  
Status: **PRIMARY HARDENING COMPLETE — PRODUCTION VERIFIED**

## Executive result

The earlier concern about 48 internal tables with RLS disabled was investigated against the live production database.

Key finding:

- `afl` / `afl_source` contain 49 internal relations, 48 with RLS off.
- `anon` and `authenticated` have **no schema USAGE** on `afl` or `afl_source`.
- `anon` and `authenticated` have **zero direct SELECT / INSERT / UPDATE / DELETE privileges** on those internal relations.
- Therefore the 48 RLS-off internal tables are **not directly reachable by browser roles** in the current permission model.
- The correct architecture is to preserve internal-schema isolation rather than blindly enabling RLS on all 48 tables.

## Browser API boundary

The current frontend uses only `public.afl_api_*` read models plus six public RPCs.

Approved frontend RPCs:

- `public.afl_match_market_quote`
- `public.afl_player_market_quote`
- `public.afl_price_value`
- `public.afl_multi_lab_market_picker`
- `public.afl_multi_lab_match_market_quote`
- `public.afl_multi_lab_evaluate`

A scan of every JavaScript file under `public/` confirmed that these are the only direct REST RPC calls in the tracked frontend.

## Public read-model audit

All browser-facing `public.afl_api_*` tables are:

- RLS enabled;
- SELECT-only for `anon` / `authenticated`;
- protected from INSERT / UPDATE / DELETE by browser roles;
- backed by explicit read policies.

The policy model is intentionally public-read because AFL Match Lab currently exposes these read models to the public site.

## RPC security audit

All reviewed `public.afl_*` RPCs are `SECURITY INVOKER`, not `SECURITY DEFINER`.

The six approved frontend RPCs reference the public read-model layer and do not require browser access to `afl` / `afl_source`.

Production hardening applied:

- removed implicit `PUBLIC EXECUTE` from all AFL public RPCs;
- explicitly granted `anon` / `authenticated` execute only on the six approved frontend RPCs;
- kept non-browser helper RPCs service-role-only;
- verified the six browser RPCs execute successfully under the `anon` role.

## Internal public-schema tables

The following implementation tables live in `public` but are not part of the browser API:

- `public.afl_refresh_lock`
- `public.afl_system_multi_cache`
- `public.afl_system_multi_config`

Hardening applied:

- removed all `anon` / `authenticated` table privileges;
- retained RLS;
- added explicit deny-client policies as defense in depth.

`afl.review_data_status` also received an explicit deny-client policy.

## Security Advisor status after hardening

The earlier `RLS Enabled No Policy` findings are cleared.

The remaining Advisor warning is:

- `pg_net` extension is installed in the `public` schema.

This is not an AFL application-table exposure issue. It should be handled separately because relocating a Postgres extension can affect existing database/network workflows.

## Database health incident discovered during audit

During the audit the production database became unhealthy and SQL connections timed out.

Root performance findings from `pg_stat_statements` included:

- `afl.late_lineup_delta_tick()`: historical mean about 23.6 s;
- `afl.plan_workflow()`: historical mean about 25.6 s;
- `afl.refresh_public_availability()`: historical mean about 18.8 s.

Health hardening was applied separately in `database/database_health_hardening_v67.sql`.

Verified results:

- player availability full refresh: about 18.8 s historical mean → about **111 ms** measured;
- idle `afl.event_driven_tick()`: about 3–4 s during the incident → about **254 ms** measured after gating fixes;
- stale final-prediction workflow events are now marked `skipped / missed_final_window` rather than remaining permanently pending;
- post-match retries now respect `next_attempt_at`;
- production project returned to `ACTIVE_HEALTHY`.

## Files

- `database/security_audit_readonly.sql`
- `database/security_hardening_v67.sql`
- `database/database_health_hardening_v67.sql`
- `database/simulation_v2_shadow.sql`

## Remaining work

1. Keep `afl` / `afl_source` private; do not bulk-enable RLS without a workflow reason.
2. Review the `pg_net` extension warning separately.
3. Consider adopting explicit default privileges for future `public` objects so new tables/functions are not automatically exposed.
4. Continue normal website regression QA after future privilege or API changes.
5. Keep security Advisor and database performance checks as release gates.

## Final security model

```text
Browser
  |
  +--> public.afl_api_*     SELECT only + RLS
  |
  +--> 6 approved public RPCs
           SECURITY INVOKER
           explicit EXECUTE grants
           |
           +--> public read models

Internal database workflows / postgres / service role
  |
  +--> afl.*
  +--> afl_source.*
  +--> service-only public helpers
```

This is the intended least-privilege boundary for AFL Match Lab.
