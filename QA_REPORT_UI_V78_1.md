# AFL Match Lab — UI Visual QA v78.1

Date: 2026-09-20
Scope: Match homepage + responsive shell
Reference: selected AFL Match Lab desktop/mobile mockup

## Status

**SOURCE / RESPONSIVE QA COMPLETE**
**LIVE SCREENSHOT VERIFICATION BLOCKED IN THIS CHAT**

The Cloudflare Pages production URL could not be opened by the available web capture tool, so this pass does not claim screenshot-level visual acceptance of the deployed page. The responsive implementation was instead checked directly against the current main-branch HTML/CSS/JS and the selected reference design.

## Viewport targets

### Desktop 1440px
Health: **PASS — calibrated in source**

- Primary navigation moved into the same top chrome row at >=1280px.
- Left desktop rail removed from the Match homepage.
- Match workspace now uses full available content width.
- Match hero receives lineup/model status chips and pre-match countdown.
- Match decision strip remains four KPIs: Win Probability / Projected Margin / Total Points / Model Confidence.
- Top Player Markets is limited to the top three items in the first-pass Match view.
- System Multi / Recent Form / Key Risks are grouped into one three-column decision row.
- Deep analysis modules remain below the decision layer.

### iPad / tablet
Health: **PASS — calibrated in source**

- 901–1279px keeps two horizontal chrome rows instead of forcing the 1440px inline-header layout.
- Four KPI cards remain visible with reduced density.
- The lower decision row collapses to two columns with Key Risks full-width when space is insufficient.
- No left navigation rail is used.

### iPhone / small mobile
Health: **PASS — calibrated in source**

- Header simplified; match selector is removed from top chrome.
- Fixed four-entry bottom navigation remains.
- Summary / Markets / Multi / Insights quick tabs use larger touch targets.
- Match Hero compresses team identity and status without removing the key read.
- KPI grid is 2 × 2.
- Detailed Line / Total market controls are removed from the first mobile decision pass.
- Top Player Markets is limited to three items.
- System Multi, Key Risks and Recent Form become a vertical sequence.
- Multi Lab sticky builder remains above bottom navigation.
- Extra hardening added for widths <=390px.

## Accessibility / interaction checks

- Focus outline colour aligned to the new blue design system.
- Bottom navigation retains large touch areas.
- Mobile quick tabs raised to a 40px minimum target.
- Reduced-motion support remains enabled.
- No model probability, Supabase call, T-30 seal or settlement behaviour was modified.

## Technical checks

- showcase-ui-v78.js syntax: PASS
- showcase-ui-v78.css brace structure: PASS
- v78 stylesheet loads after design-system-v77.css: PASS
- v78 script loads after the existing decision-speed layer: PASS
- Cloudflare/browser cache key bumped to 20260920-2
- package version: 0.78.1
- package check includes showcase-ui-v78.js

## Remaining visual acceptance

A true final visual acceptance still needs deployed screenshots at:
- 390 × 844 (small iPhone)
- 834 × 1194 (iPad portrait)
- 1194 × 834 (iPad landscape)
- 1440 × 900 (desktop)

The final screenshot pass should verify:
1. no overlap between desktop inline navigation and match selector,
2. official team marks are not clipped,
3. KPI labels remain readable at 390px,
4. System Multi / Recent Form / Key Risks align to a common card height at 1440px,
5. sticky Multi Lab bar never covers the final visible content on mobile,
6. More drawer clears both header and bottom navigation,
7. no stale v78 assets survive cache refresh.
