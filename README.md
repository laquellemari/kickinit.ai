# kickinit.ai

**Plans, without the planning.** kickinit is an AI concierge for experiences. Tell it the mood ("a romantic Italian table by the water, Saturday") and it finds the table, the treatment or the trip, then **holds the money with PayPal instead of charging it** until the venue confirms. Switch to **For them** to gift an experience, with friends chipping in to a group pool. Every visit you actually show up to earns stamps in your **Passport**: 403 quests and 58 badges.

Built for the PayPal AI Hackathon 2026. **Live demo: https://kickinit.onrender.com** (PayPal sandbox, no real money moves).

## Try it (for judges)

Nothing to install and no sign-up: the site gives each browser an anonymous visitor ID, so your bookings, gifts and passport follow you on that browser.

You'll need a **PayPal sandbox personal (buyer) account** to approve payments. Every PayPal developer account comes with one: developer.paypal.com > Testing Tools > Sandbox Accounts. The PayPal window also offers *Debit or Credit Card* with a test card from PayPal's [card generator](https://developer.paypal.com/tools/sandbox/card-testing/).

1. **Instant booking (partner venue).** On the home page, type *"jazz tonight for two"* in **Or just say it** and press **Make it happen**. Pick **Vibrato Grill Jazz**, choose a time, and pay with PayPal. The money is authorized, the server checks the amount against its own price, then captures it. Your booking page shows **Confirmed** and "You're booked."
2. **Request to book (any real venue, anywhere).** Ask for something outside Los Angeles, for example *"sushi in San Diego Friday"*. Results marked **Request to book** come from Google Places. The page shows the venue's photo, Google's description and how the hold was estimated (Google's own price range for that venue when it has one). PayPal **holds** the estimated bill + 20% for tip + a $4 booking fee; nothing is charged yet. Tick the box to let a bill above the hold go on your saved PayPal.
3. **The venue confirms, then closes the bill.** Open **/admin** (the venue desk) and enter the **Admin key** from the Devpost testing instructions. **Decline** voids the hold, so the guest is never charged. **Confirm** reserves the table (still nothing charged). Under **Open bills**, enter the final bill: we capture bill + fee from the hold and release the rest. If the bill is higher than the hold, the difference is charged to the guest's saved PayPal (if they ticked the box) or they pay it at the table; the booking page tells them which.
4. **Gift it, with a group pool.** Choose **For them** on the home page, describe who it's for, and on a pick choose **Gift this**, then **Start a group pool, friends chip in**. Share the gift link; each person who chips in places their own PayPal hold. When the total is reached every hold is captured at once; if the deadline passes first, every hold is voided. The gift page also suggests a small add-on under $75, found live through Channel3.
5. **Redeem and check in.** The recipient opens the redeem link and books a time; the gift pays for it. On the booking page, **I'm here: check in** works from 2 hours before the booking until 24 hours after (the venue desk can also check guests in from **Arrivals**).
6. **See it count.** **/passport** shows your level, XP, stamps by category, quests in progress and badges. **/profile** shows your upcoming plans on a calendar, plus your name, photo and home city. **/gifts** lists gifts you started and chipped in to.

Only paid, checked-in bookings count toward quests, so a booking that's cancelled or never attended can't farm badges.

## How PayPal is used

| Moment | PayPal |
|---|---|
| Checkout | JavaScript SDK Buttons (`@paypal/react-paypal-js`) with `intent=authorize` |
| You approve | Orders v2: create order (`intent=AUTHORIZE`), then authorize. The server compares the authorized amount with its own price and voids it on any mismatch |
| Partner venue | Capture the authorization right away |
| Request-to-book venue | Hold = estimated bill + 20% + $4 fee, optionally saving the guest's PayPal (vault with purchase). Venue confirms: still held. Bill closes: partial capture of bill + fee, rest released; anything above the hold is a merchant-initiated charge on the saved PayPal (`payment_source.paypal.vault_id`), or paid at the table. Declined: void |
| Group gift pool | One authorization per contributor; all captured when the pool is funded, all voided at the deadline (a Render cron job checks every 15 minutes) |
| Concierge | [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit) `get_order`, so the agent can answer "did my booking go through?" |

Every PayPal call uses an idempotency key, so a retried request can't charge twice.

## How AI is used

The concierge (`POST /api/concierge`) runs **Claude** (Anthropic) through the Vercel AI SDK as a tool-using agent:

- `search_experiences` searches the partner catalog by text, category, tags, party size, budget and distance.
- `search_live_places` searches real venues anywhere through the Google Places API (New), for request-to-book.
- `present_options` returns structured picks with a reason for each.
- PayPal Agent Toolkit `get_order` checks an order's status.

Every pick is re-checked against the catalog or Google and **re-priced on the server**, so the agent can't invent a venue or a price. Requests are rate-limited to 20 per minute per visitor. The live site uses `claude-haiku-5-5` (set by `CONCIERGE_MODEL`).

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
npm test          # 1059 unit + integration tests
npm run coverage  # 100% statements, branches, functions and lines
npm run lint
```

Database tests run against an in-memory Postgres (PGlite); PayPal, Claude, Google and Channel3 are mocked at the HTTP layer, so the suite needs no keys.

## Data

- `data/experiences.json`: demo partner catalog of 50 real, top-rated Los Angeles-area venues picked from Google Maps ratings (generated by `scripts/build_experiences.py`). kickinit has no partnership with them: prices are illustrative and bookings are simulated in the PayPal sandbox. Each card shows the venue's Google photo with the photographer's credit.
- `data/quests.json`: 403 quests across 8 categories
- `data/achievements.json`: 7 levels and 58 badges

## License

MIT, see [LICENSE](LICENSE).
