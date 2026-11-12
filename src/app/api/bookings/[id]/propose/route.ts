import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { proposeTime } from "@/lib/bookings/service";
import { readJson, requireAdmin, toResponse } from "@/lib/paypal/http";

/** The venue can't do the requested time: offer another { startsAt }. Admin (concierge desk) only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const body = await readJson(req);
    return NextResponse.json(publicBooking(await proposeTime({ id, startsAt: body.startsAt })));
  } catch (err) {
    return toResponse(err);
  }
}
