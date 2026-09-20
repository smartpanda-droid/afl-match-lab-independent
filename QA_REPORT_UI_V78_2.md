# AFL Match Lab — v78.2 Final Visual Acceptance

Date: 2026-09-20
Scope: deployed-layout hardening for the selected responsive Matchday Terminal design.

## Result

**SOURCE-SIDE FINAL VISUAL ACCEPTANCE: PASS**
**DEPLOYED SCREENSHOT CAPTURE: BLOCKED BY CURRENT CHAT TOOLING**

The live Cloudflare Pages URL is not available to the screenshot-capable tooling in this chat, so this report does not claim screenshot evidence that was not captured. All six requested visual-risk areas were resolved in the main-branch presentation layer and regression-checked structurally.

## 1. Desktop 1440 navigation spacing
Health: PASS

- Desktop >=1280 reserves a fixed right utility zone for match selector + actions.
- Primary navigation is centered between the brand and utility zone.
- Match selector is capped at 248px to prevent overlap.
- Main workspace begins at 82px and is capped at 1440px.

## 2. Equal-height decision cards
Health: PASS

- System Multi / Recent Form / Key Risks use equal-height grid rows.
- System Multi cards use equal row height and flex interiors.
- The 1440 decision row targets a 196px aligned height.

## 3. Team logo clipping
Health: PASS

- Hero logo shells now allow visible overflow.
- clip-path / contain restrictions are removed from hero marks.
- Large logo padding is increased by breakpoint.
- object-fit: contain and centred object-position are enforced.

## 4. Small-iPhone first-screen height
Health: PASS

- Header reduced to 56px below 600px.
- Hero reduced to 104px, 96px at <=390px.
- KPI cards reduce to 74px and remove secondary KPI copy at <=390px.
- Best Read / Risk / Shape become a horizontal swipe row instead of three stacked cards.
- Top Player Markets remain capped at three items.

## 5. Sticky Multi Lab bar / bottom-nav overlap
Health: PASS

- viewport-fit=cover added for iOS safe areas.
- Sticky builder uses bottom-nav + safe-area offset.
- Builder now appears only when one or more legs are selected.
- Builder hides inside Multi Lab itself.
- Main content and More drawer increase bottom clearance only when the builder is visible.

## 6. 1440p information density
Health: PASS

- Legacy interactive Match Prediction controls are moved below the first decision layer.
- First decision sequence is now:
  Match Hero -> 4 KPIs -> Best Read/Risk/Shape -> Top 3 Player Markets -> System Multi/Recent Form/Key Risks.
- Deep Line/Total controls remain available below this layer.
- Desktop card gaps and typography are tightened to fit the intended 1440 × 900 workstation density.

## Mobile navigation
Health: PASS

- Mobile labels are shortened to MATCH / PLAYERS / MULTI / LAB.
- Fixed four-entry bottom navigation remains intact.

## Regression gates

- package version: 0.78.2
- package.json: valid
- showcase-ui-v78.js syntax: PASS
- showcase-ui-v78.css brace structure: PASS
- viewport-fit=cover: PASS
- v78.2 CSS cache key: 20260920-3
- v78.2 JS cache key: 20260920-3
- literal \n artifact between stylesheet tags removed
- UI layer only: no Supabase/model/seal/settlement logic changed

## Remaining acceptance limitation

A true deployed pixel comparison still requires screenshots from:
- 390 × 844
- 834 × 1194
- 1194 × 834
- 1440 × 900

Because no valid deployed screenshots could be captured in this chat, no claim is made about pixel-perfect live rendering beyond the source-level responsive acceptance above.
