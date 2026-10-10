# BruhImBroke

Your wallet's last line of defense against yourself.

This Chrome extension uses WXT, React, and TypeScript. It includes onboarding,
shopping interventions, immediate purchase logging on the final confirmation,
and editable local purchase history. No server or account is required.

## Run locally

```bash
npm install
npm run dev
```

WXT opens Chrome with the unpacked extension loaded. Click the extension icon
to preview the popup. For a production build, run `npm run build`, then load
`.output/chrome-mv3` from `chrome://extensions` with Developer mode enabled.

After rebuilding, reload the extension **and refresh existing retailer tabs**.
The build folder is `.output/chrome-mv3`; `npm run dev` uses
`.output/chrome-mv3-dev`. Keep the dev server running if you load the dev folder.

## Try the shopping flow

1. Complete onboarding. Enable shopping history to save purchases and reminders.
2. Refresh an Amazon.com product page and click its main **Add to Cart** or
   **Buy Now** button. The cart's **Proceed to checkout** control is also covered.
3. The wallet dialog pauses that click. Check or correct the product and total.
   Prices are USD estimates, including the detected quantity but not necessarily
   tax, shipping, or discounts. Unknown or conflicting prices require manual entry.
4. **I'll reconsider**, the close button, or Escape dismisses the check without
   performing the shopping action. **I'm buying it anyway** reveals the final
   **RIP wallet. Log my purchase.** choice. With tracking on, this immediately
   records the displayed total as a purchase and counts it toward spending.
   It assumes you will buy; checkout completion is not verified. Then click the
   same retailer button again within 30 seconds. Only that next click bypasses
   the intervention. Tracking off saves nothing and changes the final button to
   **RIP wallet. I'm buying it.** Missing or invalid prices require a valid USD
   total before logging; you can also **Continue without saving**. If saving
   fails, retry or explicitly continue without saving, then check history.
5. Open the popup's **Shopping history** to see the purchase immediately, with no
   second confirmation needed. **Edit entry** corrects the product, store, amount,
   date, and purchase status. **Delete entry** removes it if you decide not to buy.
   Optional **Remind me to confirm later** on the first screen still saves an
   unconfirmed reminder. Existing reminders and older unconfirmed attempts remain
   unconfirmed until you explicitly confirm them. They do not count as spending.
6. Use **Clear saved shopping data** to remove attempts, reminders, and purchases.
   Never confirm both a cart and the individual items already included in it.

On other HTTP(S) storefronts, open the popup and choose **Check this page**. This
opens a manual intervention and enables exact-label button checks for that page
until navigation/reload. Prices outside Amazon are entered manually. No broad
permission to read all sites is requested: access comes from your popup click.

## Coverage and limits

- Automatic: Amazon.com desktop product and cart controls. Not every Amazon
  experiment, recommendation card, subscription, or mobile layout is covered.
- User-activated pages: common English labels including Add to cart, Add to bag,
  Buy it now, Checkout, and I'm ready to check out. This is best-effort coverage,
  not verified support for every retailer.
- Payment/order pages and final payment buttons are not intercepted. No order
  is submitted, checkout form altered, or payment data read. Purchase logging is
  based on the user's final confirmation, not proof of completed checkout.
- Embedded payment frames, closed retailer shadow roots, direct form submissions,
  and sites that act on pointer-down rather than click are outside coverage.
- Insights use confirmed purchases recorded this calendar month and optional
  monthly income increase. They do not claim a spending trend or a before/after
  raise comparison. Fictional demo history is not implemented in this flow.
- Preferences use the existing `onboarding` key. Older attempts and explicit reminders use
  `reminder:<id>` and confirmed purchases use `purchase:<id>` in Chrome local
  storage. Nothing is sent to a backend.

## Checks

```bash
npm test
npm run compile
```

Tests exercise the production popup/content bundles with simulated Chrome APIs
and synthetic retailer markup. They cover first launch, prices, continuation,
immediate purchase logging, manual corrections, confirmation, deletion, tracking
opt-out, exclusions, and storage failures.
Native modal, focus containment, Escape, and real mouse continuation were also
smoke-tested in isolated Chrome on a local fixture, with simulated storage.
Live signed-in checkout compatibility still needs manual verification.

See [retailer research and selector decisions](docs/retailer-notes.md).
