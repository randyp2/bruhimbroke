import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { amazonOrigins, automaticOrigins, pausedHosts, pausedSitesKey, siteEnabled, sitePattern, siteScriptId, webOrigins } from '../lib/sitePatterns.ts';
import { openPage, openHistory, click, waitFor, waitForText, overlay } from './helpers.mjs';

const origin = 'https://shop.example/*';
const productUrl = 'https://shop.example/products/shirt';
const popupSender = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
const contentSender = { id: 'test-extension', url: productUrl, tab: { id: 7 }, frameId: 0 };
const script = (site) => ({ id: siteScriptId(site), matches: [site], excludeMatches: amazonOrigins, js: ['content-scripts/shopping.js'], runAt: 'document_start', persistAcrossSessions: true });
const prefs = () => ({ onboarding: { trackingEnabled: true, monthlyIncomeIncrease: 800 } });

/** Mutable platform state survives new popup/worker instances in the tests. */
function platform(initialOrigins = [], initialScripts = []) {
  const state = { origins: [...initialOrigins], scripts: [...initialScripts], calls: [], deny: false, fail: false };
  state.configure = (chrome) => {
    chrome.permissions.getAll = async () => ({ origins: [...state.origins] });
    chrome.permissions.request = async ({ origins }) => {
      state.calls.push(['request', [...origins]]);
      if (state.deny) return false;
      state.origins = [...new Set([...state.origins, ...origins])];
      chrome.permissions.onAdded.dispatch({ origins });
      return true;
    };
    chrome.permissions.remove = async ({ origins }) => {
      state.calls.push(['remove', [...origins]]);
      state.origins = state.origins.filter((site) => !origins.includes(site));
      chrome.permissions.onRemoved.dispatch({ origins });
      return true;
    };
    chrome.scripting.getRegisteredContentScripts = async () => [...state.scripts];
    chrome.scripting.registerContentScripts = async (scripts) => {
      state.calls.push(['register', scripts]);
      if (state.fail) throw new Error('Registration failed');
      assert.ok(scripts.every((item) => !state.scripts.some((existing) => existing.id === item.id)), 'Never register duplicate IDs');
      state.scripts.push(...scripts);
    };
    chrome.scripting.unregisterContentScripts = async ({ ids }) => {
      state.calls.push(['unregister', [...ids]]);
      state.scripts = state.scripts.filter((item) => !ids.includes(item.id));
    };
    chrome.scripting.executeScript = async (args) => { state.calls.push(['inject', args]); };
    chrome.tabs.query = async () => [{ id: 7, url: productUrl }];
    chrome.tabs.get = async () => ({ id: 7, url: productUrl });
    chrome.tabs.sendMessage = async (id, message) => { state.calls.push(['tab-message', id, message]); return { ok: true }; };
  };
  return state;
}

