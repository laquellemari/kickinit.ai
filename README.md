# kickinit.ai

**Plans, without the planning.** kickinit is an AI concierge for experiences. Tell it the mood ("a romantic Italian table by the water, Saturday") and it finds the table, the treatment or the trip, and books it. **Restaurants and bars are free to book**: you pay the bill at the end. Everything else is booked at the venue's **exact price** (a partner's price, or the price the venue publishes on its own website) plus a 20% concierge fee, paid with PayPal. **Members ($9.99/month through PayPal Subscriptions) pay no fee.** Switch to **For them** to gift an experience, with friends chipping in to a group pool. Every visit you actually show up to earns stamps in your **Passport**: 403 quests and 58 badges.

Built for the PayPal AI Hackathon 2026. **Live demo: https://kickinit.onrender.com** (PayPal sandbox, no real money moves).

## Try it (for judges)

Nothing to install and no sign-up: the site gives each browser an anonymous visitor ID, so your bookings, gifts and passport follow you on that browser.

You'll need a **PayPal sandbox personal (buyer) account** to approve payments. Every PayPal developer account comes with one: developer.paypal.com > Testing Tools > Sandbox Accounts. The PayPal window also offers *Debit or Credit Card* with a test card from PayPal's [card generator](https://developer.paypal.com/tools/sandbox/card-testing/).

1. **Free restaurant booking.** On the home page, type *"jazz tonight for two"* in **Or just say it** and press **Make it happen**. Pick **Vibrato Grill Jazz**, choose a time and press **Book this table**. No payment: the booking page shows "You're booked" and that you pay the venue's bill at the end.
2. **Paid instant booking (partner).** Ask for *"a spa day for two"* and pick **Hugh Spa**. The checkout shows the venue price, the 20% concierge fee and the total. Pay with PayPal: the money is authorized, the server checks the amount against its own price, then captures it.
3. **Exact prices from any real venue, anywhere.** Ask for something outside Los Angeles, for example *"massage in San Diego Saturday"*. Results marked **Request to book** come from Google Places. On a venue's page, Claude reads **the venue's own published prices** (its website or official booking page) and lists them with a link to where each price came from; only prices that appear word for word on a page it opened are kept. Pick one and PayPal **holds** that exact price + fee. A venue that doesn't publish prices says so instead of guessing. Restaurants found this way are free to request.
4. **The concierge desk confirms.** Open **/admin** and enter the **Admin key** from the Devpost testing instructions. **Confirm & charge** captures the held amount once the venue has said yes; **Decline & release** voids it, so the guest is never charged. Free restaurant requests are just confirmed.
5. **Membership.** Open **Membership** in the menu and subscribe with PayPal ($9.99/month, PayPal Subscriptions). Every checkout then shows "Concierge fee (members pay none) $0", and the server prices it that way. Cancel from the same page.
6. **Gift it, with a group pool.** Choose **For them** on the home page, describe who it's for, and on a pick choose **Gift this**, then **Start a group pool, friends chip in**. Share the gift link; each person who chips in places their own PayPal hold. When the total is reached every hold is captured at once; if the deadline passes first, every hold is voided. The gift page also suggests a small add-on under $75, found live through Channel3.
7. **Redeem and check in.** The recipient opens the redeem link and books a time; the gift pays for it. On the booking page, **I'm here: check in** works from 2 hours before the booking until 24 hours after (the venue desk can also check guests in from **Arrivals**).
8. **See it count.** **/passport** shows your level, XP, stamps by category, quests in progress and badges. **/profile** shows your upcoming plans on a calendar, plus your name, photo and home city. **/gifts** lists gifts you started and chipped in to.

Only confirmed, checked-in bookings count toward quests, so a booking that's cancelled or never attended can't farm badges. A visitor can hold at most 5 upcoming free restaurant bookings at once.

## How PayPal is used

| Moment | PayPal |
|---|---|
| Checkout | JavaScript SDK Buttons (`@paypal/react-paypal-js`) with `intent=authorize` |
| You approve | Orders v2: create order (`intent=AUTHORIZE`), then authorize. The server compares the authorized amount with its own price and voids it on any mismatch |
| Partner venue | Venue price + 20% concierge fee; capture the authorization right away |
| Request-to-book venue | Hold = the venue's exact published price + 20% fee. Venue confirms: capture. Declined: void |
| Restaurants and bars | No PayPal at all: free to book, the guest pays the bill at the venue |
| Membership | PayPal Subscriptions: the product and a $9.99 monthly plan are created on first use; the subscription is created on the server with the visitor as `custom_id`, approved with the JS SDK (`intent=subscription`), then verified (`GET /v1/billing/subscriptions/{id}`: our plan, this visitor, ACTIVE) before members pay no fee. Status is re-checked every 12 hours; cancel calls `/cancel` |
| Gifts | A gift is prepaid: the experience price + 20% fee (none if the organizer is a member) |
| Group gift pool | One authorization per contributor; all captured when the pool is funded, all voided at the deadline (a Render cron job checks every 15 minutes) |
| Concierge | [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit) `get_order`, so the agent can answer "did my booking go through?" |

Every PayPal call uses an idempotency key, so a retried request can't charge twice.

## How AI is used

The concierge (`POST /api/concierge`) runs **Claude** (Anthropic) through the Vercel AI SDK as a tool-using agent:

- `search_experiences` searches the partner catalog by text, category, tags, party size, budget and distance.
- `search_live_places` searches real venues anywhere through the Google Places API (New), for request-to-book.
- `present_options` returns structured picks with a reason for each.
- PayPal Agent Toolkit `get_order` checks an order's status.

Every pick is re-checked against the catalog or Google and **re-priced on the server**, so the agent can't invent a venue or a price.

**Venue descriptions** (`GET /api/places/:id/about`): every venue page (the 50 LA venues and any Google result) shows a 1–2 sentence description that Claude writes from the venue's Google Maps details: Google's own summaries, the review summary, up to 5 reviews, its type, neighborhood, price level and features (cocktails, live music, outdoor seating and so on). Claude may use only those facts, and replies NONE when they're too thin; the page then keeps Google's summary (or our catalog text). Descriptions are cached for 30 days (a NONE for 7). Set `ABOUT_MODEL` to choose the model (defaults to `CONCIERGE_MODEL`). Only new descriptions are rate-limited: 10 per minute per visitor.

**Exact prices without a venue deal** (`GET /api/places/:id/menu`): Claude uses Anthropic's web search and web fetch tools to find and open the venue's own price list. The server keeps a price only when it appears word for word, next to the service's name, on a page Claude actually fetched from the venue's own domain or an official booking platform (Vagaro, Mindbody, Boulevard, Square, Fresha and similar). Menus are cached for a week ("no prices published" for a day). Set `PRICING_MODEL` to choose the model (defaults to `CONCIERGE_MODEL`). Requests are rate-limited to 20 per minute per visitor. The live site uses `claude-haiku-5-5` (set by `CONCIERGE_MODEL`).

## Sponsor tools

- **Render:** web service, Render Postgres and a cron job, all defined in [`render.yaml`](render.yaml).
- **Bryntum Calendar:** the month calendar of your plans on `/profile` (trial package, so it shows a watermark).
- **Channel3:** product search for gift add-ons on the gift page.

## Run it yourself

Requirements: Node 20+, a PostgreSQL database, and sandbox keys.

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npm run dev                  # http://localhost:3000
```

| Variable | Needed for | Where to get it |
|---|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Payments | developer.paypal.com > Apps & Credentials > Sandbox |
| `PAYPAL_ENV` | | `sandbox` |
| `ANTHROPIC_API_KEY` | Concierge | console.anthropic.com |
| `DATABASE_URL` | Bookings, gifts, profiles | Any Postgres; tables are created on first use |
| `ADMIN_API_KEY` | Venue desk, pool cron | Any long random string |
| `GOOGLE_PLACES_API_KEY` | Venue photos and request-to-book search (optional; cards fall back to a colour tile) | Google Cloud, Places API (New) |
| `CHANNEL3_API_KEY` | Gift add-ons (optional) | trychannel3.com |

To deploy your own copy, create a Render Blueprint from this repo; `render.yaml` sets up the web service, database and cron job.

## Tests

```bash
npm test          # 1197 unit + integration tests
npm run coverage  # 100% statements, branches, functions and lines
npm run lint
```

Database tests run against an in-memory Postgres (PGlite); PayPal, Claude, Google and Channel3 are mocked at the HTTP layer, so the suite needs no keys.

## Data

- `data/experiences.json`: demo partner catalog of 50 real, top-rated Los Angeles-area venues picked from Google Maps ratings (generated by `scripts/build_experiences.py`). kickinit has no partnership with them: prices are illustrative and bookings are simulated in the PayPal sandbox. The 16 restaurants and bars among them are free to book. Each card shows the venue's Google photo with the photographer's credit.
- `data/quests.json`: 403 quests across 8 categories
- `data/achievements.json`: 7 levels and 58 badges

## License

MIT, see [LICENSE](LICENSE).
