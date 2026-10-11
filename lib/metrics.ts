import type { Purchase } from './shopping';

/** A comedic reaction to a comparison, never a financial-health rating. */
export type ProfessorMood = 'happy' | 'questionable' | 'sad';
export type ComparisonType = 'income-increase' | 'shopping-budget';

/** Derived from logged purchases only; monetary calculations stay in integer cents. */
export interface MonthlyMetrics {
  totalCents: number;
  count: number;
  incomeIncreaseCents: number | null;
  incomeSharePercent: number | null;
  mood: ProfessorMood;
}

/** Compare this local calendar month's records with the optional monthly income increase. */
export function monthlyMetrics(purchases: readonly Purchase[], comparisonAmount: number | null, now = new Date()): MonthlyMetrics {
  const monthly = purchases.filter((purchase) => {
    const date = new Date(purchase.confirmedAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const totalCents = monthly.reduce((total, purchase) => total + purchase.amountCents, 0);
  const cents = comparisonAmount === null ? 0 : Math.round(comparisonAmount * 100);
  const incomeIncreaseCents = Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  const incomeSharePercent = incomeIncreaseCents === null ? null : totalCents / incomeIncreaseCents * 100;
  // Product-defined comedy thresholds, not a budget or evidence of lifestyle inflation.
  const mood = moodForShare(incomeSharePercent);
  return { totalCents, count: monthly.length, incomeIncreaseCents, incomeSharePercent, mood };
}

/** Preview a one-time addition without creating a purchase or changing saved totals. */
export function projectedMetrics(current: MonthlyMetrics, amountCents: number | null) {
  const totalCents = amountCents === null ? null : current.totalCents + amountCents;
  const incomeSharePercent = totalCents === null || current.incomeIncreaseCents === null ? null
    : totalCents / current.incomeIncreaseCents * 100;
  return { totalCents, incomeSharePercent, mood: moodForShare(incomeSharePercent) };
}

function moodForShare(percentage: number | null): ProfessorMood {
  return percentage === null ? 'questionable'
    : percentage >= 100 ? 'sad' : percentage >= 50 ? 'questionable' : 'happy';
}
