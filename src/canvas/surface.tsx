import { Paint } from "canvaskit-wasm";
import * as Comlink from "comlink";
import { IBox } from "../../types";
import state, { pointerState, steady, sceneEvents } from "../state";
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
import { CenteredRect, getCorners } from "../utils";

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
      return hit.edge % 2 === 0 ? "ns-resize" : "ew-resize";
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
    const deletion = () => {
      setArrowCache({ ...steady.arrowCache });
    };
    sceneEvents.on("demo.boxCountChanged", resetDemo);
    sceneEvents.on("deletion", deletion);

    const unsubState = state.onUpdate(() => {
      invalidate();
    });
    const unsubPointerState = pointerState.onUpdate(() => {
      invalidate();
    });

    return () => {
      unsubState();
      unsubPointerState();
      sceneEvents.off("demo.boxCountChanged", resetDemo);
      sceneEvents.off("deletion", deletion);
    };
  }, []);

  useFrame(() => {
    if (state.isIn("selectingIdle")) {
      // @TODO: Don't sort boxes on each frame
      const zSortedBoxes = Object.values(steady.boxes).sort(
        (a, b) => a.z - b.z
      );
      getFromWorker("updateHitTree", {
        boxes: zSortedBoxes,
        arrows: steady.arrows,
        arrowCache: steady.arrowCache,
        zoom: state.data.camera.zoom,
      });
    }
    setHit(canvas).then(console.log);
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

  const boxPaint = useRef<Paint>();
  const selectedBoxPaint = useRef<Paint>();
  const boxStrokePaint = useRef<Paint>();
  const boundsPaint = useRef<Paint>();
  const brushPaint = useRef<Paint>();

  useEffect(() => {
    boxPaint.current = new ck.Paint();
    selectedBoxPaint.current = new ck.Paint();
    boxStrokePaint.current = new ck.Paint();
    boundsPaint.current = new ck.Paint();
    brushPaint.current = new ck.Paint();

    toSkPaint(ck, boxPaint.current, {
      color: "white",
      style: "fill",
      antiAlias: true,
    });

    toSkPaint(ck, selectedBoxPaint.current, {
      color: "dodger",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });

    toSkPaint(ck, boxStrokePaint.current, {
      color: "black",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });

    toSkPaint(ck, boundsPaint.current, {
      color: "dodgerblue",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });

    toSkPaint(ck, brushPaint.current, {
      color: "dodgerblue",
      style: "stroke",
      antiAlias: true,
      strokeWidth: 8,
    });
  }, []);

  return (
    <skCanvas ref={skCanvasRef} clear="#efefef">
      {/* {state.isIn('creatingArrow') && <Arrow key={i} arrow={arrow} />} */}
      {Object.values(boxes).map((box) => (
        <Box
          box={box}
          paint={boxPaint.current}
          strokePaint={boxStrokePaint.current}
          selectedStrokePaint={selectedBoxPaint.current}
        />
      ))}
      {Object.entries(_arrowCache).map(([id]) => (
        <Arrow key={id} id={id} />
      ))}
      <Brush paint={brushPaint.current} />
      <Bounds paint={boundsPaint.current} />
    </skCanvas>
  );
}

function Bounds({ paint: boundsPaint }: { paint: Paint }) {
  const ck = useCanvasKit();
  const rBounds = useRef<SkPath>();
  const rCorners = useRef<SkPath>();
  const rCornersPaint = useRef<Paint>();

  useEffect(() => {
    rCornersPaint.current = new ck.Paint();
  }, []);

  useFrame(() => {
    const { current: bounds } = rBounds;
    if (
      !bounds ||
      !steady.bounds ||
      !steady.bounds.height ||
      !steady.bounds.width
    ) {
      boundsPaint.setAlphaf(0);
      rCornersPaint.current!.setAlphaf(0);
      return;
    }

    boundsPaint.setAlphaf(1);
    boundsPaint.setStrokeWidth(2 / state.data.camera.zoom);

    // @TODO @HACK Ideally gemoetry would be removed on unmount
    rBounds.current!.path.reset();
    rBounds.current!.path.addRect(
      ck.XYWHRect(
        steady.bounds.x,
        steady.bounds.y,
        steady.bounds.width,
        steady.bounds.height
      )
    );

    rCorners.current?.path.reset();
    toSkPaint(ck, rCornersPaint.current!, {
      style: "fill",
      color: ck._testing.parseColor("dodgerblue"),
      antiAlias: true,
    });
    rCornersPaint.current!.setAlphaf(1);

    for (let [x, y] of getCorners(
      steady.bounds.x,
      steady.bounds.y,
      steady.bounds.width,
      steady.bounds.height
    )) {
      const size = 7 / state.data.camera.zoom;
      rCorners.current?.path.addRect(CenteredRect(ck, x, y, size, size));
    }
  });

  return (
    <>
      <skPath ref={rBounds} paint={boundsPaint} />
      <skPath ref={rCorners} paint={rCornersPaint.current} />
    </>
  );
}

function Brush({ paint }: { paint: Paint }) {
  const rBrush = useRef<SkRRect>();

  useFrame(() => {
    const { current: brush } = rBrush;
    if (!brush || !steady.brush || !steady.brush.x0) {
      paint.setAlphaf(0);
      return;
    }
    paint.setAlphaf(1);
    paint.setStrokeWidth(2 / state.data.camera.zoom);
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
  const arrowPaint = useRef<Paint>();
  const arrowTipsPaint = useRef<Paint>();

  useEffect(() => {
    arrowPaint.current = new ck.Paint();
    arrowTipsPaint.current = new ck.Paint();
  }, []);

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

    if (arrowPaint.current && arrowTipsPaint.current) {
      if (isArrowFocused(id)) {
        toSkPaint(ck, arrowPaint.current, {
          style: "stroke",
          strokeWidth: 8,
          color: "dodgerblue",
          antiAlias: true,
        });
        toSkPaint(ck, arrowTipsPaint.current, {
          color: "dodgerblue",
          antiAlias: true,
        });
      } else {
        toSkPaint(ck, arrowPaint.current, {
          style: "stroke",
          strokeWidth: 8,
          color: "black",
          antiAlias: true,
        });
        toSkPaint(ck, arrowTipsPaint.current, {
          color: "black",
          antiAlias: true,
        });
      }
    }
  });

  return (
    <>
      <skPath
        ref={rArrowTips}
        paint={arrowTipsPaint.current}
        style={{ style: "fill", antiAlias: true }}
      />
      <skPath
        ref={rArrow}
        paint={arrowPaint.current}
        style={{ style: "stroke", strokeWidth: 8, antiAlias: true }}
      />
    </>
  );
}
