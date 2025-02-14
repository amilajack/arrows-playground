import { createState } from "@state-designer/react";
import {
  IArrowType,
  IPoint,
  IBounds,
  IBrush,
  IBox,
  IFrame,
  IArrow,
  IBoxSnapshot,
} from "../../types";
import { pressedKeys, viewBoxToCamera, getBoundingBox } from "../utils";
import { seedInitialData, saveToDatabase } from "./database";
import { BoxSelecter, getBoxSelecter } from "./box-selecter";
import * as BoxTransforms from "./box-transforms";
import uniqueId from "lodash/uniqueId";
import { v4 as uuid } from "uuid";
import mitt from "mitt";

import * as Comlink from "comlink";
import { Hit } from "../canvas/surface";
import { computeArrow } from "./arrow";

type GetFromWorker = (type: string, payload: any) => Promise<any>;

const getFromWorker = Comlink.wrap<GetFromWorker>(new Worker("worker.js"));

const id = uuid();

function getBoxId() {
  return `b_${Object.keys(steady.boxes).length}_${uniqueId().slice(0, 5)}`;
}

function getArrowId() {
  return `a_${Object.keys(steady.arrows).length}_${uniqueId().slice(0, 5)}`;
}

/**
 * @HACK state-designer doesn't have a way of subscribing to events from outside
 *       the state design object (ex. with `on`). To workaround this we emit an event
 *       from the action in the state designer and subscribe to it from outside the design.
 */
export const sceneEvents = mitt();

let selecter: BoxSelecter | undefined;
let resizer:
  | BoxTransforms.EdgeResizer
  | BoxTransforms.CornerResizer
  | undefined;
const undos: string[] = [];
const redos: string[] = [];

export const pointerState = createState({
  data: { screen: { x: 0, y: 0 }, document: { x: 0, y: 0 } },
  on: { MOVED_POINTER: (d, p) => Object.assign(d, p) },
});

export const steady = {
  ...seedInitialData(),
  hit: { type: "canvas" } as Hit,
  spawning: {
    boxes: {} as Record<string, IBox>,
    arrows: {} as Record<string, IArrow>,
    clones: {} as Record<string, IBox>,
  },
  brush: undefined as IBrush | undefined,
  bounds: undefined as IBounds | undefined,
  initial: {
    pointer: { x: 0, y: 0 },
    selected: {
      boxIds: [] as string[],
      arrowIds: [] as string[],
    },
    boxes: {} as Record<string, IBoxSnapshot>,
  },
};

