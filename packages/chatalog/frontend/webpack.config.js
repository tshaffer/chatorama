/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ROOT = __dirname;
const BACKEND_PUBLIC = path.resolve(ROOT, '../backend/public');
const BUILD_DIR = path.join(BACKEND_PUBLIC, 'build');

const isProd = process.env.NODE_ENV === 'production';

// --- Load CHATALOG_API_BASE from .env.local (simple parser) ---
const envPath = path.resolve(__dirname, '.env.local');
let CHATALOG_API_BASE = process.env.CHATALOG_API_BASE || '';
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k === 'CHATALOG_API_BASE' && !CHATALOG_API_BASE) CHATALOG_API_BASE = v;
  }
}

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
  stats: {
    builtAt: true,
  },
  devtool: isProd ? 'source-map' : 'eval-source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx'],
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
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
    }),

    // Make CHATALOG_API_BASE available in code as process.env.CHATALOG_API_BASE
    new webpack.DefinePlugin({
      'process.env.CHATALOG_API_BASE': JSON.stringify(process.env.CHATALOG_API_BASE || '/api/v1')
    }),
  ]
};
