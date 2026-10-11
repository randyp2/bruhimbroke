import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { openPage, openHistory, waitFor, waitForText, click, fill } from './helpers.mjs';
import { onboardingLines, professorLines } from '../lib/professorLines.ts';

function openPopup(t, stored = {}) {
  return openPage(t, { stored }).document;
}

test('closing for website permission restores the final onboarding step and choices', async (t) => {
  const stored = {};
  const page = openPage(t, { stored, configure: chrome => {
    chrome.permissions.request = () => {
      page.window.close();
      return new Promise(() => {});
    };
  } });
  await waitForText(page.document, 'Any money news?');
  click(page.document, 'Got a raise');
  await setTimeout(20);
  click(page.document, 'Continue');
  await waitForText(page.document, 'Monthly income boost?');
  await fill(page.document, '$', '800');
  await setTimeout(20);
  click(page.document, 'Continue');
  await waitForText(page.document, 'Enable automatic checks');
  page.document.querySelector('.tracking-choice').click();
  await setTimeout(20);
  click(page.document, 'Enable automatic checks');

  const reopened = openPopup(t, stored);
  await waitForText(reopened, 'Your call.');
  assert.equal(reopened.querySelector('.professor-bubble').textContent, onboardingLines[3]);
  assert.equal(reopened.querySelector('.tracking-choice').getAttribute('aria-pressed'), 'false');
  assert.equal(stored.onboarding, undefined, 'A draft must not count as completed setup');
  click(reopened, 'Finish setup');
  await waitForText(reopened, 'History & tools');
  assert.equal(stored.onboarding.situation, 'raise');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, 800);
  assert.equal(stored.onboarding.trackingEnabled, false);
  assert.equal(stored.onboardingDraft, null);
});

test('fresh storage opens onboarding, saves setup, and restores it on reopening', async (t) => {
  const stored = {};
  const document = openPopup(t, stored);
  await waitForText(document, 'Any money news?');
  assert.equal(document.querySelector('.loading'), null);
  assert.equal(document.querySelector('.professor-bubble').textContent, onboardingLines[1]);
  assert.ok(document.querySelector('.onboarding-shell.home-shell'));
  assert.equal(document.querySelector('.professor-sprite:not([hidden])').alt, 'Happy professor');
  assert.equal(document.querySelector('.onboarding-progress').getAttribute('aria-label'), 'Onboarding step 1 of 3');
  assert.equal([...document.querySelectorAll('button')].find(button => button.textContent === 'Continue').disabled, true);

  click(document, 'Got a raise');
  await setTimeout(20);
  click(document, 'Continue');
  await waitForText(document, 'Monthly income boost?');
  assert.equal(document.querySelector('.professor-bubble').textContent, onboardingLines[2]);
  click(document, 'Skip for now');
  await waitForText(document, 'Your call.');
  assert.equal(document.querySelector('.professor-bubble').textContent, onboardingLines[3]);
  click(document, 'Finish setup');
  await waitForText(document, 'History & tools');
  assert.equal(document.querySelector('.home-tools').open, false);
  assert.equal(stored.onboarding.situation, 'raise');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, null);

  const reopened = openPopup(t, stored);
  await waitForText(reopened, 'History & tools');
  assert.equal(reopened.querySelector('.onboarding-shell'), null);
});

test('onboarding restores each draft step, including income typed before continuing', async (t) => {
  const stored = {};
  let page = openPage(t, { stored });
  await waitForText(page.document, 'Any money news?');
  click(page.document, 'Things improved');
  await waitFor(() => stored.onboardingDraft?.situation === 'improved', 'Situation saved');
  page.window.close();
  page = openPage(t, { stored });
  await waitForText(page.document, 'Any money news?');
  assert.match(page.document.querySelector('.choice[aria-pressed="true"]').textContent, /Things improved/);
  click(page.document, 'Continue');
  await waitForText(page.document, 'Monthly income boost?');
  await fill(page.document, '$', '1250');
  await waitFor(() => stored.onboardingDraft?.monthlyIncomeIncrease === '1250', 'Income saved while typing');
  page.window.close();
  page = openPage(t, { stored });
  await waitForText(page.document, 'Monthly income boost?');
  assert.equal(page.document.querySelector('input').value, '1250');
  click(page.document, 'Skip for now');
  await waitForText(page.document, 'Enable automatic checks');
  page.window.close();
  page = openPage(t, { stored });
  await waitForText(page.document, 'Enable automatic checks');
  assert.equal(stored.onboardingDraft.monthlyIncomeIncrease, '');
  click(page.document, 'Finish setup');
  await waitForText(page.document, 'History & tools');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, null);
});

