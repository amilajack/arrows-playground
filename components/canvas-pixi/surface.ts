import * as PIXI from "pixi.js";
import { doBoxesCollide, pointInRectangle, getCorners, camera } from "../utils";
import { getArrow, getBoxToBoxArrow } from "perfect-arrows";
import { IBox, IArrowType } from "../../types";
import state, { pointerState, steady } from "../state";
import * as Comlink from "comlink";

const arrowCache: number[][] = [];

const dpr = window.devicePixelRatio || 1;

export enum HitType {
  Canvas = "canvas",
  Bounds = "bounds",
  BoundsCorner = "bounds-corner",
  BoundsEdge = "bounds-edge",
  Box = "box",
}

export type Hit =
  | { type: HitType.Canvas }
  | { type: HitType.Bounds }
  | { type: HitType.BoundsCorner; corner: number }
  | { type: HitType.BoundsEdge; edge: number }
  | { type: HitType.Box; id: string };

type ServiceRequest = (type: string, payload: any) => Promise<Hit>;

const getFromWorker = Comlink.wrap<ServiceRequest>(new Worker("worker.js"));

class Surface {
  cvs: HTMLCanvasElement;

  allBoxes: IBox[] = [];
  hit: Hit = { type: HitType.Canvas };

  app: PIXI.Application;
  graphics: PIXI.Graphics;
  scale: PIXI.ObservablePoint;

  state = state;
  hoveredId = "";
  private _diffIndex: number;
  private _looping: boolean;

  constructor(canvas: HTMLCanvasElement, app: PIXI.Application) {
    this.cvs = canvas;
    this.app = app;
    this.graphics = new PIXI.Graphics();

    this.app.renderer.backgroundColor = 0xefefef;

    const setup = () => {
      const { graphics } = this;
      // Start the render loop
      const boxes = Object.values(steady.boxes).sort((a, b) => b.z - a.z);
      getFromWorker("updateHitTree", boxes);
      let timeout;

      // A simple solution to prevent raf calls after all updates are finished
      state.onUpdate(() => {
        if (!this.app.ticker) return;
        if (!this.app.ticker.started) this.app.ticker.start();
        clearTimeout(timeout);
        this.drawText();
        timeout = setTimeout(() => {
          this.app.ticker?.stop();
        }, 2000);
      });

      this.computeArrows();
      this.draw();
      this.app.stage.addChild(graphics);

      this.app.ticker.add(renderLoop);
      this.app.ticker.start();
      this.app.ticker.autoStart = false;
    };

    const setHit = async () => {
      this.hit = await getFromWorker("hitTest", {
        point: pointerState.data.document,
        bounds: steady.bounds,
        zoom: this.state.data.camera.zoom,
      });
      this.cvs.style.setProperty("cursor", this.getCursor(this.hit));
    };

    const renderLoop = (_delta: number) => {
      this.setupCamera();

      if (state.isIn("selectingIdle")) {
        setHit();
      }
      if (state.isIn("textTool")) {
        this.cvs.style.setProperty("cursor", this.getCursor(this.hit));
      }

      let id = "";
      if (this.hit.type === "box") id = this.hit.id;

      if (id !== this.hoveredId) {
        this.hoveredId = id;
        // @TODO: Re-enable this optimization
        // if (state.index === this._diffIndex) {
        //   this.clear();
        //   this.draw();
        // }
      }

      // @TODO: Re-enable this optimization. This was a premature optimization at the time
      //        of writing
      // if (state.index === this._diffIndex) {
      //   return;
      // }

      if (state.isIn("selectingIdle")) {
        this.allBoxes = Object.values(steady.boxes);
        this.allBoxes = this.allBoxes.sort((a, b) => a.z - b.z);
        getFromWorker("updateHitTree", this.allBoxes);
      } else {
        // @TODO: Re-enable this optimization. This was a premature optimization at the time
        //        of writing
        // this.clear();
        // this.draw();
      }
      this.clear();
      this.draw();

      this._diffIndex = state.index;
    };

    this.app.loader.load(setup);

    this.app.start();
  }

