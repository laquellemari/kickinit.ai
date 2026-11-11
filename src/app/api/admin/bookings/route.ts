import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { listBookings, type BookingStatus } from "@/lib/bookings/repo";
import { requireAdmin, toResponse } from "@/lib/paypal/http";

const STATUSES = ["held", "confirmed", "declined", "failed"];

/** All bookings (optionally ?status=held). Admin only. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const status = new URL(req.url).searchParams.get("status") || undefined;
    if (status && !STATUSES.includes(status)) return NextResponse.json({ error: `Status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
    const bookings = await listBookings({ status: status as BookingStatus | undefined, limit: 100 });
    return NextResponse.json({ bookings: bookings.map(publicBooking) });
  } catch (err) {
    return toResponse(err);
  }
}
