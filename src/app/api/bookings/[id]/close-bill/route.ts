import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { closeBill } from "@/lib/bookings/service";
import { readJson, requireAdmin, toResponse } from "@/lib/paypal/http";

/** POST { billTotal: "96.50" }  The venue closes the bill (tip included): settle from the hold, saved PayPal, or at the table. Admin only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const body = await readJson(req);
    return NextResponse.json(publicBooking(await closeBill({ id, billTotal: body.billTotal })));
  } catch (err) {
    return toResponse(err);
  }
}
