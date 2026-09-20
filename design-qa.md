# Design QA — AFL Match Lab v78.3 iPhone Hotfix

Date: 2026-09-20
Final result: blocked

## Source visual truth

- Reference concept image: `/mnt/data/afl_match_lab_analytics_showcase.png`
- Source pixels: 1672 × 941
- Reference contains both desktop and mobile responsive concept language.

## Implementation evidence

- Match page iPhone Safari screenshot supplied by user: `/mnt/data/IMG_2774.png`
- Implementation pixels: 1170 × 2532
- Reported viewport class: iPhone / approximately 390 CSS px wide at @3x density.
- Player Markets iPhone screenshot: supplied in chat in the same QA session, but the current tool runtime did not expose a container file path for it.

## State

- Production Cloudflare Pages mobile Safari.
- Match screenshot shows one Multi Lab leg selected.
- Player Markets screenshot represents the live mobile Player Markets route.

## Full-view comparison evidence

### Iteration 1 — Match mobile
Earlier visible P1/P2 findings:
1. Old P2 four-step flow remained visible in addition to v78 mobile navigation.
2. Summary / Markets / Multi / Insights quick tabs inherited a global solid-blue button rule.
3. Bottom navigation retained older green active styling.
4. Sticky Multi Lab bar obscured content and occupied too much vertical space.
5. Win Probability team labels wrapped/collided inside a narrow KPI card.
6. Old P0 status/decision layers duplicated v78 Hero/KPI information above the fold.

Fixes applied in v78.3:
- Removed the broad global solid-blue button selector; CTA colour is now explicit.
- Hide `#matchdayStatusStrip`, `#matchdayDecisionBand`, and `.p2-decision-flow` on mobile.
- Isolate `#v78MobileMatchTabs` as a neutral segmented control.
- Force the P2 bottom nav into the v78 white/blue floating mobile treatment.
- Compact the Multi Lab sticky bar and give content/nav safe-area clearance.
- Truncate narrow KPI team labels instead of wrapping.
- Reduce mobile cockpit carousel height.

Post-fix screenshot evidence:
- Not yet available in this chat. Re-capture after Cloudflare deploy/cache refresh is required.

### Iteration 2 — Player Markets mobile
Visible/design-level P1/P2 findings:
1. Player Markets still carried the older V72 green marketing-hero language while Match had moved to the v78 white/navy/blue system.
2. Large hero + 3-step workflow consumed too much first-screen height.
3. Search/filter toolbar was visually heavy for a frequent-use matchday tool.
4. Player cards used green identity/action styling inconsistent with v78.
5. Threshold controls, probability, Recent 5, context details and Add to Multi competed for space instead of following one clear decision order.
6. Mobile footer stacked context and Add to Multi vertically, making each market card unnecessarily tall.

Fixes applied in v78.3:
- Convert the mobile Player Markets hero into a compact white title card.
- Hide the long hero paragraph and 3-step workflow on mobile.
- Pin the search/filter toolbar below the app header with smaller controls.
- Convert player identity/action accents from green to v78 blue.
- Tighten market rows and Recent 5 cells.
- Keep context secondary and place Add to Multi beside it in a compact footer.
- Keep player cards single-column and touch-friendly.

Post-fix screenshot evidence:
- Not yet available. The current session has only the pre-fix Player Markets chat screenshot.

## Focused-region checks

### Typography
- Target: compact sports-terminal hierarchy with readable 13–18px mobile headings and 7–10px secondary labels.
- Fix: reduced marketing-scale Player Markets typography and removed redundant copy on mobile.

### Spacing / layout rhythm
- Target: first actionable content should appear quickly below the fixed app header.
- Fix: removed duplicate Match flow/status blocks, compressed Player Markets hero, toolbar, cards, and sticky builder.

### Colors / tokens
- Target: white/navy/blue product language; green reserved for positive/value state.
- Fix: removed accidental global blue button leak and old green primary-action treatment on Player Markets.

### Image / asset quality
- Team-logo safe-area fixes from v78.2 remain active.
- No new image assets were substituted in v78.3.

### Copy / content
- Mobile decision path remains MATCH / PLAYERS / MULTI / LAB.
- Player Markets keeps search, market filter, probability, Recent 5, context, and Add to Multi while removing explanatory hero copy from mobile first view.

## Primary interactions checked in source

- Quick-tab click routing preserved.
- P2 bottom navigation routing preserved.
- Multi Lab sticky bar click routing preserved.
- Player search/filter element IDs unchanged.
- Threshold controls and Add to Multi selectors unchanged.
- No Supabase/model/seal/settlement logic changed.

## Technical regression checks

- package version: 0.78.3
- package.json valid: PASS
- showcase-ui-v78.js syntax: PASS
- showcase-ui-v78.css brace structure: PASS
- CSS/JS cache key: 20260920-4
- viewport-fit=cover retained
- responsive safe-area rules retained

## Blocker

A passing visual QA requires a post-fix browser-rendered screenshot at the same iPhone state. The current chat tooling cannot capture the deployed Cloudflare page directly, and the user has not yet supplied a post-v78.3 screenshot.

Once a refreshed screenshot is supplied, compare it against the same mobile concept and this report can move from `blocked` to `passed` if no actionable P0/P1/P2 differences remain.


---

# v78.4 Mobile Consistency Pass

Date: 2026-09-20
Final result: blocked

## New implementation screenshots reviewed

