import { NextResponse } from "next/server";
import { aboutFor, cachedAbout } from "@/lib/about/about";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { HttpError, toResponse } from "@/lib/paypal/http";

// Writing a new description costs a Google lookup and a Claude call, so only those are limited; cached ones are free.
const limiter = createLimiter({ limit: 10, windowMs: 60_000 });
const ID_RE = /^[A-Za-z0-9_-]{1,300}$/;

/** GET /api/places/:placeId/about  A 1–2 sentence description of the venue, or null when Google knows too little. */
export async function GET(req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await ctx.params;
    if (!ID_RE.test(placeId)) throw new HttpError(400, "Place id has invalid characters");
    const a = (await cachedAbout(placeId)) ?? (await (() => {
      if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many venues at once. Try again in a minute.");
      return aboutFor(placeId);
    })());
    // Only a written description is worth keeping in the browser; an empty answer may be filled in soon.
    return NextResponse.json({ about: a.about }, { headers: { "cache-control": a.about ? "public, max-age=3600" : "no-store" } });
  } catch (err) {
    return toResponse(err);
  }
}
