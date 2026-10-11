import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { ComparisonType } from '../../lib/metrics';

/** Lets users change the monthly reference used by dashboard and purchase projections. */
export function ComparisonSettings({
  comparisonType,
  incomeIncrease,
  shoppingBudget,
}: {
  comparisonType: ComparisonType;
  incomeIncrease: number | null;
  shoppingBudget: number | null;
}) {
  const [type, setType] = useState(comparisonType);
  const [income, setIncome] = useState(incomeIncrease?.toString() ?? '');
  const [budget, setBudget] = useState(shoppingBudget?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    const amountText = type === 'income-increase' ? income : budget;
    const amount = amountText.trim() ? Number(amountText) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      setMessage('Enter a monthly amount greater than zero, or leave it blank.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const stored = await browser.storage.local.get('onboarding');
      const preferences = stored.onboarding && typeof stored.onboarding === 'object' ? stored.onboarding : {};
      await browser.storage.local.set({ onboarding: {
        ...preferences,
        comparisonType: type,
        monthlyIncomeIncrease: income.trim() ? Number(income) : null,
        monthlyShoppingBudget: budget.trim() ? Number(budget) : null,
      } });
      setMessage('Saved. Your comparison is updated.');
    } catch {
      setMessage('Could not save this setting. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const amount = type === 'income-increase' ? income : budget;
  const setAmount = type === 'income-increase' ? setIncome : setBudget;
  const label = type === 'income-increase' ? 'Monthly take-home increase' : 'Monthly shopping target';

  return <div className="comparison-settings">
    <div className="comparison-settings-fields">
      <label>Compare shopping with
        <select value={type} disabled={busy} onChange={(event) => { setType(event.target.value as ComparisonType); setMessage(''); }}>
          <option value="income-increase">Monthly income increase</option>
          <option value="shopping-budget">Monthly shopping target</option>
        </select>
      </label>
      <label>{label} (USD)
        <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Optional" value={amount} disabled={busy} onChange={(event) => { setAmount(event.target.value); setMessage(''); }} />
      </label>
      <p className="history-caption">Update this if your income or target changes. Leave blank to hide the percentage comparison.</p>
      <button className="history-button history-button-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save comparison'}</button>
      {message && <p className={message.startsWith('Could not') || message.startsWith('Enter') ? 'error' : 'history-caption'} role={message.startsWith('Could not') || message.startsWith('Enter') ? 'alert' : 'status'}>{message}</p>}
    </div>
  </div>;
}
