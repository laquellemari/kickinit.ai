import { NextResponse } from "next/server";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { getIdToken } from "@/lib/paypal/client";
import { HttpError, toResponse } from "@/lib/paypal/http";

const limiter = createLimiter({ limit: 30, windowMs: 60_000 });

/** GET /api/paypal/id-token  A short-lived token the PayPal JS SDK needs to save a guest's PayPal at checkout. */
export async function GET(req: Request) {
  try {
    if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many requests. Try again in a minute.");
    return NextResponse.json({ idToken: await getIdToken() }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return toResponse(err);
  }
}