export type ArrowCache = [
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

function updateSelectedArrowCache(data: typeof state.data) {
  data.selectedBoxIds.forEach((boxId) => {
    steady.boxes[boxId].arrows.forEach((arrowId) => {
      const arrow = steady.arrows[arrowId];
      steady.arrowCache[arrowId] = computeArrow(arrow, steady.boxes);
    });
  });
}

const state = createState({
  data: {
    text: null,
    selectedArrowIds: [] as string[],
    selectedBoxIds: [] as string[],
    pointer: {
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
    },
    camera: {
      x: 0,
      y: 0,
      zoom: 1 / devicePixelRatio,
    },
    viewBox: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scrollX: 0,
      scrollY: 0,
      document: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
    },
  },
  onEnter: ["saveUndoState", "updateBounds"],
  on: {
    FORCED_IDS: (d, p) => (d.selectedBoxIds = p),
    RESET_BOXES: "resetBoxes",
    // UPDATED_SURFACE: (d, p) => (surface = p),
    UNDO: ["loadUndoState", "updateBounds"],
    REDO: ["loadRedoState", "updateBounds"],
    STARTED_POINTING: { secretlyDo: "setInitialPointer" },
    MOVED_POINTER: { do: "updatePointerOnPointerMove" },
    ZOOMED: "updateCameraZoom",
    PANNED: ["updateCameraPoint", "updatePointerOnPan"],
    SCROLLED_VIEWPORT: "updateViewBoxOnScroll",
    UPDATED_VIEWBOX: ["updateCameraOnViewBoxChange", "updateViewBox"],
  },
  initial: "selectTool",
  states: {
    selectTool: {
      initial: "selectingIdle",
      states: {
        selectingIdle: {
          on: {
            CANCELLED: "clearSelection",
            SELECTED_BOX_TOOL: { to: "boxTool" },
            STARTED_PICKING_ARROW: { to: "arrowTool" },
            SELECTED_TEXT: { to: "textTool" },
            DELETED_SELECTED: {
              if: "hasSelected",
              do: [
                "saveUndoState",
                "deleteSelected",
                "updateBounds",
                "saveUndoState",
              ],
            },
            ALIGNED_LEFT: [
              "alignSelectedBoxesLeft",
              "updateBounds",
              "saveUndoState",
            ],
            ALIGNED_RIGHT: [
              "alignSelectedBoxesRight",
              "updateBounds",
              "saveUndoState",
            ],
            ALIGNED_CENTER_X: [
              "alignSelectedBoxesCenterX",
              "updateBounds",
              "saveUndoState",
            ],
            ALIGNED_TOP: [
              "alignSelectedBoxesTop",
              "updateBounds",
              "saveUndoState",
            ],
            ALIGNED_BOTTOM: [
              "alignSelectedBoxesBottom",
              "updateBounds",
              "saveUndoState",
            ],
            ALIGNED_CENTER_Y: [
              "alignSelectedBoxesCenterY",
              "updateBounds",
              "saveUndoState",
            ],
            DISTRIBUTED_X: [
              "distributeSelectedBoxesX",
              "updateBounds",
              "saveUndoState",
            ],
            DISTRIBUTED_Y: [
              "distributeSelectedBoxesY",
              "updateBounds",
              "saveUndoState",
            ],
            STRETCHED_X: [
              "stretchSelectedBoxesX",
              "updateBounds",
              "saveUndoState",
            ],
            STRETCHED_Y: [
              "stretchSelectedBoxesY",
              "updateBounds",
              "saveUndoState",
            ],
            STARTED_POINTING_BOUNDS_EDGE: { to: "edgeResizing" },
            STARTED_POINTING_BOUNDS_CORNER: { to: "cornerResizing" },
            STARTED_POINTING_CANVAS: { to: "pointingCanvas" },
            STARTED_POINTING_ARROW: [
              {
                unless: "arrowIsSelected",
                do: ["clearSelection", "selectArrow"],
              },
            ],
            STARTED_POINTING_BOX: [
              {
                unless: "boxIsSelected",
                do: ["clearSelection", "selectBox", "updateBounds"],
              },
              { to: "dragging" },
            ],
            STARTED_POINTING_BOUNDS: { to: "dragging" },
          },
        },
        pointingCanvas: {
          on: {
            MOVED_POINTER: { if: "distanceIsFarEnough", to: "brushSelecting" },
            STOPPED_POINTING: {
              do: ["clearSelection", "updateBounds"],
              to: "selectingIdle",
            },
          },
        },
        brushSelecting: {
          onEnter: [
            "clearSelection",
            "startBrushWithWorker",
            // "startBrush",
            "setInitialSelectedIds",
          ],
          on: {
            MOVED_POINTER: [
              "moveBrush",
              "setSelectedIdsFromWorker",
              // {
              // 	get: "brushSelectingBoxes",
              // 	if: "selectionHasChanged",
              // 	do: ["setSelectedIds"],
              // },
            ],
            STOPPED_POINTING: {
              do: ["completeBrush", "updateBounds"],
              to: "selectingIdle",
            },
          },
        },
        dragging: {
          states: {
            dragIdle: {
              onEnter: ["setInitialPointer", "setInitialSnapshot"],
              on: {
                MOVED_POINTER: {
                  do: ["moveDraggingBoxes", "moveBounds"],
                  to: "dragActive",
                },
                STOPPED_POINTING: { to: "selectingIdle" },
              },
            },
            dragActive: {
              onExit: "saveUndoState",
              on: {
                MOVED_POINTER: ["moveDraggingBoxes", "moveBounds"],
                STOPPED_POINTING: {
                  do: ["updateBounds"],
                  to: "selectingIdle",
                },
              },
            },
          },
        },
        edgeResizing: {
          initial: "edgeResizeIdle",
          states: {
            edgeResizeIdle: {
              onEnter: "setEdgeResizer",
              on: {
                MOVED_POINTER: { do: "resizeBounds", to: "edgeResizeActive" },
                STOPPED_POINTING: { to: "selectingIdle" },
              },
            },
            edgeResizeActive: {
              onExit: "saveUndoState",
              on: {
                MOVED_POINTER: { do: "resizeBounds" },
                STOPPED_POINTING: { to: "selectingIdle" },
              },
            },
          },
        },
        cornerResizing: {
          initial: "cornerResizeIdle",
          states: {
            cornerResizeIdle: {
              onEnter: "setCornerResizer",
              on: {
                MOVED_POINTER: {
                  do: "resizeBounds",
                  to: "cornerResizeActive",
                },
                STOPPED_POINTING: { to: "selectingIdle" },
              },
            },
            cornerResizeActive: {
              onExit: "saveUndoState",
              on: {
                MOVED_POINTER: { do: "resizeBounds" },
                STOPPED_POINTING: { to: "selectingIdle" },
              },
            },
          },
        },
      },
    },
    boxTool: {
      initial: "boxIdle",
      states: {
        boxIdle: {
          on: {
            SELECTED_SELECT_TOOL: { to: "selectTool" },
            STARTED_POINTING: { to: "drawingBox" },
            STARTED_PICKING_ARROW: { to: "arrowTool" },
            SELECTED_TEXT: { to: "textTool" },
          },
        },
        drawingBox: {
          initial: "drawingBoxIdle",
          onEnter: "setBoxOrigin",
          states: {
            drawingBoxIdle: {
              on: {
                MOVED_POINTER: { to: "drawingBoxActive" },
              },
            },
            drawingBoxActive: {
              onEnter: ["saveUndoState", "clearSelection", "createDrawingBox"],
              onExit: ["completeDrawingBox", "saveUndoState"],
              on: {
                MOVED_POINTER: { do: "updateDrawingBox" },
                STOPPED_POINTING: { to: "selectingIdle" },
              },
            },
          },
        },
      },
    },
    arrowTool: {
      initial: "creatingArrow",
      on: {
        SELECTED_SELECT_TOOL: { to: "selectTool" },
        SELECTED_TEXT: { to: "textTool" },
      },
      states: {
        creatingArrow: {
          onEnter: "setArrowFrom",
          on: {
            STARTED_POINTING_BOX: [
              {
                do: [
                  "setArrowTo",
                  "completeDrawingArrow",
                  "updateBounds",
                  "saveUndoState",
                ],
                to: "selectTool",
              },
            ],
            CANCELLED: { to: "selectTool" },
          },
        },
      },
    },
    textTool: {
      initial: "textIdle",
      states: {
        textIdle: {
          on: {
            SELECTED_SELECT_TOOL: { to: "selectTool" },
            STARTED_PICKING_ARROW: { to: "arrowTool" },
            SELECTED_BOX_TOOL: { to: "boxTool" },
            STARTED_POINTING: { to: "drawingText" },
          },
        },
        drawingText: {
          on: {
            STARTED_POINTING: { do: "createDrawingText" },
            STOPPED_POINTING: { to: "selectingIdle" },
          },
        },
      },
    },
  },
  results: {
    brushSelectingBoxes(data) {
      const { camera, pointer, viewBox } = data;

      const results = selecter
        ? selecter(viewBoxToCamera(pointer, viewBox, camera))
        : [];

      return results;
    },
  },
  conditions: {
    distanceIsFarEnough(data) {
      const { initial } = steady;
      const { pointer } = data;
      const dist = Math.hypot(
        pointer.x - initial.pointer.x,
        pointer.y - initial.pointer.y
      );
      return dist > 4;
    },
    boxIsSelected(data, id: string) {
      return data.selectedBoxIds.includes(id);
    },
    selectionHasChanged(data, _, ids: string[]) {
      return ids.length !== data.selectedBoxIds.length;
    },
    isInShiftMode() {
      return pressedKeys.Shift;
    },
    hasSelected(data) {
      return data.selectedBoxIds.length > 0 || data.selectedArrowIds.length > 0;
    },
    arrowTargetIsValid(data) {
      const { to } = steady.spawning.arrows.spawningArrow;
      return !!to && !data.selectedBoxIds.includes(to as string);
    },
    arrowSelected(data) {
      return data.selectedArrowIds.includes(id);
    },
    arrowIsSelected(data, payload = {}) {
      const { id } = payload;
      return data.selectedArrowIds.includes(id);
    },
  },
  actions: {
    // Pointer ------------------------
    updatePointerOnPan(data, delta: IPoint) {
      const { pointer, viewBox, camera } = data;
      pointer.dx = delta.x / camera.zoom;
      pointer.dy = delta.y / camera.zoom;
      pointerState.send("MOVED_POINTER", {
        screen: { ...pointer },
        document: viewBoxToCamera(pointer, viewBox, camera),
      });
    },
    updatePointerOnPointerMove(data, point: IPoint) {
      if (!point) return; // Probably triggered by a zoom / scroll
      const { camera, viewBox, pointer } = data;
      pointer.dx = (point.x - pointer.x) / camera.zoom;
      pointer.dy = (point.y - pointer.y) / camera.zoom;
      pointer.x = point.x;
      pointer.y = point.y;
      pointerState.send("MOVED_POINTER", {
        screen: { ...pointer },
        document: viewBoxToCamera(pointer, viewBox, camera),
      });
    },
    setInitialPointer(data) {
      const { initial } = steady;
      const { pointer, viewBox, camera } = data;
      initial.pointer = viewBoxToCamera(pointer, viewBox, camera);
    },

    // Camera -------------------------
    updateCameraZoom(
      data,
      { pageX, pageY, deltaY }: { pageX: number; pageY: number; deltaY: number }
    ) {
      const { camera, viewBox } = data;

      function handlePinch(x: number, y: number, delta: number) {
        adjustScaleWithPin(x, y, Math.pow(0.98, delta));
      }

      function adjustScaleWithPin(x: number, y: number, ratio: number) {
        camera.x += (x - camera.x) * (1 - ratio);
        camera.y += (y - camera.y) * (1 - ratio);
        camera.zoom *= ratio;
      }

      handlePinch(pageX, pageY, deltaY);

      viewBox.document.x = camera.x / camera.zoom;
      viewBox.document.y = camera.y / camera.zoom;
      viewBox.document.width = viewBox.width / camera.zoom;
      viewBox.document.height = viewBox.height / camera.zoom;
    },
    updateCameraPoint(data, delta: IPoint) {
      const { camera, viewBox } = data;
      camera.x += delta.x;
      camera.y += delta.y;
      viewBox.document.x += delta.x / camera.zoom;
      viewBox.document.y += delta.y / camera.zoom;
    },
    updateCameraOnViewBoxChange(data, frame: IFrame) {
      const { viewBox, camera } = data;
      if (viewBox.width > 0) {
        camera.x += (viewBox.width - frame.width) / 2;
        camera.y += (viewBox.height - frame.height) / 2;
        viewBox.document.x = camera.x;
        viewBox.document.y = camera.y;
        viewBox.document.width = viewBox.width / camera.zoom;
        viewBox.document.height = viewBox.height / camera.zoom;
      }
    },

    // Viewbox ------------------------
    updateViewBox(data, frame: IFrame) {
      const { viewBox, camera } = data;
      viewBox.x = frame.x;
      viewBox.y = frame.y;
      viewBox.width = frame.width;
      viewBox.height = frame.height;
      viewBox.document.x = camera.x;
      viewBox.document.y = camera.y;
      viewBox.document.width = viewBox.width / camera.zoom;
      viewBox.document.height = viewBox.height / camera.zoom;
    },
    updateViewBoxOnScroll(data, point: IPoint) {
      const { viewBox } = data;
      viewBox.x += viewBox.scrollX - point.x;
      viewBox.y += viewBox.scrollY - point.y;
      viewBox.scrollX = point.x;
      viewBox.scrollY = point.y;
    },

    // Selection Brush ----------------
    startBrush(data) {
      const { boxes, initial } = steady;
      const { pointer, viewBox, camera } = data;
      const { x, y } = viewBoxToCamera(pointer, viewBox, camera);
      steady.brush = {
        x0: initial.pointer.x,
        y0: initial.pointer.y,
        x1: x,
        y1: y,
      };
      selecter = getBoxSelecter(Object.values(boxes), { x, y });
    },
    startBrushWithWorker(data) {
      const { boxes, initial } = steady;
      const { pointer, viewBox, camera } = data;
      const { x, y } = viewBoxToCamera(pointer, viewBox, camera);
      steady.brush = {
        x0: initial.pointer.x,
        y0: initial.pointer.y,
        x1: x,
        y1: y,
      };

      getFromWorker("selecter", {
        origin: { x, y },
      });
    },
    moveBrush(data) {
      const { brush } = steady;
      const { pointer, viewBox, camera } = data;
      if (!brush) return;
      const point = viewBoxToCamera(pointer, viewBox, camera);
      brush.x1 = point.x;
      brush.y1 = point.y;
    },
    completeBrush(data) {
      selecter = undefined;
      steady.brush = undefined;
    },

    // Selection ----------------------
    selectBox(data, payload = {}) {
      const { id } = payload;
      data.selectedBoxIds = [id];
    },
    selectArrow(data, payload = {}) {
      const { id } = payload;
      data.selectedArrowIds = [id];
    },
    setSelectedIdsFromWorker() {
      getFromWorker("selected", pointerState.data.document).then((r) => {
        if (r.length !== state.data.selectedBoxIds.length) {
          state.send("FORCED_IDS", r);
        }
      });
    },
    setSelectedIds(data, _, selectedBoxIds: string[]) {
      data.selectedBoxIds = selectedBoxIds;
    },
    clearSelection(data) {
      const prevBoxIds = [...data.selectedBoxIds];
      data.selectedBoxIds = [];
      data.selectedArrowIds = [];
      steady.bounds = undefined;
    },
    setInitialSelectedIds(data) {
      steady.initial.selected.boxIds = [...data.selectedBoxIds];
    },

    // Boxes --------------------------
    moveDraggingBoxes(data) {
      const { pointer } = data;

      for (let id of data.selectedBoxIds) {
        const box = steady.boxes[id];
        box.x += pointer.dx;
        box.y += pointer.dy;
      }
      updateSelectedArrowCache(data);
    },

    // Bounds -------------------------
    moveBounds(data) {
      const { bounds } = steady;
      const { pointer } = data;
      if (!bounds) return;
      bounds.x += pointer.dx;
      bounds.y += pointer.dy;
      bounds.maxX = bounds.x + bounds.width;
      bounds.maxY = bounds.y + bounds.height;
      updateSelectedArrowCache(data);
    },
    updateBounds(data) {
      const { selectedBoxIds } = data;
      if (selectedBoxIds.length === 0) {
        steady.bounds = undefined;
      }
      steady.bounds = getBoundingBox(
        data.selectedBoxIds.map((id) => steady.boxes[id])
      );
      updateSelectedArrowCache(data);
    },
    setEdgeResizer(data, edge: number) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      steady.bounds = getBoundingBox(selectedBoxes);
      updateSelectedArrowCache(data);
      resizer = BoxTransforms.getEdgeResizer(
        selectedBoxes,
        steady.bounds,
        edge
      );
    },
    setCornerResizer(data, corner: number) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      steady.bounds = getBoundingBox(selectedBoxes);
      updateSelectedArrowCache(data);
      resizer = BoxTransforms.getCornerResizer(
        selectedBoxes,
        steady.bounds,
        corner
      );
    },
    resizeBounds(data) {
      const { bounds, boxes } = steady;
      const { pointer, viewBox, camera, selectedBoxIds } = data;
      const selectedBoxes = selectedBoxIds.map((id) => boxes[id]);
      if (!bounds) return;
      const point = viewBoxToCamera(pointer, viewBox, camera);
      resizer?.(point, selectedBoxes, bounds);
      updateSelectedArrowCache(data);
    },

    // Undo / Redo --------------------
    saveUndoState(data) {
      const { boxes, arrows } = steady;
      const { selectedBoxIds, selectedArrowIds } = data;

      getFromWorker("updateTree", {
        boxes: Object.values(boxes),
      });

      const current = JSON.stringify({
        boxes,
        arrows,
        selectedBoxIds,
        selectedArrowIds,
      });
      redos.length = 0;
      undos.push(current);
      saveToDatabase(current);
    },
    loadUndoState(data) {
      const { boxes, arrows } = steady;
      const { selectedBoxIds, selectedArrowIds } = data;
      const current = JSON.stringify({
        boxes,
        arrows,
        selectedBoxIds,
        selectedArrowIds,
      });
      redos.push(JSON.stringify(current));
      const undo = undos.pop();
      if (!undo) return;

      const json = JSON.parse(undo);
      Object.assign(data, json);
      saveToDatabase(JSON.stringify(undo));
    },
    loadRedoState(data) {
      const redo = undos.pop();
      if (!redo) return;

      const json = JSON.parse(redo);
      Object.assign(data, json);
      saveToDatabase(JSON.stringify(redo));
    },
    saveToDatabase(data) {
      const { boxes, arrows } = steady;
      const { selectedBoxIds, selectedArrowIds } = data;
      const current = {
        boxes,
        arrows,
        selectedBoxIds,
        selectedArrowIds,
      };
      saveToDatabase(JSON.stringify(current));
    },
    // Boxes --------------------------
    setInitialSnapshot(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);

      if (selectedBoxes.length === 0) {
        steady.initial.boxes = {};
        steady.bounds = undefined;
      }

      const bounds = getBoundingBox(selectedBoxes);

      let initialBoxes: Record<string, IBox> = {};

      for (let box of selectedBoxes) {
        initialBoxes[box.id] = {
          id: box.id,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          nx: (box.x - bounds.x) / bounds.width,
          ny: (box.y - bounds.y) / bounds.height,
          nmx: (box.x + box.width - bounds.x) / bounds.width,
          nmy: (box.y + box.height - bounds.y) / bounds.height,
          nw: box.width / bounds.width,
          nh: box.height / bounds.height,
          arrows: [],
        } as const;
      }

      steady.initial.boxes = initialBoxes;
      steady.bounds = bounds;
      updateSelectedArrowCache(data);
    },
    alignSelectedBoxesLeft(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.alignBoxesLeft(selectedBoxes);
    },
    alignSelectedBoxesRight(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.alignBoxesRight(selectedBoxes);
    },
    alignSelectedBoxesTop(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.alignBoxesTop(selectedBoxes);
    },
    alignSelectedBoxesBottom(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.alignBoxesBottom(selectedBoxes);
    },
    alignSelectedBoxesCenterX(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.alignBoxesCenterX(selectedBoxes);
    },
    alignSelectedBoxesCenterY(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.alignBoxesCenterY(selectedBoxes);
    },
    distributeSelectedBoxesX(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.distributeBoxesX(selectedBoxes);
    },
    distributeSelectedBoxesY(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.distributeBoxesY(selectedBoxes);
    },
    stretchSelectedBoxesX(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.stretchBoxesX(selectedBoxes);
    },
    stretchSelectedBoxesY(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      BoxTransforms.stretchBoxesY(selectedBoxes);
    },
    deleteSelected(data) {
      const { arrows, boxes } = steady;
      for (let boxId of data.selectedBoxIds) {
        for (let arrow of Object.values(arrows)) {
          if (arrow.to === boxId || arrow.from === boxId) {
            if (
              typeof arrow.to === "string" &&
              typeof arrow.from === "string"
            ) {
              boxes[arrow.to].arrows = boxes[arrow.to].arrows.filter(
                (arrowId) => arrowId !== arrow.id
              );
              boxes[arrow.from].arrows = boxes[arrow.from].arrows.filter(
                (arrowId) => arrowId !== arrow.id
              );
            }
            delete arrows[arrow.id];
            delete steady.arrowCache[arrow.id];
          }
        }
        delete boxes[boxId];
      }
      for (let id of data.selectedArrowIds) {
        if (arrows[id]) {
          const arrow = arrows[id];
          if (typeof arrow.to === "string" && typeof arrow.from === "string") {
            boxes[arrow.to].arrows = boxes[arrow.to].arrows.filter(
              (arrowId) => arrowId !== arrow.id
            );
            boxes[arrow.from].arrows = boxes[arrow.from].arrows.filter(
              (arrowId) => arrowId !== arrow.id
            );
          }
          delete arrows[id];
          delete steady.arrowCache[id];
        }
        for (let box of Object.values(boxes)) {
          if (box.arrows.includes(id)) {
            box.arrows.filter((arrowId) => arrowId !== id);
          }
        }
      }
      data.selectedBoxIds.length = 0;
      data.selectedArrowIds.length = 0;
      sceneEvents.emit("invalidate");
    },
    updateResizingBoxesToFreeRatio() {},
    updateResizingBoxesToLockedRatio() {},
    updateDraggingBoxesToFreeAxes() {},
    updateDraggingBoxesToLockedAxes() {},
    restoreInitialBoxes() {},
    completeSelectedBoxes() {},
    // Drawing Arrow
    completeDrawingArrow(data) {
      const { boxes, arrows, spawning, arrowCache } = steady;
      const { to, from } = spawning.arrows.drawingArrow as {
        to: string;
        from: string;
      };
      if (!(to && from)) return;

      const boxA = boxes[from];
      const boxB = boxes[to];
      if (!(boxA && boxB)) return;

      const arrowId = getArrowId();
      const arrow = {
        id: arrowId,
        type: IArrowType.BoxToBox,
        from,
        to,
        flip: false,
        label: "",
      } as const;
      arrows[arrowId] = arrow;
      arrowCache[arrowId] = computeArrow(arrow, boxes);

      boxA.arrows.push(arrowId);
      boxB.arrows.push(arrowId);

      data.selectedBoxIds = [to];
      delete spawning.arrows.spawningArrow;
      sceneEvents.emit("invalidate");
    },
    // Drawing Box
    setBoxOrigin(data) {
      const { pointer, viewBox, camera } = data;
      steady.initial.pointer = viewBoxToCamera(pointer, viewBox, camera);
    },
    createDrawingBox(data) {
      const { boxes, spawning, initial } = steady;
      const { pointer } = data;
      spawning.boxes = {
        drawingBox: {
          id: getBoxId(),
          x: Math.min(pointer.x, initial.pointer.x),
          y: Math.min(pointer.y, initial.pointer.y),
          width: Math.abs(pointer.x - initial.pointer.x),
          height: Math.abs(pointer.y - initial.pointer.y),
          label: "",
          color: "#FFF",
          z: Object.keys(boxes).length + 1,
          arrows: [],
        },
      };
      sceneEvents.emit("invalidate");
    },
    updateDrawingBox(data) {
      const { spawning, initial } = steady;
      const { pointer, viewBox, camera } = data;
      const box = spawning.boxes.drawingBox;
      if (!box) return;
      const { x, y } = viewBoxToCamera(pointer, viewBox, camera);
      box.x = Math.min(x, initial.pointer.x);
      box.y = Math.min(y, initial.pointer.y);
      box.width = Math.abs(x - initial.pointer.x);
      box.height = Math.abs(y - initial.pointer.y);
    },
    completeDrawingBox(data) {
      const { boxes, spawning } = steady;
      const box = spawning.boxes.drawingBox;
      if (!box) return;
      boxes[box.id] = box;
      spawning.boxes = {};
      data.selectedBoxIds = [box.id];
      sceneEvents.emit("invalidate");
    },
    clearDrawingBox() {},
    // Boxes

    // Clones
    clearDraggingBoxesClones() {},
    createDraggingBoxesClones() {},
    completeBoxesFromClones() {},

    // Text
    createDrawingText(data) {
      const { boxes, initial } = steady;
      const { pointer, viewBox, camera } = data;
      const { x, y } = viewBoxToCamera(pointer, viewBox, camera);
      const box = {
        id: uuid(),
        x: Math.min(x, initial.pointer.x),
        y: Math.min(y, initial.pointer.y),
        width: 100,
        height: 100,
        label: "hello",
        color: "#FFF",
        type: "text",
        z: Object.keys(boxes).length + 1,
        arrows: [],
      };
      boxes[box.id] = box;
    },

    // Debugging
    resetBoxes(data, count) {
      const { boxes, arrows, arrowCache } = seedInitialData(parseInt(count));

      steady.boxes = boxes;
      steady.arrows = arrows;
      steady.arrowCache = arrowCache;

      data.selectedBoxIds = [];
      data.selectedArrowIds = [];

      sceneEvents.emit("demo.boxCountChanged");

      getFromWorker("updateTree", {
        boxes: Object.values(steady.boxes),
      });
    },

    // Arrows
    setArrowFrom(data) {
      if (!steady.spawning.arrows.drawingArrow)
        steady.spawning.arrows.drawingArrow = {};
      steady.spawning.arrows.drawingArrow.from = data.selectedBoxIds[0];
      sceneEvents.emit("invalidate");
    },
    setArrowTo(_data, payload = {}) {
      const { id = "-1" } = payload;
      if (
        !steady.spawning.arrows.drawingArrow ||
        id === steady.spawning.arrows.drawingArrow?.from
      )
        return;
      steady.spawning.arrows.drawingArrow.to = id;
      sceneEvents.emit("invalidate");
    },
  },
  asyncs: {
    async stretchSelectedBoxesX(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      const next = await getFromWorker("stretchBoxesX", selectedBoxes);

      for (let box of next) {
        steady.boxes[box.id] = box;
      }
    },
    async stretchSelectedBoxesY(data) {
      const { boxes } = steady;
      const selectedBoxes = data.selectedBoxIds.map((id) => boxes[id]);
      const next = await getFromWorker("stretchBoxesY", selectedBoxes);

      for (let box of next) {
        steady.boxes[box.id] = box;
      }
    },
  },
  values: {
    undosLength() {
      return undos.length;
    },
    redosLength() {
      return redos.length;
    },
    boundingBox(data) {},
  },
});

export default state;
