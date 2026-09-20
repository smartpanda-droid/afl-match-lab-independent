# AFL Match Lab — P2 Cross-platform Interaction Polish

Date: 2026-09-20
Status: **COMPLETE**
Version: **0.80.0**

> Historical note: the earlier v0.76 P2 Product Simplification remains complete. This document is the current post-P1 P2 phase.

## Goal

Make the Matchday Terminal feel native and efficient across phone, tablet and desktop without changing model/data behaviour.

## P2.1 Tablet Dedicated Layout — COMPLETE

Target range:
- 701–1180px

Delivered:
- dedicated tablet content width and padding
- four-column Match KPI layout
- three-column Match decision highlights
- tablet-sized touch targets
- Player Markets toolbar adapted for tablet
- P1.2 decision strip retained as 3-column evidence
- P1.3 System Multi compare uses true 3-column comparison instead of phone carousel
- Multi Lab uses split builder / match-market layout on wider tablets
- portrait tablet Field / Lineup defaults to one team at a time
- landscape/wider layouts retain more desktop density
- 980–1180px Player Markets supports two-up player cards

## P2.2 Accessibility / Keyboard — COMPLETE

Delivered:
- Skip to matchday content link
- main content focus target
- aria-current on primary route
- aria-expanded / dialog semantics for More
- route-change screen-reader announcements
- Alt+1 → MATCH
- Alt+2 → PLAYERS
- Alt+3 → MULTI
- Alt+4 → LAB
- / focuses Player search while in PLAYERS
- Escape closes More or System Multi mobile filter
- focus trap inside More while open
- explicit focus-visible ring
- form aria-labels for player search, market filter and bookmaker odds

Keyboard shortcuts do not run while typing in input/select/textarea/contenteditable controls.

## P2.3 Motion / Interaction Polish — COMPLETE

Delivered:
- short view-entry transition
- subtle hover elevation on pointer devices
- button / card state transitions
- no hover transform on touch-only devices
- full prefers-reduced-motion override
- scroll behaviour reduced when OS requests reduced motion

## Resource / model safety

P2:
- adds no fetch()
- adds no application api() call
- adds no XMLHttpRequest
- does not write model_probability
- does not write leg probability
- does not modify System Multi generation
- does not modify builder evaluation
- does not modify T-30 seal
- does not modify settlement
- does not change Supabase schema

The only app-level behaviour change is responsive presentation:
- Field / Lineup single-team mode extends from phone to <=900px portrait/tablet widths.

## Files

Added:
- public/p2-interaction-polish-v80.js
- public/p2-interaction-polish-v80.css

Updated:
- public/app.js
- public/index.html
- package.json

## Result

P2 COMPLETE at v0.80.0.
