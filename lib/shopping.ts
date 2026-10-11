/** A possible purchase, never proof that an order was placed. Amounts are USD cents. */
export interface PurchaseIntent {
  id: string;
  title: string;
  site: string;
  action: 'add-to-cart' | 'buy-now' | 'checkout' | 'manual';
  amountCents: number | null;
  recordedAt?: string;
  continuedAt?: string;
}

/** A purchase the user explicitly confirmed, separate from saved reminders. */
export interface Purchase extends PurchaseIntent {
  amountCents: number;
  confirmedAt: string;
}

/** Accept only unambiguous, nonnegative USD amounts with at most two decimals. */
export function parseAmount(value: string): number | null {
  const text = value.trim().replace(/^(?:US\$|USD\s*|\$)\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Math.round(Number(text.replaceAll(',', '')) * 100);
  return Number.isSafeInteger(amount) && amount <= 1_000_000_000 ? amount : null;
}

export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** Payment, account, and order pages must remain outside automatic interception. */
export function isPaymentPage(url: URL): boolean {
  return /^(?:checkout|pay|payments)\./i.test(url.hostname)
    || /\/(?:checkout|checkouts|buy|payment|payments|pay|orders?|thank[-_]?you|ap|signin)(?:\/|\.|$)/i.test(url.pathname + url.hash.replace(/^#/, '/'));
}

export function isAmazon(url: URL): boolean {
  return url.hostname === 'amazon.com' || url.hostname === 'www.amazon.com';
}

const labels: Record<string, PurchaseIntent['action']> = {
  'add to cart': 'add-to-cart',
  'add to bag': 'add-to-cart',
  'buy now': 'buy-now',
  'buy it now': 'buy-now',
  'checkout': 'checkout',
  'check out': 'checkout',
  'proceed to checkout': 'checkout',
  'proceed to check out': 'checkout',
  "i'm ready to check out": 'checkout',
  'view cart & check out': 'checkout',
};

/** Exact early-shopping controls only; deliberately excludes broad words like "Buy". */
export function purchaseControl(target: EventTarget | null, url: URL): { element: HTMLElement; action: PurchaseIntent['action'] } | null {
  if (!(target instanceof Element) || isPaymentPage(url)) return null;
  const element = target.closest<HTMLElement>('button, input[type="submit"], input[type="button"], a[href], [role="button"]');
  if (!element || element.matches(':disabled, [aria-disabled="true"]') || element.closest('[hidden], [inert]')) return null;
  const label = (element.getAttribute('aria-label') || (element instanceof HTMLInputElement ? element.value : element.textContent) || '')
    .trim().toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ');
  let action = labels[label];
  if (isAmazon(url)) {
    action = undefined;
    if (element.matches('#add-to-cart-button, #add-to-cart-button-ubb, [name="submit.add-to-cart"]')) action = 'add-to-cart';
    if (element.matches('#buy-now-button')) action = 'buy-now';
    if (element.matches('[name="proceedToRetailCheckout"]')) action = 'checkout';
    if (/\/(?:gp\/cart|cart)(?:\/|$)/.test(url.pathname) && labels[label] === 'checkout') action = 'checkout';
    // shortcut: Amazon product and cart pages only; expand after testing other layouts.
    if (!/\/(?:dp|gp\/product|gp\/aw\/d|gp\/cart|cart)(?:\/|$)/.test(url.pathname)) return null;
  }
  if (!action) return null;
  const cartContext = /\/(?:cart|basket|bag)(?:\/|\.|$)/i.test(url.pathname) || element.closest('[id*="cart"], [id*="Cart"], [id*="basket"]');
  if (action === 'checkout' && !cartContext) return null;
  if (!isAmazon(url)) {
    if (url.hostname === 'www.ebay.com' || url.hostname === 'ebay.com') {
      // Fixed-price listing actions only. Auctions, offers, and payment flows pass through.
      if (!/^\/itm\//.test(url.pathname) || !['buy-now', 'add-to-cart'].includes(action)) return null;
    } else if (!cartContext && !/\/(?:products?|p|dp|shop|store|items?|collections?|catalog(?:ue)?)(?:\/|$)/i.test(url.pathname)
      && !element.closest('[itemtype="https://schema.org/Product"], [itemtype="http://schema.org/Product"], form[action*="/cart/add"]')) return null;
    if (element.closest('form')?.querySelector('[autocomplete^="cc-"]')) return null;
  }
  return { element, action };
}

function singlePrice(document: Document, selector: string): number | null {
  const values = [...document.querySelectorAll<HTMLElement>(selector)]
    .filter((node) => !node.closest('[hidden], .aok-hidden, .a-hidden, [aria-hidden="true"]'))
    .filter((node) => {
      for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
        const style = document.defaultView?.getComputedStyle(parent);
        if (style?.display === 'none' || style?.visibility === 'hidden') return false;
      }
      return true;
    })
    .map((node) => parseAmount(node.textContent ?? ''));
  const unique = [...new Set(values.filter((value) => value !== null))];
  return unique.length === 1 ? unique[0]! : null;
}

/** getRandomValues also works on HTTP pages, where randomUUID may be unavailable. */
function intentId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Read only product labels/prices and quantity, never payment or address fields. */
export function readIntent(document: Document, url: URL, action: PurchaseIntent['action']): PurchaseIntent {
  const cart = action === 'checkout' || /\/(?:gp\/cart|cart)(?:\/|$)/.test(url.pathname);
  let amountCents: number | null = null;
  if (isAmazon(url)) {
    if (cart) {
      amountCents = singlePrice(document, '#sc-subtotal-amount-activecart .sc-price, #sc-subtotal-amount-buybox .sc-price');
    } else {
      amountCents = singlePrice(document, '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, #corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
      const quantity = document.querySelector<HTMLSelectElement>('select[name="quantity"]')?.value ?? '1';
      if (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 999) amountCents = null;
      else if (amountCents !== null) {
        amountCents *= Number(quantity);
        if (amountCents > 1_000_000_000) amountCents = null;
      }
    }
  }
  const title = cart ? 'Your shopping cart' : document.querySelector('#productTitle, h1')?.textContent || document.title || 'Potential purchase';
  return { id: intentId(), title: title.trim().replace(/\s+/g, ' ').slice(0, 200), site: url.hostname, action, amountCents };
}

/** Storage is untrusted: ignore malformed or incompatible records rather than using them in totals. */
export function isIntent(value: unknown): value is PurchaseIntent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && /^[\da-f-]{36}$/i.test(item.id)
    && typeof item.title === 'string' && item.title.length <= 200
    && typeof item.site === 'string' && item.site.length <= 253
    && ['add-to-cart', 'buy-now', 'checkout', 'manual'].includes(String(item.action))
    && [item.recordedAt, item.continuedAt].every((date) => date === undefined || (typeof date === 'string' && Number.isFinite(Date.parse(date))))
    && (item.amountCents === null || (Number.isSafeInteger(item.amountCents) && Number(item.amountCents) >= 0 && Number(item.amountCents) <= 1_000_000_000));
}

export function isPurchase(value: unknown): value is Purchase {
  return isIntent(value) && value.amountCents !== null && 'confirmedAt' in value
    && typeof value.confirmedAt === 'string' && Number.isFinite(Date.parse(value.confirmedAt));
}
