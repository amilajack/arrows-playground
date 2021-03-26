import * as React from "react";
import { memo, useRef, useEffect } from "react";
import Surface from "./surface";
import state from "../state";
import { styled } from "../theme";
import * as PIXI from "pixi.js";

let app: PIXI.Application;

const CanvasBackground = styled.div({
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
  bg: "$canvas",
});

type Props = React.HTMLProps<HTMLCanvasElement> & {
  width: number;
  height: number;
};

function Canvas({ width, height }: Props) {
  const rSurface = useRef<Surface>();
  const rBackground = useRef<HTMLDivElement>(null);
  const rCanvas = useRef<HTMLCanvasElement>(null);

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const { pageX, pageY, deltaX, deltaY } = e;

    if (e.ctrlKey || e.metaKey) {
      // Zooming
      state.send("ZOOMED", {pageX, pageY, deltaY});
      state.send("MOVED_POINTER");
    } else {
      // Panning
      state.send("PANNED", {
        x: -deltaX,
        y: -deltaY,
      });
      state.send("MOVED_POINTER");
    }
  }

  useEffect(() => {
    if (rSurface.current) rSurface.current.destroy();
    const canvas = rCanvas.current;
    const bg = rBackground.current;
    if (!(canvas && bg)) return;

    app = new PIXI.Application({
      resizeTo: window,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      view: canvas,
      antialias: true,
    });

    app.resizeTo = bg;
    app.resize();

    rSurface.current = new Surface(canvas, app);
    state.send("UPDATED_SURFACE", rSurface.current);

    rBackground.current?.addEventListener('wheel', handleWheel)
    return () => rBackground.current?.removeEventListener('wheel', handleWheel)
  }, [rCanvas]);

  useEffect(() => {
    app.resize();
  }, [width, height]);

  return (
    <CanvasBackground
      ref={rBackground}
      onPointerDown={(e) => {
        const surface = rSurface.current;
        if (!surface) return;

        const { hit } = surface;

        switch (hit.type) {
          case "bounds": {
            state.send("STARTED_POINTING_BOUNDS");
            break;
          }
          case "box": {
            state.send("STARTED_POINTING_BOX", { id: hit.id });
            break;
          }
          case "arrow": {
            state.send("STARTED_POINTING_ARROW", { id: hit.id });
            break;
          }
          case "bounds-corner": {
            state.send("STARTED_POINTING_BOUNDS_CORNER", hit.corner);
            break;
          }
          case "bounds-edge": {
            state.send("STARTED_POINTING_BOUNDS_EDGE", hit.edge);
            break;
          }
          case "canvas": {
            state.send("STARTED_POINTING_CANVAS");
            break;
          }
        }
      }}
      onPointerMove={(e) =>
        state.send("MOVED_POINTER", { x: e.clientX, y: e.clientY })
      }
      onPointerUp={(e) =>
        state.send("STOPPED_POINTING", { x: e.clientX, y: e.clientY })
      }
    >
      <canvas ref={rCanvas} />
    </CanvasBackground>
  );
}

export default memo(Canvas);
