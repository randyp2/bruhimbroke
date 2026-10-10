import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { openPage, openHistory, waitFor, waitForText, click } from './helpers.mjs';

function openPopup(t, stored = {}) {
  return openPage(t, { stored }).document;
}

test('fresh storage opens onboarding, saves setup, and restores it on reopening', async (t) => {
  const stored = {};
  const document = openPopup(t, stored);
  await waitForText(document, 'Did your money situation change?');
  assert.equal(document.querySelector('.loading'), null);

  click(document, 'I got a raise');
  await setTimeout(20);
  click(document, 'Continue');
  await waitForText(document, 'How much did your monthly take-home income increase?');
  click(document, 'Skip for now');
  await waitForText(document, 'Want help spotting the pattern?');
  click(document, 'Finish setup');
  await waitForText(document, 'History & tools');
  assert.equal(document.querySelector('.home-tools').open, false);
  assert.equal(stored.onboarding.situation, 'raise');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, null);

  const reopened = openPopup(t, stored);
  await waitForText(reopened, 'History & tools');
  assert.equal(reopened.querySelector('.onboarding-shell'), null);
});

test('skip tracking persists false instead of the previous enabled state', async (t) => {
  const stored = {};
  const document = openPopup(t, stored);
  await waitForText(document, 'Did your money situation change?');
  click(document, 'No major change');
  await setTimeout(20);
  click(document, 'Continue');
  await waitForText(document, 'Skip for now');
  click(document, 'Skip for now');
  await waitForText(document, 'Skip tracking');
  click(document, 'Skip tracking');
  await openHistory(document);
  await waitForText(document, 'Tracking is off.');
  assert.equal(stored.onboarding.trackingEnabled, false);
});

test('minimal menu previews all three expressions without changing data and keeps tools reachable', async (t) => {
  const stored = { onboarding: { trackingEnabled: true } };
  const original = JSON.stringify(stored);
  const { document, window } = openPage(t, { stored });
  await waitForText(document, 'History & tools');
  assert.ok(document.querySelector('.home-shell'));
  assert.equal(document.querySelector('.home-tools').open, false);
  assert.equal(document.querySelector('.professor-sprite:not([hidden])').alt, 'Happy professor');
  for (const mood of ['questionable', 'sad', 'happy']) {
    const button = document.querySelector(`[aria-label="Preview ${mood} professor"]`);
    button.click();
    await waitFor(() => button.getAttribute('aria-pressed') === 'true', 'Expression should switch');
    assert.equal(document.querySelectorAll('.professor-sprite:not([hidden])').length, 1);
    assert.equal(document.querySelector('.professor-sprite:not([hidden])').alt.toLowerCase(), `${mood} professor`);
  }
  await openHistory(document);
  await waitForText(document, 'Check this page');
  const details = document.querySelector('.home-tools');
  details.querySelector('summary').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(details.open, false);
  assert.equal(document.activeElement, details.querySelector('summary'));
  assert.equal(JSON.stringify(stored), original);
});
