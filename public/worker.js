// @HACK: common.js hack to make bezier.js work
const exports = {}
importScripts(
  "https://unpkg.com/comlink/dist/umd/comlink.js",
  "https://unpkg.com/rbush@3.0.1/rbush.min.js",
  "https://unpkg.com/bezier-js@4.0.3/dist/bezier.common.js"
);

const tree = new RBush();
const hitTree = new RBush();

const curveCache = new Map();

const BBOX_PADDING = 15;

function updateTree({ boxes }) {
  tree.clear();

  tree.load(
    boxes.map((box) => ({
      id: box.id,
      minX: box.x,
      minY: box.y,
      maxX: box.x + box.width,
      maxY: box.y + box.height,
    }))
  );

  return tree;
}

const throttle = (fn, wait) => {
  let inThrottle, lastFn, lastTime;
  return function () {
    const context = this,
      args = arguments;
    if (!inThrottle) {
      fn.apply(context, args);
      lastTime = Date.now();
      inThrottle = true;
    } else {
      clearTimeout(lastFn);
      lastFn = setTimeout(function () {
        if (Date.now() - lastTime >= wait) {
          fn.apply(context, args);
          lastTime = Date.now();
        }
      }, Math.max(wait - (Date.now() - lastTime), 0));
    }
  };
};

