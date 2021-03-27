import { IBox, IArrow, IArrowType } from "../../types";

const RESET_LOCAL_DATA = true;
const SEED_ARROWS = false;

export const LOCAL_STORAGE_KEY = "perfect_arrows_example";

/**
 * Save something to the "database"
 * @param data
 */
export function saveToDatabase(data: string) {
  localStorage.setItem(LOCAL_STORAGE_KEY, data);
}

/**
 * Get the initial data for the store.
 */
export function getInitialData(): {
  boxes: Record<string, IBox>;
  arrows: Record<string, IArrow>;
} {
  let previous: string | null = null;
  let initial: {
    boxes: Record<string, IBox>;
    arrows: Record<string, IArrow>;
  };

  if (previous === null || RESET_LOCAL_DATA) {
    // Initial Boxes

    // Stress Test! Can do about 5000 boxes easily.

    const initBoxes = Array.from(Array(1000))
      .map((_, i) => ({
        id: "box_a" + i,
        x: 64 + Math.random() * window.innerWidth * 10,
        y: 64 + Math.random() * window.innerHeight * 10,
        width: 132 + Math.random() * 64,
        height: 132 + Math.random() * 64,
        label: "",
        color: "#FFF",
        z: i,
      }))
      .reduce((acc, cur) => {
        acc[cur.id] = cur;
        return acc;
      }, {});

    const allBoxes = Object.values(initBoxes);
    const initArrows: Record<string, IArrow> = {};

    // Seed initial arrows
    if (SEED_ARROWS) {
      for (let i = 0; i < allBoxes.length; i++) {
        let boxA = initBoxes["box_a" + i];
        let boxB = initBoxes["box_a" + (i + 1)];
        if (!boxA || !boxB) continue;

        initArrows["arrow_b" + i] = {
          id: "arrow_b" + i,
          type: IArrowType.BoxToBox,
          from: boxA.id,
          to: boxB.id,
          flip: false,
          label: "",
        };
      }
    }

    initial = {
      boxes: initBoxes,
      arrows: initArrows,
    };
  } else {
    initial = JSON.parse(previous);
  }

  return initial;
}
