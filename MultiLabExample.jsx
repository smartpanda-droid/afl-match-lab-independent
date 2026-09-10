import React, { useState } from "react";
import MultiLabMarketPicker from "./components/MultiLabMarketPicker";
import "./multilab-market-picker.css";

export default function MultiLabExample({ matchId }) {
  const [legs, setLegs] = useState([]);

  function addLegToCurrentMulti(leg) {
    setLegs((prev) => {
      const key = `${leg.market}|${leg.selection}`;
      if (prev.some((x) => `${x.market}|${x.selection}` === key)) return prev;
      return [...prev, leg];
    });
  }

  return (
    <div>
      <MultiLabMarketPicker
        matchId={matchId}
        onAddLeg={addLegToCurrentMulti}
      />

      <pre>{JSON.stringify(legs, null, 2)}</pre>
    </div>
  );
}
