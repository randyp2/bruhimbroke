# Retailer controls and intervention boundaries

Research date: October 9, 2026. These are observed/documented labels, not a claim
that every retailer flow has been tested in a signed-in browser.

| Retailer | Early shopping wording | Implementation decision |
| --- | --- | --- |
| Amazon | Add to Cart, Buy Now, Proceed to checkout | Automatic on Amazon.com product/cart pages; main control IDs/names only, plus checkout labels on cart pages. |
| eBay.com | Buy It Now, Add to cart | Automatic after website approval on fixed-price `/itm/` listing actions. Bids, offers, and checkout are excluded; price entry is manual. |
| Target | Add to cart, view cart & check out, I'm ready to check out | Exact-label detection after the user activates the page. Place my order is excluded. |
| Walmart | Add, Checkout | Checkout is recognized on cart pages after activation. Bare Add is too ambiguous and is not intercepted. |
| Shopify stores | Add to cart, Buy it now, branded wallet buttons | Ordinary exact-label controls can work after activation. Accelerated wallet controls inside closed shadow roots are not supported. |

Sources:

- [Amazon Featured Offer](https://sell.amazon.com/blog/amazon-pricing-strategies)
- [Amazon product HTML inspected](https://www.amazon.com/dp/B00MNV8E0C)
- [Target order creation](https://www.target.com/help/articles/orders-purchases/create-an-order)
- [Walmart site and app experience](https://www.walmart.com/help/article/the-walmart-site-and-app-experience/27f2678cb25a40a7b57a359fec3ca67f)
- [Shopify accelerated checkout](https://shopify.dev/docs/storefronts/themes/pricing-payments/accelerated-checkout)
- [eBay shopping cart](https://ocsnext.ebay.com/help/buying/paying-items/shopping-cart?id=4360)
- [Public eBay listing inspected October 10, 2026](https://www.ebay.com/itm/147469673640)

## Persistent access

Amazon remains a manifest-declared script. One optional approval now requests
all HTTP(S) sites and creates persistent dynamic scripts, excluding Amazon's
existing static matches to avoid duplicate injection. Onboarding step 3 and
the tools panel share the same explicit permission button. Legacy individual
host grants continue working; broad grants replace overlapping registrations.
Chrome manages grants and registrations, separate from purchase history.

The background worker reconciles registrations on install, startup, and permission
changes. Revocation also notifies existing listeners because unregistering a
script does not remove one already injected. Access responses are generation-guarded
so stale replies cannot re-enable a revoked listener. Manual checks remain
temporary; persistent access is rechecked on SPA navigation. All sites, including
Amazon, wait for the worker's local pause check before automatic interception.
Pauses use validated exact hostnames in `shoppingPausedHosts`, apply across both
protocols, and notify open tabs immediately. The script can still be loaded on
a paused site, but does not intercept clicks or extract product data. A manual
check is allowed without silently resuming automatic checks. Pausing does not
remove Chrome's host permission, clear financial data, or save browsing history.

Generic labels need product/cart context: a product/cart URL, a containing cart
element, Product microdata, or an add-to-cart form. This deliberately misses
unfamiliar layouts instead of intercepting matching words anywhere on the web.
Forms with card-autocomplete fields are excluded without reading their values.
Shopping URL segments include `product(s)`, `p`, `dp`, `shop`, `store`, `item(s)`,
`collection(s)`, and `catalog`/`catalogue`. They must be whole path segments,
not substrings, hostname words, query parameters, or fragments. A matching URL
alone never triggers an intervention; a recognized shopping control is still
required. The Arc’teryx `/us/en/shop/mens/...` route and nested Add to cart control
are covered by a production-bundle regression test. Checkout buttons still need
cart context, and payment/order exclusions take precedence over shopping words.

- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Dynamic content scripts](https://developer.chrome.com/docs/extensions/reference/api/scripting)

The public Amazon HTML contains native submit inputs, accessible labels on
separate sibling elements, a quantity select, multiple purchase offers, and
recommendation cards. The Buy Now input also carries a retailer-owned
`formaction`. This is why the extension recognizes known controls and allows a
real user click to continue instead of reconstructing or submitting a form.
Public page fetching also encountered a blocked response; the web source's
indexed HTML was available. A personalized live cart was not accessed.

Price extraction deliberately scopes to Amazon's main price widgets or cart
subtotal. List prices, hidden offers, and conflicting values are not used as a
confident estimate. Generic pages always allow manual entry rather than choosing
an arbitrary dollar amount from the page. Currency support is USD only.

The content listener runs in the isolated extension world and handles bubbling
clicks at the window capture phase, including keyboard-generated clicks and
dynamically inserted buttons. The dialog uses a closed shadow root for financial
copy, native modal behavior, keyboard focus cycling, and reduced-motion CSS.
Only after a successful dialog mount is the original click prevented. A failed
mount leaves the original click alone.

Continuation permits one click on the exact original element and URL for 30
seconds. It never calls the retailer's click, submit, or payment APIs. With tracking
enabled, the final "RIP wallet. Log my purchase." choice immediately saves a
purchase before closing. It counts toward recorded spending even if checkout
has not completed. A valid USD total is required; users can instead continue
without logging. Existing reminders share the same ID and are removed when
the purchase is saved. The popup supports corrections and deletion if the user
changes their mind. Older unconfirmed attempts and explicit reminders remain
excluded from spending until confirmed. There is no payment completion detector.

Before declaring a new retailer supported, verify product variants, quantity,
price/currency, cart subtotal, nested controls, keyboard activation, dismissal,
and continuation in that retailer's current UI. Test only as far as needed to
verify the pause, without completing an unwanted order.
