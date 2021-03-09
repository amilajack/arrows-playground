import React, { memo } from "react";
import Positions from "./positions";
import state from "../state";

function Overlays() {
  const [showPositions, setShowPositions] = React.useState(
    process.env.NODE_ENV !== "production"
  );

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
      <input
        type="range"
        min={0}
        max={10000}
        style={{ width: "600px", maxWidth: "100%", pointerEvents: "all", marginBottom: 80 }}
        step={100}
        onChange={(e) => {
          state.send("RESET_BOXES", e.currentTarget.value);
        }}
      />
      {showPositions && <Positions />}
      <button
        style={{ marginTop: 8, pointerEvents: "all" }}
        onClick={() => setShowPositions(!showPositions)}
      >
        {showPositions ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export default memo(Overlays);
