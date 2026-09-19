# AFL Match Lab — P1 v63 QA Report

Date: 2026-09-20  
Branch: `main`  
Scope: WHY/RISK enrichment + Role × Opposition Lens + Scenario Sensitivity + Multi Correlation Visualisation

## Product goal

P1 improves interpretability without changing the production prediction engine.

The P1 layer answers:
- Why does this player leg look favourable or difficult?
- How do role and opposition adjustments contribute?
- Which match scenarios are likely to help or pressure the leg?
- How much does multi-leg dependency change the joint probability?
- Which pair is creating the correlation risk?

## Implemented

### 1. Role × Opposition Lens

Added a dedicated panel to Tactics / Scenario.

Inputs are existing production-model fields:
- `role_factor`
- `role_confidence`
- `role_samples`
- `opponent_factor`
- `opponent_samples`
- `opponent_tier`
- lineup named position

The UI shows:
- AFL role bucket / named position
- Role factor
- Opponent factor
- Combined explanatory lens
- Role confidence
- Role and opponent sample sizes
- Favourable / Neutral / Tough label

Important: this is explicitly an explanation of existing independent model adjustments. It is **not** presented as a newly trained role-vs-role probability model.

### 2. Scenario Sensitivity / Stress Test

Added a dedicated Scenario Stress Test panel.

Inputs:
- current `scenario_weights`
- player role / named position
- market type
- team side
- availability / injury state

Outputs:
- HIGH / MEDIUM / LOW sensitivity
- directional impact by the four highest-weight scenarios
- Boost / Slight boost / Neutral / Slight pressure / Pressure

Important guard:
- The stress test does not calculate a replacement probability.
- It does not write to `model_probability`.
- It does not modify `state.legs` probabilities.
- It does not change System Multi generation.
- It is labelled `HEURISTIC · NOT CALIBRATED`.

This is intentionally conservative until scenario-specific settlement evidence is large enough for calibration.

### 3. Player WHY / RISK enrichment

Existing P0 WHY / WHAT CAN BREAK IT explanations now include:
- Role bucket
- Role factor
- Opponent tier and opponent factor
- Scenario sensitivity

This appears only after the full prediction-leg data is available.

### 4. Multi Lab Correlation Visualisation

The existing empirical dependency evaluator remains authoritative.

P1 translates its output into a human-readable decision layer:
- Independent probability
- Dependency-adjusted probability
- Probability-point adjustment
- Aggregate correlation risk: LOW / MEDIUM / HIGH
- Pair-level factor
- Positive joint / Negative joint / Near neutral
- Light / Moderate / Strong dependency
- Pair sample size

Pair factors come from the existing `pair_details` response.

For custom / match-market proxy combinations, the UI explicitly states that the existing proxy dependency method is being used and that the adjusted probability is an estimate.

### 5. System Multi Correlation Risk

System Multi cards now receive a compact correlation-risk badge based on the existing aggregate correlation/dependency factor:
- CORR RISK LOW
- CORR RISK MEDIUM
- CORR RISK HIGH

No System Multi selection or probability logic is changed.

## Files

Added:
- `public/decision-p1-v63.js`
- `public/decision-p1-v63.css`

Updated:
- `public/index.html`
- `package.json`
- `scripts/smoke-check.mjs`

Version:
- `0.63.0`

## QA

JavaScript syntax:
- `public/app.js` — PASS
- `public/premium-ui-v60.js` — PASS
- `public/matchday-p0-v62.js` — PASS
- `public/decision-p1-v63.js` — PASS

P1 static checks:
- Role × Opposition uses existing model fields — PASS
- Role / opponent sample evidence surfaced — PASS
- Scenario explicitly marked non-calibrated — PASS
- No production-probability write from P1 — PASS
- Scenario directional stress logic present — PASS
- Empirical `pair_details` used — PASS
- Independent vs adjusted probability shown — PASS
- Correlation risk bands present — PASS
- System Multi correlation badge present — PASS
- P0 WHY/RISK layer extended rather than replaced — PASS
- Full-leg data loaded lazily on Tactics — PASS
- Duplicate injection guards present — PASS
- Mobile responsive layouts present — PASS
- Scenario matrix is horizontal-scroll safe on small screens — PASS

Result: **P1 code-level gates passed**

## Verification boundary

A direct `npm run verify` clone-run could not be executed in the local execution container because DNS resolution for `github.com` is unavailable there.

The repository itself has no GitHub Actions run / commit status attached to these commits.

The smoke script was syntax-checked as an ES-module body after removing the import declaration for parser compatibility, and its P1 assertions were separately inspected against the current repository files.

Cloudflare live visual rendering is therefore not claimed as directly verified.

## Deferred

Not included in P1:
- calibrated scenario-specific player probabilities
- a true trained role-vs-opposition-role historical model
- weather-driven scenario adjustment
- automatic causal post-match explanation
- navigation simplification / mobile bottom navigation

Those require either new calibrated evidence or belong to P2 product/navigation work.