test('completed setup wins over stale drafts and malformed drafts cannot skip required choices', async (t) => {
  for (const draft of [42, { step: 7 }, { step: 3, situation: null, monthlyIncomeIncrease: '', trackingEnabled: true }]) {
    const document = openPopup(t, { onboardingDraft: draft });
    await waitForText(document, 'Any money news?');
    assert.equal([...document.querySelectorAll('button')].find(button => button.textContent === 'Continue').disabled, true);
  }
  const stored = { onboarding: { trackingEnabled: false }, onboardingDraft: { step: 2, situation: 'raise', monthlyIncomeIncrease: '800', trackingEnabled: true } };
  const original = JSON.stringify(stored);
  await waitForText(openPopup(t, stored), 'History & tools');
  assert.equal(JSON.stringify(stored), original);
});

test('failed draft reads preserve progress until the user retries', async (t) => {
  const stored = { onboardingDraft: { step: 3, situation: 'raise', monthlyIncomeIncrease: '800', trackingEnabled: false } };
  const original = JSON.stringify(stored);
  let fail = true;
  const { document } = openPage(t, { stored, configure: chrome => {
    const get = chrome.storage.local.get;
    chrome.storage.local.get = (keys, callback) => {
      if (!fail || !callback) return get(keys, callback);
      chrome.runtime.lastError = { message: 'Read failed' };
      callback({});
      delete chrome.runtime.lastError;
    };
  } });
  await waitForText(document, 'Couldn’t load your saved setup.');
  assert.equal(JSON.stringify(stored), original);
  fail = false;
  click(document, 'Retry');
  await waitForText(document, 'Enable automatic checks');
  assert.equal(document.querySelector('.tracking-choice').getAttribute('aria-pressed'), 'false');
});

test('website permission is unavailable until the final step is persisted', async (t) => {
  const stored = { onboardingDraft: { step: 2, situation: 'raise', monthlyIncomeIncrease: '800', trackingEnabled: true } };
  let commit;
  const { document } = openPage(t, { stored, configure: chrome => {
    const set = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (items.onboardingDraft?.step === 3) commit = () => set(items, callback);
      else set(items, callback);
    };
  } });
  await waitForText(document, 'Monthly income boost?');
  click(document, 'Continue');
  await waitFor(() => commit, 'Final step save requested');
  assert.equal(stored.onboardingDraft.step, 2);
  assert.ok(!document.querySelector('.site-access'));
  assert.equal([...document.querySelectorAll('button')].find(button => button.textContent === 'Finish setup').disabled, true);
  commit();
  await waitForText(document, 'Enable automatic checks');
  assert.equal(stored.onboardingDraft.step, 3);
});

test('failed draft or completion writes show recovery and keep the unfinished draft', async (t) => {
  const stored = { onboardingDraft: { step: 3, situation: 'raise', monthlyIncomeIncrease: '800', trackingEnabled: true } };
  let fail = true;
  const { document } = openPage(t, { stored, configure: chrome => {
    const set = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (!fail) return set(items, callback);
      chrome.runtime.lastError = { message: 'Save failed' };
      callback();
      delete chrome.runtime.lastError;
    };
  } });
  await waitForText(document, 'Couldn’t save setup.');
  assert.equal(stored.onboarding, undefined);
  assert.ok(!document.body.textContent.includes('Enable automatic checks'));
  fail = false;
  click(document, 'Retry save');
  await waitForText(document, 'Enable automatic checks');
  fail = true;
  click(document, 'Finish setup');
  await waitForText(document, 'Couldn’t save setup.');
  assert.equal(stored.onboarding, undefined);
  assert.equal(stored.onboardingDraft.step, 3);
  fail = false;
  click(document, 'Retry save');
  await waitForText(document, 'Enable automatic checks');
  click(document, 'Finish setup');
  await waitForText(document, 'History & tools');
  assert.equal(stored.onboardingDraft, null);
});

