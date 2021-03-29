import React, { memo, useState } from "react";
import Positions from "./positions";
import state from "../state";

function Overlays() {
  const [showPositions, setShowPositions] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        userSelect: "none",
        pointerEvents: "none",
        padding: '8px',
        maxWidth: '100%',
        bottom: 0,
        left: 0,
      }}
    >
      {showPositions && <Positions />}
      {showPositions && <input
        type="range"
        min={0}
        max={10000}
        style={{ width: "100%", pointerEvents: "all" }}
        step={100}
        onChange={(e) => {
          state.send("RESET_BOXES", e.currentTarget.value);
        }}
      />}
      <button
        style={{ marginTop: 8, pointerEvents: "all" }}
        onClick={() => setShowPositions(!showPositions)}
      >
        {showPositions ? "Hide" : "Show Debugger"}
      </button>
    </div>
  );
}

export default memo(Overlays);
