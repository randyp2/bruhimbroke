# Retailer controls and intervention boundaries

Research date: October 9, 2026. These are observed/documented labels, not a claim
that every retailer flow has been tested in a signed-in browser.

| Retailer | Early shopping wording | Implementation decision |
| --- | --- | --- |
| Amazon | Add to Cart, Buy Now, Proceed to checkout | Automatic on Amazon.com product/cart pages; main control IDs/names only, plus checkout labels on cart pages. |
| Target | Add to cart, view cart & check out, I'm ready to check out | Exact-label detection after the user activates the page. Place my order is excluded. |
| Walmart | Add, Checkout | Checkout is recognized on cart pages after activation. Bare Add is too ambiguous and is not intercepted. |
| Shopify stores | Add to cart, Buy it now, branded wallet buttons | Ordinary exact-label controls can work after activation. Accelerated wallet controls inside closed shadow roots are not supported. |

Sources:

- [Amazon Featured Offer](https://sell.amazon.com/blog/amazon-pricing-strategies)
- [Amazon product HTML inspected](https://www.amazon.com/dp/B00MNV8E0C)
- [Target order creation](https://www.target.com/help/articles/orders-purchases/create-an-order)
- [Walmart site and app experience](https://www.walmart.com/help/article/the-walmart-site-and-app-experience/27f2678cb25a40a7b57a359fec3ca67f)
- [Shopify accelerated checkout](https://shopify.dev/docs/storefronts/themes/pricing-payments/accelerated-checkout)

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
