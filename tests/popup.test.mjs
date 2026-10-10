import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const output = new URL('../.output/chrome-mv3/', import.meta.url);
const html = readFileSync(new URL('popup.html', output), 'utf8');
const scriptPath = html.match(/src="([^"]+\.js)"/)[1];
const script = readFileSync(new URL(scriptPath.replace(/^\//, ''), output), 'utf8');

function openPopup(t, stored = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://popup.test/' });
  t.after(() => dom.window.close());
  dom.window.chrome = {
    runtime: {},
    storage: {
      local: {
        get(key, callback) {
          dom.window.queueMicrotask(() => callback(stored));
        },
        set(items, callback) {
          Object.assign(stored, items);
          dom.window.queueMicrotask(callback);
        },
      },
    },
  };
  dom.window.eval(script);
  return dom.window.document;
}

async function waitForText(document, text) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (document.body.textContent.includes(text)) return;
    await setTimeout(20);
  }
  assert.fail(`Expected "${text}"; popup showed: ${document.body.textContent}`);
}

function click(document, label) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  assert.ok(button, `Missing button: ${label}`);
  button.click();
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
  await waitForText(document, 'Hold on. We need to talk.');
  assert.equal(stored.onboarding.situation, 'raise');
  assert.equal(stored.onboarding.monthlyIncomeIncrease, null);

  const reopened = openPopup(t, stored);
  await waitForText(reopened, 'Hold on. We need to talk.');
  assert.equal(reopened.querySelector('.onboarding-shell'), null);
});
