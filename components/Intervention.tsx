import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { money, parseAmount } from '../lib/shopping';
import type { PurchaseIntent } from '../lib/shopping';
import { recordContinuation, saveReminder, shoppingData } from '../lib/purchases';
import { monthlyMetrics, projectedMetrics } from '../lib/metrics';
import { professorLines } from '../lib/professorLines';
import { Professor } from './Professor';
import goodPurchase from '../assets/good-purchase-cutout.png?no-inline';
import badPurchase from '../assets/bad-purchase-cutout.png?no-inline';
import reconsider from '../assets/reconsider-cutout.png?no-inline';

const purchaseSprites = {
  good: { image: goodPurchase, label: 'Good purchase' },
  bad: { image: badPurchase, label: 'Bad purchase' },
  reconsider: { image: reconsider, label: 'Reconsidering' },
};

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
  const [lineSeed] = useState(() => Math.random());
  const [now, setNow] = useState(() => new Date());
  const cents = parseAmount(amount);
  // A partially saved confirmation must not count the same intent twice in its preview.
  const current = data ? monthlyMetrics(data.purchases.filter((purchase) => purchase.id !== intent.id), data.incomeIncrease, now) : null;
  const projected = current ? projectedMetrics(current, cents) : null;
  const mood = data?.trackingEnabled ? projected?.mood ?? 'questionable' : 'questionable';
  const purchaseReaction = !data?.trackingEnabled || projected?.incomeSharePercent == null ? null
    : projected.incomeSharePercent < 50 ? 'good' : insisting ? 'reconsider' : 'bad';
  const dialogue = professorLines[mood][Math.floor(lineSeed * professorLines[mood].length)];
  const percentage = (value: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}%`;

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const currentRequest = ++request;
      shoppingData().then((result) => { if (active && request === currentRequest) setData(result); }).catch(() => {
        if (active && request === currentRequest) { setData(null); setError('Could not read your preferences. You can still continue shopping.'); }
      });
    };
    refresh();
    browser.storage.onChanged.addListener(refresh);
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { active = false; browser.storage.onChanged.removeListener(refresh); window.clearInterval(clock); };
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

  return <section className="pause" data-mood={mood} data-reaction={purchaseReaction ?? 'neutral'}>
    <button className="close" onClick={onClose} aria-label="Dismiss intervention">×</button>
    <header className="pause-brand">BruhImBroke<span aria-hidden="true">.</span></header>
    <Professor mood={mood} dialogue={data ? dialogue : undefined} sprite={purchaseReaction ? purchaseSprites[purchaseReaction] : undefined} />
    <div className="pause-content">
      <h1 id="pause-title">{insisting ? 'Overruling the professor?' : 'A quick reality check.'}</h1>
      <p id="pause-description" className="muted">{insisting ? 'Your call. My eyebrow stays raised.' : 'One purchase. Here’s the impact.'}</p>
      <div className="purchase-fields">
        <label>Product<input value={title} disabled={saving} maxLength={200} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} /></label>
        <label>Total (USD)<input value={amount} disabled={saving} inputMode="decimal" placeholder="Enter total" aria-describedby="price-help" aria-invalid={amount !== '' && cents === null} onChange={(event) => { setAmount(event.target.value); setSaved(false); }} /></label>
      </div>
      <small id="price-help">{intent.amountCents === null ? 'Price unknown. Enter the estimated total.' : 'Estimate only. Check quantity, tax & shipping.'}</small>
      {amount !== '' && cents === null && <p role="alert">Enter a nonnegative USD amount with up to two decimals.</p>}
      <section className="impact" aria-label="Purchase impact" aria-live="polite">
        {!data ? <p className="muted">{error ? 'Comparison unavailable.' : 'Checking local history…'}</p> : !data.trackingEnabled ? <p className="muted">Tracking is off. Nothing will be logged.</p> : current && projected && <>
          {projected.incomeSharePercent !== null && current.incomeSharePercent !== null ? <>
            <h2>Shopping vs. income increase</h2>
            <div className="impact-percentages"><div><span>Now</span><strong className="current-percent">{percentage(current.incomeSharePercent)}</strong></div><span className="impact-arrow" aria-hidden="true">→</span><div><span>With this purchase</span><strong className="projected-percent">{percentage(projected.incomeSharePercent)}</strong></div></div>
            <div className="impact-track" role="meter" aria-label="Projected share of monthly income increase" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, projected.incomeSharePercent)} aria-valuetext={percentage(projected.incomeSharePercent)}><span style={{ width: `${Math.min(100, projected.incomeSharePercent)}%` }} /></div>
          </> : <h2>{cents === null ? 'Enter a total to preview the impact.' : 'No income comparison set.'}</h2>}
          <p className="impact-total">{money(current.totalCents)} logged this month{projected.totalCents !== null && <> → <strong>{money(projected.totalCents)}</strong></>}</p>
          <small>Preview only. Not a budget or spending trend.</small>
        </>}
      </section>
      {data?.trackingEnabled && !insisting && <button className="reminder" title="Save an unconfirmed reminder, not a purchase" disabled={saving || saved || (amount !== '' && cents === null)} onClick={() => void remind()}>{saving ? 'Saving…' : saved ? 'Reminder saved' : 'Save reminder'}</button>}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Reminder saved. No purchase has been recorded.</p>}
      {insisting && data?.trackingEnabled && <p className="confirmation-note" role="status">Logs now, before checkout. Edit or delete in History.</p>}
      {insisting && data?.trackingEnabled && cents === null && <p role="alert">Enter a valid USD total to log this purchase, or continue without saving.</p>}
      <div className="actions">
        <button className="primary" onClick={onClose}>I’ll reconsider</button>
        {insisting ? <button className="secondary" disabled={saving || (data?.trackingEnabled === true && cents === null)} onClick={() => void proceed()}>{saving ? 'Saving…' : data && !data.trackingEnabled ? 'RIP wallet. I’m buying it.' : 'RIP wallet. Log my purchase.'}</button> : <button className="secondary" disabled={saving} onClick={() => setInsisting(true)}>I’m buying it anyway</button>}
        {(continueError || (insisting && data?.trackingEnabled && cents === null)) && <button className="secondary continue-unsaved" disabled={saving} onClick={() => onContinue(false)}>Continue without saving</button>}
      </div>
      <small>{intent.action === 'manual' ? 'This check never places an order.' : 'Then click the site’s shopping button again. We never place orders.'}</small>
    </div>
  </section>;
}
