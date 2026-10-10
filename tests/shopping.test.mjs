import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { parseAmount, isPaymentPage } from '../lib/shopping.ts';
import { openPage, click, fill, waitFor, waitForText, overlay } from './helpers.mjs';

// Synthetic retailer markup. Live checkout execution is deliberately not part of these tests.
const product = `<h1 id="productTitle">Test headphones</h1>
  <div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">$140.00</span></span>
  <span class="a-price a-text-price"><span class="a-offscreen">$199.99</span></span></div>
  <select name="quantity"><option value="2" selected>2</option></select>
  <button id="add-to-cart-button"><span>Add to Cart</span></button>
  <button id="buy-now-button">Buy Now</button><button>Place your order</button>`;
const prefs = () => ({ onboarding: { situation: 'raise', monthlyIncomeIncrease: 800, trackingEnabled: true } });

test('Amazon nested click pauses, uses item price and quantity, and reconsiders without buying', async (t) => {
  const { document, stored } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  let retailerClicks = 0;
  const button = document.querySelector('#add-to-cart-button');
  button.addEventListener('click', () => retailerClicks++);
  button.querySelector('span').click();
  assert.equal(retailerClicks, 0);
  const root = overlay(document);
  assert.equal(document.querySelector('bruhim-broke').shadowRoot, null);
  assert.ok(root.querySelector('dialog[open]'));
  assert.equal(root.querySelectorAll('input')[1].value, '280.00');
  await waitForText(root, '35% of your reported monthly income increase');
  assert.equal(Object.keys(stored).length, 1);
  click(root, 'I’ll reconsider');
  assert.equal(overlay(document), undefined);
  assert.equal(retailerClicks, 0);
});

test('final confirmation logs a purchase immediately and permits exactly one next site click', async (t) => {
  const { document, stored } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  let retailerClicks = 0;
  const button = document.querySelector('#buy-now-button');
  button.addEventListener('click', () => retailerClicks++);
  button.click();
  const root = overlay(document);
  click(root, 'I’m buying it anyway');
  await waitForText(root, 'RIP wallet. Log my purchase.');
  assert.equal(Object.keys(stored).length, 1, 'The first insist button must not log a purchase');
  click(root, 'RIP wallet. Log my purchase.');
  await waitFor(() => !overlay(document), 'Dialog should close after the purchase is saved');
  assert.equal(retailerClicks, 0);
  button.click();
  assert.equal(retailerClicks, 1);
  button.click();
  assert.equal(retailerClicks, 1);
  assert.ok(overlay(document));
  const purchases = Object.entries(stored).filter(([key]) => key.startsWith('purchase:'));
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0][1].amountCents, 28000);
  assert.ok(purchases[0][1].confirmedAt);
  assert.equal(Object.keys(stored).filter((key) => key.startsWith('reminder:')).length, 0);
  await waitForText(overlay(document), 'You recorded $280.00 this month.');
  const popup = openPage(t, { stored }).document;
  await waitForText(popup, '1 recorded.');
  click(popup, 'Delete entry');
  await waitForText(popup, 'Yes, delete entry');
  click(popup, 'Yes, delete entry');
  await waitForText(popup, '0 recorded.');
  assert.equal(stored[purchases[0][0]], undefined);
});

test('final confirmation waits for storage and converts an existing reminder without duplicates', async (t) => {
  const { document, window, stored } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  document.querySelector('#buy-now-button').click();
  const root = overlay(document);
  await waitForText(root, 'Remind me to confirm later');
  click(root, 'Remind me to confirm later');
  await waitForText(root, 'Reminder saved.');
  const reminderId = Object.values(stored).find((entry) => entry.id).id;
  await fill(root, 'What are you considering?', 'Corrected headphones');
  await fill(root, 'Estimated total (USD)', '123.45');
  const set = window.chrome.storage.local.set;
  let release;
  window.chrome.storage.local.set = (items) => new Promise((resolve) => { release = () => resolve(set(items)); });
  click(root, 'I’m buying it anyway');
  await waitForText(root, 'RIP wallet. Log my purchase.');
  click(root, 'RIP wallet. Log my purchase.');
  await waitFor(() => release, 'Expected a pending storage write');
  assert.ok(overlay(document), 'Dialog must stay until the write finishes');
  release();
  await waitFor(() => !overlay(document), 'Dialog should close after saving');
  const purchases = Object.entries(stored).filter(([key]) => key.startsWith('purchase:'));
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0][1].title, 'Corrected headphones');
  assert.equal(purchases[0][1].amountCents, 12345);
  assert.equal(purchases[0][1].id, reminderId);
  assert.ok(purchases[0][1].confirmedAt);
  assert.equal(stored[`reminder:${reminderId}`], undefined);
});

