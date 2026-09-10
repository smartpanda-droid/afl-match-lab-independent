import React, { useEffect, useMemo, useState } from "react";
import { getMultiLabMarketPicker, quoteMultiLabMarket } from "../lib/multiLabMarkets";

function roundHalf(value) {
  return Math.round(Number(value) * 2) / 2;
}

export default function MultiLabMarketPicker({
  matchId,
  onAddLeg,
  className = "",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalLine, setTotalLine] = useState(null);
  const [homeLine, setHomeLine] = useState(null);
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!matchId) return;

    setLoading(true);
    setError("");
    getMultiLabMarketPicker(matchId)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setTotalLine(payload?.total?.center ?? null);
        setHomeLine(payload?.handicap?.home?.center ?? null);
      })
      .catch((e) => alive && setError(e?.message || "Failed to load match markets"))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [matchId]);

  const awayLine = useMemo(() => {
    if (homeLine == null) return null;
    return -Number(homeLine);
  }, [homeLine]);

  async function refreshQuote(nextHomeLine = homeLine, nextTotalLine = totalLine) {
    try {
      const q = await quoteMultiLabMarket(matchId, {
        homeLine: nextHomeLine,
        totalLine: nextTotalLine,
      });
      setQuote(q);
      return q;
    } catch {
      return null;
    }
  }

  function addWinner(side) {
    if (!data) return;
    const team =
      side === "home" ? data.home_team_name : data.away_team_name;
    const probability =
      side === "home"
        ? data.winner?.home?.probability
        : data.winner?.away?.probability;

    onAddLeg?.({
      source: "manual_match_market",
      market: "MATCH_WINNER",
      selection: team,
      team_name: team,
      model_probability: probability ?? null,
      fair_odds: probability ? Number((1 / probability).toFixed(3)) : null,
      match_id: matchId,
    });
  }

  async function addTotal(side) {
    const q = await refreshQuote(homeLine, totalLine);
    const probability =
      side === "OVER"
        ? q?.over_probability
        : q?.under_probability;

    onAddLeg?.({
      source: "manual_match_market",
      market: "TOTAL_POINTS",
      selection: `${side} ${roundHalf(totalLine)}`,
      threshold: roundHalf(totalLine),
      model_probability: probability ?? null,
      fair_odds: probability ? Number((1 / probability).toFixed(3)) : null,
      match_id: matchId,
    });
  }

  async function addHandicap(side) {
    const q = await refreshQuote(homeLine, totalLine);
    const isHome = side === "home";
    const team = isHome ? data.home_team_name : data.away_team_name;
    const line = isHome ? Number(homeLine) : Number(awayLine);
    const probability = isHome
      ? q?.home_cover_probability
      : q?.away_cover_probability;

    onAddLeg?.({
      source: "manual_match_market",
      market: "HANDICAP",
      selection: `${team} ${line >= 0 ? "+" : ""}${roundHalf(line)}`,
      threshold: roundHalf(line),
      team_name: team,
      model_probability: probability ?? null,
      fair_odds: probability ? Number((1 / probability).toFixed(3)) : null,
      match_id: matchId,
    });
  }

  if (!matchId) return null;

  return (
    <div className={`ml-market-picker ${className}`}>
      <div className="ml-market-picker__head">
        <div>
          <div className="ml-market-picker__eyebrow">ADD MATCH LEG</div>
          <h3>比赛市场</h3>
        </div>
        {loading && <span className="ml-badge">Loading…</span>}
      </div>

      {error && <div className="ml-error">{error}</div>}

      {data && (
        <>
          <section className="ml-card">
            <div className="ml-card__title">胜负</div>
            <div className="ml-grid-2">
              <button className="ml-choice" onClick={() => addWinner("home")}>
                <span>{data.home_team_name}</span>
                <strong>
                  {data.winner?.home?.probability != null
                    ? `${(data.winner.home.probability * 100).toFixed(1)}%`
                    : "—"}
                </strong>
              </button>

              <button className="ml-choice" onClick={() => addWinner("away")}>
                <span>{data.away_team_name}</span>
                <strong>
                  {data.winner?.away?.probability != null
                    ? `${(data.winner.away.probability * 100).toFixed(1)}%`
                    : "—"}
                </strong>
              </button>
            </div>
          </section>

          <section className="ml-card">
            <div className="ml-card__title">大小球</div>
            <div className="ml-center-value">
              模型总分中线 <strong>{roundHalf(totalLine)}</strong>
            </div>

            <input
              className="ml-slider"
              type="range"
              min={data.total.min}
              max={data.total.max}
              step={data.total.step || 0.5}
              value={totalLine ?? data.total.center}
              onChange={(e) => setTotalLine(Number(e.target.value))}
              onMouseUp={() => refreshQuote(homeLine, totalLine)}
              onTouchEnd={() => refreshQuote(homeLine, totalLine)}
            />

            <div className="ml-range-labels">
              <span>{roundHalf(data.total.min)}</span>
              <span>{roundHalf(data.total.max)}</span>
            </div>

            <div className="ml-grid-2">
              <button className="ml-choice" onClick={() => addTotal("UNDER")}>
                <span>UNDER {roundHalf(totalLine)}</span>
                <strong>
                  {quote?.under_probability != null
                    ? `${(quote.under_probability * 100).toFixed(1)}%`
                    : "加入"}
                </strong>
              </button>

              <button className="ml-choice" onClick={() => addTotal("OVER")}>
                <span>OVER {roundHalf(totalLine)}</span>
                <strong>
                  {quote?.over_probability != null
                    ? `${(quote.over_probability * 100).toFixed(1)}%`
                    : "加入"}
                </strong>
              </button>
            </div>
          </section>

          <section className="ml-card">
            <div className="ml-card__title">让球</div>

            <div className="ml-handicap-line">
              <span>{data.home_team_name}</span>
              <strong>
                {Number(homeLine) >= 0 ? "+" : ""}
                {roundHalf(homeLine)}
              </strong>
              <span className="ml-vs">vs</span>
              <strong>
                {Number(awayLine) >= 0 ? "+" : ""}
                {roundHalf(awayLine)}
              </strong>
              <span>{data.away_team_name}</span>
            </div>

            <input
              className="ml-slider"
              type="range"
              min={data.handicap.home.min}
              max={data.handicap.home.max}
              step={data.handicap.home.step || 0.5}
              value={homeLine ?? data.handicap.home.center}
              onChange={(e) => setHomeLine(Number(e.target.value))}
              onMouseUp={() => refreshQuote(homeLine, totalLine)}
              onTouchEnd={() => refreshQuote(homeLine, totalLine)}
            />

            <div className="ml-range-labels">
              <span>{roundHalf(data.handicap.home.min)}</span>
              <span>{roundHalf(data.handicap.home.max)}</span>
            </div>

            <div className="ml-grid-2">
              <button className="ml-choice" onClick={() => addHandicap("home")}>
                <span>
                  {data.home_team_name} {Number(homeLine) >= 0 ? "+" : ""}
                  {roundHalf(homeLine)}
                </span>
                <strong>
                  {quote?.home_cover_probability != null
                    ? `${(quote.home_cover_probability * 100).toFixed(1)}%`
                    : "加入"}
                </strong>
              </button>

              <button className="ml-choice" onClick={() => addHandicap("away")}>
                <span>
                  {data.away_team_name} {Number(awayLine) >= 0 ? "+" : ""}
                  {roundHalf(awayLine)}
                </span>
                <strong>
                  {quote?.away_cover_probability != null
                    ? `${(quote.away_cover_probability * 100).toFixed(1)}%`
                    : "加入"}
                </strong>
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
