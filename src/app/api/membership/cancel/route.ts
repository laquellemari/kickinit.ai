import { NextResponse } from "next/server";
import { cancelMembership } from "@/lib/membership/membership";
import { toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** POST /api/membership/cancel  Stop the monthly charge and the member pricing. */
export async function POST(req: Request) {
  try {
    const m = await cancelMembership(visitorId(req));
    return NextResponse.json({ member: false, status: m.status });
  } catch (err) {
    return toResponse(err);
  }
}
