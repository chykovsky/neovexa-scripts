const webpack = require('webpack');
const WebExtensionManifestPlugin = require('webpack-extension-manifest-plugin');
const { ListBackgroundScriptsPlugin } = require('./manifest-helper');
const {
  addWrapperWithGlobals,
  getCodeMirrorThemes,
} = require('./webpack-util');
const ProtectWebpackBootstrapPlugin = require('./webpack-protect-bootstrap-plugin');
const { getVersion } = require('./version-helper');
const { configLoader } = require('./config-helper');
const { getBaseConfig, getPageConfig, isProd } = require('./webpack-base');

// Avoiding collisions with globals of a content-mode userscript
const INIT_FUNC_NAME = '**VMInitInjection**';
const VAULT_ID = 'VAULT_ID';
const PAGE_MODE_HANDSHAKE = 'PAGE_MODE_HANDSHAKE';
const VM_VER = getVersion();

configLoader
  // Default values
  .add({
    DEBUG: false,
  })
  // Load from `./.env`
  .envFile()
  // Load from `process.env`
  .env()
  // Override values
  .add({
    VM_VER,
  });

const pickEnvs = (items) => {
  return Object.assign(
    {},
    ...items.map((key) => ({
      [`process.env.${key}`]: JSON.stringify(configLoader.get(key)),
    })),
  );
};

const defsObj = {
  ...pickEnvs([
    'DEBUG',
    'VM_VER',
    'SYNC_GOOGLE_CLIENT_ID',
    'SYNC_GOOGLE_CLIENT_SECRET',
    'SYNC_GOOGLE_DESKTOP_ID',
    'SYNC_GOOGLE_DESKTOP_SECRET',
    'SYNC_ONEDRIVE_CLIENT_ID',
    'SYNC_ONEDRIVE_CLIENT_SECRET',
    'SYNC_DROPBOX_CLIENT_ID',
  ]),
  'process.env.INIT_FUNC_NAME': JSON.stringify(INIT_FUNC_NAME),
  'process.env.CODEMIRROR_THEMES': JSON.stringify(getCodeMirrorThemes()),
  'process.env.DEV': JSON.stringify(!isProd),
  'process.env.TEST': JSON.stringify(process.env.BABEL_ENV === 'test'),
};
// avoid running webpack bootstrap in a potentially hacked environment
// after documentElement was replaced which triggered reinjection of content scripts
const skipReinjectionHeader = `{
  const INIT_FUNC_NAME = '${INIT_FUNC_NAME}';
  if (window[INIT_FUNC_NAME] !== 1)`;

const buildConfig = (page, entry, init) => {
  const config = entry ? getBaseConfig() : getPageConfig();
  config.plugins.push(
    new webpack.DefinePlugin({
      ...defsObj,
      // Conditional compilation to remove unsafe and unused stuff from `injected`
      'process.env.IS_INJECTED': JSON.stringify(/injected/.test(page) && page),
    }),
  );
  if (typeof entry === 'string') {
    config.entry = { [page]: entry };
  }
  if (!entry) init = page;
  if (init) init(config);
  return config;
};

module.exports = [
  buildConfig((config) => {
    addWrapperWithGlobals('common', config, defsObj, (getGlobals) => ({
      header: () => `{ ${getGlobals()}`,
      footer: '}',
      test: /^(?!injected|public|background).*\.js$/,
    }));
    config.plugins.push(
      new ListBackgroundScriptsPlugin({
        minify: false, // keeping readable
      }),
    );
  }),

  buildConfig('injected', './src/injected', (config) => {
    config.plugins.push(new ProtectWebpackBootstrapPlugin());
    addWrapperWithGlobals(
      'injected/content',
      config,
      defsObj,
      (getGlobals) => ({
        header: () => `${skipReinjectionHeader} { ${getGlobals()}`,
        footer: '}}',
      }),
    );
  }),

  buildConfig('injected-web', './src/injected/web', (config) => {
    config.output.libraryTarget = 'commonjs2';
    config.plugins.push(new ProtectWebpackBootstrapPlugin());
    addWrapperWithGlobals('injected/web', config, defsObj, (getGlobals) => ({
      header: () => `${skipReinjectionHeader}
        window[INIT_FUNC_NAME] = function (IS_FIREFOX,${PAGE_MODE_HANDSHAKE},${VAULT_ID}) {
          const module = { __proto__: null };
          ${getGlobals()}`,
      footer: `
          const { exports } = module;
          return exports.__esModule ? exports.default : exports;
        }};0;`,
    }));
  }),

  // buildConfig('background', './src/background/background.js', (config) => {
  //   config.target = 'webworker'; // Crucial for service worker compatibility!
  //   // No need for addWrapperWithGlobals for background
  //   // config.output.filename = 'background.bundle.js';
  //   config.output.chunkFilename = '[name].bundle.js';
  //   // Optional: Remove or avoid adding plugins that are only for injected/common/page scripts
  // }),

  buildConfig('background', './src/background/background.js', (config) => {
    config.target = 'webworker';
    config.output.filename = 'background.js';
    // config.output.chunkFilename = '[name].bundle.js'; // fallback
    // config.optimization = config.optimization || {};
    config.optimization.splitChunks = false;
    config.optimization.runtimeChunk = false;
    // Remove any plugins that do code splitting/chunking here!

    // THIS IS THE FIX:
    config.plugins = config.plugins || [];
    // config.plugins.push(
    //   new webpack.DefinePlugin({
    //     global: 'self',
    //     IS_FIREFOX: JSON.stringify(false),
    //     // add other defines as needed
    //   }),
    // );

    // **replace** the old ListBackgroundScriptsPlugin:
    config.plugins = config.plugins.filter(
      (p) => p.constructor.name !== 'ListBackgroundScriptsPlugin',
    );

    // **add** the MV3 manifest plugin:
    config.plugins.push(
      new WebExtensionManifestPlugin({
        config: {
          // start from your source manifest (v2)
          base: require('../src/manifest.yml'),
          extend: {
            manifest_version: 3,
            background: { service_worker: 'background.js' },
            // if you need host_permissions or CSP tweaks:
            host_permissions: ['*://*/*'],
            content_security_policy: {
              extension_pages: "script-src 'self'; object-src 'self'",
            },
          },
        },
      }),
    );
  }),
];
