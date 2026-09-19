# AFL Match Lab — P0 COMPLETE v65 QA Report

Date: 2026-09-20  
Branch: `main`  
Version: `0.65.0`

## Why P0 needed a completion pass

The original P0 v62 passed its static UI gates, but two parts of the intended product behaviour were still incomplete:

1. **Late Change** was a status display, not a true change-detection pipeline.
2. **Freshness** could fall back to browser module-load time when a source timestamp was unavailable. A successful fetch is not proof that the underlying source data is fresh.

The original P0 report also explicitly deferred live weather ingestion.

v65 closes those gaps without changing production probabilities.

## Completed P0 scope

### 1. Matchday Cockpit
Already delivered in v62 and retained:
- model lean
- win probability
- projected score
- fair line
- total lean
- lineup state
- probability separate from confidence

v65 corrects the Cockpit Data KPI:
- source timestamp is used when available
- browser load time is shown separately
- missing source time is displayed as `SOURCE TIME N/A`, not inferred as fresh

### 2. Probability vs Confidence
Retained from v62.

P0 completion does not write to:
- `model_probability`
- prediction legs
- multi probabilities
- production model state

### 3. Late Change Delta Engine

The Match page now has a real late-change monitor.

Authoritative evidence:
- reads `afl_api_shadow_observations`
- uses existing backend fields:
  - `lineup_changed`
  - `injury_changed`
  - `prediction_changed`
  - `multi_changed`
  - `stability_changed`
  - changed leg / multi counts
  - `observed_at`
  - `source_snapshot_at`

When a **new material backend observation** is detected, the frontend reloads current match data once so the visible probabilities and lineup match the new observation.

The Shadow observations are restored after that reload so the Shadow Live page is not accidentally cleared.

### 4. Exact browser decision delta

A per-match stable decision snapshot is retained in local browser storage.

When a stable new dataset is loaded, the UI can identify:
- players added / removed
- Bench → Field / Field → Bench movement
- named-position changes
- injury-flag changes
- match win-probability change in percentage points
- projected-score changes
- player-leg probability changes

This is explicitly the delta from the **previous stable browser snapshot**. It is not presented as a backend historical record.

Material changes can produce:
- `MAJOR LATE CHANGE`
- `LATE UPDATE DETECTED`
- `NO MAJOR LATE CHANGE`

### 5. Source Time vs Loaded Time

Freshness is now provenance-aware.

Each module separates:

**Source**
- source snapshot / source update / generated / observed / frozen time, when the API exposes one

from:

**Loaded**
- when this browser fetched the module

If no source timestamp exists:
- UI says `Source time unavailable`
- a successful browser load does not turn the source indicator green by itself

This applies to:
- Lineup
- Player model
- Match context
- Match quote
- Final lock
- Late-change feed
- Weather

### 6. Weather feed

The previous `Weather feed not connected` gap is closed with a display-only Open-Meteo forecast.

The implementation:
- maps major AFL venues to coordinates
- loads the hourly forecast nearest match start
- displays:
  - temperature
  - precipitation probability
  - wind speed
  - wind gust
- refreshes at most every 15 minutes while the page is active
- compares the latest forecast with the previous stored forecast

Material weather-change alerts include:
- rain-probability movement >= 20 percentage points
- gust movement >= 10 km/h
- wind movement >= 8 km/h
- precipitation movement >= 2 mm/h
- temperature movement >= 5°C

Critical guard:

**Weather is labelled `INFO ONLY · NOT IN MODEL`.**

No weather value changes production probability. Model integration remains a separate validation task.

Forecast limitations are explicit:
- unknown venue coordinates
- forecast outside the available horizon
- fetch/API failure

### 7. Match Review completion

The existing P0 `DECISION → RESULT → LEARNING` view remains.

v65 adds explicit learning KPIs:
- Player Markets hit rate
- Player Markets hit / settled count
- System Multi hit rate
- System Multi hit / settled count
- highest-probability settled player miss
- settled player-leg learning-set size

Miss explanations remain evidence-first and do not invent post-match causal stories.

## Files

Added:
- `public/p0-completion-v65.js`
- `public/p0-completion-v65.css`
- `QA_REPORT_P0_COMPLETE_V65.md`

Updated:
- `public/index.html`
- `package.json`
- `scripts/smoke-check.mjs`

## QA result

JavaScript syntax:
- app.js — PASS
- premium-ui-v60.js — PASS
- matchday-p0-v62.js — PASS
- decision-p1-v63.js — PASS
- navigation-p2-v64.js — PASS
- p0-completion-v65.js — PASS

P0 completion activation gates: **26 / 26 PASS**

Validated:
- v65 package and syntax gate
- CSS / JS activation
- prior P0 / P1 / P2 layers retained
- authoritative Shadow late-change feed
- lineup delta detection
- Bench-role delta detection
- injury delta detection
- match probability delta
- player probability delta
- refresh only on a new material backend observation
- Shadow state preservation after refresh
- source vs browser-load freshness separation
- real weather feed
- weather model-isolation guard
- safe missing-weather-value handling
- material weather-change thresholds
- Player Market learning KPI
- System Multi learning KPI
- highest-probability miss
- zero production-probability mutation
- mobile responsive completion
- v65 smoke gates
- build path remains `public/ → dist/`

## Verification boundary

Repository/build-chain verification is complete at code level.

The current environment still does not provide a direct Cloudflare rendered-page visual session, and the repo has no GitHub Actions commit status attached to these commits. Therefore live Cloudflare visual rendering is not claimed as directly inspected.

## P0 status

**P0 — COMPLETE**

The remaining work is no longer a P0 omission:
- weather as a production probability input requires backtest / calibration before model integration
- causal post-match attribution requires sufficient evidence
- role-vs-opposition model training belongs to P1/model research
- navigation architecture belongs to P2 and is already implemented
