# AFL Match Lab — v66 All-Page UI / Mobile QA

Date: 2026-09-20  
Branch: `main`  
Version: `0.66.0`

## Trigger

Mobile screenshots showed that the original premium layer still contained a global rule:

`button { background: var(--aml-green) !important; }`

That rule could override component-level button styling throughout later P0/P1/P2 pages.

The first visible symptom was the Bottom Nav. After the Bottom Nav was isolated, the same root cause became visible in the Matchday Decision Flow: the flow cards rendered as dark-green blocks with dark text.

This v66 pass audits the full site, not only navigation.

## New final UI layer

Added:

- `public/ui-qa-v66.css`

It is loaded **after all previous CSS layers** so it can safely restore component-specific semantic styling without changing application logic.

## Page-by-page fixes

### MATCH

- Matchday Decision Flow no longer inherits the global green button background.
- Mobile flow is now a **4-column grid** so all four steps are visible at once:
  1. Read Match
  2. Find Edges
  3. Build Multi
  4. Review
- Flow supporting copy is hidden on narrow mobile widths to prevent clipping.
- Match line / total +/- controls use a light secondary-control treatment.
- Supporting metadata text receives a readable mobile minimum size.
- Bottom navigation isolation from v65.2 remains active.

### PLAYERS

- Threshold +/- buttons are restored to a light secondary-control style.
- Threshold input remains high contrast.
- Add Leg remains a primary green CTA.
- Disabled Add Leg receives a distinct neutral disabled style.
- Recent / context text remains readable on mobile.
- Mobile player-market layout retains its three-column decision row with threshold controls below.

### SYSTEM MULTI

- System filter reset remains a white secondary action.
- Confirm remains the primary action.
- System Multi cards remain unchanged.
- Send to Multi Lab remains a primary green CTA.
- Mobile market-filter controls use two columns instead of an overly compressed layout.

### MULTI LAB

- P2 System Picks / Multi Lab selector is now a neutral segmented control.
- Match-market choice cards are white decision cards instead of global-green buttons.
- Remove Leg uses a red semantic destructive style.
- Builder Value remains the primary green action.
- Mobile builder metrics reduce to two columns.
- Match-leg cards stay readable at narrow widths.

### REVIEW

- Matchday Decision Flow is fixed here as well.
- Review Refresh stays a white secondary action.
- Review selector uses a smaller mobile font so team names and dates remain visible for longer.
- Existing mobile Review card/table transformation is retained.
- P0 Decision → Result → Learning and v65 learning KPIs remain unchanged.

### FIELD / LINEUP

- Team filter buttons no longer all inherit green.
- Only the active team filter receives a strong active colour.
- Lineup player cards are restored to white/dark-text cards.
- Bench and Emergency field-player states use amber/red semantic backgrounds.
- Mini-field team dots retain their team-specific purple / blue colours.
- Player modal close, probability bands and threshold choices are restored to their intended neutral/soft styles.
- Lineup floating builder close/remove controls remain secondary; open remains primary.

### TACTICS / SCENARIO

- Existing P1 Role × Opposition and Scenario Stress Test remain intact.
- Scenario table retains horizontal touch scrolling where required.
- P1 cards are constrained against mobile overflow.
- Secondary context Back to Match action no longer inherits primary-green button styling.

### VALIDATION

- Wide validation tables retain touch scrolling.
- The first column is sticky on mobile.
- Table header remains sticky and visually separated.
- Mobile table text is normalised for readability.
- Existing Validation calculations and release gates are untouched.

### SHADOW LIVE

- Timeline header wraps on narrow screens.
- Timeline card padding is reduced on mobile.
- Shadow metrics get compact visual grouping.
- Observation content, sequence, deltas and final-lock logic are unchanged.

### MORE

- Research / system drawer cards use soft secondary surfaces rather than dark-green buttons.
- Selected More item uses a distinct pale-green state.
- Drawer close and system refresh controls have explicit secondary styling.
- Existing More routing is unchanged.

## Navigation

Primary navigation remains:

**MATCH | PLAYERS | MULTI | REVIEW | MORE**

The v65.2 Bottom Nav fix remains:
- inactive: white/transparent + blue-grey icon/text
- active: pale green + dark green icon/text
- explicit Safari-safe SVG geometry
- iOS safe-area support

## Static page / route audit

Static views present:

- match
- players
- system-multi
- multi-lab
- field
- tactics
- validation
- shadow-live

Dynamic Review view:
- still created by `initReviewPage()`
- still routed through existing `switchView()`

No duplicate static HTML IDs were found.

## Semantic-button audit

The v66 layer explicitly covers 19 component groups vulnerable to the global premium button rule:

- threshold +/-
- match line / total +/-
- multi remove
- match-market choice cards
- lineup filters
- lineup player cards
- field players
- mini-field dots
- player modal close
- probability bands
- threshold choices
- lineup floating controls
- P2 flow buttons
- P2 Multi modes
- P2 More cards
- P2 secondary Back
- Review controls
- Validation tables
- Shadow timeline layout

Primary actions intentionally remain green.

## QA result

### JavaScript syntax

PASS:
- `public/app.js`
- `public/premium-ui-v60.js`
- `public/matchday-p0-v62.js`
- `public/decision-p1-v63.js`
- `public/navigation-p2-v64.js`
- `public/p0-completion-v65.js`

### CSS structure

Brace balance PASS:
- styles.css
- premium-ui-v60.css
- matchday-p0-v62.css
- decision-p1-v63.css
- navigation-p2-v64.css
- p0-completion-v65.css
- ui-qa-v66.css

### Full v66 gates

**22 / 22 PASS**

Including:
- v0.66.0 active
- v66 CSS linked last
- no literal `\n` text
- all eight static views
- dynamic Review view
- no duplicate static IDs
- five P2 routes preserved
- mobile four-step Matchday Flow
- Bottom Nav isolation retained
- Review mobile readability
- Validation sticky/touch table handling
- Shadow wrapping
- readable supporting text
- build chain unchanged
- smoke parser PASS
- all JS syntax PASS
- all CSS structure PASS
- all audited semantic control classes covered

## Data / model safety

This UI QA pass does not change:
- model probabilities
- player prediction legs
- System Multi generation
- Multi Lab dependency calculation
- Supabase schemas
- T-30 sealing
- T+8 settlement
- Review result calculation
- calibration / validation logic

## Deployment verification boundary

Repository `main` and the build chain are verified.

The current tool environment cannot resolve the public Cloudflare Pages hostname, so this report does **not** claim an independent live-browser render of all nine pages after deployment.

The two supplied iPhone screenshots were used to identify the real rendered regressions that triggered this pass.

## Status

**All-page UI clarity pass — COMPLETE at code / build level.**
