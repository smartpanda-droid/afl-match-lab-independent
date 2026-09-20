# AFL Match Lab — P1.3 System Multi Compare QA

Date: 2026-09-20
Version: 0.79.2
Branch: main
Status: **COMPLETE**

## Goal

Make Conservative / Balanced / Aggressive System Multi structures directly comparable without mixing different leg counts.

## Delivered

A new System Multi comparison panel is inserted above the existing detailed multi cards.

### Same-leg-count compare

Available leg counts are discovered from currently loaded / filtered System Multi rows.

The compare layer uses the same leg count for all strategies:

- 2-leg
- 3-leg
- 4-leg
- 5-leg

If the existing System Multi filter already fixes a leg count, the compare layer follows it automatically.

### Strategy columns

For each available strategy:

- Conservative
- Balanced
- Aggressive

The panel shows:

- Combined Probability
- Fair Odds
- Weakest Leg
- Correlation Risk
- Role / TOG Risk
- Market Mix
- Recommended / Watch state

### Weakest Leg

Weakest-leg quality uses already loaded leg evidence:

- leg probability
- recent hit rate
- sample size
- role confidence
- TOG ratio when available
- injury / bench / role-risk penalties

This is a comparison aid only. It does not rewrite recommendation probability.

### Correlation Risk

The compare layer reads the existing correlation penalty and same-player / same-team exposure to classify:

- LOW
- MED
- HIGH

### Role / TOG Risk

Uses loaded availability / leg evidence when available:

- injury flag
- bench flag
- TOG vs baseline
- role confidence
- role factor

No new availability request is made.

### Market Mix

Shows the leading market types plus the existing primary-market mix count where available.

### Detail navigation

Each compare card can scroll to its matching detailed System Multi card.

The existing detailed multi cards and bookmaker-odds / EV workflow are preserved.

## Resource / model safety

P1.3:

- adds no fetch()
- adds no XMLHttpRequest
- adds no application api() call
- does not write model_probability
- does not write leg probability
- does not mutate state.multis
- does not mutate System Multi generation
- does not change Monte Carlo simulation
- does not change bookmaker-odds ranking logic

## Technical QA

- package version 0.79.2 — PASS
- package.json valid — PASS
- p1-multi-compare-v79.js syntax — PASS
- p1-multi-compare-v79.css brace balance — PASS
- loaded after P1.2 Player Decision layer — PASS
- same-leg-count compare — PASS
- Conservative / Balanced / Aggressive columns — PASS
- Weakest Leg — PASS
- Correlation Risk — PASS
- Role / TOG Risk — PASS
- Market Mix — PASS
- no network calls — PASS
- no production-probability mutation — PASS

## Files

Added:
- public/p1-multi-compare-v79.js
- public/p1-multi-compare-v79.css
- QA_REPORT_P1_3_SYSTEM_MULTI_COMPARE_V79.md

Updated:
- public/index.html
- package.json
- P1_MATCHDAY_DECISION_UX.md

## Next

P1.4 — Multi Lab Decision Summary
