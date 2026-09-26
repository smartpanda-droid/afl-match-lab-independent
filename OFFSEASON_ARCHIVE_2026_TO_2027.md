# AFL Match Lab — Off-season Archive

**Archive start:** 2026-09-27  
**Target wake date:** 2027-02-01  
**Mode:** READ-ONLY OFF-SEASON / SEASON HIBERNATION

## Frozen state
The public site remains available for viewing the completed 2026 season, sealed snapshots,
validation history and post-match review. The Supabase project remains active so historical
pages continue to load.

The following AFL cron jobs were deliberately deactivated (not deleted):

| Job | Archived schedule |
|---|---|
| afl-independent-release-gate | 17 */6 * * * |
| afl-independent-weekly-validation | 0 0 * * 2 |
| afl-event-driven-master | */30 * * * * |
| afl-pregame-fast-finalizer | */2 * * * * |
| afl-seal-health | */5 * * * * |

Do not reactivate these jobs during the off-season unless an explicit maintenance/QA session
requires it.

## Preserve
- final_prediction_snapshots and SHA-256 seals
- seal_registry / prediction lineage
- final recommendation snapshots and settlements
- V2.1 same-bloodline validation history
- match/player historical data used for 2027 priors
- model versions, calibration state and release-gate history
- public read-only API projections required by the archived site

## 2027 wake-up sequence
Do not simply turn all jobs on at once.

1. Pull 2027 fixture/team/player identity changes.
2. Verify AFL source endpoints and lineup payload schema.
3. Run schema/API compatibility QA.
4. Refresh player history and 2027 preseason availability/role priors.
5. Run one dry-run match through pregame sync -> prediction -> canonical 12 System Multis.
6. Verify T-60 seal lineage and Integrity 100.
7. Verify T-30 same-bloodline validation capture.
8. Verify settlement/post-match review without future-data leakage.
9. Re-enable event-driven master and pregame finalizer.
10. Re-enable seal health, weekly validation and release gate only after QA passes.

## Acceptance state at archive
P0 Seal Recovery: CLOSED  
P1 Prediction Lineage: CLOSED  
Known 2026 valid seals: Integrity 100, canonical groups 12/12.  
2026-09-26 Fremantle v Brisbane remains MISSED / missed_final_window and must never be
retroactively rewritten as a legitimate T-60 seal.

This file is the operational handoff for the 2027 preseason restart.
