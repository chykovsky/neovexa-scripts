import { addPublicCommands, commands, init } from './utils';
import './utils/popup-tracker';
import './sync'; // <-- loads sync/index.js, which calls addOwnCommands({ SyncGetStates: getStates, … })

// 3) Polyfill browser.tabs.executeScript under MV3 to use chrome.scripting.executeScript
//    MV3 service workers no longer have tabs.executeScript, so we re‑define it.
if (!chrome.tabs.executeScript && chrome.scripting) {
  // NOTE: we assume `browser` is aliased to `chrome` by your browser.js polyfill
  browser.tabs.executeScript = (tabId, details) => {
    // details.code is a string of JS — we wrap it in a Function
    const fn = new Function(details.code);
    return chrome.scripting
      .executeScript({
        target: { tabId, allFrames: details.allFrames || false },
        world: 'MAIN', // inject into page context
        func: fn,
      })
      .then((results) => results.map((r) => r.result));
  };
}

// 4) Short‑circuit the popup’s InitPopup / GetMoreIds / GetData so sendCmdDirectly()
//    actually gets a real array back instead of timing out.
//    We're listening on chrome.runtime.onMessage (raw) *before* your existing
//    handleCommandMessage registers, so we’ll answer these three calls directly.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { cmd, data } = message;
  if (
    ['InitPopup', 'GetMoreIds', 'GetData'].includes(cmd) &&
    typeof commands[cmd] === 'function'
  ) {
    // call the same command handler that popup-tracker.js registered
    Promise.resolve(commands[cmd](data, { tab: sender.tab || false }))
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep the channel open for our async sendResponse
  }
  // anything else falls through to your normal handleCommandMessage below…
});
// ────────────────────────────────────────────────────────────────
// then all your existing imports & SW logic…

// import { ICON_PREFIX } from '@/common/safe-globals';
// import { SCRIPTS } from '@/common/safe-globals-shared';
import '@/common/browser';
import { getActiveTab, makePause } from '@/common';
import { deepCopy } from '@/common/object';
import { handleHotkeyOrMenu } from './utils/icon';
// import { addPublicCommands, commands, init } from './utils';
import './sync';
import './utils/clipboard';
import './utils/notifications';
import './utils/preinject';
import './utils/script';
import './utils/storage-fetch';
import './utils/tab-redirector';
import './utils/tester';
import './utils/update';
// import { isFunction } from '@/common/safe-globals-shared';
// import { IDS, kFrameId } from '@/common/consts';
// import {
//   getAllScriptsForTab,
//   getUserOptions,
//   computeMoreIds,
//   getScriptsByIds,
// } from './utils/popup‑helpers';
//
//

// 1) A quick onMessage handler for popup commands.
//    This bypasses the “no src.tab && no mode” guard in handleCommandMessage.

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   const { cmd, data } = message;
//   if (cmd === 'InitPopup' || cmd === 'GetMoreIds' || cmd === 'GetData') {
//     const fn = commands[cmd];
//     if (fn) {
//       // call it as if it were a public command
//       Promise.resolve(fn(data, { tab: sender.tab || false }))
//         .then((result) => sendResponse(result))
//         .catch((err) => sendResponse({ error: err.message }));
//       return true; // keep channel open for async sendResponse
//     }
//   }
//   // otherwise fall through to the existing handleCommandMessage listener
// });

function getSafeFunctionName(scriptName) {
  // Replace non-word characters with underscores and ensure it starts with a letter
  let fn = scriptName.replace(/\W+/g, '_');
  if (/^\d/.test(fn)) fn = 'fn_' + fn;
  return 'run_' + fn; // e.g., 'run_Testing_Script_1'
}

