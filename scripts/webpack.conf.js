const webpack = require('webpack');
const path = require('path');
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

// Import the readManifest function from your manifest-helper.js
// const { readManifest } = require('./manifest-helper'); // Add this line

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

// **Crucial Change:** Load the manifest data synchronously here
// Webpack config needs to be synchronous, so we need to load the YAML file
// before module.exports is evaluated.
// Since `readManifest` from `manifest-helper.js` is async, we'll
// need to create a synchronous version or handle it differently for Webpack.
// For simplicity in the Webpack config, we'll read it directly here using `js-yaml` sync.

const fs = require('fs'); // Require fs here
const yaml = require('js-yaml'); // Require js-yaml here

let baseManifestData;
try {
  const manifestYmlContent = fs.readFileSync('./src/manifest.yml', 'utf8');
  baseManifestData = yaml.load(manifestYmlContent);
} catch (e) {
  console.error('Error loading manifest.yml:', e);
  process.exit(1); // Exit if manifest can't be loaded
}

module.exports = [
  buildConfig((config) => {
    addWrapperWithGlobals('common', config, defsObj, (getGlobals) => ({
      header: () => `{ ${getGlobals()}`,
      footer: '}',
      test: /^(?!injected|public|background).*\.js$/,
      // test: /^(?!injected|public).*\.js$/,
    }));
    config.plugins.push(
      new ListBackgroundScriptsPlugin({
        minify: false, // keeping readable
      }),
      new webpack.DefinePlugin({
        global: 'globalThis',
        // defineProperty: 'Object.defineProperty',
      }),
      new webpack.ProvidePlugin({
        browser: [
          path.resolve(__dirname, '../src/common/consts.js'),
          'browser',
        ],
      }),
    );
  }),

  buildConfig('injected', './src/injected', (config) => {
    config.plugins.push(
      new ProtectWebpackBootstrapPlugin(),
      new webpack.DefinePlugin({
        global: 'globalThis',
        // defineProperty: 'Object.defineProperty',
      }),
    );
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
    config.plugins.push(
      // new ProtectWebpackBootstrapPlugin(),
      new webpack.DefinePlugin({
        global: 'globalThis',
        // defineProperty: 'Object.defineProperty',
      }),
    );
    // 2) Prepend a real defineProperty alias *before* the webpack runtime
    config.plugins.push(
      new webpack.BannerPlugin({
        banner: [
          // define a module.exports target for webpack runtime
          'const module = { exports: {} };',
          // webpack bootstrap helpers
          'const defineProperty = Object.defineProperty;',
          'const toStringTagSym = typeof Symbol !== "undefined" && Symbol.toStringTag;',
          // basic JS primitives & fallbacks
          'const cloneInto             = obj => obj;',
          'const createNullObj = () => Object.create(null);',
          'const assign = Object.assign;',
          'const getPrototypeOf   = Object.getPrototypeOf;',
          'const jsonParse        = JSON.parse;',
          'const logging          = console;',
          // script-injection state
          'const PAGE_MODE_HANDSHAKE = false;',
          'const IS_FIREFOX            = false;',
          'let VAULT_ID;',
          // GM-API shime
          'let   callbackResult;               ',
          // "Safe" wrappers of globals
          'const SafeSymbol       = Symbol;',
          'const SafeCustomEvent       = CustomEvent;',
          'const SafeMouseEvent        = MouseEvent;',
          'const SafeError             = Error;',
          'const SafePromise           = Promise;',
          'const SafeDOMParser         = DOMParser;',
          'const SafeURL               = URL;',
          'const SafeKeyboardEvent     = KeyboardEvent;',
          'const SafeProxy             = Proxy;',
          'let builtinGlobals   = [Object.getOwnPropertyNames(globalThis), globalThis];',
          'const safeCall             = Function.prototype.call.bind(Function.prototype.call);',
          'const getWindowLength      = function() { return this.length; };',
          'const isString             = v => typeof v === "string";',
          'const describeProperty     = Object.getOwnPropertyDescriptor;',
          'const setPrototypeOf       = Object.setPrototypeOf;',
          'const isObject             = v => v != null && typeof v === "object";',
          'const nullObjFrom           = src => { const out = Object.create(null); for (const k in src) out[k] = src[k]; return out; };',
          'const isFunction           = v => typeof v === "function";',
          'const objectValues         = Object.values;',
          'const forEach              = Array.prototype.forEach;',
          'const objectKeys           = Object.keys;',
          'const safeApply            = Reflect.apply;',
          'const concat               = Array.prototype.concat;',
          'const setOwnProp           = (o, p, v) => defineProperty(o, p, { value: v, enumerable: true, writable: true, configurable: true });',
          'const SafeEventTarget      = EventTarget;',
          'const PROTO                = "__proto__";',
          'const reflectOwnKeys       = Reflect.ownKeys;',
        ].join('\n'),
        raw: true,
        entryOnly: false, // apply to all files in this build
      }),
    );
    // 3) I'm just moving ProtectWebpackBootstrapPlugin afterwards
    config.plugins.push(new ProtectWebpackBootstrapPlugin());

    // Auto‑inject all safe‑globals, including kResponseType
    config.plugins.push(
      new webpack.ProvidePlugin({
        // …other auto‑imports…,
        kResponseType: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kResponseType',
        ],
      }),
    );

    addWrapperWithGlobals('injected/web', config, defsObj, (getGlobals) => ({
      header: () => `${skipReinjectionHeader}
          window[INIT_FUNC_NAME] = function (IS_FIREFOX,${PAGE_MODE_HANDSHAKE},${VAULT_ID}) {
            const module = { __proto__: null };
            ${getGlobals()}`,
      footer: `
            const { exports } = module;
            return exports.__esModule ? exports.default : exports;
          }}};0;`,
      // ONLY wrap our entry script, not the runtime or chunks:
      test: /[\\/]src[\\/]injected[\\/]web[\\/]index\.js$/,
    }));
  }),

  buildConfig('background', './src/background/background.js', (config) => {
    config.target = 'webworker';
    config.output.filename = 'background.js';
    config.optimization.splitChunks = false;
    config.optimization.runtimeChunk = false;

    config.plugins = config.plugins || [];
    // Remove the old ListBackgroundScriptsPlugin if it's there
    config.plugins = config.plugins.filter(
      (p) => p.constructor.name !== 'ListBackgroundScriptsPlugin',
    );

    // **add** the MV3 manifest plugin with the pre-loaded YAML data:
    config.plugins.push(
      new webpack.DefinePlugin({
        global: 'self',
        // global: 'globalThis',
        window: 'self',
        // IS_FIREFOX: JSON.stringify(false),
        // SCRIPTS: JSON.stringify(`#scripts`),
        // ICON_PREFIX: JSON.stringify('scripts'),
        // add other defines as needed
      }),
      new WebExtensionManifestPlugin({
        config: {
          // Pass the parsed YAML object directly
          base: baseManifestData, // <--- CORRECTED LINE
          extend: {
            manifest_version: 3,
            background: { service_worker: 'background.js' },
            // If you need host_permissions or CSP tweaks that are not in your base manifest, add them here
            // host_permissions: ['*://*/*'],
            // content_security_policy: {
            //   extension_pages: "script-src 'self'; object-src 'self'",
            // },
          },
        },
      }),
      new webpack.ProvidePlugin({
        // from src/common/safe-globals.js
        SafePromise: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'SafePromise',
        ],
        SafeError: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'SafeError',
        ],
        safeApply: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'safeApply',
        ],
        hasOwnProperty: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'hasOwnProperty',
        ],
        safeCall: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'safeCall',
        ],
        IS_APPLIED: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'IS_APPLIED',
        ],
        IS_FIREFOX: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'IS_FIREFOX',
        ],
        ROUTE_SCRIPTS: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'ROUTE_SCRIPTS',
        ],
        extensionRoot: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'extensionRoot',
        ],
        extensionOrigin: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'extensionOrigin',
        ],
        extensionManifest: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'extensionManifest',
        ],
        extensionOptionsPage: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'extensionOptionsPage',
        ],
        ICON_PREFIX: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'ICON_PREFIX',
        ],
        TAB_SETTINGS: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'TAB_SETTINGS',
        ],
        TAB_ABOUT: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'TAB_ABOUT',
        ],
        TAB_RECYCLE: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'TAB_RECYCLE',
        ],
        BROWSER_ACTION: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'BROWSER_ACTION',
        ],
        kDocumentId: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'kDocumentId',
        ],
        kFrameId: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'kFrameId',
        ],
        INJECT: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'INJECT',
        ],
        MULTI: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'MULTI',
        ],
        kWindowId: [
          path.resolve(__dirname, '../src/common/safe-globals.js'),
          'kWindowId',
        ],

        // from src/common/safe-globals-shared.js
        VIOLENTMONKEY: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'VIOLENTMONKEY',
        ],
        AUTO: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'AUTO',
        ],
        CONTENT: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'CONTENT',
        ],
        EXPOSE: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'EXPOSE',
        ],
        FORCE_CONTENT: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'FORCE_CONTENT',
        ],
        IDS: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'IDS',
        ],
        ID_BAD_REALM: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'ID_BAD_REALM',
        ],
        ID_INJECTING: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'ID_INJECTING',
        ],
        INJECT_INTO: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'INJECT_INTO',
        ],
        MORE: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'MORE',
        ],
        PAGE: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'PAGE',
        ],
        RUN_AT: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'RUN_AT',
        ],
        SCRIPTS: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'SCRIPTS',
        ],
        VALUES: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'VALUES',
        ],
        kResponse: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kResponse',
        ],
        kResponseHeaders: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kResponseHeaders',
        ],
        kResponseText: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kResponseText',
        ],
        kResponseType: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kResponseType',
        ],
        kSessionId: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kSessionId',
        ],
        kTop: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kTop',
        ],
        kXhrType: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kXhrType',
        ],
        SKIP_SCRIPTS: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'SKIP_SCRIPTS',
        ],
        isFunction: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'isFunction',
        ],
        isObject: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'isObject',
        ],
        kFileName: [
          path.resolve(__dirname, '../src/common/safe-globals-shared.js'),
          'kFileName',
        ],
        // Inject `browser` from your common/consts.js wrapper
        browser: [
          path.resolve(__dirname, '../src/common/consts.js'),
          'browser',
        ],
      }),
    );
  }),
];
