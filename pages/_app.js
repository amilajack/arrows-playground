import { useEffect } from "react";
import {
  init,
  events,
  vitals,
  measure,
  network,
  profiler,
} from "@palette.dev/browser";
import "../styles/globals.css";

init({
  key: "cl7nwhwbv004609jt5e7ybyk3",
  plugins: [events(), vitals(), network(), measure(), profiler()],
});

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    profiler.start({
      sampleInterval: 10,
      maxBufferSize: 10_000,
    });
    addEventListener("load", () => {
      profiler.stop();
    });
  }, []);
  return <Component {...pageProps} />;
}

export default MyApp;
