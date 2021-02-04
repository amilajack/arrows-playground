import * as React from "react";
import state from "../state";

export default function useWindowEvents() {
  React.useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      state.send("MOVED_POINTER", { x: e.clientX, y: e.clientY });
    }

    function handlePointerUp(e: PointerEvent) {
      state.send("STOPPED_POINTING", { x: e.clientX, y: e.clientY });
    }

    function handlePointerDown(e: PointerEvent) {
      state.send("STARTED_POINTING", { x: e.clientX, y: e.clientY });
    }

    function handleScroll() {
      state.send("SCROLLED_VIEWPORT", { x: window.scrollX, y: window.scrollY });
    }

    function handleGesture(e) {
      e.preventDefault();
      // @TODO
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll);
    document.addEventListener("gesturestart", handleGesture);
    document.addEventListener("gesturechange", handleGesture);
    document.addEventListener("gestureend", handleGesture);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("gesturestart", handleGesture);
      document.removeEventListener("gesturechange", handleGesture);
      document.removeEventListener("gestureend", handleGesture);
    };
  }, []);
}
