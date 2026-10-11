import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage, openHistory, click, fill, waitFor, waitForText } from './helpers.mjs';

const id = '12345678-1234-1234-1234-123456789abc';
const reminderKey = `reminder:${id}`;
const purchaseKey = `purchase:${id}`;
const attempt = () => ({ id, title: 'Test headphones', site: 'www.amazon.com', action: 'buy-now', amountCents: 14000, continuedAt: new Date().toISOString() });
const history = (item = attempt()) => ({ onboarding: { trackingEnabled: true }, [reminderKey]: item });

test('history edits product, store, price and date, persists on reopening, and corrects both statuses', async (t) => {
  const stored = history();
  const { document } = openPage(t, { stored });
  await openHistory(document);
  await waitForText(document, 'Unconfirmed attempt');
  click(document, 'Edit entry');
  await waitForText(document, 'Save changes');
  await fill(document, 'Product', 'Corrected item');
  await fill(document, 'Website or store', 'Local shop');
  await fill(document, 'Amount (USD)', '99.95');
  await fill(document, 'Date', '2025-01-15');
  click(document, 'Save changes');
  await waitFor(() => !document.querySelector('form'), 'Editor should close after saving');
  assert.equal(stored[reminderKey].title, 'Corrected item');
  assert.equal(stored[reminderKey].site, 'Local shop');
  assert.equal(stored[reminderKey].amountCents, 9995);
  assert.equal(new Date(stored[reminderKey].continuedAt).getDate(), 15);
  assert.equal(stored[purchaseKey], undefined);

  const reopened = openPage(t, { stored }).document;
  await openHistory(reopened);
  await waitForText(reopened, 'Corrected item');
  await waitForText(reopened, '$99.95');
  assert.equal(reopened.querySelector('.history-entry time').dateTime, '2025-01-15');
  click(reopened, 'Edit entry');
  await waitForText(reopened, 'Save changes');
  await fill(reopened, 'Status', 'purchased');
  click(reopened, 'Save changes');
  await waitForText(reopened, '1 recorded.');
  assert.equal(stored[reminderKey], undefined);
  assert.equal(new Date(stored[purchaseKey].confirmedAt).getFullYear(), 2025);
  click(reopened, 'Edit entry');
  await waitForText(reopened, 'Save changes');
  await fill(reopened, 'Status', 'unconfirmed');
  click(reopened, 'Save changes');
  await waitForText(reopened, '0 recorded.');
  assert.equal(stored[purchaseKey], undefined);
  assert.equal(stored[reminderKey].confirmedAt, undefined);
});

test('unknown prices require manual entry before purchase confirmation', async (t) => {
  const stored = history({ ...attempt(), amountCents: null });
  const { document } = openPage(t, { stored });
  await openHistory(document);
  await waitForText(document, 'Amount unknown');
  click(document, 'I bought it');
  await waitForText(document, 'Save changes');
  assert.equal(document.querySelector('select').value, 'purchased');
  await fill(document, 'Amount (USD)', '-10');
  click(document, 'Save changes');
  await waitForText(document, 'Enter a valid USD amount');
  assert.equal(stored[purchaseKey], undefined);
  await fill(document, 'Amount (USD)', '42.50');
  click(document, 'Save changes');
  await waitForText(document, '1 recorded.');
  assert.equal(stored[purchaseKey].amountCents, 4250);
});

test('legacy reminders remain editable; cancelling edits or deletion leaves data intact', async (t) => {
  const item = attempt();
  delete item.continuedAt;
  const stored = history(item);
  const original = JSON.stringify(stored);
  const { document } = openPage(t, { stored });
  await openHistory(document);
  await waitForText(document, 'Date not recorded');
  click(document, 'Edit entry');
  await waitForText(document, 'Save changes');
  await fill(document, 'Product', 'Unsaved correction');
  click(document, 'Cancel editing');
  await waitForText(document, 'Delete entry');
  assert.equal(JSON.stringify(stored), original);
  click(document, 'Delete entry');
  await waitForText(document, 'Cancel deletion');
  click(document, 'Cancel deletion');
  await waitFor(() => !document.body.textContent.includes('Cancel deletion'), 'Deletion should cancel');
  assert.equal(JSON.stringify(stored), original);
  click(document, 'Delete entry');
  await waitForText(document, 'Yes, delete entry');
  click(document, 'Yes, delete entry');
  await waitForText(document, 'Your history is clear.');
  assert.equal(stored[reminderKey], undefined);
  assert.ok(stored.onboarding);
});