test('skip tracking persists false instead of the previous enabled state', async (t) => {
  const stored = {};
  const document = openPopup(t, stored);
  await waitForText(document, 'Any money news?');
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

test('onboarding saves entered income and toggled tracking without changing existing history', async (t) => {
  const purchase = { title: 'Existing purchase', amountCents: 12000 };
  const stored = { 'purchase:existing': purchase };
  const { document, window } = openPage(t, { stored });
  await waitForText(document, 'Any money news?');
  click(document, 'New, better-paying job');
  await setTimeout(20);
  click(document, 'Continue');
  await waitForText(document, 'Monthly income boost?');
  const input = document.querySelector('input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '800');
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await setTimeout(20);
  click(document, 'Continue');
  await waitForText(document, 'Your call.');
  document.querySelector('.tracking-choice').click();
  await waitFor(() => document.querySelector('.tracking-choice').getAttribute('aria-pressed') === 'false', 'Tracking can be turned off');
  click(document, 'Finish setup');
  await waitForText(document, 'History & tools');
  assert.equal(stored.onboarding.situation, 'new-job');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, 800);
  assert.equal(stored.onboarding.trackingEnabled, false);
  assert.deepEqual(stored['purchase:existing'], purchase);
});

test('empty dashboard stays neutral without changing data and keeps tools reachable', async (t) => {
  const stored = { onboarding: { trackingEnabled: true } };
  const original = JSON.stringify(stored);
  const { document, window } = openPage(t, { stored });
  await waitForText(document, 'History & tools');
  assert.ok(document.querySelector('.home-shell'));
  assert.equal(document.querySelector('.home-tools').open, false);
  await waitForText(document, 'No purchases logged this month.');
  assert.equal(document.querySelector('.professor-sprite:not([hidden])').alt, 'Questionable professor');
  assert.equal(document.querySelectorAll('.professor-sprite:not([hidden])').length, 1);
  assert.equal(document.querySelector('.professor-dialogue'), null);
  assert.ok(professorLines.questionable.includes(document.querySelector('.professor-bubble').textContent));
  assert.equal(document.querySelector('.summary-total dd').textContent, '$0.00');
  assert.equal(document.querySelector('.comparison-percent'), null);
  await openHistory(document);
  await waitForText(document, 'Check this page');
  const details = document.querySelector('.home-tools');
  details.querySelector('summary').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(details.open, false);
  assert.equal(document.activeElement, details.querySelector('summary'));
  assert.equal(JSON.stringify(stored), original);
});

const purchaseId = '12345678-1234-1234-1234-123456789abc';
const purchaseKey = `purchase:${purchaseId}`;
const record = (amountCents) => ({ id: purchaseId, title: 'Headphones', site: 'amazon.com', action: 'buy-now', amountCents, confirmedAt: new Date().toISOString() });

test('zero percent with income set shows a happy professor even without purchases', async (t) => {
  const { document } = openPage(t, { stored: { onboarding: { trackingEnabled: true, monthlyIncomeIncrease: 800 } } });
  await waitFor(() => document.querySelector('.comparison-percent')?.textContent === '0%', 'Expected a zero percent comparison');
  assert.equal(document.querySelector('.professor-sprite:not([hidden])').alt, 'Happy professor');
  assert.ok(professorLines.happy.includes(document.querySelector('.professor-bubble').textContent));
});

test('dashboard totals and all moods update live, including after editing and deleting', async (t) => {
  const stored = { onboarding: { trackingEnabled: true, monthlyIncomeIncrease: 800 }, [purchaseKey]: record(32000) };
  const { document, window } = openPage(t, { stored });
  await waitForText(document, 'Your shopping, lately.');
  await waitFor(() => document.querySelector('.comparison-percent')?.textContent === '40%', 'Expected 40%');
  assert.equal(document.querySelector('.summary-total dd').textContent, '$320.00');
  assert.equal(document.querySelector('.summary-count dd').textContent, '1');
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'happy');
  const happyLine = document.querySelector('.professor-bubble').textContent;
  assert.ok(professorLines.happy.includes(happyLine));
  await window.chrome.storage.local.set({ [purchaseKey]: record(33000) });
  await waitFor(() => document.querySelector('.summary-total dd')?.textContent === '$330.00', 'Same-mood totals must refresh');
  assert.equal(document.querySelector('.professor-bubble').textContent, happyLine);
  for (const [amountCents, percent, mood] of [[60000, '75%', 'questionable'], [120000, '150%', 'sad']]) {
    await window.chrome.storage.local.set({ [purchaseKey]: record(amountCents) });
    await waitFor(() => document.querySelector('.comparison-percent')?.textContent === percent, 'Metrics must refresh after storage changes');
    assert.equal(document.querySelector('.professor-stage').dataset.mood, mood);
    assert.ok(professorLines[mood].includes(document.querySelector('.professor-bubble').textContent));
  }
  assert.equal(document.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '100');
  assert.match(document.querySelector('[role="meter"]').getAttribute('aria-valuetext'), /150%/);
  await openHistory(document);
  click(document, 'Edit entry');
  await waitForText(document, 'Save changes');
  await fill(document, 'Amount (USD)', '160.00');
  click(document, 'Save changes');
  await waitFor(() => document.querySelector('.comparison-percent')?.textContent === '20%', 'Editing must update the dashboard');
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'happy');
  await waitFor(() => !document.querySelector('form'), 'Save should finish');
  click(document, 'Delete entry');
  await waitForText(document, 'Yes, delete entry');
  click(document, 'Yes, delete entry');
  await waitFor(() => document.querySelector('.summary-count dd')?.textContent === '0', 'Deletion must update the dashboard');
  assert.equal(document.querySelector('.summary-total dd').textContent, '$0.00');
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'happy');
});

