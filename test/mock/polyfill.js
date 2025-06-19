//console.log("Before window copy, global.setTimeout =", typeof global.setTimeout);

// --- MOCK FOR MessagePort (MOVE THIS TO THE VERY TOP) START ---
// Make sure this is the first class/global assignment in the file
class MockMessagePort {
  constructor() {
    this.onmessage = null;
    this.onmessageerror = null;
    this.postMessage = jest.fn();
    this.start = jest.fn();
    this.close = jest.fn();
  }
}
global.MessagePort = MockMessagePort;
// --- MOCK FOR MessagePort END ---

global.chrome =
global.browser = {
  storage: {
    local: {
      get() {
        return Promise.resolve({});
      },
      set() {
        return Promise.resolve();
      },
    },
  },
  extension: {
    isAllowedFileSchemeAccess: () => false,
  },
  runtime: {
    getURL: path => path,
    getManifest: () => ({
      icons: { 16: '' },
      options_ui: {},
    }),
    getPlatformInfo: async () => ({}),
  },
  tabs: {
    onRemoved: { addListener: () => {} },
    onReplaced: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
  },
  windows: {
    getAll: () => [{}],
    getCurrent: () => ({}),
  },
};
if (!window.Response) window.Response = { prototype: {} };
const domProps = Object.getOwnPropertyDescriptors(window);
for (const k of Object.keys(domProps)) {
  // Skipping ***Storage and native global methods
  if (k.endsWith('Storage') || /^[a-z]/.test(k) && (k in global)) {
    delete domProps[k];
  }
}
//Object.defineProperties(global, domProps);
// Only copy properties that don't already exist on global 6/18/2025
for (const [key, descriptor] of Object.entries(domProps)) {
  if (!(key in global)) {
    Object.defineProperty(global, key, descriptor);
  }
}
//End New code added 6/18/2025
console.log("After window copy, global.setTimeout =", typeof global.setTimeout);


// --- REFINED MOCK FOR MessageChannel START ---
if (typeof global.MessageChannel === 'undefined') {
  class MockMessageChannel {
    constructor() {
      this.port1 = new MockMessagePort();
      this.port2 = new MockMessagePort();
    }
  }
  global.MessageChannel = MockMessageChannel;
}
// --- REFINED MOCK FOR MessageChannel END ---


// --- REPLACE MOCKS FOR TextDecoder/TextEncoder WITH NATIVE NODE.JS IMPLEMENTATIONS START ---
// Node.js v11+ includes global TextDecoder and TextEncoder.
// Ensure you use the global ones if available, otherwise import them.
// If they are not globally available (older Node.js), you might need:
// const { TextDecoder, TextEncoder } = require('util'); // At the top of polyfill.js

if (typeof global.TextDecoder === 'undefined' || typeof global.TextEncoder === 'undefined') {
  // If `global.TextDecoder` or `global.TextEncoder` are truly undefined,
  // it means JSDOM or Node.js version doesn't provide them.
  // In this case, you can either:
  // A) Use Node.js's `util` module if running on an older Node.js version:
  //    const { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder } = require('util');
  //    global.TextDecoder = NodeTextDecoder;
  //    global.TextEncoder = NodeTextEncoder;
  // B) Or, if you're on a recent Node.js (v11+), they *should* be global.
  //    The `if` condition might be failing if JSDOM sets them but not completely,
  //    or if your `typeof` check is too simple.

  // Let's assume you're on a Node.js version where they should exist globally
  // or are provided by the test runner. The problem might be the `if` check itself.

  // For a robust fix that works regardless of Node.js version in tests,
  // it's often best to mock them with the real ones provided by Node.js's 'util' module
  // if they aren't directly available in the JSDOM global.

  // Try this:
  try {
    const { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder } = require('util');
    global.TextDecoder = NodeTextDecoder;
    global.TextEncoder = NodeTextEncoder;
  } catch (e) {
    console.warn("Could not import native Node.js TextDecoder/TextEncoder. Using basic mock.");
    // Fallback to basic mocks if 'util' import fails (e.g., in a truly minimal environment)
    class BasicMockTextDecoder {
      decode(input) { return String.fromCharCode(...input); }
    }
    class BasicMockTextEncoder {
      encode(input) { return new Uint8Array(input.split('').map(c => c.charCodeAt(0))); }
    }
    global.TextDecoder = global.TextDecoder || BasicMockTextDecoder;
    global.TextEncoder = global.TextEncoder || BasicMockTextEncoder;
  }
}
// --- REPLACE MOCKS FOR TextDecoder/TextEncoder END ---


// Now, this line should work because MessagePort is defined
delete MessagePort.prototype.onmessage; // to avoid hanging
global.PAGE_MODE_HANDSHAKE = 123;
global.VAULT_ID = false;
Object.assign(URL, {
  blobCache: {},
  createObjectURL(blob) {
    const blobUrl = `blob:${Math.random()}`;
    URL.blobCache[blobUrl] = blob;
    return blobUrl;
  },
});
Object.assign(global, require('@/common/safe-globals-shared'));
Object.assign(global, require('@/common/safe-globals'));
Object.assign(global, require('@/injected/safe-globals'));
Object.assign(global, require('@/injected/content/safe-globals'));
Object.assign(global, require('@/injected/web/safe-globals'));