test('failed corrections and deletion preserve the existing record and show an error', async (t) => {
  const stored = history();
  const original = JSON.stringify(stored);
  const { document, window } = openPage(t, { stored });
  await openHistory(document);
  window.chrome.storage.local.set = () => Promise.reject(new Error('Storage unavailable'));
  window.chrome.storage.local.remove = () => Promise.reject(new Error('Storage unavailable'));
  await waitForText(document, 'Edit entry');
  click(document, 'Edit entry');
  await waitForText(document, 'Save changes');
  await fill(document, 'Status', 'purchased');
  click(document, 'Save changes');
  await waitForText(document, 'Could not save changes. Please try again.');
  assert.equal(JSON.stringify(stored), original);
  click(document, 'Cancel editing');
  await waitForText(document, 'Delete entry');
  click(document, 'Delete entry');
  await waitForText(document, 'Yes, delete entry');
  click(document, 'Yes, delete entry');
  await waitForText(document, 'Could not delete this entry.');
  assert.equal(JSON.stringify(stored), original);
});

test('tracking opt-out permits corrections and removal of old entries but not new confirmations', async (t) => {
  const stored = history();
  stored.onboarding.trackingEnabled = false;
  const { document } = openPage(t, { stored });
  await openHistory(document);
  await waitForText(document, 'Tracking is off.');
  assert.equal([...document.querySelectorAll('button')].find((button) => button.textContent === 'I bought it').disabled, true);
  click(document, 'Edit entry');
  await waitForText(document, 'Save changes');
  assert.equal(document.querySelector('option[value="purchased"]').disabled, true);
  await fill(document, 'Product', 'Corrected while tracking is off');
  click(document, 'Save changes');
  await waitFor(() => !document.querySelector('form'), 'Editor should close');
  assert.equal(stored[reminderKey].title, 'Corrected while tracking is off');
});

test('the X closes history without saving or discarding an unfinished edit', async (t) => {
  const stored = history();
  const original = JSON.stringify(stored);
  const { document } = openPage(t, { stored });
  await openHistory(document);
  await waitForText(document, 'Edit entry');
  click(document, 'Edit entry');
  await waitForText(document, 'Save changes');
  await fill(document, 'Product', 'Unfinished correction');
  document.querySelector('.history-close-label').click();
  assert.equal(document.querySelector('.home-tools').open, false);
  assert.equal(JSON.stringify(stored), original);
  await openHistory(document);
  assert.equal(document.querySelector('.history-editor input').value, 'Unfinished correction');
  click(document, 'Cancel editing');
  await waitFor(() => !document.querySelector('form'), 'Cancel should close the editor');
  assert.equal(JSON.stringify(stored), original);
});

test('the compact page-check action still reaches the active retailer without altering history', async (t) => {
  const stored = history();
  const original = JSON.stringify(stored);
  const { document, window } = openPage(t, { stored });
  let sent;
  let closed = false;
  window.chrome.tabs = {
    async query() { return [{ id: 17, url: 'https://example.com/products/test' }]; },
    async sendMessage(tabId, message) { sent = { tabId, type: message.type }; return { ok: true }; },
  };
  const close = window.close.bind(window);
  window.close = () => { closed = true; };
  t.after(close);
  await openHistory(document);
  click(document, 'Check this page');
  await waitFor(() => closed, 'Successful activation should close the popup');
  assert.deepEqual(sent, { tabId: 17, type: 'shopping:open' });
  assert.equal(JSON.stringify(stored), original);
});