test('dashboard excludes reminders, invalid data and other months, including after reopening', async (t) => {
  const old = new Date();
  old.setDate(1);
  old.setMonth(old.getMonth() - 1);
  const stored = {
    onboarding: { trackingEnabled: true, monthlyIncomeIncrease: 800 },
    [purchaseKey]: record(32000),
    'purchase:old': { ...record(90000), id: '12345678-1234-1234-1234-123456789abd', confirmedAt: old.toISOString() },
    'purchase:invalid': { ...record(90000), amountCents: -90000 },
    'reminder:unconfirmed': { ...record(90000), id: '12345678-1234-1234-1234-123456789abe' },
  };
  for (let open = 0; open < 2; open++) {
    const { document } = openPage(t, { stored });
    await waitFor(() => document.querySelector('.comparison-percent')?.textContent === '40%', 'Only valid current-month purchases count');
    assert.equal(document.querySelector('.summary-count dd').textContent, '1');
  }
});

test('tracking off preserves totals but uses a neutral expression', async (t) => {
  const { document } = openPage(t, { stored: { onboarding: { trackingEnabled: false, monthlyIncomeIncrease: 800 }, [purchaseKey]: record(120000) } });
  await waitForText(document, 'Only previously saved entries are shown.');
  assert.equal(document.querySelector('.summary-total dd').textContent, '$1,200.00');
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'questionable');
});

test('missing income still shows real totals without guessing a mood from their size', async (t) => {
  const { document } = openPage(t, { stored: { onboarding: { trackingEnabled: true }, [purchaseKey]: record(120000) } });
  await waitForText(document, 'No income comparison set');
  assert.equal(document.querySelector('.summary-total dd').textContent, '$1,200.00');
  assert.equal(document.querySelector('.comparison-percent'), null);
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'questionable');
});

test('failed storage reads show an error on the dashboard rather than misleading zero totals', async (t) => {
  const { document } = openPage(t, { stored: { onboarding: { trackingEnabled: true } }, storageError: true });
  await waitFor(() => document.querySelector('.spending-summary [role="alert"]'), 'The dashboard must expose the storage failure');
  assert.equal(document.querySelector('.summary-total'), null);
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'questionable');
});

test('a slower old storage response cannot roll back newer totals or the professor mood', async (t) => {
  const stored = { onboarding: { trackingEnabled: true, monthlyIncomeIncrease: 800 }, [purchaseKey]: record(32000) };
  const { document, window } = openPage(t, { stored });
  await waitFor(() => document.querySelector('.comparison-percent')?.textContent === '40%', 'Expected initial metrics');
  const pending = [];
  window.chrome.storage.local.get = () => {
    const snapshot = { ...stored };
    return new Promise((resolve) => pending.push(() => resolve(snapshot)));
  };
  await window.chrome.storage.local.set({ [purchaseKey]: record(60000) });
  await waitFor(() => pending.length === 1, 'Expected first refresh');
  await window.chrome.storage.local.set({ [purchaseKey]: record(120000) });
  await waitFor(() => pending.length === 2, 'Expected second refresh');
  pending[1]();
  await waitFor(() => document.querySelector('.comparison-percent')?.textContent === '150%', 'New response should render');
  pending[0]();
  await setTimeout(20);
  assert.equal(document.querySelector('.comparison-percent').textContent, '150%');
  assert.equal(document.querySelector('.professor-stage').dataset.mood, 'sad');
});
