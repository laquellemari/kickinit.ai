import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { checkIn } from "@/lib/bookings/service";
import { toResponse } from "@/lib/paypal/http";
import { isAdmin, visitorId } from "@/lib/visitor";

/** "I'm here": the guest (near the start time) or the venue desk (any time) checks a booking in. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = isAdmin(req);
    const userId = admin ? null : visitorId(req);
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    return NextResponse.json(publicBooking(await checkIn({ id, userId, admin })));
  } catch (err) {
    return toResponse(err);
  }
}
