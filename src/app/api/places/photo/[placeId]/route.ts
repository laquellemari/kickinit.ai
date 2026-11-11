import { NextResponse } from "next/server";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { getPlacePhoto } from "@/lib/places/client";
import { HttpError, toResponse } from "@/lib/paypal/http";

const limiter = createLimiter({ limit: 120, windowMs: 60_000 });

/** GET /api/places/photo/:placeId  The venue's Google photo URL and credit. */
export async function GET(req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many requests. Try again in a minute.");
    const { placeId } = await params;
    const photo = await getPlacePhoto(placeId);
    if (!photo) throw new HttpError(404, "No photo for this place");
    return NextResponse.json(photo, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (err) {
    return toResponse(err);
  }
}
