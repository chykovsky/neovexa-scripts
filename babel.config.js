const { alias, extensions } = require('./scripts/common');

const isTest = process.env.BABEL_ENV === 'test';

module.exports = {
  presets: [
    ['@babel/preset-env', {
      ...!isTest && {
        modules: false,
      },
      useBuiltIns: false,
      bugfixes: true,
      // debug: true,
      loose: true,
      targets: {
      node: 'current',
      browsers: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Edge versions'],
      // or use targets: "> 0.25%, not dead"
    },
    }],
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', {
      useESModules: !isTest,
      version: '^7.5.0',
    }],
    ['babel-plugin-module-resolver', {
      alias,
      extensions,
    }],
    './scripts/babel-plugin-safe-bind.js',
    ['@babel/plugin-transform-for-of', { assumeArray: true }],
    ['transform-modern-regexp', { useRe: true }],
  ],
};
