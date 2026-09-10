# AFL Match Lab v50 — Comprehensive QA Report

## Loader architecture
- Matches are the only bootstrap prerequisite.
- Public read API uses only the Supabase `apikey` header; publishable key is not misused as a Bearer JWT.
- Selected-match modules load independently and update the page as each completes.
- A failed lineup/context/quote/top-legs/multis request cannot cancel the others.
- 4.5–5 second hard timeouts prevent indefinite Connecting states.
- `loadSeq` + selected match guards prevent stale requests from a previous match overwriting the current match.
- Successful small responses are cached per match; cache is display fallback only.

## Data-loading scope
- Match page: lineup, multis, match quote, context, lightweight top-legs, stability/final metadata.
- Top Edges: limited lightweight prediction-leg query (180 rows max).
- Player click: loads only that player's official prediction thresholds when needed.
- Player Markets: full prediction legs + recent5 + availability load only when the tab is opened.
- Multi Lab: full legs load only when needed for candidate browsing.
- Validation: no bootstrap dependency; loads only when Validation is opened.
- Shadow Live: loads only when Shadow Live is opened.

## Static verification
- JavaScript syntax check: PASS.
- Production build: PASS.
- Static smoke checks: 20/20 PASS.
- Static DOM ID audit: 91/91 references resolved.
- Local static HTTP test: index, app.js, config.js and styles.css all HTTP 200.

## System Multi verification
- Strategies present: Conservative / Balanced / Aggressive.
- Leg counts present: 2 / 3 / 4 / 5.
- Target display structure remains 12 canonical groups.
- Anchor/Value bands from the current recommendation UI remain intact.
- Browser-side temporary match-market hybrid injection remains disabled in this clean recovery build.

## Network note
The Supabase management SQL connection was intermittently timing out during this QA session. The frontend is therefore designed so an individual endpoint timeout degrades only that module instead of freezing the whole site. A live browser/network environment is still required to verify the remote gateway itself.
