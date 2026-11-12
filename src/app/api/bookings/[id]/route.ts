import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { getBooking } from "@/lib/bookings/repo";
import { toResponse } from "@/lib/paypal/http";
import { ratingFor } from "@/lib/ratings/ratings";
import { isAdmin, visitorId } from "@/lib/visitor";

const UUID = /^[0-9a-f-]{36}$/;

/** A booking, visible to the visitor who made it (or an admin). Anyone else gets 404. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = isAdmin(req);
    const userId = admin ? null : visitorId(req);
    const b = UUID.test(id) ? await getBooking(id) : null;
    if (!b || (!admin && b.userId !== userId)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const rating = await ratingFor(b.id);
    return NextResponse.json({ ...publicBooking(b), rating: rating && { stars: rating.stars, note: rating.note } });
  } catch (err) {
    return toResponse(err);
  }
}
