# AFL Match Lab — P2 v64 QA Report

Date: 2026-09-20  
Branch: `main`  
Scope: Primary navigation simplification + Multi workspace + mobile Bottom Nav + Matchday decision flow

## Product goal

P2 changes the information architecture from eight equal-weight top-level destinations into a matchday-first structure:

**MATCH | PLAYERS | MULTI | REVIEW | MORE**

No prediction, pricing, settlement, validation or Supabase data logic is removed.

## Implemented

### 1. Five-entry primary navigation

Desktop and mobile now expose only five primary destinations:

- MATCH — Matchday Cockpit
- PLAYERS — Player Markets
- MULTI — System Multi + Multi Lab
- REVIEW — post-match results and learning
- MORE — deeper research and model operations

The original real views stay in the DOM and continue to be controlled by the existing `switchView()` function.

### 2. MULTI workspace

`SYSTEM MULTI` and `MULTI LAB` are no longer separate top-level destinations.

The MULTI workspace contains two modes:
- System Picks
- Multi Lab

Existing:
- System Multi generation
- bookmaker odds inputs
- empirical dependency evaluation
- P1 correlation visualisation
- manual builder state

remain unchanged.

### 3. MORE hierarchy

Secondary research and technical pages are grouped instead of competing with matchday decision pages.

Match research:
- Field / Lineup
- Tactics / Scenario

Model operations:
- Validation
- Shadow Live

System status:
- mirrors the existing `healthBadge`
- retains the existing refresh workflow
- does not create a second health source

### 4. Mobile Bottom Navigation

At <= 900px the primary navigation is a fixed five-column Bottom Nav:
- Match
- Players
- Multi
- Review
- More

It includes:
- iOS safe-area support
- builder-count badge
- fixed bottom positioning
- More drawer above the Bottom Nav
- removal of the old horizontal / four-tab mobile navigation from the visible UI

### 5. Matchday Decision Flow

Decision pages now surface the intended sequence:

1. Read Match
2. Find Edges
3. Build Multi
4. Review

The flow is navigational only and does not alter model state.

### 6. Secondary-context treatment

Field, Tactics, Validation and Shadow Live now visually identify themselves as secondary research / model-operation workspaces, including a direct Back to Match action.

### 7. Legacy compatibility

The old eight-tab navigation remains in the DOM for compatibility with existing app bindings, but becomes hidden only after the P2 shell initialises successfully via:

`body.p2-nav-ready`

This avoids a blank-navigation failure if the P2 script does not initialise.

## Files

Added:
- `public/navigation-p2-v64.js`
- `public/navigation-p2-v64.css`

Updated:
- `public/index.html`
- `package.json`
- `scripts/smoke-check.mjs`

Version:
- `0.64.0`

The P2 activation also normalised old literal `\n` separators in the HTML head into real line breaks.

## QA

JavaScript syntax:
- `public/app.js` — PASS
- `public/premium-ui-v60.js` — PASS
- `public/matchday-p0-v62.js` — PASS
- `public/decision-p1-v63.js` — PASS
- `public/navigation-p2-v64.js` — PASS

P2 activation gates:
- version / package syntax gate — PASS
- P2 CSS linked — PASS
- P2 JS linked after P1 — PASS
- HTML head normalised — PASS
- five primary routes — PASS
- real Multi views preserved — PASS
- Review view preserved — PASS
- Field / Tactics / Validation / Shadow preserved — PASS
- legacy nav hidden only after successful P2 init — PASS
- desktop 218px / compact 200px sidebar compatibility — PASS
- mobile five-column Bottom Nav — PASS
- mobile safe-area support — PASS
- More drawer hierarchy — PASS
- system status uses existing health monitor — PASS
- Multi two-mode workspace — PASS
- four-stage Matchday flow — PASS
- existing `switchView()` remains authoritative — PASS
- P0 and P1 layers remain linked — PASS
- no model / probability mutation from P2 — PASS
- P2 smoke assertions present — PASS
- smoke module body syntax — PASS

Result: **21 / 21 P2 activation gates passed**

## Verification boundary

The repository currently has no GitHub Actions / commit status attached to these commits.

The available execution container cannot directly clone from `github.com`, so a direct local `npm run verify` clone-run was not available.

Cloudflare Pages live rendering is therefore not claimed as visually verified in this report.

The repository build chain remains:
- production branch: `main`
- build: `npm run build`
- output: `dist`
- build copies `public/` to `dist/`

## Resulting product hierarchy

### Level 1 — Decision
MATCH / PLAYERS / MULTI / REVIEW

### Level 2 — Evidence / Research
Field / Lineup / Tactics / Scenario

### Level 3 — Model Operations
Validation / Shadow Live / system health

This matches the intended AFL Matchday Intelligence & Decision Lab structure.