test('broad HTTP(S) grants supersede exact sites; restricted URLs and invalid pauses stay excluded', () => {
  assert.equal(sitePattern(`${productUrl}?token=secret#part`), origin);
  assert.equal(sitePattern('http://localhost:1234/products/x'), 'http://localhost/*');
  for (const value of ['chrome://extensions', 'file:///tmp/x', 'https://*.example.com/*', 'https://*/*', 'https://user:pass@example.com', 'https://chromewebstore.google.com/detail/x', 'broken']) {
    assert.equal(sitePattern(value), null, value);
  }
  assert.deepEqual(automaticOrigins([origin, 'https://*/*', 'https://*.example.com/*', 'https://www.amazon.com/*', 'https://shop.example/cart']), ['https://*/*']);
  assert.deepEqual(automaticOrigins(['<all_urls>']), webOrigins);
  assert.deepEqual(automaticOrigins([origin]), [origin]);
  assert.deepEqual(pausedHosts(['shop.example', 'shop.example', '*', 'evil/path', 3, 'user:pass@host', 'shop.example:1234']), ['shop.example']);
  assert.equal(siteEnabled(productUrl, webOrigins, []), true);
  assert.equal(siteEnabled(productUrl, webOrigins, ['shop.example']), false);
  assert.equal(siteEnabled('http://shop.example/products/x', webOrigins, ['shop.example']), false);
  assert.equal(siteEnabled('https://www.amazon.com/dp/X', [], ['www.amazon.com']), false);
  assert.equal(siteEnabled('https://www.amazon.com/dp/X', amazonOrigins, []), true);
  assert.equal(siteEnabled('https://www.amazon.com/dp/X', [], []), false);
  assert.equal(siteEnabled('chrome://extensions', webOrigins, []), false);
  assert.equal(siteEnabled('https://chromewebstore.google.com/detail/x', webOrigins, []), false);
  assert.notEqual(siteScriptId(origin), siteScriptId('http://shop.example/*'));
  const manifest = JSON.parse(readFileSync(new URL('../.output/chrome-mv3/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://*/*']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual([...manifest.content_scripts[0].matches].sort(), ['https://amazon.com/*', 'https://www.amazon.com/*']);
});

test('worker registers persistent scripts once, restores on startup, and removes only its stale scripts', async (t) => {
  const state = platform([origin, 'https://www.amazon.com/*'], [script('https://old.example/*'), { id: 'unrelated' }]);
  const worker = openPage(t, { background: true, configure: state.configure });
  const result = await worker.messageAsync({ type: 'shopping:sync-sites' }, popupSender);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.scripts)), [{ id: 'unrelated' }, script(origin)]);
  await Promise.all([worker.messageAsync({ type: 'shopping:sync-sites' }, popupSender), worker.messageAsync({ type: 'shopping:sync-sites' }, popupSender)]);
  assert.equal(state.calls.filter(([name]) => name === 'register').length, 1);
  state.scripts = [];
  worker.window.chrome.runtime.onStartup.dispatch();
  await waitFor(() => state.scripts.length === 1, 'Startup should restore the granted script');
  state.origins = [];
  worker.window.chrome.permissions.onRemoved.dispatch({ origins: [origin] });
  await waitFor(() => state.scripts.length === 0 && state.calls.some(([name]) => name === 'tab-message'), 'Revocation should unregister and notify open tabs');
});

test('worker validates sender and exact host; registration failures can be retried', async (t) => {
  const state = platform([origin]);
  const worker = openPage(t, { background: true, configure: state.configure });
  assert.equal((await worker.messageAsync({ type: 'shopping:access' }, contentSender)).enabled, true);
  assert.equal((await worker.messageAsync({ type: 'shopping:access' }, { ...contentSender, url: 'https://other.shop.example/products/x' })).enabled, false);
  for (const sender of [{ ...contentSender, id: 'foreign' }, { ...contentSender, frameId: 1 }, popupSender]) {
    assert.equal(await worker.messageAsync({ type: 'shopping:access' }, sender), undefined);
  }
  assert.equal(await worker.messageAsync({ type: 'shopping:sync-sites' }, contentSender), undefined);
  assert.equal(state.calls.length, 0);
  state.fail = true;
  assert.equal((await worker.messageAsync({ type: 'shopping:sync-sites' }, popupSender)).ok, false);
  state.fail = false;
  assert.equal((await worker.messageAsync({ type: 'shopping:sync-sites' }, popupSender)).ok, true);
  assert.equal((await worker.messageAsync({ type: 'shopping:sync-sites' }, { ...popupSender, tab: { id: 9 }, frameId: 0 })).ok, true);
  state.origins = ['https://*/*'];
  assert.equal((await worker.messageAsync({ type: 'shopping:access' }, contentSender)).enabled, true);
  worker.window.chrome.permissions.getAll = async () => { throw new Error('Unavailable'); };
  assert.equal((await worker.messageAsync({ type: 'shopping:access' }, contentSender)).enabled, false);
});

test('popup requests websites once, migrates exact grants, activates the tab, and pauses without deleting history', async (t) => {
  const state = platform([origin], [script(origin)]);
  const stored = prefs();
  const worker = openPage(t, { background: true, configure: state.configure, stored });
  const configure = (chrome) => {
    state.configure(chrome);
    chrome.runtime.sendMessage = (message) => worker.messageAsync(message, popupSender);
    let injected = false;
    chrome.tabs.sendMessage = async () => { if (!injected) throw new Error('No receiver'); return { ok: true }; };
    chrome.scripting.executeScript = async (args) => { state.calls.push(['inject', args]); injected = true; };
  };
  const before = JSON.stringify(stored.onboarding);
  const { document } = openPage(t, { stored, configure });
  await openHistory(document);
  await waitForText(document, 'Enable automatic checks');
  document.querySelector('.site-access summary').click();
  click(document, 'Enable automatic checks');
  assert.equal(state.calls[0][0], 'request', 'Permission is requested directly during the click');
  assert.deepEqual(state.calls[0][1], webOrigins);
  await waitForText(document, 'Automatic checks are on across websites.');
  await waitFor(() => state.calls.some(([name]) => name === 'inject'), 'Current tab should get the listener');
  assert.equal(state.scripts[0].persistAcrossSessions, true);
  assert.deepEqual(state.scripts.flatMap((item) => [...item.matches]).sort(), [...webOrigins].sort());
  const reopened = openPage(t, { stored, configure }).document;
  await openHistory(reopened);
  await waitForText(reopened, 'Pause on this site');
  click(reopened, 'Pause on this site');
  await waitForText(reopened, 'Paused here. History is unchanged.');
  assert.equal(state.scripts.length, 2);
  assert.deepEqual([...stored[pausedSitesKey]], ['shop.example']);
  assert.equal((await worker.messageAsync({ type: 'shopping:access' }, contentSender)).enabled, false);
  assert.equal(JSON.stringify(stored.onboarding), before);
  click(reopened, 'Resume on this site');
  await waitForText(reopened, 'Checks resumed.');
  assert.equal((await worker.messageAsync({ type: 'shopping:access' }, contentSender)).enabled, true);
});

