# AFL Match Lab Design System v77

Date: 2026-09-20

## Purpose

Design System v77 is the single source of truth for AFL Match Lab visual language.

New features must extend the design system or an existing component stylesheet. Do not create a new versioned CSS patch merely to override another stylesheet.

## Ownership

### design-system-v77.css

Owns:

- brand and semantic colours
- typography families and type scale
- spacing scale
- radii
- shadows
- shared control sizing
- Panel / Badge / focus primitives
- cross-page semantic control rules
- mobile readability contract
- compatibility aliases required by the legacy structural base

It is loaded last so the visual contract is deterministic.

### styles.css

Legacy structural base only.

It no longer owns theme variables.

Do not add new colours, global theme tokens or new design-system primitives here.

### premium-ui-v60.css

Legacy shell / layout compatibility only.

Its duplicated root theme was removed in v77.
Its global button and form `!important` overrides were removed in v77.

Do not add new global `button { ... !important }` or `input/select { ... !important }` rules.

### Component stylesheets

- `matchday-p0-v62.css` — Matchday / review layout
- `decision-p1-v63.css` — role, opposition, scenario, correlation
- `navigation-p2-v64.css` — navigation / More / Model Lab
- `p0-completion-v65.css` — late-change / freshness / review completion layout
- `system-multi-v71.css` — System Multi workspace
- `player-markets-v72.css` — Player Markets workspace
- `team-logos-v73.css` — club logo geometry only
- `decision-speed-p1-v75.css` — P1 decision-speed layout

Component stylesheets own layout and component-specific geometry. They consume `--ds-*` variables and must not define another green / ink / muted / warn / bad theme.

## Canonical semantic tokens

- `--ds-green-900 / 800 / 700 / 600 / 100 / 050`
- `--ds-ink-900 / 800 / 700 / 600`
- `--ds-muted-700 / 600 / 500`
- `--ds-line / --ds-line-strong / --ds-line-soft`
- `--ds-surface / --ds-surface-soft / --ds-surface-muted`
- `--ds-good / --ds-good-soft`
- `--ds-warn / --ds-warn-soft`
- `--ds-bad / --ds-bad-soft`
- `--ds-info / --ds-info-soft`
- `--ds-purple / --ds-purple-soft`

## Shape / spacing

Use the `--ds-space-*`, `--ds-radius-*`, `--ds-shadow-*` and `--ds-control-*` scales before adding one-off values.

One-off geometry is acceptable for real layout requirements, such as the AFL oval, logo dimensions or navigation rail width.

## Responsive contract

Preferred breakpoints for new work:

- wide / compact desktop: 1180px
- mobile layout: 900px
- compact mobile: 560px

Existing specialist breakpoints may remain until the owning component is rewritten. New arbitrary breakpoints should not be added without a layout reason.

## Rule against patch proliferation

Before creating a new CSS file:

1. Is this a shared visual primitive? Update `design-system-v77.css`.
2. Is it specific to an existing page/component? Update that component stylesheet.
3. Is it a bug caused by cascade/specificity? Fix the owning rule rather than adding a later override.
4. Only create a new stylesheet for a genuinely new standalone component family.

## Retired layer

`ui-qa-v66.css` is retired and not loaded by `index.html`.

Its still-required cross-page rules were absorbed into Design System v77.