  destroy() {
    this._looping = false;
    this.app.destroy();
  }

  draw() {
    this.drawBoxes();
    this.drawBrush();
    this.drawSelection();

    if (this.state.isInAny("dragging", "edgeResizing", "cornerResizing")) {
      this.computeArrows();
    }

    this.drawArrows();
    this.drawText();
    this.drawSelection();
  }

  setupCamera() {
    const { camera } = this.state.data;

    this.graphics.setTransform(
      camera.x,
      camera.y,
      camera.zoom,
      camera.zoom,
      0,
      0,
      0,
      0,
      0
    );
  }

  drawText() {
    const { data } = this.state;
    if (!data.text) return;
    let text = new PIXI.Text("This is a PixiJS text", {
      fontFamily: "Arial",
      fontSize: 24,
      // fill: 0xff1010,
      align: "center",
    });
    const { y, x } = data.text;
    text.x = x;
    text.y = y;
    this.graphics.addChild(text);
  }

  drawBoxes() {
    const { graphics } = this;
    const boxes = Object.values(steady.boxes);
    graphics.lineStyle(2 / this.state.data.camera.zoom, 0x000000, 1);
    graphics.beginFill(0xffffff, 0.9);

    for (let box of boxes) {
      graphics.drawRect(box.x, box.y, box.width, box.height);
    }

    const allSpawningBoxes = Object.values(steady.spawning.boxes);
    if (allSpawningBoxes.length > 0) {
      graphics.lineStyle(2 / this.state.data.camera.zoom, 0x1e90ff, 1);

      for (let box of allSpawningBoxes) {
        graphics.drawRect(box.x, box.y, box.width, box.height);
      }
    }

    graphics.endFill();
  }

  drawSelection() {
    const { graphics } = this;
    const { boxes, bounds } = steady;
    const { camera, selectedBoxIds } = this.state.data;

    graphics.lineStyle(2 / camera.zoom, 0x1e90ff, 1);

    if (selectedBoxIds.length > 0) {
      // draw box outlines
      for (let id of selectedBoxIds) {
        let box = boxes[id];
        graphics.drawRect(box.x, box.y, box.width, box.height);
      }
    }

    if (
      bounds &&
      selectedBoxIds.length > 0 &&
      !this.state.isIn("brushSelecting")
    ) {
      // draw bounds outline
      graphics.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
      graphics.beginFill(0x1e90ff, 1);
      for (let [x, y] of getCorners(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height
      )) {
        graphics.drawCircle(x, y, 3 / camera.zoom);
      }
      graphics.endFill();
    }

    if (this.hit.type === "box") {
      const box = steady.boxes[this.hit.id];
      if (!box) {
        this.hit = { type: HitType.Canvas };
      } else {
        graphics.lineStyle(1.5 / camera.zoom, 0x1e90ff, 1);
        graphics.drawRect(box.x, box.y, box.width, box.height);
      }
    }
  }

  hitTest(): Hit {
    const point = pointerState.data.document;
    const { bounds } = steady;
    const { camera, viewBox } = this.state.data;

    if (bounds) {
      // Test if point collides the (padded) bounds
      if (pointInRectangle(point, bounds, 16)) {
        const { x, y, width, height, maxX, maxY } = bounds;
        const p = 5 / camera.zoom;
        const pp = p * 2;

        const cornerBoxes = [
          { x: x - p, y: y - p, width: pp, height: pp },
          { x: maxX - p, y: y - p, width: pp, height: pp },
          { x: maxX - p, y: maxY - p, width: pp, height: pp },
          { x: x - p, y: maxY - p, width: pp, height: pp },
        ];

        for (let i = 0; i < cornerBoxes.length; i++) {
          if (pointInRectangle(point, cornerBoxes[i])) {
            return { type: HitType.BoundsCorner, corner: i };
          }
        }

        const edgeBoxes = [
          { x: x + p, y: y - p, width: width - pp, height: pp },
          { x: maxX - p, y: y + p, width: pp, height: height - pp },
          { x: x + p, y: maxY - p, width: width - pp, height: pp },
          { x: x - p, y: y + p, width: pp, height: height - pp },
        ];

        for (let i = 0; i < edgeBoxes.length; i++) {
          if (pointInRectangle(point, edgeBoxes[i])) {
            return { type: HitType.BoundsEdge, edge: i };
          }
        }
        // Point is in the middle of the bounds
        return { type: HitType.Bounds };
      }
    }

    // Either we don't have bounds or we're out of bounds
    for (let box of this.allBoxes.filter((box) =>
      doBoxesCollide(box, viewBox.document)
    )) {
      // Test if point collides the (padded) box
      if (pointInRectangle(point, box)) {
        // Point is in the middle of the box
        return { type: HitType.Box, id: box.id };
      }
    }

    return { type: HitType.Canvas };
  }

