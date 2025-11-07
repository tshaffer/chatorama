/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ROOT = __dirname;
const BACKEND_PUBLIC = path.resolve(ROOT, '../backend/public');
const BUILD_DIR = path.join(BACKEND_PUBLIC, 'build');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: path.resolve(ROOT, 'src/index.tsx'),
  output: {
    path: BUILD_DIR,                               // JS → backend/public/build
    filename: isProd ? 'bundle.[contenthash].js' : 'bundle.js',
    publicPath: '/build/',                         // script src in index.html
    clean: true
  },
  target: 'web',
  devtool: isProd ? 'source-map' : 'eval-source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx'],
    alias: {
      '@shared': require('path').resolve(__dirname, '../shared/src'),
    },
  },
  module: {
    rules: [
      { test: /\.tsx?$/, use: [{ loader: 'ts-loader' }], exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: path.join(BACKEND_PUBLIC, 'index.html'),
      templateContent: ({ htmlWebpackPlugin }) => `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Chatalog</title>
          </head>
          <body>
            <div id="root"></div>
            ${htmlWebpackPlugin.tags.bodyTags}
          </body>
        </html>
      `,
      inject: 'body',
      scriptLoading: 'defer'
    })
  ]
};

