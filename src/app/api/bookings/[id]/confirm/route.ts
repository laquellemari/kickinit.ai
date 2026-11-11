import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { confirmBooking } from "@/lib/bookings/service";
import { requireAdmin, toResponse } from "@/lib/paypal/http";

/** Venue confirmed: charge the hold. Admin only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    return NextResponse.json(publicBooking(await confirmBooking(id)));
  } catch (err) {
    return toResponse(err);
  }
}