test('failed automatic logging offers retry or an explicit continue-without-saving escape', async (t) => {
  const { document, window, stored } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  window.chrome.storage.local.set = () => Promise.reject(new Error('Storage unavailable'));
  document.querySelector('#buy-now-button').click();
  const root = overlay(document);
  click(root, 'I’m buying it anyway');
  await waitForText(root, 'RIP wallet. Log my purchase.');
  click(root, 'RIP wallet. Log my purchase.');
  await waitForText(root, 'Could not finish saving this purchase.');
  assert.ok(overlay(document));
  assert.equal(Object.keys(stored).length, 1);
  click(root, 'Continue without saving');
  assert.equal(overlay(document), undefined);
});

test('dismissing during a pending save does not later bypass the next intervention', async (t) => {
  const { document, window } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  const set = window.chrome.storage.local.set;
  let release;
  window.chrome.storage.local.set = (items) => new Promise((resolve) => { release = () => resolve(set(items)); });
  const button = document.querySelector('#buy-now-button');
  button.click();
  const root = overlay(document);
  click(root, 'I’m buying it anyway');
  await waitForText(root, 'RIP wallet. Log my purchase.');
  click(root, 'RIP wallet. Log my purchase.');
  await waitFor(() => release, 'Expected a pending save');
  click(root, 'I’ll reconsider');
  assert.equal(overlay(document), undefined);
  release();
  await setTimeout(20);
  button.click();
  assert.ok(overlay(document), 'A dismissed dialog must not arm a later bypass');
});

test('unknown prices require a total to log, while opting out or continuing without saving records nothing', async (t) => {
  for (const trackingEnabled of [true, false]) {
    const stored = { onboarding: { trackingEnabled } };
    const { document } = openPage(t, { page: '<h1>Unknown price</h1><button id="buy-now-button">Buy Now</button>', url: 'https://www.amazon.com/dp/TEST', content: true, stored });
    document.querySelector('button').click();
    const root = overlay(document);
    click(root, 'I’m buying it anyway');
    await waitForText(root, trackingEnabled ? 'Enter a valid USD total to log this purchase' : 'Tracking is off.');
    if (trackingEnabled) {
      assert.equal([...root.querySelectorAll('button')].find((button) => button.textContent === 'RIP wallet. Log my purchase.').disabled, true);
      click(root, 'Continue without saving');
    } else {
      click(root, 'RIP wallet. I’m buying it.');
    }
    await waitFor(() => !overlay(document), 'Dialog should close');
    assert.equal(Object.keys(stored).length, 1);
  }
});

