import assert from 'node:assert/strict';
import test from 'node:test';
import { onboardingLines, professorLines } from '../lib/professorLines.ts';

test('onboarding has one distinct, compact line for each step', () => {
  assert.deepEqual(Object.keys(onboardingLines), ['1', '2', '3']);
  assert.equal(new Set(Object.values(onboardingLines)).size, 3);
  assert.ok(Object.values(onboardingLines).every(line => line.trim().length > 0 && line.length <= 85));
});

test('each professor mood has ten distinct, compact lines addressing the user', () => {
  assert.deepEqual(Object.keys(professorLines).sort(), ['happy', 'questionable', 'sad']);
  for (const lines of Object.values(professorLines)) {
    assert.equal(lines.length, 10);
    assert.ok(lines.every((line) => line.trim().length > 0 && line.length <= 85));
    assert.ok(lines.every((line) => /\byou(?:r)?\b/i.test(line)));
  }
  assert.equal(new Set(Object.values(professorLines).flat()).size, 30);
});
