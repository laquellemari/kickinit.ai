import { NextResponse } from "next/server";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { HttpError, toResponse } from "@/lib/paypal/http";
import { getLivePlace } from "@/lib/places/client";
import { menuFor } from "@/lib/pricing/menu-store";

// Each new venue costs a web search, so lookups are limited per visitor (cached menus are cheap but still count).
const limiter = createLimiter({ limit: 6, windowMs: 60_000 });

/** GET /api/places/:placeId/menu  The venue's published prices, verified against its own pages. Restaurants and bars have none: they're free to book. */
export async function GET(req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  try {
    if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many price lookups. Try again in a minute.");
    const place = await getLivePlace((await ctx.params).placeId);
    if (place.dining) return NextResponse.json({ dining: true, items: [] });
    const menu = await menuFor(place);
    return NextResponse.json({ dining: false, items: menu.items, checkedAt: menu.checkedAt.toISOString() });
  } catch (err) {
    return toResponse(err);
  }
}
