import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { shoppingData } from '../../lib/purchases';
import { HistoryEntry } from './HistoryEntry';

/** Starts user-initiated checks and records purchases only after explicit confirmation. */
export function ShoppingHome() {
  const [data, setData] = useState<Awaited<ReturnType<typeof shoppingData>> | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      shoppingData().then((value) => { if (active) { setData(value); setError(''); } }).catch(() => {
        if (active) setError('Could not load saved purchases. Reopen the popup to retry.');
      });
    };
    refresh();
    browser.storage.onChanged.addListener(refresh);
    return () => { active = false; browser.storage.onChanged.removeListener(refresh); };
  }, []);

  async function openCheck() {
    setOpening(true);
    setError('');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url)) throw new Error('Open a retailer product or cart page first. Chrome settings and Web Store pages cannot be checked.');
      let result: { ok?: boolean; error?: string };
      try {
        result = await browser.tabs.sendMessage(tab.id, { type: 'shopping:open' });
      } catch {
        // A page outside Amazon has no content script until the user requests a check.
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/shopping.js'] });
        result = await browser.tabs.sendMessage(tab.id, { type: 'shopping:open' });
      }
      if (!result?.ok) throw new Error(result?.error || 'Could not open the shopping check.');
      window.close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'This page cannot be checked. Try a retailer product page.');
    } finally {
      setOpening(false);
    }
  }

  async function enableTracking() {
    try {
      const stored = await browser.storage.local.get('onboarding');
      const preferences = stored.onboarding && typeof stored.onboarding === 'object' ? stored.onboarding : {};
      await browser.storage.local.set({ onboarding: { ...preferences, trackingEnabled: true } });
    } catch {
      setError('Could not enable tracking. Please try again.');
    }
  }

  async function clearHistory() {
    setClearing(true);
    try {
      const stored = await browser.storage.local.get(null);
      await browser.storage.local.remove(Object.keys(stored).filter((key) => key.startsWith('purchase:') || key.startsWith('reminder:')));
      setConfirmClear(false);
    } catch {
      setError('Could not clear saved shopping data. Try again.');
    } finally {
      setClearing(false);
    }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark" aria-hidden="true">$</div><h1>BruhImBroke</h1></header>
    <section className="intervention">
      <div className="wallet" aria-hidden="true">👛</div>
      <h2>Your wallet is on standby.</h2>
      <p className="message">Amazon.com product and cart buttons get a financial reality check. You stay in control.</p>
      <button className="primary home-action" disabled={opening} onClick={() => void openCheck()}>{opening ? 'Opening…' : 'Check this page'}</button>
      <p className="message help">On other sites, this opens a manual check and enables checks for recognized shopping buttons until the page reloads. Price detection outside Amazon is manual.</p>
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    {!data && !error && <p role="status">Loading saved shopping data…</p>}
    {data && <>
      <h2 className="section-title">Shopping history</h2>
      <p className="message help">With tracking on, your final “Log my purchase” choice records a purchase immediately. Checkout is not verified. Edit the total or delete the entry if you change your mind. Avoid counting both an item and a cart that includes it.</p>
      {!data.trackingEnabled && <><p className="message">Tracking is off.</p><button className="secondary" onClick={() => void enableTracking()}>Enable shopping history</button></>}
      {!data.reminders.length && <p className="message help">No unconfirmed attempts or reminders.</p>}
      {data.reminders.toSorted((a, b) => (b.continuedAt ?? b.recordedAt ?? '').localeCompare(a.continuedAt ?? a.recordedAt ?? '')).map((intent) => <HistoryEntry key={intent.id} intent={intent} trackingEnabled={data.trackingEnabled} />)}
      <h2 className="section-title">Confirmed purchases</h2>
      <p className="message help">{data.purchases.length} recorded. This is only what you confirmed, not your total spending.</p>
      {data.purchases.toSorted((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)).map((purchase) => <HistoryEntry key={purchase.id} intent={purchase} trackingEnabled={data.trackingEnabled} />)}
      {(data.purchases.length > 0 || data.reminders.length > 0) && (confirmClear ? <div>
        <p className="message">Delete all purchases, attempts, and reminders? This cannot be undone.</p>
        <button className="secondary" disabled={clearing} onClick={() => void clearHistory()}>Yes, clear shopping data</button>
        <button className="secondary" disabled={clearing} onClick={() => setConfirmClear(false)}>Cancel</button>
      </div> : <button className="secondary" onClick={() => setConfirmClear(true)}>Clear saved shopping data</button>)}
    </>}
    <p className="privacy-note">Preferences and records stay locally in Chrome.</p>
  </main>;
}

