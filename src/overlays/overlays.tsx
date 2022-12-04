import { memo, useState } from "react";
import Positions from "./positions";
import state, { steady } from "../state";

function Overlays() {
  const [showPositions, setShowPositions] = useState(false);
  const [boxCount, setBoxCount] = useState(
    Object.keys(steady.boxes).length || 0
  );

  return (
    <div
      style={{
        position: "absolute",
        userSelect: "none",
        pointerEvents: "none",
        padding: "8px",
        maxWidth: "100%",
        bottom: 0,
        left: 0,
      }}
    >
      {/* {showPositions && <Positions />} */}
      {showPositions && <span>{boxCount} Boxes</span>}
      {showPositions && (
        <input
          type="range"
          min={0}
          max={10_000}
          style={{ width: "100%", pointerEvents: "all" }}
          step={100}
          onChange={(e) => {
            state.send("RESET_BOXES", e.currentTarget.value);
            setBoxCount(parseInt(e.currentTarget!.value, 10));
          }}
        />
      )}
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