function getBoundingBox(boxes) {
  if (boxes.length === 0) {
    return {
      x: 0,
      y: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  const first = boxes[0];

  let x = first.minX;
  let maxX = first.maxX;
  let y = first.minX;
  let maxY = first.maxY;

  for (let box of boxes) {
    x = Math.min(x, box.minX);
    maxX = Math.max(maxX, box.maxX);
    y = Math.min(y, box.minY);
    maxY = Math.max(maxY, box.maxY);
  }

  return {
    x,
    y,
    width: maxX - x,
    height: maxY - y,
    maxX,
    maxY,
  };
}

let selected = [];
let bounds = {};

function getBoxSelecter({ origin }) {
  let x0, y0, x1, y1, t;
  const { x: ox, y: oy } = origin;

  return function select(point) {
    x0 = ox;
    y0 = oy;
    x1 = point.x;
    y1 = point.y;

    if (x1 < x0) {
      t = x0;
      x0 = x1;
      x1 = t;
    }

    if (y1 < y0) {
      t = y0;
      y0 = y1;
      y1 = t;
    }

    const results = tree.search({ minX: x0, minY: y0, maxX: x1, maxY: y1 });

    selected = results.map((b) => b.id);
    bounds = getBoundingBox(results);
    return results;
  };
}

function pointInRectangle(a, b, padding = 0) {
  const r = padding / 2;
  return !(
    a.x > b.x + b.width + r ||
    a.y > b.y + b.height + r ||
    a.x < b.x - r ||
    a.y < b.y - r
  );
}

function getCorners(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function pointInCorner(a, b, padding = 4) {
  let cx, cy;
  const r = padding / 2;
  const corners = getCorners(b.x, b.y, b.width, b.height);

  for (let i = 0; i < corners.length; i++) {
    [cx, cy] = corners[i];
    if (
      pointInRectangle(
        a,
        {
          x: cx - 4,
          y: cy - 4,
          width: 8,
          height: 8,
        },
        0
      )
    )
      return i;
  }
}

function lineToRectangle(x0, y0, x1, y1, padding = 8) {
  const r = padding / 2;
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  return {
    x: x0 - r,
    y: y0 - r,
    width: x1 + r - (x0 - r),
    height: y1 + r - (y0 - r),
  };
}

function getEdges(x, y, w, h) {
  return [
    [
      [x, y],
      [x + w, y],
    ],
    [
      [x + w, y],
      [x + w, y + h],
    ],
    [
      [x + w, y + h],
      [x, y + h],
    ],
    [
      [x, y + h],
      [x, y],
    ],
  ];
}

function pointInEdge(a, b, padding = 4) {
  const edges = getEdges(b.x, b.y, b.width, b.height);

  for (let i = 0; i < edges.length; i++) {
    const [[x0, y0], [x1, y1]] = edges[i];
    if (pointInRectangle(a, lineToRectangle(x0, y0, x1, y1), padding)) return i;
  }
}

function doBoxesCollide(a, b) {
  return !(
    a.x > b.x + b.width ||
    a.y > b.y + b.height ||
    a.x + a.width < b.x ||
    a.y + a.height < b.y
  );
}

function stretchBoxesX(boxes) {
  const [first, ...rest] = boxes;
  let min = first.x;
  let max = first.x + first.width;
  for (let box of rest) {
    min = Math.min(min, box.x);
    max = Math.max(max, box.x + box.width);
  }
  for (let box of boxes) {
    box.x = min;
    box.width = max - min;
  }

  return boxes;
}

function stretchBoxesY(boxes) {
  const [first, ...rest] = boxes;
  let min = first.y;
  let max = first.y + first.height;
  for (let box of rest) {
    min = Math.min(min, box.y);
    max = Math.max(max, box.y + box.height);
  }
  for (let box of boxes) {
    box.y = min;
    box.height = max - min;
  }

  return boxes;
}

function distance2(p1, p2) {
  let dx = p1.x - p2.x,
      dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

function distanceToCurve(curve, point, steps = 50) {
  // Get a look up table for 10 equidistant points on the curve. Find the one
  // that minimizes the distance
  let dist = curve.getLUT(steps).reduce((p, c) => Math.min(p, distance2(c, point)), Infinity)
  return Math.sqrt(dist)
}

function updateHitTestTree({boxes = {}, arrows = {}, arrowCache = [], zoom = 1}) {
  hitTree.clear();
  curveCache.clear();

  // sort in descending order
  const allBoxes = Object.values(boxes).sort((a, b) => b.z - a.z);

  const arrowsWithCoords = arrowCache.map((_arrow) => {
    const [sx, sy, cx, cy, ex, ey, ea, id] = _arrow;
    const arrow = arrows[id];
    const curve = new Bezier(sx, sy, cx, cy, ex, ey);
    curveCache.set(id, curve);
    const { x, y } = curve.bbox();

    const p = BBOX_PADDING / zoom;
    const pp = p * 2;

    const boundingBox = {
      x: x.min - p,
      y: y.min - p,
      maxX: x.max + p,
      maxY: y.max + p,
      width: x.size + pp,
      height: y.size + pp,
    };

    return {
      ...arrow,
      ...boundingBox,
      type: 'arrow',
      z: allBoxes.length 
    }
  })
  
  hitTree.load(
    [...allBoxes, ...arrowsWithCoords].map((box) => ({
      id: box.id,
      minX: box.x,
      minY: box.y,
      maxX: box.x + box.width,
      maxY: box.y + box.height,
      z: box.z,
      type: box.type || 'box',
    }))
  );
}

function hitTest({ point, bounds, zoom }) {
  if (bounds) {
    // Test if point collides the (padded) bounds
    if (pointInRectangle(point, bounds, 16)) {
      const { x, y, width, height, maxX, maxY } = bounds;
      const p = BBOX_PADDING / zoom;
      const pp = p * 2;

      const cornerBoxes = [
        { x: x - p, y: y - p, width: pp, height: pp },
        { x: maxX - p, y: y - p, width: pp, height: pp },
        { x: maxX - p, y: maxY - p, width: pp, height: pp },
        { x: x - p, y: maxY - p, width: pp, height: pp },
      ];

      for (let i = 0; i < cornerBoxes.length; i++) {
        if (pointInRectangle(point, cornerBoxes[i])) {
          return { type: "bounds-corner", corner: i };
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
          return { type: "bounds-edge", edge: i };
        }
      }
      // Point is in the middle of the bounds
      return { type: "bounds" };
    }
  }

  if (!point) return;

  const hits = hitTree.search({
    minX: point.x,
    minY: point.y,
    maxX: point.x + 1,
    maxY: point.y + 1,
  });

  // Either we don't have bounds or we're out of bounds
  // for (let id in boxes) {
  // 	box = boxes[id]
  // 	// Test if point collides the (padded) box
  // 	if (pointInRectangle(point, box)) {
  // 		hits.push(box)
  // 	}
  // }

  if (hits.length > 0) {
    // z sort in descending order
    const _hits = Object.values(hits).sort((a, b) => b.z - a.z);
    let hit;

    // Boxes are simple.
    if (_hits[0].type === 'box') hit = _hits[0];
    // Curved arrows are less simple since we have a finer grained bezier curve test
    // If the shortest distance from the cursor to the curve is < delta, consider that curve
    // being hovered over
    if (_hits[0].type === 'arrow') {
      hit = _hits.find((_hit) => {
        // fine grained check
        if (_hit.type === 'arrow') {
          const curve = curveCache.get(_hit.id);
          if (!curve) return false
          return distanceToCurve(curve, { x: point.x, y: point.y }, Math.floor(50 * zoom)) < BBOX_PADDING / zoom;
        }
        // the hit is a box, we are done
        return true;
      })
    }

    if (hit) return { type: hit.type || "box", id: hit.id };
  }

  return { type: "canvas" };
}

let boxSelecter = undefined;

function getTransform(type, payload) {
  switch (type) {
    case "stretchBoxesX": {
      return stretchBoxesX(payload);
    }
    case "stretchBoxesY": {
      return stretchBoxesY(payload);
    }
    case "updateHitTree": {
      updateHitTestTree(payload);
    }
    case "hitTest": {
      return hitTest(payload);
    }
    case "updateTree": {
      return updateTree(payload);
    }
    case "selecter": {
      boxSelecter = getBoxSelecter(payload);
      const { minX, minY, maxX, maxY } = tree;
      return { minX, minY, maxX, maxY };
    }
    case "selectedBounds": {
      return bounds;
    }
    case "selected": {
      boxSelecter(payload);
      return selected;
    }
  }
}

Comlink.expose(getTransform);
