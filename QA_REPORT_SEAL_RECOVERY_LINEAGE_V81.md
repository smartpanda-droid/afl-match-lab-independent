# P0 Seal Recovery + P1 Prediction Lineage — QA

Date: 2026-09-27
Status: COMPLETE

## Root cause
The 2026-09-26 pregame workflow failed at T-240, T-120, T-60 and T-30 with:
`column reference "confirmed" is ambiguous`.

`afl_source.ingest_lineup_payload` declared a local `confirmed` variable while also querying
`afl.match_players.confirmed` without qualification. Because the T-60 sync never completed,
no final prediction run/data snapshot could be frozen and the final workflow correctly became
`skipped / missed_final_window`.

The System Multi redesign also introduced a second architectural risk: browser Monte Carlo
rows (`state.systemSimulationRows`) are presentation/search output and must never be treated
as authoritative immutable history. The official seal contract therefore remains database-side
and canonical.

## Production fixes
- Renamed the ambiguous local variable to `v_confirmed` and qualified match-player columns.
- Added private `afl.seal_registry`.
- Added immutable-snapshot integrity calculation and lineage.
- Added canonical Multi completeness gate: 3 strategies x 4 leg counts = 12 groups.
- Added future-data guard: prediction run source timestamp cannot exceed sealed cutoff.
- Added SHA-256/model/run/cutoff/workflow provenance.
- Added explicit READY / SEALED / PARTIAL / MISSED / RECOVERED states.
- Added five-minute `afl-seal-health` cron.
- Added read-only RLS-protected `public.afl_api_seal_health`.
- Added covering indexes for new foreign keys.
- No browser write endpoint was introduced.

## Historical audit
| Match | Result |
|---|---|
| 2026-09-19 Hawthorn v Brisbane | SEALED · Integrity 100 · 12 canonical groups |
| 2026-09-18 Sydney v Fremantle | SEALED · Integrity 100 · 12 canonical groups |
| 2026-09-12 Brisbane v Adelaide | SEALED · Integrity 100 · 12 canonical groups |
| 2026-09-11 Fremantle v Geelong | SEALED · Integrity 100 · 12 canonical groups |
| 2026-09-26 Fremantle v Brisbane | MISSED · missed_final_window |

The 2026-09-26 match was deliberately **not** backfilled as SEALED because no legitimate T-60
snapshot exists. This prevents hindsight leakage into validation/calibration.

## Acceptance
- Existing valid seals remain immutable.
- Missing history is represented explicitly rather than reconstructed with current data.
- Future seals automatically register lineage and integrity.
- System Multi UI changes can no longer redefine the validation bloodline.
- Public clients can read seal health but cannot forge or mutate seals.
