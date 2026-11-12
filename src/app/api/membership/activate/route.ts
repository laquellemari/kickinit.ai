import { NextResponse } from "next/server";
import { activateSubscription } from "@/lib/membership/membership";
import { readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** POST /api/membership/activate { subscriptionId }  After approval: PayPal confirms it's ours, this visitor's, and active. */
export async function POST(req: Request) {
  try {
    const userId = visitorId(req);
    const m = await activateSubscription(userId, (await readJson(req)).subscriptionId);
    return NextResponse.json({ member: true, status: m.status, since: m.createdAt.toISOString() });
  } catch (err) {
    return toResponse(err);
  }
}
