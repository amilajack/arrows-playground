import { Paint } from "canvaskit-wasm";
import * as Comlink from "comlink";
import { IBox } from "../../types";
import state, { pointerState, steady, __events as sceneEvents } from "../state";
import {
  invalidate,
  SkCanvas,
  SkPath,
  SkRRect,
  SkText,
  toSkPaint,
  useCanvasKit,
  useFrame,
} from "react-skia-fiber";
import { useEffect, useState, useRef } from "react";

export enum HitType {
  Canvas = "canvas",
  Bounds = "bounds",
  BoundsCorner = "bounds-corner",
  BoundsEdge = "bounds-edge",
  Box = "box",
  Arrow = "arrow",
}

export type Hit =
  | { type: HitType.Canvas }
  | { type: HitType.Bounds }
  | { type: HitType.BoundsCorner; corner: number }
  | { type: HitType.BoundsEdge; edge: number }
  | { type: HitType.Box; id: string }
  | { type: HitType.Arrow; id: string };

type ServiceRequest = (type: string, payload: any) => Promise<Hit>;

const getFromWorker = Comlink.wrap<ServiceRequest>(new Worker("worker.js"));

const getCursor = (hit: Hit) => {
  const { isIn } = state;

  if (isIn("textTool")) return "text";
  if (isIn("dragging")) return "default";

  switch (hit.type) {
    case "arrow":
    case "box":
    case "bounds": {
      return "default";
    }
    case "bounds-corner": {
      return hit.corner % 2 === 0 ? "nwse-resize" : "nesw-resize";
    }
    case "bounds-edge": {
      return hit.edge % 2 === 0 ? "ns-" : "ew-resize";
    }
    case "canvas": {
      return "default";
    }
  }

  return "default";
};

const setHit = async (canvas: HTMLCanvasElement) => {
  const hit = await getFromWorker("hitTest", {
    point: pointerState.data.document,
    bounds: steady.bounds,
    zoom: state.data.camera.zoom,
  });
  canvas.style.setProperty("cursor", getCursor(hit));
  steady.hit = hit;
  return hit;
};

export function Surface({ canvas }: { canvas: HTMLCanvasElement }) {
  const skCanvasRef = useRef<SkCanvas>();
  const [boxes, setBoxes] = useState(steady.boxes);
  const [_arrowCache, setArrowCache] = useState(steady.arrowCache);
  const ck = useCanvasKit();

  useEffect(() => {
    setArrowCache({ ...steady.arrowCache });
    getFromWorker("updateHitTree", {
      boxes: steady.boxes,
      arrows: steady.arrows,
      arrowCache: steady.arrowCache,
      zoom: state.data.camera.zoom,
    });

    const resetDemo = () => {
      setBoxes(steady.boxes);
      setArrowCache(steady.arrowCache);
      getFromWorker("updateHitTree", {
        boxes: steady.boxes,
        arrows: steady.arrows,
        arrowCache: steady.arrowCache,
        zoom: state.data.camera.zoom,
      });
    };
    sceneEvents.on("demo.boxCountChanged", resetDemo);

    const unsubState = state.onUpdate(() => {
      // console.log(state.active);
      invalidate();
    });
    const unsubPointerState = pointerState.onUpdate(() => {
      invalidate();
    });

    return () => {
      unsubState();
      unsubPointerState();
      sceneEvents.off("demo.boxCountChanged", resetDemo);
    };
  }, []);

  useFrame(() => {
    setHit(canvas);
  });

  // SkCanvas does not allow directly setting canvas transforms (ie. setTransform) so we need to
  // manipulate it using save() and restore()
  useFrame(() => {
    const { camera } = state.data;
    const canvas = skCanvasRef.current?.object;
    if (!canvas) return;

    canvas.save();

    canvas.translate(camera.x * devicePixelRatio, camera.y * devicePixelRatio);
    canvas.scale(2 * camera.zoom, 2 * camera.zoom);
  });

  // After all frames have finished, restore the transform to the previous state
  useFrame(
    () => {
      skCanvasRef.current?.object?.restore();
    },
    { renderPriority: 0, sequence: "after" }
  );

  const { current: boxPaint } = useRef(new ck.Paint());
  const { current: selectedBoxPaint } = useRef(new ck.Paint());
  const { current: boxStrokePaint } = useRef(new ck.Paint());
  const { current: boundsPaint } = useRef(new ck.Paint());
  const { current: brushPaint } = useRef(new ck.Paint());

  useEffect(() => {
    toSkPaint(ck, boxPaint, {
      color: "white",
      style: "fill",
      antiAlias: true,
    });

    toSkPaint(ck, selectedBoxPaint, {
      color: "dodger",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });

    toSkPaint(ck, boxStrokePaint, {
      color: "black",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });

    toSkPaint(ck, boundsPaint, {
      color: "dodgerblue",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });

    toSkPaint(ck, brushPaint, {
      color: "dodgerblue",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });
  }, []);

  return (
    <skCanvas ref={skCanvasRef} clear="#efefef">
      {/* {state.isIn('creatingArrow') && <Arrow key={i} arrow={arrow} />} */}
      <Brush paint={brushPaint} />
      <Bounds paint={boundsPaint} />
      {Object.values(boxes).map((box) => (
        <Box
          box={box}
          paint={boxPaint}
          strokePaint={boxStrokePaint}
          selectedStrokePaint={selectedBoxPaint}
        />
      ))}
      {Object.entries(_arrowCache).map(([id]) => (
        <Arrow key={id} id={id} />
      ))}
    </skCanvas>
  );
}

