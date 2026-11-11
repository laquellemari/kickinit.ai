import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { listBookings } from "@/lib/bookings/repo";
import { placeBooking } from "@/lib/bookings/service";
import { readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** After PayPal approval: { orderId, kind, itemId, partySize, startsAt } → the booking. */
export async function POST(req: Request) {
  try {
    const userId = visitorId(req);
    const b = await readJson(req);
    const booking = await placeBooking({
      orderId: typeof b.orderId === "string" ? b.orderId : "",
      kind: b.kind,
      itemId: b.itemId,
      partySize: Number(b.partySize),
      startsAt: b.startsAt,
      userId,
    });
    return NextResponse.json(publicBooking(booking), { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}

/** Your bookings, newest first. */
export async function GET(req: Request) {
  try {
    const bookings = await listBookings({ userId: visitorId(req) });
    return NextResponse.json({ bookings: bookings.map(publicBooking) });
  } catch (err) {
    return toResponse(err);
  }
}
