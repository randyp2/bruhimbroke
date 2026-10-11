import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { automaticOrigins, pausedHosts, pausedSitesKey, sitePattern, siteScriptId, webOrigins } from '../../lib/sitePatterns';

/** One permission prompt for websites; local pauses do not alter purchase history. */
export function SiteAccess({ onboarding = false }: { onboarding?: boolean }) {
  const [tab, setTab] = useState<{ id?: number; url?: string } | null>(null);
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const pattern = tab?.url ? sitePattern(tab.url) : null;
  const hostname = pattern ? new URL(pattern).hostname : null;

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const [permissions, scripts, stored, tabs] = await Promise.all([
          browser.permissions.getAll(), browser.scripting.getRegisteredContentScripts(),
          browser.storage.local.get(pausedSitesKey), browser.tabs.query({ active: true, currentWindow: true }),
        ]);
        if (!active || current !== request) return;
        const origins = automaticOrigins(permissions.origins ?? []);
        setGranted(webOrigins.every((origin) => origins.includes(origin)));
        setReady(webOrigins.every((origin) => scripts.some((script) => script.id === siteScriptId(origin))));
        setPaused(pausedHosts(stored[pausedSitesKey]));
        setTab(tabs[0] ?? null);
      } catch { if (active && current === request) setError('Could not load automatic checks. Reopen to retry.'); }
      finally { if (active && current === request) setLoading(false); }
    };
    const update = () => { void refresh(); };
    const storageChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && pausedSitesKey in changes) update();
    };
    update();
    browser.permissions.onAdded.addListener(update);
    browser.permissions.onRemoved.addListener(update);
    browser.storage.onChanged.addListener(storageChanged);
    return () => {
      active = false;
      browser.permissions.onAdded.removeListener(update);
      browser.permissions.onRemoved.removeListener(update);
      browser.storage.onChanged.removeListener(storageChanged);
    };
  }, [revision]);

  async function activateTab() {
    if (tab?.id === undefined) return;
    try {
      const latest = await browser.tabs.get(tab.id);
      if (!latest.url || !sitePattern(latest.url)) return;
      try { await browser.tabs.sendMessage(tab.id, { type: 'shopping:refresh-access' }); }
      catch {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/shopping.js'] });
        await browser.tabs.sendMessage(tab.id, { type: 'shopping:refresh-access' });
      }
    } catch { setNotice('Saved. Refresh this tab to apply the change.'); }
  }

  async function enable() {
    setBusy(true); setError(''); setNotice('');
    try {
      // Chrome needs this call directly in the user's click, before any other await.
      if (!await browser.permissions.request({ origins: webOrigins })) {
        setNotice('Permission not granted. You can still finish setup and use manual checks.');
        return;
      }
      setGranted(true);
      const result = await browser.runtime.sendMessage({ type: 'shopping:sync-sites' });
      if (!result?.ok) throw new Error('Could not enable automatic checks. Try again.');
      setReady(true);
      setNotice('Enabled for future visits. Refresh other open shopping tabs.');
      await activateTab();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not enable automatic checks. Try again.'); }
    finally { setBusy(false); setRevision((value) => value + 1); }
  }

  async function togglePause(host: string, pause: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      const stored = await browser.storage.local.get(pausedSitesKey);
      const next = pausedHosts(stored[pausedSitesKey]).filter((item) => item !== host);
      if (pause) next.push(host);
      await browser.storage.local.set({ [pausedSitesKey]: next });
      setPaused(next);
      setNotice(pause ? 'Paused here. History is unchanged.' : 'Checks resumed.');
      await activateTab();
    } catch { setError('Could not save this site preference. Try again.'); }
    finally { setBusy(false); setRevision((value) => value + 1); }
  }

  const controls = <>
    {loading ? <p role="status" className="history-caption">Loading checks…</p> : <>
      {granted && ready ? <p className="history-caption">Automatic checks are on across websites.</p> : <div className="site-access-row">
        <p className="history-caption">Approve access to all websites once. Shopping checks stay local.</p>
        <button className="history-button history-button-primary" disabled={busy} onClick={() => void enable()}>{granted ? 'Retry enabling' : 'Enable automatic checks'}</button>
      </div>}
      {!onboarding && hostname && <div className="site-access-row">
        <span>{hostname}</span>
        <button className="history-button" disabled={busy} onClick={() => void togglePause(hostname, !paused.includes(hostname))}>{paused.includes(hostname) ? 'Resume on this site' : 'Pause on this site'}</button>
      </div>}
      {!onboarding && paused.filter((host) => host !== hostname).map((host) => <div className="site-access-row" key={host}>
        <span>{host}</span><button className="history-button" disabled={busy} aria-label={`Resume ${host}`} onClick={() => void togglePause(host, false)}>Resume</button>
      </div>)}
      {!onboarding && <p className="history-caption">Pause stops interruptions, not Chrome's site access. Prices outside Amazon are manual.</p>}
    </>}
    {notice && <p role="status" className="history-caption">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </>;
  return onboarding ? <section className="site-access" aria-label="Automatic checks"><h3>Automatic checks</h3>{controls}</section>
    : <details className="site-access"><summary>Automatic checks</summary>{controls}</details>;
}
