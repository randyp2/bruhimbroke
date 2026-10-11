# BruhImBroke technical notes

For the project overview and screenshot walkthrough, see the [README](../README.md).

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

After onboarding, the landscape dashboard shows the professor on the left and
monthly shopping metrics on the right. Totals and expressions update when local
history changes, including corrections and deletions.
Use **History & tools** in the header to access all existing history controls
and **Check this page**. The header control becomes an **X** while open; click it
or press Escape to close. Compact rows keep the product, store, date, and price
together, with inline edit/delete actions. Reminders are grouped under **To confirm**.
Product thumbnails are omitted for now to avoid extra remote image requests.

### Dashboard calculations

- **Logged this month:** sum of purchase amounts in the current local calendar
  month and year. Calculations use integer cents; unconfirmed reminders do not count.
- **Purchases logged:** count of those same records.
- **Income comparison:** monthly logged total divided by the optional monthly
  take-home income increase, multiplied by 100. Invalid or missing income hides
  the comparison; it never substitutes zero or guesses an income.
- **Professor:** happy below 50%, questionable from 50% to under 100%, sad at
  100% or more. These are playful product thresholds, not financial advice.
  Zero logged spending with an income increase set is happy at 0%.
  Missing income, tracking off, and read errors keep him neutral
  using the questionable sprite. The exact ratio drives the mood; displayed
  percentages round to one decimal place. Percentages can exceed 100%, while
  the visual bar stops at full width.

Tracking off keeps previously saved totals visible and labels them accordingly.
The calendar refreshes each minute while the popup is open. Existing prices may
be estimates, and logging does not verify checkout completion. The ratio is not
a budget, remaining balance, or claim that this share of a raise was lost to
lifestyle inflation. That would require comparable before/after history.

1. Complete onboarding. Enable shopping history to save purchases and reminders.
2. Refresh an Amazon.com product page and click its main **Add to Cart** or
   **Buy Now** button. The cart's **Proceed to checkout** control is also covered.
3. The landscape professor dialog pauses that click. Check or correct the product and total.
   Prices are USD estimates, including the detected quantity but not necessarily
   tax, shipping, or discounts. Unknown or conflicting prices require manual entry.
   The preview adds this one-time total to this month's logged spending and uses
   the good-purchase sprite below 50% or bad-purchase sprite at 50% and above.
   Insisting on a bad purchase switches to the reconsider sprite. The exact,
   unrounded percentage controls this; dashboard expressions are unchanged.
   Editing the price or updating history refreshes the projection and sprite;
   previewing never logs a purchase. Unknown prices, missing income, or disabled
   tracking keep him neutral. On narrow windows, the layout stacks and scrolls.
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
   Optional **Save reminder** on the first screen still saves an
   unconfirmed reminder. Existing reminders and older unconfirmed attempts remain
   unconfirmed until you explicitly confirm them. They do not count as spending.
6. Use **Clear saved shopping data** to remove attempts, reminders, and purchases.
   Never confirm both a cart and the individual items already included in it.

### Approve once, then shop

Step 3 of onboarding offers **Enable automatic checks**. It requests Chrome's
permission for all HTTP and HTTPS websites once, with no per-store approval.
Existing users can find the same button in **History & tools → Automatic checks**.
The current tab is activated too. Refresh other already-open shopping tabs once;
future visits get the listener automatically, including after browser restarts.
Permission is optional: finishing onboarding never silently requests it, and
denying the request does not block setup, history, or manual checks.

Unfinished setup is saved locally after edits and step changes. Reopening the
popup restores the step, income entry, and tracking choice, including after a
permission prompt closes it. The permission control becomes available after the
draft saves. Finishing setup clears the draft; failed reads or writes offer retry.

Use **Pause on this site** or **Resume on this site** in that panel to stop or
restore interruptions on one exact hostname, across HTTP and HTTPS. Pauses persist
locally and update already-open listeners, including Amazon. They do not revoke
Chrome's access permission or delete purchase history. To revoke broad access,
use Chrome's extension site-access settings. Older individual site approvals
remain usable until the user opts into the new broad permission.

**Check this page** remains available without persistent permission. It opens a
manual intervention and enables button checks only until navigation/reload.
On a paused site, it opens just the manual check without undoing the pause.
Other sites' prices are entered manually. Neither mode verifies a completed order.

## Coverage and limits

- Automatic: Amazon.com desktop product and cart controls. Not every Amazon
  experiment, recommendation card, subscription, or mobile layout is covered.
- eBay.com after website approval: Buy It Now and Add to cart on `/itm/` listings.
  Bids, offers, and eBay checkout are excluded. Price entry is manual; detection
  is fixture-tested against documented wording, not a live-checkout guarantee.
- Other enabled or manually activated sites: common exact English labels such
  as Add to cart, Add to bag, Buy it now, and Checkout. A product/cart URL or
  nearby product/cart markup is also required. Dynamic buttons are covered by
  the delegated click listener. False negatives are intentional where context
  is unclear; use **Check this page**. This is not universal retailer support.
  Whole URL segments such as `shop`, `store`, `item(s)`, `collection(s)`, and
  `catalog`/`catalogue` now count alongside `product(s)`, `p`, and `dp`.
- Payment/order pages and final payment buttons are not intercepted. No order
  is submitted, checkout form altered, or payment data read. Purchase logging is
  based on the user's final confirmation, not proof of completed checkout.
- Embedded payment frames, closed retailer shadow roots, direct form submissions,
  and sites that act on pointer-down rather than click are outside coverage.
- Insights use confirmed purchases recorded this calendar month and optional
  monthly income increase. They do not claim a spending trend or a before/after
  raise comparison. Fictional demo history is not implemented in this flow.
- Preferences use the existing `onboarding` key; unfinished setup uses
  `onboardingDraft`, which becomes `null` after completion. Older attempts and explicit reminders use
  `reminder:<id>` and confirmed purchases use `purchase:<id>` in Chrome local
  storage. Paused hostnames use `shoppingPausedHosts`, separate from history.
  Nothing is sent to a backend. Broad access enables local click detection,
  not browsing-history collection or payment-field reading.

## Checks

```bash
npm test
npm run compile
```

Tests exercise the production popup/content bundles with simulated Chrome APIs
and synthetic retailer markup. They cover first launch, prices, continuation,
immediate purchase logging, manual corrections, confirmation, deletion, tracking
opt-out, exclusions, and storage failures. The production worker is also tested
for persistent registration, broad and legacy permissions, onboarding denial,
permission revocation, retry after failure, sender validation, persistent pauses,
and already-open tab deactivation.
Native modal, focus containment, Escape, and real mouse continuation were also
smoke-tested in isolated Chrome on a local fixture, with simulated storage.
The 720 × 460 main menu, sprite loading, live metric-driven expressions, tools panel bounds,
and Escape navigation were also checked in isolated Chrome with simulated storage.
The loaded extension's onboarding approval button, broad dynamic registration,
reload/new-tab activation, pause/resume, and revocation were checked in isolated
Chrome against a local mock store. Permissions were preapproved in that test
profile; the native approval dialog still needs manual verification. The actual
2degreecelsius Core Zip Up page also opened the modal on Add to cart with broad
access, while non-GET requests were blocked. No live checkout was completed.

See [retailer research and selector decisions](retailer-notes.md).
