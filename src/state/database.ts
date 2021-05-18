import { ArrowCache as CachedArrow } from ".";
import { IBox, IArrow, IArrowType } from "../../types";
import { computeArrow } from "./arrow";

const RESET_LOCAL_DATA = true;
const SEED_ARROWS = true;
// The probability that an arrow should be drawn between two boxes
const ARROW_PROBABILITY = 0.1;

export const LOCAL_STORAGE_KEY = "perfect_arrows_example";

/**
 * Save something to the "database"
 * @param data
 */
export function saveToDatabase(data: string) {
  localStorage.setItem(LOCAL_STORAGE_KEY, data);
}

type Data = {
  boxes: Record<string, IBox>;
  arrows: Record<string, IArrow>;
  arrowCache: Record<string, CachedArrow>;
};

/**
 * Get the initial data for the store.
 */
export function getInitialData(): Data {
  let previous: string | null = null;
  let initial: Data;

  if (previous === null || RESET_LOCAL_DATA) {
    // Initial Boxes

    // Stress Test! Can do about 5000 boxes easily.

    const initBoxes: Record<string, IBox> = Array.from(Array(700))
      .map((_, i) => ({
        id: String(i),
        x: 64 + Math.random() * window.innerWidth * 10,
        y: 64 + Math.random() * window.innerHeight * 10,
        width: 132 + Math.random() * 64,
        height: 132 + Math.random() * 64,
        label: "",
        color: "#FFF",
        arrows: [],
        z: i,
      }))
      .reduce((acc, cur) => {
        acc[cur.id] = cur;
        return acc;
      }, {} as Record<string, IBox>);

    const initArrows: Record<string, IArrow> = {};
    const arrowCache: Record<string, CachedArrow> = {};

    // Seed initial arrows
    if (SEED_ARROWS) {
      const boxes = Object.values(initBoxes);
      const boxCount = boxes.length;
      for (let i = 0; i < boxCount; i++) {
        const shouldCreateArrow = Math.random() < ARROW_PROBABILITY;
        if (!shouldCreateArrow) continue;

        let boxA = initBoxes[String(i)] as IBox;
        // Create arrows between boxes that are close to each other to create a
        // realistic looking diagram
        let boxB = boxes.find(
          (box) =>
            box.id! !== boxA.id &&
            Math.abs(boxA.x - box.x) < 500 &&
            Math.abs(boxA.y - box.y) < 500
        );
        if (!boxA || !boxB) continue;

        const id = String(i);

        initArrows[id] = {
          id: id,
          type: IArrowType.BoxToBox,
          from: boxA.id,
          to: boxB.id,
          flip: false,
          label: "",
        };
        arrowCache[id] = computeArrow(initArrows[id], initBoxes);
        boxA.arrows.push(id);
        boxB.arrows.push(id);
      }
    }

    initial = {
      boxes: initBoxes,
      arrows: initArrows,
      arrowCache,
    };
  } else {
    initial = JSON.parse(previous);
  }

  return initial;
}
