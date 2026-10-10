import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { openPage, waitForText, click } from './helpers.mjs';

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
  await waitForText(document, 'Your wallet is on standby.');
  assert.equal(stored.onboarding.situation, 'raise');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, null);

  const reopened = openPopup(t, stored);
  await waitForText(reopened, 'Your wallet is on standby.');
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
  await waitForText(document, 'Tracking is off.');
  assert.equal(stored.onboarding.trackingEnabled, false);
});
