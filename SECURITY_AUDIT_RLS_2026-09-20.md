# AFL Match Lab — Database Security Audit

Date: 2026-09-20  
Status: **AUDIT OPEN — NO PRODUCTION SECURITY DDL APPLIED**

## Why this audit exists

Supabase Advisor previously identified 48 internal tables in `afl` / `afl_source` with RLS disabled. That is a security concern if those schemas or objects are reachable by `anon` / `authenticated` through the Data API.

The correct fix is **not** to blindly enable RLS on all 48 tables. AFL Match Lab has a deliberate separation between:

- **Internal model/workflow data**: `afl.*`, `afl_source.*`
- **Browser/API surface**: `public.afl_api_*` and a small set of `public` RPCs

The safer target architecture is to make `afl` and `afl_source` private implementation schemas and explicitly expose only the public API layer.

## Frontend dependency audit

Current `public/app.js` accesses these REST resources:

- `public.afl_api_validation_summary`
- `public.afl_api_module_market_policy`
- `public.afl_api_final_recommendation_summary`
- `public.afl_api_final_recommendation_audit`
- `public.afl_api_matches`
- `public.afl_api_lineup`
- `public.afl_api_multis`
- `public.afl_api_match_context`
- `public.afl_api_prediction_legs`
- `public.afl_api_multi_stability`
- `public.afl_api_final_recommendations`
- `public.afl_api_player_recent5`
- `public.afl_api_availability`
- `public.afl_api_shadow_observations`
- `public.afl_api_match_reviews`

Current frontend RPCs:

- `public.afl_match_market_quote`
- `public.afl_player_market_quote`
- `public.afl_price_value`
- `public.afl_multi_lab_market_picker`
- `public.afl_multi_lab_match_market_quote`
- `public.afl_multi_lab_evaluate`

No direct `afl.*` or `afl_source.*` browser request was found in the tracked frontend.

## Proposed security model

### Layer 1 — public API

Only objects intentionally used by the browser should be reachable by `anon` / `authenticated`.

Required controls:

- RLS enabled for exposed public tables/materialized API tables.
- Read-only policies where the UI only reads.
- Explicit `EXECUTE` grants only for the six approved public RPCs.
- Public RPCs must be reviewed for `SECURITY DEFINER` and internal-schema access.

### Layer 2 — internal AFL model

`afl` should contain model state, predictions, calibration, injury/TOG state, workflow events, snapshots and settlements.

Target:

- no browser role should need direct table access;
- `anon` / `authenticated` should not have schema usage or object DML unless a proven exception exists;
- server/cron/database-owner workflows continue to operate internally;
- service-role access is retained only where an external server process actually requires it.

### Layer 3 — source/ingestion

`afl_source` contains request queues, sync jobs and ingestion state.

Target:

- zero browser access;
- no `anon` / `authenticated` table privileges;
- only internal workflow roles / server-side service role where required.

## Why we are not enabling RLS blindly

Blindly enabling RLS can break:

- scheduled prediction chains;
- injury/stat ingestion;
- final T-30 freezing;
- post-match settlement;
- cron jobs;
- RPCs that currently execute as invoker and require internal table privileges.

A secure change must preserve the execution identity of every workflow first.

## Read-only audit required before hardening

Run `database/security_audit_readonly.sql` and verify:

1. actual Data API exposed schemas;
2. schema `USAGE` for `anon`, `authenticated`, `service_role`;
3. table/view GRANT matrix;
4. RLS + policy matrix;
5. all `SECURITY DEFINER` functions and their owners;
6. EXECUTE grants on all RPCs;
7. definitions of the six frontend RPCs;
8. default privileges for future objects.

## Candidate hardening sequence

Do not combine all changes into one uncontrolled migration.

### Phase S0 — prove API boundary

- confirm frontend uses public API only;
- confirm six RPCs do not require direct client grants on internal schemas;
- identify any server-side code using service role against `afl` / `afl_source`.

### Phase S1 — close future accidental exposure

Adopt explicit-grant defaults for newly-created `public` objects. Existing objects remain unchanged until reviewed.

### Phase S2 — close internal schemas to browser roles

Only after S0 verification:

- revoke unnecessary schema usage from `anon` / `authenticated`;
- revoke direct grants on internal tables/sequences/functions;
- preserve required service/server access.

### Phase S3 — public API least privilege

For each `public.afl_api_*` object:

- keep only required SELECT;
- remove INSERT/UPDATE/DELETE from browser roles unless explicitly needed;
- ensure RLS policy matches the intended read model.

For each approved RPC:

- explicitly grant EXECUTE only to required roles;
- revoke EXECUTE from `PUBLIC` where not intended;
- prefer SECURITY INVOKER;
- if SECURITY DEFINER is genuinely necessary, validate inputs, owner, search_path and accessible operations.

### Phase S4 — regression QA

Before merging hardening:

- Match list loads;
- Lineup loads;
- Player Markets loads;
- System Multi loads;
- Multi Lab adds/removes/evaluates legs;
- Match Market quote works;
- Validation page works;
- Review page works;
- T-30 freeze works;
- post-match settlement works;
- injury/stat sync works;
- cron workflows remain healthy.

## Important Supabase 2026 platform change

Supabase is moving Data API exposure toward explicit Postgres grants rather than automatic public-schema grants. AFL Lab should adopt that model deliberately rather than rely on legacy defaults.

## Current action

No RLS, GRANT, REVOKE or schema exposure setting has been changed in Production by this audit. The next database action should be the read-only audit query, followed by a reviewed least-privilege migration.
