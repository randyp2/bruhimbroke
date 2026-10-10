import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { browser } from 'wxt/browser';
import { Intervention } from '../components/Intervention';
import styles from '../components/intervention.css?inline';
import { isAmazon, isPaymentPage, purchaseControl, readIntent } from '../lib/shopping';
import type { PurchaseIntent } from '../lib/shopping';

export default defineContentScript({
  matches: ['https://www.amazon.com/*', 'https://amazon.com/*'],
  runAt: 'document_start',
  main(ctx) {
    let enabled = isAmazon(new URL(location.href));
    let active = false;
    let closeActive: (() => void) | undefined;
    let bypass: { element: HTMLElement; url: string; until: number } | null = null;

    function show(intent: PurchaseIntent, control?: HTMLElement): boolean {
      if (active || !document.body) return false;
      const originalUrl = location.href;
      const previousFocus = document.activeElement;
      const host = document.createElement('bruhim-broke');
      // Keep personal financial copy out of the retailer's ordinary DOM queries.
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = styles;
      const dialog = document.createElement('dialog');
      dialog.setAttribute('aria-labelledby', 'pause-title');
      dialog.setAttribute('aria-describedby', 'pause-description');
      const mount = document.createElement('div');
      dialog.append(mount);
      shadow.append(style, dialog);
      document.body.append(host);
      const root = createRoot(mount);
      const close = () => {
        if (!host.isConnected) return;
        dialog.close();
        host.remove();
        queueMicrotask(() => root.unmount());
        active = false;
        closeActive = undefined;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      };
      const proceed = (logged = false) => {
        // A save finishing after dismissal must not arm a stale continuation.
        if (!host.isConnected) return;
        close();
        if (!control || !control.isConnected || location.href !== originalUrl) return;
        // Let a real next click through instead of replaying clicks or submitting retailer forms.
        bypass = { element: control, url: originalUrl, until: Date.now() + 30_000 };
        control.focus();
        const noticeHost = document.createElement('bruhim-broke-notice');
        const noticeRoot = noticeHost.attachShadow({ mode: 'open' });
        const notice = document.createElement('div');
        notice.className = 'notice';
        notice.setAttribute('role', 'status');
        notice.textContent = `Click the same shopping button again within 30 seconds to continue. ${logged ? 'Purchase logged. Changed your mind? Edit or delete it in Shopping history.' : 'No new purchase was logged by this continuation.'}`;
        noticeRoot.append(style.cloneNode(true), notice);
        document.body.append(noticeHost);
        ctx.setTimeout(() => noticeHost.remove(), 8_000);
      };
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
          .filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && shadow.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && shadow.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      });
      try {
        flushSync(() => root.render(<Intervention intent={intent} onClose={close} onContinue={proceed} />));
        dialog.showModal();
        active = true;
        closeActive = close;
        return true;
      } catch (error) {
        close();
        console.warn('BruhImBroke could not open a shopping check.', error);
        return false;
      }
    }

    ctx.addEventListener(window, 'click', (event: MouseEvent) => {
      if (!enabled || active || event.defaultPrevented || !event.cancelable || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const url = new URL(location.href);
      const control = purchaseControl(event.target, url);
      if (!control) return;
      if (bypass?.element === control.element && bypass.url === location.href && bypass.until >= Date.now()) {
        bypass = null;
        return;
      }
      bypass = null;
      if (show(readIntent(document, url, control.action), control.element)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true });

    const onMessage = (message: unknown, sender: { id?: string }, respond: (response: unknown) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object' || !('type' in message) || message.type !== 'shopping:open') return;
      if (isPaymentPage(new URL(location.href))) {
        respond({ error: 'Open a product or cart page. Checks do not run on payment or order pages.' });
        return;
      }
      enabled = true;
      respond(active || show(readIntent(document, new URL(location.href), 'manual')) ? { ok: true } : { error: 'Could not open a check on this page. Refresh it and try again.' });
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      enabled = isAmazon(new URL(location.href));
      bypass = null;
      closeActive?.();
    });
    ctx.onInvalidated(() => { closeActive?.(); browser.runtime.onMessage.removeListener(onMessage); });
  },
});
