import { useEffect, useState } from 'react';
import { parseAmount } from '../lib/shopping';
import type { PurchaseIntent } from '../lib/shopping';
import { recordContinuation, saveReminder, shoppingData, spendingInsight } from '../lib/purchases';

/** The final choice records a purchase locally but never submits the retailer's order. */
export function Intervention({ intent, onClose, onContinue }: {
  intent: PurchaseIntent;
  onClose: () => void;
  onContinue: (logged?: boolean) => void;
}) {
  const [amount, setAmount] = useState(intent.amountCents === null ? '' : (intent.amountCents / 100).toFixed(2));
  const [title, setTitle] = useState(intent.title);
  const [data, setData] = useState<Awaited<ReturnType<typeof shoppingData>> | null>(null);
  const [insisting, setInsisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [continueError, setContinueError] = useState(false);
  const cents = parseAmount(amount);

  useEffect(() => {
    let active = true;
    shoppingData().then((result) => { if (active) setData(result); }).catch(() => {
      if (active) setError('Could not read your preferences. You can still continue shopping.');
    });
    return () => { active = false; };
  }, []);

  async function remind() {
    setSaving(true);
    setError('');
    try {
      await saveReminder({ ...intent, title: title.trim() || intent.title, amountCents: cents });
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the reminder. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function proceed() {
    if (saving) return;
    setSaving(true);
    setError('');
    setContinueError(false);
    try {
      const logged = await recordContinuation({ ...intent, title: title.trim() || intent.title, amountCents: cents });
      onContinue(logged);
    } catch {
      setContinueError(true);
      setError('Could not finish saving this purchase. Retry the confirmation, or continue without saving. Check history before adding it again.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="pause">
    <button className="close" onClick={onClose} aria-label="Dismiss intervention">×</button>
    <p className="eyebrow">BruhImBroke · Your wallet has the floor</p>
    <div className={`mascot ${insisting ? 'dramatic' : ''}`} aria-hidden="true">👛<span>!</span></div>
    <h1 id="pause-title">{insisting ? 'Your wallet would like a word.' : 'Hold on. We need to talk.'}</h1>
    <p id="pause-description" aria-live="polite">{insisting ? 'Your financial adviser has requested a vacation. Apparently, this cart counts as a hostile work environment.' : 'Your bank account has requested an emergency meeting. The agenda? This purchase.'}</p>
    <label>What are you considering?
      <input value={title} disabled={saving} maxLength={200} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} />
    </label>
    <label>Estimated total (USD)
      <input value={amount} disabled={saving} inputMode="decimal" placeholder="Enter the total, e.g. 140.00" aria-invalid={amount !== '' && cents === null} onChange={(event) => { setAmount(event.target.value); setSaved(false); }} />
    </label>
    <small>{intent.amountCents === null ? 'Price uncertain. Enter it manually, or continue without a price.' : 'Estimate from the page. Check quantity, discounts, tax, and shipping before using it.'} USD only for now.</small>
    {amount !== '' && cents === null && <p role="alert">Use a positive USD amount with at most two decimal places.</p>}
    <div className="insight">{data ? spendingInsight(cents, data.purchases, data.incomeIncrease) : 'You are always free to reconsider or keep shopping.'}</div>
    {data?.trackingEnabled && !insisting && <div className="reminder">
      <button className="secondary" disabled={saving || saved || (amount !== '' && cents === null)} onClick={() => void remind()}>{saving ? 'Saving…' : saved ? 'Reminder saved' : 'Remind me to confirm later'}</button>
      <small>Optional: saves these details locally as an unconfirmed reminder. After buying, open BruhImBroke and choose “I bought it.”</small>
    </div>}
    {error && <p role="alert">{error}</p>}
    {saved && <p role="status">Reminder saved. No purchase has been recorded.</p>}
    {insisting && data?.trackingEnabled && <p role="status">This records the displayed total as a purchase right now and counts it toward spending. If you change your mind or the total changes, edit or delete it in Shopping history.</p>}
    {insisting && data?.trackingEnabled && cents === null && <p role="alert">Enter a valid USD total to log this purchase, or continue without saving.</p>}
    <div className="actions">
      <button className="primary" onClick={onClose}>I’ll reconsider</button>
      {insisting ? <button className="secondary" disabled={saving || (data?.trackingEnabled === true && cents === null)} onClick={() => void proceed()}>{saving ? 'Saving…' : data && !data.trackingEnabled ? 'RIP wallet. I’m buying it.' : 'RIP wallet. Log my purchase.'}</button> : <button className="secondary" disabled={saving} onClick={() => setInsisting(true)}>I’m buying it anyway</button>}
      {(continueError || (insisting && data?.trackingEnabled && cents === null)) && <button className="secondary" disabled={saving} onClick={() => onContinue(false)}>Continue without saving</button>}
    </div>
    <small>{data?.trackingEnabled ? 'Your final confirmation logs the purchase locally. We do not verify whether checkout completes.' : data ? 'Tracking is off. Continuing will not save a history entry.' : 'History depends on your tracking preference. We do not verify checkout completion.'}</small>
    <small>{intent.action === 'manual' ? 'Close this check whenever you are ready.' : 'After confirming, click the same shopping button again to continue. We never place orders for you.'}</small>
  </section>;
}