test('denied permission keeps manual checks and failed registration offers retry', async (t) => {
  const state = platform();
  state.deny = true;
  const worker = openPage(t, { background: true, configure: state.configure });
  const configure = (chrome) => { state.configure(chrome); chrome.runtime.sendMessage = (message) => worker.messageAsync(message, popupSender); };
  const { document } = openPage(t, { stored: prefs(), configure });
  await openHistory(document);
  await waitForText(document, 'Enable automatic checks');
  click(document, 'Enable automatic checks');
  await waitForText(document, 'Permission not granted.');
  assert.equal(state.scripts.length, 0);
  assert.ok([...document.querySelectorAll('button')].some((button) => button.textContent === 'Check this page'));
  state.deny = false;
  state.fail = true;
  click(document, 'Enable automatic checks');
  await waitForText(document, 'Could not enable automatic checks.');
  await waitForText(document, 'Retry enabling');
  state.fail = false;
  click(document, 'Retry enabling');
  await waitForText(document, 'Automatic checks are on across websites.');
});

test('restricted tabs cannot be enabled as websites', async (t) => {
  const { document } = openPage(t, { stored: prefs(), configure: (chrome) => { chrome.tabs.query = async () => [{ id: 7, url: 'chrome://extensions/' }]; } });
  await openHistory(document);
  await waitForText(document, 'Enable automatic checks');
  assert.ok(!document.body.textContent.includes('Pause on this site'));
});

