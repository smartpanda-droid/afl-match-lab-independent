> **Superseded by P0 COMPLETE v65.** The v62 report reflects the first P0 UI pass. Late-change delta detection, source-vs-load freshness, live display-only weather, and explicit Review learning KPIs were completed in `QA_REPORT_P0_COMPLETE_V65.md`.

# AFL Match Lab — P0 v62 QA Report

Date: 2026-09-20  
Branch: `main`  
Scope: Matchday Cockpit + Confidence Layer + Match Status/Freshness + Match Review decision UI

## Implemented

- Added `public/matchday-p0-v62.js`
- Added `public/matchday-p0-v62.css`
- Activated both files from `public/index.html`
- Bumped package version to `0.62.0`
- Extended smoke gates for P0
- Kept model probabilities, Supabase schemas, settlement logic and System Multi generation unchanged

## P0 Decision Layer

### Matchday Cockpit
The Match page now surfaces a compact decision band with:
- Model lean and win probability
- Projected score
- Fair home line with team name
- Total lean at the current quoted total
- Lineup state
- Model/data freshness
- Separate overall model confidence

### Probability vs Confidence
Confidence is intentionally separate from probability.

Leg confidence uses available evidence only:
- sample quality
- lineup certainty
- injury / availability uncertainty
- role confidence when available
- opposition-role sample when available

Confidence does **not** modify model probability.

### WHY / WHAT CAN BREAK IT
Top player edges and Player Markets gain an evidence-first expandable explanation:
- WHY: loaded supporting evidence such as recent hit rate, sample size, context/opposition adjustment and role stability
- WHAT CAN BREAK IT: lineup uncertainty, injury/availability flags, thin sample and unstable role evidence

### Match Status / Freshness
Match page now distinguishes:
- current vs fallback/pending lineup
- preview vs T-30/final recommendation state
- top-edge injury flags
- model/update recency
- module-level data freshness

Weather is explicitly shown as **Not connected** rather than being presented as fresh data.

### Match Review
Existing sealed-review backend remains authoritative.
The Review page now adds:
- Decision → Result → Learning headline
- Predicted vs actual score
- Winner / Line / Total settlement when those markets were sealed
- Evidence-first `WHY WE MISSED` section

The miss diagnostic does not invent causal explanations when the sealed post-match dataset cannot support them.

## QA

JavaScript syntax compile:
- `public/app.js` — PASS
- `public/premium-ui-v60.js` — PASS
- `public/matchday-p0-v62.js` — PASS

P0 static gates:
- package version / syntax gate — PASS
- CSS linked — PASS
- JS linked after premium layer — PASS
- Matchday Cockpit — PASS
- Probability / Confidence separation — PASS
- module freshness layer — PASS
- weather honesty guard — PASS
- WHY / RISK layer — PASS
- Review learning layer — PASS
- responsive mobile styles — PASS
- smoke script updated — PASS

Result: **12 / 12 P0 gates passed**

## Deployment verification boundary

The repository has no GitHub Actions run or commit status attached to the latest P0 commit, and no Cloudflare Pages hostname is recorded in the repository metadata. Therefore this report verifies the `main` code and build chain, but does not claim a live Cloudflare page was visually verified.

Cloudflare build settings already documented in the repo:
- production branch: `main`
- build command: `npm run build`
- output: `dist`
- build script copies `public/` to `dist/`

## Deferred to P1 / P2

Not included in P0:
- role-vs-opposition model expansion
- scenario sensitivity probability ranges
- advanced Multi correlation visualisation
- causal post-match explanation beyond available evidence
- live weather ingestion
- navigation reduction to MATCH / PLAYERS / MULTI / REVIEW / MORE
