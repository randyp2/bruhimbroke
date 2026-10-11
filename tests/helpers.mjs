import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const output = new URL('../.output/chrome-mv3/', import.meta.url);
const html = readFileSync(new URL('popup.html', output), 'utf8');
const scriptPath = html.match(/src="([^"]+\.js)"/)[1];
const popupScript = readFileSync(new URL(scriptPath.replace(/^\//, ''), output), 'utf8');
const contentScript = readFileSync(new URL('content-scripts/shopping.js', output), 'utf8');
const backgroundScript = readFileSync(new URL('background.js', output), 'utf8');
const shadows = new WeakMap();

/** Test-only access to the closed overlay root; the production page cannot query it. */
export function overlay(document) {
  return shadows.get(document.querySelector('bruhim-broke'));
}

/** Exercise the production bundles with asynchronous Chrome storage and messaging boundaries. */
export function openPage(t, { stored = {}, page = html, url = 'https://popup.test/', content = false, background = false, storageError = false, configure = () => {} } = {}) {
  const dom = new JSDOM(page, { runScripts: 'outside-only', url });
  const attachShadow = dom.window.Element.prototype.attachShadow;
  dom.window.Element.prototype.attachShadow = function (options) {
    const root = attachShadow.call(this, options);
    shadows.set(this, root);
    return root;
  };
  t.after(() => dom.window.close());
  const storageListeners = new Set();
  const messageListeners = new Set();
  const event = (listeners = new Set()) => ({ addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn), dispatch: (...args) => listeners.forEach((fn) => fn(...args)) });
  const changed = (keys) => dom.window.queueMicrotask(() => storageListeners.forEach((listener) => listener(Object.fromEntries(keys.map((key) => [key, { newValue: stored[key] }])), 'local')));
  dom.window.chrome = {
    runtime: {
      id: 'test-extension', getURL: (path) => `chrome-extension://test-extension/${path.replace(/^\//, '')}`,
      onMessage: event(messageListeners), onInstalled: event(), onStartup: event(),
      sendMessage: async () => ({ enabled: ['amazon.com', 'www.amazon.com'].includes(new URL(url).hostname) && !stored.shoppingPausedHosts?.includes(new URL(url).hostname) }),
    },
    permissions: { getAll: async () => ({ origins: [] }), request: async () => false, remove: async () => false, onAdded: event(), onRemoved: event() },
    scripting: { getRegisteredContentScripts: async () => [] },
    tabs: { query: async () => [] },
    storage: {
      onChanged: event(storageListeners),
      local: {
        get(key, callback) {
          const items = key === null ? { ...stored } : Object.fromEntries((Array.isArray(key) ? key : [key]).map((name) => [name, stored[name]]));
          if (callback) { dom.window.queueMicrotask(() => callback(items)); return; }
          return storageError ? Promise.reject(new Error('Storage unavailable')) : Promise.resolve(items);
        },
        set(items, callback) {
          Object.assign(stored, items);
          changed(Object.keys(items));
          if (callback) { dom.window.queueMicrotask(callback); return; }
          return Promise.resolve();
        },
        remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
          changed(Array.isArray(keys) ? keys : [keys]);
          return Promise.resolve();
        },
      },
    },
  };
  // jsdom does not implement the browser's top layer, inertness, or native focus trapping.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  configure(dom.window.chrome);
  dom.window.eval(background ? backgroundScript : content ? contentScript : popupScript);
  return {
    document: dom.window.document,
    window: dom.window,
    stored,
    message(message, sender = { id: 'test-extension' }) {
      let result;
      for (const listener of messageListeners) listener(message, sender, (value) => { result = value; });
      return result;
    },
    messageAsync(message, sender = { id: 'test-extension' }) {
      return new Promise((resolve) => {
        let pending = false;
        for (const listener of messageListeners) pending = listener(message, sender, resolve) === true || pending;
        if (!pending) resolve(undefined);
      });
    },
  };
}

export async function waitForText(root, text) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((root.body ?? root).textContent.includes(text)) return;
    await setTimeout(20);
  }
  assert.fail(`Expected "${text}"; showed: ${(root.body ?? root).textContent}`);
}

/** Content scripts now verify pause settings with the worker before intercepting clicks. */
export async function openReadyPage(t, options) {
  const page = openPage(t, options);
  await setTimeout(0);
  return page;
}

export async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await setTimeout(20);
  }
  assert.fail(message);
}

/** Open the retained tools through the actual landing-page navigation. */
export async function openHistory(document) {
  await waitFor(() => document.querySelector('.home-tools'), 'Expected the main menu');
  const details = document.querySelector('.home-tools');
  if (!details.open) details.querySelector('summary').click();
  assert.equal(details.open, true);
}

/** Use native setters so React sees the same value change as a real user input. */
export async function fill(root, label, value) {
  const wrapper = [...root.querySelectorAll('label')].find((item) => item.firstChild.textContent.trim() === label);
  assert.ok(wrapper, `Missing field: ${label}`);
  const input = wrapper.querySelector('input, select');
  const window = input.ownerDocument.defaultView;
  const prototype = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  await setTimeout(0);
}

export function click(root, label) {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent === label);
  assert.ok(button, `Missing button: ${label}`);
  assert.equal(button.disabled, false, `Disabled button: ${label}`);
  button.click();
}
