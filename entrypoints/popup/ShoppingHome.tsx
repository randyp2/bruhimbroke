import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { shoppingData } from '../../lib/purchases';
import { HistoryEntry } from './HistoryEntry';
import { SiteAccess } from './SiteAccess';
import { Professor } from '../../components/Professor';
import { monthlyMetrics } from '../../lib/metrics';
import { professorLines } from '../../lib/professorLines';
import { money } from '../../lib/shopping';

/** Starts user-initiated checks and records purchases only after explicit confirmation. */
export function ShoppingHome() {
  const [data, setData] = useState<Awaited<ReturnType<typeof shoppingData>> | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [lineSeed] = useState(() => Math.random());
  const metrics = data ? monthlyMetrics(data.purchases, data.incomeIncrease, now) : null;
  const mood = data?.trackingEnabled && !error ? metrics?.mood ?? 'questionable' : 'questionable';
  const dialogue = professorLines[mood][Math.floor(lineSeed * professorLines[mood].length)];
  const percent = metrics?.incomeSharePercent === null || !metrics ? null
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(metrics.incomeSharePercent);

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      shoppingData().then((value) => { if (active && current === request) { setData(value); setNow(new Date()); setError(''); } }).catch(() => {
        if (active && current === request) setError('Could not load saved purchases. Reopen the popup to retry.');
      });
    };
    refresh();
    // Keep month boundaries correct even if the popup remains open across midnight.
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    browser.storage.onChanged.addListener(refresh);
    return () => { active = false; window.clearInterval(clock); browser.storage.onChanged.removeListener(refresh); };
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
        // Inject on demand when neither built-in nor optional site access installed a listener.
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

  return <main className="home-shell">
    <header className="home-header">
      <h1>BruhImBroke<span aria-hidden="true">.</span></h1>
      <details className="home-tools" onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary>
          <span className="history-open-label">History &amp; tools <span aria-hidden="true">↗</span></span>
          <span className="history-close-label" title="Close history and tools"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg><span className="screen-reader-only">Close history and tools</span></span>
        </summary>
        <section className="home-tools-panel" aria-label="Shopping history and tools">
          <header className="history-panel-heading">
            <div><h2>Shopping history</h2><p className="history-caption">All time · USD</p></div>
            <button className="history-button history-button-primary" disabled={opening} aria-describedby="history-check-help" onClick={() => void openCheck()}>{opening ? 'Opening…' : 'Check this page'}</button>
          </header>
          <SiteAccess />
          {error && <p role="alert" className="error">{error}</p>}
          {!data && !error && <p role="status">Loading…</p>}
          {data && <>
            <p className="history-caption history-disclaimer">{data.purchases.length} recorded. Checkout unverified.</p>
            {!data.trackingEnabled && <div className="history-tracking"><p>Tracking is off.</p><button className="history-button" onClick={() => void enableTracking()}>Enable shopping history</button></div>}
            {data.purchases.toSorted((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)).map((purchase) => <HistoryEntry key={purchase.id} intent={purchase} trackingEnabled={data.trackingEnabled} />)}
            {data.reminders.length > 0 && <>
              <h3 className="history-group-title">To confirm <span>{data.reminders.length}</span></h3>
              {data.reminders.toSorted((a, b) => (b.continuedAt ?? b.recordedAt ?? '').localeCompare(a.continuedAt ?? a.recordedAt ?? '')).map((intent) => <HistoryEntry key={intent.id} intent={intent} trackingEnabled={data.trackingEnabled} />)}
            </>}
            {!data.purchases.length && !data.reminders.length && <div className="history-empty"><p>Your history is clear.</p></div>}
            {(data.purchases.length > 0 || data.reminders.length > 0) && <div className="history-footer">
              {confirmClear ? <div className="history-delete-confirm">
                <p>Delete all history? This cannot be undone.</p>
                <div className="history-entry-actions">
                  <button className="history-button history-button-danger" disabled={clearing} onClick={() => void clearHistory()}>Yes, clear shopping data</button>
                  <button className="history-button" disabled={clearing} onClick={() => setConfirmClear(false)}>Cancel</button>
                </div>
              </div> : <button className="history-button history-button-danger" onClick={() => setConfirmClear(true)}>Clear saved shopping data</button>}
            </div>}
          </>}
          <p id="history-check-help" className="screen-reader-only">Opens a shopping check. Outside Amazon, enter the price manually. Use Automatic checks to enable a site for future visits.</p>
        </section>
      </details>
    </header>
    <Professor mood={mood} dialogue={data && !error ? dialogue : undefined} />
    <section className="spending-summary" aria-labelledby="summary-title" data-mood={mood}>
      <div className="summary-heading"><h2 id="summary-title">Your shopping, lately.</h2><time dateTime={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}>{new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(now)}</time></div>
      {!metrics || !data ? <p className="summary-note" role={error ? 'alert' : 'status'}>{error || 'Loading your local history…'}</p> : <>
        <dl className="summary-totals">
          <div className="summary-total"><dt>Logged this month</dt><dd>{money(metrics.totalCents)}</dd></div>
          <div className="summary-count"><dt>Purchases logged</dt><dd>{metrics.count}</dd></div>
        </dl>
        {!metrics.count && <p className="summary-empty">No purchases logged this month.</p>}
        {!data.trackingEnabled && <p className="summary-paused">Tracking is off. Only previously saved entries are shown.</p>}
        {percent !== null && metrics.incomeIncreaseCents !== null ? <div className="income-comparison">
          <div className="comparison-heading"><h3>Shopping vs. income increase</h3><strong className="comparison-percent">{percent}%</strong></div>
          <div className="comparison-track" role="meter" aria-label="Logged shopping compared with monthly income increase" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, metrics.incomeSharePercent!)} aria-valuetext={`Approximately ${percent}% of your monthly income increase`}><span style={{ width: `${Math.min(100, metrics.incomeSharePercent!)}%` }} /></div>
          <p className="comparison-context">{money(metrics.totalCents)} logged ÷ {money(metrics.incomeIncreaseCents)} monthly increase</p>
          <p className="summary-note">A comparison, not a budget or proof of lifestyle inflation.</p>
        </div> : <div className="income-comparison"><h3>No income comparison set</h3><p className="summary-note">You skipped the income increase. Your shopping totals still work.</p></div>}
        <details className="reaction-explainer"><summary>How the professor reacts</summary><p>Happy from 0% to under 50%, questionable from 50% to under 100%, sad at 100% or more. Reactions use the unrounded comparison, not financial health. No income increase, tracking off, or a loading error keeps him neutral.</p></details>
        <p className="summary-footnote">Checkout unverified. Edit or delete in History &amp; tools.</p>
        {error && <p className="error" role="alert">{error}</p>}
      </>}
    </section>
  </main>;
}

