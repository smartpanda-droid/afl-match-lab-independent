# AFL Match Lab — P1 Decision Speed QA

Date: 2026-09-20  
Scope: Player Market Ranking + System Multi Decision Intelligence + Role / TOG Risk  
Branch: `main`

## Delivered

### Player Markets — Decision Scanner

Added a fast ranking layer above the full player market board with five modes:

- Best Edges
- Confidence
- Value Watch
- Role Change
- Injury / TOG

The scanner reuses the already-loaded prediction legs and availability data. It does not make its own network request.

The ranking layer also adds compact player risk chips for:
- role uplift / pressure
- bench status
- injury watch
- latest TOG versus baseline TOG when availability evidence is already loaded

Value Watch is explicitly a fair-odds shortlist, not an EV claim. Actual bookmaker odds are still required before a value / EV conclusion.

### System Multi — decision explanation

Each visible System Multi card now adds:

- WHY THIS COMBO
- WEAKEST LEG
- CORRELATION RISK
- ROLE / TOG risk strip

The explanation reuses the same current multi structure, market mix, dependency penalty, probability, recent hit rate, sample size, role evidence, bench status, injury evidence and TOG evidence already present in application state.

No new recommendation or probability is produced by this layer.

### Resource behaviour

P1 Decision Speed:
- adds no `fetch()`
- adds no `XMLHttpRequest`
- adds no app `api()` call
- does not write `model_probability`
- does not write leg `.probability`
- does not replace `state.legs`
- does not replace `state.multis`
- does not replace `state.matchQuote`

System Multi can show TOG evidence when availability data was already loaded by Player Markets. When it is not preloaded, the UI states this rather than issuing another database request.

## QA

Repository smoke suite: **90 / 90 PASS**

JavaScript syntax PASS:
- public/app.js
- public/matchday-p0-v62.js
- public/decision-p1-v63.js
- public/navigation-p2-v64.js
- public/p0-completion-v65.js
- public/decision-speed-p1-v75.js
- public/config.js

CSS:
- decision-speed-p1-v75.css brace balance: PASS
- <= 900 px responsive rules: PASS
- <= 560 px mobile rules: PASS
- mobile player ranking collapses to one column: PASS
- System Multi intelligence grid collapses progressively: PASS

HTML / asset wiring:
- decision-speed-p1-v75.css linked after current page-specific styles
- decision-speed-p1-v75.js linked after P0 completion
- no literal newline escape markup remains

Regression coverage remains PASS for:
- Match / P0 Cockpit
- Player Markets
- System Multi
- Multi Lab
- Field
- Tactics
- Validation
- Shadow Live
- P2 navigation
- mobile Safari-safe icons
- P0 freshness / late-change / review
- model-safety checks

## Deployment note

Changes are committed to `main`. No GitHub Actions workflow run is attached to the P1 commit, so Cloudflare Pages deployment status is not independently confirmed by GitHub Actions.
