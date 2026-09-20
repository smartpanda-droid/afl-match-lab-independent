# AFL Match Lab — P1 Matchday Decision UX

Date: 2026-09-20
Status: **IN PROGRESS**
Start version: **0.79.0**

## Goal

Reduce the number of taps and context switches needed to answer four matchday questions:

1. What match am I looking at and how final is the evidence?
2. Which player / match edges deserve attention?
3. Which System Multi structure is most relevant?
4. What is currently in my Multi Lab and what changes the decision?

## P1 roadmap

### P1.1 Persistent Match Context — COMPLETE in v0.79.0

Across MATCH / PLAYERS / MULTI / LAB, show from existing in-memory state:
- current matchup
- round / venue / start context
- T-minus
- lineup state
- model preview / T-30 sealed / final lock state

Rules:
- no extra database request
- no probability mutation
- hidden on secondary research routes

### P1.2 Player Market Decision Hierarchy — COMPLETE in v0.79.1

Compress each player decision into:
- market + threshold
- model probability
- recent-5 evidence
- role / TOG warning
- confidence
- one primary Add action

Secondary model context stays expandable.

Delivered in v0.79.1:
- per-market Decision Strip
- Recent 5 hit summary
- Role / TOG state
- evidence Confidence using the same loaded-evidence logic as P1 Decision Speed
- context collapsed by default
- no extra data request
- no model probability mutation

### P1.3 System Multi Compare — NEXT

Make Conservative / Balanced / Aggressive structures easier to compare by:
- combined probability
- fair odds
- weakest leg
- correlation risk
- role / TOG risk
- market mix

### P1.4 Multi Lab Decision Summary

Keep the builder focused on:
- selected legs
- dependency-adjusted model probability
- fair odds
- bookmaker odds
- EV / value status
- weakest dependency / risk reason

## P1.1 implementation safety

The Persistent Match Context layer:
- uses only existing `state`
- adds no fetch / API / XHR call
- does not write model probabilities
- updates its countdown locally once per minute
