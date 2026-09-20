# AFL Match Lab — P2 Product Simplification QA

Date: 2026-09-20  
Scope: Four-route Matchday navigation + More / Model Lab + mobile path simplification  
Branch: `main`  
Package version: `0.76.0`

## Delivered

### Four primary Matchday routes

Primary navigation is now limited to:

1. MATCH
2. PLAYERS
3. SYSTEM MULTI
4. MULTI LAB

System Multi and Multi Lab are separate first-class actions instead of sharing one primary Multi route.

### More / Model Lab

Secondary functionality remains available but no longer competes with Matchday actions.

Groups:

- Review & learning
  - Match Review
- Match research
  - Field / Lineup
  - Tactics / Scenario
- Model Lab
  - Validation
  - Shadow Live

Desktop exposes More / Model Lab as a secondary sidebar control.
Mobile exposes More from the header while retaining only four bottom-navigation items.

### Matchday flow

The compact decision flow now follows:

Read Match → Find Edges → System Picks → Build Multi

Review is intentionally removed from the primary live-match flow and remains available under More / Review & learning.

### Secondary-page escape path

Review, Field / Lineup, Tactics / Scenario, Validation and Shadow Live receive:
- More / Model Lab access
- direct Back to Match action

### Mobile

- bottom navigation: 4 columns
- Match / Players / System / Multi Lab only
- More / Model Lab moved to header
- More drawer remains above the safe-area bottom navigation
- desktop labels and mobile labels are separated
- old legacy tabs remain DOM-compatible but hidden once P2 navigation is ready

## Safety / resource behaviour

P2 navigation adds:
- no API calls
- no fetch calls
- no model recalculation
- no probability mutation

Verified no assignment to:
- `model_probability`
- leg `.probability`
- `state.legs`
- `state.multis`
- `state.matchQuote`

## QA

Repository smoke suite: **94 / 94 PASS**

JavaScript syntax PASS:
- public/app.js
- public/matchday-p0-v62.js
- public/decision-p1-v63.js
- public/navigation-p2-v64.js
- public/p0-completion-v65.js
- public/decision-speed-p1-v75.js
- public/config.js

CSS:
- navigation-p2-v64.css brace balance: PASS
- ui-qa-v66.css brace balance: PASS
- four-column mobile bottom nav: PASS
- mobile safe-area padding: PASS
- More / secondary control isolation from global button styles: PASS

Asset wiring:
- navigation CSS cache-busted to 20260920-4
- navigation JS cache-busted to 20260920-4
- no literal newline escape markup

Regression coverage remains PASS for:
- P0 Matchday Cockpit
- P1 Decision Speed
- Player Markets
- System Multi
- Multi Lab
- Match Review
- Field
- Tactics
- Validation
- Shadow Live
- mobile Safari-safe SVG navigation
- freshness / late-change / settlement layers

## Deployment note

No GitHub Actions workflow run is attached to the P2 commit chain. Repository-side implementation and QA are complete; external Cloudflare rendering requires deployment-side verification.
