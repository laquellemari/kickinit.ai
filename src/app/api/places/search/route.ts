import { NextResponse } from "next/server";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { searchRatedPlaces } from "@/lib/places/client";
import { HttpError, toResponse } from "@/lib/paypal/http";

const limiter = createLimiter({ limit: 10, windowMs: 60_000 });

/** GET /api/places/search?q=  Top-rated open venues for a query (used to curate the partner catalog). */
export async function GET(req: Request) {
  try {
    if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many requests. Try again in a minute.");
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json({ places: await searchRatedPlaces(q) });
  } catch (err) {
    return toResponse(err);
  }
}
