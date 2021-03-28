module.exports = {
  productionBrowserSourceMaps: true,
  typescript: {
    ignoreBuildErrors: true
  },
  webpack(config, options) {
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
};
