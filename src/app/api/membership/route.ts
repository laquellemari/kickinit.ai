import { NextResponse } from "next/server";
import { getMembership, isMember } from "@/lib/membership/membership";
import { toResponse } from "@/lib/paypal/http";
import { MEMBERSHIP_PRICE } from "@/lib/pricing/fees";
import { visitorId } from "@/lib/visitor";

/** GET /api/membership  Whether you're a member (no concierge fee). */
export async function GET(req: Request) {
  try {
    const userId = visitorId(req);
    const member = await isMember(userId);
    const m = await getMembership(userId);
    return NextResponse.json({ member, status: m?.status ?? null, since: m?.createdAt.toISOString() ?? null, price: MEMBERSHIP_PRICE });
  } catch (err) {
    return toResponse(err);
  }
}
