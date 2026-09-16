(function () {
  const ANCHOR_MIN_ODDS = 1.35;
  const ANCHOR_MAX_ODDS = 1.65;
  const VALUE_MIN_ODDS = 1.70;
  const VALUE_MAX_ODDS = 2.20;

  const ANCHOR_P_MIN = 1 / ANCHOR_MAX_ODDS;
  const ANCHOR_P_MAX = 1 / ANCHOR_MIN_ODDS;
  const ANCHOR_P_TARGET = 1 / 1.50;
  const VALUE_P_MIN = 1 / VALUE_MAX_ODDS;
  const VALUE_P_MAX = 1 / VALUE_MIN_ODDS;

  function inBand(value, min, max) {
    return Number.isFinite(value) && value >= min - 1e-9 && value <= max + 1e-9;
  }

  function legOddsFromProbability(p) {
    const n = Number(p);
    return Number.isFinite(n) && n > 0 ? 1 / n : Infinity;
  }

  function legClassFromProbability(p) {
    const o = legOddsFromProbability(p);
    if (inBand(o, ANCHOR_MIN_ODDS, ANCHOR_MAX_ODDS)) return 'anchor';
    if (inBand(o, VALUE_MIN_ODDS, VALUE_MAX_ODDS)) return 'value';
    return null;
  }

  function roundedRange(min, max) {
    return [Number(min.toFixed(2)), Number(max.toFixed(2))];
  }

  function strategyRange(strategy, legCount) {
    const n = Math.max(2, Math.min(5, Number(legCount || 2)));
    if (strategy === 'conservative') {
      return roundedRange(
        Math.pow(1.35, n - 1) * 1.70,
        Math.pow(1.50, n - 1) * 1.90
      );
    }
    if (strategy === 'aggressive') {
      return roundedRange(
        Math.pow(1.45, n - 1) * 1.95,
        Math.pow(1.65, n - 1) * 2.20
      );
    }
    return roundedRange(
      Math.pow(1.40, n - 1) * 1.85,
      Math.pow(1.58, n - 1) * 2.05
    );
  }

  function dynamicOddsDefaults() {
    const out = { conservative: {}, balanced: {}, aggressive: {} };
    ['conservative', 'balanced', 'aggressive'].forEach((strategy) => {
      [2, 3, 4, 5].forEach((n) => {
        out[strategy][n] = strategyRange(strategy, n);
      });
    });
    return out;
  }

  window.AFL_MULTI_ODDS_POLICY = Object.freeze({
    anchor: [ANCHOR_MIN_ODDS, ANCHOR_MAX_ODDS],
    value: [VALUE_MIN_ODDS, VALUE_MAX_ODDS],
    totals: dynamicOddsDefaults(),
  });

  // Replace the former strategy-dependent probability bands with explicit fair-odds bands.
  systemAnchorBand = function () {
    return [ANCHOR_P_MIN, ANCHOR_P_MAX, ANCHOR_P_TARGET];
  };

  systemAnchorCut = function () {
    return ANCHOR_P_MIN;
  };

  systemValueFloor = function () {
    return VALUE_P_MIN;
  };

  systemTradableProbability = function (p) {
    return legClassFromProbability(Number(p)) !== null;
  };

  systemLegRole = function (_strategy, leg) {
    const cls = legClassFromProbability(Number(leg?.probability));
    return cls === 'anchor' ? '稳胆' : cls === 'value' ? 'Value' : '非目标';
  };

  multiStructureStats = function (m) {
    const legs = (m.legs || []).filter((l) => {
      const market = String(l.market || '').toLowerCase();
      return !SYSTEM_MULTI_EXCLUDED_MARKETS.has(market) && systemTradableProbability(l.probability);
    });
    const anchors = legs.filter((l) => legClassFromProbability(Number(l.probability)) === 'anchor').length;
    const values = legs.filter((l) => legClassFromProbability(Number(l.probability)) === 'value').length;
    return { anchors, values, valid: anchors >= 1 && anchors <= 2 && values >= 1 };
  };

  systemAllowedLeg = function (l, f) {
    const market = String(l.market || '').toLowerCase();
    const p = systemCandidateProbability(l);
    return !SYSTEM_MULTI_EXCLUDED_MARKETS.has(market) && f.markets.has(l.market) && systemTradableProbability(p);
  };

  // Keep match-market candidates in exactly the same leg-odds bands as player markets.
  matchMarketCandidates = function (strategy = 'balanced', legCount = 2) {
    const q = state.matchQuote;
    if (!q) return [];

    const valueTarget = strategy === 'conservative' ? 1 / 1.72 : strategy === 'aggressive' ? 1 / 2.05 : 1 / 1.90;
    const targets = [valueTarget, ANCHOR_P_TARGET];
    const out = [];

    const push = (market, selection, p, threshold, side) => {
      p = Number(p);
      if (!Number.isFinite(p) || !systemTradableProbability(p)) return;
      out.push({
        prediction_leg_id: `match:${market}:${side}:${threshold}`,
        player_id: null,
        player_name: '比赛市场',
        team_name: side === 'home' ? q.home_team_name : side === 'away' ? q.away_team_name : null,
        market,
        threshold: Number(threshold),
        selection,
        probability: p,
        model_probability: p,
        fair_odds: 1 / p,
        match_market: true,
      });
    };

    push('match_winner', `${q.home_team_name} 胜`, q.home_win_probability, 0, 'home');
    push('match_winner', `${q.away_team_name} 胜`, q.away_win_probability, 0, 'away');

    const fairLine = Number(q.fair_home_line);
    const marginSd = Number(q.margin_sd);
    const fairTotal = Number(q.fair_total);
    const totalSd = Number(q.total_sd);

    if (Number.isFinite(fairLine) && marginSd > 0) {
      targets.forEach((tp) => {
        const z = zForTarget(tp);
        const homeLine = roundHalf(fairLine + z * marginSd);
        const awayHomeLine = roundHalf(fairLine - z * marginSd);
        const hp = normalCdf((homeLine - fairLine) / marginSd);
        const ap = normalCdf((fairLine - awayHomeLine) / marginSd);
        push('match_line', `${q.home_team_name} ${signedHalf(homeLine)}`, hp, homeLine, 'home');
        push('match_line', `${q.away_team_name} ${signedHalf(-awayHomeLine)}`, ap, -awayHomeLine, 'away');
      });
    }

    if (Number.isFinite(fairTotal) && totalSd > 0) {
      targets.forEach((tp) => {
        const z = zForTarget(tp);
        const overLine = roundHalf(fairTotal - z * totalSd);
        const underLine = roundHalf(fairTotal + z * totalSd);
        const op = normalCdf((fairTotal - overLine) / totalSd);
        const up = normalCdf((underLine - fairTotal) / totalSd);
        push('match_total', `Over ${overLine.toFixed(1)}`, op, overLine, 'over');
        push('match_total', `Under ${underLine.toFixed(1)}`, up, underLine, 'under');
      });
    }

    return [...new Map(out.map((x) => [x.prediction_leg_id, x])).values()];
  };

  defaultSystemFilterState = function () {
    return {
      strategy: 'all',
      legCount: 0,
      recommendedOnly: false,
      markets: new Set(availableSystemMarkets()),
      odds: dynamicOddsDefaults(),
    };
  };

  const note = document.querySelector('.system-rule-note');
  if (note) {
    note.textContent = '单腿规则：稳胆 Fair Odds 1.35–1.65；Value Fair Odds 1.70–2.20。1.65–1.70 为缓冲区，不强行归类。组合总赔率随保守 / 平衡 / 激进及 2–5 串动态调整；质量优先，不为凑赔率加入低质量腿。';
  }

  const legend = document.querySelector('.system-tradable-legend');
  if (legend) {
    legend.innerHTML = '<span><b>稳胆</b> 1.35–1.65</span><span><b>Value</b> 1.70–2.20</span><span>1.65–1.70 缓冲区</span><span>总赔率按策略 + 串数动态</span>';
  }

  if (typeof state !== 'undefined') {
    state.systemFilterActive = defaultSystemFilterState();
  }
  if (typeof renderSystemFilterUI === 'function' && document.getElementById('systemOddsMatrix')) {
    renderSystemFilterUI();
  }
  if (typeof renderMultis === 'function' && document.getElementById('multiCards')) {
    renderMultis(true);
  }
})();
