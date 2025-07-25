const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { getVersion, isBeta } = require('./version-helper');

/**
 * Read and parse the YAML manifest template.
 * Uses an absolute path so it works regardless of CWD.
 */
async function readManifest() {
  const manifestPath = path.resolve(__dirname, '../src/manifest.yml');
  const input = await fs.readFile(manifestPath, 'utf8');
  return yaml.load(input);
}

/**
 * Build a final manifest object, merging in a base if provided,
 * then applying MV3-specific transformations.
 * @param {object=} base - Optional base manifest to extend
 */
async function buildManifest(base) {
  // Start from provided base or re-read the YAML template
  const data = base ? { ...base } : await readManifest();

  // Always bump to the current version
  data.version = getVersion();

  // MV3: replace `background.scripts` with a single service_worker
  data.background = { service_worker: 'background.js' };

  // Self-hosted Firefox updates on a custom URL
  if (
    process.env.TARGET === 'selfHosted' &&
    data.browser_specific_settings &&
    data.browser_specific_settings.gecko
  ) {
    data.browser_specific_settings.gecko.update_url =
      'https://raw.githubusercontent.com/violentmonkey/violentmonkey/updates/updates.json';
  }

  // Beta builds drop i18n and rename action titles
  if (isBeta()) {
    const name = 'Violentmonkey BETA';
    data.name = name;
    // MV3 uses `action` instead of `browser_action`
    data.action = data.action || {};
    data.action.default_title = name;
  }

  return data;
}

/**
 * Build the updates list JSON for auto-updating addons.
 * (Usually written to an `updates.json` endpoint.)
 */
async function buildUpdatesList(version, url) {
  const manifest = await readManifest();
  return {
    addons: {
      [manifest.browser_specific_settings.gecko.id]: {
        updates: [{ version, update_link: url }],
      },
    },
  };
}

/**
 * Webpack plugin that writes out the MV3 manifest.json after each build.
 */
class ListBackgroundScriptsPlugin {
  constructor({ minify } = {}) {
    this.minify = minify;
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tapPromise(
      ListBackgroundScriptsPlugin.name,
      async (compilation) => {
        const distDir = compilation.outputOptions.path;
        const outPath = path.resolve(distDir, 'manifest.json');

        const manifest = await buildManifest();
        const json = JSON.stringify(manifest, null, this.minify ? 0 : 2);

        await fs.writeFile(outPath, json, 'utf8');
      },
    );
  }
}

module.exports = {
  readManifest,
  buildManifest,
  buildUpdatesList,
  ListBackgroundScriptsPlugin,
};
