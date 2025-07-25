// test‑dirname.js
const path = require('path');
console.log('__dirname is:', __dirname);
const manifestPath = path.resolve(__dirname, 'src/manifest.yml');
console.log('Looking for manifest at:', manifestPath);
