import { memo, useRef, useEffect, HTMLProps } from "react";
import { init, render } from "react-skia-fiber";
import { Surface } from "./surface";
import state, { steady } from "../state";
import { styled } from "../theme";
import { RenderModes } from "react-skia-fiber/dist/commonjs/src/renderer";
import { CanvasKit } from "canvaskit-wasm";

const CanvasBackground = styled.div({
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
  bg: "$canvas",
});

type Props = HTMLProps<HTMLCanvasElement> & {
  width: number;
  height: number;
};

function Canvas({ width, height }: Props) {
  const rSurface = useRef<typeof Surface>();
  const rBackground = useRef<HTMLDivElement>(null);
  const rCanvas = useRef<HTMLCanvasElement>(null);
  let rStore = useRef<ReturnType<typeof render>>();
  let rCanvasKit = useRef<CanvasKit>();

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const { pageX, pageY, deltaX, deltaY } = e;

    if (e.ctrlKey || e.metaKey) {
      // Zooming
      state.send("ZOOMED", { pageX, pageY, deltaY });
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
    const canvas = rCanvas.current;
    const bg = rBackground.current;
    if (!(canvas && bg)) return;

    state.send("UPDATED_SURFACE", rSurface.current);

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;

    init().then((canvasKit) => {
      rStore.current = render(<Surface canvas={canvas} />, canvas, {
        canvasKit,
        renderMode: RenderModes.blocking,
        frameloop: "demand",
      });
      rCanvasKit.current = canvasKit;
    });

    rBackground.current?.addEventListener("wheel", handleWheel);
    return () => rBackground.current?.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const canvas = rCanvas.current;
    if (canvas) {
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
    }
    if (canvas && rStore.current && rCanvasKit.current) {
      const { surface } = rStore.current.getState();
      // @TODO @HACK Disposing the old surface seems to throw so we avoid
      //             it for now.
      surface.object = rCanvasKit.current.MakeCanvasSurface(canvas);
      surface.children.forEach((child) => {
        child.object?.delete();
        child.object = surface.object.getCanvas();
      });
    }
  }, [width, height]);

  return (
    <CanvasBackground
      ref={rBackground}
      onPointerDown={(e) => {
        const { hit } = steady;

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
