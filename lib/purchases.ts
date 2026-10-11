import { browser } from 'wxt/browser';
import { isIntent, isPurchase } from './shopping';
import type { Purchase, PurchaseIntent } from './shopping';
import { monthlyMetrics } from './metrics';

/** Individual keys avoid lost updates when multiple shopping tabs save at once. */
export async function shoppingData() {
  const stored = await browser.storage.local.get(null);
  const purchases = Object.entries(stored).filter(([key, value]) => key.startsWith('purchase:') && isPurchase(value)).map(([, value]) => value as Purchase);
  const reminders = Object.entries(stored).filter(([key, value]) => key.startsWith('reminder:') && isIntent(value)).map(([, value]) => value as PurchaseIntent)
    .filter((item) => !purchases.some((purchase) => purchase.id === item.id));
  const preferences = stored.onboarding && typeof stored.onboarding === 'object' ? stored.onboarding as Record<string, unknown> : {};
  return {
    purchases,
    reminders,
    trackingEnabled: preferences?.trackingEnabled === true,
    incomeIncrease: typeof preferences?.monthlyIncomeIncrease === 'number' && Number.isFinite(preferences.monthlyIncomeIncrease) && preferences.monthlyIncomeIncrease > 0 ? preferences.monthlyIncomeIncrease : null,
  };
}

/** Explicitly requested reminder only. This is never included in spending totals. */
export async function saveReminder(intent: PurchaseIntent): Promise<void> {
  if (!isIntent(intent)) throw new Error('Please check the purchase details.');
  if (!(await shoppingData()).trackingEnabled) throw new Error('Purchase tracking is off.');
  await browser.storage.local.set({ [`reminder:${intent.id}`]: { ...intent, recordedAt: intent.recordedAt ?? new Date().toISOString() } });
}

/** The final buy-and-log choice counts as confirmation, not verified checkout completion. */
export async function recordContinuation(intent: PurchaseIntent): Promise<boolean> {
  if (!isIntent(intent)) throw new Error('Please check the purchase details.');
  if (!(await shoppingData()).trackingEnabled) return false;
  if (intent.amountCents === null) throw new Error('Enter a valid USD total to log this purchase.');
  await confirmPurchase({ ...intent, continuedAt: new Date().toISOString() }, intent.amountCents);
  return true;
}

/** Only explicit confirmation creates a purchase record; the intent ID prevents duplicate entries. */
export async function confirmPurchase(intent: PurchaseIntent, amountCents: number): Promise<void> {
  const purchase: Purchase = { ...intent, amountCents, confirmedAt: new Date().toISOString() };
  if (!isPurchase(purchase)) throw new Error('Enter a valid purchase amount in USD.');
  if (!(await shoppingData()).trackingEnabled) throw new Error('Purchase tracking is off.');
  await browser.storage.local.set({ [`purchase:${intent.id}`]: purchase });
  await browser.storage.local.remove(`reminder:${intent.id}`);
}

/** Local calendar date used by the history editor and monthly spending totals. */
export function historyDate(intent: PurchaseIntent | Purchase): string {
  const timestamp = isPurchase(intent) ? intent.confirmedAt : intent.continuedAt ?? intent.recordedAt;
  const date = timestamp ? new Date(timestamp) : new Date();
  return localDate(date);
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Apply manual corrections without counting unconfirmed attempts as spending. */
export async function updateHistory(intent: PurchaseIntent | Purchase, purchased: boolean, date: string): Promise<void> {
  if (!isIntent(intent) || !intent.title.trim() || !intent.site.trim()) throw new Error('Enter a product and website or store.');
  if (purchased && intent.amountCents === null) throw new Error('Enter the amount paid before confirming a purchase.');
  if (purchased && !isPurchase(intent) && !(await shoppingData()).trackingEnabled) throw new Error('Enable tracking before confirming a purchase.');
  const parsedDate = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || localDate(parsedDate) !== date) {
    throw new Error('Enter a valid calendar date.');
  }
  const corrected: PurchaseIntent = {
    id: intent.id,
    title: intent.title.trim(),
    site: intent.site.trim(),
    action: intent.action,
    amountCents: intent.amountCents,
    recordedAt: parsedDate.toISOString(),
    ...(intent.continuedAt ? { continuedAt: parsedDate.toISOString() } : {}),
  };
  const record = purchased ? { ...corrected, confirmedAt: parsedDate.toISOString() } : corrected;
  const destination = purchased ? 'purchase' : 'reminder';
  const source = purchased ? 'reminder' : 'purchase';
  // Write the correction before removing the previous status so a failure cannot erase it.
  await browser.storage.local.set({ [`${destination}:${intent.id}`]: record });
  await browser.storage.local.remove(`${source}:${intent.id}`);
}

/** Remove either status of a single history entry, including a partially completed status change. */
export async function deleteHistory(intent: PurchaseIntent): Promise<void> {
  if (!isIntent(intent)) throw new Error('Invalid history entry.');
  await browser.storage.local.remove([`purchase:${intent.id}`, `reminder:${intent.id}`]);
}

/** Compare a proposed purchase only with confirmed, same-month recorded spending. */
export function spendingInsight(amountCents: number | null, purchases: Purchase[], incomeIncrease: number | null, now = new Date()): string {
  if (amountCents === null) return 'Enter the estimated total to give your wallet some context.';
  const { totalCents: total, count } = monthlyMetrics(purchases, incomeIncrease, now);
  const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
  const income = incomeIncrease ? ` This one-time purchase is ${Math.round(amountCents / (incomeIncrease * 100) * 100)}% of your reported monthly income increase.` : '';
  return (count ? `You recorded ${dollars(total)} this month. If purchased and recorded, this would bring it to ${dollars(total + amountCents)}.` : 'No confirmed purchases recorded this month. A single purchase does not establish a spending trend.') + income;
}
