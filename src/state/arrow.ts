import { ArrowCache, steady } from ".";
import { IArrow, IArrowType, IBox } from "../../types";
import { getBoxToBoxArrow, getArrow } from "perfect-arrows";

export const computeArrow = (
  arrow: IArrow,
  boxes: Record<string, IBox>
): ArrowCache => {
  let sx: number,
    sy: number,
    cx: number,
    cy: number,
    ex: number,
    ey: number,
    ea: number;

  switch (arrow.type) {
    case IArrowType.BoxToBox: {
      const from = boxes[arrow.from];
      const to = boxes[arrow.to];
      // Box to Box Arrow
      try {
        [sx, sy, cx, cy, ex, ey, ea] = getBoxToBoxArrow(
          Math.round(from.x) || 0,
          Math.round(from.y) || 0,
          Math.round(from.width) || 0,
          Math.round(from.height) || 0,
          Math.round(to.x) || 0,
          Math.round(to.y) || 0,
          Math.round(to.width) || 0,
          Math.round(to.height) || 0
        );
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            "perfect-arrows breaks with args:" +
              [
                Math.round(from.x),
                Math.round(from.y),
                Math.round(from.width),
                Math.round(from.height),
                Math.round(to.x),
                Math.round(to.y),
                Math.round(to.width),
                Math.round(to.height),
              ]
          );
        }
        [sx, sy, cx, cy, ex, ey, ea] = [from.x, from.y, to.x, to.y, to.x, to.y, 0]
      }
      break;
    }
    case IArrowType.BoxToPoint: {
      const from = boxes[arrow.from];
      const to = arrow.to;
      // Box to Box Arrow
      [sx, sy, cx, cy, ex, ey, ea] = getBoxToBoxArrow(
        from.x,
        from.y,
        from.width,
        from.height,
        to.x,
        to.y,
        1,
        1
      );

      break;
    }
    case IArrowType.PointToBox: {
      const from = arrow.from;
      const to = boxes[arrow.to];
      // Box to Box Arrow
      [sx, sy, cx, cy, ex, ey, ea] = getBoxToBoxArrow(
        from.x,
        from.y,
        1,
        1,
        to.x,
        to.y,
        to.width,
        to.height
      );

      break;
    }
    case IArrowType.PointToPoint: {
      const { from, to } = arrow;
      // Box to Box Arrow
      [sx, sy, cx, cy, ex, ey, ea] = getArrow(from.x, from.y, to.x, to.y);

      break;
    }
  }

  return [sx, sy, cx, cy, ex, ey, ea];
};