test('a corrected unknown price can be logged immediately without a second popup confirmation', async (t) => {
  const { document, stored } = openPage(t, { page: '<h1>Unknown price</h1><button id="buy-now-button">Buy Now</button>', url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  document.querySelector('button').click();
  const root = overlay(document);
  click(root, 'I’m buying it anyway');
  await waitForText(root, 'Enter a valid USD total to log this purchase');
  await fill(root, 'Estimated total (USD)', '-5');
  assert.equal([...root.querySelectorAll('button')].find((button) => button.textContent === 'RIP wallet. Log my purchase.').disabled, true);
  await fill(root, 'Estimated total (USD)', '19.99');
  click(root, 'RIP wallet. Log my purchase.');
  await waitFor(() => !overlay(document), 'Confirmation should finish');
  const purchase = Object.values(stored).find((entry) => entry.confirmedAt);
  assert.equal(purchase.amountCents, 1999);
});

test('retrying a partial save keeps one purchase and removes the old reminder', async (t) => {
  const { document, window, stored } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored: prefs() });
  document.querySelector('#buy-now-button').click();
  const root = overlay(document);
  await waitForText(root, 'Remind me to confirm later');
  click(root, 'Remind me to confirm later');
  await waitForText(root, 'Reminder saved.');
  const remove = window.chrome.storage.local.remove;
  window.chrome.storage.local.remove = () => Promise.reject(new Error('Storage unavailable'));
  click(root, 'I’m buying it anyway');
  await waitForText(root, 'RIP wallet. Log my purchase.');
  click(root, 'RIP wallet. Log my purchase.');
  await waitForText(root, 'Could not finish saving this purchase.');
  window.chrome.storage.local.remove = remove;
  click(root, 'RIP wallet. Log my purchase.');
  await waitFor(() => !overlay(document), 'Retry should finish');
  assert.equal(Object.keys(stored).filter((key) => key.startsWith('purchase:')).length, 1);
  assert.equal(Object.keys(stored).filter((key) => key.startsWith('reminder:')).length, 0);
});

test('reminder is separate until explicit purchase confirmation, including after reopening', async (t) => {
  const stored = prefs();
  const { document } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored });
  document.querySelector('#add-to-cart-button').click();
  const root = overlay(document);
  await waitForText(root, 'Remind me to confirm later');
  click(root, 'Remind me to confirm later');
  await waitForText(root, 'Reminder saved. No purchase has been recorded.');
  assert.equal(Object.keys(stored).filter((key) => key.startsWith('purchase:')).length, 0);
  assert.equal(Object.keys(stored).filter((key) => key.startsWith('reminder:')).length, 1);
  const popup = openPage(t, { stored }).document;
  await waitForText(popup, 'I bought it');
  click(popup, 'I bought it');
  await waitForText(popup, '1 recorded.');
  assert.equal(Object.keys(stored).filter((key) => key.startsWith('reminder:')).length, 0);
  assert.equal(Object.values(stored).find((value) => value.confirmedAt)?.amountCents, 28000);
  const reopened = openPage(t, { stored }).document;
  await waitForText(reopened, '1 recorded.');
});

test('tracking off hides reminder saving; unknown price has a manual fallback', async (t) => {
  const stored = { onboarding: { trackingEnabled: false } };
  const { document } = openPage(t, { page: '<h1>Something</h1><button id="buy-now-button">Buy Now</button>', url: 'https://www.amazon.com/dp/TEST', content: true, stored });
  document.querySelector('button').click();
  const root = overlay(document);
  await waitForText(root, 'Enter the estimated total');
  assert.equal(root.querySelectorAll('input')[1].value, '');
  assert.ok(!root.textContent.includes('Remind me to confirm later'));
  const input = root.querySelectorAll('input')[1];
  const window = document.defaultView;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '12.34');
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitForText(root, 'A single purchase does not establish a spending trend.');
});

test('generic pages require manual activation, support dynamic buttons, and reject foreign messages', async (t) => {
  const { document, message } = openPage(t, { page: '<h1>Shirt</h1><button>Add to cart</button>', url: 'https://example.com/products/shirt', content: true });
  document.querySelector('button').click();
  assert.equal(overlay(document), undefined);
  message({ type: 'shopping:open' }, { id: 'another-extension' });
  assert.equal(overlay(document), undefined);
  assert.equal(message({ type: 'shopping:open' }).ok, true);
  click(overlay(document), 'I’ll reconsider');
  const button = document.createElement('button');
  button.textContent = 'Buy it now';
  document.body.append(button);
  button.click();
  assert.ok(overlay(document));
});

test('cart intent uses subtotal, not an unrelated recommended product price', (t) => {
  const { document } = openPage(t, { page: '<div id="sc-subtotal-amount-activecart"><span class="sc-price">$350.00</span></div><span class="a-offscreen">$9.99</span><button name="proceedToRetailCheckout">Proceed to checkout</button>', url: 'https://www.amazon.com/gp/cart/view.html', content: true });
  document.querySelector('button').click();
  assert.equal(overlay(document).querySelectorAll('input')[1].value, '350.00');
});

