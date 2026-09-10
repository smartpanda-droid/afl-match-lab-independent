# AFL Match Lab v44 — Bundled Lineup Fallback

- Adds bundled pregame lineup snapshots for both 2026 semi-finals.
- Live Supabase lineup remains primary; local snapshot activates only on lineup REST failure.
- Recovery does not overwrite live data and disappears automatically when live lineup succeeds.

# AFL Match Lab v43 — REST Gateway Fallback

- Adds Authorization bearer header alongside apikey.
- Automatically retries using the active legacy anon JWT if publishable-key gateway access fails.
- Bundles a current 2026 upcoming-fixture bootstrap so the match selector does not become empty during a temporary REST gateway outage.
- Keeps module-level recovery and lazy player-market loading from v42.
- Fixes Player Markets tab lazy-load key (`players`).

# v42 — Resilient Core Loading

- Match page no longer waits for full prediction-leg payload.
- Core startup only requires lineup/multis; heavy player legs and recent5 load lazily/background.
- Per-module status identifies LINEUP / MULTIS / LEGS failures.
- A slow prediction-leg endpoint can no longer blank the whole Match page.

# AFL Match Lab v40 — Mainstream Multi Rebalance + Value Button Fix

- System Multi primary-market preference: Goals, Disposals, Fantasy, Match Winner and Total.
- Secondary markets remain eligible as supporting legs.
- New lower anchor/value bands: Conservative 80–89 / 68+, Balanced 78–88 / 65+, Aggressive 76–86 / 62+.
- Any single bookmaker odds input now calculates EV immediately; 2+ quoted multis enable Value ranking.
- Hybrid match-market multis are included in Value calculation instead of being excluded.

# AFL Match Lab v39 — Match Markets in System Multi

- Adds match winner, line and total markets to System Multi filtering and candidate mixing.
- Match lines/totals are generated in 0.5 increments around the model fair line/total to fit the current anchor/value probability bands.
- At most one match-level leg is used per recommended multi to limit same-match correlation concentration.
- Hybrid match-market multis can be sent to Multi Lab; when present, Multi Lab uses a conservative 0.95 dependency proxy until empirical match↔player dependency calibration is available.

# v38 — Tradable Anchor / Higher-Quality Value Balance

- System Multi no longer prioritizes 95%+ legs that often have no practical bookmaker threshold.
- Conservative anchors: 86–93% (target ~89%); Value floor ~72%, target ~78%.
- Balanced anchors: 84–92% (target ~87%); Value floor ~69%, target ~75%.
- Aggressive anchors: 82–91% (target ~85%); Value floor ~66%, target ~72%.
- 95%+ legs remain visible in Player Markets; they are excluded only from automatic System Multi construction.
- Still uses 1–2 anchors plus at least one Value leg, with 12 canonical 2/3/4/5-leg × strategy recommendations.

# AFL Match Lab v37 — 12 System Multi recommendations + sharp club marks

- Default System Multi view now shows one canonical recommendation for every 2/3/4/5-leg × conservative/balanced/aggressive group (12 total when all groups are available).
- Canonical pick prefers 1–2 anchor legs plus at least one Value leg, then fair-odds band fit and recommendation rank.
- Strategy and leg-count filters include an All option; specific filters show one canonical recommendation per selected group.
- Replaces pale AFL watermark marks with sharp current-club-design image samples; team abbreviation remains fallback only.

# v36 — System Multi parity + Anchor/Value balance

- Restores Site-style System Multi filter panel: markets, strategy, 2–5 leg count, editable Fair Odds ranges, Confirm/Reset.
- Filters reset to defaults when match data is reloaded.
- System cards label each leg as 稳胆 or Value.
- Backend engine v0.3.2 requires 1–2 anchors and at least 1 value leg, with value scoring less dominated by raw probability.

# AFL Match Lab v35 — AFL Official Team Marks

This version keeps the existing website and replaces custom club badge artwork with the official team-mark resources used by AFL.com.au team pages for all 18 clubs. Fallback initials remain visible until an official asset has loaded successfully.

# AFL Match Lab v34 — CSP-safe Local Logos

- Fixes team logos not rendering under Cloudflare CSP.
- Replaces inline CSS background-image logo loading with normal local <img> assets.
- All 18 local SVG club badges remain bundled under public/assets/logos/.

## v28 overlay safe-area update

- Safer end-zone insets to prevent oval-edge clipping.
- Player option selection stays on Match page.
- Closable in-line Multi Lab floating summary beside Interchanges.

# AFL Match Lab Independent Web — v20 Parallel Test

v20 parity update:
- Match page merges LINEUP + 球场阵容 as the primary lineup view.
- Predicted scores display as whole points.
- Line and Total inputs/display snap to 0.5 increments.
- Top Edges now ranks probability/odds balance and de-duplicates same player+market thresholds.

# AFL Match Lab — Independent Web (Parallel Test)

Static Cloudflare Pages frontend for the independent Supabase AFL Match Lab backend.

## Status

**PARALLEL TEST ONLY.** The existing ChatGPT Site remains the production reference. Do not cut over the old scheduler or production URL until the independent chain passes the real-match T-4h → T-30 → T+8h test.

## Repository layout

- `public/` — deployable static source files
- `scripts/build.mjs` — zero-dependency build step
- `dist/` — generated Cloudflare Pages output (not committed)
- `parallel-test/` — test manifest and comparison checklist

## Local checks

```bash
npm run check
npm run build
```

## Cloudflare Pages

- Framework preset: **None**
- Production branch: **main**
- Build command: **npm run build**
- Build output directory: **dist**
- Root directory: repository root
- Node dependencies: none

The Supabase publishable key in `public/config.js` is intentionally browser-visible. No service-role or secret key belongs in this repository.

## Parallel-test identity

`public/config.js` sets:

- `ENVIRONMENT = parallel-test`
- `PARALLEL_TEST = true`
- `SITE_ROLE = independent-shadow`

The UI displays a persistent **PARALLEL TEST** banner so it cannot be mistaken for the existing production Site.


## v17 Player Markets parity
- Multi-threshold player markets backed by Supabase prediction legs.
- Player search and market filter retained.
- Threshold selector updates probability, fair odds, recent-5 hit/miss colours, context and role details.
- Recent five remains oldest to newest.
- Prediction leg retrieval is paginated to support >1000 rows.
- Injury penalty source is availability_factor only; legacy injury factor suppressed.


## v20 lineup parity
- Match lineup board rebuilt to mirror the supplied AFL field layout: Followers left, positional rows over the oval, Interchanges right, All/team filters above.
- Uses `named_position` slots (BPL/FB/BPR, HBFL/CHB/HBFR, WL/C/WR, HFFL/CHF/HFFR, FPL/FF/FPR, RK/R/RR, INT).
- When `used_fallback_lineup=true`, the Match page explicitly marks the board as previous-match fallback; the existing sync pipeline replaces it automatically once the latest lineup arrives.
- No jumper numbers are fabricated because the current public lineup API does not expose guernsey numbers.


## v22 lineup rendering fixes
- Replaced pale AFL watermark image URLs with stable full-contrast club symbol URLs.
- Removed negative-margin lineup geometry that clipped player cards.
- All mode uses 10 positional rows; single-team mode uses 5 evenly distributed rows.
- Followers, Interchanges and Emergencies stay outside the oval.


## v29
- Lineup Multi Lab floating panel now allows removing individual legs in-place.
- Leg count, probability and fair odds update immediately after removal.
