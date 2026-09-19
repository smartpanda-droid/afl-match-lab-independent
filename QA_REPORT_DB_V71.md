# AFL Match Lab — DB v71 QA Report

Date: 2026-09-20  
Scope: weekly validation performance, candidate-only governance, production policy integrity, scheduler reproducibility.

## Result

**PASS**

### Weekly validation performance

The previous weekly cron exceeded the 120-second statement timeout. The main cause was repeated scanning of the same shadow-validation legs inside nested PL/pgSQL weight loops.

Measured after the set-based rewrite:

- Shadow validation: ~39.1 s
- Global 25-point grid: ~8.38 s
- Market 225-point grid: ~8.46 s
- Full weekly pipeline: ~53.3 s
- No-new-stats fingerprint skip: ~0.64 s

No statement-timeout increase was required.

### Production governance

The retrospective validator is not the same-bloodline Production engine. Therefore it must not promote context/role weights directly.

Production policy was restored from frozen match 9027 metadata:

| Market | Context | Role |
| --- | ---: | ---: |
| Clearances | 0.75 | 1.00 |
| Fantasy points | 0.00 | 1.00 |
| Goals | 0.25 | 0.25 |
| Hitouts | 0.00 | 1.00 |
| Kicks | 0.00 | 0.00 |
| Marks | 0.00 | 0.00 |
| Tackles | 0.00 | 0.00 |
| Disposals | 0.00 | 0.00 |
| Handballs | 0.00 | 0.00 |

Production hash after v71 production application: `87d1796c127e478a7e4c207c7bbbfdab`.

A real Global + Market search was rerun after the change. Production hash remained unchanged.

### Candidate output

Current candidate-only passes include:

- clearances / context: weight 0.75, n=455, Brier gain 0.001303, LogLoss gain 0.003977
- clearances / role: weight 1, n=455, Brier gain 0.001303, LogLoss gain 0.003977
- fantasy_points / role: weight 1, n=455, Brier gain 0.001008, LogLoss gain 0.002321
- hitouts / role: weight 1, n=455, Brier gain 0.000513, LogLoss gain 0.001760
- kicks / role: weight 1, n=455, Brier gain 0.001230, LogLoss gain 0.002957

These are research candidates only. They do not change live player probabilities.

### Scheduler

v71 explicitly supersedes the older v70 resource-only schedule experiment. Verified production intent:

- event-driven master: every 30 minutes
- pregame fast finalizer: every 2 minutes
- release gate: every 6 hours
- weekly validation: Tuesday 00:00 UTC

The 2-minute fast finalizer is intentionally retained because the lineup flow is asynchronous (token -> roster -> freeze) and must close reliably around T-60/T-30.

### Latest shadow state

- Run: `cfbfa5ff-b886-4c2b-a078-adcdec4a9dff`
- Matches: 30
- Legs: 12141
- Fingerprint: `8e941b15f3e9be517a9b9b028ec62eb6`

## Governance rule going forward

Retrospective weekly search may create **candidates** only. Promotion to Production must go through the formal Same-Bloodline / frozen-match release process and must not be performed by `weekly_validation_tick()`.


## Post-application verification

After applying the committed v71 SQL to Production:

- Production policy hash before weekly skip: `87d1796c127e478a7e4c207c7bbbfdab`
- Production policy hash after weekly skip: `87d1796c127e478a7e4c207c7bbbfdab`
- Production unchanged: **true**
- Weekly result: `skipped_no_new_stats`
- Pregame fast tick outside match window: `idle`
- anon/authenticated EXECUTE on Global/Market/Weekly validation functions: **false**
- anon/authenticated/PUBLIC grants on candidate table: **none**
- Active schedules: master `*/30`, pregame finalizer `*/2`, release gate `17 */6`, weekly validation Tuesday 00:00 UTC
