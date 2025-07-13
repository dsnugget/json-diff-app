const { override, addWebpackAlias, addWebpackModuleRule } = require('customize-cra');
const path = require('path');

module.exports = override(
  addWebpackAlias({
    'fs': false, // Explicitly set to false for Webpack 5
    'path': require.resolve('path-browserify'),
    'stream': require.resolve('stream-browserify'), // Add stream polyfill
  }),
  addWebpackModuleRule({
    test: /\.wasm$/,
    type: 'asset/resource',
  })
);