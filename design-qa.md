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