addPublicCommands({
  /**
   * Timers in content scripts are shared with the web page so it can clear them.
   * await sendCmd('SetTimeout', 100) in injected/content
   * bridge.call('SetTimeout', 100, cb) in injected/web
   */
  SetTimeout(ms) {
    return ms > 0 && makePause(ms);
  },

  async ExecuteUserscriptInTab(data) {
    const { tabId, scriptCode, scriptName, scriptId, fileContent } = data;
    console.log(
      `tabId: ${tabId}, scriptCode: ${scriptCode}, scriptName: ${scriptName}, scriptId: ${scriptId}, fileContent: ${fileContent}`,
    );
    const functionName = getSafeFunctionName(scriptName);

    // Replace FUNCTION_PLACEHOLDER with the dynamic function name
    const dynamicScriptCode = scriptCode.replace(
      /FUNCTION_PLACEHOLDER/g,
      functionName,
    );

    const injectionCode = `
      (function(scriptId, scriptName) {
        ${dynamicScriptCode}
        var scriptTag = document.currentScript;
        let fc = ${JSON.stringify(fileContent)}; 
        if (scriptTag) {
          scriptTag.setAttribute('data-vm-manual-run-id', scriptId);
          scriptTag.setAttribute('data-vm-manual-run-name', scriptName);
          scriptTag.setAttribute('data-vm-manual-func', ${JSON.stringify(
            functionName,
          )});
        }
        // Optionally, call the function after defining
        if(fc) {
          window[${JSON.stringify(functionName)}] && window[${JSON.stringify(
            functionName,
          )}](fc);
        } else {
          window[${JSON.stringify(functionName)}] && window[${JSON.stringify(
            functionName,
          )}]();
      }
      })(
        ${JSON.stringify(scriptId)},
        ${JSON.stringify(scriptName)}
      );
    `;

    try {
      // await browser.tabs.executeScript(tabId, {
      //   code: `
      //   (function() {
      //     const scriptEl = document.createElement('script');
      //     scriptEl.textContent = ${JSON.stringify(injectionCode)};
      //     (document.head || document.documentElement).appendChild(scriptEl);
      //     scriptEl.remove();
      // })();
      //   `,
      //   allFrames: false,
      //   runAt: 'document_idle',
      // });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (code) => {
          const scriptEl = document.createElement('script');
          scriptEl.textContent = code;
          (document.head || document.documentElement).appendChild(scriptEl);
          scriptEl.remove();
        },
        args: [injectionCode],
      });
      return { status: 'success' };
    } catch (error) {
      console.error(
        `VM background: tabs.executeScript FAILED for tab ${tabId} for ${scriptName}:`,
        error,
      );
      throw new Error('Failed to execute script: ' + scriptName);
    }
  },

  // // popup start‑up
  // async InitPopup(_, src) {
  //   const tabId = src.tab?.id;
  //   const cached = {}; // no cached SetPopup calls yet
  //   const scripts = await getAllScriptsForTab(tabId); // your existing helper
  //   const opts = await getUserOptions(); // load the options your popup needs
  //   const payload = {
  //     tab: { id: tabId },
  //     [IDS]: {}, // initial empty id‑map
  //     scripts,
  //     ...opts,
  //   };
  //   const failureTuple = ['', null, null];
  //   return [cached, payload, failureTuple];
  // },

  // // when popup calls sendCmdDirectly('GetMoreIds', { url, kFrameId, IDS })
  // async GetMoreIds({ url, [kFrameId]: frameId, [IDS]: ids }) {
  //   return await computeMoreIds(url, frameId, ids);
  // },

  // // when popup calls sendCmdDirectly('GetData', { ids })
  // async GetData({ ids }) {
  //   const metas = await getScriptsByIds(ids);
  //   return { scripts: metas };
  // },
});

function handleCommandMessage({ cmd, data, url, [kTop]: mode } = {}, src) {
  if (init) {
    return init.then(handleCommandMessage.bind(this, ...arguments));
  }
  const func = hasOwnProperty(commands, cmd) && commands[cmd];
  if (!func) return; // not responding to commands for popup/options
  // The `src` is omitted when invoked via sendCmdDirectly unless fakeSrc is set.
  // The `origin` is Chrome-only, it can't be spoofed by a compromised tab unlike `url`.
  if (src) {
    let me = src.origin;
    if (url) src.url = url; // MessageSender.url doesn't change on soft navigation
    me = me
      ? me === extensionOrigin
      : `${url || src.url}`.startsWith(extensionRoot);
    if (!me && func.isOwn && !src.fake) {
      throw new SafeError(
        `Command is only allowed in extension context: ${cmd}`,
      );
    }
    // TODO: revisit when link-preview is shipped in Chrome to fix tabId-dependent functionality
    if (!src.tab) {
      if (!me && (IS_FIREFOX ? !func.isOwn : !mode)) {
        if (process.env.DEBUG)
          console.log('No src.tab, ignoring:', ...arguments);
        return;
      }
      src.tab = false; // allowing access to props
    }
    if (mode) src[kTop] = mode;
  }
  return handleCommandMessageAsync(func, data, src);
}

async function handleCommandMessageAsync(func, data, src) {
  try {
    // `await` is necessary to catch the error here
    return await func(data, src);
  } catch (err) {
    if (process.env.DEBUG) console.error(err);
    // Adding `stack` info + in FF a rejected Promise value is transferred only for an Error object
    throw err instanceof SafeError
      ? err
      : new SafeError(isObject(err) ? JSON.stringify(err) : err);
  }
}

globalThis.handleCommandMessage = handleCommandMessage;
globalThis.deepCopy = deepCopy;
browser.runtime.onMessage.addListener(handleCommandMessage);
browser.commands?.onCommand.addListener(async (cmd) => {
  handleHotkeyOrMenu(cmd, await getActiveTab());
});

// For service worker context:
// globalThis.isFunction = isFunction;
// const defaultImage = `${ICON_PREFIX}128.png`;
// globalThis.defaultImage1 = defaultImage;

// const scripts1 = `#${SCRIPTS}`;
// globalThis.scripts1 = scripts1;
