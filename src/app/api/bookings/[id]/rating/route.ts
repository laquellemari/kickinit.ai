import { NextResponse } from "next/server";
import { readJson, toResponse } from "@/lib/paypal/http";
import { rateBooking } from "@/lib/ratings/ratings";
import { visitorId } from "@/lib/visitor";

/** POST { stars: 1-5, note? }  The guest rates a visit they checked in to. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = visitorId(req);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const body = await readJson(req);
    const r = await rateBooking({ bookingId: id, userId, stars: body.stars, note: body.note });
    return NextResponse.json({ stars: r.stars, note: r.note, createdAt: r.createdAt.toISOString() }, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