  clear() {
    // Reset transform?
    this.graphics.clear();
  }

  drawDot(x: number, y: number, radius = 4) {
    const r = radius / this.state.data.camera.zoom;
    this.graphics.beginFill(0x000, 1);
    this.graphics.drawCircle(x, y, r);
    this.graphics.endFill();
  }

  drawBrush() {
    const { graphics } = this;
    const { brush } = steady;

    if (!brush) return;

    const { x0, y0, x1, y1 } = brush;
    graphics.lineStyle(1 / this.state.data.camera.zoom, 0x00aaff, 1);
    graphics.beginFill(0x00aaff, 0.05);
    graphics.drawRect(
      Math.min(x1, x0),
      Math.min(y1, y0),
      Math.abs(x1 - x0),
      Math.abs(y1 - y0)
    );
    graphics.endFill();
  }

  computeArrows() {
    const { arrows, boxes } = steady;
    let sx: number,
      sy: number,
      cx: number,
      cy: number,
      ex: number,
      ey: number,
      ea: number;

    arrowCache.length = 0;

    for (let id in arrows) {
      const arrow = arrows[id];

      switch (arrow.type) {
        case IArrowType.BoxToBox: {
          const from = boxes[arrow.from];
          const to = boxes[arrow.to];
          if (from.id === to.id) {
          }
          // Box to Box Arrow
          [sx, sy, cx, cy, ex, ey, ea] = getBoxToBoxArrow(
            from.x,
            from.y,
            from.width,
            from.height,
            to.x,
            to.y,
            to.width,
            to.height
          );

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

      arrowCache.push([sx, sy, cx, cy, ex, ey, ea]);
    }
  }

  drawArrows() {
    const { zoom } = this.state.data.camera;
    this.graphics.lineStyle(3 / zoom, 0x00000);
    console.log(zoom);
    for (let [sx, sy, cx, cy, ex, ey, ea] of arrowCache) {
      this.graphics.moveTo(sx, sy);
      this.graphics.quadraticCurveTo(cx, cy, ex, ey);
      this.drawDot(sx, sy);
      this.drawArrowhead(ex, ey, ea);
    }
  }

  drawArrowhead(x: number, y: number, angle: number) {
    const r = 5 / this.state.data.camera.zoom;
    this.graphics.beginFill(0x000, 1);
    const transform = (px, py): [number, number] => {
      const point = new DOMPoint(px, py).matrixTransform(
        new DOMMatrix().translate(x, y).rotate(angle * (180 / Math.PI))
      );
      return [point.x, point.y];
    };
    this.graphics.moveTo(...transform(0, -r));
    this.graphics.lineTo(...transform(r * 2, 0));
    this.graphics.lineTo(...transform(0, r));
    this.graphics.endFill();
  }

  getCursor(hit: Hit) {
    const { isIn } = this.state;

    if (isIn("textTool")) return "text";
    if (isIn("dragging")) return "none";

    switch (hit.type) {
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
  }

  resize() {
    this.app.resize();
  }
}

export default Surface;
