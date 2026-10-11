import { browser } from 'wxt/browser';
import { amazonOrigins, automaticOrigins, pausedHosts, pausedSitesKey, siteEnabled, sitePattern, siteScriptId } from '../lib/sitePatterns';

/** Optional host grants are the source of truth; no browsing history is stored. */
export default defineBackground(() => {
  let pending = Promise.resolve();

  async function reconcile() {
    const { origins = [] } = await browser.permissions.getAll();
    const desired = automaticOrigins(origins);
    const scripts = await browser.scripting.getRegisteredContentScripts();
    const stale = scripts.filter((script) => script.id.startsWith('shopping-site:') && !desired.some((origin) => siteScriptId(origin) === script.id));
    if (stale.length) await browser.scripting.unregisterContentScripts({ ids: stale.map((script) => script.id) });
    const missing = desired.filter((origin) => !scripts.some((script) => script.id === siteScriptId(origin)));
    if (missing.length) await browser.scripting.registerContentScripts(missing.map((origin) => ({
      id: siteScriptId(origin), matches: [origin], excludeMatches: amazonOrigins,
      js: ['content-scripts/shopping.js'], runAt: 'document_start', persistAcrossSessions: true,
    })));
  }

  function sync() {
    const operation = pending.then(reconcile);
    // Keep later permission changes retryable after a failed registration.
    pending = operation.catch(() => {});
    return operation;
  }

  async function refreshOpenTabs() {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      try { await browser.tabs.sendMessage(tab.id, { type: 'shopping:refresh-access' }); }
      catch { /* Most tabs have no shopping listener. */ }
    }));
  }

  function permissionsChanged() {
    // Existing scripts survive unregistration, so also disable/recheck their listeners.
    void refreshOpenTabs().catch((error) => console.warn('Could not refresh shopping access.', error));
    void sync().catch((error) => console.warn('Could not register shopping sites.', error));
  }

  browser.permissions.onAdded.addListener(permissionsChanged);
  browser.permissions.onRemoved.addListener(permissionsChanged);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && pausedSitesKey in changes) {
      void refreshOpenTabs().catch((error) => console.warn('Could not refresh paused sites.', error));
    }
  });
  browser.runtime.onInstalled.addListener(() => { void sync().catch((error) => console.warn('Could not restore shopping sites.', error)); });
  browser.runtime.onStartup.addListener(() => { void sync().catch((error) => console.warn('Could not restore shopping sites.', error)); });
  browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object' || !('type' in message)) return;
    if (message.type === 'shopping:access' && sender.tab && sender.frameId === 0) {
      void Promise.all([browser.permissions.getAll(), browser.storage.local.get(pausedSitesKey)]).then(([{ origins = [] }, stored]) => {
        const paused = pausedHosts(stored[pausedSitesKey]);
        const pattern = sitePattern(sender.url ?? '');
        respond({ enabled: siteEnabled(sender.url ?? '', origins, paused), paused: !pattern || paused.includes(new URL(pattern).hostname) });
      }).catch(() => respond({ enabled: false }));
      return true;
    }
    // Chrome also supplies sender.tab when our popup is opened as an extension tab.
    if (message.type === 'shopping:sync-sites' && sender.url === browser.runtime.getURL('/popup.html')) {
      void sync().then(() => respond({ ok: true })).catch(() => respond({ ok: false, error: 'Could not enable automatic checks. Try again.' }));
      return true;
    }
  });
});
