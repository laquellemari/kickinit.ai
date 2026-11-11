# kickinit.ai

**Plans, without the planning.** kickinit is an AI concierge for experiences. You describe the mood, it finds the table, the treatment or the trip, and holds it with PayPal while you decide. You can book for yourself, or switch to **For them** to gift an experience, with friends chipping in to a group pool. Every booking earns stamps in your **Passport**: 403 quests and 58 achievements across dining, wellness, outdoors, nightlife, travel and more.

Built for the PayPal AI Hackathon 2026.

## How PayPal is used

| Moment | PayPal API |
|---|---|
| You pick an option | Orders v2 with `intent=AUTHORIZE`: funds are held, not charged |
| The venue confirms | Capture the authorization |
| The venue can't confirm | Void the authorization, nothing is charged |
| Group gift pool | One authorization per contributor; all captured when the pool is funded, all voided if the deadline passes |
| Paying hosts | Payouts |
| Status updates | Webhooks (`PAYMENT.CAPTURE.COMPLETED`, etc.) |

The agent calls PayPal through the [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit).

## Stack

Next.js 15 (App Router, TypeScript) on Render, Postgres, Elastic for semantic + geo catalog search, and Claude for the concierge agent.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in sandbox keys
npm run dev
```

Open http://localhost:3000.

## Data

- `data/quests.json`: 403 quests (requirement types: count, distinct, same, weekly_streak, gift)
- `data/achievements.json`: levels and 58 achievements

## License

MIT, see [LICENSE](LICENSE).
