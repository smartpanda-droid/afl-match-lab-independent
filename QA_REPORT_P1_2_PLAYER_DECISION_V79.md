# AFL Match Lab — P1.2 Player Market Decision Hierarchy QA

Date: 2026-09-20
Version: 0.79.1
Branch: main
Status: **COMPLETE**

## Goal

Make Player Markets answer the decision in one scan without opening model-detail panels.

Decision order:

1. Market + Threshold
2. Model Probability / Fair Odds
3. Recent 5
4. Role / TOG Risk
5. Confidence
6. Add to Multi
7. Secondary Context only when expanded

## Delivered

A new per-market Decision Strip is injected after Recent 5 using already-loaded application state.

Decision Strip fields:

- Recent 5 hit count
- sample size
- Role / TOG state
- injury / bench / TOG warning when present
- evidence Confidence: HIGH / MED / LOW
- evidence score display

Confidence reuses the same evidence components already used by P1 Decision Speed:

- sample size
- role confidence
- lineup-confirmation state
- injury / availability evidence
- recent-vs-model stability

It is an evidence-confidence indicator, not a replacement probability.

Secondary model Context remains available but is collapsed by default.

On mobile, the older player-level P1 risk-chip row is suppressed because the same decision evidence is now shown at the market level, reducing duplication.

## Resource / model safety

P1.2:

- adds no fetch()
- adds no XMLHttpRequest
- adds no application api() call
- does not write model_probability
- does not write leg probability
- does not replace state.legs
- does not replace state.multis
- does not mutate recommendation generation

## Technical QA

- package version 0.79.1 — PASS
- package.json valid — PASS
- p1-player-decision-v79.js syntax — PASS
- p1-player-decision-v79.css brace balance — PASS
- loaded after P1.1 Match Context — PASS
- Recent 5 / Role-TOG / Confidence cells present — PASS
- mobile 3-column decision strip — PASS
- Context collapsed by default — PASS
- no network calls — PASS
- no production-probability mutation — PASS

## Files

Added:
- public/p1-player-decision-v79.js
- public/p1-player-decision-v79.css
- QA_REPORT_P1_2_PLAYER_DECISION_V79.md

Updated:
- public/index.html
- package.json
- P1_MATCHDAY_DECISION_UX.md

## Next

P1.3 — System Multi Compare
