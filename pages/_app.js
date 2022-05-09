import "../styles/globals.css";

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    init({
      key: "cl7nwhwbv004609jt5e7ybyk3",
      plugins: [events(), vitals(), network(), measure(), profiler()],
    });
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
