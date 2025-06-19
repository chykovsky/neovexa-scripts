import '@/common/browser';
import { getActiveTab, makePause } from '@/common';
import { deepCopy } from '@/common/object';
import { handleHotkeyOrMenu } from './utils/icon';
import { addPublicCommands, commands, init } from './utils';
import './sync';
import './utils/clipboard';
import './utils/notifications';
import './utils/preinject';
import './utils/script';
import './utils/storage-fetch';
import './utils/tab-redirector';
import './utils/tester';
import './utils/update';

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
      await browser.tabs.executeScript(tabId, {
        code: `
        (function() {
          const scriptEl = document.createElement('script');
          scriptEl.textContent = ${JSON.stringify(injectionCode)};
          (document.head || document.documentElement).appendChild(scriptEl);
          scriptEl.remove();
      })();
        `,
        allFrames: false,
        runAt: 'document_idle',
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

global.handleCommandMessage = handleCommandMessage;
global.deepCopy = deepCopy;
browser.runtime.onMessage.addListener(handleCommandMessage);
browser.commands?.onCommand.addListener(async (cmd) => {
  handleHotkeyOrMenu(cmd, await getActiveTab());
});