test('onboarding offers one website approval and remains finishable when it is denied', async (t) => {
  for (const deny of [true, false]) {
    const state = platform();
    state.deny = deny;
    const stored = {};
    const worker = openPage(t, { background: true, configure: state.configure, stored });
    const { document } = openPage(t, { stored, configure: (chrome) => {
      state.configure(chrome);
      chrome.runtime.sendMessage = (message) => worker.messageAsync(message, popupSender);
    } });
    await waitForText(document, 'Any money news?');
    click(document, 'No major change');
    await waitFor(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Continue').disabled, 'Draft saved before continuing');
    click(document, 'Continue');
    await waitForText(document, 'Skip for now');
    click(document, 'Skip for now');
    await waitForText(document, 'Enable automatic checks');
    assert.equal(state.calls.length, 0, 'Do not request permission before an explicit click');
    click(document, 'Enable automatic checks');
    assert.deepEqual(state.calls[0], ['request', webOrigins]);
    await waitForText(document, deny ? 'Permission not granted.' : 'Automatic checks are on across websites.');
    click(document, 'Finish setup');
    await waitForText(document, 'History & tools');
    assert.equal(stored.onboarding.trackingEnabled, true);
    assert.equal(state.calls.filter(([name]) => name === 'request').length, 1);
  }
});

test('persisted pauses gate first clicks, survive manual checks, and update already-open Amazon and generic pages', async (t) => {
  for (const url of [productUrl, 'https://www.amazon.com/dp/TEST']) {
    const host = new URL(url).hostname;
    const stored = { ...prefs(), [pausedSitesKey]: [host] };
    const state = platform([...webOrigins, ...amazonOrigins]);
    const worker = openPage(t, { background: true, configure: state.configure, stored });
    let page;
    worker.window.chrome.tabs.sendMessage = async (_id, message) => page?.messageAsync(message);
    page = openPage(t, { content: true, url, stored, page: '<h1>Shirt</h1><button id="add-to-cart-button">Add to cart</button>', configure: (chrome) => {
      chrome.runtime.sendMessage = (message) => worker.messageAsync(message, { ...contentSender, url });
    } });
    const { document, message } = page;
    document.querySelector('button').click();
    assert.equal(overlay(document), undefined, 'No first-click race before pause settings arrive');
    await setTimeout(0);
    document.querySelector('button').click();
    assert.equal(overlay(document), undefined);
    message({ type: 'shopping:open' });
    assert.ok(overlay(document), 'Manual checks remain available on paused sites');
    click(overlay(document), 'I’ll reconsider');
    document.querySelector('button').click();
    assert.equal(overlay(document), undefined, 'Manual checks do not undo a pause');
    await worker.window.chrome.storage.local.set({ [pausedSitesKey]: [] });
    await setTimeout(0);
    document.querySelector('button').click();
    assert.ok(overlay(document), 'Resuming updates existing listeners');
    await worker.window.chrome.storage.local.set({ [pausedSitesKey]: [host] });
    await waitFor(() => !overlay(document), 'Pausing closes the current intervention');
    document.querySelector('button').click();
    assert.equal(overlay(document), undefined);
    assert.ok(!Object.keys(stored).some((key) => key.startsWith('purchase:')));
  }
});

test('a failed pause save preserves the original settings and purchase history', async (t) => {
  const stored = { ...prefs(), [pausedSitesKey]: ['other.example'], 'purchase:existing': { title: 'Keep me' } };
  const original = JSON.stringify(stored);
  const state = platform(webOrigins, webOrigins.map(script));
  const { document } = openPage(t, { stored, configure: (chrome) => {
    state.configure(chrome);
    chrome.storage.local.set = async () => { throw new Error('Storage failed'); };
  } });
  await openHistory(document);
  await waitForText(document, 'Pause on this site');
  click(document, 'Pause on this site');
  await waitForText(document, 'Could not save this site preference.');
  assert.equal(JSON.stringify(stored), original);
  assert.ok(document.body.textContent.includes('Pause on this site'));
});

test('granted generic site intercepts automatically, rechecks SPA navigation, and immediately stops on revocation', async (t) => {
  let enabled = true;
  let checks = 0;
  const { document, window, messageAsync, stored } = openPage(t, {
    content: true, url: productUrl, page: '<h1>Shirt</h1><button><span>Add to cart</span></button>', stored: prefs(),
    configure: (chrome) => { chrome.runtime.sendMessage = async () => { checks++; return { enabled }; }; },
  });
  await setTimeout(0);
  let passed = 0;
  document.querySelector('button').addEventListener('click', () => passed++);
  document.querySelector('span').click();
  assert.equal(passed, 0);
  assert.ok(overlay(document));
  assert.equal(overlay(document).querySelectorAll('input')[1].value, '', 'Unverified price remains manual');
  enabled = false;
  const revoked = messageAsync({ type: 'shopping:refresh-access' });
  assert.equal(overlay(document), undefined, 'Revocation closes an open intervention immediately');
  document.querySelector('button').click();
  assert.equal(passed, 1);
  assert.equal((await revoked).enabled, false);
  enabled = true;
  window.history.pushState({}, '', '/products/next-shirt');
  await waitFor(() => checks >= 3, 'WXT must detect the SPA navigation and recheck access');
  document.querySelector('button').click();
  assert.ok(overlay(document));
  assert.equal(Object.keys(stored).length, 1, 'Detecting intent never logs a purchase');
});

test('late access responses cannot undo a manual activation or a newer revocation', async (t) => {
  const replies = [];
  const { document, message, messageAsync } = openPage(t, {
    content: true, url: productUrl, page: '<h1>Shirt</h1><button>Add to cart</button>',
    configure: (chrome) => { chrome.runtime.sendMessage = () => new Promise((resolve) => replies.push(resolve)); },
  });
  message({ type: 'shopping:open' });
  click(overlay(document), 'I’ll reconsider');
  replies.shift()({ enabled: false });
  await setTimeout(0);
  document.querySelector('button').click();
  assert.ok(overlay(document));
  const first = messageAsync({ type: 'shopping:refresh-access' });
  const second = messageAsync({ type: 'shopping:refresh-access' });
  replies[1]({ enabled: false });
  await second;
  replies[0]({ enabled: true });
  await first;
  document.querySelector('button').click();
  assert.equal(overlay(document), undefined);
});

test('shopping URL segments include Arc’teryx and common storefront paths without matching substrings or payment pages', async (t) => {
  // Nested control structure observed on the public Arc’teryx Sabre Jacket page.
  const button = '<div data-testid="add-to-cart-container"><button type="button" data-context="Add-To-Cart" data-testid="add-to-cart-button" aria-busy="false"><span><span><span>Add to cart</span></span></span></button></div>';
  const fixtures = [
    ['https://arcteryx.com/us/en/shop/mens/sabre-jacket-0691?intcmp=home_t1_c_mens_ski-snowboard', true],
    ...['shop', 'store', 'item', 'items', 'collection', 'collections', 'catalog', 'catalogue'].flatMap((segment) => [
      [`https://example.com/en/${segment}/jacket`, true],
      [`https://example.com/${segment}`, true],
    ]),
    ['https://example.com/en/SHOP/jacket', true],
    ['https://example.com/workshop/jacket', false],
    ['https://example.com/shopper/jacket', false],
    ['https://example.com/store-locator/jacket', false],
    ['https://shop.example.com/about?next=/shop/jacket#/store/jacket', false],
    ['https://example.com/shop/checkout', false],
    ['https://example.com/store/payment', false],
    ['https://example.com/shop/jacket#/checkout', false],
    ['https://payments.example.com/shop/jacket', false],
  ];
  for (const [url, expected] of fixtures) {
    const { document, stored } = openPage(t, { content: true, url, page: button, stored: prefs(), configure: (chrome) => { chrome.runtime.sendMessage = async () => ({ enabled: true }); } });
    await setTimeout(0);
    let reachedSite = false;
    document.querySelector('button').addEventListener('click', (event) => { reachedSite = true; event.preventDefault(); });
    document.querySelector('button span span span').click();
    assert.equal(!!overlay(document), expected, url);
    assert.equal(reachedSite, !expected, url);
    assert.equal(Object.keys(stored).length, 1, 'A detected click must not log a purchase');
  }
});

test('retailer detection needs exact wording and shopping context, and ignores payment forms and auctions', async (t) => {
  const fixtures = [
    ['https://www.ebay.com/itm/1234', '<a href="#"><span>Buy It Now</span></a>', true],
    ['https://www.ebay.com/itm/1234', '<button>Add to cart</button>', true],
    ['https://www.ebay.com/itm/1234', '<button>Place bid</button>', false],
    ['https://www.ebay.com/itm/1234', '<button>Make offer</button>', false],
    ['https://www.ebay.com/help/example', '<button>Buy It Now</button>', false],
    ['https://shop.example/about', '<button>Buy now</button>', false],
    ['https://shop.example/products/x', '<button>Buy now</button>', true],
    ['https://shop.example/products/x', '<button>Buy now and subscribe</button>', false],
    ['https://shop.example/products/x', '<button>Place order</button>', false],
    ['https://example.com/shop/jacket', '<button>Shop now</button>', false],
    ['https://example.com/store/jacket', '<button>Buy now and subscribe</button>', false],
    ['https://example.com/shop/jacket', '<button>Place order</button>', false],
    ['https://example.com/shop/jacket', '<button>Checkout</button>', false],
    ['https://example.com/shop/jacket', '<form><input autocomplete="cc-number"><button>Add to cart</button></form>', false],
    ['https://shop.example/cart', '<button>Proceed to checkout</button>', true],
    ['https://shop.example/about', '<button>Checkout</button>', false],
    ['https://shop.example/', '<form action="/cart/add"><button>Add to cart</button></form>', true],
    ['https://shop.example/tennis-racket', '<div itemtype="https://schema.org/Product"><button>Add to bag</button></div>', true],
    ['https://shop.example/products/x', '<form><input autocomplete="cc-number"><button>Buy now</button></form>', false],
    ['https://shop.example/checkout', '<button>Buy now</button>', false],
    ['https://checkout.shop.example/products/x', '<button>Buy now</button>', false],
  ];
  for (const [url, page, expected] of fixtures) {
    const { document } = openPage(t, { content: true, url, page, configure: (chrome) => { chrome.runtime.sendMessage = async () => ({ enabled: true }); } });
    await setTimeout(0);
    let reachedSite = false;
    const button = document.querySelector('button, a');
    button.addEventListener('click', (event) => { reachedSite = true; event.preventDefault(); });
    (button.querySelector('span') ?? button).click();
    assert.equal(!!overlay(document), expected, `${url}: ${page}`);
    assert.equal(reachedSite, !expected);
  }
});
