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