- Match mobile: `/mnt/data/IMG_2774.png`
- Player Markets mobile: `/mnt/data/CC7BCA1D-59D4-4F78-81FD-8E37F5709D17.png`
- System Multi mobile: `/mnt/data/IMG_2776.png`
- Multi Lab mobile: `/mnt/data/IMG_2777.png`
- More / Model Lab drawer: `/mnt/data/IMG_2778.png`
- Source concept: `/mnt/data/afl_match_lab_analytics_showcase.png`

All supplied implementation captures are iPhone Safari at approximately 390 CSS px wide, rendered at @3x density.

## Findings from the new screenshots

### [P1] Legacy Match journey reinserted after v78 sync
Evidence: the live Match capture still displayed Read Match / Find Edges / System Picks / Build Multi after v78.3.
Root cause: `navigation-p2-v64.js` reinserted `.p2-decision-flow` in a delayed post-render scaffold after the v78 sync had already run.
Fix in v78.4:
- Mobile `ensureFlows()` now removes existing flows and returns before creating any.
- v78 runtime also observes DOM insertion and hides legacy Match status/decision layers on mobile.

### [P1] System Multi hero had a contrast failure
Evidence: `IMG_2776.png` showed a large white hero with only pale STEP 1 / STEP 2 / STEP 3 labels visible; V71 child text retained white text while v78 changed the hero surface to white.
Fix in v78.4:
- Explicit navy/blue/muted child colours at all sizes.
- Mobile hero compressed into a compact System Multi header.
- Long hero paragraph hidden on mobile.
- Step blocks use blue-soft surfaces with readable navy labels.
- Mobile filter/simulation primary action changed from legacy green to v78 blue.

### [P1] Multi Lab consumed too much vertical space
Evidence: `IMG_2777.png` showed one selected leg consuming most of the first screen because Remove became a full-width row, the 4 stats rendered as large 2 × 2 cards, an empty dependency container remained visible, and Value controls were oversized.
Fix in v78.4:
- Leg row kept as compact three-column content / odds / remove.
- Remove restored to a small red-soft action.
- Four summary metrics become a compact four-column strip.
- Empty dependency and value result containers collapse.
- Value input/button reduce to one compact row.
- Long explanatory note hidden on mobile first pass.

### [P1] More drawer behaved like a full page
Evidence: `IMG_2778.png` showed the drawer extending under the Safari browser chrome, with an overlong title and verbose system status block. The Multi Lab sticky bar remained visible underneath.
Fix in v78.4:
- Converted to a bounded bottom sheet: max 68dvh, rounded surface, grab handle.
- Title simplified to `More / Model Lab`.
- Drawer cards reduced to 56px minimum height.
- Verbose system-health detail hidden on mobile; refresh remains available.
- Sticky Multi Lab bar hides while the More drawer is open.

### [P2] Bottom navigation still showed legacy green active state
Evidence: Match / Players / Multi / Lab captures still showed legacy green active icon/label in several routes.
Fix in v78.4:
- Stronger v78 selector wins over the old v65 green navigation isolation layer.
- Active state is blue-soft + v78 blue.

## Fidelity surfaces

### Typography
v78.4 reduces oversized mobile headings and removes marketing-scale copy from decision routes. System Multi, More, and Multi Lab now use the same compact hierarchy as the Match concept.

### Spacing / layout rhythm
The new mobile path removes duplicate journey UI, bounds overlays, reduces oversized summary cards, and preserves the bottom navigation as the persistent app anchor.

### Colors / tokens
Primary interaction is v78 blue. Green is retained for positive/value/state semantics rather than global navigation or primary actions.

### Image / asset quality
No image asset substitutions were made. Existing logo safe-area rules remain unchanged.

### Copy / content
More drawer copy is simplified; no model meaning, market data, probability, seal, or settlement text was changed.

## Regression gates

- package version: 0.78.4
- package.json valid: PASS
- `showcase-ui-v78.js` syntax: PASS
- `navigation-p2-v64.js` syntax: PASS
- `showcase-ui-v78.css` brace structure: PASS
- showcase CSS cache key: `20260920-5`
- showcase JS cache key: `20260920-5`
- navigation JS cache key: `20260920-5`
- Supabase/model/seal/settlement logic unchanged

## Blocker

Post-v78.4 deployed screenshots are still required at the same iPhone viewport. Until those refreshed captures are available, design QA remains `blocked` rather than claiming a visual pass without evidence.


---

# v78.5 Mobile Typography Pass

Date: 2026-09-20
Final result: blocked

## Trigger
Live iPhone screenshots showed that the v78.4 mobile structure was substantially improved, but important labels and supporting evidence remained too small to read comfortably without zooming.

## Changes
- Mobile form controls forced to 16px at <=430px to prevent iOS Safari focus zoom.
- Match KPI labels, values, quick tabs, cockpit cards and Top Player Markets increased one typography tier.
- Player Markets search/filter, player names, market labels, probability, Recent 5 and Add to Multi increased.
- P1 Decision Speed scanner tabs, ranking cards and metadata increased.
- System Multi hero steps, result toolbar, combo cards, metrics, explanation blocks and CTA increased.
- Multi Lab leg rows, summary stats, odds input and Value controls increased.
- More / Model Lab drawer labels and items increased.
- Bottom navigation and floating Multi Lab bar increased.

## Regression gates
- package version: 0.78.5
- package.json valid: PASS
- showcase-ui-v78.js syntax: PASS
- navigation-p2-v64.js syntax: PASS
- showcase-ui-v78.css brace structure: PASS
- showcase CSS cache key: 20260920-6
- showcase JS cache key: 20260920-6
- iOS form-control 16px guard: PASS

## Blocker
A post-v78.5 iPhone screenshot is still required to confirm that the larger typography remains within the 390px layout without clipping or undesirable wrapping.
