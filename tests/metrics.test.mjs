import assert from 'node:assert/strict';
import test from 'node:test';
import { monthlyMetrics, projectedMetrics } from '../lib/metrics.ts';

// Exercise calendar boundaries in a non-UTC locale, independent of the test runner's machine.
process.env.TZ = 'America/Los_Angeles';
const now = new Date(2026, 9, 9, 12);
const purchase = (amountCents, confirmedAt = now.toISOString()) => ({
  id: '12345678-1234-1234-1234-123456789abc', title: 'Test item', site: 'example.com', action: 'buy-now', amountCents, confirmedAt,
});

test('monthly totals use integer cents and local month/year boundaries', () => {
  const result = monthlyMetrics([
    purchase(10), purchase(20),
    purchase(100, '2026-10-01T07:00:00Z'), // Local October 1.
    purchase(200, '2026-11-01T06:59:59Z'), // Still October locally.
    purchase(90000, '2026-10-01T06:59:59Z'), // Local September 30.
    purchase(90000, '2026-11-01T07:00:00Z'),
    purchase(90000, new Date(2025, 9, 9).toISOString()),
  ], 10, now);
  assert.equal(result.totalCents, 330);
  assert.equal(result.count, 4);
  assert.equal(result.incomeIncreaseCents, 1000);
  assert.equal(result.incomeSharePercent, 33);
});

test('reaction thresholds use the unrounded ratio and never cap actual percentages', () => {
  for (const [cents, percent, mood] of [
    [0, 0, 'happy'], [39999, 49.99875, 'happy'], [40000, 50, 'questionable'],
    [79999, 99.99875, 'questionable'], [80000, 100, 'sad'], [120000, 150, 'sad'],
  ]) {
    const result = monthlyMetrics([purchase(cents)], 800, now);
    assert.ok(Math.abs(result.incomeSharePercent - percent) < 0.000001);
    assert.equal(result.mood, mood);
  }
});

test('missing, invalid, or sub-cent income never produces invalid percentages or a dollar-based judgment', () => {
  for (const income of [null, 0, -800, NaN, Infinity, 0.001, Number.MAX_VALUE]) {
    const result = monthlyMetrics([purchase(1000000)], income, now);
    assert.equal(result.totalCents, 1000000);
    assert.equal(result.incomeSharePercent, null);
    assert.equal(result.incomeIncreaseCents, null);
    assert.equal(result.mood, 'questionable');
  }
});

test('a new month with income set is happy at zero percent, not evidence of saving money', () => {
  const result = monthlyMetrics([purchase(120000)], 800, new Date(2026, 10, 1));
  assert.equal(result.totalCents, 0);
  assert.equal(result.count, 0);
  assert.equal(result.incomeSharePercent, 0);
  assert.equal(result.mood, 'happy');
});

test('purchase projections share exact mood thresholds without modifying actual totals', () => {
  const current = monthlyMetrics([purchase(32000)], 800, now);
  for (const [cents, share, mood] of [[0, 40, 'happy'], [7999, 49.99875, 'happy'], [8000, 50, 'questionable'], [48000, 100, 'sad'], [88000, 150, 'sad']]) {
    const projected = projectedMetrics(current, cents);
    assert.equal(projected.totalCents, 32000 + cents);
    assert.ok(Math.abs(projected.incomeSharePercent - share) < 0.000001);
    assert.equal(projected.mood, mood);
  }
  assert.equal(current.totalCents, 32000);
  assert.equal(current.mood, 'happy');
  assert.deepEqual(projectedMetrics(current, null), { totalCents: null, incomeSharePercent: null, mood: 'questionable' });
  assert.deepEqual(projectedMetrics(monthlyMetrics([], null, now), 14000), { totalCents: 14000, incomeSharePercent: null, mood: 'questionable' });
});
