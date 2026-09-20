# AFL Match Lab — P0 Matchday Decision Cockpit QA

Date: 2026-09-20  
Scope: P0 Matchday Decision Cockpit / first-screen decision speed  
Branch: `main`

## Delivered

- Rebuilt the Match first-screen decision layer around a 10-second scan.
- Match Call now combines predicted winner, win probability and approximate fair margin.
- Projected score and total direction remain visible without opening detailed quote controls.
- Probability and Confidence are explicitly separated.
- Added model stage badge: Pregame / T-30 Sealed / Final Lock.
- Added lineup status and source-age status to the cockpit.
- Added Top 3 Player Edges, diversified by player and weighted by probability, recent form, sample size, evidence confidence and injury risk.
- Added Key Risk summary covering lineup uncertainty, injury flags, module errors, stale decision data and low/medium model confidence.
- Hid the older duplicate Match highlight strip; underlying data/rendering remains intact.
- Added compact responsive layouts for desktop, tablet and mobile.
- Normalised Match Confidence evidence objects so the shared confidence renderer handles match- and player-level evidence consistently.

## Safety / model integrity

P0 remains a presentation and decision-support layer.

Verified no assignment to:
- `model_probability`
- player `.probability`
- `state.legs`
- `state.multis`
- `state.matchQuote`

Verified P0 adds no network/API calls.

## QA results

### JavaScript syntax

PASS:
- public/app.js
- public/premium-ui-v60.js
- public/matchday-p0-v62.js
- public/decision-p1-v63.js
- public/navigation-p2-v64.js
- public/p0-completion-v65.js
- public/config.js

### Repository smoke suite

Result: **78 / 78 PASS**

The smoke suite was updated to assert:
- 10-second Matchday Cockpit exists
- Probability and Confidence remain separate
- Top 3 player edge scan exists
- Key Risk summary exists
- mobile compact cockpit styles exist
- duplicate legacy Match highlight strip is suppressed
- all previous P0/P1/P2/navigation/player/multi/review/validation checks still pass

### CSS / dependency checks

PASS:
- P0 CSS brace balance
- updated JS/CSS cache-bust references in index.html
- no later P1/P2/P0-completion/UI-QA stylesheet currently overrides the new Matchday cockpit selectors
- desktop / <=900 px / <=560 px breakpoints present

## Deployment note

Changes are committed to `main`. No GitHub Actions workflow run is attached to the final commit, so Cloudflare Pages deployment status is not independently confirmed by GitHub Actions in this QA.