test('payment pages, final-order buttons, modified clicks, and disabled buttons pass untouched', (t) => {
  for (const path of ['/gp/buy/spc/handlers/display.html', '/checkout', '/orders/confirm']) {
    const { document, message } = openPage(t, { page: product, url: `https://www.amazon.com${path}`, content: true });
    document.querySelector('#buy-now-button').click();
    assert.equal(overlay(document), undefined);
    assert.ok(message({ type: 'shopping:open' }).error);
  }
  const { document, window } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true });
  [...document.querySelectorAll('button')].at(-1).click();
  const buy = document.querySelector('#buy-now-button');
  buy.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  buy.disabled = true;
  buy.click();
  assert.equal(overlay(document), undefined);
});

test('storage failure still permits dismissal and continuation', async (t) => {
  const { document } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, storageError: true });
  document.querySelector('#add-to-cart-button').click();
  const root = overlay(document);
  await waitForText(root, 'Could not read your preferences');
  click(root, 'I’ll reconsider');
  assert.equal(overlay(document), undefined);
});

test('Escape cancels without triggering the original purchase action', (t) => {
  const { document, window } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true });
  document.querySelector('#buy-now-button').click();
  overlay(document).querySelector('dialog').dispatchEvent(new window.Event('cancel', { cancelable: true }));
  assert.equal(overlay(document), undefined);
});

test('money parsing rejects ambiguous currencies, malformed numbers, and impossible values', () => {
  assert.equal(parseAmount('$1,234.56'), 123456);
  assert.equal(parseAmount('0'), 0);
  for (const value of ['', '-12', 'NaN', 'Infinity', '1e3', '12.345', '12,50', '€15', 'CA$15', '1.234,56', '$14 - $18', '9999999999999']) assert.equal(parseAmount(value), null, value);
  assert.equal(isPaymentPage(new URL('https://example.com/products/checkout-shirt')), false);
});

test('recommendation buttons never borrow the main Amazon product price', (t) => {
  const { document } = openPage(t, { page: product + '<button id="recommendation">Add to Cart</button>', url: 'https://www.amazon.com/dp/TEST', content: true });
  document.querySelector('#recommendation').click();
  assert.equal(overlay(document), undefined);
});

test('conflicting offer prices require manual entry; hidden prices are excluded', (t) => {
  for (const hidden of [false, true]) {
    const price = `<div id="corePrice_feature_div" ${hidden ? 'style="display:none"' : ''}><span class="a-price"><span class="a-offscreen">$100.00</span></span></div>`;
    const { document } = openPage(t, { page: product + price, url: 'https://www.amazon.com/dp/TEST', content: true });
    document.querySelector('#buy-now-button').click();
    assert.equal(overlay(document).querySelectorAll('input')[1].value, hidden ? '280.00' : '');
  }
});

test('confirmed monthly spending is used, while reminders are excluded', async (t) => {
  const stored = prefs();
  const item = { id: '12345678-1234-1234-1234-123456789abc', site: 'www.amazon.com', title: 'Already bought', action: 'add-to-cart', amountCents: 10000, confirmedAt: new Date().toISOString() };
  stored[`purchase:${item.id}`] = item;
  stored['reminder:other'] = { ...item, id: '12345678-1234-1234-1234-123456789abd', amountCents: 90000 };
  const { document } = openPage(t, { page: product, url: 'https://www.amazon.com/dp/TEST', content: true, stored });
  document.querySelector('#buy-now-button').click();
  await waitForText(overlay(document), 'You recorded $100.00 this month. If purchased and recorded, this would bring it to $380.00.');
});

test('manual checks work when crypto.randomUUID is unavailable on HTTP', (t) => {
  const { document, window, message } = openPage(t, { page: '<h1>HTTP storefront</h1>', url: 'http://example.com/products/test', content: true });
  Object.defineProperty(window.crypto, 'randomUUID', { value: undefined });
  assert.equal(message({ type: 'shopping:open' }).ok, true);
  assert.ok(overlay(document));
});
