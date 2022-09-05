const PaletteWebpackPlugin = require("@palette.dev/webpack-plugin");

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

    if (config.mode === "production") {
      config.plugins.push(
        new PaletteWebpackPlugin({
          key: "cl7nwhwbv004509jt6tv53z3s",
          include: ["./.next/static/chunks"],
          dryRun: false,
        })
      );
    }

    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Document-Policy",
            value: "js-profiling",
          },
        ],
      },
    ];
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
