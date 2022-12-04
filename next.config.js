const PalettePlugin = require("@palette.dev/webpack-plugin");

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

    config.plugins.push(
      new PalettePlugin({
        key: process.env.PALETTE_ASSET_KEY,
        include: [".next/static"],
        version: process.env.VERCEL_GIT_COMMIT_SHA,
      })
    );

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
