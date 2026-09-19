# AFL Match Lab — Model Reinforcement V2

## Status

**Shadow only. Production remains the control model.**

This reinforcement pass follows the live Supabase model lineage and the current GitHub code rather than the UI labels.

## What the audit found

1. **The active player model is distribution-led rather than truly hybrid for most markets.**
   `hybrid-player-v1.0` uses a distribution weight of 1.0 for Goals, Kicks, Marks, Tackles, Disposals, Handballs, Clearances and Fantasy; Hitouts is 0.5. In practice the empirical branch is ignored for almost every market after it is computed.

2. **The active calibration map is empty.**
   Calibration buckets exist, but the active model has no applied `calibration_map`. A field named `calibrated_probability` can therefore equal the raw probability. Do not promote the current live buckets directly: only two genuine frozen matches have been formally settled and many 5%-wide buckets have tiny samples.

3. **The old retrospective Shadow validator is not the same core engine as Production.**
   The current retrospective runner uses a weighted empirical formula, not the active distribution-led core. Its module gates are useful diagnostics, but they are not an end-to-end validation of `hybrid-player-v1.0 + module`.

4. **Context/Role are correctly gated by market, but only a subset has passed.**
   Current market gates support selected context/role weights for Clearances, Fantasy, Goals and Hitouts. Most other markets remain shadow-only because the holdout did not improve both Brier and LogLoss.

5. **Scenario weights are generated but not used as a true simulation state.**
   Close contest, blowout/garbage time, low-scoring and comeback weights are recorded in match context. They do not currently drive player probabilities and the match-market engine remains a deterministic mean + Normal probability transform.

6. **Derived TOG risk is calculated but normally not applied to player probability unless an explicit injury is active.**
   This leaves a gap for players returning with restricted minutes or anomalously low TOG when there is no active injury row.

7. **Synergy data is rich but should not be used as a direct mean boost yet.**
   Thousands of pair correlations exist. Correlation is not causation; V2 keeps synergy for dependency/covariance work until a strict cutoff walk-forward proves a mean effect.

8. **System Multi has configuration drift.**
   The README describes the newer bookmaker-available probability/fair-odds bands, while the database recommendation function still contains older higher anchor/value constants. The backend should move to one versioned config source instead of hard-coded bands.

## Shadow V2 added in this repository

`database/simulation_v2_shadow.sql` adds three shadow-only functions:

- `afl.shadow_v2_team_availability(match_id)`
  - converts selected-player availability/TOG risk into a bounded team score factor;
  - uses last-eight fantasy average only as an importance weight;
  - never increases a team's mean above the control model.

- `afl.shadow_v2_player_legs(prediction_run_id)`
  - applies only **derived TOG risk that Production has not already applied**;
  - includes an explicit double-penalty guard;
  - leaves bench penalties off until separately validated.

- `afl.match_simulation_v2_shadow(match_id, line, total, draws)`
  - keeps the current match-market mean as the control anchor;
  - uses deterministic pseudo-random draws for reproducibility;
  - lets close/blowout/low-score/comeback context alter **uncertainty only**, not the mean, avoiding double-counting team form;
  - outputs score/margin/total P10/P50/P90 ranges as well as win/cover/total probabilities;
  - does not expose a public API or change Production.

## Validation redesign required before promotion

### A. Same-bloodline walk-forward

Build the next validator from the exact active core engine. For each historical target match, use only information available before that match.

### B. Cluster-weighted scoring

A player-market can have many thresholds. Do not allow six thresholds from one player-market to count as six independent observations. Give each `match × player × market` cluster total weight 1.

Report both:

- all-threshold Brier / LogLoss;
- tradable-band Brier / LogLoss for fair odds approximately 1.20–2.20.

### C. Re-search the "hybrid" weights

For each market, search distribution-vs-empirical weights such as:

`0 / 0.25 / 0.50 / 0.75 / 1.00`

The current default of 1.00 should have to beat the hybrid alternatives on chronological holdout.

### D. Distribution family by market

Do not force one Gaussian family across all count stats.

- Goals: Poisson is a reasonable starting point; test over-dispersion.
- Disposals/Kicks/Handballs/Fantasy: compare decayed Normal with empirical CDF blend.
- Marks/Tackles/Clearances/Hitouts: prefer empirical CDF / over-dispersed count alternatives over blindly assuming Normal tails.

### E. Formal promotion gate

Run the review every 10 genuine frozen matches, but only promote a module/market automatically when:

- strict T-30 snapshot exists;
- sample count and effective cluster count meet the minimum;
- holdout Brier improves or is non-inferior;
- holdout LogLoss improves or is non-inferior;
- no material regression appears in finals / role-change / injury-risk segments;
- calibration remains monotonic and sufficiently sampled.

## Production changes that should NOT be made yet

- Do not copy the current 5%-bucket calibration table straight into the active model.
- Do not turn all context/role weights to 1.
- Do not use synergy correlation as a direct probability multiplier.
- Do not apply both explicit-injury and derived-TOG penalties to the same leg.
- Do not replace the current match quote with the V2 simulator before formal frozen-match validation.
