# October hesitation feedback and OCT5 experiment

The website asks once per tab session after 25 active, visible seconds on a revealed price. It pauses for hidden tabs, inactive readers after a minute, and open forms. Manual “Not going ahead” feedback remains available. Skipping closes the sheet and keeps the quote.

The existing anonymous browser ID receives a stable 50/50 server assignment. Eligible fixed main repairs cost at least £75 and exclude diagnostic/assessment prices. Visitors reporting a price concern in the offer group can claim £5 off by 31 October 2026. Other visitors keep the usual help route. The offer is a repair request, with parts confirmation and existing deposit arrangements; it is not an immediate payment or guaranteed booking.

The server signs the exact catalogue option and original price, verifies it again when saving, and stores the discounted primary quote plus an OCT5 note. Additional repairs and accessories keep their existing pricing. No database migration is required. Expiry is enforced server-side, even for an old tab. A code string alone cannot alter pricing.

Quote UX diagnostics (`/app/analytics/quote-ux`) shows reported reasons, assigned browsers, claims, requests, arrived devices, completed jobs, marked payments, recorded job value and completed-job discount cost. Browsers are not verified people. Exits are observations, not reasons. Server-saved request events link enquiries to jobs; repeated browser events are deduplicated. Request events use the selected report range; linked job outcomes continue updating afterwards. Recorded job value is not profit or verified cash takings, and small samples cannot establish a winner.

Tests: `npm test -- tests/repair-offer.test.ts` in the app; `node --test scripts/test-quote-feedback-offer.cjs` in the website. The website URL parameter `analytics_test=1` suppresses new experiment events during UI checks; it does not suppress older quote analytics.

Rollback: remove the website `quote-feedback-offer.js` script tag and bump its cache versions; the existing manual feedback route continues without the discount. Leave server validation in place for already issued claims until expiry. No mass messaging or automatic follow-up is introduced.