function Bounds({ paint }: { paint: Paint }) {
  const rBounds = useRef<SkRRect>();
  const ck = useCanvasKit();

  useFrame(() => {
    const { current: bounds } = rBounds;
    if (!bounds || !steady.bounds) {
      paint.setAlphaf(0);
      return;
    }
    paint.setAlphaf(1);
    bounds.x = steady.bounds.x;
    bounds.y = steady.bounds.y;
    bounds.width = steady.bounds.width;
    bounds.height = steady.bounds.height;
    bounds.layout();
  });

  return <skRrect ref={rBounds} paint={paint} />;
}

function Brush({ paint }: { paint: Paint }) {
  const rBrush = useRef<SkRRect>();
  const ck = useCanvasKit();

  useFrame(() => {
    const { current: brush } = rBrush;
    if (!brush || !steady.brush || !steady.brush.x0) {
      paint.setAlphaf(0);
      return;
    }
    paint.setAlphaf(1);
    const { x1, y1, x0, y0 } = steady.brush;
    brush.x = Math.min(x1, x0);
    brush.y = Math.min(y1, y0);
    brush.width = Math.abs(x0 - x1);
    brush.height = Math.abs(y0 - y1);
    brush.layout();
  });

  return <skRrect ref={rBrush} paint={paint} />;
}

const isBoxSelected = (box: IBox) => state.data.selectedBoxIds.includes(box.id);

function Box({
  box,
  paint,
  strokePaint,
  selectedStrokePaint,
}: {
  box: IBox;
  paint: Paint;
  strokePaint: Paint;
  selectedStrokePaint: Paint;
}) {
  const [localBox, set] = useState(box);
  const rFill = useRef<SkRRect>();
  const rStroke = useRef<SkRRect>();
  const rId = useRef<SkText>();
  const rPos = useRef<SkText>();

  useFrame(() => {
    if (
      !rFill.current ||
      !rStroke.current ||
      !rPos.current ||
      !rId.current ||
      !steady.boxes[box.id]
    )
      return;
    const { x, y, width, height } = steady.boxes[box.id]!;

    rFill.current.x = x;
    rFill.current.y = y;
    rFill.current.width = width;
    rFill.current.height = height;
    rFill.current.layout();

    rStroke.current.x = x;
    rStroke.current.y = y;
    rStroke.current.width = width;
    rStroke.current.height = height;
    rStroke.current.layout();

    rPos.current.x = x;
    rPos.current.y = y + height + 40;
    rPos.current.text = `${Math.round(localBox.x)}x${Math.round(localBox.y)}`;

    rId.current.x = x;
    rId.current.y = y - 10;

    rStroke.current.paint = isBoxSelected(box)
      ? selectedStrokePaint
      : strokePaint;
  });

  return (
    <>
      <skText ref={rId} text={localBox.id} />
      <skText ref={rPos} />
      <skRrect ref={rFill} paint={paint} />
      <skRrect
        ref={rStroke}
        paint={isBoxSelected(box) ? selectedStrokePaint : strokePaint}
      />
    </>
  );
}

const transformArrowhead = (
  px: number,
  py: number,
  ex: number,
  ey: number,
  ea: number
): [number, number] => {
  const point = new DOMPoint(px, py).matrixTransform(
    new DOMMatrix(`translate(${ex}px, ${ey}px) rotate(${ea}rad)`)
  );
  return [point.x, point.y];
};

const isArrowFocused = (id: string) =>
  steady.hit?.id === id || state.data.selectedArrowIds.includes(id);

function Arrow({ id: id }: { id: string }) {
  const ck = useCanvasKit();
  const rArrowTips = useRef<SkPath>();
  const rArrow = useRef<SkPath>();
  const { current: arrowPaint } = useRef<Paint>(new ck.Paint());
  const { current: arrowTipsPaint } = useRef<Paint>(new ck.Paint());

  useFrame(() => {
    if (!steady.arrowCache[id]) return;
    const [sx, sy, cx, cy, ex, ey, ea] = steady.arrowCache[id];
    const { path: arrowTipPath } = rArrowTips.current!;
    const arrow = rArrow.current!;

    arrowTipPath.reset();

    // Arrowtail
    const rect = ck.XYWHRect(sx - 10, sy - 10, 20, 20);
    arrowTipPath.addOval(rect);

    // Arrowhead
    const r = 15;
    arrowTipPath.moveTo(...transformArrowhead(0, -r, ex, ey, ea));
    arrowTipPath.lineTo(...transformArrowhead(r * 2, 0, ex, ey, ea));
    arrowTipPath.lineTo(...transformArrowhead(0, r, ex, ey, ea));

    // Arrow body
    arrow.svg = `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
    arrow.layout();

    if (isArrowFocused(id)) {
      toSkPaint(ck, arrowPaint, {
        style: "stroke",
        strokeWidth: 8,
        color: "dodgerblue",
      });
      toSkPaint(ck, arrowTipsPaint, {
        color: "dodgerblue",
      });
    } else {
      toSkPaint(ck, arrowPaint, {
        style: "stroke",
        strokeWidth: 8,
        color: "black",
      });
      toSkPaint(ck, arrowTipsPaint, {
        color: "black",
      });
    }
  });

  return (
    <>
      <skPath
        ref={rArrowTips}
        paint={arrowTipsPaint}
        style={{ style: "fill", antiAlias: true }}
      />
      <skPath
        ref={rArrow}
        paint={arrowPaint}
        style={{ style: "stroke", strokeWidth: 8, antiAlias: true }}
      />
    </>
  );
}
