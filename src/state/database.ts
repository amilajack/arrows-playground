import { ArrowCache as ComputedArrow } from ".";
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
  arrowCache: Record<string, ComputedArrow>;
};

/**
 * Get the initial data for the store.
 * Stress Test! Can do about 5000 boxes easily.
 */
export function seedInitialData(boxCount = 700): Data {
  let initial: Data;

  // Seed initial boxes
  const initBoxes: Record<string, IBox> = Array.from(Array(boxCount))
    .map((_, i) => ({
      id: `b_${i}`,
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
  const arrowCache: Record<string, ComputedArrow> = {};

  // Seed initial arrows
  if (SEED_ARROWS) {
    const boxes = Object.values(initBoxes);
    const boxCount = boxes.length;
    for (let i = 0; i < boxCount; i++) {
      const shouldCreateArrow = Math.random() < ARROW_PROBABILITY;
      if (!shouldCreateArrow) continue;

      let boxA = initBoxes[`b_${i}`] as IBox;
      // Create arrows between boxes that are close to each other to create a
      // realistic looking diagram
      let boxB = boxes.find(
        (box) =>
          box.id! !== boxA.id &&
          Math.abs(boxA.x - box.x) < 500 &&
          Math.abs(boxA.y - box.y) < 500
      );
      if (!boxA || !boxB) continue;

      const arrowId = `a_${Object.keys(initArrows).length}`;
      initArrows[arrowId] = {
        id: arrowId,
        type: IArrowType.BoxToBox,
        from: boxA.id,
        to: boxB.id,
        flip: false,
        label: "",
      };
      arrowCache[arrowId] = computeArrow(initArrows[arrowId], initBoxes);
      boxA.arrows.push(arrowId);
      boxB.arrows.push(arrowId);
    }
  }

  return {
    boxes: initBoxes,
    arrows: initArrows,
    arrowCache,
  };
}
