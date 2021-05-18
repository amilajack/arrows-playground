module.exports = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack(config, { isServer }) {
    if (!isServer) config.resolve.fallback.fs = false;

    config.module.rules.push({
      test: /\.worker\.js$/,
      loader: "worker-loader",
      // options: { inline: true }, // also works
      options: {
        name: "static/[hash].worker.js",
        publicPath: "/_next/",
      },
    });
    return config;
  },
  devIndicators: {
    autoPrerender: false,
  },
  // @TODO
  // experimental: {
  //   reactMode: 'concurrent'
  // },
  future: {
    webpack5: true,
  },
};
