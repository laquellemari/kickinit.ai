# Done

| Date | Task | Commits | Notes |
|---|---|---|---|
| 2026-11-10 | Chunk 1: test infrastructure + home page tests (28 tests, 100% coverage); fixed empty-carousel crash | see git log test/infra | Vitest + Testing Library, factories/verification helpers |
| 2026-11-10 | Chunk 2: quest engine (levels, 403 quests, 58 achievements, total XP); 105 new tests, 100% coverage | 1367f37, 6c6a476, see git log | Pure functions in src/lib/quests; only paid, checked-in, in-app bookings count |
| 2026-11-10 | Chunk 3: PayPal client (hold/authorize/capture/void) + 4 API routes, admin key on capture/void; 74 new tests, 100% coverage; routes verified over HTTP | bd0c1e0, see git log | Live sandbox calls verified in chunk 10 (workspace can't reach PayPal). Order amount still comes from the request until chunk 4 adds server-side prices |
| 2026-11-10 | Chunk 4: catalog (38 experiences), search + quote, GET /api/experiences(/:id), server-side order pricing; 57 new tests, 100% coverage; verified over HTTP | 88b4c04, see git log | Elastic dropped; catalog is a repo data file; DB arrives with bookings in chunk 7 |
| 2026-11-10 | Chunk 5: concierge agent (AI SDK + Claude, catalog tools, PayPal Agent Toolkit get_order), POST /api/concierge with rate limit; 45 new tests, 100% coverage; verified over HTTP up to Anthropic auth | see git log feature/concierge | Live Claude replies verified once ANTHROPIC_API_KEY is on Render |
