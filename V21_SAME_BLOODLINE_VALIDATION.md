# AFL Match Lab — V2.1 Same-Bloodline Validation

Date: 2026-09-20  
Status: **DEPLOYED IN SHADOW / PROMOTION DATA COLLECTION ACTIVE**

## Purpose

V2.1 compares Production and Shadow using the same prediction run, the same players, the same markets and thresholds, and a point-in-time data cutoff.

The main protection added in V2.1 is that historical Shadow validation no longer reads the current `player_availability_state`. TOG availability is rebuilt as-of each snapshot cutoff using only player statistics whose source timestamp was available by that cutoff.

## Promotion sample

Only `t30_live` snapshots can enter the promotion gate.

A snapshot is promotion-eligible only when:

- source cutoff is T-30 ±15 minutes;
- lineup is confirmed;
- fallback lineup is not used;
- the Production run has prediction legs;
- Control and Shadow use the exact same leg set.

Historical T-58 frozen snapshots are stored as `legacy_t60_reference` and are never promotion-eligible.

## Scoring unit

Primary scoring uses:

`match × player × market`

Each cluster receives total weight 1 regardless of how many thresholds exist inside that market. This prevents markets with many threshold rows from dominating Brier and LogLoss.

Metrics:

- cluster-weighted Brier score;
- cluster-weighted LogLoss;
- cluster-weighted calibration ECE;
- adjusted-subset Brier / LogLoss;
- by-market regression checks.

Positive gain means Shadow is better than Control.

## Promotion gate

Minimum evidence:

- 10 promotion-eligible T-30 matches;
- 300 clusters;
- 20 derived-TOG adjusted clusters;
- positive global Brier gain;
- positive global LogLoss gain;
- positive adjusted-subset Brier gain;
- positive adjusted-subset LogLoss gain;
- calibration ECE cannot regress by more than 0.005;
- no market with at least 30 clusters may regress in Brier by more than 0.005.

Even after a gate PASS, Production is **not** automatically changed.

The system stores gate history and requires two consecutive PASS checkpoints before reporting:

`PASS_STREAK_READY`

`auto_promote = false`

## Initial reference QA

Two real frozen T-58 matches were backfilled only to test the pipeline:

- 9023
- 9030

Reference sample:

- 2 matches
- 4,136 settled threshold legs
- 792 match-player-market clusters
- 94 adjusted threshold legs
- 18 adjusted clusters

Reference result:

- Control cluster Brier: 0.075081
- Shadow cluster Brier: 0.075129
- Brier gain: -0.000049
- Control LogLoss: 0.243273
- Shadow LogLoss: 0.243521
- LogLoss gain: -0.000247
- Control ECE: 0.024114
- Shadow ECE: 0.023790

Adjusted subset:

- Brier gain: -0.002144
- LogLoss gain: -0.010882

This reference result does **not** support promotion and is not treated as formal evidence because it contains only two T-58 matches with unconfirmed lineups.

It does, however, provide an important early warning: a flat derived-TOG multiplier such as 0.88 should not be promoted just because it is intuitively plausible.

## Automatic capture

No additional pg_cron job was added.

The existing `afl.event_driven_tick()` calls `afl.v21_validation_tick()`.

For the next scheduled match, external ID 9028, a T-30 pregame workflow event already exists at:

2026-09-26 04:00 UTC

When that event completes, V2.1 will attempt to freeze the first genuine T-30 Same-Bloodline sample. Promotion eligibility still depends on a confirmed lineup.

## Files

- `database/same_bloodline_validation_v21.sql`
- `database/v21_event_driven_integration.sql`
- `database/simulation_v2_shadow.sql`
- `MODEL_REINFORCEMENT_V2.md`
