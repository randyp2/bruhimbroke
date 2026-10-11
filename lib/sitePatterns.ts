/** Requested together, once, from an explicit onboarding or settings click. */
export const webOrigins = ['https://*/*', 'http://*/*'];
export const amazonOrigins = ['https://amazon.com/*', 'https://www.amazon.com/*'];
export const pausedSitesKey = 'shoppingPausedHosts';

/** Exact HTTP(S) hostname only, never a wildcard or credentials-bearing URL. */
export function sitePattern(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hostname.includes('*')) return null;
    if (url.hostname === 'chromewebstore.google.com' || url.hostname === 'chrome.google.com') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch { return null; }
}

/** Prefer broad grants while retaining existing per-site approvals during migration. */
export function automaticOrigins(origins: readonly string[]): string[] {
  const grants = origins.includes('<all_urls>') || origins.includes('*://*/*') ? [...origins, ...webOrigins] : [...origins];
  return [...new Set(grants)].filter((origin) => webOrigins.includes(origin) || (
    sitePattern(origin) === origin && !amazonOrigins.includes(origin)
    && !grants.includes(`${new URL(origin).protocol}//*/*`)
  ));
}

/** Ignore malformed local settings; a pause applies to one hostname on both protocols. */
export function pausedHosts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((host): host is string => typeof host === 'string' && sitePattern(`https://${host}`) === `https://${host}/*`))];
}

/** Check the sender's actual URL, never a URL supplied in a page message. */
export function siteEnabled(url: string, origins: readonly string[], paused: readonly string[]): boolean {
  const pattern = sitePattern(url);
  if (!pattern || paused.includes(new URL(pattern).hostname)) return false;
  return origins.includes(pattern) || automaticOrigins(origins).some((origin) => origin === pattern || origin === `${new URL(pattern).protocol}//*/*`);
}

/** Stable IDs let Chrome keep approved sites registered across browser restarts. */
export function siteScriptId(origin: string): string {
  return `shopping-site:${encodeURIComponent(origin)}`;
}
