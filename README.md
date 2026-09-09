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
