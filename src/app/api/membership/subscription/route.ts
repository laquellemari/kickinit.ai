import { NextResponse } from "next/server";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { startSubscription } from "@/lib/membership/membership";
import { HttpError, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

const limiter = createLimiter({ limit: 10, windowMs: 60_000 });

/** POST /api/membership/subscription  Start a PayPal subscription for this visitor; the PayPal button asks them to approve it. */
export async function POST(req: Request) {
  try {
    const userId = visitorId(req);
    if (!limiter.take(`${clientKey(req)}:${userId}`)) throw new HttpError(429, "Too many tries. Try again in a minute.");
    const { subscriptionId } = await startSubscription(userId, new URL(req.url).origin);
    return NextResponse.json({ id: subscriptionId }, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
